import React, { useState, useMemo, useCallback, useRef } from 'react';
import { UserSearch, Info, Loader2, BarChart2, CalendarDays, Clock, Smartphone, GitMerge, MapPin, CheckCircle, XCircle, Printer, Download, Search as SearchIcon, Activity, Wifi, Phone, MessageSquare } from 'lucide-react';
import { useCDRContext } from '../contexts/CDRContext';
import { CDRRecord, SuspectProfileData } from '../types';
import { isAnyCall, isAnySMS, isOutgoingCallType, isIncomingCallType, parseDateTime, formatDate, formatDurationFromSeconds } from '../utils/cdrUtils';
import { downloadCSV } from '../utils/downloadUtils';

const StatCard: React.FC<{ label: string; value: string | number; }> = ({ label, value }) => (
    <div className="p-2 bg-neutral-lightest rounded-lg border border-neutral-light shadow-sm">
      <p className="text-xs text-textSecondary">{label}</p>
      <p className="text-md font-semibold text-textPrimary truncate" title={String(value)}>{value}</p>
    </div>
);

const SuspectProfilingView: React.FC = () => {
    const { allRecords } = useCDRContext();
    const [searchId, setSearchId] = useState<string>('');
    const [selectedId, setSelectedId] = useState<string>('');
    const [profileData, setProfileData] = useState<SuspectProfileData | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const printRef = useRef<HTMLDivElement>(null);

    const allEntities = useMemo(() => {
        const entities = new Set<string>();
        allRecords.forEach(r => {
            if (r.APARTY) entities.add(r.APARTY);
            if (r.BPARTY) entities.add(r.BPARTY);
            if (r.IMEI) entities.add(r.IMEI);
        });
        return Array.from(entities).sort();
    }, [allRecords]);
    
    const generateProfile = useCallback((idToProfile: string) => {
        setIsLoading(true);
        setError(null);
        setProfileData(null);

        const isIMEI = /^\d{14,16}$/.test(idToProfile);
        const type = isIMEI ? 'IMEI' : 'Number';

        const relevantRecords = allRecords.filter(r => {
            if (isIMEI) return r.IMEI === idToProfile;
            return r.APARTY === idToProfile || r.BPARTY === idToProfile;
        });

        if (relevantRecords.length === 0) {
            setError(`No records found for ${type}: ${idToProfile}`);
            setIsLoading(false);
            return;
        }

        let firstSeen: Date | null = null;
        let lastSeen: Date | null = null;
        const sourceFiles = new Set<string>();
        let outgoingCalls = 0, incomingCalls = 0, totalCallDuration = 0, outgoingSms = 0, incomingSms = 0;
        const callContacts = new Set<string>();
        const smsContacts = new Set<string>();
        const associatedEntities = new Set<string>();
        const hourlyActivity = Array(24).fill(0).map((_, i) => ({ hour: `${String(i).padStart(2,'0')}:00`, interactions: 0 }));
        const dailyActivity = Array(7).fill(0).map((_, i) => ({ day: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][i], interactions: 0 }));
        const towerCounts = new Map<string, {count: number, address?: string}>();

        relevantRecords.forEach(r => {
            const timestamp = parseDateTime(r.START_DTTIME);
            if (timestamp) {
                if (!firstSeen || timestamp < firstSeen) firstSeen = timestamp;
                if (!lastSeen || timestamp > lastSeen) lastSeen = timestamp;
                hourlyActivity[timestamp.getHours()].interactions++;
                dailyActivity[timestamp.getDay()].interactions++;
            }
            if(r.fileName) sourceFiles.add(r.fileName);

            const otherParty = r.APARTY === idToProfile ? r.BPARTY : r.APARTY;
            if(isAnyCall(r.USAGE_TYPE)) {
                if(r.APARTY === idToProfile && isOutgoingCallType(r.USAGE_TYPE)) outgoingCalls++;
                else incomingCalls++;
                totalCallDuration += parseInt(r.CALL_DURATION, 10) || 0;
                if(otherParty) callContacts.add(otherParty);
            } else if (isAnySMS(r.USAGE_TYPE)) {
                if(r.APARTY === idToProfile) outgoingSms++;
                else incomingSms++;
                if(otherParty) smsContacts.add(otherParty);
            }

            if(isIMEI) {
                if(r.APARTY) associatedEntities.add(r.APARTY);
            } else {
                if(r.IMEI) associatedEntities.add(r.IMEI);
            }
            if(r.LACSTARTA && r.CISTARTA) {
                const towerId = `${r.LACSTARTA}-${r.CISTARTA}`;
                const towerInfo = towerCounts.get(towerId) || {count: 0, address: r.ADDRESS};
                towerInfo.count++;
                if(!towerInfo.address && r.ADDRESS) towerInfo.address = r.ADDRESS;
                towerCounts.set(towerId, towerInfo);
            }
        });

        const hourlySorted = [...hourlyActivity].sort((a,b) => b.interactions - a.interactions).slice(0,3);
        const dailySorted = [...dailyActivity].sort((a,b) => b.interactions - a.interactions).slice(0,3);
        const dominantTimeSlot = (() => {
            const slots = { morning: 0, afternoon: 0, evening: 0, night: 0 };
            hourlyActivity.forEach((h, i) => {
                if (i >= 6 && i < 12) slots.morning += h.interactions;
                else if (i >= 12 && i < 18) slots.afternoon += h.interactions;
                else if (i >= 18 && i < 22) slots.evening += h.interactions;
                else slots.night += h.interactions;
            });
            return Object.keys(slots).reduce((a, b) => slots[a as keyof typeof slots] > slots[b as keyof typeof slots] ? a : b);
        })();

        const newProfile: SuspectProfileData = {
            id: idToProfile, type,
            general: {
                firstSeen: firstSeen ? formatDate(firstSeen.toISOString()) : 'N/A',
                lastSeen: lastSeen ? formatDate(lastSeen.toISOString()) : 'N/A',
                totalRecords: relevantRecords.length,
                sourceFiles: Array.from(sourceFiles),
            },
            communicationStats: {
                outgoingCalls, incomingCalls, totalCallDuration, outgoingSms, incomingSms,
                uniqueCallContacts: callContacts.size, uniqueSmsContacts: smsContacts.size
            },
            deviceAssociations: { associatedEntities: Array.from(associatedEntities) },
            activityPatterns: { dominantTimeSlot, hourlyActivity: hourlySorted, dailyActivity: dailySorted },
            locationInsights: { topTowers: Array.from(towerCounts.entries()).sort((a,b)=>b[1].count-a[1].count).slice(0,5).map(([id, data]) => ({towerId: id, ...data})) },
        };
        setProfileData(newProfile);
        setIsLoading(false);
    }, [allRecords]);

    const handleSearchClick = () => {
        if (searchId.trim()) {
            generateProfile(searchId.trim());
        } else if (selectedId) {
            generateProfile(selectedId);
        } else {
            setError("Please enter or select a Suspect ID.");
        }
    };
    
    const handleSelectChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const id = e.target.value;
        setSelectedId(id);
        setSearchId(''); // Clear text search when dropdown is used
        if(id) generateProfile(id);
        else {
            setProfileData(null); // Clear profile if selection is cleared
            setError(null);
        }
    };

    const handlePrint = () => {
        const printContent = printRef.current;
        if (printContent) {
            const printWindow = window.open('', '', 'height=800,width=1000');
            printWindow?.document.write('<html><head><title>Suspect Profile</title>');
            printWindow?.document.write('<link rel="stylesheet" href="https://cdn.tailwindcss.com"></link>');
            printWindow?.document.write('<style>body { font-family: Inter, sans-serif; -webkit-print-color-adjust: exact; } .no-print { display: none; } </style>');
            printWindow?.document.write('</head><body >');
            printWindow?.document.write(printContent.innerHTML);
            printWindow?.document.write('</body></html>');
            printWindow?.document.close();
            printWindow?.focus();
            setTimeout(() => { printWindow?.print(); }, 500);
        }
    };
    
    const handleExport = () => {
        if (!profileData) return;
        const { general, communicationStats, deviceAssociations, activityPatterns, locationInsights } = profileData;
        
        const data = [
            ["Category", "Metric", "Value"],
            ["General Information", "First Seen", general.firstSeen],
            ["General Information", "Last Seen", general.lastSeen],
            ["General Information", "Total Records", String(general.totalRecords)],
            ["General Information", "Source Files", general.sourceFiles.join('; ')],
            [],
            ["Communication Statistics", "Outgoing Calls", String(communicationStats.outgoingCalls)],
            ["Communication Statistics", "Incoming Calls", String(communicationStats.incomingCalls)],
            ["Communication Statistics", "Total Call Duration", formatDurationFromSeconds(communicationStats.totalCallDuration)],
            ["Communication Statistics", "Outgoing SMS", String(communicationStats.outgoingSms)],
            ["Communication Statistics", "Incoming SMS", String(communicationStats.incomingSms)],
            ["Communication Statistics", "Unique Call Contacts", String(communicationStats.uniqueCallContacts)],
            ["Communication Statistics", "Unique SMS Contacts", String(communicationStats.uniqueSmsContacts)],
            [],
            ["Device Associations", "Associated Entities", deviceAssociations.associatedEntities.join('; ')],
            [],
            ["Activity Patterns", "Dominant Time Slot", activityPatterns.dominantTimeSlot],
            ["Activity Patterns", "Top Hourly Activity", activityPatterns.hourlyActivity.map(h => `${h.hour} (${h.interactions} interactions)`).join('; ')],
            ["Activity Patterns", "Top Daily Activity", activityPatterns.dailyActivity.map(d => `${d.day} (${d.interactions} interactions)`).join('; ')],
            [],
            ["Location Insights", "Top Towers", locationInsights.topTowers.map(t => `${t.towerId} (${t.count} records)`).join('; ')],
        ];
        downloadCSV(`suspect_profile_${profileData.id}.csv`, data, []);
    };


  return (
    <div className="space-y-6">
      <div className="p-5 bg-surface border border-neutral-light rounded-xl shadow-lg">
        <h2 className="text-xl font-bold text-textPrimary mb-2 flex items-center">
            <UserSearch size={22} className="mr-3 text-primary"/>
            Suspect Profiling Center
        </h2>
        <p className="text-sm text-textSecondary mb-4">Enter or select a Number or IMEI to generate a comprehensive activity profile.</p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-center">
            <div>
                <label htmlFor="searchSuspectId" className="block text-xs font-medium text-textSecondary mb-1">Search Suspect ID:</label>
                <div className="relative">
                    <SearchIcon size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-DEFAULT"/>
                    <input id="searchSuspectId" type="text" value={searchId} onChange={(e) => {setSearchId(e.target.value); setSelectedId('');}} placeholder="Enter a Number or IMEI..." className="w-full p-2 pl-9 border rounded-md"/>
                </div>
            </div>
             <div className="flex items-center gap-2">
                <span className="text-sm text-textSecondary mt-5">Or</span>
                <div className="flex-grow">
                    <label htmlFor="selectSuspectId" className="block text-xs font-medium text-textSecondary mb-1">Select from List:</label>
                    <select id="selectSuspectId" value={selectedId} onChange={handleSelectChange} className="w-full p-2 border rounded-md">
                        <option value="">-- Select an Entity --</option>
                        {allEntities.map(id => <option key={id} value={id}>{id}</option>)}
                    </select>
                </div>
            </div>
        </div>
         <button onClick={handleSearchClick} disabled={isLoading || (!searchId && !selectedId)} className="mt-4 px-5 py-2 text-sm bg-primary text-white rounded-md hover:bg-primary-dark disabled:opacity-50">
            {isLoading ? <Loader2 className="animate-spin inline mr-2"/> : <UserSearch className="inline mr-2" size={16}/>}
            {isLoading ? 'Generating...' : 'Generate Profile'}
        </button>
      </div>

      {error && <div className="p-3 bg-danger-lighter text-danger-dark rounded-md border border-danger-light">{error}</div>}
      
      {profileData && (
          <div ref={printRef} className="p-5 bg-surface border border-neutral-light rounded-xl shadow-lg printable-profile">
            <style>{`@media print {.no-print{display:none;}}`}</style>
            <div className="flex justify-between items-start mb-4 pb-3 border-b border-neutral-light">
              <div>
                <h3 className="text-lg font-semibold text-textPrimary">Profile for: <span className="text-primary-dark">{profileData.id}</span></h3>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${profileData.type === 'Number' ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'}`}>{profileData.type}</span>
              </div>
              <div className="flex gap-2 no-print">
                <button onClick={handlePrint} className="px-3 py-1.5 text-xs bg-neutral-200 hover:bg-neutral-300 rounded-md">Print</button>
                <button onClick={handleExport} className="px-3 py-1.5 text-xs bg-secondary text-white hover:bg-secondary-dark rounded-md">Export CSV</button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              <div className="p-4 bg-neutral-lightest/50 rounded-lg border lg:col-span-1">
                <h4 className="font-semibold text-md mb-2 border-b pb-1">General Information</h4>
                <div className="space-y-2 text-sm">
                  <p><strong>First Seen:</strong> {profileData.general.firstSeen}</p>
                  <p><strong>Last Seen:</strong> {profileData.general.lastSeen}</p>
                  <p><strong>Total Records:</strong> {profileData.general.totalRecords}</p>
                  <div><p><strong>Source Files ({profileData.general.sourceFiles.length}):</strong></p><ul className="list-disc list-inside text-xs">{profileData.general.sourceFiles.slice(0,3).map(f => <li key={f} className="truncate" title={f}>{f}</li>)} {profileData.general.sourceFiles.length > 3 && <li>...</li>}</ul></div>
                </div>
              </div>
              <div className="p-4 bg-neutral-lightest/50 rounded-lg border lg:col-span-2">
                <h4 className="font-semibold text-md mb-2 border-b pb-1">Communication Statistics</h4>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <StatCard label="Outgoing Calls" value={profileData.communicationStats.outgoingCalls}/>
                  <StatCard label="Incoming Calls" value={profileData.communicationStats.incomingCalls}/>
                  <StatCard label="Total Call Duration" value={formatDurationFromSeconds(profileData.communicationStats.totalCallDuration)}/>
                  <StatCard label="Unique Call Contacts" value={profileData.communicationStats.uniqueCallContacts}/>
                  <StatCard label="Outgoing SMS" value={profileData.communicationStats.outgoingSms}/>
                  <StatCard label="Incoming SMS" value={profileData.communicationStats.incomingSms}/>
                  <StatCard label="Unique SMS Contacts" value={profileData.communicationStats.uniqueSmsContacts}/>
                </div>
              </div>
               <div className="p-4 bg-neutral-lightest/50 rounded-lg border">
                <h4 className="font-semibold text-md mb-2 border-b pb-1">Device Associations</h4>
                <ul className="text-sm list-disc list-inside space-y-1">{profileData.deviceAssociations.associatedEntities.slice(0,5).map(e => <li key={e}>{e}</li>)} {profileData.deviceAssociations.associatedEntities.length > 5 && <li>...and {profileData.deviceAssociations.associatedEntities.length - 5} more</li>} {profileData.deviceAssociations.associatedEntities.length === 0 && <li>None found</li>}</ul>
              </div>
              <div className="p-4 bg-neutral-lightest/50 rounded-lg border">
                <h4 className="font-semibold text-md mb-2 border-b pb-1">Activity Patterns</h4>
                <div className="space-y-2 text-sm">
                    <p><strong>Dominant Time Slot:</strong> <span className="font-medium capitalize">{profileData.activityPatterns.dominantTimeSlot}</span></p>
                    <div><p><strong>Hourly Activity (Top 3):</strong></p><ul className="list-disc list-inside text-xs">{profileData.activityPatterns.hourlyActivity.map(h => <li key={h.hour}>{h.hour} ({h.interactions} interactions)</li>)}</ul></div>
                    <div><p><strong>Daily Activity (Top 3):</strong></p><ul className="list-disc list-inside text-xs">{profileData.activityPatterns.dailyActivity.map(d => <li key={d.day}>{d.day} ({d.interactions} interactions)</li>)}</ul></div>
                </div>
              </div>
              <div className="p-4 bg-neutral-lightest/50 rounded-lg border">
                <h4 className="font-semibold text-md mb-2 border-b pb-1">Location Insights</h4>
                <ul className="text-sm list-disc list-inside space-y-1">{profileData.locationInsights.topTowers.map(t => <li key={t.towerId} title={t.address}>{t.towerId} ({t.count} records)</li>)} {profileData.locationInsights.topTowers.length === 0 && <li>No tower data found</li>}</ul>
              </div>
            </div>
          </div>
      )}
    </div>
  );
};

export default SuspectProfilingView;

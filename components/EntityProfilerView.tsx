
import React, { useState, useCallback, useMemo } from 'react';
import { UserSearch, Info, AlertTriangle, Loader2, Smartphone, Users, Clock, MapPin, Layers, ClipboardList, BarChart2, MessageSquare, Landmark, TowerControl as TowerControlIcon, Database as DatabaseIcon, Settings2, CalendarDays, CheckSquare, Square } from 'lucide-react'; // Added DatabaseIcon, TowerControlIcon, ClipboardList
import { useCDRContext } from '../contexts/CDRContext';
import { useSMSContext } from '../contexts/SMSContext';
import { useNagadContext } from '../contexts/NagadContext';
import { useBkashContext } from '../contexts/BkashContext';
import { useRoketContext } from '../contexts/RoketContext';
import { useLACContext } from '../contexts/LACContext';
import { EntityProfilerData, CDRRecord, SMSRecord, NagadRecord, BkashRecord, LACRecord, RoketRecord } from '../types';
import { parseDateTime, formatDate, formatDurationFromSeconds, isAnyCall, isAnySMS, isOutgoingCallType, isIncomingCallType, isOutgoingSMSType, isIncomingSMSType } from '../utils/cdrUtils';

type EntityType = 'MSISDN' | 'IMEI';

const DATA_SOURCES_PROFILER = [
  { id: 'cdr', label: 'CDR (Calls & SMS)' },
  { id: 'sms', label: 'SMS (Dedicated Files)' },
  { id: 'nagad', label: 'Nagad Transactions' },
  { id: 'bkash', label: 'bKash Transactions' },
  { id: 'roket', label: 'Roket Transactions' },
  { id: 'lac', label: 'LAC/Tower Records' },
];


const StatCard: React.FC<{ label: string; value: string | number; icon?: React.ReactNode, className?: string }> = ({ label, value, icon, className }) => (
  <div className={`p-3 bg-neutral-lightest rounded-lg border border-neutral-light shadow-sm ${className}`}>
    {icon && <div className="mb-1 text-primary">{icon}</div>}
    <p className="text-xs text-textSecondary">{label}</p>
    <p className="text-md font-semibold text-textPrimary truncate" title={String(value)}>{value}</p>
  </div>
);

const EntityProfilerView: React.FC = () => {
  const [entityType, setEntityType] = useState<EntityType>('MSISDN');
  const [entityValue, setEntityValue] = useState('');
  const [profileData, setProfileData] = useState<EntityProfilerData | null>(null);
  const [isLoadingProfile, setIsLoadingProfile] = useState(false);
  const [errorProfile, setErrorProfile] = useState<string | null>(null);

  // State for profiler-specific filters
  const [selectedDataSources, setSelectedDataSources] = useState<string[]>(['cdr', 'sms', 'nagad', 'bkash', 'lac', 'roket']);
  const [profilerStartDate, setProfilerStartDate] = useState<string>(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]);
  const [profilerEndDate, setProfilerEndDate] = useState<string>(new Date().toISOString().split('T')[0]);


  const cdrCtx = useCDRContext();
  const smsCtx = useSMSContext();
  const nagadCtx = useNagadContext();
  const bkashCtx = useBkashContext();
  const roketCtx = useRoketContext();
  const lacCtx = useLACContext();

  const handleDataSourceToggle = (sourceId: string) => {
    setSelectedDataSources(prev =>
      prev.includes(sourceId) ? prev.filter(id => id !== sourceId) : [...prev, sourceId]
    );
  };

  const handleGenerateProfile = useCallback(async () => {
    if (!entityValue.trim()) {
      setErrorProfile(`Please enter a value for ${entityType}.`);
      return;
    }
    setIsLoadingProfile(true);
    setErrorProfile(null);
    setProfileData(null);

    const id = entityValue.trim();
    const type = entityType;
    const dataSourcesFound: string[] = [];
    let firstSeen: Date | null = null;
    let lastSeen: Date | null = null;
    let totalRecordsAcrossSources = 0;
    
    const sDate = profilerStartDate ? parseDateTime(profilerStartDate + "T00:00:00") : null;
    const eDate = profilerEndDate ? parseDateTime(profilerEndDate + "T23:59:59") : null;

    const isWithinDateRange = (timestamp: Date | null | undefined): boolean => {
        if (!timestamp) return false;
        if (sDate && timestamp < sDate) return false;
        if (eDate && timestamp > eDate) return false;
        return true;
    };

    const updateOverallTimestamps = (timestamp: Date | null | undefined) => {
        if(timestamp) {
            if (!firstSeen || timestamp < firstSeen) firstSeen = timestamp;
            if (!lastSeen || timestamp > lastSeen) lastSeen = timestamp;
        }
    };

    let cdrProfileData: EntityProfilerData['cdrData'] | undefined = undefined;
    if (selectedDataSources.includes('cdr') && cdrCtx.allRecords.length > 0) {
        const relevantCDR = cdrCtx.allRecords.filter(r => {
            const recordDate = parseDateTime(r.START_DTTIME);
            if(!isWithinDateRange(recordDate)) return false;
            return (type === 'MSISDN' && (r.APARTY === id || r.BPARTY === id)) || (type === 'IMEI' && r.IMEI === id);
        });

        if (relevantCDR.length > 0) {
            dataSourcesFound.push("CDR");
            totalRecordsAcrossSources += relevantCDR.length;
            relevantCDR.forEach(r => updateOverallTimestamps(parseDateTime(r.START_DTTIME)));
            
            const associatedEntitiesMap = new Map<string, {type: 'IMEI'|'MSISDN', count: number}>();
            if (type === 'MSISDN') {
                relevantCDR.forEach(r => { if(r.IMEI && r.IMEI.trim() !== '' && r.IMEI.toLowerCase() !== 'n/a') { const entry = associatedEntitiesMap.get(r.IMEI) || {type: 'IMEI', count: 0}; entry.count++; associatedEntitiesMap.set(r.IMEI, entry); } });
            } else { 
                 relevantCDR.forEach(r => { if(r.APARTY && r.APARTY.trim() !== '') { const entry = associatedEntitiesMap.get(r.APARTY) || {type: 'MSISDN', count: 0}; entry.count++; associatedEntitiesMap.set(r.APARTY, entry); } if(r.BPARTY && r.BPARTY.trim() !== '' && r.APARTY !== r.BPARTY) { const entry = associatedEntitiesMap.get(r.BPARTY) || {type: 'MSISDN', count: 0}; entry.count++; associatedEntitiesMap.set(r.BPARTY, entry); } });
            }
            
            let outgoingCalls = 0, incomingCalls = 0, totalCallDuration = 0;
            let outgoingSMSCDR = 0, incomingSMSCDR = 0;
            const callContactsCDR = new Map<string, {count: number, duration: number}>();
            const smsContactsCDR = new Map<string, number>();
            const towersCDR = new Map<string, {count: number, address?:string}>();

            relevantCDR.forEach(r => {
                const otherParty = r.APARTY === id ? r.BPARTY : r.APARTY;
                if (isAnyCall(r.USAGE_TYPE)) {
                    if (r.APARTY === id && isOutgoingCallType(r.USAGE_TYPE)) outgoingCalls++;
                    else if ((r.BPARTY === id && isIncomingCallType(r.USAGE_TYPE)) || (r.APARTY === otherParty && r.BPARTY === id && isOutgoingCallType(r.USAGE_TYPE))) incomingCalls++;
                    totalCallDuration += parseInt(r.CALL_DURATION,10) || 0;
                    if(otherParty) { const contact = callContactsCDR.get(otherParty) || {count:0, duration:0}; contact.count++; contact.duration += parseInt(r.CALL_DURATION,10) || 0; callContactsCDR.set(otherParty, contact); }
                } else if (isAnySMS(r.USAGE_TYPE) || r.USAGE_TYPE?.toUpperCase().includes('SMS')) {
                     if (r.APARTY === id && isOutgoingSMSType(r.USAGE_TYPE)) outgoingSMSCDR++;
                     else if ((r.BPARTY === id && isIncomingSMSType(r.USAGE_TYPE)) || (r.APARTY === otherParty && r.BPARTY === id && isOutgoingSMSType(r.USAGE_TYPE))) incomingSMSCDR++;
                     if(otherParty) smsContactsCDR.set(otherParty, (smsContactsCDR.get(otherParty) || 0) + 1);
                }
                if(r.LACSTARTA && r.CISTARTA) { const towerId = `${r.LACSTARTA}-${r.CISTARTA}`; const tower = towersCDR.get(towerId) || {count:0, address: r.ADDRESS}; tower.count++; if(!tower.address && r.ADDRESS && r.ADDRESS.toLowerCase() !== 'n/a') tower.address = r.ADDRESS; towersCDR.set(towerId, tower); }
            });
            cdrProfileData = { associatedEntities: Array.from(associatedEntitiesMap.entries()).map(([entityId, data]) => ({id: entityId, ...data})).sort((a,b) => b.count - a.count).slice(0,5), callStats: { outgoing: outgoingCalls, incoming: incomingCalls, totalDurationSeconds: totalCallDuration, uniqueContacts: callContactsCDR.size }, smsStatsCDR: { outgoing: outgoingSMSCDR, incoming: incomingSMSCDR, uniqueContacts: smsContactsCDR.size }, topCallContactsCDR: Array.from(callContactsCDR.entries()).map(([num, data]) => ({number: num, ...data})).sort((a,b) => b.count - a.count || b.duration - a.duration).slice(0,5), topSmsContactsCDR: Array.from(smsContactsCDR.entries()).map(([num, count]) => ({number: num, count})).sort((a,b) => b.count - a.count).slice(0,5), topTowersCDR: Array.from(towersCDR.entries()).map(([tid, data]) => ({towerId: tid, ...data})).sort((a,b) => b.count - a.count).slice(0,5), };
        }
    }

    let smsProfileData: EntityProfilerData['dedicatedSmsData'] | undefined = undefined;
    if (type === 'MSISDN' && selectedDataSources.includes('sms') && smsCtx.allSMSRecords.length > 0) {
        const relevantSMS = smsCtx.allSMSRecords.filter(r => {
            const recordDate = parseDateTime(r.Timestamp);
            if(!isWithinDateRange(recordDate)) return false;
            return r.Initiator === id || r.Recipient === id;
        });
        if (relevantSMS.length > 0) {
            if (!dataSourcesFound.includes("SMS (Dedicated)")) dataSourcesFound.push("SMS (Dedicated)");
            totalRecordsAcrossSources += relevantSMS.length;
            relevantSMS.forEach(r => updateOverallTimestamps(parseDateTime(r.Timestamp)));
            const smsContacts = new Map<string, { sentTo: number, receivedFrom: number, total: number }>();
            relevantSMS.forEach(r => { const otherParty = r.Initiator === id ? r.Recipient : r.Initiator; if (otherParty) { const contact = smsContacts.get(otherParty) || { sentTo: 0, receivedFrom: 0, total: 0 }; contact.total++; if (r.Initiator === id) contact.sentTo++; else contact.receivedFrom++; smsContacts.set(otherParty, contact); } });
            smsProfileData = { totalMessages: relevantSMS.length, topContactsSMS: Array.from(smsContacts.entries()).map(([num, data])=> ({number: num, ...data})).sort((a,b)=> b.total - a.total).slice(0,5) };
        }
    }
    
    const mfsDataList: NonNullable<EntityProfilerData['mfsDataList']> = [];
    const processMFSData = ( serviceName: 'Nagad' | 'bKash' | 'Roket', allMfsRecords: any[], getTimestamp: (r: any) => string | undefined, getStatementAcc: (r: any) => string | undefined, getPartnerAcc: (r: any) => string | undefined, getDirection: (r: any) => string | undefined, getAmount: (r: any) => number | undefined ) => {
        if (type === 'MSISDN' && selectedDataSources.includes(serviceName.toLowerCase()) && allMfsRecords.length > 0) {
            const relevantMFS = allMfsRecords.filter(r => {
                const recordDate = parseDateTime(getTimestamp(r));
                if (!isWithinDateRange(recordDate)) return false;
                return getStatementAcc(r) === id || getPartnerAcc(r) === id;
            });
            if (relevantMFS.length > 0) {
                if (!dataSourcesFound.includes(serviceName)) dataSourcesFound.push(serviceName);
                totalRecordsAcrossSources += relevantMFS.length;
                relevantMFS.forEach(r => updateOverallTimestamps(parseDateTime(getTimestamp(r))));
                let totalSent = 0, totalReceived = 0, transactionCount = 0;
                const interactingPartners = new Map<string, {totalAmount: number, txnCount: number, sentToCount: number, receivedFromCount: number}>();
                relevantMFS.forEach(r => {
                    const partner = getStatementAcc(r) === id ? getPartnerAcc(r) : getStatementAcc(r);
                    const amount = getAmount(r);
                    if (amount === undefined || !partner) return;
                    transactionCount++;
                    let directionIndicator = getDirection(r);
                    if (serviceName === 'bKash') { if (r.sender === id) directionIndicator = 'DEBIT'; else if (r.receiver === id) directionIndicator = 'CREDIT'; else directionIndicator = 'OTHER'; }
                    if (directionIndicator === 'DEBIT') totalSent += amount; else if (directionIndicator === 'CREDIT') totalReceived += amount;
                    if (partner && partner.trim() !== '' && partner.toUpperCase() !== 'SYSTEM') {
                        const partnerEntry = interactingPartners.get(partner) || {totalAmount: 0, txnCount: 0, sentToCount:0, receivedFromCount:0};
                        partnerEntry.txnCount++; partnerEntry.totalAmount += amount;
                        if (directionIndicator === 'DEBIT') partnerEntry.sentToCount++; else if (directionIndicator === 'CREDIT') partnerEntry.receivedFromCount++;
                        interactingPartners.set(partner, partnerEntry);
                    }
                });
                mfsDataList.push({ serviceName, accountHolderNumber: id, totalSentAmount: totalSent, totalReceivedAmount: totalReceived, transactionCount, topInteractingPartners: Array.from(interactingPartners.entries()).map(([acc, data])=> ({partnerAccount: acc, totalAmount:data.totalAmount, txnCount: data.txnCount, direction: data.sentToCount > data.receivedFromCount ? 'sent_to' : 'received_from'} as const)).sort((a,b) => b.totalAmount - a.totalAmount || b.txnCount - a.txnCount).slice(0,5), });
            }
        }
    };
    processMFSData('Nagad', nagadCtx.allNagadRecords, r => r.TXN_DATE_TIME, r => r.STATEMENT_FOR_ACC, r => r.TXN_WITH_ACC, r => r.TXN_TYPE_DR_CR, r => r.TXN_AMT);
    processMFSData('bKash', bkashCtx.allBkashRecords, r => r.transactionDate, r => r.sender, r => r.receiver, r => r.transactionDirection, r => r.transactedAmount);
    // Roket processing logic placeholder
    if (selectedDataSources.includes('roket') && roketCtx.allRoketRecords.length > 0) {
      const relevantRoket = roketCtx.allRoketRecords.filter(r => {
        // Assuming RoketRecord has date, sender, receiver, amount fields - adjust as needed
        // const recordDate = parseDateTime(r.someDateField);
        // if (!isWithinDateRange(recordDate)) return false;
        // return r.someSenderField === id || r.someReceiverField === id;
        return false; // Placeholder
      });
      if (relevantRoket.length > 0) {
         if (!dataSourcesFound.includes("Roket")) dataSourcesFound.push("Roket");
         totalRecordsAcrossSources += relevantRoket.length;
         // ... aggregate Roket data similar to Nagad/bKash ...
         mfsDataList.push({ serviceName: 'Roket', totalSentAmount: 0, totalReceivedAmount: 0, transactionCount: relevantRoket.length, topInteractingPartners: []});
      }
    }


    let lacProfileData: EntityProfilerData['lacData'] | undefined = undefined;
    if (selectedDataSources.includes('lac') && lacCtx.allLACRecords.length > 0) {
        const relevantLAC = lacCtx.allLACRecords.filter(r => {
            const recordDate = parseDateTime(r.DATE_TIME);
            if (!isWithinDateRange(recordDate)) return false;
            return (type === 'MSISDN' && r.MSISDN === id) || (type === 'IMEI' && r.IMEI === id);
        });
        if (relevantLAC.length > 0) {
            if (!dataSourcesFound.includes("LAC")) dataSourcesFound.push("LAC");
            totalRecordsAcrossSources += relevantLAC.length;
            relevantLAC.forEach(r => updateOverallTimestamps(parseDateTime(r.DATE_TIME)));
            const towerMap = new Map<string, { count: number, firstSeen: Date | null, lastSeen: Date | null, address?: string }>();
            relevantLAC.forEach(r => { if (r.LAC && r.CELL_ID) { const towerId = `${r.LAC}-${r.CELL_ID}`; const entry = towerMap.get(towerId) || { count: 0, firstSeen: null, lastSeen: null, address: r.ADDRESS }; entry.count++; const recordD = parseDateTime(r.DATE_TIME); if(recordD){ if (!entry.firstSeen || recordD < entry.firstSeen) entry.firstSeen = recordD; if (!entry.lastSeen || recordD > entry.lastSeen) entry.lastSeen = recordD; } if (!entry.address && r.ADDRESS && r.ADDRESS.toLowerCase() !== 'n/a') entry.address = r.ADDRESS; towerMap.set(towerId, entry); } });
            lacProfileData = { distinctTowersVisited: towerMap.size, topFrequentTowersLAC: Array.from(towerMap.entries()).map(([tid, data])=> ({towerId:tid, ...data})).sort((a,b)=>b.count - a.count).slice(0,5) };
        }
    }
    
    setProfileData({ id, type, profileGeneratedAt: new Date(), general: { firstSeen, lastSeen, dataSources: dataSourcesFound, totalRecordsAcrossSources }, cdrData: cdrProfileData, dedicatedSmsData: smsProfileData, mfsDataList: mfsDataList.length > 0 ? mfsDataList : undefined, lacData: lacProfileData });
    setIsLoadingProfile(false);
    if (dataSourcesFound.length === 0) setErrorProfile(`No data found for ${entityType} ${id} in any selected data source within the date range.`);
  }, [entityType, entityValue, cdrCtx, smsCtx, nagadCtx, bkashCtx, roketCtx, lacCtx, selectedDataSources, profilerStartDate, profilerEndDate]);

  return (
    <div className="space-y-6">
      <div className="p-4 sm:p-5 bg-surface border border-neutral-light rounded-xl shadow-xl">
        <div className="flex items-center text-xl sm:text-2xl font-semibold text-textPrimary mb-1">
          <ClipboardList size={24} className="mr-2.5 text-red-500" /> Comprehensive Entity Profiler
        </div>
        <p className="text-sm text-textSecondary">Generate a consolidated profile for an MSISDN or IMEI across all available data sources.</p>

        <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
          <div>
            <label htmlFor="profilerEntityType" className="block text-xs font-medium text-textSecondary mb-1">Entity Type:</label>
            <select id="profilerEntityType" value={entityType} onChange={e => setEntityType(e.target.value as EntityType)} className="w-full p-2.5 border border-neutral-light rounded-lg focus:ring-2 focus:ring-primary-light text-sm shadow-sm">
              <option value="MSISDN">MSISDN</option>
              <option value="IMEI">IMEI</option>
            </select>
          </div>
          <div className="md:col-span-2">
            <label htmlFor="profilerEntityValue" className="block text-xs font-medium text-textSecondary mb-1">Entity Value:</label>
            <input type="text" id="profilerEntityValue" value={entityValue} onChange={e => setEntityValue(e.target.value)} placeholder={`Enter ${entityType}`} className="w-full p-2.5 border border-neutral-light rounded-lg focus:ring-2 focus:ring-primary-light text-sm shadow-sm"/>
          </div>
        </div>
        
        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
                <label htmlFor="profilerStartDate" className="block text-xs font-medium text-textSecondary mb-1">Start Date:</label>
                <input type="date" id="profilerStartDate" value={profilerStartDate} onChange={e => setProfilerStartDate(e.target.value)} className="w-full p-2.5 border border-neutral-light rounded-lg text-sm shadow-sm accent-primary"/>
            </div>
            <div>
                <label htmlFor="profilerEndDate" className="block text-xs font-medium text-textSecondary mb-1">End Date:</label>
                <input type="date" id="profilerEndDate" value={profilerEndDate} onChange={e => setProfilerEndDate(e.target.value)} className="w-full p-2.5 border border-neutral-light rounded-lg text-sm shadow-sm accent-primary"/>
            </div>
        </div>

        <div className="mt-4 pt-3 border-t border-neutral-light">
            <h4 className="text-sm font-semibold text-textPrimary mb-2">Include Data Sources:</h4>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 text-xs">
                {DATA_SOURCES_PROFILER.map(source => (
                    <label key={source.id} className="flex items-center space-x-2 p-2 border border-neutral-light rounded-md hover:bg-neutral-lightest cursor-pointer transition-colors has-[:checked]:bg-primary-lighter has-[:checked]:border-primary-dark">
                        <input 
                            type="checkbox" 
                            checked={selectedDataSources.includes(source.id)}
                            onChange={() => handleDataSourceToggle(source.id)}
                            className="form-checkbox h-4 w-4 text-primary focus:ring-primary-light border-neutral-DEFAULT rounded"
                        />
                        <span>{source.label}</span>
                    </label>
                ))}
            </div>
        </div>

        <button onClick={handleGenerateProfile} disabled={isLoadingProfile} className="mt-5 w-full sm:w-auto px-6 py-2.5 bg-primary text-white rounded-lg hover:bg-primary-dark text-sm font-medium shadow-md hover:shadow-lg transition-all disabled:opacity-70 flex items-center justify-center">
          {isLoadingProfile ? <Loader2 className="h-5 w-5 animate-spin mr-2"/> : <UserSearch size={18} className="mr-2"/>}
          Generate Profile
        </button>
      </div>

      {errorProfile && <div className="p-3 bg-danger-lighter text-danger-darker rounded-lg border border-danger-light flex items-center shadow-md"><AlertTriangle size={18} className="mr-2"/>{errorProfile}</div>}
      {isLoadingProfile && !profileData && <div className="flex justify-center items-center h-40"><Loader2 className="h-10 w-10 animate-spin text-primary" /><p className="ml-3 text-textSecondary">Generating profile...</p></div>}
      
      {!profileData && !isLoadingProfile && !errorProfile && entityValue && (
         <div className="p-6 bg-neutral-lightest border border-neutral-light rounded-lg text-center text-textSecondary flex flex-col items-center justify-center min-h-[100px] shadow-md">
            <Info size={24} className="mb-2 text-neutral-DEFAULT" />
            <p>Profile for <span className="font-semibold text-textPrimary">{entityValue}</span> not yet generated or no data found.</p>
        </div>
      )}

      {profileData && !isLoadingProfile && (
        <div className="p-4 sm:p-5 bg-surface border border-neutral-light rounded-xl shadow-xl space-y-5">
          <div className="pb-3 border-b border-neutral-light">
            <h2 className="text-lg font-semibold text-textPrimary">Profile: <span className="text-primary-dark">{profileData.id}</span> <span className="text-xs px-2 py-0.5 bg-red-100 text-red-700 rounded-full ml-1">{profileData.type}</span></h2>
            <p className="text-xs text-textSecondary">Profile generated on: {formatDate(profileData.profileGeneratedAt.toISOString())}</p>
          </div>

          <section>
            <h3 className="text-md font-semibold text-textPrimary mb-2 flex items-center"><Info size={18} className="mr-2 text-primary"/>General Information</h3>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <StatCard label="First Seen" value={profileData.general.firstSeen ? formatDate(profileData.general.firstSeen.toISOString()) : 'N/A'} />
              <StatCard label="Last Seen" value={profileData.general.lastSeen ? formatDate(profileData.general.lastSeen.toISOString()) : 'N/A'} />
              <StatCard label="Total Records (Profiled)" value={profileData.general.totalRecordsAcrossSources.toLocaleString()} />
              <StatCard label="Data Sources Used" value={profileData.general.dataSources.join(', ') || 'None'} className="col-span-2 md:col-span-3"/>
            </div>
          </section>

          {profileData.cdrData && (
            <section>
              <h3 className="text-md font-semibold text-textPrimary mb-2 flex items-center"><DatabaseIcon size={18} className="mr-2 text-blue-500"/>CDR Summary</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                <div className="p-3 bg-neutral-lightest rounded-md border">
                    <p className="font-medium mb-1">Associated Entities (Top 5):</p>
                    {profileData.cdrData.associatedEntities.length > 0 ? <ul>{profileData.cdrData.associatedEntities.map(e => <li key={e.id}>{e.type}: {e.id} ({e.count} records)</li>)}</ul> : <p>None</p>}
                </div>
                <div className="p-3 bg-neutral-lightest rounded-md border">
                    <p className="font-medium mb-1">Call Stats:</p>
                    <p>Outgoing: {profileData.cdrData.callStats.outgoing}, Incoming: {profileData.cdrData.callStats.incoming}</p>
                    <p>Total Duration: {formatDurationFromSeconds(profileData.cdrData.callStats.totalDurationSeconds)}</p>
                    <p>Unique Call Contacts: {profileData.cdrData.callStats.uniqueContacts}</p>
                </div>
                 <div className="p-3 bg-neutral-lightest rounded-md border">
                    <p className="font-medium mb-1">SMS Stats (from CDR):</p>
                    <p>Outgoing: {profileData.cdrData.smsStatsCDR.outgoing}, Incoming: {profileData.cdrData.smsStatsCDR.incoming}</p>
                    <p>Unique SMS Contacts: {profileData.cdrData.smsStatsCDR.uniqueContacts}</p>
                </div>
                 <div className="p-3 bg-neutral-lightest rounded-md border">
                    <p className="font-medium mb-1">Top Call Contacts (CDR - Top 5):</p>
                    {profileData.cdrData.topCallContactsCDR.length > 0 ? <ul>{profileData.cdrData.topCallContactsCDR.map(c => <li key={c.number}>{c.number} ({c.count} calls, {formatDurationFromSeconds(c.duration)})</li>)}</ul> : <p>None</p>}
                </div>
                <div className="p-3 bg-neutral-lightest rounded-md border md:col-span-2">
                    <p className="font-medium mb-1">Top Towers (CDR - Top 5):</p>
                    {profileData.cdrData.topTowersCDR.length > 0 ? <ul className="list-disc list-inside ml-2">{profileData.cdrData.topTowersCDR.map(t => <li key={t.towerId} title={t.address}>{t.towerId} ({t.count} records)</li>)}</ul> : <p>None</p>}
                </div>
              </div>
            </section>
          )}
          
          {profileData.dedicatedSmsData && (
             <section>
              <h3 className="text-md font-semibold text-textPrimary mb-2 flex items-center"><MessageSquare size={18} className="mr-2 text-yellow-500"/>Dedicated SMS Summary</h3>
               <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                <StatCard label="Total SMS Messages" value={profileData.dedicatedSmsData.totalMessages.toLocaleString()} />
                <div className="p-3 bg-neutral-lightest rounded-md border md:col-span-2">
                    <p className="font-medium mb-1">Top SMS Contacts (Top 5):</p>
                    {profileData.dedicatedSmsData.topContactsSMS.length > 0 ? <ul>{profileData.dedicatedSmsData.topContactsSMS.map(c => <li key={c.number}>{c.number} (Sent: {c.sentTo}, Rcvd: {c.receivedFrom}, Total: {c.total})</li>)}</ul> : <p>None</p>}
                </div>
               </div>
            </section>
          )}

          {profileData.mfsDataList && profileData.mfsDataList.length > 0 && (
            <section>
                <h3 className="text-md font-semibold text-textPrimary mb-2 flex items-center"><Landmark size={18} className="mr-2 text-green-500"/>MFS Summary</h3>
                {profileData.mfsDataList.map(mfs => (
                    <div key={mfs.serviceName} className="mb-4 p-3 border border-green-300 rounded-lg bg-green-50/50">
                        <h4 className="text-sm font-semibold text-green-700 mb-2">{mfs.serviceName} Activity for {mfs.accountHolderNumber || mfs.relatedMfsAccount || 'N/A'}</h4>
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-xs">
                            <StatCard label="Total Sent" value={mfs.totalSentAmount.toFixed(2) + " BDT"} />
                            <StatCard label="Total Received" value={mfs.totalReceivedAmount.toFixed(2) + " BDT"} />
                            <StatCard label="Transaction Count" value={mfs.transactionCount.toLocaleString()} />
                        </div>
                        <div className="mt-2 p-2 bg-white rounded border border-green-200">
                             <p className="font-medium text-xs mb-1">Top Interacting MFS Partners (Top 5):</p>
                            {mfs.topInteractingPartners.length > 0 ? <ul className="text-xs">{mfs.topInteractingPartners.map(p => <li key={p.partnerAccount}>{p.partnerAccount} (Amt: {p.totalAmount.toFixed(2)}, Txns: {p.txnCount}, Dir: {p.direction})</li>)}</ul> : <p className="text-xs">None</p>}
                        </div>
                    </div>
                ))}
            </section>
          )}
          
          {profileData.lacData && (
             <section>
              <h3 className="text-md font-semibold text-textPrimary mb-2 flex items-center"><TowerControlIcon size={18} className="mr-2 text-cyan-500"/>LAC Summary</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                <StatCard label="Distinct Towers Visited" value={profileData.lacData.distinctTowersVisited.toLocaleString()} />
                 <div className="p-3 bg-neutral-lightest rounded-md border md:col-span-2">
                    <p className="font-medium mb-1">Top Frequent Towers (LAC - Top 5):</p>
                    {profileData.lacData.topFrequentTowersLAC.length > 0 ? <ul className="list-disc list-inside ml-2">{profileData.lacData.topFrequentTowersLAC.map(t => <li key={t.towerId} title={`Address: ${t.address || 'N/A'}. First: ${t.firstSeen ? formatDate(t.firstSeen.toISOString()) : 'N/A'}, Last: ${t.lastSeen ? formatDate(t.lastSeen.toISOString()) : 'N/A'}`}>{t.towerId} ({t.count} records)</li>)}</ul> : <p>None</p>}
                </div>
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
};

export default EntityProfilerView;

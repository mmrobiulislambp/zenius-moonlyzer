import React, { useState, useMemo, useCallback } from 'react';
import { MapPinned, Users2, CalendarDays, Search, Info, AlertTriangle, Loader2, Download, Home, Building, ChevronDown, ChevronUp, ChevronsUpDown, ListFilter, PhoneCall, Clock, FileText } from 'lucide-react';
import { useCDRContext } from '../contexts/CDRContext';
import { LocationContactAnalysis, LocationContactDetail, CDRRecord } from '../types'; 
import { parseDateTime, formatDateFromTimestamp, formatDurationFromSeconds } from '../utils/cdrUtils';
import { downloadCSV } from '../utils/downloadUtils';

const ROWS_PER_PAGE = 5;

// Helper to find the most frequent tower for a set of records
// Placed outside the component to avoid initialization issues.
const getMostFrequentTowers = (records: CDRRecord[], count: number = 1): { towerId: string, address?: string, count: number }[] => {
    if (records.length === 0) return [];
    const towerCounts = new Map<string, { count: number, addresses: Set<string> }>();
    records.forEach(r => {
        if (r.LACSTARTA && r.CISTARTA) {
            const towerId = `${r.LACSTARTA}-${r.CISTARTA}`;
            const entry = towerCounts.get(towerId) || { count: 0, addresses: new Set() };
            entry.count++;
            if (r.ADDRESS && r.ADDRESS.toLowerCase() !== 'n/a') {
                entry.addresses.add(r.ADDRESS);
            }
            towerCounts.set(towerId, entry);
        }
    });
    return Array.from(towerCounts.entries())
        .sort((a, b) => b[1].count - a[1].count)
        .slice(0, count)
        .map(([towerId, data]) => ({
            towerId,
            count: data.count,
            address: Array.from(data.addresses)[0] || 'N/A',
        }));
};


const LocationContactAnalysisView: React.FC = () => {
    const { globallyFilteredRecords, getUniqueValues } = useCDRContext();

    const [targetAParty, setTargetAParty] = useState<string>('');
    const [suggestedLocations, setSuggestedLocations] = useState<{ towerId: string; address?: string; firstSeen: Date; recordCount: number }[]>([]);
    const [selectedLocation, setSelectedLocation] = useState<{ towerId: string; address?: string; firstSeen: Date; } | null>(null);
    const [analysisResult, setAnalysisResult] = useState<LocationContactAnalysis | null>(null);
    const [filterDate, setFilterDate] = useState('');
    
    const [isLoading, setIsLoading] = useState(false);
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const [showAllLocations, setShowAllLocations] = useState(false);
    
    const [newContactsPage, setNewContactsPage] = useState(1);
    const [maintainedContactsPage, setMaintainedContactsPage] = useState(1);
    
    const uniqueAParties = useMemo(() => getUniqueValues('APARTY').sort(), [getUniqueValues]);

    const handleTargetChange = useCallback((msisdn: string) => {
        setTargetAParty(msisdn);
        setSelectedLocation(null);
        setAnalysisResult(null);
        setError(null);
        if (!msisdn) {
            setSuggestedLocations([]);
            return;
        }

        setIsLoading(true);

        setTimeout(() => {
            try {
                const recordsForTarget = globallyFilteredRecords.filter(r => r.APARTY === msisdn && r.LACSTARTA && r.CISTARTA);
                if (recordsForTarget.length === 0) {
                    setError("No location data found for this target.");
                    setSuggestedLocations([]);
                    setIsLoading(false);
                    return;
                }

                const homeTowerResult = getMostFrequentTowers(recordsForTarget, 1);
                if (!homeTowerResult || homeTowerResult.length === 0) {
                    setError("Could not determine a primary home location for this target.");
                    setSuggestedLocations([]);
                    setIsLoading(false);
                    return;
                }
                const homeTowerId = homeTowerResult[0].towerId;

                const homeRecords = recordsForTarget.filter(r => `${r.LACSTARTA}-${r.CISTARTA}` === homeTowerId);
                const lastSeenAtHome = Math.max(...homeRecords.map(r => parseDateTime(r.START_DTTIME)?.getTime() || 0));

                const newLocationCandidates = new Map<string, { address?: string; firstSeen: Date; records: CDRRecord[] }>();
                recordsForTarget.forEach(r => {
                    const towerId = `${r.LACSTARTA}-${r.CISTARTA}`;
                    const recordTime = parseDateTime(r.START_DTTIME)?.getTime();
                    if (towerId !== homeTowerId && recordTime && recordTime > lastSeenAtHome) {
                        let entry = newLocationCandidates.get(towerId);
                        if (!entry) {
                            entry = { address: r.ADDRESS, firstSeen: new Date(recordTime), records: [] };
                        }
                        entry.records.push(r);
                        if (recordTime < entry.firstSeen.getTime()) {
                            entry.firstSeen = new Date(recordTime);
                        }
                        newLocationCandidates.set(towerId, entry);
                    }
                });

                const suggestions = Array.from(newLocationCandidates.entries()).map(([towerId, data]) => ({
                    towerId,
                    address: data.address,
                    firstSeen: data.firstSeen,
                    recordCount: data.records.length,
                })).sort((a, b) => b.recordCount - a.recordCount); // Sort by activity count

                setSuggestedLocations(suggestions);

            } catch (e) {
                console.error("Error during suggestion generation:", e);
                setError("An error occurred while finding new locations.");
            } finally {
                setIsLoading(false);
            }
        }, 100);

    }, [globallyFilteredRecords]);

    const performAnalysis = useCallback((locationToAnalyze: { towerId: string; address?: string; firstSeen: Date; }) => {
        setSelectedLocation(locationToAnalyze);
        if (!targetAParty) return;

        setIsAnalyzing(true);
        setError(null);
        setAnalysisResult(null);

        setTimeout(() => {
            try {
                const allRecordsForTarget = globallyFilteredRecords.filter(r => r.APARTY === targetAParty);
                const recordsBeforeMove = allRecordsForTarget.filter(r => (parseDateTime(r.START_DTTIME)?.getTime() || 0) < locationToAnalyze.firstSeen.getTime());
                
                const homeTowersIdentified = getMostFrequentTowers(recordsBeforeMove, 3).map(t => t.towerId);

                const homeContacts = new Set<string>();
                recordsBeforeMove.forEach(r => { if(r.BPARTY) homeContacts.add(r.BPARTY); });

                const newLocationRecords = allRecordsForTarget.filter(r => `${r.LACSTARTA}-${r.CISTARTA}` === locationToAnalyze.towerId && (parseDateTime(r.START_DTTIME)?.getTime() || 0) >= locationToAnalyze.firstSeen.getTime());

                const contactsInNewLocation = new Map<string, LocationContactDetail>();
                newLocationRecords.forEach(r => {
                    if (!r.BPARTY) return;
                    let contactDetail = contactsInNewLocation.get(r.BPARTY) || {
                        contactNumber: r.BPARTY,
                        callCountInNewLocation: 0,
                        totalDurationInNewLocation: 0,
                        associatedNewLocationTowers: [],
                    };
                    contactDetail.callCountInNewLocation++;
                    contactDetail.totalDurationInNewLocation += parseInt(r.CALL_DURATION, 10) || 0;
                    if (!contactDetail.associatedNewLocationTowers.includes(locationToAnalyze.towerId)) {
                        contactDetail.associatedNewLocationTowers.push(locationToAnalyze.towerId);
                    }
                    const recordTimestamp = parseDateTime(r.START_DTTIME)?.getTime();
                    if (recordTimestamp) {
                        if (!contactDetail.firstCallTimestampInNewLocation || recordTimestamp < contactDetail.firstCallTimestampInNewLocation) contactDetail.firstCallTimestampInNewLocation = recordTimestamp;
                        if (!contactDetail.lastCallTimestampInNewLocation || recordTimestamp > contactDetail.lastCallTimestampInNewLocation) contactDetail.lastCallTimestampInNewLocation = recordTimestamp;
                    }
                    contactsInNewLocation.set(r.BPARTY, contactDetail);
                });
                
                let newContacts: LocationContactDetail[] = [];
                const maintainedContacts: LocationContactDetail[] = [];
                
                contactsInNewLocation.forEach((details, contactNumber) => {
                    if (homeContacts.has(contactNumber)) {
                        maintainedContacts.push(details);
                    } else {
                        newContacts.push(details);
                    }
                });

                if (filterDate) {
                    const filterTimestamp = new Date(filterDate).getTime();
                    newContacts = newContacts.filter(c => c.firstCallTimestampInNewLocation && c.firstCallTimestampInNewLocation >= filterTimestamp);
                }

                setAnalysisResult({
                    targetAParty: targetAParty,
                    homeTowersIdentified: homeTowersIdentified.length > 0 ? homeTowersIdentified : ["N/A"],
                    homeContactsIdentified: homeContacts,
                    newLocationTowersActive: [locationToAnalyze.towerId],
                    newContactsMade: newContacts.sort((a,b) => b.callCountInNewLocation - a.callCountInNewLocation),
                    maintainedHomeContacts: maintainedContacts.sort((a,b) => b.callCountInNewLocation - a.callCountInNewLocation),
                });
            } catch(e) {
                console.error("Error performing analysis:", e);
                setError("An error occurred during analysis.");
            } finally {
                setIsAnalyzing(false);
            }
        }, 100);
    }, [targetAParty, globallyFilteredRecords, filterDate]);

    const handleExport = (type: 'new' | 'maintained') => {
        if (!analysisResult) return;
        const dataToExport = type === 'new' ? analysisResult.newContactsMade : analysisResult.maintainedHomeContacts;
        const filename = `location_contact_analysis_${type}_${targetAParty}.csv`;
        const headers = ["CONTACT NUMBER", "CALL COUNT (NEW LOC)", "TOTAL DURATION (NEW LOC, S)", "FIRST CALL (NEW LOC)", "LAST CALL (NEW LOC)", "ASSOCIATED NEW LOC TOWERS"];
        const csvData = dataToExport.map(d => [
          d.contactNumber, 
          String(d.callCountInNewLocation), 
          String(d.totalDurationInNewLocation),
          d.firstCallTimestampInNewLocation ? formatDateFromTimestamp(d.firstCallTimestampInNewLocation) : "N/A",
          d.lastCallTimestampInNewLocation ? formatDateFromTimestamp(d.lastCallTimestampInNewLocation) : "N/A",
          d.associatedNewLocationTowers.join('; ')
        ]);
        downloadCSV(filename, csvData, headers);
    };

    const renderTable = (title: string, data: LocationContactDetail[], pageState: [number, React.Dispatch<React.SetStateAction<number>>], exportType: 'new' | 'maintained') => {
        const [page, setPage] = pageState;
        const paginatedData = data.slice((page - 1) * ROWS_PER_PAGE, page * ROWS_PER_PAGE);
        const totalPages = Math.ceil(data.length / ROWS_PER_PAGE);

        return (
            <div className="p-4 bg-surface rounded-xl shadow-lg border border-neutral-light">
                <div className="flex justify-between items-center mb-2">
                    <h4 className="font-semibold text-sm text-textPrimary">{title} ({data.length})</h4>
                    {data.length > 0 && <button onClick={() => handleExport(exportType)} className="px-2.5 py-1 text-xs bg-secondary/80 text-white rounded-md hover:bg-secondary"><Download size={14} className="inline mr-1"/>Export Table</button>}
                </div>
                {data.length > 0 ? (
                    <>
                        <div className="overflow-x-auto">
                            <table className="min-w-full text-xs">
                                <thead className="bg-neutral-lightest">
                                    <tr>
                                        {["Contact Number", "Call Count (New Loc)", "Total Duration (New Loc, S)", "First Call (New Loc)", "Last Call (New Loc)", "Associated New Loc Towers"].map(h => <th key={h} className="p-2 text-left font-medium text-textSecondary uppercase tracking-wider">{h}</th>)}
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-neutral-light">
                                    {paginatedData.map(c => (
                                        <tr key={c.contactNumber}>
                                            <td className="p-2">{c.contactNumber}</td>
                                            <td className="p-2 text-center">{c.callCountInNewLocation}</td>
                                            <td className="p-2 text-center">{c.totalDurationInNewLocation}</td>
                                            <td className="p-2 whitespace-nowrap">{formatDateFromTimestamp(c.firstCallTimestampInNewLocation || 0)}</td>
                                            <td className="p-2 whitespace-nowrap">{formatDateFromTimestamp(c.lastCallTimestampInNewLocation || 0)}</td>
                                            <td className="p-2 truncate max-w-xs" title={c.associatedNewLocationTowers.join(', ')}>{c.associatedNewLocationTowers.join(', ')}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        {totalPages > 1 && (
                            <div className="flex justify-between items-center mt-2 text-xs">
                                <span>Page {page} of {totalPages}</span>
                                <div>
                                    <button onClick={() => setPage(p => Math.max(1, p-1))} disabled={page===1} className="px-2 py-1 border rounded mr-1 disabled:opacity-50">Prev</button>
                                    <button onClick={() => setPage(p => Math.min(totalPages, p+1))} disabled={page===totalPages} className="px-2 py-1 border rounded disabled:opacity-50">Next</button>
                                </div>
                            </div>
                        )}
                    </>
                ) : (
                    <p className="text-xs text-textSecondary text-center py-4">No contacts found for this category.</p>
                )}
            </div>
        );
    }
    

  return (
    <div className="space-y-4">
      <div className="p-4 bg-surface border border-neutral-light rounded-xl shadow-md">
        <h2 className="text-xl font-semibold text-textPrimary mb-2 flex items-center"><MapPinned size={22} className="mr-2 text-primary"/>Location Based Contact Analysis</h2>
        <p className="text-sm text-textSecondary">Analyze changes in contacts when a number moves between locations. Click a suggested location to analyze.</p>
        
        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4 items-end">
            <div>
                <label htmlFor="targetAParty" className="block text-xs font-medium text-textSecondary mb-1">Target AParty:</label>
                <select id="targetAParty" value={targetAParty} onChange={e => handleTargetChange(e.target.value)} className="w-full p-2 border border-neutral-light rounded-md text-sm">
                    <option value="">-- Select AParty --</option>
                    {uniqueAParties.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
            </div>
            <div>
                <label htmlFor="filterDate" className="block text-xs font-medium text-textSecondary mb-1">Filter New Contacts After Date (Optional):</label>
                <input type="date" id="filterDate" value={filterDate} onChange={e => setFilterDate(e.target.value)} className="w-full p-2 border border-neutral-light rounded-md text-sm" />
                <p className="text-[10px] text-textSecondary mt-1">If set, only new contacts made on or after this date will be shown.</p>
            </div>
        </div>
      </div>

      {isLoading && <div className="text-center p-4"><Loader2 className="animate-spin inline mr-2"/>Finding potential new locations...</div>}
      {error && <div className="p-3 bg-danger-lighter text-danger-darker rounded-md border border-danger-light">{error}</div>}

      {targetAParty && !isLoading && (
        <div className="p-4 bg-surface border border-neutral-light rounded-xl shadow-md">
            <h3 className="font-semibold text-sm mb-2">Suggested New Locations for <span className="text-primary-dark">{targetAParty}</span></h3>
            {suggestedLocations.length > 0 ? (
                <div className="space-y-2">
                    {suggestedLocations.slice(0, showAllLocations ? undefined : 3).map(loc => (
                        <button key={loc.towerId} onClick={() => performAnalysis(loc)} disabled={isAnalyzing} className={`w-full text-left p-3 border rounded-lg hover:bg-primary-lighter/50 transition-colors disabled:opacity-70 ${selectedLocation?.towerId === loc.towerId ? 'bg-primary-lighter border-primary-dark ring-2 ring-primary-dark' : 'bg-neutral-lightest border-neutral-light'}`}>
                            <p className="font-medium text-sm text-textPrimary">{loc.address || 'Unknown Address'}</p>
                            <p className="text-xs text-textSecondary">{loc.towerId} - {loc.recordCount} records, first seen: {formatDateFromTimestamp(loc.firstSeen.getTime())}</p>
                        </button>
                    ))}
                     <div className="flex items-center justify-between text-xs mt-2">
                        <span className="text-textSecondary italic">Sorted by activity. Click a location to initiate analysis based on its first appearance date.</span>
                        {suggestedLocations.length > 3 && (
                            <button onClick={() => setShowAllLocations(prev => !prev)} className="text-primary hover:underline">
                                {showAllLocations ? 'Show Less Locations' : `Show ${suggestedLocations.length - 3} More Locations...`}
                            </button>
                        )}
                    </div>
                </div>
            ) : (
                <p className="text-xs text-textSecondary">No significant new location patterns found for this target after their last known home activity.</p>
            )}
        </div>
      )}

      {isAnalyzing && <div className="text-center p-4"><Loader2 className="animate-spin inline mr-2"/>Analyzing contacts...</div>}
      
      {analysisResult && !isAnalyzing && (
        <div className="space-y-4">
            <div className="p-3 bg-neutral-lightest rounded-lg border border-neutral-light text-xs">
                <h4 className="font-semibold text-sm mb-1">Analysis for: {analysisResult.targetAParty}</h4>
                <p><strong>Home Towers Identified (before moving to <span className="text-primary">{selectedLocation?.towerId}</span>) ({analysisResult.homeTowersIdentified.length}):</strong> {analysisResult.homeTowersIdentified.join(', ')}</p>
                <p><strong>Home Contacts Identified ({analysisResult.homeContactsIdentified.size}):</strong> {Array.from(analysisResult.homeContactsIdentified).slice(0,5).join(', ')}{analysisResult.homeContactsIdentified.size > 5 ? '...' : ''}</p>
                <p><strong>Current New Location Tower:</strong> {analysisResult.newLocationTowersActive.join(', ')}</p>
            </div>

            {renderTable(`New Contacts Made from New Location`, analysisResult.newContactsMade, [newContactsPage, setNewContactsPage], 'new')}
            {renderTable(`Maintained Home Contacts from New Location`, analysisResult.maintainedHomeContacts, [maintainedContactsPage, setMaintainedContactsPage], 'maintained')}
        </div>
      )}

    </div>
  );
};

export default LocationContactAnalysisView;

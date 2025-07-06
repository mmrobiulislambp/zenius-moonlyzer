
import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { ListFilter, CalendarDays, Clock, Search, Download, ChevronUp, ChevronDown, AlertTriangle, Info, Loader2, User, SmartphoneNfc, Layers, Activity as ActivityIcon, BarChart2, TowerControl } from 'lucide-react';
import { useLACContext } from '../contexts/LACContext';
import { LACRecord } from '../types';
import { formatDate, parseDateTime, formatDateFromTimestamp } from '../utils/cdrUtils';
import { downloadCSV } from '../utils/downloadUtils';

const ROWS_PER_PAGE = 15;

type TimeOfDay = 'all' | 'morning' | 'afternoon' | 'evening' | 'night' | 'custom';

interface FilteredClusterData {
  msisdn: string;
  recordCount: number;
  firstSeen?: Date;
  lastSeen?: Date;
  associatedLACs: Set<string>;
  associatedCellIDs: Set<string>;
  associatedIMEIs: Set<string>;
  usageTypesSummary: Record<string, number>;
}

const LACTimeBasedFilterView: React.FC = () => {
  const { allLACRecords, getUniqueLACValues, isLoading: contextIsLoading, uploadedLACFiles } = useLACContext();

  const [dateRange, setDateRange] = useState<{ start: string, end: string }>({ 
    start: new Date().toISOString().split('T')[0], 
    end: new Date().toISOString().split('T')[0] 
  });
  const [timeOfDay, setTimeOfDay] = useState<TimeOfDay>('all');
  const [customTime, setCustomTime] = useState<{ start: string, end: string }>({ start: '00:00', end: '23:59' });
  
  const [lacInputType, setLacInputType] = useState<'select' | 'custom'>('select');
  const [selectedFileLAC, setSelectedFileLAC] = useState<string | null>(null);
  const [selectedFileCellID, setSelectedFileCellID] = useState<string | null>(null);
  const [customLAC, setCustomLAC] = useState<string>('');
  const [customCellID, setCustomCellID] = useState<string>('');

  const [minRecordCount, setMinRecordCount] = useState<number>(1);

  const [searchResults, setSearchResults] = useState<FilteredClusterData[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [currentPage, setCurrentPage] = useState(1);
  const [sortConfig, setSortConfig] = useState<{ key: keyof FilteredClusterData | string; direction: 'ascending' | 'descending' }>({ key: 'recordCount', direction: 'descending' });

  const uniqueLACs = useMemo(() => getUniqueLACValues('LAC'), [getUniqueLACValues]);
  const availableCellIDs = useMemo(() => {
    if (!selectedFileLAC) return [];
    const cells = new Set<string>();
    allLACRecords.filter(r => r.LAC === selectedFileLAC && r.CELL_ID).forEach(r => cells.add(r.CELL_ID!));
    return Array.from(cells).sort();
  }, [allLACRecords, selectedFileLAC]);

   useEffect(() => {
    if (lacInputType === 'select') {
        setCustomLAC('');
        setCustomCellID('');
    } else {
        setSelectedFileLAC(null);
        setSelectedFileCellID(null);
    }
  }, [lacInputType]);


  const handleSearch = useCallback(() => {
    setErrorMsg(null);
    setIsLoading(true);
    setSearchResults([]);
    setCurrentPage(1);

    const finalLAC = lacInputType === 'select' ? selectedFileLAC : customLAC.trim();
    const finalCellID = lacInputType === 'select' ? selectedFileCellID : customCellID.trim();
    
    if (!dateRange.start || !dateRange.end) {
      setErrorMsg("Start Date and End Date are required.");
      setIsLoading(false);
      return;
    }
    if (minRecordCount < 1) {
        setErrorMsg("Minimum Record Count must be at least 1.");
        setIsLoading(false);
        return;
    }
    
    try {
      const sDateTime = new Date(dateRange.start); sDateTime.setHours(0,0,0,0);
      const eDateTime = new Date(dateRange.end); eDateTime.setHours(23,59,59,999);
      
      let timeStartMinutes = 0;
      let timeEndMinutes = 24 * 60 -1; // Default to full day

      if (timeOfDay === 'custom') {
        const [startH, startM] = customTime.start.split(':').map(Number);
        const [endH, endM] = customTime.end.split(':').map(Number);
        if (!isNaN(startH) && !isNaN(startM)) timeStartMinutes = startH * 60 + startM;
        if (!isNaN(endH) && !isNaN(endM)) timeEndMinutes = endH * 60 + endM;
      } else if (timeOfDay !== 'all') {
        switch (timeOfDay) {
          case 'morning': timeStartMinutes = 6 * 60; timeEndMinutes = 12 * 60 -1; break;
          case 'afternoon': timeStartMinutes = 12 * 60; timeEndMinutes = 18 * 60 -1; break;
          case 'evening': timeStartMinutes = 18 * 60; timeEndMinutes = 22 * 60 -1; break;
          case 'night': timeStartMinutes = 22 * 60; timeEndMinutes = 6 * 60 - 1; break; // Handles overnight
        }
      }

      const filtered = allLACRecords.filter(record => {
        const recordDateTime = parseDateTime(record.DATE_TIME);
        if (!recordDateTime) return false;
        if (recordDateTime < sDateTime || recordDateTime > eDateTime) return false;

        const recordHour = recordDateTime.getHours();
        const recordMinute = recordDateTime.getMinutes();
        const recordTotalMinutes = recordHour * 60 + recordMinute;

        if (timeStartMinutes <= timeEndMinutes) { // Same day range
          if (recordTotalMinutes < timeStartMinutes || recordTotalMinutes > timeEndMinutes) return false;
        } else { // Overnight range (e.g., 10 PM to 6 AM)
          if (recordTotalMinutes < timeStartMinutes && recordTotalMinutes > timeEndMinutes) return false;
        }
        
        if (finalLAC && record.LAC !== finalLAC) return false;
        if (finalCellID && record.CELL_ID !== finalCellID) return false;
        
        return true;
      });

      const msisdnDataMap = new Map<string, FilteredClusterData>();
      filtered.forEach(record => {
        if (!record.MSISDN || record.MSISDN.trim() === '') return;
        const msisdn = record.MSISDN.trim();
        let entry = msisdnDataMap.get(msisdn);
        if (!entry) {
          entry = { msisdn, recordCount: 0, associatedLACs: new Set(), associatedCellIDs: new Set(), associatedIMEIs: new Set(), usageTypesSummary: {} };
        }
        entry.recordCount++;
        const recordDateTime = parseDateTime(record.DATE_TIME);
        if (recordDateTime) {
            if (!entry.firstSeen || recordDateTime < entry.firstSeen) entry.firstSeen = recordDateTime;
            if (!entry.lastSeen || recordDateTime > entry.lastSeen) entry.lastSeen = recordDateTime;
        }
        if (record.LAC) entry.associatedLACs.add(record.LAC);
        if (record.CELL_ID) entry.associatedCellIDs.add(record.CELL_ID);
        if (record.IMEI && record.IMEI.trim() !== '') entry.associatedIMEIs.add(record.IMEI);
        if (record.USAGE_TYPE) {
            entry.usageTypesSummary[record.USAGE_TYPE] = (entry.usageTypesSummary[record.USAGE_TYPE] || 0) + 1;
        }
        msisdnDataMap.set(msisdn, entry);
      });

      const results = Array.from(msisdnDataMap.values()).filter(data => data.recordCount >= minRecordCount);
      setSearchResults(results);
      if (results.length === 0) setErrorMsg("No numbers found matching the specified time-based criteria.");
      
    } catch (e) {
      console.error("Search error:", e);
      setErrorMsg("An error occurred during the search. Please check inputs.");
    } finally {
      setIsLoading(false);
    }
  }, [dateRange, timeOfDay, customTime, lacInputType, selectedFileLAC, selectedFileCellID, customLAC, customCellID, minRecordCount, allLACRecords]);

  const sortedResults = useMemo(() => {
    return [...searchResults].sort((a, b) => {
      const valA = a[sortConfig.key as keyof FilteredClusterData];
      const valB = b[sortConfig.key as keyof FilteredClusterData];
      let comparison = 0;
      if (valA instanceof Date && valB instanceof Date) {
        comparison = valA.getTime() - valB.getTime();
      } else if (typeof valA === 'number' && typeof valB === 'number') {
        comparison = valA - valB;
      } else if (valA instanceof Set && valB instanceof Set) {
        comparison = valA.size - valB.size;
      } else if (typeof valA === 'string' && typeof valB === 'string') {
        comparison = valA.localeCompare(valB);
      } else if (typeof valA === 'object' && typeof valB === 'object' && valA !== null && valB !== null) { // For usageTypesSummary
          comparison = Object.values(valA).reduce((s,c)=>s+c,0) - Object.values(valB).reduce((s,c)=>s+c,0);
      }
      return sortConfig.direction === 'ascending' ? comparison : -comparison;
    });
  }, [searchResults, sortConfig]);

  const paginatedResults = useMemo(() => {
    const startIndex = (currentPage - 1) * ROWS_PER_PAGE;
    return sortedResults.slice(startIndex, startIndex + ROWS_PER_PAGE);
  }, [sortedResults, currentPage]);
  const totalPages = Math.ceil(sortedResults.length / ROWS_PER_PAGE);

  const requestSort = (key: keyof FilteredClusterData | string) => {
    let direction: 'ascending' | 'descending' = 'descending';
    if (sortConfig.key === key && sortConfig.direction === 'descending') direction = 'ascending';
    setSortConfig({ key, direction });
    setCurrentPage(1);
  };
  
  const renderSortIcon = (key: keyof FilteredClusterData | string) => {
    if (sortConfig.key !== key) return <ListFilter size={14} className="ml-1 opacity-30 group-hover:opacity-100 inline" />;
    return sortConfig.direction === 'ascending' ? <ChevronUp size={14} className="ml-1 text-primary inline" /> : <ChevronDown size={14} className="ml-1 text-primary inline" />;
  };

  const handleExportData = () => {
    if (sortedResults.length === 0) { alert("No data to export."); return; }
    const headers = ["MSISDN", "Record Count (Filtered)", "First Seen (Filtered)", "Last Seen (Filtered)", "Associated LACs", "Associated Cell IDs", "Associated IMEIs", "Usage Types Summary"];
    const data = sortedResults.map(d => [
      d.msisdn,
      String(d.recordCount),
      d.firstSeen ? formatDate(d.firstSeen.toISOString()) : 'N/A',
      d.lastSeen ? formatDate(d.lastSeen.toISOString()) : 'N/A',
      Array.from(d.associatedLACs).join('; '),
      Array.from(d.associatedCellIDs).join('; '),
      Array.from(d.associatedIMEIs).join('; '),
      Object.entries(d.usageTypesSummary).map(([type, count]) => `${type}: ${count}`).join('; ')
    ]);
    downloadCSV(`time_based_filter_results_${dateRange.start}_to_${dateRange.end}.csv`, data, headers);
  };
  
  const tableHeaders: { key: keyof FilteredClusterData | string; label: string; icon?: React.ReactNode }[] = [
    { key: 'msisdn', label: 'MSISDN', icon: <User size={14}/> },
    { key: 'recordCount', label: 'Record Count', icon: <ListFilter size={14}/> },
    { key: 'firstSeen', label: 'First Seen', icon: <Clock size={14}/> },
    { key: 'lastSeen', label: 'Last Seen', icon: <Clock size={14}/> },
    { key: 'associatedLACs', label: 'LACs', icon: <TowerControl size={14}/> },
    { key: 'associatedCellIDs', label: 'Cell IDs', icon: <TowerControl size={14}/> },
    { key: 'associatedIMEIs', label: 'IMEIs', icon: <SmartphoneNfc size={14}/> },
    { key: 'usageTypesSummary', label: 'Usage Summary', icon: <ActivityIcon size={14}/> },
  ];

  if (contextIsLoading && allLACRecords.length === 0) return <div className="flex justify-center items-center h-64"><Loader2 className="h-12 w-12 animate-spin text-primary" /><p className="ml-3 text-textSecondary">Loading LAC data...</p></div>;
  if (uploadedLACFiles.length === 0 && !contextIsLoading) return <div className="p-6 bg-info-lighter border border-info-light rounded-lg text-center text-info-dark flex flex-col items-center justify-center min-h-[150px] shadow-md"><Info size={28} className="mb-2" /><p className="font-medium">Please upload LAC/Cell data files.</p></div>;

  return (
    <div className="space-y-6">
      <div className="p-4 sm:p-5 bg-surface border border-neutral-light rounded-xl shadow-xl">
        <div className="flex items-center text-xl sm:text-2xl font-semibold text-textPrimary mb-1">
          <ListFilter size={24} className="mr-2.5 text-primary" /> Time-based Filtering & Clustering
        </div>
        <p className="text-sm text-textSecondary">Filter and cluster MSISDNs based on their presence during specific timeframes and locations.</p>
        
        <div className="mt-4 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 items-end">
                <div>
                    <label htmlFor="startDate" className="block text-xs font-medium text-textSecondary mb-1">Start Date:</label>
                    <input type="date" id="startDate" value={dateRange.start} onChange={e => setDateRange(prev => ({ ...prev, start: e.target.value }))} className="w-full p-2.5 border border-neutral-light rounded-lg focus:ring-2 focus:ring-primary-light text-sm shadow-sm accent-primary"/>
                </div>
                <div>
                    <label htmlFor="endDate" className="block text-xs font-medium text-textSecondary mb-1">End Date:</label>
                    <input type="date" id="endDate" value={dateRange.end} onChange={e => setDateRange(prev => ({ ...prev, end: e.target.value }))} className="w-full p-2.5 border border-neutral-light rounded-lg focus:ring-2 focus:ring-primary-light text-sm shadow-sm accent-primary"/>
                </div>
                <div>
                    <label htmlFor="timeOfDay" className="block text-xs font-medium text-textSecondary mb-1">Time of Day:</label>
                    <select id="timeOfDay" value={timeOfDay} onChange={e => setTimeOfDay(e.target.value as TimeOfDay)} className="w-full p-2.5 border border-neutral-light rounded-lg focus:ring-2 focus:ring-primary-light text-sm shadow-sm">
                        <option value="all">All Day</option>
                        <option value="morning">Morning (6AM-12PM)</option>
                        <option value="afternoon">Afternoon (12PM-6PM)</option>
                        <option value="evening">Evening (6PM-10PM)</option>
                        <option value="night">Night (10PM-6AM)</option>
                        <option value="custom">Custom Range</option>
                    </select>
                </div>
                {timeOfDay === 'custom' && (
                    <>
                        <div>
                            <label htmlFor="customStartTime" className="block text-xs font-medium text-textSecondary mb-1">Custom Start Time:</label>
                            <input type="time" id="customStartTime" value={customTime.start} onChange={e => setCustomTime(prev => ({...prev, start: e.target.value}))} className="w-full p-2.5 border border-neutral-light rounded-lg focus:ring-2 focus:ring-primary-light text-sm shadow-sm accent-primary"/>
                        </div>
                        <div>
                            <label htmlFor="customEndTime" className="block text-xs font-medium text-textSecondary mb-1">Custom End Time:</label>
                            <input type="time" id="customEndTime" value={customTime.end} onChange={e => setCustomTime(prev => ({...prev, end: e.target.value}))} className="w-full p-2.5 border border-neutral-light rounded-lg focus:ring-2 focus:ring-primary-light text-sm shadow-sm accent-primary"/>
                        </div>
                    </>
                )}
                 <div>
                    <label htmlFor="minRecordCount" className="block text-xs font-medium text-textSecondary mb-1">Min Record Count:</label>
                    <input type="number" id="minRecordCount" value={minRecordCount} onChange={e => setMinRecordCount(Math.max(1, Number(e.target.value)))} min="1" className="w-full p-2.5 border border-neutral-light rounded-lg focus:ring-2 focus:ring-primary-light text-sm shadow-sm"/>
                </div>
            </div>
            <div className="pt-3 border-t border-neutral-light/50 mt-3">
                <p className="text-xs font-medium text-textSecondary mb-2">Optional Location Filters:</p>
                <div className="flex items-center space-x-4 text-sm mb-2">
                    <label className="flex items-center cursor-pointer"><input type="radio" name="lacFilterInputType" value="select" checked={lacInputType === 'select'} onChange={() => setLacInputType('select')} className="mr-1.5 accent-primary"/> Select from Data</label>
                    <label className="flex items-center cursor-pointer"><input type="radio" name="lacFilterInputType" value="custom" checked={lacInputType === 'custom'} onChange={() => setLacInputType('custom')} className="mr-1.5 accent-primary"/> Enter Custom</label>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-end">
                    {lacInputType === 'select' ? (
                        <>
                            <div>
                                <label htmlFor="lacDropdownFilter" className="block text-xs font-medium text-textSecondary mb-1">LAC:</label>
                                <select id="lacDropdownFilter" value={selectedFileLAC || ''} onChange={e => {setSelectedFileLAC(e.target.value || null); setSelectedFileCellID(null);}} className="w-full p-2.5 border border-neutral-light rounded-lg focus:ring-2 focus:ring-primary-light text-sm shadow-sm">
                                    <option value="">-- Any LAC --</option>
                                    {uniqueLACs.map(lac => <option key={lac} value={lac}>{lac}</option>)}
                                </select>
                            </div>
                            <div>
                                <label htmlFor="cellIdDropdownFilter" className="block text-xs font-medium text-textSecondary mb-1">Cell ID:</label>
                                <select id="cellIdDropdownFilter" value={selectedFileCellID || ''} onChange={e => setSelectedFileCellID(e.target.value || null)} disabled={!selectedFileLAC || availableCellIDs.length === 0} className="w-full p-2.5 border border-neutral-light rounded-lg focus:ring-2 focus:ring-primary-light text-sm shadow-sm">
                                    <option value="">-- Any Cell ID (selected LAC) --</option>
                                    {availableCellIDs.map(cell => <option key={cell} value={cell}>{cell}</option>)}
                                </select>
                                 {!selectedFileLAC && <p className="text-[10px] text-warning-dark mt-0.5">Select a LAC to filter by Cell ID.</p>}
                            </div>
                        </>
                    ) : (
                        <>
                            <div>
                                <label htmlFor="customLACFilter" className="block text-xs font-medium text-textSecondary mb-1">LAC:</label>
                                <input type="text" id="customLACFilter" value={customLAC} onChange={e => setCustomLAC(e.target.value)} placeholder="Enter LAC (Optional)" className="w-full p-2.5 border border-neutral-light rounded-lg focus:ring-2 focus:ring-primary-light text-sm shadow-sm"/>
                            </div>
                            <div>
                                <label htmlFor="customCellIDFilter" className="block text-xs font-medium text-textSecondary mb-1">Cell ID:</label>
                                <input type="text" id="customCellIDFilter" value={customCellID} onChange={e => setCustomCellID(e.target.value)} placeholder="Enter Cell ID (Optional)" className="w-full p-2.5 border border-neutral-light rounded-lg focus:ring-2 focus:ring-primary-light text-sm shadow-sm"/>
                            </div>
                        </>
                    )}
                </div>
            </div>
            <button onClick={handleSearch} disabled={isLoading || contextIsLoading} className="w-full sm:w-auto mt-3 px-6 py-2.5 bg-primary text-white rounded-lg hover:bg-primary-dark text-sm font-medium shadow-md hover:shadow-lg transition-all disabled:opacity-70 flex items-center justify-center">
                {isLoading ? <Loader2 className="h-5 w-5 animate-spin mr-2"/> : <Search size={18} className="mr-2"/>}
                Apply Time Filters
            </button>
        </div>
      </div>
      
      {isLoading && searchResults.length === 0 && (
          <div className="flex justify-center items-center h-40"><Loader2 className="h-10 w-10 animate-spin text-primary" /><p className="ml-3 text-textSecondary">Filtering records...</p></div>
      )}
      {errorMsg && !isLoading && (
           <div className="p-3 bg-warning-lighter border border-warning-light rounded-lg text-sm text-warning-darker flex items-center shadow-md">
             <AlertTriangle size={18} className="mr-2"/> {errorMsg}
           </div>
      )}
      
      {searchResults.length > 0 && !isLoading && (
        <div className="p-4 sm:p-5 bg-surface border border-neutral-light rounded-xl shadow-xl">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-3">
            <h3 className="text-base sm:text-lg font-semibold text-textPrimary">Filtered & Clustered Numbers ({sortedResults.length})</h3>
            <button onClick={handleExportData} className="mt-2 sm:mt-0 px-3 py-1.5 text-xs bg-secondary text-white rounded-lg hover:bg-secondary-dark flex items-center shadow-sm"><Download size={14} className="mr-1.5"/>Export Results</button>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-neutral-light">
              <thead className="bg-neutral-lightest sticky top-0">
                <tr>{tableHeaders.map(h => <th key={h.key as string} onClick={() => requestSort(h.key)} className="group px-3 py-2.5 text-left text-xs font-semibold text-textPrimary uppercase tracking-wider cursor-pointer hover:bg-neutral-lighter"><div className="flex items-center">{h.icon && <span className="mr-1.5 text-neutral-DEFAULT group-hover:text-primary">{h.icon}</span>}{h.label}{renderSortIcon(h.key)}</div></th>)}</tr>
              </thead>
              <tbody className="bg-surface divide-y divide-neutral-light">
                {paginatedResults.map((item, idx) => (
                  <tr key={item.msisdn + idx} className="hover:bg-neutral-lightest/50">
                    <td className="px-3 py-2 whitespace-nowrap text-xs text-textPrimary font-medium">{item.msisdn}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-xs text-textSecondary text-center">{item.recordCount}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-xs text-textSecondary">{item.firstSeen ? formatDate(item.firstSeen.toISOString()) : 'N/A'}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-xs text-textSecondary">{item.lastSeen ? formatDate(item.lastSeen.toISOString()) : 'N/A'}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-xs text-textSecondary truncate max-w-[100px]" title={Array.from(item.associatedLACs).join(', ')}>{Array.from(item.associatedLACs).join(', ')}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-xs text-textSecondary truncate max-w-[100px]" title={Array.from(item.associatedCellIDs).join(', ')}>{Array.from(item.associatedCellIDs).join(', ')}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-xs text-textSecondary truncate max-w-[150px]" title={Array.from(item.associatedIMEIs).join(', ')}>{Array.from(item.associatedIMEIs).join(', ')}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-xs text-textSecondary truncate max-w-[150px]" title={Object.entries(item.usageTypesSummary).map(([type, count]) => `${type}: ${count}`).join('; ')}>{Object.entries(item.usageTypesSummary).map(([type, count]) => `${type}: ${count}`).join('; ') || 'N/A'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {totalPages > 1 && (
            <div className="flex flex-col sm:flex-row justify-between items-center mt-3 pt-2 border-t border-neutral-light text-xs">
              <span className="text-textSecondary mb-1 sm:mb-0">Page {currentPage} of {totalPages}</span>
              <div className="flex gap-1.5">
                <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1} className="px-2.5 py-1 font-medium bg-surface border rounded-md shadow-sm hover:bg-neutral-lighter disabled:opacity-50">Prev</button>
                <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages} className="px-2.5 py-1 font-medium bg-surface border rounded-md shadow-sm hover:bg-neutral-lighter disabled:opacity-50">Next</button>
              </div>
            </div>
          )}
        </div>
      )}
      
      {!isLoading && !errorMsg && searchResults.length === 0 && (dateRange.start || dateRange.end || timeOfDay !== 'all' || customLAC || customCellID || minRecordCount > 1) && (
        <div className="p-6 bg-neutral-lightest border border-neutral-light rounded-lg text-center text-textSecondary flex flex-col items-center justify-center min-h-[100px] shadow-md">
            <Info size={24} className="mb-2 text-neutral-DEFAULT" />
            <p>No records matched your filtering criteria. Try adjusting the date, time, location, or minimum record count.</p>
        </div>
      )}
    </div>
  );
};

export default LACTimeBasedFilterView;

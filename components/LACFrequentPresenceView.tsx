import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { Repeat, CalendarDays, Search, ListFilter, Download, ChevronUp, ChevronDown, AlertTriangle, Info, Loader2, Users2, SmartphoneNfc, Clock, FileText, TowerControl } from 'lucide-react';
import { useLACContext } from '../contexts/LACContext';
import { LACRecord } from '../types';
import { formatDate, parseDateTime, formatDateFromTimestamp } from '../utils/cdrUtils';
import { downloadCSV } from '../utils/downloadUtils';

const ROWS_PER_PAGE = 10;

interface FrequentVisitor {
  msisdn: string;
  presenceCount: number;
  firstSeenInTower?: Date;
  lastSeenInTower?: Date;
  uniqueDatesOfPresence: string[]; // Store as string for display
  associatedIMEIs: Set<string>;
}

const LACFrequentPresenceView: React.FC = () => {
  const { allLACRecords, getUniqueLACValues, isLoading: contextIsLoading, uploadedLACFiles } = useLACContext();

  const [inputType, setInputType] = useState<'select' | 'custom'>('select');
  const [selectedFileLAC, setSelectedFileLAC] = useState<string | null>(null);
  const [selectedFileCellID, setSelectedFileCellID] = useState<string | null>(null);
  const [customLAC, setCustomLAC] = useState<string>('');
  const [customCellID, setCustomCellID] = useState<string>('');
  
  const [startDate, setStartDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [minPresence, setMinPresence] = useState<number>(3);

  const [searchResults, setSearchResults] = useState<FrequentVisitor[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [currentPage, setCurrentPage] = useState(1);
  const [sortConfig, setSortConfig] = useState<{ key: keyof FrequentVisitor | string; direction: 'ascending' | 'descending' }>({ key: 'presenceCount', direction: 'descending' });

  const uniqueLACs = useMemo(() => getUniqueLACValues('LAC'), [getUniqueLACValues]);
  const availableCellIDs = useMemo(() => {
    if (!selectedFileLAC) return [];
    const cells = new Set<string>();
    allLACRecords.filter(r => r.LAC === selectedFileLAC && r.CELL_ID).forEach(r => cells.add(r.CELL_ID!));
    return Array.from(cells).sort();
  }, [allLACRecords, selectedFileLAC]);

  useEffect(() => {
    if (inputType === 'select') {
        setCustomLAC('');
        setCustomCellID('');
    } else {
        setSelectedFileLAC(null);
        setSelectedFileCellID(null);
    }
  }, [inputType]);

  const handleSearch = useCallback(() => {
    setErrorMsg(null);
    setIsLoading(true);
    setSearchResults([]);
    setCurrentPage(1);

    const finalLAC = inputType === 'select' ? selectedFileLAC : customLAC.trim();
    const finalCellID = inputType === 'select' ? selectedFileCellID : customCellID.trim();

    if (!finalLAC || !finalCellID) {
      setErrorMsg("LAC and Cell ID are required.");
      setIsLoading(false);
      return;
    }
    if (!startDate || !endDate) {
      setErrorMsg("Start Date and End Date are required.");
      setIsLoading(false);
      return;
    }
    if (minPresence < 1) {
        setErrorMsg("Minimum Presence Count must be at least 1.");
        setIsLoading(false);
        return;
    }

    try {
      const sDate = new Date(startDate); sDate.setHours(0,0,0,0);
      const eDate = new Date(endDate); eDate.setHours(23,59,59,999);

      const recordsInLocationAndTime = allLACRecords.filter(record => {
        if (record.LAC !== finalLAC || record.CELL_ID !== finalCellID) return false;
        const recordDateTime = parseDateTime(record.DATE_TIME);
        if (!recordDateTime) return false;
        return recordDateTime >= sDate && recordDateTime <= eDate;
      });

      const msisdnPresenceMap = new Map<string, { count: number; firstSeen?: Date; lastSeen?: Date; dates: Set<string>; imeis: Set<string> }>();

      recordsInLocationAndTime.forEach(record => {
        if (!record.MSISDN || record.MSISDN.trim() === '') return;
        const msisdn = record.MSISDN.trim();
        let entry = msisdnPresenceMap.get(msisdn);
        if (!entry) {
          entry = { count: 0, dates: new Set<string>(), imeis: new Set<string>() };
        }
        entry.count++;
        const recordDateTime = parseDateTime(record.DATE_TIME);
        if (recordDateTime) {
            if (!entry.firstSeen || recordDateTime < entry.firstSeen) entry.firstSeen = recordDateTime;
            if (!entry.lastSeen || recordDateTime > entry.lastSeen) entry.lastSeen = recordDateTime;
            entry.dates.add(recordDateTime.toISOString().split('T')[0]);
        }
        if (record.IMEI && record.IMEI.trim() !== '') entry.imeis.add(record.IMEI);
        msisdnPresenceMap.set(msisdn, entry);
      });
      
      const frequentVisitors: FrequentVisitor[] = [];
      msisdnPresenceMap.forEach((data, msisdn) => {
        if (data.count >= minPresence) {
          frequentVisitors.push({
            msisdn,
            presenceCount: data.count,
            firstSeenInTower: data.firstSeen,
            lastSeenInTower: data.lastSeen,
            uniqueDatesOfPresence: Array.from(data.dates).sort((a,b) => new Date(a).getTime() - new Date(b).getTime()),
            associatedIMEIs: data.imeis,
          });
        }
      });

      setSearchResults(frequentVisitors);
      if (frequentVisitors.length === 0) {
        setErrorMsg("No numbers found matching the criteria.");
      }
    } catch (e) {
      console.error("Search error:", e);
      setErrorMsg("An error occurred during the search. Please check your inputs.");
    } finally {
      setIsLoading(false);
    }
  }, [inputType, selectedFileLAC, selectedFileCellID, customLAC, customCellID, startDate, endDate, minPresence, allLACRecords]);

  const sortedResults = useMemo(() => {
    let sortableItems = [...searchResults];
    if (sortConfig.key) {
      sortableItems.sort((a, b) => {
        let valA: any, valB: any;
        if (sortConfig.key === 'uniqueDatesOfPresence') {
            valA = a.uniqueDatesOfPresence.length;
            valB = b.uniqueDatesOfPresence.length;
        } else if (sortConfig.key === 'associatedIMEIs') {
            valA = a.associatedIMEIs.size;
            valB = b.associatedIMEIs.size;
        } else {
            valA = a[sortConfig.key as keyof FrequentVisitor];
            valB = b[sortConfig.key as keyof FrequentVisitor];
        }
        
        if (valA instanceof Date && valB instanceof Date) {
          return sortConfig.direction === 'ascending' ? valA.getTime() - valB.getTime() : valB.getTime() - valA.getTime();
        }
        if (typeof valA === 'number' && typeof valB === 'number') {
          return sortConfig.direction === 'ascending' ? valA - valB : valB - valA;
        }
        if (typeof valA === 'string' && typeof valB === 'string') {
          return sortConfig.direction === 'ascending' ? valA.localeCompare(valB) : valB.localeCompare(valA);
        }
        return 0;
      });
    }
    return sortableItems;
  }, [searchResults, sortConfig]);

  const paginatedResults = useMemo(() => {
    const startIndex = (currentPage - 1) * ROWS_PER_PAGE;
    return sortedResults.slice(startIndex, startIndex + ROWS_PER_PAGE);
  }, [sortedResults, currentPage]);
  const totalPages = Math.ceil(sortedResults.length / ROWS_PER_PAGE);

  const requestSort = (key: keyof FrequentVisitor | string) => {
    let direction: 'ascending' | 'descending' = 'ascending';
    if (sortConfig.key === key && sortConfig.direction === 'ascending') direction = 'descending';
    setSortConfig({ key, direction });
    setCurrentPage(1);
  };
  
  const renderSortIcon = (key: keyof FrequentVisitor | string) => {
    if (sortConfig.key !== key) return <ListFilter size={14} className="ml-1 text-neutral-DEFAULT opacity-30 group-hover:opacity-100 inline" />;
    return sortConfig.direction === 'ascending' ? <ChevronUp size={14} className="ml-1 text-primary inline" /> : <ChevronDown size={14} className="ml-1 text-primary inline" />;
  };

  const handleExportData = () => {
    if (sortedResults.length === 0) { alert("No data to export."); return; }
    const headers = ["MSISDN", "Presence Count", "First Seen in Tower", "Last Seen in Tower", "Unique Dates of Presence", "Associated IMEIs Count", "Associated IMEIs List"];
    const data = sortedResults.map(fv => [
      fv.msisdn,
      String(fv.presenceCount),
      fv.firstSeenInTower ? formatDate(fv.firstSeenInTower.toISOString()) : 'N/A',
      fv.lastSeenInTower ? formatDate(fv.lastSeenInTower.toISOString()) : 'N/A',
      fv.uniqueDatesOfPresence.join('; '),
      String(fv.associatedIMEIs.size),
      Array.from(fv.associatedIMEIs).join('; ')
    ]);
    downloadCSV(`frequent_presence_LAC_${inputType === 'select' ? selectedFileLAC : customLAC}_Cell_${inputType === 'select' ? selectedFileCellID : customCellID}.csv`, data, headers);
  };
  
  const tableHeaders: { key: keyof FrequentVisitor | string; label: string; icon?: React.ReactNode }[] = [
    { key: 'msisdn', label: 'MSISDN', icon: <SmartphoneNfc size={14}/> },
    { key: 'presenceCount', label: 'Presence Count', icon: <ListFilter size={14}/> },
    { key: 'firstSeenInTower', label: 'First Seen', icon: <Clock size={14}/> },
    { key: 'lastSeenInTower', label: 'Last Seen', icon: <Clock size={14}/> },
    { key: 'uniqueDatesOfPresence', label: '# Unique Days', icon: <CalendarDays size={14}/> },
    { key: 'associatedIMEIs', label: '# Associated IMEIs', icon: <Users2 size={14}/> },
  ];

  if (contextIsLoading && allLACRecords.length === 0) return <div className="flex justify-center items-center h-64"><Loader2 className="h-12 w-12 animate-spin text-primary" /><p className="ml-3 text-textSecondary">Loading LAC data...</p></div>;
  if (uploadedLACFiles.length === 0 && !contextIsLoading) return <div className="p-6 bg-info-lighter border border-info-light rounded-lg text-center text-info-dark flex flex-col items-center justify-center min-h-[150px] shadow-md"><Info size={28} className="mb-2" /><p className="font-medium">Please upload LAC/Cell data files.</p></div>;

  return (
    <div className="space-y-6">
      <div className="p-4 sm:p-5 bg-surface border border-neutral-light rounded-xl shadow-xl">
        <div className="flex items-center text-xl sm:text-2xl font-semibold text-textPrimary mb-1">
          <Repeat size={24} className="mr-2.5 text-primary" /> Frequent Presence in LAC/Cell
        </div>
        <p className="text-sm text-textSecondary">Identify numbers frequently appearing in a specific LAC & Cell ID over a selected date range.</p>
        
        <div className="mt-4 space-y-4">
            <div className="flex items-center space-x-4 text-sm">
                <label className="flex items-center cursor-pointer"><input type="radio" name="lacInputType" value="select" checked={inputType === 'select'} onChange={() => setInputType('select')} className="mr-1.5 accent-primary"/> Select from Data</label>
                <label className="flex items-center cursor-pointer"><input type="radio" name="lacInputType" value="custom" checked={inputType === 'custom'} onChange={() => setInputType('custom')} className="mr-1.5 accent-primary"/> Enter Custom</label>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-end">
                {inputType === 'select' ? (
                    <>
                        <div>
                            <label htmlFor="lacDropdownFreq" className="block text-xs font-medium text-textSecondary mb-1">LAC:</label>
                            <select id="lacDropdownFreq" value={selectedFileLAC || ''} onChange={e => {setSelectedFileLAC(e.target.value || null); setSelectedFileCellID(null);}} disabled={uniqueLACs.length === 0} className="w-full p-2.5 border border-neutral-light rounded-lg focus:ring-2 focus:ring-primary-light text-sm shadow-sm">
                                <option value="">-- Select LAC --</option>
                                {uniqueLACs.map(lac => <option key={lac} value={lac}>{lac}</option>)}
                            </select>
                        </div>
                        <div>
                            <label htmlFor="cellIdDropdownFreq" className="block text-xs font-medium text-textSecondary mb-1">Cell ID:</label>
                            <select id="cellIdDropdownFreq" value={selectedFileCellID || ''} onChange={e => setSelectedFileCellID(e.target.value || null)} disabled={!selectedFileLAC || availableCellIDs.length === 0} className="w-full p-2.5 border border-neutral-light rounded-lg focus:ring-2 focus:ring-primary-light text-sm shadow-sm">
                                <option value="">-- Select Cell ID --</option>
                                {availableCellIDs.map(cell => <option key={cell} value={cell}>{cell}</option>)}
                            </select>
                             {!selectedFileLAC && <p className="text-[10px] text-warning-dark mt-0.5">Select a LAC first to populate Cell IDs.</p>}
                        </div>
                    </>
                ) : (
                    <>
                        <div>
                            <label htmlFor="customLACFreq" className="block text-xs font-medium text-textSecondary mb-1">LAC:</label>
                            <input type="text" id="customLACFreq" value={customLAC} onChange={e => setCustomLAC(e.target.value)} placeholder="Enter LAC" className="w-full p-2.5 border border-neutral-light rounded-lg focus:ring-2 focus:ring-primary-light text-sm shadow-sm"/>
                        </div>
                        <div>
                            <label htmlFor="customCellIDFreq" className="block text-xs font-medium text-textSecondary mb-1">Cell ID:</label>
                            <input type="text" id="customCellIDFreq" value={customCellID} onChange={e => setCustomCellID(e.target.value)} placeholder="Enter Cell ID" className="w-full p-2.5 border border-neutral-light rounded-lg focus:ring-2 focus:ring-primary-light text-sm shadow-sm"/>
                        </div>
                    </>
                )}
            </div>
             <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
                <div>
                    <label htmlFor="startDateFreq" className="block text-xs font-medium text-textSecondary mb-1">Start Date:</label>
                    <input type="date" id="startDateFreq" value={startDate} onChange={e => setStartDate(e.target.value)} className="w-full p-2.5 border border-neutral-light rounded-lg focus:ring-2 focus:ring-primary-light text-sm shadow-sm accent-primary"/>
                </div>
                <div>
                    <label htmlFor="endDateFreq" className="block text-xs font-medium text-textSecondary mb-1">End Date:</label>
                    <input type="date" id="endDateFreq" value={endDate} onChange={e => setEndDate(e.target.value)} className="w-full p-2.5 border border-neutral-light rounded-lg focus:ring-2 focus:ring-primary-light text-sm shadow-sm accent-primary"/>
                </div>
                <div>
                    <label htmlFor="minPresence" className="block text-xs font-medium text-textSecondary mb-1">Min Presence Count:</label>
                    <input 
                        type="number" 
                        id="minPresence"
                        value={minPresence} 
                        onChange={e => setMinPresence(Number(e.target.value))}
                        className="w-full p-2.5 border border-neutral-light rounded-lg focus:ring-2 focus:ring-primary-light text-sm shadow-sm"
                        min="1"
                    />
                </div>
            </div>
            <button onClick={handleSearch} disabled={isLoading || contextIsLoading} className="w-full sm:w-auto px-6 py-2.5 bg-primary text-white rounded-lg hover:bg-primary-dark text-sm font-medium shadow-md hover:shadow-lg transition-all disabled:opacity-70 flex items-center justify-center">
                {isLoading ? <Loader2 className="h-5 w-5 animate-spin mr-2"/> : <Search size={18} className="mr-2"/>}
                Find Frequent Visitors
            </button>
        </div>
      </div>
      
      {isLoading && searchResults.length === 0 && (
          <div className="flex justify-center items-center h-40"><Loader2 className="h-10 w-10 animate-spin text-primary" /><p className="ml-3 text-textSecondary">Analyzing records...</p></div>
      )}
      {errorMsg && !isLoading && (
           <div className="p-3 bg-warning-lighter border border-warning-light rounded-lg text-sm text-warning-darker flex items-center shadow-md">
             <AlertTriangle size={18} className="mr-2"/> {errorMsg}
           </div>
      )}
      
      {searchResults.length > 0 && !isLoading && (
        <div className="p-4 sm:p-5 bg-surface border border-neutral-light rounded-xl shadow-xl">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-3">
            <h3 className="text-base sm:text-lg font-semibold text-textPrimary">Frequent Visitors ({sortedResults.length} numbers)</h3>
            <button onClick={handleExportData} className="mt-2 sm:mt-0 px-3 py-1.5 text-xs bg-secondary text-white rounded-lg hover:bg-secondary-dark flex items-center shadow-sm"><Download size={14} className="mr-1.5"/>Export Results</button>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-neutral-light">
              <thead className="bg-neutral-lightest sticky top-0">
                <tr>{tableHeaders.map(h => <th key={h.key as string} onClick={() => requestSort(h.key)} className="group px-3 py-2.5 text-left text-xs font-semibold text-textPrimary uppercase tracking-wider cursor-pointer hover:bg-neutral-lighter"><div className="flex items-center">{h.icon && <span className="mr-1.5 text-neutral-DEFAULT group-hover:text-primary">{h.icon}</span>}{h.label}{renderSortIcon(h.key)}</div></th>)}</tr>
              </thead>
              <tbody className="bg-surface divide-y divide-neutral-light">
                {paginatedResults.map((fv, idx) => (
                  <tr key={fv.msisdn + idx} className="hover:bg-neutral-lightest/50">
                    <td className="px-3 py-2 whitespace-nowrap text-xs text-textPrimary font-medium">{fv.msisdn}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-xs text-textSecondary text-center">{fv.presenceCount}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-xs text-textSecondary">{fv.firstSeenInTower ? formatDate(fv.firstSeenInTower.toISOString()) : 'N/A'}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-xs text-textSecondary">{fv.lastSeenInTower ? formatDate(fv.lastSeenInTower.toISOString()) : 'N/A'}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-xs text-textSecondary text-center truncate max-w-[200px]" title={fv.uniqueDatesOfPresence.join(', ')}>
                        {fv.uniqueDatesOfPresence.length} ({fv.uniqueDatesOfPresence.slice(0,2).join(', ')}{fv.uniqueDatesOfPresence.length > 2 ? '...' : ''})
                    </td>
                     <td className="px-3 py-2 whitespace-nowrap text-xs text-textSecondary text-center truncate max-w-[200px]" title={Array.from(fv.associatedIMEIs).join(', ')}>
                        {fv.associatedIMEIs.size} ({Array.from(fv.associatedIMEIs).slice(0,1).join(', ')}{fv.associatedIMEIs.size > 1 ? '...' : ''})
                    </td>
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
    </div>
  );
};

export default LACFrequentPresenceView;
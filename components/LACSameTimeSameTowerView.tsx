import React, { useState, useMemo, useCallback } from 'react';
import { Users2, Clock, Search, ListFilter, Download, ChevronUp, ChevronDown, AlertTriangle, Info, Loader2, TowerControl, Eye, X, SmartphoneNfc } from 'lucide-react';
import { useLACContext } from '../contexts/LACContext';
import { LACRecord } from '../types';
import { formatDate, parseDateTime } from '../utils/cdrUtils';
import { downloadCSV } from '../utils/downloadUtils';

const ROWS_PER_PAGE = 15;
const MODAL_ROWS_PER_PAGE = 15;

interface CoLocationEvent {
    id: string; // Unique key for the event
    towerId: string;
    address?: string;
    approximateTime: Date;
    involvedMsisdns: string[];
    recordCount: number;
    records: LACRecord[]; // all records contributing to this event
}

interface SortConfig {
  key: keyof CoLocationEvent;
  direction: 'ascending' | 'descending';
}

interface ModalSortConfig {
    key: keyof LACRecord;
    direction: 'ascending' | 'descending';
}


const LACSameTimeSameTowerView: React.FC = () => {
  const { allLACRecords, isLoading: contextIsLoading, uploadedLACFiles } = useLACContext();

  const [timeWindowSeconds, setTimeWindowSeconds] = useState<number>(300); // 5 minutes default
  const [minClusterSize, setMinClusterSize] = useState<number>(2);
  const [analysisResults, setAnalysisResults] = useState<CoLocationEvent[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [currentPage, setCurrentPage] = useState(1);
  const [sortConfig, setSortConfig] = useState<SortConfig>({ key: 'approximateTime', direction: 'descending' });

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalRecords, setModalRecords] = useState<LACRecord[]>([]);
  const [modalTitle, setModalTitle] = useState('');
  const [modalCurrentPage, setModalCurrentPage] = useState(1);
  const [modalSortConfig, setModalSortConfig] = useState<ModalSortConfig>({ key: 'DATE_TIME', direction: 'descending' });


  const handleAnalyze = useCallback(() => {
    setErrorMsg(null);
    setIsLoading(true);
    setAnalysisResults([]);
    setCurrentPage(1);

    if (minClusterSize < 2) {
      setErrorMsg("Minimum cluster size must be at least 2.");
      setIsLoading(false);
      return;
    }

    try {
      const timeWindowMs = timeWindowSeconds * 1000;

      const recordsByTower = new Map<string, LACRecord[]>();
      allLACRecords.forEach(record => {
        if (record.LAC && record.CELL_ID) {
          const key = `${record.LAC}-${record.CELL_ID}`;
          if (!recordsByTower.has(key)) {
            recordsByTower.set(key, []);
          }
          recordsByTower.get(key)!.push(record);
        }
      });

      const coLocationEvents: CoLocationEvent[] = [];
      const processedEventKeys = new Set<string>();

      recordsByTower.forEach((records, towerId) => {
        const sortedRecords = records
          .map(r => ({ ...r, parsedDate: parseDateTime(r.DATE_TIME) }))
          .filter(r => r.parsedDate && r.MSISDN && r.MSISDN.trim() !== '')
          .sort((a, b) => a.parsedDate!.getTime() - b.parsedDate!.getTime());
        
        if (sortedRecords.length < minClusterSize) return;

        for (let i = 0; i < sortedRecords.length; i++) {
          const anchorRecord = sortedRecords[i];
          const windowEndTime = anchorRecord.parsedDate!.getTime() + timeWindowMs;
          
          const clusterRecords = [anchorRecord];
          for (let j = i + 1; j < sortedRecords.length; j++) {
            const potentialRecord = sortedRecords[j];
            if (potentialRecord.parsedDate!.getTime() <= windowEndTime) {
              clusterRecords.push(potentialRecord);
            } else {
              break; 
            }
          }
          
          const uniqueMsisdnsInCluster = new Set(clusterRecords.map(r => r.MSISDN!));
          
          if (uniqueMsisdnsInCluster.size >= minClusterSize) {
            const involvedMsisdns = Array.from(uniqueMsisdnsInCluster).sort();
            const timeBucket = Math.floor(anchorRecord.parsedDate!.getTime() / timeWindowMs);
            const eventKey = `${towerId}-${timeBucket}-${involvedMsisdns.join(',')}`;

            if (!processedEventKeys.has(eventKey)) {
              const clusterTimestamps = clusterRecords.map(r => r.parsedDate!.getTime());
              const avgTimestamp = clusterTimestamps.reduce((sum, t) => sum + t, 0) / clusterTimestamps.length;

              coLocationEvents.push({
                id: eventKey,
                towerId,
                address: clusterRecords[0].ADDRESS || 'N/A',
                approximateTime: new Date(avgTimestamp),
                involvedMsisdns,
                recordCount: clusterRecords.length,
                records: clusterRecords,
              });
              processedEventKeys.add(eventKey);
            }
          }
        }
      });

      setAnalysisResults(coLocationEvents);
      if (coLocationEvents.length === 0) {
        setErrorMsg("No co-location events found matching the criteria.");
      }
    } catch (e) {
      console.error("Analysis Error:", e);
      setErrorMsg("An error occurred during co-location analysis.");
    } finally {
      setIsLoading(false);
    }
  }, [timeWindowSeconds, minClusterSize, allLACRecords]);

  const sortedResults = useMemo(() => {
    return [...analysisResults].sort((a, b) => {
      if (!sortConfig.key) return 0;
      const valA = a[sortConfig.key];
      const valB = b[sortConfig.key];
      let comparison = 0;
      if (valA instanceof Date && valB instanceof Date) {
        comparison = valA.getTime() - valB.getTime();
      } else if (Array.isArray(valA) && Array.isArray(valB)) {
        comparison = valA.length - valB.length;
      } else if (typeof valA === 'number' && typeof valB === 'number') {
        comparison = valA - valB;
      } else if (typeof valA === 'string' && typeof valB === 'string') {
        comparison = valA.localeCompare(valB);
      }
      return sortConfig.direction === 'ascending' ? comparison : -comparison;
    });
  }, [analysisResults, sortConfig]);

  const paginatedResults = useMemo(() => {
    const startIndex = (currentPage - 1) * ROWS_PER_PAGE;
    return sortedResults.slice(startIndex, startIndex + ROWS_PER_PAGE);
  }, [sortedResults, currentPage]);
  const totalPages = Math.ceil(sortedResults.length / ROWS_PER_PAGE);

  const requestSort = (key: keyof CoLocationEvent) => {
    let direction: 'ascending' | 'descending' = 'descending';
    if (sortConfig.key === key && sortConfig.direction === 'descending') direction = 'ascending';
    setSortConfig({ key, direction });
    setCurrentPage(1);
  };
  
  const renderSortIcon = (key: keyof CoLocationEvent) => {
    if (sortConfig.key !== key) return <ListFilter size={14} className="ml-1 opacity-30 group-hover:opacity-100 inline" />;
    return sortConfig.direction === 'ascending' ? <ChevronUp size={14} className="ml-1 text-primary inline" /> : <ChevronDown size={14} className="ml-1 text-primary inline" />;
  };
  
  const sortedModalRecords = useMemo(() => {
    return [...modalRecords].sort((a,b) => {
        const valA = a[modalSortConfig.key!];
        const valB = b[modalSortConfig.key!];
        if (modalSortConfig.key === 'DATE_TIME') {
          return modalSortConfig.direction === 'ascending' ? 
                 (parseDateTime(String(valA))?.getTime() ?? 0) - (parseDateTime(String(valB))?.getTime() ?? 0) :
                 (parseDateTime(String(valB))?.getTime() ?? 0) - (parseDateTime(String(valA))?.getTime() ?? 0);
        }
        if (typeof valA === 'string' && typeof valB === 'string') {
          return modalSortConfig.direction === 'ascending' ? valA.localeCompare(valB) : valB.localeCompare(valA);
        }
        return 0;
    });
  }, [modalRecords, modalSortConfig]);

  const paginatedModalRecords = useMemo(() => {
    const startIndex = (modalCurrentPage - 1) * MODAL_ROWS_PER_PAGE;
    return sortedModalRecords.slice(startIndex, startIndex + MODAL_ROWS_PER_PAGE);
  }, [sortedModalRecords, modalCurrentPage]);
  const totalModalPages = Math.ceil(sortedModalRecords.length / MODAL_ROWS_PER_PAGE);

  const requestModalSort = (key: keyof LACRecord) => {
    let direction: 'ascending' | 'descending' = 'descending';
    if(modalSortConfig.key === key && modalSortConfig.direction === 'descending') direction = 'ascending';
    setModalSortConfig({key, direction});
    setModalCurrentPage(1);
  };

  const renderModalSortIcon = (key: keyof LACRecord) => {
    if (modalSortConfig.key !== key) return <ListFilter size={12} className="ml-1 opacity-30 group-hover:opacity-100 inline" />;
    return modalSortConfig.direction === 'ascending' ? <ChevronUp size={12} className="ml-1 text-primary inline" /> : <ChevronDown size={12} className="ml-1 text-primary inline" />;
  };

  const handleViewDetails = (event: CoLocationEvent) => {
    setModalRecords(event.records);
    setModalTitle(`Records for Event at ${event.towerId}`);
    setIsModalOpen(true);
    setModalCurrentPage(1);
  };
  
  const handleExportData = () => {
    if (sortedResults.length === 0) { alert("No data to export."); return; }
    const headers = ["Tower ID", "Address", "Approximate Time", "Number of MSISDNs", "Involved MSISDNs", "Record Count"];
    const data = sortedResults.map(res => [
      res.towerId,
      res.address || 'N/A',
      formatDate(res.approximateTime.toISOString()),
      String(res.involvedMsisdns.length),
      res.involvedMsisdns.join('; '),
      String(res.recordCount)
    ]);
    downloadCSV(`colocation_events_${new Date().toISOString().split('T')[0]}.csv`, data, headers);
  };

  const mainTableHeaders: { key: keyof CoLocationEvent; label: string; icon?: React.ReactNode }[] = [
    { key: 'towerId', label: 'Tower ID', icon: <TowerControl size={14}/> },
    { key: 'approximateTime', label: 'Time of Event', icon: <Clock size={14}/> },
    { key: 'involvedMsisdns', label: '# Involved MSISDNs', icon: <Users2 size={14}/> },
    { key: 'recordCount', label: '# Records in Event', icon: <ListFilter size={14}/> },
  ];

  const modalTableHeaders: { key: keyof LACRecord; label: string; icon?: React.ReactNode }[] = [
    { key: 'MSISDN', label: 'MSISDN', icon: <SmartphoneNfc size={12}/> },
    { key: 'DATE_TIME', label: 'Timestamp', icon: <Clock size={12}/> },
    { key: 'USAGE_TYPE', label: 'Usage Type', icon: <ListFilter size={12}/> },
    { key: 'IMEI', label: 'IMEI', icon: <SmartphoneNfc size={12}/> },
  ];

  if (contextIsLoading && allLACRecords.length === 0) return <div className="flex justify-center items-center h-64"><Loader2 className="h-12 w-12 animate-spin text-primary" /><p className="ml-3 text-textSecondary">Loading LAC data...</p></div>;
  if (uploadedLACFiles.length === 0 && !contextIsLoading) return <div className="p-6 bg-info-lighter border border-info-light rounded-lg text-center text-info-dark flex flex-col items-center justify-center min-h-[150px] shadow-md"><Info size={28} className="mb-2" /><p className="font-medium">Please upload LAC/Cell data files.</p></div>;

  return (
    <div className="space-y-6">
      <div className="p-4 sm:p-5 bg-surface border border-neutral-light rounded-xl shadow-xl">
        <div className="flex items-center text-xl sm:text-2xl font-semibold text-textPrimary mb-1">
          <Users2 size={22} className="mr-1.5 text-primary" />
          <Clock size={22} className="mr-2.5 text-primary" />
          Co-Location Event Finder
        </div>
        <p className="text-sm text-textSecondary">Find all instances where multiple MSISDNs were present at the same tower within a given time window.</p>
        
        <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
            <div>
                <label htmlFor="timeWindow" className="block text-xs font-medium text-textSecondary mb-1">Time Window (seconds):</label>
                <input type="number" id="timeWindow" value={timeWindowSeconds} onChange={e => setTimeWindowSeconds(Math.max(1, Number(e.target.value)))} min="1" className="w-full p-2.5 border border-neutral-light rounded-lg focus:ring-2 focus:ring-primary-light text-sm shadow-sm"/>
            </div>
             <div>
                <label htmlFor="minClusterSize" className="block text-xs font-medium text-textSecondary mb-1">Minimum MSISDNs in Cluster:</label>
                <input type="number" id="minClusterSize" value={minClusterSize} onChange={e => setMinClusterSize(Math.max(2, Number(e.target.value)))} min="2" className="w-full p-2.5 border border-neutral-light rounded-lg focus:ring-2 focus:ring-primary-light text-sm shadow-sm"/>
            </div>
            <button onClick={handleAnalyze} disabled={isLoading || contextIsLoading} className="w-full px-6 py-2.5 bg-primary text-white rounded-lg hover:bg-primary-dark text-sm font-medium shadow-md hover:shadow-lg transition-all disabled:opacity-70 flex items-center justify-center">
                {isLoading ? <Loader2 className="h-5 w-5 animate-spin mr-2"/> : <Search size={18} className="mr-2"/>}
                Find Co-Location Events
            </button>
        </div>
      </div>
      
      {isLoading && analysisResults.length === 0 && (
          <div className="flex justify-center items-center h-40"><Loader2 className="h-10 w-10 animate-spin text-primary" /><p className="ml-3 text-textSecondary">Analyzing all records...</p></div>
      )}
      {errorMsg && !isLoading && (
           <div className="p-3 bg-warning-lighter border border-warning-light rounded-lg text-sm text-warning-darker flex items-center shadow-md">
             <AlertTriangle size={18} className="mr-2"/> {errorMsg}
           </div>
      )}
      
      {analysisResults.length > 0 && !isLoading && (
        <div className="p-4 sm:p-5 bg-surface border border-neutral-light rounded-xl shadow-xl">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-3">
            <h3 className="text-base sm:text-lg font-semibold text-textPrimary">Found Co-Location Events ({sortedResults.length})</h3>
            <button onClick={handleExportData} className="mt-2 sm:mt-0 px-3 py-1.5 text-xs bg-secondary text-white rounded-lg hover:bg-secondary-dark flex items-center shadow-sm"><Download size={14} className="mr-1.5"/>Export Events</button>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-neutral-light">
              <thead className="bg-neutral-lightest sticky top-0 z-10">
                <tr>{mainTableHeaders.map(h => <th key={String(h.key)} onClick={() => requestSort(h.key)} className="group px-3 py-2.5 text-left text-xs font-semibold text-textPrimary uppercase tracking-wider cursor-pointer hover:bg-neutral-lighter transition-colors whitespace-nowrap"><div className="flex items-center">{h.icon && <span className="mr-1.5 text-neutral-DEFAULT group-hover:text-primary">{h.icon}</span>}{h.label} {renderSortIcon(h.key)}</div></th>)}
                  <th className="px-3 py-2.5 text-left text-xs font-semibold text-textPrimary uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-surface divide-y divide-neutral-light">
                {paginatedResults.map((event, idx) => (
                  <React.Fragment key={event.id}>
                    <tr className={`transition-colors cursor-pointer ${'bg-surface'} hover:bg-primary-lighter/20`} onClick={() => handleViewDetails(event)}>
                      <td className="px-3 py-2.5 whitespace-nowrap text-xs text-textPrimary font-medium">{event.towerId}</td>
                      <td className="px-3 py-2.5 whitespace-nowrap text-xs text-textSecondary">{formatDate(event.approximateTime.toISOString())}</td>
                      <td className="px-3 py-2.5 text-xs text-textSecondary truncate max-w-xs" title={event.involvedMsisdns.join(', ')}>
                        {event.involvedMsisdns.length} ({event.involvedMsisdns.slice(0,3).join(', ')}{event.involvedMsisdns.length > 3 ? '...' : ''})
                    </td>
                      <td className="px-3 py-2.5 whitespace-nowrap text-xs text-textSecondary text-center">{event.recordCount}</td>
                      <td className="px-3 py-2.5 whitespace-nowrap text-xs"><button onClick={() => handleViewDetails(event)} className="text-primary hover:underline flex items-center"><Eye size={14} className="mr-1"/>Details</button></td>
                    </tr>
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
          {totalPages > 1 && ( <div className="flex flex-col sm:flex-row justify-between items-center mt-3 py-2 text-xs"> <span className="text-textSecondary mb-1 sm:mb-0">Page {currentPage} of {totalPages}</span> <div className="flex gap-1.5"> <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1} className="px-2.5 py-1 font-medium bg-surface border rounded-md shadow-sm hover:bg-neutral-lighter disabled:opacity-50">Prev</button> <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages} className="px-2.5 py-1 font-medium bg-surface border rounded-md shadow-sm hover:bg-neutral-lighter disabled:opacity-50">Next</button> </div> </div> )}
        </div>
      )}
      
      {isModalOpen && (
        <div className="fixed inset-0 bg-neutral-darkest/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setIsModalOpen(false)}>
          <div className="bg-surface rounded-xl shadow-2xl w-full max-w-2xl max-h-[80vh] p-5 sm:p-6 border border-neutral-light flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-3 pb-2 border-b border-neutral-light">
              <h3 className="text-md font-semibold text-textPrimary truncate" title={modalTitle}>{modalTitle}</h3>
              <button onClick={() => setIsModalOpen(false)} className="text-neutral-DEFAULT hover:text-danger-dark p-1 rounded-full hover:bg-danger-lighter/50"><X size={20}/></button>
            </div>
            <div className="flex-grow overflow-y-auto scrollbar-thin pr-1">
              <table className="min-w-full divide-y divide-neutral-light text-[11px]">
                <thead className="bg-neutral-lightest sticky top-0 z-10">
                    <tr>{modalTableHeaders.map(h => <th key={String(h.key)} onClick={() => requestModalSort(h.key as keyof LACRecord)} className="group px-2 py-1.5 text-left font-semibold text-textPrimary uppercase tracking-wider cursor-pointer hover:bg-neutral-light"><div className="flex items-center">{h.icon && <span className="mr-1 text-neutral-DEFAULT group-hover:text-primary">{h.icon}</span>}{h.label}{renderModalSortIcon(h.key as keyof LACRecord)}</div></th>)}</tr>
                </thead>
                <tbody className="bg-surface divide-y divide-neutral-light">
                  {paginatedModalRecords.map((rec, idx) => (
                    <tr key={rec.id + idx} className="hover:bg-neutral-lightest/50">
                       {modalTableHeaders.map(header => {
                        let displayVal = String(rec[header.key as keyof LACRecord] ?? 'N/A');
                        if (header.key === 'DATE_TIME' && rec.DATE_TIME) displayVal = formatDate(rec.DATE_TIME);
                        return <td key={String(header.key)} className="px-2 py-1 whitespace-nowrap text-textSecondary truncate max-w-[120px]" title={displayVal}>{displayVal}</td>
                    })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
             {totalModalPages > 1 && (
              <div className="flex flex-col sm:flex-row justify-between items-center mt-2 pt-2 border-t border-neutral-light text-[10px]">
                <span className="text-textSecondary mb-1 sm:mb-0">Page {modalCurrentPage} of {totalModalPages} ({modalRecords.length} records)</span>
                <div className="flex gap-1">
                  <button onClick={() => setModalCurrentPage(p => Math.max(1, p - 1))} disabled={modalCurrentPage === 1} className="px-2 py-0.5 font-medium bg-surface border rounded-md shadow-sm hover:bg-neutral-lighter disabled:opacity-50">Prev</button>
                  <button onClick={() => setModalCurrentPage(p => Math.min(totalModalPages, p + 1))} disabled={modalCurrentPage === totalModalPages} className="px-2 py-0.5 font-medium bg-surface border rounded-md shadow-sm hover:bg-neutral-lighter disabled:opacity-50">Next</button>
                </div>
              </div>
            )}
            <button onClick={() => setIsModalOpen(false)} className="mt-4 px-4 py-2 bg-primary text-white text-sm rounded-lg hover:bg-primary-dark self-end shadow-md">Close</button>
          </div>
        </div>
      )}
    </div>
  );
};

export default LACSameTimeSameTowerView;

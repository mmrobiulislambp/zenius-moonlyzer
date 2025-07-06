
import React, { useState, useMemo, useCallback } from 'react';
import { Smartphone, Repeat, ListFilter, Download, ChevronUp, ChevronDown, AlertTriangle, Info, Loader2, User, Clock, TowerControl, FileText } from 'lucide-react';
import { useLACContext } from '../contexts/LACContext';
import { LACRecord } from '../types';
import { formatDate, parseDateTime } from '../utils/cdrUtils';
import { downloadCSV } from '../utils/downloadUtils';

const ROWS_PER_PAGE = 10;

interface ImeiChangeEntry {
  msisdn: string;
  previousImei: string;
  newImei: string;
  changeTimestamp: Date;
  firstSeenWithOldImei?: Date;
  lastSeenWithOldImei?: Date;
  lacCellIdAtChange: string;
  sourceFileName: string;
  originalRecordId: string; // To ensure unique key for rows
}

const LACImeiChangeDetectView: React.FC = () => {
  const { allLACRecords, isLoading: contextIsLoading, uploadedLACFiles } = useLACContext();
  
  const [imeiChangeData, setImeiChangeData] = useState<ImeiChangeEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  
  const [currentPage, setCurrentPage] = useState(1);
  const [sortConfig, setSortConfig] = useState<{ key: keyof ImeiChangeEntry; direction: 'ascending' | 'descending' }>({ key: 'changeTimestamp', direction: 'descending' });

  useMemo(() => {
    if (allLACRecords.length === 0 && !contextIsLoading) {
      setImeiChangeData([]);
      return;
    }
    setIsLoading(true);
    const changes: ImeiChangeEntry[] = [];
    const msisdnMap = new Map<string, LACRecord[]>();

    // Group records by MSISDN
    allLACRecords.forEach(record => {
      if (record.MSISDN && record.MSISDN.trim() !== '') {
        const msisdnRecords = msisdnMap.get(record.MSISDN) || [];
        msisdnRecords.push(record);
        msisdnMap.set(record.MSISDN, msisdnRecords);
      }
    });

    msisdnMap.forEach((records, msisdn) => {
      const sortedRecords = records
        .filter(r => r.DATE_TIME)
        .sort((a, b) => (parseDateTime(a.DATE_TIME)?.getTime() || 0) - (parseDateTime(b.DATE_TIME)?.getTime() || 0));

      let currentImei: string | undefined = undefined;
      let firstSeenWithCurrentImei: Date | undefined = undefined;
      let lastSeenWithCurrentImei: Date | undefined = undefined;

      for (const record of sortedRecords) {
        const recordImei = record.IMEI?.trim();
        const recordTimestamp = parseDateTime(record.DATE_TIME);

        if (!recordImei || recordImei.toLowerCase() === 'n/a' || !recordTimestamp) {
          continue; // Skip records with invalid IMEI or timestamp
        }

        if (currentImei === undefined) {
          // First valid IMEI for this MSISDN
          currentImei = recordImei;
          firstSeenWithCurrentImei = recordTimestamp;
          lastSeenWithCurrentImei = recordTimestamp;
        } else if (recordImei !== currentImei) {
          // IMEI has changed
          changes.push({
            msisdn,
            previousImei: currentImei,
            newImei: recordImei,
            changeTimestamp: recordTimestamp,
            firstSeenWithOldImei: firstSeenWithCurrentImei,
            lastSeenWithOldImei: lastSeenWithCurrentImei, // Timestamp of the last record with the previous IMEI
            lacCellIdAtChange: `${record.LAC}-${record.CELL_ID}`,
            sourceFileName: record.fileName,
            originalRecordId: record.id,
          });
          // Update to the new IMEI
          currentImei = recordImei;
          firstSeenWithCurrentImei = recordTimestamp;
          lastSeenWithCurrentImei = recordTimestamp;
        } else {
            // IMEI is the same, update lastSeen
            lastSeenWithCurrentImei = recordTimestamp;
        }
      }
    });

    setImeiChangeData(changes);
    setIsLoading(false);
  }, [allLACRecords, contextIsLoading]);

  const sortedResults = useMemo(() => {
    return [...imeiChangeData].sort((a, b) => {
      const valA = a[sortConfig.key];
      const valB = b[sortConfig.key];
      let comparison = 0;
      if (valA instanceof Date && valB instanceof Date) {
        comparison = valA.getTime() - valB.getTime();
      } else if (typeof valA === 'number' && typeof valB === 'number') {
        comparison = valA - valB;
      } else if (typeof valA === 'string' && typeof valB === 'string') {
        comparison = valA.localeCompare(valB);
      }
      return sortConfig.direction === 'ascending' ? comparison : -comparison;
    });
  }, [imeiChangeData, sortConfig]);

  const paginatedResults = useMemo(() => {
    const startIndex = (currentPage - 1) * ROWS_PER_PAGE;
    return sortedResults.slice(startIndex, startIndex + ROWS_PER_PAGE);
  }, [sortedResults, currentPage]);
  const totalPages = Math.ceil(sortedResults.length / ROWS_PER_PAGE);

  const requestSort = (key: keyof ImeiChangeEntry) => {
    let direction: 'ascending' | 'descending' = 'descending';
    if (sortConfig.key === key && sortConfig.direction === 'descending') direction = 'ascending';
    setSortConfig({ key, direction });
    setCurrentPage(1);
  };
  
  const renderSortIcon = (key: keyof ImeiChangeEntry) => {
    if (sortConfig.key !== key) return <ListFilter size={14} className="ml-1 opacity-30 group-hover:opacity-100 inline" />;
    return sortConfig.direction === 'ascending' ? <ChevronUp size={14} className="ml-1 text-primary inline" /> : <ChevronDown size={14} className="ml-1 text-primary inline" />;
  };

  const handleExportData = () => {
    if (sortedResults.length === 0) { alert("No data to export."); return; }
    const headers = ["MSISDN", "Previous IMEI", "New IMEI", "Change Timestamp", "First Seen (Old IMEI)", "Last Seen (Old IMEI)", "LAC-Cell ID at Change", "Source File"];
    const data = sortedResults.map(item => [
      item.msisdn,
      item.previousImei,
      item.newImei,
      formatDate(item.changeTimestamp.toISOString()),
      item.firstSeenWithOldImei ? formatDate(item.firstSeenWithOldImei.toISOString()) : 'N/A',
      item.lastSeenWithOldImei ? formatDate(item.lastSeenWithOldImei.toISOString()) : 'N/A',
      item.lacCellIdAtChange,
      item.sourceFileName,
    ]);
    downloadCSV(`imei_change_detection_report_${new Date().toISOString().split('T')[0]}.csv`, data, headers);
  };
  
  const tableHeaders: { key: keyof ImeiChangeEntry; label: string; icon?: React.ReactNode }[] = [
    { key: 'msisdn', label: 'MSISDN', icon: <User size={14}/> },
    { key: 'previousImei', label: 'Previous IMEI', icon: <Smartphone size={14}/> },
    { key: 'newImei', label: 'New IMEI', icon: <Smartphone size={14}/> },
    { key: 'changeTimestamp', label: 'Change Timestamp', icon: <Clock size={14}/> },
    { key: 'firstSeenWithOldImei', label: 'First Seen (Old IMEI)', icon: <Clock size={14}/> },
    { key: 'lastSeenWithOldImei', label: 'Last Seen (Old IMEI)', icon: <Clock size={14}/> },
    { key: 'lacCellIdAtChange', label: 'LAC-Cell at Change', icon: <TowerControl size={14}/> },
    { key: 'sourceFileName', label: 'Source File', icon: <FileText size={14}/> },
  ];

  if (contextIsLoading && allLACRecords.length === 0) return <div className="flex justify-center items-center h-64"><Loader2 className="h-12 w-12 animate-spin text-primary" /><p className="ml-3 text-textSecondary">Loading LAC data...</p></div>;
  if (uploadedLACFiles.length === 0 && !contextIsLoading) return <div className="p-6 bg-info-lighter border border-info-light rounded-lg text-center text-info-dark flex flex-col items-center justify-center min-h-[150px] shadow-md"><Info size={28} className="mb-2" /><p className="font-medium">Please upload LAC/Cell data files.</p></div>;
  if (isLoading && imeiChangeData.length === 0) return <div className="flex justify-center items-center h-64"><Loader2 className="h-12 w-12 animate-spin text-primary" /><p className="ml-3 text-textSecondary">Analyzing IMEI changes...</p></div>;

  if (imeiChangeData.length === 0 && !isLoading) return (
    <div className="p-6 bg-neutral-lightest border border-neutral-light rounded-lg text-center text-textSecondary flex flex-col items-center justify-center min-h-[150px] shadow-md">
      <Info size={28} className="mb-2 text-neutral-DEFAULT" />
      <p>No IMEI changes detected in the current dataset.</p>
      <p className="text-xs mt-1">This means no MSISDN was found associated with different valid IMEIs over time.</p>
    </div>
  );
  
  return (
    <div className="space-y-6">
      <div className="p-4 sm:p-5 bg-surface border border-neutral-light rounded-xl shadow-xl">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center">
            <div>
                <div className="flex items-center text-xl sm:text-2xl font-semibold text-textPrimary mb-1">
                    <Smartphone size={20} className="mr-1 text-primary" />
                    <Repeat size={20} className="mr-2.5 text-primary" />
                    IMEI Change Detector
                </div>
                <p className="text-sm text-textSecondary">MSISDNs associated with different IMEIs over time. Ensure LAC data includes MSISDN and IMEI.</p>
            </div>
            {sortedResults.length > 0 && (
                <button onClick={handleExportData} className="mt-3 sm:mt-0 px-3.5 py-2 text-xs sm:text-sm bg-secondary text-white rounded-lg hover:bg-secondary-dark focus:outline-none focus:ring-2 focus:ring-secondary-light focus:ring-offset-1 flex items-center shadow-md hover:shadow-lg transition-all"> <Download size={15} className="mr-1.5" /> Export Changes </button>
            )}
        </div>
      </div>

      <div className="bg-surface shadow-xl rounded-xl border border-neutral-light overflow-x-auto">
        <table className="min-w-full divide-y divide-neutral-light">
          <thead className="bg-neutral-lightest sticky top-0">
            <tr>{tableHeaders.map(h => <th key={h.key as string} onClick={() => requestSort(h.key)} className="group px-3 py-3 text-left text-xs font-semibold text-textPrimary uppercase tracking-wider cursor-pointer hover:bg-neutral-lighter"><div className="flex items-center">{h.icon && <span className="mr-1.5 text-neutral-DEFAULT group-hover:text-primary">{h.icon}</span>}{h.label}{renderSortIcon(h.key)}</div></th>)}</tr>
          </thead>
          <tbody className="bg-surface divide-y divide-neutral-light">
            {paginatedResults.map((item, idx) => (
              <tr key={item.originalRecordId} className="hover:bg-neutral-lightest/50">
                <td className="px-3 py-2 whitespace-nowrap text-xs text-textPrimary font-medium">{item.msisdn}</td>
                <td className="px-3 py-2 whitespace-nowrap text-xs text-textSecondary">{item.previousImei}</td>
                <td className="px-3 py-2 whitespace-nowrap text-xs text-textSecondary">{item.newImei}</td>
                <td className="px-3 py-2 whitespace-nowrap text-xs text-textSecondary">{formatDate(item.changeTimestamp.toISOString())}</td>
                <td className="px-3 py-2 whitespace-nowrap text-xs text-textSecondary">{item.firstSeenWithOldImei ? formatDate(item.firstSeenWithOldImei.toISOString()) : 'N/A'}</td>
                <td className="px-3 py-2 whitespace-nowrap text-xs text-textSecondary">{item.lastSeenWithOldImei ? formatDate(item.lastSeenWithOldImei.toISOString()) : 'N/A'}</td>
                <td className="px-3 py-2 whitespace-nowrap text-xs text-textSecondary">{item.lacCellIdAtChange}</td>
                <td className="px-3 py-2 whitespace-nowrap text-xs text-textSecondary truncate max-w-[150px]" title={item.sourceFileName}>{item.sourceFileName}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {totalPages > 1 && (
        <div className="flex flex-col sm:flex-row justify-between items-center mt-4 py-3 px-1">
          <span className="text-sm text-textSecondary mb-2 sm:mb-0">Page {currentPage} of {totalPages} (Total: {sortedResults.length} changes)</span>
          <div className="flex gap-2">
            <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1} className="px-3 py-1.5 text-xs font-medium text-textPrimary bg-surface border border-neutral-light rounded-lg shadow-sm hover:bg-neutral-lighter disabled:opacity-50">Previous</button>
            <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages} className="px-3 py-1.5 text-xs font-medium text-textPrimary bg-surface border border-neutral-light rounded-lg shadow-sm hover:bg-neutral-lighter disabled:opacity-50">Next</button>
          </div>
        </div>
      )}
    </div>
  );
};

export default LACImeiChangeDetectView;

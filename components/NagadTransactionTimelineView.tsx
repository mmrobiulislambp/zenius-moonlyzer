
import React, { useState, useMemo, useEffect } from 'react';
import { ChevronDown, ChevronUp, Download, Info, ListChecks, CalendarDays, DollarSign, Layers, Activity, User, Users, Send, MessageSquare, CheckCircle, XCircle, AlertTriangle, ListFilter } from 'lucide-react';
import { useNagadContext } from '../contexts/NagadContext';
import { NagadRecord, NagadFilterState, UploadedNagadFile, NagadSortConfig } from '../types';
import { formatDate, parseDateTime } from '../utils/cdrUtils';
import { downloadCSV } from '../utils/downloadUtils';
import NagadFilterControls from './NagadFilterControls';
import { HEADERS_FROM_OCR, getCanonicalKeyFromRawHeader as getNagadCanonicalKey } from '../utils/nagadParser';

const ROWS_PER_PAGE = 20;

// Mapping from display headers (what user sees) to canonical NagadRecord field names
const ocrHeaderToNagadRecordFieldMap: Record<string, keyof NagadRecord> = {
  'SI.': 'si',
  'TXN_DATE_TIME': 'TXN_DATE_TIME',
  'TXN ID': 'TXN_ID',
  'TXN TYPE': 'TXN_TYPE',
  'STATEMENT_FOR_ACC': 'STATEMENT_FOR_ACC',
  'TXN_WITH_ACC': 'TXN_WITH_ACC',
  'CHANNEL': 'CHANNEL',
  'REFERENCE': 'REFERENCE',
  'TXN_TYPE_DR_CR': 'TXN_TYPE_DR_CR',
  'TXN_AMT': 'TXN_AMT',
  'AVAILABLE_BLC_AFTER_TXN': 'AVAILABLE_BLC_AFTER_TXN',
  'STATUS': 'STATUS',
  // Canonical keys (if headers are already like this) for flexibility
  'si': 'si',
  'TXN_ID': 'TXN_ID',
  'fileName': 'fileName',
};


const NagadTransactionTimelineView: React.FC = () => {
  const { 
    filteredNagadRecords, 
    isLoading, 
    error, 
    uploadedNagadFiles,
    nagadFilterState, 
  } = useNagadContext();
  
  const [currentPage, setCurrentPage] = useState(1);
  const [sortConfig, setSortConfig] = useState<NagadSortConfig>({ key: 'TXN_DATE_TIME', direction: 'descending' });
  const [showFilters, setShowFilters] = useState(false); 

  const activeFile = useMemo(() => {
    if (nagadFilterState.selectedFileIds.length === 1) {
      return uploadedNagadFiles.find(f => f.id === nagadFilterState.selectedFileIds[0]);
    }
    return null;
  }, [uploadedNagadFiles, nagadFilterState.selectedFileIds]);

  const uniqueFileHeadersForDisplay = useMemo(() => {
    const desiredDisplayHeaders: string[] = [
      'TXN_DATE_TIME', 'TXN_ID', 'TXN TYPE', 'STATEMENT_FOR_ACC', 
      'TXN_WITH_ACC', 'CHANNEL', 'TXN_TYPE_DR_CR', 'TXN_AMT', 
      'AVAILABLE_BLC_AFTER_TXN', 'STATUS', 'REFERENCE', 'SI.', 'fileName'
    ];
    
    const headerSet = new Set<string>();
    let filesToConsiderHeadersFrom = uploadedNagadFiles;
    if (nagadFilterState.selectedFileIds.length > 0) {
        filesToConsiderHeadersFrom = uploadedNagadFiles.filter(f => nagadFilterState.selectedFileIds.includes(f.id));
    }
    
    if (filesToConsiderHeadersFrom.length === 1 && filesToConsiderHeadersFrom[0].headers && filesToConsiderHeadersFrom[0].headers.length > 0) {
        filesToConsiderHeadersFrom[0].headers.forEach(h => headerSet.add(h));
    } else if (filesToConsiderHeadersFrom.length > 1) {
        filesToConsiderHeadersFrom.forEach(file => (file.headers || HEADERS_FROM_OCR).forEach(h => headerSet.add(h)));
    } else if (uploadedNagadFiles.length > 0 && uploadedNagadFiles[0].headers && uploadedNagadFiles[0].headers.length > 0) {
        uploadedNagadFiles[0].headers.forEach(h => headerSet.add(h));
    } else { 
        desiredDisplayHeaders.forEach(dh => headerSet.add(dh));
    }
    
    const finalHeaders = Array.from(headerSet);
    
    return finalHeaders.sort((a,b) => {
        const normA = getNagadCanonicalKey(a) || a;
        const normB = getNagadCanonicalKey(b) || b;
        const idxA = desiredDisplayHeaders.findIndex(h => (getNagadCanonicalKey(h) || h) === normA);
        const idxB = desiredDisplayHeaders.findIndex(h => (getNagadCanonicalKey(h) || h) === normB);

        if (idxA !== -1 && idxB !== -1) return idxA - idxB;
        if (idxA !== -1) return -1;
        if (idxB !== -1) return 1;
        return a.localeCompare(b);
    });
  }, [uploadedNagadFiles, nagadFilterState.selectedFileIds]);

  const sortedRecords = useMemo(() => {
    let sortableItems = [...filteredNagadRecords]; 
    if (sortConfig.key !== null) {
      sortableItems.sort((a, b) => {
        const keyForSort = sortConfig.key as keyof NagadRecord; 
        
        let valA = a[keyForSort];
        let valB = b[keyForSort];

        if (keyForSort === 'TXN_DATE_TIME') {
          valA = parseDateTime(String(valA))?.getTime() ?? 0;
          valB = parseDateTime(String(valB))?.getTime() ?? 0;
        } else if (keyForSort === 'TXN_AMT' || keyForSort === 'AVAILABLE_BLC_AFTER_TXN' || keyForSort === 'si') {
            valA = Number(String(valA).replace(/৳|,|tk\.?/gi, '').trim() || 0);
            valB = Number(String(valB).replace(/৳|,|tk\.?/gi, '').trim() || 0);
        } else if (typeof valA === 'string' && typeof valB === 'string') {
          valA = valA.toLowerCase();
          valB = valB.toLowerCase();
        } else if (valA === undefined || valA === null) {
          valA = sortConfig.direction === 'ascending' ? Infinity : -Infinity;
        } else if (valB === undefined || valB === null) {
          valB = sortConfig.direction === 'ascending' ? Infinity : -Infinity;
        }

        if (valA < valB) return sortConfig.direction === 'ascending' ? -1 : 1;
        if (valA > valB) return sortConfig.direction === 'ascending' ? 1 : -1;
        return 0;
      });
    }
    return sortableItems;
  }, [filteredNagadRecords, sortConfig]);

  const currentTableData = useMemo(() => {
    const firstPageIndex = (currentPage - 1) * ROWS_PER_PAGE;
    const lastPageIndex = firstPageIndex + ROWS_PER_PAGE;
    return sortedRecords.slice(firstPageIndex, lastPageIndex);
  }, [currentPage, sortedRecords]);

  const totalPages = Math.ceil(sortedRecords.length / ROWS_PER_PAGE);

  const requestSort = (headerKeyDisplay: string) => {
    const canonicalKeyToSortBy = getNagadCanonicalKey(headerKeyDisplay) || headerKeyDisplay;
    let direction: 'ascending' | 'descending' = 'ascending';
    if (sortConfig.key === canonicalKeyToSortBy && sortConfig.direction === 'ascending') {
      direction = 'descending';
    }
    setSortConfig({ key: canonicalKeyToSortBy, direction });
    setCurrentPage(1);
  };

  const renderSortIcon = (headerKeyDisplay: string) => {
    const canonicalKeyForSort = getNagadCanonicalKey(headerKeyDisplay) || headerKeyDisplay;
    if (sortConfig.key !== canonicalKeyForSort) {
      return <ChevronDown className="h-4 w-4 text-neutral-DEFAULT opacity-30 group-hover:opacity-100 transition-opacity" />;
    }
    return sortConfig.direction === 'ascending' ? <ChevronUp className="h-4 w-4 text-primary-dark" /> : <ChevronDown className="h-4 w-4 text-primary-dark" />;
  };
  
  const handleExportData = () => {
    if (sortedRecords.length === 0) { alert("No data to export."); return; }
    const headersToExport = [...uniqueFileHeadersForDisplay]; 
    if (nagadFilterState.selectedFileIds.length === 0 || nagadFilterState.selectedFileIds.length > 1) {
        headersToExport.push("Source File Name");
    }
    
    const dataToExport = sortedRecords.map(record => {
      const row = uniqueFileHeadersForDisplay.map(headerKeyDisplay => {
          const canonicalKey = getNagadCanonicalKey(headerKeyDisplay) || headerKeyDisplay;
          const value = record[canonicalKey as keyof NagadRecord];

          if (canonicalKey === 'TXN_DATE_TIME') return formatDate(String(value));
          if (canonicalKey === 'TXN_AMT' || canonicalKey === 'AVAILABLE_BLC_AFTER_TXN') {
            if (typeof value === 'number' && !isNaN(value)) {
               return value.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2});
            }
            return 'N/A';
          }
          return value ?? 'N/A';
      });
      if (nagadFilterState.selectedFileIds.length === 0 || nagadFilterState.selectedFileIds.length > 1) {
        row.push(record.fileName);
      }
      return row;
    });
    const currentActiveFile = uploadedNagadFiles.find(f => nagadFilterState.selectedFileIds.includes(f.id) && nagadFilterState.selectedFileIds.length === 1);
    const baseFilename = currentActiveFile ? currentActiveFile.sourceName.replace(/[^a-z0-9]/gi, '_').toLowerCase() : "nagad_timeline_export";
    downloadCSV(`${baseFilename}.csv`, dataToExport, headersToExport);
  };

  if (isLoading && filteredNagadRecords.length === 0 && uploadedNagadFiles.length > 0) {
    return <div className="flex justify-center items-center h-64"><div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary-dark"></div><p className="ml-3 text-textSecondary">Loading Nagad timeline...</p></div>;
  }
  if (error) return <div className="p-4 bg-danger-lighter text-danger-darker rounded-lg text-center border border-danger-light">{error}</div>;
  
  const noFilesSelectedForDisplay = uploadedNagadFiles.length > 0 && nagadFilterState.selectedFileIds.length === 0;

  if (uploadedNagadFiles.length === 0 && !isLoading) {
    return (
       <div className="p-6 bg-info-lighter border border-info-light rounded-lg text-center text-info-dark flex flex-col items-center justify-center min-h-[200px] shadow-md">
          <Info size={28} className="mb-2" />
          <p className="font-medium">No Nagad statement files uploaded yet. Please upload files in the 'Nagad Data Grid' tab.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row justify-between items-center gap-4 mb-4">
        <h3 className="text-xl font-semibold text-textPrimary flex items-center">
            <ListChecks size={24} className="mr-2 text-primary"/> Nagad Transaction Timeline ({sortedRecords.length})
        </h3>
        <div className="flex gap-2.5">
            {sortedRecords.length > 0 && (
              <button onClick={handleExportData} className="flex items-center px-4 py-2 bg-secondary text-white rounded-lg hover:bg-secondary-dark focus:outline-none focus:ring-2 focus:ring-secondary-light focus:ring-offset-1 transition-colors shadow-md text-sm" title="Export current table data to CSV">
                <Download size={16} className="mr-1.5" /> Export Timeline
              </button>
            )}
            <button onClick={() => setShowFilters(!showFilters)} className="flex items-center px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-dark focus:outline-none focus:ring-2 focus:ring-primary-light focus:ring-offset-1 transition-colors shadow-md text-sm">
                <ListFilter size={16} className="mr-1.5" /> {showFilters ? 'Hide Filters' : 'Show Filters'}
            </button>
        </div>
      </div>

      {showFilters && <NagadFilterControls />}

      {noFilesSelectedForDisplay && (
         <div className="p-4 bg-warning-lighter border border-warning-light rounded-lg text-warning-darker flex items-center shadow-md">
            <AlertTriangle size={20} className="mr-2.5"/> Please select Nagad files in 'Filter Controls' to view their timeline.
        </div>
      )}
      
      {filteredNagadRecords.length === 0 && uploadedNagadFiles.length > 0 && nagadFilterState.selectedFileIds.length > 0 && !isLoading && (
        <div className="p-6 bg-neutral-lightest border border-neutral-light rounded-lg text-center text-textSecondary mt-4 min-h-[100px] flex items-center justify-center">
            No Nagad transactions match the current filters for the selected file(s).
        </div>
      )}

      {currentTableData.length > 0 && (
        <>
          <div className="overflow-x-auto bg-surface shadow-xl rounded-xl border border-neutral-light">
            <table className="min-w-full divide-y divide-neutral-light">
              <thead className="bg-neutral-lightest sticky top-0 z-10">
                <tr>
                  {uniqueFileHeadersForDisplay.map((headerKeyDisplay) => (
                    <th
                      key={headerKeyDisplay}
                      scope="col"
                      onClick={() => requestSort(headerKeyDisplay)} 
                      className="group px-3.5 py-3 text-left text-xs font-semibold text-textPrimary uppercase tracking-wider cursor-pointer hover:bg-neutral-lighter transition-colors whitespace-nowrap"
                    >
                      <div className="flex items-center justify-between">
                        {headerKeyDisplay.replace(/_/g, ' ').replace(/\b(txn|acc|blc|si)\b/gi, match => match.toUpperCase())}
                        {renderSortIcon(headerKeyDisplay)}
                      </div>
                    </th>
                  ))}
                  {(nagadFilterState.selectedFileIds.length === 0 || nagadFilterState.selectedFileIds.length > 1) && uniqueFileHeadersForDisplay.length > 0 && (
                     <th scope="col" className="px-3.5 py-3 text-left text-xs font-semibold text-textPrimary uppercase tracking-wider whitespace-nowrap">Source File Name</th>
                  )}
                </tr>
              </thead>
              <tbody className="bg-surface divide-y divide-neutral-light">
                {currentTableData.map((record, index) => (
                  <tr key={record.id} className={`transition-colors ${index % 2 === 0 ? 'bg-surface' : 'bg-neutral-lightest/60'} hover:bg-primary-lighter/20`}>
                    {uniqueFileHeadersForDisplay.map(headerKeyDisplay => {
                      const canonicalKey = getNagadCanonicalKey(headerKeyDisplay) || headerKeyDisplay;
                      const value = record[canonicalKey as keyof NagadRecord];
                      let displayValue: React.ReactNode = 'N/A';
                       let cellClass = "px-3.5 py-2.5 whitespace-nowrap text-xs text-textSecondary max-w-[180px] truncate";

                      if (value !== undefined && value !== null) {
                            if (String(value).trim() === "") { 
                                displayValue = 'N/A';
                            } else if (canonicalKey === 'TXN_DATE_TIME') {
                                displayValue = formatDate(String(value));
                            } else if (canonicalKey === 'TXN_AMT' || canonicalKey === 'AVAILABLE_BLC_AFTER_TXN') {
                                const numValue = Number(String(value).replace(/৳|,|tk\.?/gi, '').trim());
                                if (!isNaN(numValue)) {
                                    displayValue = numValue.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2});
                                    cellClass += (record.TXN_TYPE_DR_CR === 'CREDIT' && canonicalKey === 'TXN_AMT') ? " text-success-dark" : (record.TXN_TYPE_DR_CR === 'DEBIT' && canonicalKey === 'TXN_AMT') ? " text-danger-dark" : "";
                                }
                            } else if (canonicalKey === 'TXN_TYPE_DR_CR') {
                                displayValue = <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${value === 'CREDIT' ? 'bg-success-lighter text-success-darker' : (value === 'DEBIT' ? 'bg-danger-lighter text-danger-darker' : 'bg-neutral-light text-neutral-darker')}`}>{String(value)}</span>;
                            }
                             else {
                                displayValue = String(value);
                            }
                        }

                      return (
                        <td key={`${record.id}-${headerKeyDisplay}`} className={cellClass} title={String(value ?? '')}>
                          {displayValue}
                        </td>
                      );
                    })}
                     {(nagadFilterState.selectedFileIds.length === 0 || nagadFilterState.selectedFileIds.length > 1) && uniqueFileHeadersForDisplay.length > 0 && (
                        <td className="px-3.5 py-2.5 whitespace-nowrap text-xs text-textSecondary truncate max-w-[150px]" title={record.fileName}>{record.fileName}</td>
                     )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="flex flex-col sm:flex-row justify-between items-center mt-4 py-3 px-1">
              <span className="text-sm text-textSecondary mb-2 sm:mb-0">Page {currentPage} of {totalPages} (Total: {sortedRecords.length} records)</span>
              <div className="flex gap-2">
                <button onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))} disabled={currentPage === 1} className="px-4 py-2 text-sm font-medium text-textPrimary bg-surface border border-neutral-light rounded-lg shadow-sm hover:bg-neutral-lighter disabled:opacity-50">Previous</button>
                <button onClick={() => setCurrentPage((prev) => Math.min(prev + 1, totalPages))} disabled={currentPage === totalPages} className="px-4 py-2 text-sm font-medium text-textPrimary bg-surface border border-neutral-light rounded-lg shadow-sm hover:bg-neutral-lighter disabled:opacity-50">Next</button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default NagadTransactionTimelineView;

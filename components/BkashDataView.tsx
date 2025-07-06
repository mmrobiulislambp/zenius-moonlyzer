import React, { useState, useMemo, useEffect } from 'react';
import { ChevronDown, ChevronUp, FileText as FileIcon, Download, Info, AlertTriangle, Layers, ListFilter as ListFilterIcon, Pocket } from 'lucide-react';
import { useBkashContext } from '../contexts/BkashContext';
import { BkashRecord, UploadedBkashFile, BkashSortConfig } from '../types';
import { formatDate, parseDateTime } from '../utils/cdrUtils';
import { downloadCSV } from '../utils/downloadUtils';
import BkashFilterControls from './BkashFilterControls';
import { Tab as FileTab, Tabs as FileTabs } from './Tabs';
import { getBkashCanonicalKey } from '../utils/bkashParser';

const ROWS_PER_PAGE = 20;

const EXPECTED_BKASH_DISPLAY_HEADERS: string[] = [
  'sl', 'trxId', 'transactionDate', 'trxType', 'sender', 'receiver', 'receiverName', 'reference', 'transactedAmount', 'fee', 'balance', 'transactionDirection', 'fileName'
];


const BkashDataView: React.FC = () => {
  const { 
    filteredBkashRecords, 
    isLoading, 
    error, 
    uploadedBkashFiles,
    bkashFilterState,
    activeFileTabId,      
    setActiveFileTabId    
  } = useBkashContext();
  
  const [currentPage, setCurrentPage] = useState(1);
  const [sortConfig, setSortConfig] = useState<BkashSortConfig>({ key: 'transactionDate', direction: 'descending' });
  const [showFilters, setShowFilters] = useState(false);
  
  const filesForTabs = useMemo(() => {
    return uploadedBkashFiles.filter(f => bkashFilterState.selectedFileIds.includes(f.id));
  }, [uploadedBkashFiles, bkashFilterState.selectedFileIds]);

  useEffect(() => {
    if (filesForTabs.length > 0) {
      const currentActiveFileIsValid = filesForTabs.some(f => f.id === activeFileTabId);
      if (!activeFileTabId || !currentActiveFileIsValid) {
        setActiveFileTabId(filesForTabs[0].id);
      }
    } else {
      if (activeFileTabId !== null) {
         setActiveFileTabId(null); 
      }
    }
  }, [filesForTabs, activeFileTabId, setActiveFileTabId]);

  const uniqueFileHeadersForDisplay = useMemo(() => {
    const activeFile = activeFileTabId ? uploadedBkashFiles.find(f => f.id === activeFileTabId) : null;
    
    let headersToUse: string[] = [];
    if (activeFile && activeFile.headers && activeFile.headers.length > 0) {
        headersToUse = activeFile.headers;
    } else if (bkashFilterState.selectedFileIds.length === 1) {
        const singleSelectedFile = uploadedBkashFiles.find(f => f.id === bkashFilterState.selectedFileIds[0]);
        if (singleSelectedFile && singleSelectedFile.headers && singleSelectedFile.headers.length > 0) {
            headersToUse = singleSelectedFile.headers;
        }
    }
    
    if (headersToUse.length === 0) {
        const allFilesHeaders = new Set<string>();
        const filesToConsider = bkashFilterState.selectedFileIds.length > 0 
            ? uploadedBkashFiles.filter(f => bkashFilterState.selectedFileIds.includes(f.id))
            : uploadedBkashFiles;
        filesToConsider.forEach(f => (f.headers || EXPECTED_BKASH_DISPLAY_HEADERS).forEach(h => allFilesHeaders.add(h)));
        if (allFilesHeaders.size > 0) {
            headersToUse = Array.from(allFilesHeaders);
        } else {
            headersToUse = EXPECTED_BKASH_DISPLAY_HEADERS;
        }
    }
    
    const multipleFilesSelected = !activeFileTabId && (bkashFilterState.selectedFileIds.length === 0 || bkashFilterState.selectedFileIds.length > 1);
    if (multipleFilesSelected && !headersToUse.map(h => h.toLowerCase()).includes('filename')) {
        const updatedHeaders = [...headersToUse];
        const balanceIndex = updatedHeaders.map(h => h.toLowerCase()).indexOf('balance'); 
        if (balanceIndex !== -1) {
            updatedHeaders.splice(balanceIndex + 1, 0, 'fileName');
        } else {
            updatedHeaders.push('fileName');
        }
        headersToUse = updatedHeaders;
    }

    return headersToUse.sort((a, b) => {
        const normA = getBkashCanonicalKey(a) || a;
        const normB = getBkashCanonicalKey(b) || b;
        const idxA = EXPECTED_BKASH_DISPLAY_HEADERS.findIndex(h => (getBkashCanonicalKey(h) || h) === normA);
        const idxB = EXPECTED_BKASH_DISPLAY_HEADERS.findIndex(h => (getBkashCanonicalKey(h) || h) === normB);

        if (idxA !== -1 && idxB !== -1) return idxA - idxB;
        if (idxA !== -1) return -1;
        if (idxB !== -1) return 1;
        return a.localeCompare(b);
    });
  }, [uploadedBkashFiles, activeFileTabId, bkashFilterState.selectedFileIds]);


  const sortedRecords = useMemo(() => {
    let sortableItems = [...filteredBkashRecords];
    const currentSortKey = sortConfig.key;

    if (currentSortKey !== null) {
      sortableItems.sort((a, b) => {
        let valA = (a as any)[currentSortKey]; 
        let valB = (b as any)[currentSortKey];

        if (currentSortKey === 'transactionDate') {
          valA = parseDateTime(String(valA))?.getTime() ?? 0;
          valB = parseDateTime(String(valB))?.getTime() ?? 0;
        } else if (['transactedAmount', 'fee', 'balance', 'sl'].includes(String(currentSortKey))) {
            valA = Number(String(valA).replace(/,/g, '') || 0); 
            valB = Number(String(valB).replace(/,/g, '') || 0);
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
  }, [filteredBkashRecords, sortConfig]);

  const currentTableData = useMemo(() => {
    const firstPageIndex = (currentPage - 1) * ROWS_PER_PAGE;
    const lastPageIndex = firstPageIndex + ROWS_PER_PAGE;
    return sortedRecords.slice(firstPageIndex, lastPageIndex);
  }, [currentPage, sortedRecords]);

  const totalPages = Math.ceil(sortedRecords.length / ROWS_PER_PAGE);

  const requestSort = (headerKeyDisplay: string) => {
    const keyToSet: string | null = getBkashCanonicalKey(headerKeyDisplay) || headerKeyDisplay;
    let direction: 'ascending' | 'descending' = 'ascending';
    
    if (sortConfig.key === keyToSet && sortConfig.direction === 'ascending') {
      direction = 'descending';
    } else if (sortConfig.key !== keyToSet) {
        const typicalNumericFields = ['transactedAmount', 'fee', 'balance', 'sl'];
        if (typicalNumericFields.includes(keyToSet || '')) {
             direction = 'descending'; 
        } else if (keyToSet === 'transactionDate') {
             direction = 'descending'; 
        }
    }
    setSortConfig({ key: keyToSet as (keyof BkashRecord), direction });
    setCurrentPage(1);
  };

  const renderSortIcon = (headerKeyDisplay: string) => {
    const canonicalKeyForSort = getBkashCanonicalKey(headerKeyDisplay) || headerKeyDisplay;
    if (sortConfig.key !== canonicalKeyForSort) {
      return <ChevronDown className="h-4 w-4 text-neutral-DEFAULT opacity-30 group-hover:opacity-100 transition-opacity" />;
    }
    return sortConfig.direction === 'ascending' ? <ChevronUp className="h-4 w-4 text-pink-700" /> : <ChevronDown className="h-4 w-4 text-pink-700" />;
  };
  
  const handleExportData = () => {
    if (sortedRecords.length === 0) { alert("No data to export."); return; }
    const headersToExport = [...uniqueFileHeadersForDisplay]; 
    
    const dataToExport = sortedRecords.map(record => {
      const row = uniqueFileHeadersForDisplay.map(headerKeyDisplay => {
          const canonicalKey = getBkashCanonicalKey(headerKeyDisplay) || headerKeyDisplay;
          const value = record[canonicalKey as keyof BkashRecord];

          if (canonicalKey === 'transactionDate') return formatDate(String(value));
          if (['transactedAmount', 'fee', 'balance'].includes(canonicalKey as string)) {
            if (typeof value === 'number' && !isNaN(value)) {
               return value.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2});
            }
            return 'N/A';
          }
          return value ?? 'N/A';
      });
      return row;
    });
    const currentActiveFile = uploadedBkashFiles.find(f => f.id === activeFileTabId);
    const baseFilename = currentActiveFile ? currentActiveFile.sourceName.replace(/[^a-z0-9]/gi, '_').toLowerCase() : "bkash_statement_export";
    downloadCSV(`${baseFilename}.csv`, dataToExport, headersToExport);
  };

  if (isLoading && filteredBkashRecords.length === 0 && uploadedBkashFiles.length > 0) {
    return <div className="flex justify-center items-center h-64"><div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-pink-600"></div><p className="ml-3 text-textSecondary">Applying filters to bKash data...</p></div>;
  }
  if (error) return <div className="p-4 bg-danger-lighter text-danger-darker rounded-lg text-center border border-danger-light">{error}</div>;
  
  const noFilesSelectedForDisplay = uploadedBkashFiles.length > 0 && bkashFilterState.selectedFileIds.length === 0;
  const currentActiveFileDetails = activeFileTabId ? uploadedBkashFiles.find(f => f.id === activeFileTabId) : null;

  const headerDisplayLabels: Record<string, string> = {
    'sl': 'SL', 'trxId': 'Trx ID', 'transactionDate': 'Transaction Date', 'trxType': 'Trx Type',
    'sender': 'Sender', 'receiver': 'Receiver', 'receiverName': 'Receiver Name', 'reference': 'Reference',
    'transactedAmount': 'Transacted Amount', 'fee': 'Fee', 'balance': 'Balance',
    'transactionDirection': 'Direction', 'fileName': 'Source File'
  };


  return (
    <div className="space-y-4">
      {filesForTabs.length > 0 && (
        <div className="bg-pink-50 p-3 sm:p-3.5 rounded-xl border border-pink-200 shadow-lg">
          <h3 className="text-xs sm:text-sm font-medium text-pink-700 mb-2 sm:mb-2.5 ml-1">Select bKash File to View:</h3>
          <FileTabs>
            {filesForTabs.map(file => (
              <FileTab
                key={file.id}
                title={file.sourceName || file.name}
                icon={<Pocket size={15} />} 
                isActive={activeFileTabId === file.id}
                onClick={() => setActiveFileTabId(file.id)}
              />
            ))}
          </FileTabs>
        </div>
      )}
      
      {/* REMOVED Redundant Uploaded Files List from here */}

      <div className="flex flex-col sm:flex-row justify-between items-center gap-4 mb-4">
        <h3 className="text-xl font-semibold text-pink-700 flex items-center">
            <Pocket size={24} className="mr-2"/> bKash Transactions ({sortedRecords.length})
            {currentActiveFileDetails && <span className="text-sm text-neutral-500 ml-2">for {currentActiveFileDetails.sourceName}</span>}
            {!currentActiveFileDetails && bkashFilterState.selectedFileIds.length > 1 && <span className="text-sm text-neutral-500 ml-2">(Across {bkashFilterState.selectedFileIds.length} files)</span>}
        </h3>
        <div className="flex gap-2.5">
            {sortedRecords.length > 0 && (
              <button onClick={handleExportData} className="flex items-center px-4 py-2 bg-pink-400 text-white rounded-lg hover:bg-pink-500 focus:outline-none focus:ring-2 focus:ring-pink-300 focus:ring-offset-1 transition-colors shadow-md text-sm" title="Export current table data to CSV">
                <Download size={16} className="mr-1.5" /> Export CSV
              </button>
            )}
            <button onClick={() => setShowFilters(!showFilters)} className="flex items-center px-4 py-2 bg-pink-500 text-white rounded-lg hover:bg-pink-600 focus:outline-none focus:ring-2 focus:ring-pink-400 focus:ring-offset-1 transition-colors shadow-md text-sm">
                <ListFilterIcon size={16} className="mr-1.5" /> {showFilters ? 'Hide Filters' : 'Show Filters'}
            </button>
        </div>
      </div>

      {showFilters && <BkashFilterControls />}

      {noFilesSelectedForDisplay && uploadedBkashFiles.length > 0 && (
         <div className="p-4 bg-yellow-100 border border-yellow-300 rounded-lg text-yellow-700 flex items-center shadow-md">
            <AlertTriangle size={20} className="mr-2.5"/> Please select files in 'Filter by bKash Files' to view data.
        </div>
      )}
      
      {filteredBkashRecords.length === 0 && uploadedBkashFiles.length > 0 && bkashFilterState.selectedFileIds.length > 0 && !isLoading && (
        <div className="p-6 bg-neutral-lightest border border-neutral-light rounded-lg text-center text-textSecondary mt-4 min-h-[100px] flex items-center justify-center">
            No bKash records match the current filters for the selected file(s).
        </div>
      )}
       {uploadedBkashFiles.length === 0 && !isLoading && (
         <div className="p-6 bg-info-lighter border border-info-light rounded-lg text-center text-info-dark flex flex-col items-center justify-center min-h-[150px] shadow-md">
            <Info size={28} className="mb-2" />
            <p className="font-medium">No bKash statement files uploaded yet.</p>
        </div>
      )}

      {currentTableData.length > 0 && (
        <>
          <div className="overflow-x-auto bg-white shadow-xl rounded-xl border border-pink-200">
            <table className="min-w-full divide-y divide-pink-200">
              <thead className="bg-pink-50 sticky top-0 z-10">
                <tr>
                  {uniqueFileHeadersForDisplay.map((headerKeyDisplay) => (
                    <th
                      key={headerKeyDisplay}
                      scope="col"
                      onClick={() => requestSort(headerKeyDisplay)} 
                      className="group px-3.5 py-3 text-left text-xs font-semibold text-pink-700 uppercase tracking-wider cursor-pointer hover:bg-pink-100 transition-colors whitespace-nowrap"
                    >
                      <div className="flex items-center justify-between">
                        {headerDisplayLabels[getBkashCanonicalKey(headerKeyDisplay) || headerKeyDisplay] || headerKeyDisplay.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())}
                        {renderSortIcon(headerKeyDisplay)}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-pink-100">
                {currentTableData.map((record, index) => (
                  <tr key={record.id} className={`transition-colors ${index % 2 === 0 ? 'bg-white' : 'bg-pink-50/50'} hover:bg-pink-100/40`}>
                    {uniqueFileHeadersForDisplay.map(headerKeyDisplay => {
                      const canonicalKey = getBkashCanonicalKey(headerKeyDisplay) || headerKeyDisplay;
                      const value = record[canonicalKey as keyof BkashRecord];
                      
                      let displayValue: React.ReactNode = 'N/A';
                      let cellClass = "px-3.5 py-2.5 whitespace-nowrap text-xs text-textSecondary max-w-[180px] truncate";

                      if (value !== undefined && value !== null) {
                            if (String(value).trim() === "") { 
                                displayValue = 'N/A';
                            } else if (canonicalKey === 'transactionDate') {
                                displayValue = formatDate(String(value));
                            } else if (['transactedAmount', 'fee', 'balance'].includes(canonicalKey as string)) {
                                const numValue = Number(String(value).replace(/,/g, '').trim());
                                if (!isNaN(numValue)) {
                                    displayValue = numValue.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2});
                                    if (record.transactionDirection === 'DEBIT' && canonicalKey === 'transactedAmount' && numValue > 0) cellClass += " text-danger-dark";
                                    else if (record.transactionDirection === 'CREDIT' && canonicalKey === 'transactedAmount' && numValue > 0) cellClass += " text-success-dark";
                                }
                            } else if (canonicalKey === 'transactionDirection') {
                                displayValue = <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${value === 'CREDIT' ? 'bg-success-lighter text-success-darker' : (value === 'DEBIT' ? 'bg-danger-lighter text-danger-darker' : (value === 'OTHER' ? 'bg-neutral-light text-neutral-darker' : ''))}`}>{String(value)}</span>;
                            } else {
                                displayValue = String(value);
                            }
                        }
                      return (
                        <td key={`${record.id}-${headerKeyDisplay}`} className={cellClass} title={String(value ?? '')}>
                          {displayValue}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="flex flex-col sm:flex-row justify-between items-center mt-4 py-3 px-1">
              <span className="text-sm text-textSecondary mb-2 sm:mb-0">Page {currentPage} of {totalPages} (Total: {sortedRecords.length} records)</span>
              <div className="flex gap-2">
                <button onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))} disabled={currentPage === 1} className="px-4 py-2 text-sm font-medium text-pink-700 bg-pink-100 border border-pink-300 rounded-lg shadow-sm hover:bg-pink-200 disabled:opacity-50">Previous</button>
                <button onClick={() => setCurrentPage((prev) => Math.min(prev + 1, totalPages))} disabled={currentPage === totalPages} className="px-4 py-2 text-sm font-medium text-pink-700 bg-pink-100 border border-pink-300 rounded-lg shadow-sm hover:bg-pink-200 disabled:opacity-50">Next</button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default BkashDataView;


import React, { useState, useMemo, useEffect } from 'react';
import { ChevronDown, ChevronUp, FileText as FileIcon, Download, Info, AlertTriangle, XCircle, Edit3, Check, X, DollarSign, CalendarDays, Layers, ListFilter as ListFilterIcon } from 'lucide-react';
import { useNagadContext } from '../contexts/NagadContext';
import { NagadRecord, NagadFilterState, UploadedNagadFile, NagadSortConfig } from '../types';
import { formatDate, parseDateTime } from '../utils/cdrUtils';
import { downloadCSV } from '../utils/downloadUtils';
import NagadFilterControls from './NagadFilterControls';
import { Tab as FileTab, Tabs as FileTabs } from './Tabs'; 
import { HEADERS_FROM_OCR, getCanonicalKeyFromRawHeader as getNagadCanonicalKey } from '../utils/nagadParser';

const ROWS_PER_PAGE = 20;

const NagadDataView: React.FC = () => {
  const { 
    filteredNagadRecords, 
    isLoading, 
    error, 
    uploadedNagadFiles,
    nagadFilterState, 
    removeNagadFile,
    updateNagadFileSourceName,
    activeFileTabId,      
    setActiveFileTabId    
  } = useNagadContext();
  
  const [currentPage, setCurrentPage] = useState(1);
  const [sortConfig, setSortConfig] = useState<NagadSortConfig>({ key: 'TXN_DATE_TIME', direction: 'descending' });
  const [showFilters, setShowFilters] = useState(false); 
  
  const [editingSourceNameId, setEditingSourceNameId] = useState<string | null>(null);
  const [currentEditValue, setCurrentEditValue] = useState<string>("");

  const handleSourceNameChange = (newName: string) => { setCurrentEditValue(newName); };
  const saveSourceName = (fileId: string) => {
    if (currentEditValue.trim() !== "") updateNagadFileSourceName(fileId, currentEditValue.trim());
    setEditingSourceNameId(null); setCurrentEditValue("");
  };
  const cancelEditSourceName = () => { setEditingSourceNameId(null); setCurrentEditValue(""); };
  const startEditing = (file: UploadedNagadFile) => { setEditingSourceNameId(file.id); setCurrentEditValue(file.sourceName); };
  
  const filesForTabs = useMemo(() => {
    return uploadedNagadFiles.filter(f => nagadFilterState.selectedFileIds.includes(f.id));
  }, [uploadedNagadFiles, nagadFilterState.selectedFileIds]);

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
    const activeFile = activeFileTabId ? uploadedNagadFiles.find(f => f.id === activeFileTabId) : null;
    
    let headersToUse: string[] = [];
    if (activeFile && activeFile.headers && activeFile.headers.length > 0) {
        headersToUse = activeFile.headers;
    } else if (nagadFilterState.selectedFileIds.length === 1) {
        const singleSelectedFile = uploadedNagadFiles.find(f => f.id === nagadFilterState.selectedFileIds[0]);
        if (singleSelectedFile && singleSelectedFile.headers && singleSelectedFile.headers.length > 0) {
            headersToUse = singleSelectedFile.headers;
        }
    }
    
    if (headersToUse.length === 0) { 
        const headerSetFromFiles = new Set<string>();
        const filesToConsider = nagadFilterState.selectedFileIds.length > 0 
            ? uploadedNagadFiles.filter(f => nagadFilterState.selectedFileIds.includes(f.id))
            : uploadedNagadFiles;
        filesToConsider.forEach(f => (f.headers || HEADERS_FROM_OCR).forEach(h => headerSetFromFiles.add(h)));
        if (headerSetFromFiles.size > 0) {
            headersToUse = Array.from(headerSetFromFiles);
        } else {
            headersToUse = HEADERS_FROM_OCR;
        }
    }
    
    return headersToUse.sort((a, b) => {
        const idxA = HEADERS_FROM_OCR.indexOf(a);
        const idxB = HEADERS_FROM_OCR.indexOf(b);
        if (idxA !== -1 && idxB !== -1) return idxA - idxB;
        if (idxA !== -1) return -1;
        if (idxB !== -1) return 1;
        return a.localeCompare(b);
    });
  }, [uploadedNagadFiles, activeFileTabId, nagadFilterState.selectedFileIds]);


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
    if (!activeFileTabId && (nagadFilterState.selectedFileIds.length === 0 || nagadFilterState.selectedFileIds.length > 1)) {
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
      if (!activeFileTabId && (nagadFilterState.selectedFileIds.length === 0 || nagadFilterState.selectedFileIds.length > 1)) {
        row.push(record.fileName);
      }
      return row;
    });
    const currentActiveFile = uploadedNagadFiles.find(f => f.id === activeFileTabId);
    const baseFilename = currentActiveFile ? currentActiveFile.sourceName.replace(/[^a-z0-9]/gi, '_').toLowerCase() : "nagad_statement_export";
    downloadCSV(`${baseFilename}.csv`, dataToExport, headersToExport);
  };

  if (isLoading && filteredNagadRecords.length === 0 && uploadedNagadFiles.length > 0) {
    return <div className="flex justify-center items-center h-64"><div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary-dark"></div><p className="ml-3 text-textSecondary">Applying filters to Nagad data...</p></div>;
  }
  if (error) return <div className="p-4 bg-danger-lighter text-danger-darker rounded-lg text-center border border-danger-light">{error}</div>;
  
  const noFilesSelectedForDisplay = uploadedNagadFiles.length > 0 && nagadFilterState.selectedFileIds.length === 0;
  const currentActiveFileDetails = activeFileTabId ? uploadedNagadFiles.find(f => f.id === activeFileTabId) : null;

  return (
    <div className="space-y-4">
      {filesForTabs.length > 0 && (
        <div className="bg-surface p-3 sm:p-3.5 rounded-xl border border-neutral-light shadow-lg">
          <h3 className="text-xs sm:text-sm font-medium text-textSecondary mb-2 sm:mb-2.5 ml-1">Select Nagad File to View:</h3>
          <FileTabs>
            {filesForTabs.map(file => (
              <FileTab
                key={file.id}
                title={file.sourceName || file.name}
                icon={<FileIcon size={15} />} 
                isActive={activeFileTabId === file.id}
                onClick={() => setActiveFileTabId(file.id)}
              />
            ))}
          </FileTabs>
        </div>
      )}
      
      {uploadedNagadFiles.length > 0 && (
        <div className="bg-surface shadow-md rounded-lg p-3 sm:p-4 border border-neutral-light">
          <h3 className="text-base font-medium text-textPrimary mb-2.5">Uploaded Nagad Statement Files:</h3>
          <ul className="space-y-2 max-h-40 overflow-y-auto scrollbar-thin pr-1">
            {uploadedNagadFiles.map((file) => (
              <li key={file.id} className="flex flex-col sm:flex-row items-start sm:items-center justify-between bg-neutral-lightest p-2 rounded-md border border-neutral-light text-xs">
                <div className="flex items-center mb-1 sm:mb-0 flex-grow min-w-0">
                  <FileIcon className="h-4 w-4 text-primary mr-2 flex-shrink-0" />
                  <div className="flex-grow min-w-0">
                    {editingSourceNameId === file.id ? (
                      <div className="flex items-center space-x-1 w-full">
                        <input type="text" value={currentEditValue} onChange={(e) => handleSourceNameChange(e.target.value)} className="flex-grow text-xs p-1 border border-primary-light rounded-md w-full bg-white" autoFocus onKeyDown={(e) => { if (e.key === 'Enter') saveSourceName(file.id); if (e.key === 'Escape') cancelEditSourceName(); }}/>
                        <button onClick={() => saveSourceName(file.id)} className="p-1 text-success-dark hover:bg-success-lighter rounded-md" title="Save"><Check size={15}/></button>
                        <button onClick={cancelEditSourceName} className="p-1 text-danger hover:bg-danger-lighter rounded-md" title="Cancel"><X size={15}/></button>
                      </div>
                    ) : (
                      <span className="font-semibold text-textPrimary truncate block" title={file.sourceName}>{file.sourceName}</span>
                    )}
                    <span className="text-neutral-DEFAULT truncate block" title={file.name}>({file.name} - {file.records.length} records)</span>
                  </div>
                </div>
                <div className="flex items-center space-x-1.5 self-end sm:self-center">
                  {editingSourceNameId !== file.id && <button onClick={() => startEditing(file)} className="p-1 text-primary-dark/80 hover:text-primary-dark hover:bg-primary-lighter/40 rounded-md" title="Edit source name"><Edit3 size={14} /></button>}
                  <button onClick={() => removeNagadFile(file.id)} className="p-1 text-danger/80 hover:text-danger-dark hover:bg-danger-lighter/40 rounded-md" title="Remove file"><XCircle size={16} /></button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex flex-col sm:flex-row justify-between items-center gap-4 mb-4">
        <h3 className="text-xl font-semibold text-textPrimary">
            Nagad Statement Records ({sortedRecords.length})
            {currentActiveFileDetails && <span className="text-sm text-neutral-DEFAULT ml-2">for {currentActiveFileDetails.sourceName}</span>}
            {!currentActiveFileDetails && nagadFilterState.selectedFileIds.length > 1 && <span className="text-sm text-neutral-DEFAULT ml-2">(Across {nagadFilterState.selectedFileIds.length} files)</span>}
        </h3>
        <div className="flex gap-2.5">
            {sortedRecords.length > 0 && (
              <button onClick={handleExportData} className="flex items-center px-4 py-2 bg-secondary text-white rounded-lg hover:bg-secondary-dark focus:outline-none focus:ring-2 focus:ring-secondary-light focus:ring-offset-1 transition-colors shadow-md text-sm" title="Export current table data to CSV">
                <Download size={16} className="mr-1.5" /> Export CSV
              </button>
            )}
            <button onClick={() => setShowFilters(!showFilters)} className="flex items-center px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-dark focus:outline-none focus:ring-2 focus:ring-primary-light focus:ring-offset-1 transition-colors shadow-md text-sm">
                <ListFilterIcon size={16} className="mr-1.5" /> {showFilters ? 'Hide Filters' : 'Show Filters'}
            </button>
        </div>
      </div>

      {showFilters && <NagadFilterControls />}

      {noFilesSelectedForDisplay && uploadedNagadFiles.length > 0 && (
         <div className="p-4 bg-warning-lighter border border-warning-light rounded-lg text-warning-darker flex items-center shadow-md">
            <AlertTriangle size={20} className="mr-2.5"/> Please select files in 'Filter by Nagad Files' to view data.
        </div>
      )}
      
      {filteredNagadRecords.length === 0 && uploadedNagadFiles.length > 0 && nagadFilterState.selectedFileIds.length > 0 && !isLoading && (
        <div className="p-6 bg-neutral-lightest border border-neutral-light rounded-lg text-center text-textSecondary mt-4 min-h-[100px] flex items-center justify-center">
            No Nagad records match the current filters for the selected file(s).
        </div>
      )}
       {uploadedNagadFiles.length === 0 && !isLoading && (
         <div className="p-6 bg-info-lighter border border-info-light rounded-lg text-center text-info-dark flex flex-col items-center justify-center min-h-[150px] shadow-md">
            <Info size={28} className="mb-2" />
            <p className="font-medium">No Nagad statement files uploaded yet.</p>
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
                  {(!activeFileTabId && (nagadFilterState.selectedFileIds.length === 0 || nagadFilterState.selectedFileIds.length > 1)) && uniqueFileHeadersForDisplay.length > 0 && (
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
                                    if (record.TXN_TYPE_DR_CR === 'CREDIT' && canonicalKey === 'TXN_AMT') cellClass += " text-success-dark";
                                    else if (record.TXN_TYPE_DR_CR === 'DEBIT' && canonicalKey === 'TXN_AMT') cellClass += " text-danger-dark";
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
                     {(!activeFileTabId && (nagadFilterState.selectedFileIds.length === 0 || nagadFilterState.selectedFileIds.length > 1)) && uniqueFileHeadersForDisplay.length > 0 && (
                        <td className="px-3.5 py-2.5 whitespace-nowrap text-xs text-textSecondary truncate max-w-[150px]" title={record.fileName}>{record.fileName}</td>
                     )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="flex flex-col sm:flex-row justify-between items-center mt-4 py-3 px-1">
              <span className="text-sm text-textSecondary mb-2 sm:mb-0">
                Page {currentPage} of {totalPages} (Total: {sortedRecords.length} records)
              </span>
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

export default NagadDataView;

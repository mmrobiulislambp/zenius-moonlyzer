
import React, { useState, useMemo, useEffect } from 'react';
import { ChevronDown, ChevronUp, FileText as FileIcon, Download, Info, AlertTriangle, XCircle, Edit3, Check, X, Rocket, ListFilter as ListFilterIcon } from 'lucide-react';
import { useRoketContext } from '../contexts/RoketContext';
import { RoketRecord, UploadedRoketFile, RoketSortConfig } from '../types';
// import { formatDate, parseDateTime } from '../utils/cdrUtils'; // Uncomment if date fields are added for Roket
import { downloadCSV } from '../utils/downloadUtils';
import RoketFilterControls from './RoketFilterControls'; 
import { Tab as FileTab, Tabs as FileTabs } from './Tabs'; 

const ROWS_PER_PAGE = 20;

// Placeholder for mapping function if Roket headers differ significantly from RoketRecord keys
// For now, assumes headers mostly match RoketRecord keys or are handled dynamically
const getRoketCanonicalKey = (rawHeader: string): string | null => {
    return rawHeader.trim().toLowerCase() || null; // Simple lowercase for now
};

const EXPECTED_ROKET_DISPLAY_HEADERS: string[] = [
  // Common MFS fields - replace with actual Roket fields if known
  'TXN_DATE_TIME', 'TXN_ID', 'TXN_TYPE', 'TXN_WITH_ACC', 
  'TXN_AMT', 'AVAILABLE_BLC_AFTER_TXN', 'STATUS', 'fileName'
];


const RoketDataView: React.FC = () => {
  const { 
    filteredRoketRecords, 
    isLoading, 
    error, 
    uploadedRoketFiles,
    roketFilterState, 
    removeRoketFile,
    updateRoketFileSourceName,
    activeFileTabId,      
    setActiveFileTabId    
  } = useRoketContext();
  
  const [currentPage, setCurrentPage] = useState(1);
  // Adjust default sort key if Roket has a typical date field
  const [sortConfig, setSortConfig] = useState<RoketSortConfig>({ key: 'rowIndex', direction: 'ascending' }); 
  const [showFilters, setShowFilters] = useState(false); 
  
  const [editingSourceNameId, setEditingSourceNameId] = useState<string | null>(null);
  const [currentEditValue, setCurrentEditValue] = useState<string>("");

  const handleSourceNameChange = (newName: string) => { setCurrentEditValue(newName); };
  const saveSourceName = (fileId: string) => {
    if (currentEditValue.trim() !== "") updateRoketFileSourceName(fileId, currentEditValue.trim());
    setEditingSourceNameId(null); setCurrentEditValue("");
  };
  const cancelEditSourceName = () => { setEditingSourceNameId(null); setCurrentEditValue(""); };
  const startEditing = (file: UploadedRoketFile) => { setEditingSourceNameId(file.id); setCurrentEditValue(file.sourceName); };
  
  const filesForTabs = useMemo(() => {
    return uploadedRoketFiles.filter(f => roketFilterState.selectedFileIds.includes(f.id));
  }, [uploadedRoketFiles, roketFilterState.selectedFileIds]);

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
    const activeFile = activeFileTabId ? uploadedRoketFiles.find(f => f.id === activeFileTabId) : null;
    
    let headersToUse: string[] = [];
    if (activeFile && activeFile.headers && activeFile.headers.length > 0) {
        headersToUse = activeFile.headers;
    } else if (roketFilterState.selectedFileIds.length === 1) {
        const singleSelectedFile = uploadedRoketFiles.find(f => f.id === roketFilterState.selectedFileIds[0]);
        if (singleSelectedFile && singleSelectedFile.headers && singleSelectedFile.headers.length > 0) {
            headersToUse = singleSelectedFile.headers;
        }
    }
    
    if (headersToUse.length === 0) { 
        const headerSetFromFiles = new Set<string>();
        const filesToConsider = roketFilterState.selectedFileIds.length > 0 
            ? uploadedRoketFiles.filter(f => roketFilterState.selectedFileIds.includes(f.id))
            : uploadedRoketFiles;
        filesToConsider.forEach(f => (f.headers || EXPECTED_ROKET_DISPLAY_HEADERS).forEach(h => headerSetFromFiles.add(h)));
        if (headerSetFromFiles.size > 0) {
            headersToUse = Array.from(headerSetFromFiles);
        } else {
            headersToUse = EXPECTED_ROKET_DISPLAY_HEADERS;
        }
    }
    
    const multipleFilesSelected = !activeFileTabId && (roketFilterState.selectedFileIds.length === 0 || roketFilterState.selectedFileIds.length > 1);
    if (multipleFilesSelected && !headersToUse.map(h => h.toLowerCase()).includes('filename')) {
        const updatedHeaders = [...headersToUse];
        updatedHeaders.push('fileName'); // Add fileName if not present and multiple files shown
        headersToUse = updatedHeaders;
    }

    return headersToUse.sort((a, b) => {
        const normA = getRoketCanonicalKey(a) || a;
        const normB = getRoketCanonicalKey(b) || b;
        const idxA = EXPECTED_ROKET_DISPLAY_HEADERS.findIndex(h => (getRoketCanonicalKey(h) || h) === normA);
        const idxB = EXPECTED_ROKET_DISPLAY_HEADERS.findIndex(h => (getRoketCanonicalKey(h) || h) === normB);

        if (idxA !== -1 && idxB !== -1) return idxA - idxB;
        if (idxA !== -1) return -1;
        if (idxB !== -1) return 1;
        return a.localeCompare(b);
    });
  }, [uploadedRoketFiles, activeFileTabId, roketFilterState.selectedFileIds]);


  const sortedRecords = useMemo(() => {
    let sortableItems = [...filteredRoketRecords]; 
    if (sortConfig.key !== null) {
      sortableItems.sort((a, b) => {
        const keyForSort = sortConfig.key as keyof RoketRecord | string; 
        
        let valA = (a as any)[keyForSort];
        let valB = (b as any)[keyForSort];

        // Add Roket-specific sorting logic if needed (e.g., for dates, amounts)
        // if (keyForSort === 'TXN_DATE_TIME') {
        //   valA = parseDateTime(String(valA))?.getTime() ?? 0;
        //   valB = parseDateTime(String(valB))?.getTime() ?? 0;
        // } 
        if (typeof valA === 'string' && typeof valB === 'string') {
          valA = valA.toLowerCase();
          valB = valB.toLowerCase();
        } else if (typeof valA === 'number' && typeof valB === 'number') {
          // already numbers
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
  }, [filteredRoketRecords, sortConfig]);

  const currentTableData = useMemo(() => {
    const firstPageIndex = (currentPage - 1) * ROWS_PER_PAGE;
    const lastPageIndex = firstPageIndex + ROWS_PER_PAGE;
    return sortedRecords.slice(firstPageIndex, lastPageIndex);
  }, [currentPage, sortedRecords]);

  const totalPages = Math.ceil(sortedRecords.length / ROWS_PER_PAGE);

  const requestSort = (headerKeyDisplay: string) => {
    const keyToSet = getRoketCanonicalKey(headerKeyDisplay) || headerKeyDisplay;
    let direction: 'ascending' | 'descending' = 'ascending';
    if (sortConfig.key === keyToSet && sortConfig.direction === 'ascending') {
      direction = 'descending';
    }
    setSortConfig({ key: keyToSet, direction });
    setCurrentPage(1);
  };

  const renderSortIcon = (headerKeyDisplay: string) => {
    const canonicalKeyForSort = getRoketCanonicalKey(headerKeyDisplay) || headerKeyDisplay;
    if (sortConfig.key !== canonicalKeyForSort) {
      return <ChevronDown className="h-4 w-4 text-neutral-DEFAULT opacity-30 group-hover:opacity-100 transition-opacity" />;
    }
    return sortConfig.direction === 'ascending' ? <ChevronUp className="h-4 w-4 text-purple-700" /> : <ChevronDown className="h-4 w-4 text-purple-700" />;
  };
  
  const handleExportData = () => {
    if (sortedRecords.length === 0) { alert("No data to export."); return; }
    const headersToExport = [...uniqueFileHeadersForDisplay]; 
    if (!activeFileTabId && (roketFilterState.selectedFileIds.length === 0 || roketFilterState.selectedFileIds.length > 1)) {
        headersToExport.push("Source File Name");
    }
    
    const dataToExport = sortedRecords.map(record => {
      const row = uniqueFileHeadersForDisplay.map(headerKeyDisplay => {
          const canonicalKey = getRoketCanonicalKey(headerKeyDisplay) || headerKeyDisplay;
          const value = record[canonicalKey as keyof RoketRecord];
          // Add Roket-specific formatting if needed for export
          // if (canonicalKey === 'TXN_DATE_TIME') return formatDate(String(value));
          return value ?? 'N/A';
      });
      if (!activeFileTabId && (roketFilterState.selectedFileIds.length === 0 || roketFilterState.selectedFileIds.length > 1)) {
        row.push(record.fileName);
      }
      return row;
    });
    const currentActiveFile = uploadedRoketFiles.find(f => f.id === activeFileTabId);
    const baseFilename = currentActiveFile ? currentActiveFile.sourceName.replace(/[^a-z0-9]/gi, '_').toLowerCase() : "roket_data_export";
    downloadCSV(`${baseFilename}.csv`, dataToExport, headersToExport);
  };

  if (isLoading && filteredRoketRecords.length === 0 && uploadedRoketFiles.length > 0) {
    return <div className="flex justify-center items-center h-64"><div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-purple-600"></div><p className="ml-3 text-textSecondary">Applying filters to Roket data...</p></div>;
  }
  if (error) return <div className="p-4 bg-danger-lighter text-danger-darker rounded-lg text-center border border-danger-light">{error}</div>;
  
  const noFilesSelectedForDisplay = uploadedRoketFiles.length > 0 && roketFilterState.selectedFileIds.length === 0;
  const currentActiveFileDetails = activeFileTabId ? uploadedRoketFiles.find(f => f.id === activeFileTabId) : null;

  const headerDisplayLabels: Record<string, string> = {
    'TXN_DATE_TIME': 'Date & Time', 'TXN_ID': 'Transaction ID', 'TXN_TYPE': 'Type', 
    'TXN_WITH_ACC': 'Interacted Account', 'TXN_AMT': 'Amount', 
    'AVAILABLE_BLC_AFTER_TXN': 'Balance After', 'STATUS': 'Status', 'fileName': 'Source File'
    // Add other known Roket headers here for pretty display
  };


  return (
    <div className="space-y-4">
      {filesForTabs.length > 0 && (
        <div className="bg-purple-50 p-3 sm:p-3.5 rounded-xl border border-purple-200 shadow-lg">
          <h3 className="text-xs sm:text-sm font-medium text-purple-700 mb-2 sm:mb-2.5 ml-1">Select Roket File to View:</h3>
          <FileTabs>
            {filesForTabs.map(file => (
              <FileTab
                key={file.id}
                title={file.sourceName || file.name}
                icon={<Rocket size={15} />} 
                isActive={activeFileTabId === file.id}
                onClick={() => setActiveFileTabId(file.id)}
              />
            ))}
          </FileTabs>
        </div>
      )}
      
      {uploadedRoketFiles.length > 0 && (
        <div className="bg-surface shadow-md rounded-lg p-3 sm:p-4 border border-neutral-light">
          <h3 className="text-base font-medium text-textPrimary mb-2.5">Uploaded Roket Files:</h3>
          <ul className="space-y-2 max-h-40 overflow-y-auto scrollbar-thin pr-1">
            {uploadedRoketFiles.map((file) => (
              <li key={file.id} className="flex flex-col sm:flex-row items-start sm:items-center justify-between bg-neutral-lightest p-2 rounded-md border border-neutral-light text-xs">
                <div className="flex items-center mb-1 sm:mb-0 flex-grow min-w-0">
                  <Rocket size={15} className="text-purple-500 mr-2 flex-shrink-0" />
                  <div className="flex-grow min-w-0">
                    {editingSourceNameId === file.id ? (
                      <div className="flex items-center space-x-1 w-full">
                        <input type="text" value={currentEditValue} onChange={(e) => handleSourceNameChange(e.target.value)} className="flex-grow text-xs p-1 border border-purple-400 rounded-md w-full bg-white" autoFocus onKeyDown={(e) => { if (e.key === 'Enter') saveSourceName(file.id); if (e.key === 'Escape') cancelEditSourceName(); }}/>
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
                  {editingSourceNameId !== file.id && <button onClick={() => startEditing(file)} className="p-1 text-purple-600/80 hover:text-purple-700 hover:bg-purple-200/40 rounded-md" title="Edit source name"><Edit3 size={14} /></button>}
                  <button onClick={() => removeRoketFile(file.id)} className="p-1 text-danger/80 hover:text-danger-dark hover:bg-danger-lighter/40 rounded-md" title="Remove file"><XCircle size={16} /></button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}


      <div className="flex flex-col sm:flex-row justify-between items-center gap-4 mb-4">
        <h3 className="text-xl font-semibold text-purple-700 flex items-center">
            <Rocket size={24} className="mr-2"/> Roket Records ({sortedRecords.length})
            {currentActiveFileDetails && <span className="text-sm text-neutral-500 ml-2">for {currentActiveFileDetails.sourceName}</span>}
            {!currentActiveFileDetails && roketFilterState.selectedFileIds.length > 1 && <span className="text-sm text-neutral-500 ml-2">(Across {roketFilterState.selectedFileIds.length} files)</span>}
        </h3>
        <div className="flex gap-2.5">
            {sortedRecords.length > 0 && (
              <button onClick={handleExportData} className="flex items-center px-4 py-2 bg-purple-400 text-white rounded-lg hover:bg-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-300 focus:ring-offset-1 transition-colors shadow-md text-sm" title="Export current table data to CSV">
                <Download size={16} className="mr-1.5" /> Export CSV
              </button>
            )}
            <button onClick={() => setShowFilters(!showFilters)} className="flex items-center px-4 py-2 bg-purple-500 text-white rounded-lg hover:bg-purple-600 focus:outline-none focus:ring-2 focus:ring-purple-400 focus:ring-offset-1 transition-colors shadow-md text-sm">
                <ListFilterIcon size={16} className="mr-1.5" /> {showFilters ? 'Hide Filters' : 'Show Filters'}
            </button>
        </div>
      </div>

      {showFilters && <RoketFilterControls />}

      {noFilesSelectedForDisplay && uploadedRoketFiles.length > 0 && (
         <div className="p-4 bg-yellow-100 border border-yellow-300 rounded-lg text-yellow-700 flex items-center shadow-md">
            <AlertTriangle size={20} className="mr-2.5"/> Please select files in 'Filter by Roket Files' to view data.
        </div>
      )}
      
      {filteredRoketRecords.length === 0 && uploadedRoketFiles.length > 0 && roketFilterState.selectedFileIds.length > 0 && !isLoading && (
        <div className="p-6 bg-neutral-lightest border border-neutral-light rounded-lg text-center text-textSecondary mt-4 min-h-[100px] flex items-center justify-center">
            No Roket records match the current filters for the selected file(s).
        </div>
      )}
       {uploadedRoketFiles.length === 0 && !isLoading && (
         <div className="p-6 bg-info-lighter border border-info-light rounded-lg text-center text-info-dark flex flex-col items-center justify-center min-h-[150px] shadow-md">
            <Info size={28} className="mb-2" />
            <p className="font-medium">No Roket files uploaded yet.</p>
        </div>
      )}

      {currentTableData.length > 0 && (
        <>
          <div className="overflow-x-auto bg-white shadow-xl rounded-xl border border-purple-200">
            <table className="min-w-full divide-y divide-purple-200">
              <thead className="bg-purple-50 sticky top-0 z-10">
                <tr>
                  {uniqueFileHeadersForDisplay.map((headerKeyDisplay) => (
                    <th
                      key={headerKeyDisplay}
                      scope="col"
                      onClick={() => requestSort(headerKeyDisplay)} 
                      className="group px-3.5 py-3 text-left text-xs font-semibold text-purple-700 uppercase tracking-wider cursor-pointer hover:bg-purple-100 transition-colors whitespace-nowrap"
                    >
                      <div className="flex items-center justify-between">
                        {headerDisplayLabels[getRoketCanonicalKey(headerKeyDisplay) || headerKeyDisplay] || headerKeyDisplay.replace(/_/g, ' ').replace(/\b(txn|acc|blc|si)\b/gi, match => match.toUpperCase())}
                        {renderSortIcon(headerKeyDisplay)}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-purple-100">
                {currentTableData.map((record, index) => (
                  <tr key={record.id} className={`transition-colors ${index % 2 === 0 ? 'bg-white' : 'bg-purple-50/50'} hover:bg-purple-100/40`}>
                    {uniqueFileHeadersForDisplay.map(headerKeyDisplay => {
                      const canonicalKey = getRoketCanonicalKey(headerKeyDisplay) || headerKeyDisplay;
                      const value = record[canonicalKey as keyof RoketRecord];
                      let displayValue: React.ReactNode = value ?? 'N/A';
                      // Add any Roket-specific display formatting if needed
                      return (
                        <td key={`${record.id}-${headerKeyDisplay}`} className="px-3.5 py-2.5 whitespace-nowrap text-xs text-textSecondary max-w-[180px] truncate" title={String(value ?? '')}>
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
                <button onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))} disabled={currentPage === 1} className="px-4 py-2 text-sm font-medium text-purple-700 bg-purple-100 border border-purple-300 rounded-lg shadow-sm hover:bg-purple-200 disabled:opacity-50">Previous</button>
                <button onClick={() => setCurrentPage((prev) => Math.min(prev + 1, totalPages))} disabled={currentPage === totalPages} className="px-4 py-2 text-sm font-medium text-purple-700 bg-purple-100 border border-purple-300 rounded-lg shadow-sm hover:bg-purple-200 disabled:opacity-50">Next</button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default RoketDataView;

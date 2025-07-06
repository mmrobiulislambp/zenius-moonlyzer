
import React, { useState, useMemo, useEffect } from 'react';
import { ChevronDown, ChevronUp, FileText as FileIcon, Filter as FilterIcon, Download, Info, AlertTriangle, XCircle, Edit3, Check, X, Trash2, TowerControl, List, Loader2 } from 'lucide-react';
import { useLACContext } from '../contexts/LACContext';
import { LACRecord, LACFilterState, UploadedLACFile } from '../types';
import { formatDate, parseDateTime } from '../utils/cdrUtils';
import { downloadCSV } from '../utils/downloadUtils';

const ROWS_PER_PAGE = 20;

const EXPECTED_LAC_HEADERS_MAP_VIEW: Record<string, keyof LACRecord> = {
  'DATE_TIME': 'DATE_TIME', 'MSISDN': 'MSISDN', 'OTHER_PARTY_NUMBER': 'OTHER_PARTY_NUMBER',
  'USAGE_TYPE': 'USAGE_TYPE', 'CALL_DURATION': 'CALL_DURATION', 'LAC': 'LAC',
  'CELL_ID': 'CELL_ID', 'IMEI': 'IMEI',
};

const DATE_LAC_FIELDS_VIEW: (keyof LACRecord)[] = ['DATE_TIME'];

const LACDataTable: React.FC = () => {
  const { 
    filteredLACRecords, 
    isLoading, 
    error, 
    uploadedLACFiles,
    lacFilterState, 
    setLACFilterState,
    removeLACFile, 
    updateLACFileSourceName,
  } = useLACContext();
  
  const [currentPage, setCurrentPage] = useState(1);
  const [sortConfig, setSortConfig] = useState<{ key: keyof LACRecord | string | null; direction: 'ascending' | 'descending' }>({ key: 'DATE_TIME', direction: 'descending' });
  const [localSearchTerm, setLocalSearchTerm] = useState(lacFilterState.searchTerm);

  const [editingSourceNameId, setEditingSourceNameId] = useState<string | null>(null);
  const [currentEditValue, setCurrentEditValue] = useState<string>("");

  useEffect(() => {
    setLocalSearchTerm(lacFilterState.searchTerm);
  }, [lacFilterState.searchTerm]);

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setLocalSearchTerm(e.target.value);
  };

  const applySearch = () => {
    setLACFilterState(prev => ({ ...prev, searchTerm: localSearchTerm }));
    setCurrentPage(1);
  };

  const clearSearch = () => {
    setLocalSearchTerm('');
    setLACFilterState(prev => ({ ...prev, searchTerm: '' }));
    setCurrentPage(1);
  };
  
  const handleSourceNameChange = (newName: string) => {
    setCurrentEditValue(newName);
  };

  const saveSourceName = (fileId: string) => {
    if (currentEditValue.trim() !== "") {
      updateLACFileSourceName(fileId, currentEditValue.trim());
    }
    setEditingSourceNameId(null);
    setCurrentEditValue("");
  };
  
  const cancelEditSourceName = () => {
    setEditingSourceNameId(null);
    setCurrentEditValue("");
  };

  const startEditing = (file: UploadedLACFile) => {
    setEditingSourceNameId(file.id);
    setCurrentEditValue(file.sourceName);
  };

  const uniqueHeaders = useMemo(() => {
    if (uploadedLACFiles.length === 0) return [];
    const allHeaders = new Set<string>();
    const filesToConsider = lacFilterState.selectedFileIds.length > 0 
        ? uploadedLACFiles.filter(f => lacFilterState.selectedFileIds.includes(f.id))
        : uploadedLACFiles;
        
    filesToConsider.forEach(file => file.headers.forEach(h => allHeaders.add(h)));
    
    const knownOrder: (keyof LACRecord)[] = ['DATE_TIME', 'MSISDN', 'OTHER_PARTY_NUMBER', 'USAGE_TYPE', 'CALL_DURATION', 'LAC', 'CELL_ID', 'IMEI'];
    
    return Array.from(allHeaders).sort((a,b) => {
        const mappedA = EXPECTED_LAC_HEADERS_MAP_VIEW[a] || a.toLowerCase().replace(/\s+/g, '_').replace(/[^\w_]/gi, '');
        const mappedB = EXPECTED_LAC_HEADERS_MAP_VIEW[b] || b.toLowerCase().replace(/\s+/g, '_').replace(/[^\w_]/gi, '');
        const idxA = knownOrder.indexOf(mappedA as keyof LACRecord);
        const idxB = knownOrder.indexOf(mappedB as keyof LACRecord);

        if (idxA !== -1 && idxB !== -1) return idxA - idxB;
        if (idxA !== -1) return -1;
        if (idxB !== -1) return 1;
        return a.localeCompare(b);
    });

  }, [uploadedLACFiles, lacFilterState.selectedFileIds]);

  const sortedRecords = useMemo(() => {
    let sortableItems = [...filteredLACRecords]; 
    if (sortConfig.key !== null) {
      sortableItems.sort((a, b) => {
        const keyForSort = (EXPECTED_LAC_HEADERS_MAP_VIEW[sortConfig.key!] || 
                           String(sortConfig.key!).toLowerCase().replace(/\s+/g, '_').replace(/[^\w_]/gi, '')
                           ) as keyof LACRecord;

        let valA = a[keyForSort];
        let valB = b[keyForSort];

        if (DATE_LAC_FIELDS_VIEW.includes(keyForSort)) {
          valA = parseDateTime(String(valA))?.getTime() ?? 0;
          valB = parseDateTime(String(valB))?.getTime() ?? 0;
        } else if (keyForSort === 'CALL_DURATION') {
          valA = Number(valA) || 0;
          valB = Number(valB) || 0;
        } else if (typeof valA === 'string' && typeof valB === 'string') {
          valA = valA.toLowerCase();
          valB = valB.toLowerCase();
        }

        if (valA < valB) return sortConfig.direction === 'ascending' ? -1 : 1;
        if (valA > valB) return sortConfig.direction === 'ascending' ? 1 : -1;
        return 0;
      });
    }
    return sortableItems;
  }, [filteredLACRecords, sortConfig]);

  const currentTableData = useMemo(() => {
    const firstPageIndex = (currentPage - 1) * ROWS_PER_PAGE;
    const lastPageIndex = firstPageIndex + ROWS_PER_PAGE;
    return sortedRecords.slice(firstPageIndex, lastPageIndex);
  }, [currentPage, sortedRecords]);

  const totalPages = Math.ceil(sortedRecords.length / ROWS_PER_PAGE);

  const requestSort = (rawHeaderKey: string) => {
    let direction: 'ascending' | 'descending' = 'ascending';
    if (sortConfig.key === rawHeaderKey && sortConfig.direction === 'ascending') {
      direction = 'descending';
    }
    setSortConfig({ key: rawHeaderKey, direction });
    setCurrentPage(1);
  };

  const renderSortIcon = (rawHeaderKey: string) => {
    if (sortConfig.key !== rawHeaderKey) return <ChevronDown className="h-4 w-4 text-neutral-DEFAULT opacity-30 group-hover:opacity-100 transition-opacity" />;
    return sortConfig.direction === 'ascending' ? <ChevronUp className="h-4 w-4 text-primary-dark" /> : <ChevronDown className="h-4 w-4 text-primary-dark" />;
  };
  
  const handleExportData = () => {
    if (sortedRecords.length === 0) { alert("No data to export."); return; }
    const headersToExport = [...uniqueHeaders, "Source File Name"]; 
    const dataToExport = sortedRecords.map(record => {
      const row = uniqueHeaders.map(rawHeaderKey => {
          const mappedKey = (EXPECTED_LAC_HEADERS_MAP_VIEW[rawHeaderKey] || 
                             rawHeaderKey.toLowerCase().replace(/\s+/g, '_').replace(/[^\w_]/gi, '')
                            ) as keyof LACRecord;
          const value = record[mappedKey];
          if (DATE_LAC_FIELDS_VIEW.includes(mappedKey)) {
            return formatDate(String(value));
          }
          return value ?? 'N/A';
      });
      row.push(record.fileName);
      return row;
    });
    downloadCSV(`lac_data_export_${new Date().toISOString().split('T')[0]}.csv`, dataToExport, headersToExport);
  };

  if (isLoading && filteredLACRecords.length === 0 && !lacFilterState.searchTerm) {
    return <div className="flex justify-center items-center h-64"><Loader2 className="h-12 w-12 animate-spin text-primary" /><p className="ml-3 text-textSecondary">Loading LAC data...</p></div>;
  }
  if (error) return <div className="p-4 bg-danger-lighter text-danger-darker rounded-lg text-center border border-danger-light">{error}</div>;
  
  return (
    <div className="space-y-4">
      {uploadedLACFiles.length > 0 && (
        <div className="bg-surface shadow-md rounded-lg p-3 sm:p-4 border border-neutral-light">
          <div className="flex flex-col sm:flex-row justify-between items-center mb-2.5">
            <h3 className="text-base font-medium text-textPrimary mb-2 sm:mb-0">Uploaded LAC/Cell Data Files:</h3>
          </div>
          <ul className="space-y-2 max-h-40 overflow-y-auto scrollbar-thin pr-1">
            {uploadedLACFiles.map((file) => (
              <li key={file.id} className="flex flex-col sm:flex-row items-start sm:items-center justify-between bg-neutral-lightest p-2 rounded-md border border-neutral-light text-xs">
                <div className="flex items-center mb-1 sm:mb-0 flex-grow min-w-0">
                  <TowerControl size={15} className="h-4 w-4 text-primary mr-2 flex-shrink-0" />
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
                  <button onClick={() => removeLACFile(file.id)} className="p-1 text-danger/80 hover:text-danger-dark hover:bg-danger-lighter/40 rounded-md" title="Remove file"><XCircle size={16} /></button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

    {uploadedLACFiles.length > 0 && (filteredLACRecords.length > 0 || lacFilterState.searchTerm ) && (
      <div className="flex flex-col sm:flex-row justify-between items-center gap-4 mb-4">
        <div className="relative flex-grow w-full sm:w-auto">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <FilterIcon className="h-4 w-4 text-neutral-DEFAULT" />
          </div>
          <input
            type="text"
            value={localSearchTerm}
            onChange={handleSearchChange}
            onKeyDown={(e) => e.key === 'Enter' && applySearch()}
            placeholder="Search LAC/Cell data..."
            className="block w-full pl-10 pr-20 sm:pr-24 py-2 border border-neutral-light rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-light focus:border-primary-light text-sm bg-surface text-textPrimary placeholder-neutral-DEFAULT shadow-sm"
          />
           {localSearchTerm && (
            <button onClick={clearSearch} className="absolute inset-y-0 right-16 sm:right-20 pr-3 flex items-center text-neutral-DEFAULT hover:text-danger-dark" title="Clear search">
              <XCircle size={16}/>
            </button>
          )}
          <button onClick={applySearch} className="absolute inset-y-0 right-0 px-3 py-2 bg-primary text-white text-xs font-medium rounded-r-lg hover:bg-primary-dark transition-colors h-full">Search</button>
        </div>
        <button
            onClick={handleExportData}
            disabled={sortedRecords.length === 0}
            className="flex items-center px-4 py-2 bg-secondary text-white rounded-lg hover:bg-secondary-dark focus:outline-none focus:ring-2 focus:ring-secondary-light focus:ring-offset-1 transition-colors shadow-md text-sm disabled:opacity-60 whitespace-nowrap"
            title="Export current table data to CSV"
        >
            <Download size={16} className="mr-1.5" />
            Export CSV
        </button>
      </div>
    )}
      
      {uploadedLACFiles.length === 0 && !isLoading && (
         <div className="p-6 bg-info-lighter border border-info-light rounded-lg text-center text-info-dark flex flex-col items-center justify-center min-h-[150px] shadow-md">
            <Info size={28} className="mb-2" />
            <p className="font-medium">No LAC/Cell data files uploaded yet. Please upload files using the section above.</p>
        </div>
      )}

      {filteredLACRecords.length === 0 && lacFilterState.searchTerm && uploadedLACFiles.length > 0 && (
           <div className="p-4 bg-warning-lighter border border-warning-light rounded-lg text-center text-warning-darker flex items-center shadow-md">
             <AlertTriangle size={20} className="mr-2"/> No LAC/Cell records found matching your search term "{lacFilterState.searchTerm}".
           </div>
      )}
       {filteredLACRecords.length === 0 && !lacFilterState.searchTerm && uploadedLACFiles.length > 0 && (
         <div className="p-4 bg-info-lighter border border-info-light rounded-lg text-center text-info-dark flex items-center shadow-md">
            <Info size={20} className="mr-2"/> No LAC/Cell records to display for the current selection. Ensure files are selected if filters are active.
         </div>
       )}
      
      {filteredLACRecords.length > 0 && (
        <>
          <div className="overflow-x-auto bg-surface shadow-xl rounded-xl border border-neutral-light">
            <table className="min-w-full divide-y divide-neutral-light">
              <thead className="bg-neutral-lightest sticky top-0 z-10">
                <tr>
                  {uniqueHeaders.map((rawHeaderKey) => (
                    <th
                      key={rawHeaderKey}
                      scope="col"
                      onClick={() => requestSort(rawHeaderKey)}
                      className="group px-3.5 py-3 text-left text-xs font-semibold text-textPrimary uppercase tracking-wider cursor-pointer hover:bg-neutral-lighter transition-colors whitespace-nowrap"
                    >
                      <div className="flex items-center justify-between">
                        {rawHeaderKey} 
                        {renderSortIcon(rawHeaderKey)}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="bg-surface divide-y divide-neutral-light">
                {currentTableData.map((record, index) => (
                  <tr key={record.id} className={`transition-colors ${index % 2 === 0 ? 'bg-surface' : 'bg-neutral-lightest/60'} hover:bg-primary-lighter/20`}>
                    {uniqueHeaders.map(rawHeaderKey => {
                      const mappedKey = (EXPECTED_LAC_HEADERS_MAP_VIEW[rawHeaderKey] || 
                                         rawHeaderKey.toLowerCase().replace(/\s+/g, '_').replace(/[^\w_]/gi, '')
                                        ) as keyof LACRecord;
                      const cellValue = record[mappedKey];
                      
                      let displayValue: string | number = 'N/A';
                      if (cellValue !== undefined && cellValue !== null && String(cellValue).trim() !== "") {
                        if (DATE_LAC_FIELDS_VIEW.includes(mappedKey)) {
                          displayValue = formatDate(String(cellValue));
                        } else {
                          displayValue = String(cellValue);
                        }
                      }
                      return (
                        <td key={`${record.id}-${rawHeaderKey}`} className="px-3.5 py-2.5 whitespace-nowrap text-xs text-textSecondary max-w-[200px] truncate" title={String(displayValue)}>
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

const LACDataView: React.FC = () => {
  return <LACDataTable />;
};

export default LACDataView;

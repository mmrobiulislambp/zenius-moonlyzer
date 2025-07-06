import React, { useState, useMemo, useEffect, useContext } from 'react';
import { ChevronDown, ChevronUp, FileText as FileIcon, Filter as FilterIcon, Download, Info, AlertTriangle, XCircle, Edit3, Check, X, Trash2, Globe, Layers, BarChart2, PieChart as PieChartIcon, List } from 'lucide-react';
import { useIPDRContext } from '../contexts/IPDRContext';
import { IPDRRecord, IPDRFilterState, UploadedIPDRFile } from '../types';
import { formatDate, parseDateTime } from '../utils/cdrUtils';
import { downloadCSV } from '../utils/downloadUtils';
import { ResponsiveContainer, BarChart, PieChart, Pie, LineChart, Line, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, Cell } from 'recharts';
import { WatchlistContext } from '../contexts/WatchlistContext';
import { cn } from '../utils/cn';
import { Tab as FileTab, Tabs as FileTabs } from './Tabs';

const ROWS_PER_PAGE = 20;
const CHART_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#6366f1', '#f97316', '#06b6d4', '#d946ef'];


const formatBytes = (bytes?: number, decimals = 2): string => {
  if (bytes === undefined || bytes === null || isNaN(bytes) || bytes === 0) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
};

const EXPECTED_IPDR_HEADERS_MAP_LOCAL: Record<string, keyof IPDRRecord> = {
  'Public IP': 'publicIP', 'Public Port': 'publicPort', 'NAT Begin Time': 'natBeginTime',
  'NAT End Time': 'natEndTime', 'Start Time': 'startTime', 'End Time': 'endTime',
  'IMSI': 'imsi', 'MSISDN': 'msisdn', 'IMEISV': 'imeisv', 'MS IP': 'msIP',
  'MS Port': 'msPort', 'Server IP': 'serverIP', 'Server Port': 'serverPort',
  'CGI': 'cgi', 'SAI': 'sai', 'ECGI': 'ecgi', 'Uplink Traffic(Byte)': 'uplinkTrafficByte',
  'Downlink Traffic(Byte)': 'downlinkTrafficByte', 'Category Type': 'categoryType',
  'Application Type': 'applicationType', 'URL': 'url',
  'uplink traffic(byte)': 'uplinkTrafficByte', 'downlink traffic(byte)': 'downlinkTrafficByte',
};

const DATE_IPDR_FIELDS_LOCAL: (keyof IPDRRecord)[] = ['natBeginTime', 'natEndTime', 'startTime', 'endTime'];
const BYTE_FIELDS_LOCAL: (keyof IPDRRecord)[] = ['uplinkTrafficByte', 'downlinkTrafficByte'];


const getHostnameFromUrl = (url?: string): string | null => {
  if (!url || typeof url !== 'string' || !url.trim()) return null;
  try {
    let fullUrl = url.trim();
    if (!fullUrl.match(/^([a-zA-Z]+:\/\/)/)) {
      if (fullUrl.includes('.') && !fullUrl.includes(' ') && !fullUrl.startsWith('/')) {
        fullUrl = 'http://' + fullUrl;
      } else {
        return null; 
      }
    }
    const parsedUrl = new URL(fullUrl);
    let hostname = parsedUrl.hostname;
    if (hostname.startsWith('www.')) {
      hostname = hostname.substring(4);
    }
    return hostname;
  } catch (e) {
    const domainMatch = url.match(/^([a-zA-Z0-9-]+(\.[a-zA-Z0-9-]+)+)/);
    if (domainMatch && domainMatch[1]) {
      let hostname = domainMatch[1];
      if (hostname.startsWith('www.')) {
        hostname = hostname.substring(4);
      }
      return hostname;
    }
    return null;
  }
};


const IPDRDataTable: React.FC = () => {
  const { 
    filteredIPDRRecords, 
    isLoading, 
    error, 
    uploadedIPDRFiles,
    ipdrFilterState, 
    setIPDRFilterState,
    removeIPDRFile, 
    updateIPDRFileSourceName,
    activeFileTabId,
    setActiveFileTabId
  } = useIPDRContext();
  
  const watchlistContext = useContext(WatchlistContext);
  
  const [currentPage, setCurrentPage] = useState(1);
  const [sortConfig, setSortConfig] = useState<{ key: keyof IPDRRecord | string | null; direction: 'ascending' | 'descending' }>({ key: 'startTime', direction: 'descending' });
  const [localSearchTerm, setLocalSearchTerm] = useState(ipdrFilterState.searchTerm);
  
  const filesForTabs = useMemo(() => {
    return uploadedIPDRFiles.filter(f => ipdrFilterState.selectedFileIds.includes(f.id));
  }, [uploadedIPDRFiles, ipdrFilterState.selectedFileIds]);

  useEffect(() => {
    if (filesForTabs.length > 0 && !filesForTabs.some(f => f.id === activeFileTabId)) {
        setActiveFileTabId(filesForTabs[0].id);
    } else if (filesForTabs.length === 0 && activeFileTabId !== null) {
        setActiveFileTabId(null);
    }
  }, [filesForTabs, activeFileTabId, setActiveFileTabId]);


  useEffect(() => {
    setLocalSearchTerm(ipdrFilterState.searchTerm);
  }, [ipdrFilterState.searchTerm]);

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setLocalSearchTerm(e.target.value);
  };

  const applySearch = () => {
    setIPDRFilterState(prev => ({ ...prev, searchTerm: localSearchTerm }));
    setCurrentPage(1);
  };

  const clearSearch = () => {
    setLocalSearchTerm('');
    setIPDRFilterState(prev => ({ ...prev, searchTerm: '' }));
    setCurrentPage(1);
  };
  
  const uniqueHeaders = useMemo(() => {
    if (uploadedIPDRFiles.length === 0) return [];
    const allHeaders = new Set<string>();
    
    const activeFile = activeFileTabId ? uploadedIPDRFiles.find(f => f.id === activeFileTabId) : null;
    let filesToConsider = activeFile ? [activeFile] : (
        ipdrFilterState.selectedFileIds.length > 0 ? uploadedIPDRFiles.filter(f => ipdrFilterState.selectedFileIds.includes(f.id)) : uploadedIPDRFiles
    );

    if (filesToConsider.length === 0 && uploadedIPDRFiles.length > 0) {
        filesToConsider = uploadedIPDRFiles;
    }
        
    filesToConsider.forEach(file => file.headers.forEach(h => allHeaders.add(h)));
    
    const knownOrder: (keyof IPDRRecord)[] = ['publicIP', 'publicPort', 'serverIP', 'serverPort', 'startTime', 'endTime', 'natBeginTime', 'natEndTime', 'msisdn', 'imsi', 'imeisv', 'uplinkTrafficByte', 'downlinkTrafficByte', 'applicationType', 'categoryType', 'url'];
    
    return Array.from(allHeaders).sort((a,b) => {
        const mappedA = EXPECTED_IPDR_HEADERS_MAP_LOCAL[a] || a.toLowerCase().replace(/\s+/g, '_').replace(/[^\w_]/gi, '');
        const mappedB = EXPECTED_IPDR_HEADERS_MAP_LOCAL[b] || b.toLowerCase().replace(/\s+/g, '_').replace(/[^\w_]/gi, '');
        const idxA = knownOrder.indexOf(mappedA as keyof IPDRRecord);
        const idxB = knownOrder.indexOf(mappedB as keyof IPDRRecord);

        if (idxA !== -1 && idxB !== -1) return idxA - idxB;
        if (idxA !== -1) return -1;
        if (idxB !== -1) return 1;
        return a.localeCompare(b);
    });

  }, [uploadedIPDRFiles, ipdrFilterState.selectedFileIds, activeFileTabId]);

  const sortedRecords = useMemo(() => {
    let sortableItems = [...filteredIPDRRecords]; 
    if (sortConfig.key !== null) {
      sortableItems.sort((a, b) => {
        const keyForSort = (EXPECTED_IPDR_HEADERS_MAP_LOCAL[sortConfig.key!] || 
                           String(sortConfig.key!).toLowerCase().replace(/\s+/g, '_').replace(/[^\w_]/gi, '')
                           ) as keyof IPDRRecord;

        let valA = a[keyForSort];
        let valB = b[keyForSort];

        if (DATE_IPDR_FIELDS_LOCAL.includes(keyForSort)) {
          valA = parseDateTime(String(valA))?.getTime() ?? 0;
          valB = parseDateTime(String(valB))?.getTime() ?? 0;
        } else if (BYTE_FIELDS_LOCAL.includes(keyForSort) || ['publicPort', 'msPort', 'serverPort'].includes(String(keyForSort))) {
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
  }, [filteredIPDRRecords, sortConfig]);

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
          const mappedKey = (EXPECTED_IPDR_HEADERS_MAP_LOCAL[rawHeaderKey] || 
                             rawHeaderKey.toLowerCase().replace(/\s+/g, '_').replace(/[^\w_]/gi, '')
                            ) as keyof IPDRRecord;
          const value = record[mappedKey];
          if (DATE_IPDR_FIELDS_LOCAL.includes(mappedKey)) {
            return formatDate(String(value));
          }
          if (BYTE_FIELDS_LOCAL.includes(mappedKey)) return formatBytes(Number(value));
          return value ?? 'N/A';
      });
      row.push(record.fileName);
      return row;
    });
    downloadCSV(`ipdr_data_export_${new Date().toISOString().split('T')[0]}.csv`, dataToExport, headersToExport);
  };

  if (isLoading && filteredIPDRRecords.length === 0 && !ipdrFilterState.searchTerm) {
    return <div className="flex justify-center items-center h-64"><div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary-dark"></div><p className="ml-3 text-textSecondary">Loading IPDR data...</p></div>;
  }
  if (error) return <div className="p-4 bg-danger-lighter text-danger-darker rounded-lg text-center border border-danger-light">{error}</div>;
  
  return (
    <div className="space-y-4">
      {filesForTabs.length > 0 && (
         <div className="bg-surface p-3 sm:p-3.5 rounded-xl border border-neutral-light shadow-lg">
          <h3 className="text-xs sm:text-sm font-medium text-textSecondary mb-2 sm:mb-2.5 ml-1">Select File to View:</h3>
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
      
      <div className="flex flex-col sm:flex-row justify-between items-center gap-4 mb-4">
        <h3 className="text-xl font-semibold text-textPrimary">
          Displaying {sortedRecords.length} IPDR Records {activeFileTabId ? `for ${uploadedIPDRFiles.find(f=>f.id === activeFileTabId)?.sourceName || ''}` : ''}
        </h3>
        <div className="flex gap-2.5">
            {sortedRecords.length > 0 && (
              <button
                onClick={handleExportData}
                className="flex items-center px-4 py-2 bg-secondary text-white rounded-lg hover:bg-secondary-dark focus:outline-none focus:ring-2 focus:ring-secondary-light focus:ring-offset-1 transition-colors shadow-md text-sm"
                title="Export current table data to CSV"
              >
                <Download size={16} className="mr-1.5" />
                Export CSV
              </button>
            )}
            <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <FilterIcon className="h-4 w-4 text-neutral-DEFAULT" />
                </div>
                <input type="text" value={localSearchTerm} onChange={handleSearchChange} onKeyDown={(e) => e.key === 'Enter' && applySearch()} placeholder="Search across all IPDR fields..." className="block w-full sm:w-64 pl-10 pr-20 py-2 border border-neutral-light rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-light text-sm shadow-sm"/>
                {localSearchTerm && (<button onClick={clearSearch} className="absolute inset-y-0 right-16 pr-3 flex items-center text-neutral-DEFAULT hover:text-danger-dark" title="Clear search"><XCircle size={16}/></button>)}
                <button onClick={applySearch} className="absolute inset-y-0 right-0 px-3 py-2 bg-primary text-white text-xs font-medium rounded-r-lg hover:bg-primary-dark h-full">Search</button>
            </div>
        </div>
      </div>
      
      
      {filteredIPDRRecords.length === 0 && ipdrFilterState.searchTerm && uploadedIPDRFiles.length > 0 && (
           <div className="p-4 bg-warning-lighter border border-warning-light rounded-lg text-center text-warning-darker flex items-center shadow-md">
             <AlertTriangle size={20} className="mr-2"/> No IPDR records found matching your search term "{ipdrFilterState.searchTerm}".
           </div>
      )}
       {(filteredIPDRRecords.length === 0 && !ipdrFilterState.searchTerm && uploadedIPDRFiles.length > 0 && ipdrFilterState.selectedFileIds.length > 0) && (
         <div className="p-4 bg-info-lighter border border-info-light rounded-lg text-center text-info-dark flex items-center shadow-md">
            <Info size={20} className="mr-2"/> No IPDR records to display for the current selection.
         </div>
       )}
      
      {currentTableData.length > 0 && (
        <>
          <div className="overflow-x-auto bg-surface shadow-xl rounded-xl border border-neutral-light">
            <table className="min-w-full divide-y divide-neutral-light">
              <thead className="bg-neutral-lightest sticky top-0 z-10">
                <tr>
                  {uniqueHeaders.map((rawHeaderKey) => (
                    <th key={rawHeaderKey} scope="col" onClick={() => requestSort(rawHeaderKey)} className="group px-3.5 py-3 text-left text-xs font-semibold text-textPrimary uppercase tracking-wider cursor-pointer hover:bg-neutral-lighter transition-colors whitespace-nowrap">
                      <div className="flex items-center justify-between">
                        {rawHeaderKey} 
                        {renderSortIcon(rawHeaderKey)}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="bg-surface divide-y divide-neutral-light">
                {currentTableData.map((record, index) => {
                  const msisdnWatched = record.msisdn && watchlistContext?.isWatched(record.msisdn);
                  const imsiWatched = record.imsi && watchlistContext?.isWatched(record.imsi);
                  const imeiWatched = record.imeisv && watchlistContext?.isWatched(record.imeisv);
                  const publicIpWatched = record.publicIP && watchlistContext?.isWatched(record.publicIP);
                  const serverIpWatched = record.serverIP && watchlistContext?.isWatched(record.serverIP);

                  const isRowWatched = msisdnWatched || imsiWatched || imeiWatched || publicIpWatched || serverIpWatched;
                  const watchedSuspectName = msisdnWatched?.name || imsiWatched?.name || imeiWatched?.name || publicIpWatched?.name || serverIpWatched?.name;
                  
                  return (
                    <tr 
                      key={record.id} 
                      className={cn(
                        `transition-colors hover:bg-primary-lighter/20`,
                        index % 2 === 0 ? 'bg-surface' : 'bg-neutral-lightest/60',
                        isRowWatched && 'relative border-l-4 border-red-500 bg-red-50 hover:bg-red-100/70'
                      )}
                      title={isRowWatched ? `Watched Suspect: ${watchedSuspectName}` : undefined}
                    >
                      {uniqueHeaders.map(rawHeaderKey => {
                        const mappedKey = (EXPECTED_IPDR_HEADERS_MAP_LOCAL[rawHeaderKey] || 
                                          rawHeaderKey.toLowerCase().replace(/\s+/g, '_').replace(/[^\w_]/gi, '')
                                          ) as keyof IPDRRecord;
                        const cellValue = record[mappedKey];
                        
                        let displayValue: string | number = 'N/A';
                        if (cellValue !== undefined && cellValue !== null && String(cellValue).trim() !== "") {
                          if (DATE_IPDR_FIELDS_LOCAL.includes(mappedKey)) {
                            displayValue = formatDate(String(cellValue));
                          } else if (BYTE_FIELDS_LOCAL.includes(mappedKey)) {
                            displayValue = formatBytes(Number(cellValue));
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
                  );
                })}
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


const IPDRDataView: React.FC = () => {
  return <IPDRDataTable />;
};

export default IPDRDataView;

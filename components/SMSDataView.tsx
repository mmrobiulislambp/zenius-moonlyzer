
import React, { useState, useMemo, useEffect } from 'react';
import { MessageSquare, ChevronDown, ChevronUp, Info, AlertTriangle, ListFilter, Download, FileText, Send, Inbox } from 'lucide-react';
import { useSMSContext } from '../contexts/SMSContext';
import { SMSRecord, SMSFilterState } from '../types';
import { formatDate, parseDateTime } from '../utils/cdrUtils';
import { downloadCSV } from '../utils/downloadUtils';
import SMSFilterControls from './SMSFilterControls'; 

const ROWS_PER_PAGE = 20;

interface SMSSortConfig {
  key: keyof SMSRecord | null;
  direction: 'ascending' | 'descending';
}

// Mapping from common OCR/raw headers to SMSRecord fields
// This helps in fetching the correct data for display, regardless of original header name.
const ocrHeaderToSMSRecordFieldMap: Record<string, keyof SMSRecord> = {
  'StartTime': 'Timestamp',
  'START TIME': 'Timestamp', // From user image
  'A Party': 'PrimaryUserInRecord',
  'A PARTY': 'PrimaryUserInRecord', // From user image
  'B Party': 'OtherPartyOrServiceInRecord',
  'B PARTY': 'OtherPartyOrServiceInRecord', // From user image
  'Direction': 'OriginalDirection',
  'DIRECTION': 'OriginalDirection', // From user image
  'Message Content': 'Content',
  'MESSAGE CONTENT': 'Content', // From user image
  'File Name': 'fileName', // For multi-file display
  'FILE NAME': 'fileName', // From user image
  // SMSRecord fields if used directly as headers
  'Timestamp': 'Timestamp',
  'Initiator': 'Initiator', // Will be filtered out from display
  'Recipient': 'Recipient', // Will be filtered out from display
  'OriginalDirection': 'OriginalDirection',
  'Content': 'Content',
  'PrimaryUserInRecord': 'PrimaryUserInRecord',
  'OtherPartyOrServiceInRecord': 'OtherPartyOrServiceInRecord',
  'fileName': 'fileName',
  // For new fields from user image, they will be treated as custom fields in SMSRecord
  'TEXT FORMAT': 'TEXT FORMAT' as keyof SMSRecord,
  'U T C OFFSET': 'U T C OFFSET' as keyof SMSRecord,
};


const SMSDataView: React.FC = () => {
  const { 
    filteredSMSRecords, 
    isLoading, 
    error, 
    uploadedSMSFiles,
    smsFilterState, 
  } = useSMSContext();
  
  const [currentPage, setCurrentPage] = useState(1);
  const [sortConfig, setSortConfig] = useState<SMSSortConfig>({ key: 'Timestamp', direction: 'descending' });
  const [showFilters, setShowFilters] = useState(false);

  const activeFile = useMemo(() => {
    if (smsFilterState.selectedFileIds.length === 1) {
      return uploadedSMSFiles.find(f => f.id === smsFilterState.selectedFileIds[0]);
    }
    return null;
  }, [uploadedSMSFiles, smsFilterState.selectedFileIds]);

  const uniqueFileHeaders = useMemo(() => {
    const headersSet = new Set<string>();
    // Define the desired display order and fields based on user feedback
    const desiredDisplayHeaders: string[] = [
        'StartTime', // From "START TIME" in image
        'A Party',   // As requested
        'B Party',   // As requested
        'Direction', // From "DIRECTION" in image
        'Message Content', // From "MESSAGE CONTENT" in image
        'TEXT FORMAT', // From image
        'U T C OFFSET', // From image
        'fileName' // Will be shown if multiple files selected
    ];
    
    let filesToConsiderHeadersFrom = uploadedSMSFiles;
    if (smsFilterState.selectedFileIds.length > 0) {
        filesToConsiderHeadersFrom = uploadedSMSFiles.filter(f => smsFilterState.selectedFileIds.includes(f.id));
    }
    
    // Add all headers from the actual files
    if (filesToConsiderHeadersFrom.length > 0 && filesToConsiderHeadersFrom[0].headers.length > 0) {
        filesToConsiderHeadersFrom[0].headers.forEach(h => headersSet.add(h));
    }
    // Ensure desired headers are also in the set if not already from file (e.g. if file has different naming)
    // and also add them if there are no file headers (e.g. placeholder table)
    desiredDisplayHeaders.forEach(dh => headersSet.add(dh));
    
    // Filter out "Initiator" and "Recipient" if they were in raw headers,
    // as per user request to use "A Party" / "B Party" instead.
    const finalHeaders = Array.from(headersSet).filter(h => 
        h.toUpperCase() !== 'INITIATOR' && h.toUpperCase() !== 'RECIPIENT'
    );
    
    // Sort based on desired order, then alphabetically for others
    return finalHeaders.sort((a,b) => {
        // Normalize for comparison against desiredDisplayHeaders (which use specific casing)
        const normA = Object.keys(ocrHeaderToSMSRecordFieldMap).find(k => k.toUpperCase() === a.toUpperCase()) || a;
        const normB = Object.keys(ocrHeaderToSMSRecordFieldMap).find(k => k.toUpperCase() === b.toUpperCase()) || b;

        const idxA = desiredDisplayHeaders.indexOf(normA);
        const idxB = desiredDisplayHeaders.indexOf(normB);

        if (idxA !== -1 && idxB !== -1) return idxA - idxB;
        if (idxA !== -1) return -1;
        if (idxB !== -1) return 1;
        return a.localeCompare(b);
    });

  }, [uploadedSMSFiles, smsFilterState.selectedFileIds]);


  const sortedRecords = useMemo(() => {
    let sortableItems = [...filteredSMSRecords]; 
    if (sortConfig.key !== null) {
      sortableItems.sort((a, b) => {
        const keyA = sortConfig.key!;
        const keyB = sortConfig.key!;
        
        let valA = a[keyA];
        let valB = b[keyB];

        if (keyA === 'Timestamp') {
          valA = parseDateTime(String(a.Timestamp))?.getTime() ?? 0;
          valB = parseDateTime(String(b.Timestamp))?.getTime() ?? 0;
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
  }, [filteredSMSRecords, sortConfig]);

  const currentTableData = useMemo(() => {
    const firstPageIndex = (currentPage - 1) * ROWS_PER_PAGE;
    const lastPageIndex = firstPageIndex + ROWS_PER_PAGE;
    return sortedRecords.slice(firstPageIndex, lastPageIndex);
  }, [currentPage, sortedRecords]);

  const totalPages = Math.ceil(sortedRecords.length / ROWS_PER_PAGE);

  const requestSort = (rawHeaderKey: string) => {
    const sortableKey = ocrHeaderToSMSRecordFieldMap[rawHeaderKey] || (rawHeaderKey as keyof SMSRecord);
    let direction: 'ascending' | 'descending' = 'ascending';
    if (sortConfig.key === sortableKey && sortConfig.direction === 'ascending') {
      direction = 'descending';
    }
    setSortConfig({ key: sortableKey, direction });
    setCurrentPage(1);
  };

  const renderSortIcon = (rawHeaderKey: string) => {
    const sortableKey = ocrHeaderToSMSRecordFieldMap[rawHeaderKey] || (rawHeaderKey as keyof SMSRecord);
    if (sortConfig.key !== sortableKey) return <ChevronDown className="h-4 w-4 text-neutral-DEFAULT opacity-30 group-hover:opacity-100 transition-opacity" />;
    return sortConfig.direction === 'ascending' ? <ChevronUp className="h-4 w-4 text-primary-dark" /> : <ChevronDown className="h-4 w-4 text-primary-dark" />;
  };
  
  const handleExportData = () => {
    if (sortedRecords.length === 0) { alert("No data to export."); return; }
    const headersToExport = [...uniqueFileHeaders] as string[]; 
    
    const dataToExport = sortedRecords.map(record => 
        headersToExport.map(headerKey => {
            const actualFieldKey = ocrHeaderToSMSRecordFieldMap[headerKey] || (headerKey as keyof SMSRecord);
            const value = record[actualFieldKey];
            if (actualFieldKey === 'Timestamp') return formatDate(String(value));
            return value ?? 'N/A';
        })
    );
    const baseFilename = activeFile ? activeFile.sourceName.replace(/[^a-z0-9]/gi, '_').toLowerCase() : "sms_data_export";
    downloadCSV(`${baseFilename}.csv`, dataToExport, headersToExport);
  };

  if (isLoading && filteredSMSRecords.length === 0 && uploadedSMSFiles.length > 0) {
    return <div className="flex justify-center items-center h-64"><div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary-dark"></div><p className="ml-3 text-textSecondary">Applying filters to SMS data...</p></div>;
  }
  if (error) return <div className="p-4 bg-danger-lighter text-danger-darker rounded-lg text-center border border-danger-light">{error}</div>;
  
  const noFilesSelectedForDisplay = uploadedSMSFiles.length > 0 && smsFilterState.selectedFileIds.length === 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row justify-between items-center gap-4 mb-4">
        <h3 className="text-xl font-semibold text-textPrimary">
          SMS Records ({sortedRecords.length})
          {activeFile && <span className="text-sm text-neutral-DEFAULT ml-2">for {activeFile.sourceName}</span>}
          {!activeFile && smsFilterState.selectedFileIds.length > 1 && <span className="text-sm text-neutral-DEFAULT ml-2">(Across {smsFilterState.selectedFileIds.length} files)</span>}
        </h3>
        <div className="flex gap-2.5">
            {sortedRecords.length > 0 && (
              <button onClick={handleExportData} className="flex items-center px-4 py-2 bg-secondary text-white rounded-lg hover:bg-secondary-dark focus:outline-none focus:ring-2 focus:ring-secondary-light focus:ring-offset-1 transition-colors shadow-md text-sm" title="Export current table data to CSV">
                <Download size={16} className="mr-1.5" /> Export CSV
              </button>
            )}
            <button onClick={() => setShowFilters(!showFilters)} className="flex items-center px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-dark focus:outline-none focus:ring-2 focus:ring-primary-light focus:ring-offset-1 transition-colors shadow-md text-sm">
                <ListFilter size={16} className="mr-1.5" /> {showFilters ? 'Hide Filters' : 'Show Filters'}
            </button>
        </div>
      </div>

      {showFilters && <SMSFilterControls />}

      {noFilesSelectedForDisplay && uploadedSMSFiles.length > 0 && (
         <div className="p-4 bg-warning-lighter border border-warning-light rounded-lg text-warning-darker flex items-center shadow-md">
            <AlertTriangle size={20} className="mr-2.5"/>
            Please select SMS files in 'Filter by SMS Files' to view data.
        </div>
      )}
      
      {filteredSMSRecords.length === 0 && uploadedSMSFiles.length > 0 && smsFilterState.selectedFileIds.length > 0 && (
        <div className="p-6 bg-neutral-lightest border border-neutral-light rounded-lg text-center text-textSecondary mt-4 min-h-[100px] flex items-center justify-center">
            No SMS records match the current filters.
        </div>
      )}

      {currentTableData.length > 0 && (
        <>
          <div className="overflow-x-auto bg-surface shadow-xl rounded-xl border border-neutral-light">
            <table className="min-w-full divide-y divide-neutral-light">
              <thead className="bg-neutral-lightest sticky top-0 z-10">
                <tr>
                  {uniqueFileHeaders.map((rawHeaderKey) => (
                    <th key={rawHeaderKey} scope="col" onClick={() => requestSort(rawHeaderKey)} className="group px-3.5 py-3 text-left text-xs font-semibold text-textPrimary uppercase tracking-wider cursor-pointer hover:bg-neutral-lighter transition-colors whitespace-nowrap">
                      <div className="flex items-center justify-between">
                        {rawHeaderKey.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())}
                        {renderSortIcon(rawHeaderKey)}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="bg-surface divide-y divide-neutral-light">
                {currentTableData.map((record, index) => (
                  <tr key={record.id} className={`transition-colors ${index % 2 === 0 ? 'bg-surface' : 'bg-neutral-lightest/60'} hover:bg-primary-lighter/20`}>
                    {uniqueFileHeaders.map(rawHeaderKey => {
                      const actualFieldKey = ocrHeaderToSMSRecordFieldMap[rawHeaderKey] || (rawHeaderKey as keyof SMSRecord);
                      let cellContent: React.ReactNode = record[actualFieldKey] ?? 'N/A';
                      
                      let cellClassName = "px-3.5 py-2.5 text-xs text-textSecondary";

                      if (actualFieldKey === 'Timestamp' && cellContent !== 'N/A') {
                        cellContent = formatDate(String(cellContent));
                        cellClassName += " whitespace-nowrap";
                      } else if (actualFieldKey === 'OriginalDirection' && cellContent !== 'N/A') {
                        cellContent = (
                          <span className="flex items-center">
                            {String(cellContent) === 'SMSMO' ? <Send size={14} className="text-blue-500 mr-1"/> : <Inbox size={14} className="text-green-500 mr-1"/>}
                            {String(cellContent)}
                          </span>
                        );
                        cellClassName += " whitespace-nowrap";
                      } else if (actualFieldKey === 'Content') {
                        cellClassName += " whitespace-normal max-w-md"; // Allow content to wrap
                      } else {
                        cellClassName += " whitespace-nowrap max-w-[200px] truncate";
                      }
                      
                      return (
                        <td 
                          key={`${record.id}-${rawHeaderKey}`} 
                          className={cellClassName}
                          title={actualFieldKey !== 'OriginalDirection' ? (record[actualFieldKey] ?? '').toString() : ''}
                        >
                          {cellContent}
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

export default SMSDataView;

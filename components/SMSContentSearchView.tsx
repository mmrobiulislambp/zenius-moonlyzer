import React, { useState, useMemo, useCallback } from 'react';
import { Search, Download, ListFilter, ChevronDown, ChevronUp, Info, AlertTriangle, MessageSquare, Send, Inbox, FileText as FileTextIcon, Clock } from 'lucide-react'; // Added Clock
import { useSMSContext } from '../contexts/SMSContext';
import { SMSRecord } from '../types';
import { formatDate, parseDateTime } from '../utils/cdrUtils'; // Imported parseDateTime
import { downloadCSV } from '../utils/downloadUtils';

const ROWS_PER_PAGE = 15;

interface SortConfig {
  key: keyof SMSRecord | 'calculatedSender' | 'calculatedRecipient' | null;
  direction: 'ascending' | 'descending';
}

const highlightKeyword = (text: string, keyword: string): React.ReactNode => {
  if (!keyword || !text) {
    return text;
  }
  const regex = new RegExp(`(${keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
  const parts = text.split(regex);

  return (
    <>
      {parts.map((part, index) =>
        regex.test(part) ? (
          <mark key={index} className="bg-yellow-300/70 px-0.5 rounded">
            {part}
          </mark>
        ) : (
          part
        )
      )}
    </>
  );
};


const SMSContentSearchView: React.FC = () => {
  const { filteredSMSRecords: contextFilteredRecords, isLoading: contextIsLoading, uploadedSMSFiles, smsFilterState } = useSMSContext();
  
  const [searchKeyword, setSearchKeyword] = useState('');
  const [submittedKeyword, setSubmittedKeyword] = useState('');
  
  const [currentPage, setCurrentPage] = useState(1);
  const [sortConfig, setSortConfig] = useState<SortConfig>({ key: 'Timestamp', direction: 'descending' });

  const handleSearch = () => {
    setSubmittedKeyword(searchKeyword.trim());
    setCurrentPage(1); // Reset to first page on new search
  };

  const searchResults = useMemo(() => {
    if (!submittedKeyword) {
      return [];
    }
    const lowerKeyword = submittedKeyword.toLowerCase();
    return contextFilteredRecords.filter(sms => 
      sms.Content && sms.Content.toLowerCase().includes(lowerKeyword)
    );
  }, [contextFilteredRecords, submittedKeyword]);

  const sortedResults = useMemo(() => {
    let sortableItems = [...searchResults];
    if (sortConfig.key !== null) {
      sortableItems.sort((a, b) => {
        let valA, valB;

        if (sortConfig.key === 'calculatedSender') {
            valA = a.Initiator;
            valB = b.Initiator;
        } else if (sortConfig.key === 'calculatedRecipient') {
            valA = a.Recipient;
            valB = b.Recipient;
        } else {
            valA = a[sortConfig.key as keyof SMSRecord];
            valB = b[sortConfig.key as keyof SMSRecord];
        }
        
        if (sortConfig.key === 'Timestamp') {
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
  }, [searchResults, sortConfig]);

  const paginatedResults = useMemo(() => {
    const firstPageIndex = (currentPage - 1) * ROWS_PER_PAGE;
    const lastPageIndex = firstPageIndex + ROWS_PER_PAGE;
    return sortedResults.slice(firstPageIndex, lastPageIndex);
  }, [currentPage, sortedResults]);

  const totalPages = Math.ceil(sortedResults.length / ROWS_PER_PAGE);

  const requestSort = (key: keyof SMSRecord | 'calculatedSender' | 'calculatedRecipient') => {
    let direction: 'ascending' | 'descending' = 'ascending';
    if (sortConfig.key === key && sortConfig.direction === 'ascending') {
      direction = 'descending';
    }
    setSortConfig({ key, direction });
    setCurrentPage(1);
  };

  const renderSortIcon = (key: keyof SMSRecord | 'calculatedSender' | 'calculatedRecipient') => {
    if (sortConfig.key !== key) return <ChevronDown className="h-4 w-4 text-neutral-DEFAULT opacity-30 group-hover:opacity-100 transition-opacity" />;
    return sortConfig.direction === 'ascending' ? <ChevronUp className="h-4 w-4 text-primary-dark" /> : <ChevronDown className="h-4 w-4 text-primary-dark" />;
  };

  const handleExportData = () => {
    if (sortedResults.length === 0) {
      alert("No data to export.");
      return;
    }
    const headers = ["Timestamp", "Sender", "Recipient", "Direction", "Content", "Source File"];
    const data = sortedResults.map(sms => [
      formatDate(sms.Timestamp),
      sms.Initiator,
      sms.Recipient,
      sms.OriginalDirection,
      sms.Content,
      sms.fileName
    ]);
    downloadCSV(`sms_content_search_${submittedKeyword.replace(/\s+/g, '_')}.csv`, data, headers);
  };

  const tableHeaders: { key: keyof SMSRecord | 'calculatedSender' | 'calculatedRecipient'; label: string; icon?: React.ReactNode, className?: string }[] = [
    { key: 'Timestamp', label: 'Timestamp', icon: <Clock size={14}/> },
    { key: 'calculatedSender', label: 'Sender', icon: <Send size={14}/> },
    { key: 'calculatedRecipient', label: 'Recipient', icon: <Inbox size={14}/> },
    { key: 'Content', label: 'Content', icon: <MessageSquare size={14}/>, className: "min-w-[300px] max-w-lg"},
  ];
  if (smsFilterState.selectedFileIds.length === 0 || smsFilterState.selectedFileIds.length > 1) {
      tableHeaders.push({ key: 'fileName', label: 'Source File', icon: <FileTextIcon size={14}/> });
  }


  if (contextIsLoading) {
    return <div className="flex justify-center items-center h-64"><div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary-dark"></div><p className="ml-3 text-textSecondary">Loading SMS data...</p></div>;
  }
  if (uploadedSMSFiles.length === 0 && !contextIsLoading) {
     return <div className="p-6 bg-info-lighter border border-info-light rounded-lg text-center text-info-dark flex flex-col items-center justify-center min-h-[150px] shadow-md"><Info size={28} className="mb-2" /><p className="font-medium">Please upload SMS data files to enable content search.</p></div>;
  }
   if (contextFilteredRecords.length === 0 && uploadedSMSFiles.length > 0 && !contextIsLoading && !submittedKeyword) {
    return <div className="p-6 bg-neutral-lightest border border-neutral-light rounded-lg text-center text-textSecondary flex flex-col items-center justify-center min-h-[150px] shadow-md"><Info size={28} className="mb-2 text-neutral-DEFAULT" /><p>No SMS records available to search. This might be due to active global filters or no files selected.</p></div>;
  }


  return (
    <div className="space-y-5">
      <div className="p-4 sm:p-5 bg-surface border border-neutral-light rounded-xl shadow-xl">
        <div className="flex items-center text-xl sm:text-2xl font-semibold text-textPrimary mb-1">
          <Search size={24} className="mr-2.5 text-primary" /> SMS Content Search
        </div>
        <p className="text-sm text-textSecondary">Search for keywords within the content of SMS messages. Results are based on currently applied global filters.</p>
        <div className="mt-4 flex flex-col sm:flex-row gap-3 items-stretch">
          <input
            type="text"
            value={searchKeyword}
            onChange={(e) => setSearchKeyword(e.target.value)}
            placeholder="Enter keyword to search in SMS content..."
            className="flex-grow p-2.5 border border-neutral-light rounded-lg focus:ring-2 focus:ring-primary-light focus:border-primary-light text-sm shadow-sm bg-surface placeholder-neutral-DEFAULT"
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          />
          <button
            onClick={handleSearch}
            disabled={!searchKeyword.trim()}
            className="px-6 py-2.5 bg-primary text-white rounded-lg hover:bg-primary-dark text-sm font-medium shadow-md hover:shadow-lg transition-all disabled:opacity-60 flex items-center justify-center"
          >
            <Search size={16} className="mr-2" /> Search Content
          </button>
        </div>
      </div>

      {submittedKeyword && (
        <div className="p-4 sm:p-5 bg-surface border border-neutral-light rounded-xl shadow-xl">
          <div className="flex flex-col sm:flex-row justify-between items-center mb-4">
            <h3 className="text-lg font-semibold text-textPrimary mb-2 sm:mb-0">
              Search Results for "{submittedKeyword}" ({sortedResults.length} found)
            </h3>
            {sortedResults.length > 0 && (
              <button 
                onClick={handleExportData}
                className="px-4 py-2 text-xs bg-secondary text-white rounded-lg hover:bg-secondary-dark focus:outline-none focus:ring-2 focus:ring-secondary-light focus:ring-offset-1 flex items-center shadow-md"
              >
                <Download size={14} className="mr-1.5" /> Export Results
              </button>
            )}
          </div>

          {sortedResults.length === 0 ? (
            <div className="p-6 bg-warning-lighter border border-warning-light rounded-lg text-center text-warning-darker flex flex-col items-center justify-center min-h-[100px] shadow-sm">
              <AlertTriangle size={24} className="mb-2" />
              <p>No SMS messages found containing "{submittedKeyword}".</p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-neutral-light">
                  <thead className="bg-neutral-lightest sticky top-0 z-10">
                    <tr>
                      {tableHeaders.map((header) => (
                        <th key={String(header.key)} scope="col" onClick={() => requestSort(header.key)} className={`group px-3.5 py-3 text-left text-xs font-semibold text-textPrimary uppercase tracking-wider cursor-pointer hover:bg-neutral-lighter transition-colors whitespace-nowrap ${header.className || ''}`}>
                          <div className="flex items-center justify-between">
                            {header.icon && <span className="mr-1.5 text-neutral-DEFAULT group-hover:text-primary">{header.icon}</span>}
                            {header.label}
                            {renderSortIcon(header.key)}
                          </div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="bg-surface divide-y divide-neutral-light">
                    {paginatedResults.map((sms, index) => (
                      <tr key={sms.id + index} className={`transition-colors ${index % 2 === 0 ? 'bg-surface' : 'bg-neutral-lightest/60'} hover:bg-primary-lighter/20`}>
                        {tableHeaders.map(header => {
                             let cellContent: React.ReactNode;
                             let titleContent: string | undefined = undefined;
                             let cellClassName = "px-3.5 py-2.5 text-xs text-textSecondary";

                            if (header.key === 'Timestamp') {
                                cellContent = formatDate(sms.Timestamp);
                                cellClassName += " whitespace-nowrap";
                            } else if (header.key === 'calculatedSender') {
                                cellContent = sms.Initiator;
                                cellClassName += " whitespace-nowrap";
                            } else if (header.key === 'calculatedRecipient') {
                                cellContent = sms.Recipient;
                                cellClassName += " whitespace-nowrap";
                            } else if (header.key === 'Content') {
                                cellContent = highlightKeyword(sms.Content, submittedKeyword);
                                titleContent = sms.Content; // Full content for tooltip
                                cellClassName += ` whitespace-normal ${header.className || ''}`;
                            } else if (header.key === 'fileName') {
                                cellContent = sms.fileName;
                                cellClassName += " whitespace-nowrap max-w-[150px] truncate";
                                titleContent = sms.fileName;
                            } else {
                                cellContent = (sms[header.key as keyof SMSRecord] as string) ?? 'N/A';
                                cellClassName += " whitespace-nowrap";
                            }
                            return <td key={String(header.key)} className={cellClassName} title={titleContent}>{cellContent}</td>;
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {totalPages > 1 && (
                <div className="flex flex-col sm:flex-row justify-between items-center mt-4 py-3 px-1">
                  <span className="text-sm text-textSecondary mb-2 sm:mb-0">Page {currentPage} of {totalPages} (Total: {sortedResults.length} records)</span>
                  <div className="flex gap-2">
                    <button onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))} disabled={currentPage === 1} className="px-4 py-2 text-sm font-medium text-textPrimary bg-surface border border-neutral-light rounded-lg shadow-sm hover:bg-neutral-lighter disabled:opacity-50">Previous</button>
                    <button onClick={() => setCurrentPage((prev) => Math.min(prev + 1, totalPages))} disabled={currentPage === totalPages} className="px-4 py-2 text-sm font-medium text-textPrimary bg-surface border border-neutral-light rounded-lg shadow-sm hover:bg-neutral-lighter disabled:opacity-50">Next</button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}
      {!submittedKeyword && contextFilteredRecords.length > 0 && (
         <div className="p-6 bg-neutral-lightest border border-neutral-light rounded-lg text-center text-textSecondary flex flex-col items-center justify-center min-h-[150px] shadow-md">
            <Info size={28} className="mb-2 text-neutral-DEFAULT" />
            <p>Enter a keyword above and click "Search Content" to find matching SMS messages.</p>
        </div>
      )}
    </div>
  );
};

export default SMSContentSearchView;
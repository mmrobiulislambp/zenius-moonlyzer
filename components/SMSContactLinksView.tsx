
import React, { useState, useMemo, useCallback } from 'react';
import { Users2, Download, ListFilter, ChevronDown, ChevronUp, Info, MessageSquare, Send, Inbox, Clock, FileText as FileTextIcon, Eye, X, Search as SearchIcon, AlertTriangle } from 'lucide-react'; // Added AlertTriangle
import { useSMSContext } from '../contexts/SMSContext';
import { SMSRecord } from '../types';
import { formatDate, parseDateTime } from '../utils/cdrUtils';
import { downloadCSV } from '../utils/downloadUtils';

const ROWS_PER_PAGE_LINKS = 10;
const ROWS_PER_PAGE_MODAL_SMS = 10;

interface ContactLink {
  party1: string;
  party2: string;
  party1ToParty2Count: number;
  party2ToParty1Count: number;
  totalMessages: number;
  firstInteraction?: Date;
  lastInteraction?: Date;
  records: SMSRecord[];
}

interface SortConfig {
  key: keyof ContactLink | null;
  direction: 'ascending' | 'descending';
}

interface ModalSortConfig {
    key: keyof SMSRecord | null;
    direction: 'ascending' | 'descending';
}

const SMSContactLinksView: React.FC = () => {
  const { filteredSMSRecords, isLoading: contextIsLoading, uploadedSMSFiles, smsFilterState } = useSMSContext();
  
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [sortConfig, setSortConfig] = useState<SortConfig>({ key: 'totalMessages', direction: 'descending' });

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedLinkDetails, setSelectedLinkDetails] = useState<ContactLink | null>(null);
  const [modalCurrentPage, setModalCurrentPage] = useState(1);
  const [modalSortConfig, setModalSortConfig] = useState<ModalSortConfig>({ key: 'Timestamp', direction: 'descending' });
  const [modalTitle, setModalTitle] = useState('');


  const contactLinksData = useMemo((): ContactLink[] => {
    if (contextIsLoading) return [];

    const linksMap = new Map<string, ContactLink>();

    filteredSMSRecords.forEach(sms => {
      if (!sms.Initiator || !sms.Recipient) return;

      const parties = [sms.Initiator, sms.Recipient].sort();
      const linkKey = `${parties[0]}<->${parties[1]}`;

      let link = linksMap.get(linkKey);
      if (!link) {
        link = {
          party1: parties[0],
          party2: parties[1],
          party1ToParty2Count: 0,
          party2ToParty1Count: 0,
          totalMessages: 0,
          records: [],
        };
      }

      link.totalMessages++;
      link.records.push(sms);
      const smsTimestamp = parseDateTime(sms.Timestamp);

      if (smsTimestamp) {
        if (!link.firstInteraction || smsTimestamp < link.firstInteraction) {
          link.firstInteraction = smsTimestamp;
        }
        if (!link.lastInteraction || smsTimestamp > link.lastInteraction) {
          link.lastInteraction = smsTimestamp;
        }
      }
      
      if (sms.Initiator === link.party1 && sms.Recipient === link.party2) {
        link.party1ToParty2Count++;
      } else if (sms.Initiator === link.party2 && sms.Recipient === link.party1) {
        link.party2ToParty1Count++;
      }
      
      linksMap.set(linkKey, link);
    });

    return Array.from(linksMap.values());
  }, [filteredSMSRecords, contextIsLoading]);

  const filteredContactLinks = useMemo(() => {
    if (!searchTerm) return contactLinksData;
    const lowerSearchTerm = searchTerm.toLowerCase();
    return contactLinksData.filter(link =>
      link.party1.toLowerCase().includes(lowerSearchTerm) ||
      link.party2.toLowerCase().includes(lowerSearchTerm)
    );
  }, [contactLinksData, searchTerm]);

  const sortedContactLinks = useMemo(() => {
    return [...filteredContactLinks].sort((a, b) => {
      const valA = a[sortConfig.key!];
      const valB = b[sortConfig.key!];
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
  }, [filteredContactLinks, sortConfig]);

  const paginatedContactLinks = useMemo(() => {
    const startIndex = (currentPage - 1) * ROWS_PER_PAGE_LINKS;
    return sortedContactLinks.slice(startIndex, startIndex + ROWS_PER_PAGE_LINKS);
  }, [sortedContactLinks, currentPage]);

  const totalLinkPages = Math.ceil(sortedContactLinks.length / ROWS_PER_PAGE_LINKS);

  const requestSort = (key: keyof ContactLink) => {
    let direction: 'ascending' | 'descending' = 'descending';
    if (sortConfig.key === key && sortConfig.direction === 'descending') {
      direction = 'ascending';
    }
    setSortConfig({ key, direction });
    setCurrentPage(1);
  };

  const renderSortIcon = (key: keyof ContactLink) => {
    if (sortConfig.key !== key) return <ChevronDown size={14} className="ml-1 text-neutral-DEFAULT opacity-30 group-hover:opacity-100 inline" />;
    return sortConfig.direction === 'ascending' ? <ChevronUp size={14} className="ml-1 text-primary inline" /> : <ChevronDown size={14} className="ml-1 text-primary inline" />;
  };
  
  const sortedModalRecords = useMemo(() => {
    if (!selectedLinkDetails) return [];
    return [...selectedLinkDetails.records].sort((a,b) => {
        const valA = a[modalSortConfig.key!];
        const valB = b[modalSortConfig.key!];
        if (modalSortConfig.key === 'Timestamp') {
          return modalSortConfig.direction === 'ascending' ? 
                 (parseDateTime(String(valA))?.getTime() ?? 0) - (parseDateTime(String(valB))?.getTime() ?? 0) :
                 (parseDateTime(String(valB))?.getTime() ?? 0) - (parseDateTime(String(valA))?.getTime() ?? 0);
        }
        // Add other type-specific comparisons if needed
        if (typeof valA === 'string' && typeof valB === 'string') {
          return modalSortConfig.direction === 'ascending' ? valA.localeCompare(valB) : valB.localeCompare(valA);
        }
        return 0;
    });
  }, [selectedLinkDetails, modalSortConfig]);

  const paginatedModalRecords = useMemo(() => {
    const startIndex = (modalCurrentPage - 1) * ROWS_PER_PAGE_MODAL_SMS;
    return sortedModalRecords.slice(startIndex, startIndex + ROWS_PER_PAGE_MODAL_SMS);
  }, [sortedModalRecords, modalCurrentPage]);
  const totalModalPages = selectedLinkDetails ? Math.ceil(selectedLinkDetails.records.length / ROWS_PER_PAGE_MODAL_SMS) : 0;

  const requestModalSort = (key: keyof SMSRecord) => {
    let direction: 'ascending' | 'descending' = 'descending';
    if(modalSortConfig.key === key && modalSortConfig.direction === 'descending') direction = 'ascending';
    setModalSortConfig({key, direction});
    setModalCurrentPage(1);
  };
  const renderModalSortIcon = (key: keyof SMSRecord) => {
    if (modalSortConfig.key !== key) return <ChevronDown size={12} className="ml-1 text-neutral-DEFAULT opacity-30 group-hover:opacity-100 inline" />;
    return modalSortConfig.direction === 'ascending' ? <ChevronUp size={12} className="ml-1 text-primary inline" /> : <ChevronDown size={12} className="ml-1 text-primary inline" />;
  };


  const handleViewDetails = (link: ContactLink) => {
    setSelectedLinkDetails(link);
    // Access targetSummary from context or state if needed, for now, let's simplify the title if targetSummary is not readily available or relevant here.
    // If you have a global target or need to pass it, adjust accordingly.
    // For this component's context, party1 and party2 of the link are most direct.
    setModalTitle(`Messages: ${link.party1} & ${link.party2}`);
    setIsModalOpen(true);
    setModalCurrentPage(1);
  };

  const handleExportLinks = () => {
    const headers = ["Party 1", "Party 2", "Party1 -> Party2 Count", "Party2 -> Party1 Count", "Total Messages", "First Interaction", "Last Interaction"];
    const data = sortedContactLinks.map(link => [
      link.party1,
      link.party2,
      String(link.party1ToParty2Count),
      String(link.party2ToParty1Count),
      String(link.totalMessages),
      link.firstInteraction ? formatDate(link.firstInteraction.toISOString()) : 'N/A',
      link.lastInteraction ? formatDate(link.lastInteraction.toISOString()) : 'N/A',
    ]);
    downloadCSV(`sms_contact_links_summary_${new Date().toISOString().split('T')[0]}.csv`, data, headers);
  };

  const handleExportModalMessages = () => {
    if (!selectedLinkDetails) return;
    const headers = ["Timestamp", "Sender (Initiator)", "Recipient", "Content", "Source File", "Original Direction"];
    const data = selectedLinkDetails.records.map(sms => [
      formatDate(sms.Timestamp),
      sms.Initiator,
      sms.Recipient,
      sms.Content,
      sms.fileName,
      sms.OriginalDirection
    ]);
    // Use the modalTitle state variable for the filename
    downloadCSV(`sms_link_details_${modalTitle.replace(/[^a-z0-9&]/gi, '_').replace(/&/g, 'vs')}.csv`, data, headers);
  };
  
  const mainTableHeaders: { key: keyof ContactLink; label: string; icon?: React.ReactNode; className?: string}[] = [
    { key: 'party1', label: 'Party 1', icon: <Users2 size={14}/> },
    { key: 'party2', label: 'Party 2', icon: <Users2 size={14}/> },
    { key: 'party1ToParty2Count', label: 'P1 ➔ P2', icon: <Send size={14}/>, className:"text-center" },
    { key: 'party2ToParty1Count', label: 'P2 ➔ P1', icon: <Inbox size={14}/>, className:"text-center" },
    { key: 'totalMessages', label: 'Total', icon: <MessageSquare size={14}/>, className:"text-center" },
    { key: 'firstInteraction', label: 'First Interaction', icon: <Clock size={14}/> },
    { key: 'lastInteraction', label: 'Last Interaction', icon: <Clock size={14}/> },
  ];

  const modalTableHeaders: { key: keyof SMSRecord; label: string; icon?: React.ReactNode, className?: string }[] = [
    { key: 'Timestamp', label: 'Timestamp', icon: <Clock size={12}/> },
    { key: 'Initiator', label: 'Sender', icon: <Send size={12}/> },
    { key: 'Recipient', label: 'Recipient', icon: <Inbox size={12}/> },
    { key: 'Content', label: 'Content', icon: <MessageSquare size={12}/>, className: "min-w-[250px] max-w-md"}, // Allow content to wrap
    { key: 'fileName', label: 'Source File', icon: <FileTextIcon size={12}/> },
  ];

  if (contextIsLoading && contactLinksData.length === 0) {
    return <div className="flex justify-center items-center h-64"><div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary-dark"></div><p className="ml-3 text-textSecondary">Analyzing SMS links...</p></div>;
  }
  if (uploadedSMSFiles.length === 0 && !contextIsLoading) {
     return <div className="p-6 bg-info-lighter border border-info-light rounded-lg text-center text-info-dark flex flex-col items-center justify-center min-h-[150px] shadow-md"><Info size={28} className="mb-2" /><p className="font-medium">Please upload SMS data files to analyze contact links.</p></div>;
  }
   if (contactLinksData.length === 0 && !contextIsLoading) {
    return (
        <div className="p-6 bg-neutral-lightest border border-neutral-light rounded-lg text-center text-textSecondary flex flex-col items-center justify-center min-h-[150px] shadow-md">
        <Users2 size={28} className="mb-2 text-neutral-DEFAULT" />
        <p>No contact links found in the current SMS data.</p>
        <p className="text-xs mt-1">This could be due to filters or the nature of the data.</p>
        </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="p-4 sm:p-5 bg-surface border border-neutral-light rounded-xl shadow-xl">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-3">
            <div>
                <div className="flex items-center text-xl sm:text-2xl font-semibold text-textPrimary mb-1">
                    <Users2 size={24} className="mr-2.5 text-primary" /> SMS Contact Links Analysis
                </div>
                <p className="text-sm text-textSecondary">Identified {contactLinksData.length} unique communication links.</p>
            </div>
            {sortedContactLinks.length > 0 && (
                <button onClick={handleExportLinks} className="mt-3 sm:mt-0 px-3.5 py-2 text-xs sm:text-sm bg-secondary text-white rounded-lg hover:bg-secondary-dark focus:outline-none focus:ring-2 focus:ring-secondary-light focus:ring-offset-1 flex items-center shadow-md hover:shadow-lg transition-all"> <Download size={15} className="mr-1.5" /> Export Links Summary </button>
            )}
        </div>
         <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <SearchIcon size={16} className="text-neutral-DEFAULT" />
            </div>
            <input 
                type="text" 
                placeholder="Search by number..." 
                value={searchTerm} 
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full sm:w-72 px-3 py-2 pl-10 border border-neutral-light rounded-lg focus:ring-2 focus:ring-primary-light focus:border-primary-light text-sm shadow-sm placeholder-neutral-DEFAULT"
            />
        </div>
      </div>

      {filteredContactLinks.length === 0 && searchTerm && (
         <div className="p-4 bg-warning-lighter border border-warning-light rounded-lg text-center text-warning-darker flex items-center shadow-md">
            <AlertTriangle size={20} className="mr-2"/> No links found matching "{searchTerm}".
        </div>
      )}

      {filteredContactLinks.length > 0 && (
        <div className="bg-surface shadow-xl rounded-xl border border-neutral-light overflow-x-auto">
          <table className="min-w-full divide-y divide-neutral-light">
            <thead className="bg-neutral-lightest sticky top-0 z-10">
              <tr>
                {mainTableHeaders.map(h => (
                  <th key={String(h.key)} onClick={() => requestSort(h.key!)} className={`group px-3 py-3 text-left text-xs font-semibold text-textPrimary uppercase tracking-wider cursor-pointer hover:bg-neutral-lighter transition-colors whitespace-nowrap ${h.className || ''}`}>
                    <div className="flex items-center">{h.icon && <span className="mr-1.5 text-neutral-DEFAULT group-hover:text-primary">{h.icon}</span>}{h.label}{renderSortIcon(h.key!)}</div>
                  </th>
                ))}
                <th className="px-3 py-3 text-left text-xs font-semibold text-textPrimary uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-surface divide-y divide-neutral-light">
              {paginatedContactLinks.map((link) => (
                <tr key={`${link.party1}-${link.party2}`} className="hover:bg-neutral-lightest/50">
                  <td className="px-3 py-2.5 whitespace-nowrap text-xs text-textPrimary font-medium">{link.party1}</td>
                  <td className="px-3 py-2.5 whitespace-nowrap text-xs text-textPrimary font-medium">{link.party2}</td>
                  <td className="px-3 py-2.5 whitespace-nowrap text-xs text-textSecondary text-center">{link.party1ToParty2Count}</td>
                  <td className="px-3 py-2.5 whitespace-nowrap text-xs text-textSecondary text-center">{link.party2ToParty1Count}</td>
                  <td className="px-3 py-2.5 whitespace-nowrap text-xs text-textSecondary text-center">{link.totalMessages}</td>
                  <td className="px-3 py-2.5 whitespace-nowrap text-xs text-textSecondary">{link.firstInteraction ? formatDate(link.firstInteraction.toISOString()) : 'N/A'}</td>
                  <td className="px-3 py-2.5 whitespace-nowrap text-xs text-textSecondary">{link.lastInteraction ? formatDate(link.lastInteraction.toISOString()) : 'N/A'}</td>
                  <td className="px-3 py-2.5 whitespace-nowrap text-xs">
                    <button onClick={() => handleViewDetails(link)} className="text-primary-dark hover:underline flex items-center"><Eye size={14} className="mr-1"/>Details</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {filteredContactLinks.length > 0 && totalLinkPages > 1 && (
        <div className="flex flex-col sm:flex-row justify-between items-center mt-4 py-3 px-1">
          <span className="text-sm text-textSecondary mb-2 sm:mb-0">Page {currentPage} of {totalLinkPages} (Total: {sortedContactLinks.length} links)</span>
          <div className="flex gap-2">
            <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1} className="px-3 py-1.5 text-xs font-medium text-textPrimary bg-surface border border-neutral-light rounded-lg shadow-sm hover:bg-neutral-lighter disabled:opacity-50">Previous</button>
            <button onClick={() => setCurrentPage(p => Math.min(totalLinkPages, p + 1))} disabled={currentPage === totalLinkPages} className="px-3 py-1.5 text-xs font-medium text-textPrimary bg-surface border border-neutral-light rounded-lg shadow-sm hover:bg-neutral-lighter disabled:opacity-50">Next</button>
          </div>
        </div>
      )}
      
      {isModalOpen && selectedLinkDetails && (
        <div className="fixed inset-0 bg-neutral-darkest/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setIsModalOpen(false)}>
          <div className="bg-surface rounded-xl shadow-2xl w-full max-w-3xl max-h-[90vh] p-5 sm:p-6 border border-neutral-light flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-3 pb-2 border-b border-neutral-light">
              <h3 className="text-md font-semibold text-textPrimary truncate" title={modalTitle}>{modalTitle}</h3>
              <button onClick={() => setIsModalOpen(false)} className="text-neutral-DEFAULT hover:text-danger-dark p-1 rounded-full hover:bg-danger-lighter/50"><X size={20}/></button>
            </div>
            <div className="flex-grow overflow-y-auto scrollbar-thin pr-1">
                 <div className="flex justify-end mb-2">
                     <button onClick={handleExportModalMessages} className="px-2.5 py-1 text-[10px] bg-info-lighter/60 text-info-dark rounded-md hover:bg-info-lighter/80 font-medium flex items-center shadow-sm"><Download size={12} className="mr-1"/>Export Messages</button>
                </div>
              <table className="min-w-full divide-y divide-neutral-light text-[11px]">
                <thead className="bg-neutral-lightest sticky top-0 z-10">
                    <tr>{modalTableHeaders.map(h => <th key={String(h.key)} onClick={() => requestModalSort(h.key!)} className={`group px-2 py-1.5 text-left font-semibold text-textPrimary uppercase tracking-wider cursor-pointer hover:bg-neutral-light ${h.className || ''}`}><div className="flex items-center">{h.icon && <span className="mr-1 text-neutral-DEFAULT group-hover:text-primary">{h.icon}</span>}{h.label}{renderModalSortIcon(h.key!)}</div></th>)}</tr>
                </thead>
                <tbody className="bg-surface divide-y divide-neutral-light">
                  {paginatedModalRecords.map((sms, idx) => (
                    <tr key={sms.id + idx} className="hover:bg-neutral-lightest/50">
                      {modalTableHeaders.map(header => {
                        const cellValue = sms[header.key!];
                        let displayValue: React.ReactNode = String(cellValue ?? 'N/A');
                        if (header.key === 'Timestamp' && cellValue) {
                          displayValue = formatDate(String(cellValue));
                        }
                        return (
                          <td 
                            key={String(header.key)} 
                            className={`px-2 py-1 whitespace-nowrap text-textSecondary ${header.className || (header.key === 'Content' ? '' : 'truncate max-w-[120px]')}`} 
                            title={String(cellValue ?? '')}
                          >
                            {header.key === 'Content' ? <div className="whitespace-normal break-words">{displayValue}</div> : displayValue}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {totalModalPages > 1 && (
              <div className="flex flex-col sm:flex-row justify-between items-center mt-2 pt-2 border-t border-neutral-light text-[10px]">
                <span className="text-textSecondary mb-1 sm:mb-0">Page {modalCurrentPage} of {totalModalPages} ({selectedLinkDetails.records.length} messages)</span>
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

export default SMSContactLinksView;

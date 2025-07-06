
import React, { useState, useMemo } from 'react';
import { Users2, ArrowRightLeft, Download, Clock, ListFilter, ChevronDown, ChevronUp, Info, Send, Inbox, DollarSign, Pocket, Eye } from 'lucide-react';
import { useBkashContext } from '../contexts/BkashContext';
import { BkashRecord, MFSFrequentContactInteractionDetail } from '../types';
import { formatDate, parseDateTime } from '../utils/cdrUtils';
import { downloadCSV } from '../utils/downloadUtils';
import MFSFrequentContactDetailModal from './MFSFrequentContactDetailModal'; // Import the new modal

const ROWS_PER_PAGE = 10;

interface FrequentContactSummary {
  contactAccountNumber: string;
  sentFromStatementCount: number;
  sentFromStatementAmount: number;
  receivedByStatementCount: number;
  receivedByStatementAmount: number;
  totalInteractions: number;
  firstInteractionDate?: Date;
  lastInteractionDate?: Date;
}

interface SortConfig {
  key: keyof FrequentContactSummary | null;
  direction: 'ascending' | 'descending';
}

const formatCurrencyShort = (amount: number) => {
  if (amount >= 1_000_000_000) return `${(amount / 1_000_000_000).toFixed(1)}B`;
  if (amount >= 1_000_000) return `${(amount / 1_000_000).toFixed(1)}M`;
  if (amount >= 1_000) return `${(amount / 1_000).toFixed(1)}K`;
  return amount.toFixed(0);
};

const BkashFrequentContactsView: React.FC = () => {
  const { globallyFilteredBkashRecords, isLoading, error, uploadedBkashFiles } = useBkashContext();
  const [currentPage, setCurrentPage] = useState(1);
  const [sortConfig, setSortConfig] = useState<SortConfig>({ key: 'totalInteractions', direction: 'descending' });

  const [selectedContactDetails, setSelectedContactDetails] = useState<MFSFrequentContactInteractionDetail | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const frequentContactsData = useMemo((): FrequentContactSummary[] => {
    if (globallyFilteredBkashRecords.length === 0) return [];

    const contactsMap = new Map<string, FrequentContactSummary>();
    // Heuristic: Assume the most frequent 'sender' or 'receiver' in the first few records (if available) is the statement owner.
    // This is a simplification. A more robust solution might require user input or specific data structure.
    let statementOwnerAccount: string | null = null;
    if (globallyFilteredBkashRecords.length > 0) {
        const potentialOwners: Record<string, number> = {};
        globallyFilteredBkashRecords.slice(0, 20).forEach(r => { // Check first 20 records
            if(r.sender) potentialOwners[r.sender] = (potentialOwners[r.sender] || 0) + 1;
            if(r.receiver) potentialOwners[r.receiver] = (potentialOwners[r.receiver] || 0) + 1;
        });
        if (Object.keys(potentialOwners).length > 0) {
            statementOwnerAccount = Object.keys(potentialOwners).reduce((a,b) => potentialOwners[a] > potentialOwners[b] ? a : b);
        }
    }


    globallyFilteredBkashRecords.forEach(record => {
      let otherParty: string | undefined = undefined;
      let isSentFromStatement = false; // True if statement account sent money to otherParty

      // If 'sender' is the statement owner and it's a DEBIT type action (e.g. Send Money, Payment)
      if (record.sender === statementOwnerAccount && record.transactionDirection === 'DEBIT') {
        otherParty = record.receiver;
        isSentFromStatement = true;
      } 
      // If 'receiver' is the statement owner and it's a CREDIT type action (e.g. Cash In, Receive Money)
      else if (record.receiver === statementOwnerAccount && record.transactionDirection === 'CREDIT') {
        otherParty = record.sender;
        isSentFromStatement = false; // Statement account received money from otherParty
      } 
      // If transactionDirection is not clear, or owner is not clear, infer based on sender/receiver
      // This part might need more robust logic if statementOwnerAccount is not reliably determined
      else if (record.sender === statementOwnerAccount) { // Assume sender is owner for other DEBIT types
          otherParty = record.receiver;
          isSentFromStatement = true;
      } else if (record.receiver === statementOwnerAccount) { // Assume receiver is owner for other CREDIT types
          otherParty = record.sender;
          isSentFromStatement = false;
      } else if (record.sender && record.sender !== record.receiver) { // Fallback: one is owner, one is other
          // This needs a clear owner. For now, let's assume if sender is NOT system/empty, they are primary actor.
          // And if this record.sender is not the statementOwnerAccount, this logic is tricky.
          // Let's simplify: if owner is not clearly one of sender/receiver, what to do?
          // For this view, we are interested in *contacts* of the statement account.
          // So one of them MUST be the statement account.
          // The previous if/else if should cover this. If not, it's an edge case.
          // We'll primarily rely on statementOwnerAccount matching either sender or receiver.
          // If statementOwnerAccount is null, this entire logic is less reliable.
          // For now, if we can't determine, we'll skip to avoid misattribution.
          return;
      }


      if (!otherParty || otherParty.trim() === '' || otherParty.toLowerCase() === 'system' || (statementOwnerAccount && otherParty === statementOwnerAccount)) {
        return;
      }

      let entry = contactsMap.get(otherParty);
      if (!entry) {
        entry = {
          contactAccountNumber: otherParty,
          sentFromStatementCount: 0,
          sentFromStatementAmount: 0,
          receivedByStatementCount: 0,
          receivedByStatementAmount: 0,
          totalInteractions: 0,
        };
      }

      entry.totalInteractions++;
      const recordDate = parseDateTime(record.transactionDate);
      if (recordDate) {
        if (!entry.firstInteractionDate || recordDate < entry.firstInteractionDate) entry.firstInteractionDate = recordDate;
        if (!entry.lastInteractionDate || recordDate > entry.lastInteractionDate) entry.lastInteractionDate = recordDate;
      }
      
      if (isSentFromStatement) {
        entry.sentFromStatementCount++;
        entry.sentFromStatementAmount += record.transactedAmount;
      } else { // Received by statement account from otherParty
        entry.receivedByStatementCount++;
        entry.receivedByStatementAmount += record.transactedAmount;
      }
      contactsMap.set(otherParty, entry);
    });

    return Array.from(contactsMap.values()).filter(contact => contact.totalInteractions >= 2);
  }, [globallyFilteredBkashRecords]);

  const sortedFrequentContacts = useMemo(() => {
    return [...frequentContactsData].sort((a, b) => {
      if (!sortConfig.key) return 0;
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
  }, [frequentContactsData, sortConfig]);

  const paginatedFrequentContacts = useMemo(() => {
    const startIndex = (currentPage - 1) * ROWS_PER_PAGE;
    return sortedFrequentContacts.slice(startIndex, startIndex + ROWS_PER_PAGE);
  }, [sortedFrequentContacts, currentPage]);

  const totalPages = Math.ceil(sortedFrequentContacts.length / ROWS_PER_PAGE);

  const requestSort = (key: keyof FrequentContactSummary) => {
    let direction: 'ascending' | 'descending' = 'descending';
    if (sortConfig.key === key && sortConfig.direction === 'descending') {
      direction = 'ascending';
    }
    setSortConfig({ key, direction });
    setCurrentPage(1);
  };

  const renderSortIcon = (key: keyof FrequentContactSummary) => {
    if (sortConfig.key !== key) return <ListFilter size={14} className="ml-1 text-neutral-DEFAULT opacity-30 group-hover:opacity-100 inline" />;
    return sortConfig.direction === 'ascending' ? <ChevronUp size={14} className="ml-1 text-pink-600 inline" /> : <ChevronDown size={14} className="ml-1 text-pink-600 inline" />;
  };

  const handleExportData = () => {
    if (sortedFrequentContacts.length === 0) { alert("No data to export."); return; }
    const headers = ["Contact Account", "Sent from Statement (Count)", "Sent from Statement (Amount)", "Received by Statement (Count)", "Received by Statement (Amount)", "Total Interactions", "First Interaction", "Last Interaction"];
    const data = sortedFrequentContacts.map(contact => [
      contact.contactAccountNumber,
      String(contact.sentFromStatementCount),
      String(contact.sentFromStatementAmount.toFixed(2)),
      String(contact.receivedByStatementCount),
      String(contact.receivedByStatementAmount.toFixed(2)),
      String(contact.totalInteractions),
      contact.firstInteractionDate ? formatDate(contact.firstInteractionDate.toISOString()) : 'N/A',
      contact.lastInteractionDate ? formatDate(contact.lastInteractionDate.toISOString()) : 'N/A',
    ]);
    downloadCSV(`bkash_frequent_contacts_${new Date().toISOString().split('T')[0]}.csv`, data, headers);
  };

  const handleRowClick = (contact: FrequentContactSummary) => {
    setSelectedContactDetails(contact as MFSFrequentContactInteractionDetail);
    setIsModalOpen(true);
  };
  
  const tableHeaders: { key: keyof FrequentContactSummary; label: string; icon?: React.ReactNode; className?: string}[] = [
    { key: 'contactAccountNumber', label: 'Contact Account', icon: <Users2 size={14}/> },
    { key: 'sentFromStatementCount', label: 'Sent (Count)', icon: <Send size={14}/>, className: "text-center" },
    { key: 'sentFromStatementAmount', label: 'Sent (Amount)', icon: <DollarSign size={14}/>, className: "text-right" },
    { key: 'receivedByStatementCount', label: 'Received (Count)', icon: <Inbox size={14}/>, className: "text-center" },
    { key: 'receivedByStatementAmount', label: 'Received (Amount)', icon: <DollarSign size={14}/>, className: "text-right" },
    { key: 'totalInteractions', label: 'Total Interactions', icon: <ArrowRightLeft size={14}/>, className: "text-center" },
    { key: 'firstInteractionDate', label: 'First Interaction', icon: <Clock size={14}/> },
    { key: 'lastInteractionDate', label: 'Last Interaction', icon: <Clock size={14}/> },
  ];

  if (isLoading && uploadedBkashFiles.length === 0) {
    return <div className="p-6 text-center text-textSecondary">Loading bKash data...</div>;
  }
  if (uploadedBkashFiles.length === 0) {
    return (
      <div className="p-6 bg-info-lighter border border-info-light rounded-lg text-center text-info-dark flex flex-col items-center justify-center min-h-[200px] shadow-md">
        <Info size={28} className="mb-2" />
        <p className="font-medium">Please upload bKash statement files to identify frequent contacts.</p>
      </div>
    );
  }
  if (globallyFilteredBkashRecords.length === 0 && !isLoading) {
    return (
      <div className="p-6 bg-neutral-lightest border border-neutral-light rounded-lg text-center text-textSecondary flex flex-col items-center justify-center min-h-[200px] shadow-md">
        <Info size={28} className="mb-2 text-neutral-DEFAULT" />
        <p>No bKash records match the current filters. Adjust filters to see frequent contacts.</p>
      </div>
    );
  }
  if (frequentContactsData.length === 0 && !isLoading) {
    return (
      <div className="p-6 bg-neutral-lightest border border-neutral-light rounded-lg text-center text-textSecondary flex flex-col items-center justify-center min-h-[200px] shadow-md">
        <Users2 size={28} className="mb-2 text-neutral-DEFAULT" />
        <p>No frequent contacts found (min. 2 interactions) in the current bKash dataset.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="p-4 sm:p-5 bg-surface border border-neutral-light rounded-xl shadow-xl">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center">
            <div>
                <div className="flex items-center text-xl sm:text-2xl font-semibold text-textPrimary mb-1">
                    <Pocket size={24} className="mr-2.5 text-pink-500" /> bKash Frequent Contacts
                </div>
                <p className="text-sm text-textSecondary">Accounts with 2 or more interactions with the statement account.</p>
            </div>
            {sortedFrequentContacts.length > 0 && (
                <button onClick={handleExportData} className="mt-3 sm:mt-0 px-3.5 py-2 text-xs sm:text-sm bg-pink-400 text-white rounded-lg hover:bg-pink-500 focus:outline-none focus:ring-2 focus:ring-pink-300 focus:ring-offset-1 flex items-center shadow-md hover:shadow-lg transition-all"> <Download size={15} className="mr-1.5" /> Export Contacts List </button>
            )}
        </div>
      </div>

      <div className="bg-surface shadow-xl rounded-xl border border-pink-200 overflow-x-auto">
        <table className="min-w-full divide-y divide-pink-200">
          <thead className="bg-pink-50 sticky top-0">
            <tr>
              {tableHeaders.map(h => (
                <th key={String(h.key)} onClick={() => requestSort(h.key!)} className={`group px-3 py-3 text-left text-xs font-semibold text-pink-700 uppercase tracking-wider cursor-pointer hover:bg-pink-100 transition-colors whitespace-nowrap ${h.className || ''}`}>
                  <div className="flex items-center">{h.icon && <span className="mr-1.5 text-pink-500 group-hover:text-pink-600">{h.icon}</span>}{h.label}{renderSortIcon(h.key!)}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-pink-100">
            {paginatedFrequentContacts.map((contact) => (
              <tr key={contact.contactAccountNumber} className="hover:bg-pink-50/50 cursor-pointer" onClick={() => handleRowClick(contact)}>
                <td className="px-3 py-2.5 whitespace-nowrap text-xs text-textPrimary font-medium">{contact.contactAccountNumber}</td>
                <td className="px-3 py-2.5 whitespace-nowrap text-xs text-textSecondary text-center">{contact.sentFromStatementCount}</td>
                <td className="px-3 py-2.5 whitespace-nowrap text-xs text-textSecondary text-right" title={contact.sentFromStatementAmount.toFixed(2)}>{formatCurrencyShort(contact.sentFromStatementAmount)}</td>
                <td className="px-3 py-2.5 whitespace-nowrap text-xs text-textSecondary text-center">{contact.receivedByStatementCount}</td>
                <td className="px-3 py-2.5 whitespace-nowrap text-xs text-textSecondary text-right" title={contact.receivedByStatementAmount.toFixed(2)}>{formatCurrencyShort(contact.receivedByStatementAmount)}</td>
                <td className="px-3 py-2.5 whitespace-nowrap text-xs text-textSecondary text-center">{contact.totalInteractions}</td>
                <td className="px-3 py-2.5 whitespace-nowrap text-xs text-textSecondary">{contact.firstInteractionDate ? formatDate(contact.firstInteractionDate.toISOString()) : 'N/A'}</td>
                <td className="px-3 py-2.5 whitespace-nowrap text-xs text-textSecondary">{contact.lastInteractionDate ? formatDate(contact.lastInteractionDate.toISOString()) : 'N/A'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {totalPages > 1 && (
        <div className="flex flex-col sm:flex-row justify-between items-center mt-4 py-3 px-1">
          <span className="text-sm text-textSecondary mb-2 sm:mb-0">Page {currentPage} of {totalPages} (Total: {sortedFrequentContacts.length} contacts)</span>
          <div className="flex gap-2">
            <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1} className="px-3 py-1.5 text-xs font-medium text-pink-700 bg-pink-100 border border-pink-300 rounded-lg shadow-sm hover:bg-pink-200 disabled:opacity-50">Previous</button>
            <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages} className="px-3 py-1.5 text-xs font-medium text-pink-700 bg-pink-100 border border-pink-300 rounded-lg shadow-sm hover:bg-pink-200 disabled:opacity-50">Next</button>
          </div>
        </div>
      )}
      <MFSFrequentContactDetailModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        contactData={selectedContactDetails}
        serviceName="bKash"
      />
    </div>
  );
};

export default BkashFrequentContactsView;
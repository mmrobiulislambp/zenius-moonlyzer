
import React, { useState, useMemo, useCallback } from 'react';
import { Users2, ArrowRightLeft, Download, Clock, ListFilter, ChevronDown, ChevronUp, Info, Send, Inbox, DollarSign } from 'lucide-react';
import { useNagadContext } from '../contexts/NagadContext';
import { NagadRecord } from '../types';
import { formatDate, parseDateTime } from '../utils/cdrUtils';
import { downloadCSV } from '../utils/downloadUtils';

const ROWS_PER_PAGE = 10;

interface FrequentContactSummary {
  contactAccountNumber: string;
  sentToStatementCount: number;
  sentToStatementAmount: number;
  receivedFromStatementCount: number;
  receivedFromStatementAmount: number;
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


const NagadFrequentContactsView: React.FC = () => {
  const { globallyFilteredNagadRecords, isLoading, error, uploadedNagadFiles } = useNagadContext();
  const [currentPage, setCurrentPage] = useState(1);
  const [sortConfig, setSortConfig] = useState<SortConfig>({ key: 'totalInteractions', direction: 'descending' });

  const frequentContactsData = useMemo((): FrequentContactSummary[] => {
    if (globallyFilteredNagadRecords.length === 0) return [];

    const contactsMap = new Map<string, FrequentContactSummary>();

    globallyFilteredNagadRecords.forEach(record => {
      // Assuming TXN_WITH_ACC is the other party.
      // STATEMENT_FOR_ACC is the account whose statement we are analyzing.
      const otherParty = record.TXN_WITH_ACC;
      if (!otherParty || otherParty.trim() === '' || otherParty.toUpperCase() === 'SYSTEM') {
        return; // Skip if no other party or it's a system transaction
      }

      let entry = contactsMap.get(otherParty);
      if (!entry) {
        entry = {
          contactAccountNumber: otherParty,
          sentToStatementCount: 0,
          sentToStatementAmount: 0,
          receivedFromStatementCount: 0,
          receivedFromStatementAmount: 0,
          totalInteractions: 0,
        };
      }

      entry.totalInteractions++;
      const recordDate = parseDateTime(record.TXN_DATE_TIME);
      if (recordDate) {
        if (!entry.firstInteractionDate || recordDate < entry.firstInteractionDate) {
          entry.firstInteractionDate = recordDate;
        }
        if (!entry.lastInteractionDate || recordDate > entry.lastInteractionDate) {
          entry.lastInteractionDate = recordDate;
        }
      }
      
      // If STATEMENT_FOR_ACC receives CREDIT, it means TXN_WITH_ACC SENT money TO STATEMENT_FOR_ACC
      if (record.TXN_TYPE_DR_CR === 'CREDIT') {
        entry.sentToStatementCount++;
        entry.sentToStatementAmount += record.TXN_AMT;
      } 
      // If STATEMENT_FOR_ACC makes a DEBIT, it means TXN_WITH_ACC RECEIVED money FROM STATEMENT_FOR_ACC
      else if (record.TXN_TYPE_DR_CR === 'DEBIT') {
        entry.receivedFromStatementCount++;
        entry.receivedFromStatementAmount += record.TXN_AMT;
      }
      contactsMap.set(otherParty, entry);
    });

    return Array.from(contactsMap.values()).filter(contact => contact.totalInteractions >= 2);
  }, [globallyFilteredNagadRecords]);

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
    return sortConfig.direction === 'ascending' ? <ChevronUp size={14} className="ml-1 text-primary inline" /> : <ChevronDown size={14} className="ml-1 text-primary inline" />;
  };

  const handleExportData = () => {
    if (sortedFrequentContacts.length === 0) { alert("No data to export."); return; }
    const headers = ["Contact Account", "Sent to Statement (Count)", "Sent to Statement (Amount)", "Received from Statement (Count)", "Received from Statement (Amount)", "Total Interactions", "First Interaction", "Last Interaction"];
    const data = sortedFrequentContacts.map(contact => [
      contact.contactAccountNumber,
      String(contact.sentToStatementCount),
      String(contact.sentToStatementAmount.toFixed(2)),
      String(contact.receivedFromStatementCount),
      String(contact.receivedFromStatementAmount.toFixed(2)),
      String(contact.totalInteractions),
      contact.firstInteractionDate ? formatDate(contact.firstInteractionDate.toISOString()) : 'N/A',
      contact.lastInteractionDate ? formatDate(contact.lastInteractionDate.toISOString()) : 'N/A',
    ]);
    downloadCSV(`nagad_frequent_contacts_${new Date().toISOString().split('T')[0]}.csv`, data, headers);
  };
  
  const tableHeaders: { key: keyof FrequentContactSummary; label: string; icon?: React.ReactNode; className?: string}[] = [
    { key: 'contactAccountNumber', label: 'Contact Account', icon: <Users2 size={14}/> },
    { key: 'sentToStatementCount', label: 'Sent to Statement (Count)', icon: <Inbox size={14}/>, className: "text-center" },
    { key: 'sentToStatementAmount', label: 'Sent to Statement (Amount)', icon: <DollarSign size={14}/>, className: "text-right" },
    { key: 'receivedFromStatementCount', label: 'Received from Statement (Count)', icon: <Send size={14}/>, className: "text-center" },
    { key: 'receivedFromStatementAmount', label: 'Received from Statement (Amount)', icon: <DollarSign size={14}/>, className: "text-right" },
    { key: 'totalInteractions', label: 'Total Interactions', icon: <ArrowRightLeft size={14}/>, className: "text-center" },
    { key: 'firstInteractionDate', label: 'First Interaction', icon: <Clock size={14}/> },
    { key: 'lastInteractionDate', label: 'Last Interaction', icon: <Clock size={14}/> },
  ];

  if (isLoading && uploadedNagadFiles.length === 0) {
    return <div className="p-6 text-center text-textSecondary">Loading Nagad data...</div>;
  }
  if (uploadedNagadFiles.length === 0) {
    return (
      <div className="p-6 bg-info-lighter border border-info-light rounded-lg text-center text-info-dark flex flex-col items-center justify-center min-h-[200px] shadow-md">
        <Info size={28} className="mb-2" />
        <p className="font-medium">Please upload Nagad statement files to identify frequent contacts.</p>
      </div>
    );
  }
  if (globallyFilteredNagadRecords.length === 0 && !isLoading) {
    return (
      <div className="p-6 bg-neutral-lightest border border-neutral-light rounded-lg text-center text-textSecondary flex flex-col items-center justify-center min-h-[200px] shadow-md">
        <Info size={28} className="mb-2 text-neutral-DEFAULT" />
        <p>No Nagad records match the current filters. Adjust filters to see frequent contacts.</p>
      </div>
    );
  }
  if (frequentContactsData.length === 0 && !isLoading) {
    return (
      <div className="p-6 bg-neutral-lightest border border-neutral-light rounded-lg text-center text-textSecondary flex flex-col items-center justify-center min-h-[200px] shadow-md">
        <Users2 size={28} className="mb-2 text-neutral-DEFAULT" />
        <p>No frequent contacts found (min. 2 interactions) in the current dataset.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="p-4 sm:p-5 bg-surface border border-neutral-light rounded-xl shadow-xl">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center">
            <div>
                <div className="flex items-center text-xl sm:text-2xl font-semibold text-textPrimary mb-1">
                    <Users2 size={24} className="mr-2.5 text-primary" /> Nagad Frequent Contacts
                </div>
                <p className="text-sm text-textSecondary">Accounts with 2 or more interactions with the statement account.</p>
            </div>
            {sortedFrequentContacts.length > 0 && (
                <button onClick={handleExportData} className="mt-3 sm:mt-0 px-3.5 py-2 text-xs sm:text-sm bg-secondary text-white rounded-lg hover:bg-secondary-dark focus:outline-none focus:ring-2 focus:ring-secondary-light focus:ring-offset-1 flex items-center shadow-md hover:shadow-lg transition-all"> <Download size={15} className="mr-1.5" /> Export Contacts List </button>
            )}
        </div>
      </div>

      <div className="bg-surface shadow-xl rounded-xl border border-neutral-light overflow-x-auto">
        <table className="min-w-full divide-y divide-neutral-light">
          <thead className="bg-neutral-lightest sticky top-0">
            <tr>
              {tableHeaders.map(h => (
                <th key={String(h.key)} onClick={() => requestSort(h.key!)} className={`group px-3 py-3 text-left text-xs font-semibold text-textPrimary uppercase tracking-wider cursor-pointer hover:bg-neutral-lighter transition-colors whitespace-nowrap ${h.className || ''}`}>
                  <div className="flex items-center">{h.icon && <span className="mr-1.5 text-neutral-DEFAULT group-hover:text-primary">{h.icon}</span>}{h.label}{renderSortIcon(h.key!)}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="bg-surface divide-y divide-neutral-light">
            {paginatedFrequentContacts.map((contact) => (
              <tr key={contact.contactAccountNumber} className="hover:bg-neutral-lightest/50">
                <td className="px-3 py-2.5 whitespace-nowrap text-xs text-textPrimary font-medium">{contact.contactAccountNumber}</td>
                <td className="px-3 py-2.5 whitespace-nowrap text-xs text-textSecondary text-center">{contact.sentToStatementCount}</td>
                <td className="px-3 py-2.5 whitespace-nowrap text-xs text-textSecondary text-right" title={contact.sentToStatementAmount.toFixed(2)}>{formatCurrencyShort(contact.sentToStatementAmount)}</td>
                <td className="px-3 py-2.5 whitespace-nowrap text-xs text-textSecondary text-center">{contact.receivedFromStatementCount}</td>
                <td className="px-3 py-2.5 whitespace-nowrap text-xs text-textSecondary text-right" title={contact.receivedFromStatementAmount.toFixed(2)}>{formatCurrencyShort(contact.receivedFromStatementAmount)}</td>
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
            <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1} className="px-3 py-1.5 text-xs font-medium text-textPrimary bg-surface border border-neutral-light rounded-lg shadow-sm hover:bg-neutral-lighter disabled:opacity-50">Previous</button>
            <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages} className="px-3 py-1.5 text-xs font-medium text-textPrimary bg-surface border border-neutral-light rounded-lg shadow-sm hover:bg-neutral-lighter disabled:opacity-50">Next</button>
          </div>
        </div>
      )}
    </div>
  );
};

export default NagadFrequentContactsView;
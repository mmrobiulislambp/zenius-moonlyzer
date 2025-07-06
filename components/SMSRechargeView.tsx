
import React, { useMemo, useState } from 'react';
import { CreditCard, ListFilter, Download, ChevronDown, ChevronUp, Info, Clock, Send, Inbox, MessageSquare } from 'lucide-react';
import { useSMSContext } from '../contexts/SMSContext';
import { SMSRecord } from '../types';
import { formatDate, parseDateTime } from '../utils/cdrUtils';
import { downloadCSV } from '../utils/downloadUtils';

const ROWS_PER_PAGE = 15;

interface RechargeInfo extends SMSRecord {
  rechargeAmount?: number | null;
  transactionId?: string | null;
  isLikelyRecharge: boolean;
}

// Keywords and patterns to identify recharge messages
const RECHARGE_KEYWORDS = ['recharge successful', 'flexiload successful', 'amount', 'tk.', 'transaction id', 'successful to'];
const RECHARGE_SENDERS = ['flexiload', 'bkash', 'nagad', 'rocket', 'upay', 'skitto', 'grameenphone', 'robi', 'banglalink', 'airtel', 'teletalk']; // Common service names

const extractRechargeInfo = (sms: SMSRecord): RechargeInfo => {
  const contentLower = sms.Content.toLowerCase();
  const initiatorLower = sms.Initiator.toLowerCase();
  
  let isLikelyRecharge = false;
  if (RECHARGE_KEYWORDS.some(keyword => contentLower.includes(keyword)) || 
      RECHARGE_SENDERS.some(sender => initiatorLower.includes(sender))) {
    isLikelyRecharge = true;
  }

  let rechargeAmount: number | null = null;
  const amountMatch = contentLower.match(/amount\s*([\d,]+(\.\d{1,2})?)\s*(tk|bdt)/i) || 
                      contentLower.match(/([\d,]+(\.\d{1,2})?)\s*(tk|bdt)\s*recharge/i) ||
                      contentLower.match(/recharge\s*of\s*(tk|bdt)?\s*([\d,]+(\.\d{1,2})?)/i);

  if (amountMatch) {
    const amountStr = amountMatch[1] || amountMatch[2];
    if (amountStr) {
        rechargeAmount = parseFloat(amountStr.replace(/,/g, ''));
    }
  }

  let transactionId: string | null = null;
  const txnIdMatch = contentLower.match(/(transaction id|txn id|trxid)\s*[:is]?\s*([a-z0-9\-_]+)/i);
  if (txnIdMatch && txnIdMatch[2]) {
    transactionId = txnIdMatch[2].toUpperCase();
  }
  
  // If it's likely a recharge but no amount/txnId found yet, try a broader check from known senders
  if (isLikelyRecharge && (!rechargeAmount || !transactionId)) {
      if (RECHARGE_SENDERS.some(sender => initiatorLower.includes(sender))) {
          // Try more generic patterns if sender is known
          const genericAmountMatch = contentLower.match(/([\d,]+(\.\d{1,2})?)\s*tk/i);
          if (genericAmountMatch && !rechargeAmount) {
              rechargeAmount = parseFloat(genericAmountMatch[1].replace(/,/g, ''));
          }
          // A simple alphanumeric string of decent length could be a TxnID if context is strong
          const genericTxnMatch = contentLower.match(/\b([a-zA-Z0-9]{8,25})\b/g); // find potential IDs
          if (genericTxnMatch && !transactionId) {
              // Filter out pure numbers that could be amounts or phone numbers, prefer mixed alphanumeric or longer numbers
              const potentialIds = genericTxnMatch.filter(id => isNaN(Number(id)) || id.length > 12);
              if (potentialIds.length > 0) transactionId = potentialIds[0].toUpperCase();
          }
      }
  }


  return {
    ...sms,
    rechargeAmount: isNaN(Number(rechargeAmount)) ? null : rechargeAmount,
    transactionId,
    isLikelyRecharge
  };
};

const SMSRechargeView: React.FC = () => {
  const { filteredSMSRecords, isLoading: contextIsLoading, uploadedSMSFiles } = useSMSContext();
  const [currentPage, setCurrentPage] = useState(1);
  const [sortConfig, setSortConfig] = useState<{ key: keyof RechargeInfo; direction: 'ascending' | 'descending' }>({ key: 'Timestamp', direction: 'descending' });

  const rechargeMessages = useMemo(() => {
    return filteredSMSRecords
      .map(extractRechargeInfo)
      .filter(sms => sms.isLikelyRecharge); // Only show messages identified as likely recharges
  }, [filteredSMSRecords]);

  const sortedRechargeMessages = useMemo(() => {
    return [...rechargeMessages].sort((a, b) => {
      const valA = a[sortConfig.key!];
      const valB = b[sortConfig.key!];
      let comparison = 0;
      if (sortConfig.key === 'Timestamp') {
        comparison = (parseDateTime(String(valA))?.getTime() || 0) - (parseDateTime(String(valB))?.getTime() || 0);
      } else if (typeof valA === 'number' && typeof valB === 'number') {
        comparison = valA - valB;
      } else if (typeof valA === 'string' && typeof valB === 'string') {
        comparison = valA.localeCompare(valB);
      }
      return sortConfig.direction === 'ascending' ? comparison : -comparison;
    });
  }, [rechargeMessages, sortConfig]);

  const paginatedData = useMemo(() => {
    const startIndex = (currentPage - 1) * ROWS_PER_PAGE;
    return sortedRechargeMessages.slice(startIndex, startIndex + ROWS_PER_PAGE);
  }, [sortedRechargeMessages, currentPage]);

  const totalPages = Math.ceil(sortedRechargeMessages.length / ROWS_PER_PAGE);

  const requestSort = (key: keyof RechargeInfo) => {
    let direction: 'ascending' | 'descending' = 'ascending';
    if (sortConfig.key === key && sortConfig.direction === 'descending') {
      direction = 'ascending';
    }
    setSortConfig({ key, direction });
    setCurrentPage(1);
  };

  const renderSortIcon = (key: keyof RechargeInfo) => {
    if (sortConfig.key !== key) return <ListFilter size={14} className="ml-1 text-neutral-DEFAULT opacity-30 group-hover:opacity-100 inline" />;
    return sortConfig.direction === 'ascending' ? <ChevronUp size={14} className="ml-1 text-primary inline" /> : <ChevronDown size={14} className="ml-1 text-primary inline" />;
  };

  const handleExportData = () => {
    if (sortedRechargeMessages.length === 0) { alert("No data to export."); return; }
    const headers = ["Timestamp", "Sender (Likely Service)", "Recipient (User)", "Recharge Amount (Tk)", "Transaction ID", "Full Message Content", "Source File"];
    const data = sortedRechargeMessages.map(sms => [
      formatDate(sms.Timestamp),
      sms.Initiator,
      sms.Recipient,
      sms.rechargeAmount !== null && sms.rechargeAmount !== undefined ? String(sms.rechargeAmount) : 'N/A',
      sms.transactionId || 'N/A',
      sms.Content,
      sms.fileName,
    ]);
    downloadCSV(`sms_recharge_history_${new Date().toISOString().split('T')[0]}.csv`, data, headers);
  };

  if (contextIsLoading && rechargeMessages.length === 0) {
    return <div className="flex justify-center items-center h-64"><div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary-dark"></div><p className="ml-3 text-textSecondary">Loading SMS data...</p></div>;
  }
   if (uploadedSMSFiles.length === 0 && !contextIsLoading) {
     return <div className="p-6 bg-info-lighter border border-info-light rounded-lg text-center text-info-dark flex flex-col items-center justify-center min-h-[150px] shadow-md"><Info size={28} className="mb-2" /><p className="font-medium">Please upload SMS data files to track recharges.</p></div>;
  }
  
  if (rechargeMessages.length === 0 && !contextIsLoading) {
    return (
      <div className="p-6 bg-neutral-lightest border border-neutral-light rounded-lg text-center text-textSecondary flex flex-col items-center justify-center min-h-[150px] shadow-md">
        <CreditCard size={28} className="mb-2 text-neutral-DEFAULT" />
        <p>No recharge-related SMS messages found based on current filters and keywords.</p>
        <p className="text-xs mt-1">The system scans for keywords like "recharge", "flexiload", "tk.", "amount", "transaction id" from known service senders.</p>
      </div>
    );
  }
  
  const tableHeaders: { key: keyof RechargeInfo; label: string; icon?: React.ReactNode }[] = [
    { key: 'Timestamp', label: 'Timestamp', icon: <Clock size={14}/> },
    { key: 'Initiator', label: 'Sender (Service)', icon: <Send size={14}/> },
    { key: 'Recipient', label: 'Recipient (User)', icon: <Inbox size={14}/> },
    { key: 'rechargeAmount', label: 'Amount (Tk)', icon: <CreditCard size={14}/> },
    { key: 'transactionId', label: 'Transaction ID', icon: <ListFilter size={14}/> },
    { key: 'Content', label: 'Full Message', icon: <MessageSquare size={14}/> },
  ];


  return (
    <div className="space-y-6">
      <div className="p-4 sm:p-5 bg-surface border border-neutral-light rounded-xl shadow-xl">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center">
            <div>
                <div className="flex items-center text-xl sm:text-2xl font-semibold text-textPrimary mb-1">
                  <CreditCard size={24} className="mr-2.5 text-primary" /> SMS Recharge Tracker
                </div>
                <p className="text-sm text-textSecondary">Automatically identified recharge messages from SMS content.</p>
            </div>
            {sortedRechargeMessages.length > 0 && (
                <button onClick={handleExportData} className="mt-3 sm:mt-0 px-3.5 py-2 text-xs sm:text-sm bg-secondary text-white rounded-lg hover:bg-secondary-dark focus:outline-none focus:ring-2 focus:ring-secondary-light focus:ring-offset-1 flex items-center shadow-md hover:shadow-lg transition-all"> <Download size={15} className="mr-1.5" /> Export Recharge List </button>
            )}
        </div>
      </div>

      <div className="bg-surface shadow-xl rounded-xl border border-neutral-light overflow-x-auto">
        <table className="min-w-full divide-y divide-neutral-light">
          <thead className="bg-neutral-lightest sticky top-0">
            <tr>
              {tableHeaders.map(h => (
                <th key={h.key as string} onClick={() => requestSort(h.key)} className="group px-3 py-3 text-left text-xs font-semibold text-textPrimary uppercase tracking-wider cursor-pointer hover:bg-neutral-lighter transition-colors whitespace-nowrap">
                  <div className="flex items-center">{h.icon && <span className="mr-1.5 text-neutral-DEFAULT group-hover:text-primary">{h.icon}</span>}{h.label}{renderSortIcon(h.key)}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="bg-surface divide-y divide-neutral-light">
            {paginatedData.map((sms) => (
              <tr key={sms.id} className="hover:bg-neutral-lightest/50">
                <td className="px-3 py-2.5 whitespace-nowrap text-xs text-textSecondary">{formatDate(sms.Timestamp)}</td>
                <td className="px-3 py-2.5 whitespace-nowrap text-xs text-textPrimary font-medium">{sms.Initiator}</td>
                <td className="px-3 py-2.5 whitespace-nowrap text-xs text-textSecondary">{sms.Recipient}</td>
                <td className="px-3 py-2.5 whitespace-nowrap text-xs text-textSecondary text-center">{sms.rechargeAmount !== null && sms.rechargeAmount !== undefined ? sms.rechargeAmount.toFixed(2) : 'N/A'}</td>
                <td className="px-3 py-2.5 whitespace-nowrap text-xs text-textSecondary">{sms.transactionId || 'N/A'}</td>
                <td className="px-3 py-2.5 text-xs text-textSecondary max-w-md truncate" title={sms.Content}>{sms.Content}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {totalPages > 1 && (
        <div className="flex flex-col sm:flex-row justify-between items-center mt-4 py-3 px-1">
          <span className="text-sm text-textSecondary mb-2 sm:mb-0">Page {currentPage} of {totalPages} (Total: {sortedRechargeMessages.length} recharge messages)</span>
          <div className="flex gap-2">
            <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1} className="px-3 py-1.5 text-xs font-medium text-textPrimary bg-surface border border-neutral-light rounded-lg shadow-sm hover:bg-neutral-lighter disabled:opacity-50">Previous</button>
            <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages} className="px-3 py-1.5 text-xs font-medium text-textPrimary bg-surface border border-neutral-light rounded-lg shadow-sm hover:bg-neutral-lighter disabled:opacity-50">Next</button>
          </div>
        </div>
      )}
    </div>
  );
};

export default SMSRechargeView;

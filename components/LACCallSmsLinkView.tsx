import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { Share2, Search, User, Info, AlertTriangle, Loader2, Download, Eye, ChevronDown, ChevronUp, ListFilter, FileText, PhoneCall, MessageSquare, Clock, X, PhoneOutgoing, PhoneIncoming, Send, Users2, Smartphone, TowerControl, SmartphoneNfc } from 'lucide-react';
import { useLACContext } from '../contexts/LACContext';
import { LACRecord } from '../types';
import { formatDate, parseDateTime, formatDateFromTimestamp, formatDurationFromSeconds } from '../utils/cdrUtils'; 
import { downloadCSV } from '../utils/downloadUtils';

const ROWS_PER_PAGE = 10;
const MODAL_ROWS_PER_PAGE = 10;

interface LinkAnalysisData {
  linkedNumber: string;
  outgoingCalls: number;
  incomingCalls: number;
  outgoingSMS: number;
  incomingSMS: number;
  totalInteractions: number;
  totalCallDuration: number; // in seconds
  firstInteraction?: Date;
  lastInteraction?: Date;
  records: LACRecord[];
}

interface TargetSummary {
  msisdn: string;
  totalOutgoingCalls: number;
  totalIncomingCalls: number;
  totalOutgoingSMS: number;
  totalIncomingSMS: number;
  totalUniqueContacts: number;
  firstSeen?: Date;
  lastSeen?: Date;
}

const isOutgoingCallLac = (usageType?: string) => usageType?.toUpperCase().includes('MOC');
const isIncomingCallLac = (usageType?: string) => usageType?.toUpperCase().includes('MTC');
const isOutgoingSmsLac = (usageType?: string) => usageType?.toUpperCase().includes('SMSMO');
const isIncomingSmsLac = (usageType?: string) => usageType?.toUpperCase().includes('SMSMT');
const isAnyCallLac = (usageType?: string) => isOutgoingCallLac(usageType) || isIncomingCallLac(usageType);
const isAnySmsLac = (usageType?: string) => isOutgoingSmsLac(usageType) || isIncomingSmsLac(usageType);


const LACCallSmsLinkView: React.FC = () => {
  const { allLACRecords, getUniqueLACValues, isLoading: contextIsLoading, uploadedLACFiles } = useLACContext();
  
  const [inputType, setInputType] = useState<'select' | 'custom'>('select');
  const [selectedFileMSISDN, setSelectedFileMSISDN] = useState<string | null>(null);
  const [customMSISDN, setCustomMSISDN] = useState<string>('');

  const [analysisResults, setAnalysisResults] = useState<LinkAnalysisData[]>([]);
  const [targetSummary, setTargetSummary] = useState<TargetSummary | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [currentPage, setCurrentPage] = useState(1);
  const [sortConfig, setSortConfig] = useState<{ key: keyof LinkAnalysisData; direction: 'ascending' | 'descending' }>({ key: 'totalInteractions', direction: 'descending' });

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalRecords, setModalRecords] = useState<LACRecord[]>([]);
  const [modalTitle, setModalTitle] = useState('');
  const [modalCurrentPage, setModalCurrentPage] = useState(1);
  const [modalSortConfig, setModalSortConfig] = useState<{ key: keyof LACRecord; direction: 'ascending' | 'descending' }>({ key: 'DATE_TIME', direction: 'descending' });
  
  const uniqueMSISDNs = useMemo(() => getUniqueLACValues('MSISDN').filter(id => id && id.trim() !== ''), [getUniqueLACValues]);

  const modalTableHeaders: { key: keyof LACRecord | string; label: string; icon?: React.ReactNode }[] = [
    { key: 'DATE_TIME', label: 'Timestamp', icon: <Clock size={12}/> },
    { key: 'MSISDN', label: 'Target MSISDN', icon: <User size={12}/> },
    { key: 'OTHER_PARTY_NUMBER', label: 'Other Party', icon: <Users2 size={12}/> },
    { key: 'USAGE_TYPE', label: 'Usage Type', icon: <ListFilter size={12}/> },
    { key: 'CALL_DURATION', label: 'Duration (s)', icon: <Clock size={12}/> },
    { key: 'lacCellId', label: 'LAC-Cell ID', icon: <TowerControl size={12}/> }, // Composite key handled in render
    { key: 'IMEI', label: 'IMEI', icon: <SmartphoneNfc size={12}/> },
    { key: 'fileName', label: 'Source File', icon: <FileText size={12}/> },
  ];

  const handleExportModalTable = useCallback(() => {
    if (modalRecords.length === 0) return;
    const headers = modalTableHeaders.map(h => h.label);
    const data = modalRecords.map(rec => 
        modalTableHeaders.map(header => {
            if (header.key === 'lacCellId') {
                return `${rec.LAC}-${rec.CELL_ID}`;
            }
            let value = rec[header.key as keyof LACRecord] ?? 'N/A';
            if (header.key === 'DATE_TIME' && value !== 'N/A') {
                value = formatDate(String(value));
            }
            return String(value);
        })
    );
    downloadCSV(`interaction_records_${modalTitle.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.csv`, data, headers);
  }, [modalRecords, modalTitle, modalTableHeaders]);

  const handleAnalyze = useCallback(() => {
    setErrorMsg(null);
    setIsLoading(true);
    setAnalysisResults([]);
    setTargetSummary(null);
    setCurrentPage(1);

    const targetMSISDN = inputType === 'select' ? selectedFileMSISDN : customMSISDN.trim();

    if (!targetMSISDN) {
      setErrorMsg("MSISDN is required.");
      setIsLoading(false);
      return;
    }

    try {
      const recordsForTarget = allLACRecords.filter(r => r.MSISDN === targetMSISDN || r.OTHER_PARTY_NUMBER === targetMSISDN);
      if (recordsForTarget.length === 0) {
        setErrorMsg(`No records found involving MSISDN: ${targetMSISDN}`);
        setIsLoading(false);
        return;
      }

      let firstSeenOverall: Date | undefined = undefined;
      let lastSeenOverall: Date | undefined = undefined;
      let totalOutgoingCalls = 0;
      let totalIncomingCalls = 0;
      let totalOutgoingSMS = 0;
      let totalIncomingSMS = 0;
      const contacts = new Map<string, LinkAnalysisData>();

      recordsForTarget.forEach(record => {
        const recordTime = parseDateTime(record.DATE_TIME);
        if (recordTime) {
            if (!firstSeenOverall || recordTime < firstSeenOverall) firstSeenOverall = recordTime;
            if (!lastSeenOverall || recordTime > lastSeenOverall) lastSeenOverall = recordTime;
        }

        const otherParty = record.MSISDN === targetMSISDN ? record.OTHER_PARTY_NUMBER : record.MSISDN;
        if (!otherParty || otherParty.trim() === '') return; // Skip records with no other party

        let contactEntry = contacts.get(otherParty);
        if (!contactEntry) {
          contactEntry = { linkedNumber: otherParty, outgoingCalls: 0, incomingCalls: 0, outgoingSMS: 0, incomingSMS: 0, totalInteractions: 0, totalCallDuration: 0, records: [] };
        }
        contactEntry.records.push(record);
        contactEntry.totalInteractions++;
        if (recordTime) {
            if (!contactEntry.firstInteraction || recordTime < contactEntry.firstInteraction) contactEntry.firstInteraction = recordTime;
            if (!contactEntry.lastInteraction || recordTime > contactEntry.lastInteraction) contactEntry.lastInteraction = recordTime;
        }

        if (isAnyCallLac(record.USAGE_TYPE)) {
          contactEntry.totalCallDuration += (record.CALL_DURATION || 0);
        }

        if (record.MSISDN === targetMSISDN) { // Outgoing from target
            if (isOutgoingCallLac(record.USAGE_TYPE)) { totalOutgoingCalls++; contactEntry.outgoingCalls++; }
            else if (isOutgoingSmsLac(record.USAGE_TYPE)) { totalOutgoingSMS++; contactEntry.outgoingSMS++; }
        } else { // Incoming to target
            if (isIncomingCallLac(record.USAGE_TYPE)) { totalIncomingCalls++; contactEntry.incomingCalls++; }
            else if (isIncomingSmsLac(record.USAGE_TYPE)) { totalIncomingSMS++; contactEntry.incomingSMS++; }
            // If it's an MOC/SMSMO from other party to target, it's an incoming call/SMS for target
            else if (isOutgoingCallLac(record.USAGE_TYPE)) { totalIncomingCalls++; contactEntry.incomingCalls++; } 
            else if (isOutgoingSmsLac(record.USAGE_TYPE)) { totalIncomingSMS++; contactEntry.incomingSMS++; }
        }
        contacts.set(otherParty, contactEntry);
      });
      
      setTargetSummary({
        msisdn: targetMSISDN,
        totalOutgoingCalls, totalIncomingCalls, totalOutgoingSMS, totalIncomingSMS,
        totalUniqueContacts: contacts.size,
        firstSeen: firstSeenOverall, lastSeen: lastSeenOverall,
      });
      setAnalysisResults(Array.from(contacts.values()));

    } catch (e) {
      console.error("Analysis error:", e);
      setErrorMsg("An error occurred during analysis.");
    } finally {
      setIsLoading(false);
    }
  }, [inputType, selectedFileMSISDN, customMSISDN, allLACRecords]);

  const sortedResults = useMemo(() => {
    return [...analysisResults].sort((a, b) => {
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
  }, [analysisResults, sortConfig]);

  const paginatedResults = useMemo(() => {
    const startIndex = (currentPage - 1) * ROWS_PER_PAGE;
    return sortedResults.slice(startIndex, startIndex + ROWS_PER_PAGE);
  }, [sortedResults, currentPage]);
  const totalPages = Math.ceil(sortedResults.length / ROWS_PER_PAGE);

  const requestSort = (key: keyof LinkAnalysisData) => {
    let direction: 'ascending' | 'descending' = 'descending';
    if (sortConfig.key === key && sortConfig.direction === 'descending') {
      direction = 'ascending';
    }
    setSortConfig({ key, direction });
    setCurrentPage(1);
  };
  
  const renderSortIcon = (key: keyof LinkAnalysisData) => {
    if (sortConfig.key !== key) return <ListFilter size={14} className="ml-1 opacity-30 group-hover:opacity-100 inline" />;
    return sortConfig.direction === 'ascending' ? <ChevronUp size={14} className="ml-1 text-primary inline" /> : <ChevronDown size={14} className="ml-1 text-primary inline" />;
  };
  
  const sortedModalRecords = useMemo(() => {
    return [...modalRecords].sort((a,b) => {
        const valA = a[modalSortConfig.key!];
        const valB = b[modalSortConfig.key!];
        if (modalSortConfig.key === 'DATE_TIME') {
          return modalSortConfig.direction === 'ascending' ? 
                 (parseDateTime(String(valA))?.getTime() ?? 0) - (parseDateTime(String(valB))?.getTime() ?? 0) :
                 (parseDateTime(String(valB))?.getTime() ?? 0) - (parseDateTime(String(valA))?.getTime() ?? 0);
        }
        if (modalSortConfig.key === 'CALL_DURATION') {
            const durationA = parseInt(String(valA), 10) || 0;
            const durationB = parseInt(String(valB), 10) || 0;
            return modalSortConfig.direction === 'ascending' ? durationA - durationB : durationB - durationA;
        }
        if (typeof valA === 'string' && typeof valB === 'string') {
          return modalSortConfig.direction === 'ascending' ? valA.localeCompare(valB) : valB.localeCompare(valA);
        }
        return 0;
      });
  }, [modalRecords, modalSortConfig]);

  const paginatedModalRecords = useMemo(() => {
    const startIndex = (modalCurrentPage - 1) * MODAL_ROWS_PER_PAGE;
    return sortedModalRecords.slice(startIndex, startIndex + MODAL_ROWS_PER_PAGE);
  }, [sortedModalRecords, modalCurrentPage]);
  const totalModalPages = Math.ceil(sortedModalRecords.length / MODAL_ROWS_PER_PAGE);
  
  const requestModalSort = (key: keyof LACRecord) => {
    let direction: 'ascending' | 'descending' = 'descending';
    if(modalSortConfig.key === key && modalSortConfig.direction === 'descending') direction = 'ascending';
    setModalSortConfig({key, direction});
    setModalCurrentPage(1);
  };

  const renderModalSortIcon = (key: keyof LACRecord) => {
    if (modalSortConfig.key !== key) return <ListFilter size={12} className="ml-1 opacity-30 group-hover:opacity-100 inline" />;
    return modalSortConfig.direction === 'ascending' ? <ChevronUp size={12} className="ml-1 text-primary inline" /> : <ChevronDown size={12} className="ml-1 text-primary inline" />;
  };

  const handleViewDetails = (linkData: LinkAnalysisData) => {
    setModalRecords(linkData.records);
    setModalTitle(`Interaction Records: ${targetSummary?.msisdn} & ${linkData.linkedNumber}`);
    setIsModalOpen(true);
    setModalCurrentPage(1);
  };
  
  const handleExportMainTable = () => {
    const headers = ["Linked Number", "Outgoing Calls", "Incoming Calls", "Outgoing SMS", "Incoming SMS", "Total Interactions", "Total Call Duration (s)", "First Interaction", "Last Interaction"];
    const data = sortedResults.map(link => [
        link.linkedNumber, String(link.outgoingCalls), String(link.incomingCalls), String(link.outgoingSMS), String(link.incomingSMS),
        String(link.totalInteractions), String(link.totalCallDuration),
        link.firstInteraction ? formatDate(link.firstInteraction.toISOString()) : 'N/A',
        link.lastInteraction ? formatDate(link.lastInteraction.toISOString()) : 'N/A',
    ]);
    downloadCSV(`call_sms_link_analysis_${targetSummary?.msisdn}.csv`, data, headers);
  };

  if (contextIsLoading && allLACRecords.length === 0) return <div className="flex justify-center items-center h-64"><Loader2 className="h-12 w-12 animate-spin text-primary" /><p className="ml-3 text-textSecondary">Loading LAC data...</p></div>;
  if (uploadedLACFiles.length === 0 && !contextIsLoading) return <div className="p-6 bg-info-lighter border border-info-light rounded-lg text-center text-info-dark flex flex-col items-center justify-center min-h-[150px] shadow-md"><Info size={28} className="mb-2" /><p className="font-medium">Please upload LAC/Cell data files.</p></div>;

  return (
    <div className="space-y-6">
      <div className="p-4 sm:p-5 bg-surface border border-neutral-light rounded-xl shadow-xl">
        <div className="flex items-center text-xl sm:text-2xl font-semibold text-textPrimary mb-1">
          <Share2 size={24} className="mr-2.5 text-primary" /> Call/SMS Link Analysis
        </div>
        <p className="text-sm text-textSecondary">Analyze call and SMS connections for a specific MSISDN.</p>
        
        <div className="mt-4 space-y-3">
            <div className="flex items-center space-x-4 text-sm">
                <label className="flex items-center cursor-pointer"><input type="radio" name="msisdnInputType" value="select" checked={inputType === 'select'} onChange={() => setInputType('select')} className="mr-1.5 accent-primary"/> Select from Data</label>
                <label className="flex items-center cursor-pointer"><input type="radio" name="msisdnInputType" value="custom" checked={inputType === 'custom'} onChange={() => setInputType('custom')} className="mr-1.5 accent-primary"/> Enter Custom</label>
            </div>
            {inputType === 'select' ? (
                <div>
                    <label htmlFor="msisdnDropdown" className="block text-xs font-medium text-textSecondary mb-1">Select MSISDN:</label>
                    <select id="msisdnDropdown" value={selectedFileMSISDN || ''} onChange={e => setSelectedFileMSISDN(e.target.value || null)} disabled={uniqueMSISDNs.length === 0 || isLoading} className="w-full p-2.5 border border-neutral-light rounded-lg focus:ring-2 focus:ring-primary-light text-sm shadow-sm">
                        <option value="">-- Select MSISDN --</option>
                        {uniqueMSISDNs.map(msisdn => <option key={msisdn} value={msisdn}>{msisdn}</option>)}
                    </select>
                    {uniqueMSISDNs.length === 0 && !contextIsLoading && <p className="text-xs text-warning-dark mt-1">No MSISDNs found in the loaded data.</p>}
                </div>
            ) : (
                <div>
                    <label htmlFor="customMSISDN" className="block text-xs font-medium text-textSecondary mb-1">Enter MSISDN:</label>
                    <input type="text" id="customMSISDN" value={customMSISDN} onChange={e => setCustomMSISDN(e.target.value)} placeholder="Enter MSISDN" className="w-full p-2.5 border border-neutral-light rounded-lg focus:ring-2 focus:ring-primary-light text-sm shadow-sm"/>
                </div>
            )}
            <button onClick={handleAnalyze} disabled={isLoading || contextIsLoading || (inputType === 'select' ? !selectedFileMSISDN : !customMSISDN.trim())} className="w-full sm:w-auto px-6 py-2.5 bg-primary text-white rounded-lg hover:bg-primary-dark text-sm font-medium shadow-md hover:shadow-lg transition-all disabled:opacity-70 flex items-center justify-center">
                {isLoading ? <Loader2 className="h-5 w-5 animate-spin mr-2"/> : <Search size={18} className="mr-2"/>}
                Analyze Links
            </button>
        </div>
      </div>
      
      {isLoading && !targetSummary && (
          <div className="flex justify-center items-center h-40"><Loader2 className="h-10 w-10 animate-spin text-primary" /><p className="ml-3 text-textSecondary">Analyzing links...</p></div>
      )}
      {errorMsg && !isLoading && (
           <div className="p-3 bg-warning-lighter border border-warning-light rounded-lg text-sm text-warning-darker flex items-center shadow-md">
             <AlertTriangle size={18} className="mr-2"/> {errorMsg}
           </div>
      )}
      
      {targetSummary && !isLoading && (
        <>
          <div className="p-4 sm:p-5 bg-surface border border-neutral-light rounded-xl shadow-lg">
            <h3 className="text-base sm:text-lg font-semibold text-textPrimary mb-3">Summary for MSISDN: <span className="text-primary-dark">{targetSummary.msisdn}</span></h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 text-xs">
                <div className="p-2 bg-neutral-lightest rounded border border-neutral-light shadow-sm"><strong className="block text-neutral-dark">Total Outgoing Calls:</strong> {targetSummary.totalOutgoingCalls}</div>
                <div className="p-2 bg-neutral-lightest rounded border border-neutral-light shadow-sm"><strong className="block text-neutral-dark">Total Incoming Calls:</strong> {targetSummary.totalIncomingCalls}</div>
                <div className="p-2 bg-neutral-lightest rounded border border-neutral-light shadow-sm"><strong className="block text-neutral-dark">Total Outgoing SMS:</strong> {targetSummary.totalOutgoingSMS}</div>
                <div className="p-2 bg-neutral-lightest rounded border border-neutral-light shadow-sm"><strong className="block text-neutral-dark">Total Incoming SMS:</strong> {targetSummary.totalIncomingSMS}</div>
                <div className="p-2 bg-neutral-lightest rounded border border-neutral-light shadow-sm"><strong className="block text-neutral-dark">Unique Contacts:</strong> {targetSummary.totalUniqueContacts}</div>
                <div className="p-2 bg-neutral-lightest rounded border border-neutral-light shadow-sm col-span-2 sm:col-span-1"><strong className="block text-neutral-dark">First Seen:</strong> {targetSummary.firstSeen ? formatDate(targetSummary.firstSeen.toISOString()) : 'N/A'}</div>
                <div className="p-2 bg-neutral-lightest rounded border border-neutral-light shadow-sm col-span-2 sm:col-span-1"><strong className="block text-neutral-dark">Last Seen:</strong> {targetSummary.lastSeen ? formatDate(targetSummary.lastSeen.toISOString()) : 'N/A'}</div>
            </div>
          </div>

          {analysisResults.length > 0 ? (
            <div className="p-4 sm:p-5 bg-surface border border-neutral-light rounded-xl shadow-xl">
              <div className="flex justify-between items-center mb-3">
                <h3 className="text-base sm:text-lg font-semibold text-textPrimary">Linked Numbers ({sortedResults.length})</h3>
                <button onClick={handleExportMainTable} className="px-3 py-1.5 text-xs bg-secondary text-white rounded-lg hover:bg-secondary-dark flex items-center shadow-sm"><Download size={14} className="mr-1.5"/>Export Links</button>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-neutral-light">
                  <thead className="bg-neutral-lightest sticky top-0 z-10">
                    <tr>
                      {['Linked Number', 'Outgoing Calls', 'Incoming Calls', 'Outgoing SMS', 'Incoming SMS', 'Total Interactions', 'Total Call Duration (s)', 'First Interaction', 'Last Interaction', 'Actions'].map(header => {
                          const keyMap: Record<string, keyof LinkAnalysisData> = { 
                            'Linked Number': 'linkedNumber', 
                            'Outgoing Calls': 'outgoingCalls', 
                            'Incoming Calls': 'incomingCalls', 
                            'Outgoing SMS': 'outgoingSMS', 
                            'Incoming SMS': 'incomingSMS', 
                            'Total Interactions': 'totalInteractions', 
                            'Total Call Duration (s)': 'totalCallDuration', 
                            'First Interaction': 'firstInteraction', 
                            'Last Interaction': 'lastInteraction'
                          };
                          const mappedSortKey = keyMap[header];
                          return <th key={header} onClick={() => { if (header !== 'Actions' && mappedSortKey) requestSort(mappedSortKey);}} className="group px-3 py-2.5 text-left text-xs font-semibold text-textPrimary uppercase tracking-wider cursor-pointer hover:bg-neutral-lighter"><div className="flex items-center">{header}{header !== 'Actions' && mappedSortKey && renderSortIcon(mappedSortKey)}</div></th>
                      })}
                    </tr>
                  </thead>
                  <tbody className="bg-surface divide-y divide-neutral-light">
                    {paginatedResults.map(link => (
                      <tr key={link.linkedNumber} className="hover:bg-neutral-lightest/50">
                        <td className="px-3 py-2.5 whitespace-nowrap text-xs text-textPrimary font-medium">{link.linkedNumber}</td>
                        <td className="px-3 py-2.5 whitespace-nowrap text-xs text-textSecondary text-center">{link.outgoingCalls}</td>
                        <td className="px-3 py-2.5 whitespace-nowrap text-xs text-textSecondary text-center">{link.incomingCalls}</td>
                        <td className="px-3 py-2.5 whitespace-nowrap text-xs text-textSecondary text-center">{link.outgoingSMS}</td>
                        <td className="px-3 py-2.5 whitespace-nowrap text-xs text-textSecondary text-center">{link.incomingSMS}</td>
                        <td className="px-3 py-2.5 whitespace-nowrap text-xs text-textSecondary text-center">{link.totalInteractions}</td>
                        <td className="px-3 py-2.5 whitespace-nowrap text-xs text-textSecondary text-center">{formatDurationFromSeconds(link.totalCallDuration)}</td>
                        <td className="px-3 py-2.5 whitespace-nowrap text-xs text-textSecondary">{link.firstInteraction ? formatDate(link.firstInteraction.toISOString()) : 'N/A'}</td>
                        <td className="px-3 py-2.5 whitespace-nowrap text-xs text-textSecondary">{link.lastInteraction ? formatDate(link.lastInteraction.toISOString()) : 'N/A'}</td>
                        <td className="px-3 py-2.5 whitespace-nowrap text-xs"><button onClick={() => handleViewDetails(link)} className="text-primary-dark hover:underline flex items-center"><Eye size={14} className="mr-1"/>Details</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {totalPages > 1 && (
                <div className="flex flex-col sm:flex-row justify-between items-center mt-3 pt-2 border-t border-neutral-light text-xs">
                  <span className="text-textSecondary mb-1 sm:mb-0">Page {currentPage} of {totalPages}</span>
                  <div className="flex gap-1.5">
                    <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1} className="px-2.5 py-1 font-medium bg-surface border rounded-md shadow-sm hover:bg-neutral-lighter disabled:opacity-50">Prev</button>
                    <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages} className="px-2.5 py-1 font-medium bg-surface border rounded-md shadow-sm hover:bg-neutral-lighter disabled:opacity-50">Next</button>
                  </div>
                </div>
              )}
            </div>
          ) : (
             <div className="p-6 bg-neutral-lightest border border-neutral-light rounded-lg text-center text-textSecondary flex flex-col items-center justify-center min-h-[100px] shadow-md">
                <Info size={24} className="mb-2 text-neutral-DEFAULT" />
                <p>No linked numbers found for MSISDN: {targetSummary.msisdn}.</p>
             </div>
          )}
        </>
      )}
      
      {/* Modal for Interaction Records */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-neutral-darkest/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setIsModalOpen(false)}>
          <div className="bg-surface rounded-xl shadow-2xl w-full max-w-3xl max-h-[90vh] p-5 sm:p-6 border border-neutral-light flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-3 pb-2 border-b border-neutral-light">
              <h3 className="text-md font-semibold text-textPrimary truncate" title={modalTitle}>{modalTitle}</h3>
              <button onClick={() => setIsModalOpen(false)} className="text-neutral-DEFAULT hover:text-danger-dark p-1 rounded-full hover:bg-danger-lighter/50"><X size={20}/></button>
            </div>
            <div className="flex-grow overflow-y-auto scrollbar-thin pr-1">
                <div className="flex justify-end mb-2">
                     <button onClick={handleExportModalTable} className="px-2.5 py-1 text-[10px] bg-info-lighter/60 text-info-dark rounded-md hover:bg-info-lighter/80 font-medium flex items-center shadow-sm"><Download size={12} className="mr-1"/>Export Records</button>
                </div>
              <table className="min-w-full divide-y divide-neutral-light text-[11px]">
                <thead className="bg-neutral-lightest sticky top-0 z-10">
                    <tr>{modalTableHeaders.map(h => <th key={String(h.key)} onClick={() => requestModalSort(h.key as keyof LACRecord)} className="group px-2 py-1.5 text-left font-semibold text-textPrimary uppercase tracking-wider cursor-pointer hover:bg-neutral-light"><div className="flex items-center">{h.icon && <span className="mr-1 text-neutral-DEFAULT group-hover:text-primary">{h.icon}</span>}{h.label}{renderModalSortIcon(h.key as keyof LACRecord)}</div></th>)}</tr>
                </thead>
                <tbody className="bg-surface divide-y divide-neutral-light">
                  {paginatedModalRecords.map((rec, idx) => (
                    <tr key={rec.id + idx} className="hover:bg-neutral-lightest/50">
                       {modalTableHeaders.map(header => {
                        let displayVal: React.ReactNode = rec[header.key as keyof LACRecord] ?? 'N/A';
                        if (header.key === 'lacCellId') {
                            displayVal = `${rec.LAC}-${rec.CELL_ID}`;
                        } else if (header.key === 'DATE_TIME' && rec.DATE_TIME) {
                            displayVal = formatDate(rec.DATE_TIME);
                        }
                        return <td key={String(header.key)} className="px-2 py-1 whitespace-nowrap text-textSecondary truncate max-w-[120px]" title={String(displayVal)}>{displayVal}</td>
                    })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {totalModalPages > 1 && (
              <div className="flex flex-col sm:flex-row justify-between items-center mt-2 pt-2 border-t border-neutral-light text-[10px]">
                <span className="text-textSecondary mb-1 sm:mb-0">Page {modalCurrentPage} of {totalModalPages} ({modalRecords.length} records)</span>
                <div className="flex gap-1">
                  <button onClick={() => setModalCurrentPage(p => Math.max(1, p - 1))} disabled={modalCurrentPage === 1} className="px-2 py-0.5 font-medium bg-surface border rounded-md shadow-sm hover:bg-neutral-lighter disabled:opacity-50">Prev</button>
                  <button onClick={() => setModalCurrentPage(p => Math.min(totalModalPages, p + 1))} disabled={modalCurrentPage === totalPages} className="px-2 py-0.5 font-medium bg-surface border rounded-md shadow-sm hover:bg-neutral-lighter disabled:opacity-50">Next</button>
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

export default LACCallSmsLinkView;
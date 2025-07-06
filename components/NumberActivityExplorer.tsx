import React, { useMemo, useState, useCallback } from 'react';
import { useCDRContext } from '../contexts/CDRContext';
import { CDRRecord, NumberActivityStats, DetailedNumberActivityForModal, ActivityPattern, TopContact, MainView } from '../types';
import { TrendingUp, PhoneCall, MessageSquareText, ArrowDownAZ, ArrowUpAZ, Download, AlertTriangle, Info, ChevronsUpDown, User, Activity, Clock, Maximize2, Share2, UserCog, BarChart2, List, X, Printer, Search as SearchIcon } from 'lucide-react'; // Added Printer and SearchIcon
import { downloadCSV } from '../utils/downloadUtils';
import { parseDateTime, formatDate, formatDateFromTimestamp, isOutgoingCallType, isIncomingCallType, isOutgoingSMSType, isIncomingSMSType, isAnyCall, isAnySMS, formatDurationFromSeconds } from '../utils/cdrUtils'; 
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';


interface ActivityTableProps<T extends keyof NumberActivityStats> {
  title: string;
  icon: React.ReactNode;
  data: NumberActivityStats[];
  columns: { header: string; accessor: (item: NumberActivityStats) => string | number; sortKey: T, numeric?: boolean }[];
  defaultSortKey: T;
  emptyMessage: string;
  onDownload: (dataToDownload: NumberActivityStats[]) => void;
  onRowClick: (numberStats: NumberActivityStats) => void;
}

const ROWS_PER_PAGE = 10;

const ActivityTable = <T extends keyof NumberActivityStats>({ title, icon, data, columns, defaultSortKey, emptyMessage, onDownload, onRowClick }: ActivityTableProps<T>) => {
  const [currentPage, setCurrentPage] = useState(1);
  const [sortConfig, setSortConfig] = useState<{ key: T; direction: 'ascending' | 'descending' }>({ key: defaultSortKey, direction: 'descending' });

  const sortedData = useMemo(() => {
    const sortableItems = [...data];
    if (sortConfig.key) {
      sortableItems.sort((a, b) => {
        let valA, valB;
        const key = sortConfig.key;

        if (key === 'firstSeen' || key === 'lastSeen') {
            const dateA = a[key];
            const dateB = b[key];
            valA = (dateA instanceof Date ? dateA.getTime() : undefined) ?? (sortConfig.direction === 'ascending' ? Infinity : -Infinity);
            valB = (dateB instanceof Date ? dateB.getTime() : undefined) ?? (sortConfig.direction === 'ascending' ? Infinity : -Infinity);
        } else {
            valA = columns.find(c => c.sortKey === key)?.accessor(a);
            valB = columns.find(c => c.sortKey === key)?.accessor(b);
            if (typeof valA === 'string' && typeof valB === 'string') {
              return sortConfig.direction === 'ascending' ? valA.localeCompare(valB) : valB.localeCompare(valA);
            } else if (typeof valA === 'number' && typeof valB === 'number') {
              // Fall through to numeric comparison
            } else { // One or both might be non-numeric strings that represent numbers, or mixed types
                const numA = parseFloat(String(valA));
                const numB = parseFloat(String(valB));
                if (!isNaN(numA) && !isNaN(numB)) {
                    valA = numA;
                    valB = numB;
                } // else keep original for string localeCompare or direct comparison
            }
        }
        
        if (typeof valA === 'number' && typeof valB === 'number') {
             return sortConfig.direction === 'ascending' ? valA - valB : valB - valA;
        }
        // Fallback for non-numeric or incomparable types
        const strA = String(valA);
        const strB = String(valB);
        return sortConfig.direction === 'ascending' ? strA.localeCompare(strB) : strB.localeCompare(strA);
      });
    }
    return sortableItems;
  }, [data, sortConfig, columns]);

  const paginatedData = useMemo(() => {
    const startIndex = (currentPage - 1) * ROWS_PER_PAGE;
    return sortedData.slice(startIndex, startIndex + ROWS_PER_PAGE);
  }, [sortedData, currentPage]);

  const totalPages = Math.ceil(sortedData.length / ROWS_PER_PAGE);

  const requestSort = (key: T) => {
    let direction: 'ascending' | 'descending' = 'descending';
    if (sortConfig.key === key && sortConfig.direction === 'descending') {
      direction = 'ascending';
    }
    setSortConfig({ key, direction });
    setCurrentPage(1);
  };
  
  const renderSortIcon = (key: T) => {
    if (sortConfig.key !== key) return <ChevronsUpDown size={14} className="ml-1 text-neutral-DEFAULT opacity-30 group-hover:opacity-100 inline transition-opacity" />;
    return sortConfig.direction === 'ascending' ? <ArrowUpAZ size={14} className="ml-1 text-primary-dark inline" /> : <ArrowDownAZ size={14} className="ml-1 text-primary-dark inline" />;
  };


  if (data.length === 0) {
    return (
      <div className="bg-surface p-4 sm:p-6 rounded-xl shadow-xl border border-neutral-light">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-3">
          <h3 className="text-base sm:text-lg font-semibold text-textPrimary flex items-center mb-2 sm:mb-0">
            {icon} {title}
          </h3>
        </div>
        <div className="p-6 bg-neutral-lightest border border-neutral-light rounded-lg text-center text-textSecondary min-h-[100px] flex flex-col items-center justify-center shadow-sm">
          <Info size={24} className="mb-2 text-neutral-DEFAULT" />
          <p>{emptyMessage}</p>
        </div>
      </div>
    );
  }
  
  return (
    <div className="bg-surface p-4 sm:p-6 rounded-xl shadow-xl border border-neutral-light">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-3">
        <h3 className="text-base sm:text-lg font-semibold text-textPrimary flex items-center mb-2 sm:mb-0">
          {icon} {title} ({sortedData.length})
        </h3>
        <button 
            onClick={() => onDownload(sortedData)} 
            className="px-3 py-1.5 text-xs bg-secondary text-white rounded-lg hover:bg-secondary-dark focus:outline-none focus:ring-2 focus:ring-secondary-light focus:ring-offset-1 flex items-center shadow-md hover:shadow-lg transition-all self-start sm:self-center">
            <Download size={14} className="mr-1.5" /> Export CSV
        </button>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-neutral-light">
          <thead className="bg-neutral-lightest">
            <tr>
              <th className="px-3 py-2.5 text-left text-xs font-semibold text-textPrimary uppercase tracking-wider">Rank</th>
              {columns.map(col => (
                <th key={String(col.sortKey)} onClick={() => requestSort(col.sortKey)} className="group px-3 py-2.5 text-left text-xs font-semibold text-textPrimary uppercase tracking-wider cursor-pointer hover:bg-neutral-lighter transition-colors whitespace-nowrap">
                  {col.header} {renderSortIcon(col.sortKey)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="bg-surface divide-y divide-neutral-light">
            {paginatedData.map((item, index) => (
              <tr 
                key={item.number + index} 
                className={`${index % 2 === 0 ? 'bg-surface' : 'bg-neutral-lightest/70'} hover:bg-primary-lighter/30 cursor-pointer`}
                onClick={() => onRowClick(item)}
                title={`Click to see details for ${item.number}`}
              >
                <td className="px-3 py-2 whitespace-nowrap text-xs text-textSecondary">{(currentPage - 1) * ROWS_PER_PAGE + index + 1}</td>
                {columns.map(col => (
                  <td key={String(col.sortKey) + item.number} className="px-3 py-2 whitespace-nowrap text-xs text-textSecondary">
                    {col.sortKey === 'totalCallDuration' ? formatDurationFromSeconds(Number(col.accessor(item))) : 
                     (col.sortKey === 'firstSeen' || col.sortKey === 'lastSeen') && item[col.sortKey] ? formatDate((item[col.sortKey] as Date).toISOString()) :
                     col.accessor(item)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {totalPages > 1 && (
        <div className="flex flex-col sm:flex-row justify-between items-center mt-4 py-2">
          <span className="text-xs text-textSecondary mb-2 sm:mb-0">Page {currentPage} of {totalPages}</span>
          <div className="flex gap-1.5">
            <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1} className="px-2.5 py-1 text-xs font-medium text-textPrimary bg-surface border border-neutral-light rounded-md shadow-sm hover:bg-neutral-lighter disabled:opacity-50">Previous</button>
            <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages} className="px-2.5 py-1 text-xs font-medium text-textPrimary bg-surface border border-neutral-light rounded-md shadow-sm hover:bg-neutral-lighter disabled:opacity-50">Next</button>
          </div>
        </div>
      )}
    </div>
  );
};

const SmallBarChart = ({ data, color, title }: { data: ActivityPattern[], color: string, title?: string }) => (
    <div className="h-28 w-full">
      {title && <p className="text-xs text-textSecondary text-center mb-1">{title}</p>}
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 5, right: 5, left: -25, bottom: 5 }}>
          <CartesianGrid strokeDasharray="2 2" strokeOpacity={0.5} />
          <XAxis dataKey="name" tick={{ fontSize: 8 }} interval={data.length > 12 ? Math.floor(data.length/6) : 0} />
          <YAxis tick={{ fontSize: 8 }} allowDecimals={false}/>
          <Bar dataKey="count" fill={color} radius={[3, 3, 0, 0]} barSize={data.length > 12 ? 6: 10} />
        </BarChart>
      </ResponsiveContainer>
    </div>
);

interface ActivityDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  data: DetailedNumberActivityForModal | null;
  setActiveView: (view: MainView) => void; 
}

const ActivityDetailModal: React.FC<ActivityDetailModalProps> = ({ isOpen, onClose, data, setActiveView }) => {
  const { setTargetNodeForGraphView, setTargetNumberForBehavioralProfile } = useCDRContext();

  if (!isOpen || !data) return null;

  const { 
    baseStats, totalOutgoingCallDuration, totalIncomingCallDuration, 
    avgOutgoingCallDuration, avgIncomingCallDuration, 
    topOutgoingCallContacts, topIncomingCallContacts, hourlyCallActivity,
    topOutgoingSmsContacts, topIncomingSmsContacts, hourlySmsActivity
  } = data;


  const handleViewInGraph = () => {
    if (data) {
      setTargetNodeForGraphView(data.baseStats.number);
      setActiveView('graph'); 
      onClose();
    }
  };

  const handleViewBehavioralProfile = () => {
    if (data) {
      setTargetNumberForBehavioralProfile(data.baseStats.number);
      setActiveView('behavioralMatching');
      onClose();
    }
  };
  
  const handlePrintDetails = () => {
    window.print();
  };

  return (
    <div 
      className="fixed inset-0 bg-neutral-darkest/60 backdrop-blur-sm z-40 flex items-center justify-center p-4 transition-opacity duration-300 activity-detail-modal-print-wrapper" 
      onClick={onClose}
    >
      <div 
        className="bg-surface rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-5 sm:p-6 border border-neutral-light scrollbar-thin scrollbar-thumb-neutral-light activity-detail-modal-content"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center mb-4 pb-3 border-b border-neutral-light">
          <h2 className="text-lg sm:text-xl font-semibold text-primary flex items-center">
            <Activity size={22} className="mr-2.5"/>Detailed Activity: <span className="text-primary-dark ml-1">{baseStats.number}</span>
          </h2>
          <button onClick={onClose} className="text-neutral-DEFAULT hover:text-danger-dark p-1 rounded-full hover:bg-danger-lighter/50 transition-colors no-print"><X size={22}/></button>
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs mb-5 text-center">
            <div className="p-2.5 bg-neutral-lightest rounded-lg shadow-sm border border-neutral-light"> <p className="font-semibold text-textPrimary">{baseStats.totalCalls}</p> <p className="text-textSecondary">Total Calls</p> </div>
            <div className="p-2.5 bg-neutral-lightest rounded-lg shadow-sm border border-neutral-light"> <p className="font-semibold text-textPrimary">{baseStats.totalSMS}</p> <p className="text-textSecondary">Total SMS</p> </div>
            <div className="p-2.5 bg-neutral-lightest rounded-lg shadow-sm border border-neutral-light"> <p className="font-semibold text-textPrimary">{formatDurationFromSeconds(baseStats.totalCallDuration)}</p> <p className="text-textSecondary">Total Call Time</p> </div>
            <div className="p-2.5 bg-neutral-lightest rounded-lg shadow-sm border border-neutral-light"> <p className="font-semibold text-textPrimary">{baseStats.uniqueCallContacts + baseStats.uniqueSmsContacts}</p> <p className="text-textSecondary">Total Unique Contacts</p> </div>
        </div>
         <div className="text-xs text-textSecondary mb-5 border-t border-neutral-light pt-3">
            <p><strong className="font-medium text-neutral-dark">First Seen:</strong> {baseStats.firstSeen ? formatDate(baseStats.firstSeen.toISOString()) : 'N/A'}</p>
            <p><strong className="font-medium text-neutral-dark">Last Seen:</strong> {baseStats.lastSeen ? formatDate(baseStats.lastSeen.toISOString()) : 'N/A'}</p>
        </div>


        {/* Call Activity */}
        <div className="mb-5">
          <h4 className="text-base font-semibold text-textPrimary mb-2 flex items-center"><PhoneCall size={18} className="mr-2 text-secondary"/>Call Activity</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs p-3 bg-neutral-lightest/60 border border-neutral-light rounded-lg">
            <div>
                <p><strong className="text-neutral-dark">Outgoing Calls:</strong> {baseStats.outgoingCalls} ({formatDurationFromSeconds(totalOutgoingCallDuration)}, Avg: {formatDurationFromSeconds(avgOutgoingCallDuration)})</p>
                <p><strong className="text-neutral-dark">Incoming Calls:</strong> {baseStats.incomingCalls} ({formatDurationFromSeconds(totalIncomingCallDuration)}, Avg: {formatDurationFromSeconds(avgIncomingCallDuration)})</p>
                <p><strong className="text-neutral-dark">Unique Call Contacts:</strong> {baseStats.uniqueCallContacts}</p>
            </div>
            <SmallBarChart data={hourlyCallActivity} color="#10b981" title="Hourly Call Pattern"/>
            <div>
                <p className="font-medium text-neutral-dark mb-1">Top Outgoing Call Contacts:</p>
                {topOutgoingCallContacts.length > 0 ? <ul className="list-disc list-inside ml-2">{topOutgoingCallContacts.map(c => <li key={`ogcall-${c.number}`}>{c.number} ({c.count})</li>)}</ul> : <p>None</p>}
            </div>
             <div>
                <p className="font-medium text-neutral-dark mb-1">Top Incoming Call Contacts:</p>
                {topIncomingCallContacts.length > 0 ? <ul className="list-disc list-inside ml-2">{topIncomingCallContacts.map(c => <li key={`iccall-${c.number}`}>{c.number} ({c.count})</li>)}</ul> : <p>None</p>}
            </div>
          </div>
        </div>

        {/* SMS Activity */}
        <div className="mb-6">
          <h4 className="text-base font-semibold text-textPrimary mb-2 flex items-center"><MessageSquareText size={18} className="mr-2 text-accent"/>SMS Activity</h4>
           <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs p-3 bg-neutral-lightest/60 border border-neutral-light rounded-lg">
            <div>
                <p><strong className="text-neutral-dark">Outgoing SMS:</strong> {baseStats.outgoingSMS}</p>
                <p><strong className="text-neutral-dark">Incoming SMS:</strong> {baseStats.incomingSMS}</p>
                <p><strong className="text-neutral-dark">Unique SMS Contacts:</strong> {baseStats.uniqueSmsContacts}</p>
            </div>
            <SmallBarChart data={hourlySmsActivity} color="#f59e0b" title="Hourly SMS Pattern"/>
             <div>
                <p className="font-medium text-neutral-dark mb-1">Top Outgoing SMS Contacts:</p>
                {topOutgoingSmsContacts.length > 0 ? <ul className="list-disc list-inside ml-2">{topOutgoingSmsContacts.map(c => <li key={`ogsms-${c.number}`}>{c.number} ({c.count})</li>)}</ul> : <p>None</p>}
            </div>
             <div>
                <p className="font-medium text-neutral-dark mb-1">Top Incoming SMS Contacts:</p>
                {topIncomingSmsContacts.length > 0 ? <ul className="list-disc list-inside ml-2">{topIncomingSmsContacts.map(c => <li key={`icsms-${c.number}`}>{c.number} ({c.count})</li>)}</ul> : <p>None</p>}
            </div>
          </div>
        </div>
        
        {/* Actions */}
        <div className="flex flex-col sm:flex-row justify-end gap-3 pt-4 border-t border-neutral-light">
            <button onClick={handlePrintDetails} className="px-4 py-2 text-sm bg-accent-lighter/70 text-accent-dark rounded-lg hover:bg-accent-lighter flex items-center justify-center shadow-sm hover:shadow-md transition-all no-print">
                <Printer size={16} className="mr-2"/>Print Details
            </button>
            <button onClick={handleViewInGraph} className="px-4 py-2 text-sm bg-primary-lighter/70 text-primary-dark rounded-lg hover:bg-primary-lighter flex items-center justify-center shadow-sm hover:shadow-md transition-all no-print">
                <Share2 size={16} className="mr-2"/>View in Graph
            </button>
            <button onClick={handleViewBehavioralProfile} className="px-4 py-2 text-sm bg-secondary-lighter/70 text-secondary-dark rounded-lg hover:bg-secondary-lighter flex items-center justify-center shadow-sm hover:shadow-md transition-all no-print">
                <UserCog size={16} className="mr-2"/>View Behavioral Profile
            </button>
        </div>
      </div>
    </div>
  );
};

interface NumberActivityExplorerProps {
  setActiveView: (view: MainView) => void;
}

const NumberActivityExplorer: React.FC<NumberActivityExplorerProps> = ({ setActiveView }) => {
  const { globallyFilteredRecords, isLoading, error, uploadedFiles, filesToAnalyze, activeFileTabId } = useCDRContext();
  const [selectedNumberDetails, setSelectedNumberDetails] = useState<DetailedNumberActivityForModal | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  
  const [numberInput, setNumberInput] = useState(''); // For the input field value
  const [activeSearchQuery, setActiveSearchQuery] = useState(''); // Set on button click to trigger filtering

  const activityData = useMemo((): NumberActivityStats[] => {
    const statsMap = new Map<string, NumberActivityStats & { firstSeenTime?: number; lastSeenTime?: number; callContacts: Set<string>; smsContacts: Set<string> }>();

    const getStat = (num: string) => {
        if (!statsMap.has(num)) {
            statsMap.set(num, {
                number: num, outgoingCalls: 0, incomingCalls: 0, totalCalls: 0, totalCallDuration: 0,
                outgoingSMS: 0, incomingSMS: 0, totalSMS: 0,
                uniqueCallContacts: 0, uniqueSmsContacts: 0, 
                callContacts: new Set(), smsContacts: new Set()
            });
        }
        return statsMap.get(num)!;
    };

    (globallyFilteredRecords || []).forEach(record => {
        const aparty = record.APARTY?.trim();
        const bparty = record.BPARTY?.trim();
        if (!aparty && !bparty && !(aparty && !bparty) && !(!aparty && bparty) ) return; 
        
        const usageType = record.USAGE_TYPE;
        const duration = parseInt(record.CALL_DURATION, 10) || 0;
        const recordTime = parseDateTime(record.START_DTTIME);

        const processParty = (partyNum: string, isRecordAParty: boolean) => {
            const stat = getStat(partyNum);
            if (recordTime) { 
                const timeMs = recordTime.getTime();
                if (!stat.firstSeenTime || timeMs < stat.firstSeenTime) stat.firstSeenTime = timeMs;
                if (!stat.lastSeenTime || timeMs > stat.lastSeenTime) stat.lastSeenTime = timeMs;
            }

            if (isAnyCall(usageType)) {
                stat.totalCalls++;
                stat.totalCallDuration += duration;
                const otherParty = isRecordAParty ? bparty : aparty;
                if (otherParty) stat.callContacts.add(otherParty);

                if (isRecordAParty) { // partyNum is APARTY
                    if (isOutgoingCallType(usageType)) stat.outgoingCalls++;
                    else if (isIncomingCallType(usageType)) stat.incomingCalls++;
                } else { // partyNum is BPARTY
                    if (isOutgoingCallType(usageType)) stat.incomingCalls++;
                    else if (isIncomingCallType(usageType)) stat.outgoingCalls++;
                }
            } else if (isAnySMS(usageType)) {
                stat.totalSMS++;
                const otherParty = isRecordAParty ? bparty : aparty;
                if (otherParty) stat.smsContacts.add(otherParty);

                if (isRecordAParty) { // partyNum is APARTY
                    if (isOutgoingSMSType(usageType)) stat.outgoingSMS++;
                    else if (isIncomingSMSType(usageType)) stat.incomingSMS++;
                } else { // partyNum is BPARTY
                    if (isOutgoingSMSType(usageType)) stat.incomingSMS++;
                    else if (isIncomingSMSType(usageType)) stat.outgoingSMS++;
                }
            }
        };
        if (aparty) processParty(aparty, true);
        if (bparty) processParty(bparty, false);
    });
    
    const finalStats: NumberActivityStats[] = [];
    statsMap.forEach((stat) => {
        stat.uniqueCallContacts = stat.callContacts.size;
        stat.uniqueSmsContacts = stat.smsContacts.size;
        
        const finalStat: NumberActivityStats = {
            number: stat.number, outgoingCalls: stat.outgoingCalls, incomingCalls: stat.incomingCalls,
            totalCalls: stat.totalCalls, totalCallDuration: stat.totalCallDuration, outgoingSMS: stat.outgoingSMS,
            incomingSMS: stat.incomingSMS, totalSMS: stat.totalSMS, uniqueCallContacts: stat.uniqueCallContacts,
            uniqueSmsContacts: stat.uniqueSmsContacts,
            firstSeen: stat.firstSeenTime ? new Date(stat.firstSeenTime) : undefined,
            lastSeen: stat.lastSeenTime ? new Date(stat.lastSeenTime) : undefined,
        };
        if (finalStat.totalCalls > 0 || finalStat.totalSMS > 0) {
            finalStats.push(finalStat);
        }
    });
    return finalStats;
  }, [globallyFilteredRecords]);

  const displayedActivityData = useMemo(() => {
    if (!activeSearchQuery) return activityData;
    // Phone numbers are typically strings of digits, case-insensitivity usually not needed but good practice if mixed content expected
    const queryLower = activeSearchQuery.toLowerCase(); 
    return activityData.filter(stat => stat.number.toLowerCase().includes(queryLower));
  }, [activityData, activeSearchQuery]);


  const calculateDetailedStats = useCallback((selectedNumberStat: NumberActivityStats): DetailedNumberActivityForModal => {
    const number = selectedNumberStat.number;
    let totalOutgoingCallDuration = 0;
    let totalIncomingCallDuration = 0;
    const outgoingCallContactsMap = new Map<string, number>();
    const incomingCallContactsMap = new Map<string, number>();
    const hourlyCallActivityArr = Array(24).fill(0).map((_, i) => ({ name: `${String(i).padStart(2,'0')}:00`, count: 0 }));
    
    const outgoingSmsContactsMap = new Map<string, number>();
    const incomingSmsContactsMap = new Map<string, number>();
    const hourlySmsActivityArr = Array(24).fill(0).map((_, i) => ({ name: `${String(i).padStart(2,'0')}:00`, count: 0 }));

    (globallyFilteredRecords || []).forEach(record => {
        const aparty = record.APARTY?.trim();
        const bparty = record.BPARTY?.trim();
        if (!aparty && !bparty && !(aparty && !bparty) && !(!aparty && bparty)) return;

        const usageType = record.USAGE_TYPE;
        const duration = parseInt(record.CALL_DURATION, 10) || 0;
        const recordTime = parseDateTime(record.START_DTTIME);
        const hour = recordTime ? recordTime.getHours() : -1;
        
        const isCallInteraction = isAnyCall(usageType);
        const isSmsInteraction = isAnySMS(usageType);

        if (aparty === number) { // Selected number is APARTY
            if (isCallInteraction) {
                if (isOutgoingCallType(usageType)) {
                    totalOutgoingCallDuration += duration;
                    if (bparty) outgoingCallContactsMap.set(bparty, (outgoingCallContactsMap.get(bparty) || 0) + 1);
                }
                if (hour !== -1) hourlyCallActivityArr[hour].count++;
            } else if (isSmsInteraction) {
                 if (isOutgoingSMSType(usageType) && bparty) {
                    outgoingSmsContactsMap.set(bparty, (outgoingSmsContactsMap.get(bparty) || 0) + 1);
                 }
                 if (hour !== -1) hourlySmsActivityArr[hour].count++;
            }
        } else if (bparty === number) { // Selected number is BPARTY
            if (isCallInteraction) {
                if (isOutgoingCallType(usageType)) { 
                    totalIncomingCallDuration += duration; 
                    if (aparty) incomingCallContactsMap.set(aparty, (incomingCallContactsMap.get(aparty) || 0) + 1);
                } else if (isIncomingCallType(usageType)) { // BPARTY made the call (e.g. MTC for APARTY)
                    // This logic might need refinement if BPARTY initiating MTC is truly an "outgoing" from B's perspective
                    // For now, if BPARTY is the selected number, and usage is MTC, it means A called B.
                    // So, if B is selected, and usage is MTC (from A's perspective), it's an incoming call for B.
                    // The current structure of `isOutgoingCallType` vs `isIncomingCallType` handles this.
                }
                if (hour !== -1) hourlyCallActivityArr[hour].count++;
            } else if (isSmsInteraction) {
                if (isOutgoingSMSType(usageType) && aparty) { 
                    incomingSmsContactsMap.set(aparty, (incomingSmsContactsMap.get(aparty) || 0) + 1);
                }
                if (hour !== -1) hourlySmsActivityArr[hour].count++;
            }
        }
    });

    const mapToTopContacts = (map: Map<string, number>): TopContact[] => Array.from(map.entries()).sort((a,b) => b[1] - a[1]).slice(0,5).map(([num, count]) => ({number: num, count}));

    return {
        baseStats: selectedNumberStat,
        totalOutgoingCallDuration, 
        totalIncomingCallDuration: selectedNumberStat.totalCallDuration - totalOutgoingCallDuration, 
        avgOutgoingCallDuration: selectedNumberStat.outgoingCalls > 0 ? totalOutgoingCallDuration / selectedNumberStat.outgoingCalls : 0,
        avgIncomingCallDuration: selectedNumberStat.incomingCalls > 0 ? (selectedNumberStat.totalCallDuration - totalOutgoingCallDuration) / selectedNumberStat.incomingCalls : 0,
        topOutgoingCallContacts: mapToTopContacts(outgoingCallContactsMap),
        topIncomingCallContacts: mapToTopContacts(incomingCallContactsMap),
        hourlyCallActivity: hourlyCallActivityArr,
        topOutgoingSmsContacts: mapToTopContacts(outgoingSmsContactsMap),
        topIncomingSmsContacts: mapToTopContacts(incomingSmsContactsMap),
        hourlySmsActivity: hourlySmsActivityArr,
    };
  }, [globallyFilteredRecords]);

  const handleRowClick = useCallback((numberStat: NumberActivityStats) => {
    const details = calculateDetailedStats(numberStat);
    setSelectedNumberDetails(details);
    setIsModalOpen(true);
  }, [calculateDetailedStats]);

  const handlePerformSearch = () => {
    const trimmedQuery = numberInput.trim();
    setActiveSearchQuery(trimmedQuery);
    // Optional: if the search results in a single exact match, open modal directly.
    // For now, search filters the tables, and user clicks a row to open modal.
    const exactMatch = activityData.find(stat => stat.number === trimmedQuery);
    if (exactMatch && displayedActivityData.filter(d => d.number.includes(trimmedQuery)).length === 1) {
       // If search input is an exact match AND it's the only one in the filtered results
       // this condition might be too strict or redundant if search simply filters tables.
       // Keeping it simple: search filters table, click opens modal.
    } else if (trimmedQuery && displayedActivityData.filter(d => d.number.includes(trimmedQuery)).length === 0) {
        // alert(`No numbers found containing "${trimmedQuery}".`);
    }
  };
  
  const handleClearSearch = () => {
    setNumberInput('');
    setActiveSearchQuery('');
  };

  const mostCallActivity = useMemo(() => [...displayedActivityData].sort((a,b) => b.totalCalls - a.totalCalls || b.totalCallDuration - a.totalCallDuration), [displayedActivityData]);
  const leastCallActivity = useMemo(() => [...displayedActivityData].filter(a => a.totalCalls > 0).sort((a,b) => a.totalCalls - b.totalCalls || a.totalCallDuration - b.totalCallDuration), [displayedActivityData]);
  const mostSMSActivity = useMemo(() => [...displayedActivityData].sort((a,b) => b.totalSMS - a.totalSMS), [displayedActivityData]);
  const leastSMSActivity = useMemo(() => [...displayedActivityData].filter(a => a.totalSMS > 0).sort((a,b) => a.totalSMS - b.totalSMS), [displayedActivityData]);


  const callColumns: ActivityTableProps<keyof NumberActivityStats>['columns'] = [
    { header: 'Phone Number', accessor: item => item.number, sortKey: 'number'},
    { header: 'Outgoing Calls', accessor: item => item.outgoingCalls, sortKey: 'outgoingCalls', numeric: true },
    { header: 'Incoming Calls', accessor: item => item.incomingCalls, sortKey: 'incomingCalls', numeric: true },
    { header: 'Total Calls', accessor: item => item.totalCalls, sortKey: 'totalCalls', numeric: true },
    { header: 'Total Call Duration', accessor: item => item.totalCallDuration, sortKey: 'totalCallDuration', numeric: true },
    { header: 'Avg Duration/Call', accessor: item => item.totalCalls > 0 ? (item.totalCallDuration/item.totalCalls).toFixed(0) : '0', sortKey: 'totalCallDuration', numeric: true }, 
    { header: 'Unique Call Contacts', accessor: item => item.uniqueCallContacts, sortKey: 'uniqueCallContacts', numeric: true },
    { header: 'First Seen', accessor: item => item.firstSeen ? formatDate(item.firstSeen.toISOString()) : "N/A", sortKey: 'firstSeen'},
    { header: 'Last Seen', accessor: item => item.lastSeen ? formatDate(item.lastSeen.toISOString()) : "N/A", sortKey: 'lastSeen'},
  ];

  const smsColumns: ActivityTableProps<keyof NumberActivityStats>['columns'] = [
    { header: 'Phone Number', accessor: item => item.number, sortKey: 'number' },
    { header: 'Outgoing SMS', accessor: item => item.outgoingSMS, sortKey: 'outgoingSMS', numeric: true },
    { header: 'Incoming SMS', accessor: item => item.incomingSMS, sortKey: 'incomingSMS', numeric: true },
    { header: 'Total SMS', accessor: item => item.totalSMS, sortKey: 'totalSMS', numeric: true },
    { header: 'Unique SMS Contacts', accessor: item => item.uniqueSmsContacts, sortKey: 'uniqueSmsContacts', numeric: true },
    { header: 'First Seen', accessor: item => item.firstSeen ? formatDate(item.firstSeen.toISOString()) : "N/A", sortKey: 'firstSeen'},
    { header: 'Last Seen', accessor: item => item.lastSeen ? formatDate(item.lastSeen.toISOString()) : "N/A", sortKey: 'lastSeen'},
  ];

  const getExportFilenameBase = () => {
    if (activeFileTabId) {
        const activeFile = uploadedFiles.find(f => f.id === activeFileTabId);
        return activeFile ? (activeFile.sourceName || activeFile.name).replace(/[^a-z0-9]/gi, '_').toLowerCase() : "current_file";
    } else if (filesToAnalyze.length === 1) {
        return (filesToAnalyze[0].sourceName || filesToAnalyze[0].name).replace(/[^a-z0-9]/gi, '_').toLowerCase();
    }
    return "all_selected_files";
  };

  const downloadActivityData = (dataToDownload: NumberActivityStats[], type: 'call' | 'sms', listType: 'most' | 'least') => {
    const currentCols = type === 'call' ? callColumns : smsColumns;
    const headers = ["Rank", ...currentCols.map(c => c.header)];
    
    const csvData = dataToDownload.map((item, index) => {
        return [
            String(index + 1),
            ...currentCols.map(col => {
                if (col.sortKey === 'totalCallDuration' && type === 'call') {
                    return formatDurationFromSeconds(Number(col.accessor(item)));
                }
                 if ((col.sortKey === 'firstSeen' || col.sortKey === 'lastSeen') && item[col.sortKey]) {
                    return formatDate((item[col.sortKey] as Date).toISOString());
                 }
                return String(col.accessor(item));
            })
        ];
    });
    downloadCSV(`${listType}_${type}_activity_${getExportFilenameBase()}_${activeSearchQuery ? 'filtered_'+activeSearchQuery : ''}.csv`, csvData, headers);
  };


  if (isLoading) return <div className="flex justify-center items-center h-64"><div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary-dark"></div><p className="ml-3 text-textSecondary">Calculating activity rankings...</p></div>;
  if (error) return <div className="p-4 bg-danger-lighter text-danger-darker rounded-lg text-center border border-danger-light">{error}</div>;
  if (uploadedFiles.length === 0) return <div className="p-6 bg-info-lighter border border-info-light rounded-lg text-center text-info-dark flex flex-col items-center justify-center min-h-[150px] shadow-md"><Info size={28} className="mb-2" /><p className="font-medium">Please upload CDR files.</p></div>;
  if (filesToAnalyze.length === 0) return <div className="p-6 bg-warning-lighter border border-warning-light rounded-lg text-center text-warning-darker flex flex-col items-center justify-center min-h-[150px] shadow-md"><AlertTriangle size={28} className="mb-2" /><p className="font-medium">Please select files in 'Filter Controls' to see activity rankings.</p></div>;
  
  const noActivityData = activityData.length === 0;
  const noDisplayedDataAfterSearch = activeSearchQuery && displayedActivityData.length === 0;

  if (noActivityData) {
      return <div className="p-6 bg-neutral-lightest border border-neutral-light rounded-lg text-center text-textSecondary flex flex-col items-center justify-center min-h-[150px] shadow-md"><Info size={28} className="mb-2 text-neutral-DEFAULT" /><p>No activity data found for the selected files and global filters.</p></div>;
  }


  return (
    <div className="space-y-6">
      <div className="p-4 sm:p-5 bg-surface border border-neutral-light rounded-xl shadow-xl">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
            <div className="mb-2 md:mb-0">
                <div className="flex items-center text-xl sm:text-2xl font-semibold text-textPrimary mb-1">
                <TrendingUp size={24} className="mr-2.5 text-primary" /> Activity Ranking Explorer
                </div>
                <p className="text-sm text-textSecondary">Ranking numbers by their call and SMS activity. Click on a row for detailed drill-down.</p>
            </div>
            <div className="w-full md:w-auto flex items-center gap-2">
                <div className="relative flex-grow">
                    <input 
                        type="text" 
                        placeholder="Filter numbers in tables..." 
                        value={numberInput} 
                        onChange={(e) => setNumberInput(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handlePerformSearch()}
                        className="w-full p-2.5 border border-neutral-light rounded-lg focus:ring-2 focus:ring-primary-light focus:border-primary-light text-sm shadow-sm placeholder-neutral-DEFAULT pl-3 pr-8"
                        aria-label="Search for a number to filter activity tables"
                    />
                    {numberInput && (
                        <button onClick={handleClearSearch} className="absolute inset-y-0 right-0 pr-2.5 flex items-center text-neutral-DEFAULT hover:text-danger" title="Clear search">
                            <X size={16} />
                        </button>
                    )}
                </div>
                <button 
                    onClick={handlePerformSearch}
                    className="px-4 py-2.5 bg-primary text-white rounded-lg hover:bg-primary-dark text-sm font-medium flex items-center shadow-md hover:shadow-lg transition-all"
                    title="Filter tables by number"
                >
                    <SearchIcon size={16} className="mr-1.5 sm:mr-0"/>
                    <span className="hidden sm:inline ml-1.5">Filter</span>
                </button>
            </div>
        </div>
        {noDisplayedDataAfterSearch && (
             <div className="mt-4 p-3 bg-warning-lighter border border-warning-light rounded-lg text-sm text-warning-darker flex items-center">
                <AlertTriangle size={18} className="mr-2"/> No numbers found containing "{activeSearchQuery}". Try a different search term or clear the filter.
            </div>
        )}
      </div>

      <ActivityTable 
        title="Most Call Activity" 
        icon={<PhoneCall size={18} className="mr-2 text-success-dark" />} 
        data={mostCallActivity} 
        columns={callColumns} 
        defaultSortKey="totalCalls"
        emptyMessage={activeSearchQuery ? `No call activity for numbers containing "${activeSearchQuery}".` : "No call activity data to rank."}
        onDownload={(d) => downloadActivityData(d, 'call', 'most')}
        onRowClick={handleRowClick}
      />
      <ActivityTable 
        title="Least Call Activity (Min. 1 Call)" 
        icon={<PhoneCall size={18} className="mr-2 text-warning-dark" />} 
        data={leastCallActivity} 
        columns={callColumns} 
        defaultSortKey="totalCalls"
        emptyMessage={activeSearchQuery ? `No call activity (min 1 call) for numbers containing "${activeSearchQuery}".` : "No call activity data to rank (min. 1 call required)."}
        onDownload={(d) => downloadActivityData(d, 'call', 'least')}
        onRowClick={handleRowClick}
      />
      <ActivityTable 
        title="Most SMS Activity" 
        icon={<MessageSquareText size={18} className="mr-2 text-info-dark" />} 
        data={mostSMSActivity} 
        columns={smsColumns} 
        defaultSortKey="totalSMS"
        emptyMessage={activeSearchQuery ? `No SMS activity for numbers containing "${activeSearchQuery}".` : "No SMS activity data to rank."}
        onDownload={(d) => downloadActivityData(d, 'sms', 'most')}
        onRowClick={handleRowClick}
      />
      <ActivityTable 
        title="Least SMS Activity (Min. 1 SMS)" 
        icon={<MessageSquareText size={18} className="mr-2 text-accent-dark" />} 
        data={leastSMSActivity} 
        columns={smsColumns} 
        defaultSortKey="totalSMS"
        emptyMessage={activeSearchQuery ? `No SMS activity (min 1 SMS) for numbers containing "${activeSearchQuery}".` : "No SMS activity data to rank (min. 1 SMS required)."}
        onDownload={(d) => downloadActivityData(d, 'sms', 'least')}
        onRowClick={handleRowClick}
      />
      {isModalOpen && (
        <ActivityDetailModal 
            isOpen={isModalOpen} 
            onClose={() => setIsModalOpen(false)} 
            data={selectedNumberDetails}
            setActiveView={setActiveView}
        />
      )}
    </div>
  );
};

export default NumberActivityExplorer;

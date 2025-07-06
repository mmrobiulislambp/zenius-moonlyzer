
import React, { useState, useCallback, useMemo } from 'react';
import { History, AlertTriangle, Loader2, Search, CalendarDays, CheckSquare, Square, Database, MessageSquare, Landmark, TowerControl, Globe, PhoneCall, Settings2, Info } from 'lucide-react'; // Added Info
import { useCDRContext } from '../contexts/CDRContext';
import { useSMSContext } from '../contexts/SMSContext';
import { useNagadContext } from '../contexts/NagadContext';
import { useBkashContext } from '../contexts/BkashContext';
import { useLACContext } from '../contexts/LACContext';
import { useIPDRContext } from '../contexts/IPDRContext'; // Added for future IPDR integration
import { UnifiedEvent, CDRRecord, SMSRecord, NagadRecord, BkashRecord, LACRecord, IPDRRecord, RoketRecord } from '../types';
import { parseDateTime, formatDate, isAnyCall, isAnySMS } from '../utils/cdrUtils'; // formatDurationFromSeconds might be useful too

// Placeholder for RoketContext if it's added later
// import { useRoketContext } from '../contexts/RoketContext';

const DATA_SOURCES = [
  { id: 'cdr', label: 'CDR (Calls & SMS)', icon: <Database size={16} /> },
  { id: 'sms', label: 'SMS (Dedicated Files)', icon: <MessageSquare size={16} /> },
  { id: 'nagad', label: 'Nagad Transactions', icon: <Landmark size={16} /> },
  { id: 'bkash', label: 'bKash Transactions', icon: <Landmark size={16} /> },
  { id: 'lac', label: 'LAC/Tower Records', icon: <TowerControl size={16} /> },
  // { id: 'ipdr', label: 'IPDR Sessions', icon: <Globe size={16} /> }, // For future
];

const UnifiedActivityTimelineView: React.FC = () => {
  const [identifierType, setIdentifierType] = useState<'MSISDN' | 'IMEI'>('MSISDN');
  const [identifierValue, setIdentifierValue] = useState('');
  const [startDate, setStartDate] = useState<string>(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]); // Default to 7 days ago
  const [endDate, setEndDate] = useState<string>(new Date().toISOString().split('T')[0]); // Default to today
  const [selectedDataSources, setSelectedDataSources] = useState<string[]>(['cdr', 'sms', 'nagad', 'bkash', 'lac']);
  
  const [timelineEvents, setTimelineEvents] = useState<UnifiedEvent[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cdrContext = useCDRContext();
  const smsContext = useSMSContext();
  const nagadContext = useNagadContext();
  const bkashContext = useBkashContext();
  const lacContext = useLACContext();
  // const ipdrContext = useIPDRContext(); // For future
  // const roketContext = useRoketContext(); // For future

  const handleDataSourceToggle = (sourceId: string) => {
    setSelectedDataSources(prev =>
      prev.includes(sourceId) ? prev.filter(id => id !== sourceId) : [...prev, sourceId]
    );
  };

  const generateTimeline = useCallback(async () => {
    if (!identifierValue.trim()) {
      setError("Please enter an MSISDN or IMEI.");
      return;
    }
    setIsLoading(true);
    setError(null);
    setTimelineEvents([]);

    const sDate = parseDateTime(startDate + "T00:00:00");
    const eDate = parseDateTime(endDate + "T23:59:59");

    if (!sDate || !eDate || sDate > eDate) {
        setError("Invalid date range.");
        setIsLoading(false);
        return;
    }

    let allEvents: UnifiedEvent[] = [];

    // CDR Data
    if (selectedDataSources.includes('cdr')) {
      cdrContext.allRecords.forEach(r => {
        const recordDate = parseDateTime(r.START_DTTIME);
        if (recordDate && recordDate >= sDate && recordDate <= eDate) {
          const matchesIdentifier = 
            (identifierType === 'MSISDN' && (r.APARTY === identifierValue || r.BPARTY === identifierValue)) ||
            (identifierType === 'IMEI' && r.IMEI === identifierValue);
          
          if (matchesIdentifier) {
            if (isAnyCall(r.USAGE_TYPE)) {
              allEvents.push({
                id: `cdr-call-${r.id}`,
                timestamp: recordDate,
                type: 'CDR_CALL',
                icon: <PhoneCall size={16} className={r.APARTY === identifierValue ? "text-red-500" : "text-green-500"}/>,
                title: `${r.APARTY === identifierValue ? 'Outgoing Call' : 'Incoming Call'} ${r.APARTY === identifierValue ? 'to' : 'from'} ${r.APARTY === identifierValue ? r.BPARTY : r.APARTY}`,
                details: { Duration: r.CALL_DURATION + 's', Tower: `${r.LACSTARTA}-${r.CISTARTA}`, Address: r.ADDRESS },
                originalRecord: r,
              });
            } else if (isAnySMS(r.USAGE_TYPE) || r.USAGE_TYPE?.toUpperCase().includes('SMS')) { // Broader check for SMS in CDR
              allEvents.push({
                id: `cdr-sms-${r.id}`,
                timestamp: recordDate,
                type: 'CDR_SMS',
                icon: <MessageSquare size={16} className={r.APARTY === identifierValue ? "text-blue-500" : "text-purple-500"}/>,
                title: `${r.APARTY === identifierValue ? 'Outgoing SMS' : 'Incoming SMS'} ${r.APARTY === identifierValue ? 'to' : 'from'} ${r.APARTY === identifierValue ? r.BPARTY : r.APARTY}`,
                details: { Tower: `${r.LACSTARTA}-${r.CISTARTA}`, Address: r.ADDRESS },
                originalRecord: r,
              });
            }
          }
        }
      });
    }

    // Dedicated SMS Data
    if (selectedDataSources.includes('sms')) {
      smsContext.allSMSRecords.forEach(r => {
        const recordDate = parseDateTime(r.Timestamp);
        if (recordDate && recordDate >= sDate && recordDate <= eDate) {
          const matchesIdentifier = 
            (identifierType === 'MSISDN' && (r.Initiator === identifierValue || r.Recipient === identifierValue));
            // IMEI is not typically in dedicated SMS logs in the same way as CDRs.
          
          if (matchesIdentifier) {
            allEvents.push({
              id: `sms-${r.id}`,
              timestamp: recordDate,
              type: 'SMS_MESSAGE',
              icon: <MessageSquare size={16} className={r.Initiator === identifierValue ? "text-blue-500" : "text-purple-500"}/>,
              title: `${r.Initiator === identifierValue ? 'Sent SMS' : 'Received SMS'} ${r.Initiator === identifierValue ? 'to' : 'from'} ${r.Initiator === identifierValue ? r.Recipient : r.Initiator}`,
              details: { ContentSnippet: r.Content.substring(0, 50) + (r.Content.length > 50 ? '...' : '') },
              originalRecord: r,
            });
          }
        }
      });
    }
    
    // Nagad Transactions
    if (selectedDataSources.includes('nagad')) {
        nagadContext.allNagadRecords.forEach(r => {
            const recordDate = parseDateTime(r.TXN_DATE_TIME);
            if (recordDate && recordDate >= sDate && recordDate <= eDate) {
                const matchesIdentifier = 
                    (identifierType === 'MSISDN' && (r.STATEMENT_FOR_ACC === identifierValue || r.TXN_WITH_ACC === identifierValue));
                
                if (matchesIdentifier) {
                    const isDebit = r.STATEMENT_FOR_ACC === identifierValue && r.TXN_TYPE_DR_CR === 'DEBIT';
                    const isCredit = r.STATEMENT_FOR_ACC === identifierValue && r.TXN_TYPE_DR_CR === 'CREDIT';
                    allEvents.push({
                        id: `nagad-${r.TXN_ID}`,
                        timestamp: recordDate,
                        type: 'NAGAD_TXN',
                        icon: <Landmark size={16} className={isDebit ? "text-red-600" : (isCredit ? "text-green-600" : "text-gray-500")} />,
                        title: `Nagad: ${r.TXN_TYPE} ${isDebit ? 'to' : (isCredit ? 'from' : 'with')} ${r.TXN_WITH_ACC}`,
                        details: { Amount: `BDT ${r.TXN_AMT.toFixed(2)}`, Direction: r.TXN_TYPE_DR_CR, Channel: r.CHANNEL },
                        originalRecord: r,
                    });
                }
            }
        });
    }

    // bKash Transactions
    if (selectedDataSources.includes('bkash')) {
        bkashContext.allBkashRecords.forEach(r => {
            const recordDate = parseDateTime(r.transactionDate);
             if (recordDate && recordDate >= sDate && recordDate <= eDate) {
                const matchesIdentifier = 
                    (identifierType === 'MSISDN' && (r.sender === identifierValue || r.receiver === identifierValue));
                
                if (matchesIdentifier) {
                    allEvents.push({
                        id: `bkash-${r.trxId}`,
                        timestamp: recordDate,
                        type: 'BKASH_TXN',
                        icon: <Landmark size={16} className={r.sender === identifierValue ? "text-red-600" : "text-green-600"} />,
                        title: `bKash: ${r.trxType} ${r.sender === identifierValue ? 'to' : 'from'} ${r.sender === identifierValue ? r.receiver : r.sender}`,
                        details: { Amount: `BDT ${r.transactedAmount.toFixed(2)}`, Fee: r.fee.toFixed(2) },
                        originalRecord: r,
                    });
                }
            }
        });
    }

    // LAC Records (as individual events for now)
    if (selectedDataSources.includes('lac')) {
        lacContext.allLACRecords.forEach(r => {
            const recordDate = parseDateTime(r.DATE_TIME);
            if (recordDate && recordDate >= sDate && recordDate <= eDate) {
                 const matchesIdentifier = 
                    (identifierType === 'MSISDN' && r.MSISDN === identifierValue) ||
                    (identifierType === 'IMEI' && r.IMEI === identifierValue);
                
                if (matchesIdentifier) {
                     allEvents.push({
                        id: `lac-${r.id}`,
                        timestamp: recordDate,
                        type: 'LAC_EVENT',
                        icon: <TowerControl size={16} className="text-cyan-600"/>,
                        title: `Present at Tower: ${r.LAC}-${r.CELL_ID}`,
                        details: { UsageType: r.USAGE_TYPE, Address: r.ADDRESS, IMEI: r.IMEI },
                        originalRecord: r,
                    });
                }
            }
        });
    }

    allEvents.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
    setTimelineEvents(allEvents);
    setIsLoading(false);
    if (allEvents.length === 0) {
        setError("No activities found for the given identifier and criteria.");
    }
  }, [identifierType, identifierValue, startDate, endDate, selectedDataSources, cdrContext, smsContext, nagadContext, bkashContext, lacContext]);

  return (
    <div className="space-y-6">
      <div className="p-4 sm:p-5 bg-surface border border-neutral-light rounded-xl shadow-xl">
        <div className="flex items-center text-xl sm:text-2xl font-semibold text-textPrimary mb-1">
          <History size={24} className="mr-2.5 text-purple-500" /> Unified Activity Timeline
        </div>
        <p className="text-sm text-textSecondary">View a combined timeline of activities for a specific MSISDN or IMEI.</p>

        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 items-end">
          <div>
            <label htmlFor="identifierType" className="block text-xs font-medium text-textSecondary mb-1">Identifier Type:</label>
            <select id="identifierType" value={identifierType} onChange={e => setIdentifierType(e.target.value as 'MSISDN' | 'IMEI')} className="w-full p-2.5 border border-neutral-light rounded-lg focus:ring-2 focus:ring-primary-light text-sm shadow-sm">
              <option value="MSISDN">MSISDN</option>
              <option value="IMEI">IMEI</option>
            </select>
          </div>
          <div className="lg:col-span-3">
            <label htmlFor="identifierValue" className="block text-xs font-medium text-textSecondary mb-1">{identifierType} Value:</label>
            <input type="text" id="identifierValue" value={identifierValue} onChange={e => setIdentifierValue(e.target.value)} placeholder={`Enter ${identifierType}`} className="w-full p-2.5 border border-neutral-light rounded-lg focus:ring-2 focus:ring-primary-light text-sm shadow-sm"/>
          </div>
          <div>
            <label htmlFor="startDate" className="block text-xs font-medium text-textSecondary mb-1">Start Date:</label>
            <input type="date" id="startDate" value={startDate} onChange={e => setStartDate(e.target.value)} className="w-full p-2.5 border border-neutral-light rounded-lg focus:ring-2 focus:ring-primary-light text-sm shadow-sm accent-primary"/>
          </div>
          <div>
            <label htmlFor="endDate" className="block text-xs font-medium text-textSecondary mb-1">End Date:</label>
            <input type="date" id="endDate" value={endDate} onChange={e => setEndDate(e.target.value)} className="w-full p-2.5 border border-neutral-light rounded-lg focus:ring-2 focus:ring-primary-light text-sm shadow-sm accent-primary"/>
          </div>
        </div>
        
        <div className="mt-4 pt-3 border-t border-neutral-light">
            <h4 className="text-sm font-semibold text-textPrimary mb-2">Data Sources:</h4>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 text-xs">
                {DATA_SOURCES.map(source => (
                    <label key={source.id} className="flex items-center space-x-2 p-2 border border-neutral-light rounded-md hover:bg-neutral-lightest cursor-pointer transition-colors has-[:checked]:bg-primary-lighter has-[:checked]:border-primary-dark">
                        <input 
                            type="checkbox" 
                            checked={selectedDataSources.includes(source.id)}
                            onChange={() => handleDataSourceToggle(source.id)}
                            className="form-checkbox h-4 w-4 text-primary focus:ring-primary-light border-neutral-DEFAULT rounded"
                        />
                        {React.cloneElement(source.icon, { className: "text-neutral-DEFAULT"})}
                        <span>{source.label}</span>
                    </label>
                ))}
            </div>
        </div>

        <button onClick={generateTimeline} disabled={isLoading} className="mt-5 w-full sm:w-auto px-6 py-2.5 bg-primary text-white rounded-lg hover:bg-primary-dark text-sm font-medium shadow-md hover:shadow-lg transition-all disabled:opacity-70 flex items-center justify-center">
          {isLoading ? <Loader2 className="h-5 w-5 animate-spin mr-2"/> : <Settings2 size={18} className="mr-2"/>}
          Generate Timeline
        </button>
      </div>

      {error && <div className="p-3 bg-danger-lighter text-danger-darker rounded-lg border border-danger-light flex items-center shadow-md"><AlertTriangle size={18} className="mr-2"/>{error}</div>}
      
      {isLoading && timelineEvents.length === 0 && <div className="flex justify-center items-center h-40"><Loader2 className="h-10 w-10 animate-spin text-primary" /><p className="ml-3 text-textSecondary">Generating timeline...</p></div>}
      
      {!isLoading && timelineEvents.length > 0 && (
        <div className="p-4 sm:p-5 bg-surface border border-neutral-light rounded-xl shadow-xl">
          <h3 className="text-lg font-semibold text-textPrimary mb-3">Timeline for {identifierValue}</h3>
          <div className="space-y-4 max-h-[60vh] overflow-y-auto scrollbar-thin pr-2">
            {timelineEvents.map(event => (
              <div key={event.id} className="p-3 border-l-4 rounded-r-md shadow-sm hover:shadow-md transition-shadow bg-neutral-lightest border-neutral-light hover:border-primary-light">
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center text-xs font-semibold text-primary">
                    {event.icon}
                    <span className="ml-2">{event.title}</span>
                  </div>
                  <span className="text-[10px] text-textSecondary">{formatDate(event.timestamp.toISOString())}</span>
                </div>
                <div className="text-xs text-textSecondary pl-6 space-y-0.5">
                  {Object.entries(event.details).map(([key, value]) => (
                    <p key={key} className="truncate" title={`${key}: ${String(value)}`}>
                      <strong className="text-neutral-dark">{key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())}:</strong> {String(value)}
                    </p>
                  ))}
                   <p className="text-[9px] text-neutral-DEFAULT pt-0.5">Source File: {event.originalRecord.fileName}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
       {!isLoading && !error && timelineEvents.length === 0 && identifierValue && (
         <div className="p-6 bg-neutral-lightest border border-neutral-light rounded-lg text-center text-textSecondary flex flex-col items-center justify-center min-h-[100px] shadow-md">
            <Info size={24} className="mb-2 text-neutral-DEFAULT" /> {/* Fixed: Replaced InfoCircle with Info */}
            <p>No activity found for <span className="font-semibold text-textPrimary">{identifierValue}</span> with the selected criteria and data sources. Or, analysis not yet run.</p>
        </div>
      )}

    </div>
  );
};

export default UnifiedActivityTimelineView;

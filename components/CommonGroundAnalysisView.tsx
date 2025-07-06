
import React, { useState, useMemo, useCallback } from 'react';
import { Users2, MapPin, Search, AlertTriangle, Clock, Info, Download, Loader2, ListFilter, ChevronDown, ChevronUp, TowerControl } from 'lucide-react';
import { useCDRContext } from '../contexts/CDRContext';
import { CDRRecord } from '../types';
import GoogleMapView from './GoogleMapView';
import { MapMarkerData } from '../types';
import { downloadCSV } from '../utils/downloadUtils';
import { formatDate, parseDateTime } from '../utils/cdrUtils';

interface CommonGroundResult {
  lacCellId: string;
  address?: string;
  involvedMsisdns: string[];
  approximateTime: Date;
  latitude?: number;
  longitude?: number;
}

const CommonGroundAnalysisView: React.FC = () => {
  const { allRecords, getUniqueValues } = useCDRContext();
  const [selectedTargets, setSelectedTargets] = useState<string[]>([]);
  const [timeWindowMinutes, setTimeWindowMinutes] = useState<number>(15);
  const [results, setResults] = useState<CommonGroundResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [currentPage, setCurrentPage] = useState(1);
  const [sortConfig, setSortConfig] = useState<{ key: keyof CommonGroundResult; direction: 'asc' | 'desc' }>({ key: 'approximateTime', direction: 'desc' });
  const ROWS_PER_PAGE = 10;

  const uniqueMSISDNs = useMemo(() => getUniqueValues('APARTY'), [getUniqueValues]);

  const handleTargetSelection = (msisdn: string) => {
    setSelectedTargets(prev => 
      prev.includes(msisdn) ? prev.filter(t => t !== msisdn) : [...prev, msisdn]
    );
  };
  
  const handleAnalyze = useCallback(() => {
    if (selectedTargets.length < 2) {
      setError("Please select at least two targets to find common ground.");
      return;
    }
    setError(null);
    setIsLoading(true);
    setResults([]);
    setCurrentPage(1);

    setTimeout(() => {
      try {
        const timeWindowMs = timeWindowMinutes * 60 * 1000;
        const targetRecordsMap = new Map<string, CDRRecord[]>();
        selectedTargets.forEach(target => {
          const records = allRecords
            .filter(r => (r.APARTY === target || r.BPARTY === target) && r.LACSTARTA && r.CISTARTA)
            .sort((a,b) => (parseDateTime(a.START_DTTIME)?.getTime() || 0) - (parseDateTime(b.START_DTTIME)?.getTime() || 0));
          targetRecordsMap.set(target, records);
        });

        const firstTarget = selectedTargets[0];
        const firstTargetRecords = targetRecordsMap.get(firstTarget) || [];
        const commonGrounds: CommonGroundResult[] = [];
        const processedEvents = new Set<string>(); // key: lacCellId-timestamp-group

        for (const recordA of firstTargetRecords) {
          const lacCellId = `${recordA.LACSTARTA}-${recordA.CISTARTA}`;
          const timeA = parseDateTime(recordA.START_DTTIME)!.getTime();
          
          let potentialPartnersAtEvent = [firstTarget];
          
          for (let i = 1; i < selectedTargets.length; i++) {
            const targetB = selectedTargets[i];
            const recordsB = targetRecordsMap.get(targetB) || [];
            
            const isPresent = recordsB.some(recordB => {
              if (`${recordB.LACSTARTA}-${recordB.CISTARTA}` !== lacCellId) return false;
              const timeB = parseDateTime(recordB.START_DTTIME)!.getTime();
              return Math.abs(timeA - timeB) <= timeWindowMs;
            });

            if (isPresent) {
              potentialPartnersAtEvent.push(targetB);
            }
          }
          
          if (potentialPartnersAtEvent.length === selectedTargets.length) {
            const eventKey = `${lacCellId}-${Math.round(timeA / timeWindowMs)}`; // Group events within the same time window
            if (!processedEvents.has(eventKey)) {
              commonGrounds.push({
                lacCellId,
                address: recordA.ADDRESS,
                latitude: recordA.latitude,
                longitude: recordA.longitude,
                involvedMsisdns: potentialPartnersAtEvent,
                approximateTime: new Date(recordA.START_DTTIME),
              });
              processedEvents.add(eventKey);
            }
          }
        }
        
        setResults(commonGrounds);
        if(commonGrounds.length === 0) setError("No common ground found for the selected targets and time window.");

      } catch (e) {
        setError("An error occurred during analysis.");
        console.error(e);
      } finally {
        setIsLoading(false);
      }
    }, 50);

  }, [selectedTargets, timeWindowMinutes, allRecords]);
  
  const sortedResults = useMemo(() => {
    return [...results].sort((a,b) => {
        if (!sortConfig.key) return 0;
        let comparison = 0;
        const valA = a[sortConfig.key];
        const valB = b[sortConfig.key];
        if (valA instanceof Date && valB instanceof Date) comparison = valA.getTime() - valB.getTime();
        else if(Array.isArray(valA) && Array.isArray(valB)) comparison = valA.length - valB.length;
        else if(typeof valA === 'string' && typeof valB === 'string') comparison = valA.localeCompare(valB);
        return sortConfig.direction === 'asc' ? comparison : -comparison;
    });
  }, [results, sortConfig]);

  const paginatedResults = useMemo(() => {
    const startIndex = (currentPage - 1) * ROWS_PER_PAGE;
    return sortedResults.slice(startIndex, startIndex + ROWS_PER_PAGE);
  }, [sortedResults, currentPage]);
  const totalPages = Math.ceil(sortedResults.length / ROWS_PER_PAGE);

  const requestSort = (key: keyof CommonGroundResult) => {
    let direction: 'asc' | 'desc' = sortConfig.direction === 'asc' ? 'desc' : 'asc';
    if (sortConfig.key !== key) direction = 'desc';
    setSortConfig({ key, direction });
    setCurrentPage(1);
  };
  
  const renderSortIcon = (key: keyof CommonGroundResult) => {
    if (sortConfig.key !== key) return <ListFilter size={14} className="ml-1 opacity-30 group-hover:opacity-100 inline" />;
    return sortConfig.direction === 'desc' ? <ChevronDown size={14} className="ml-1 text-primary inline" /> : <ChevronUp size={14} className="ml-1 text-primary inline" />;
  };

  const mapMarkers = useMemo((): MapMarkerData[] => {
    return results.map((result, index) => ({
      id: `${result.lacCellId}-${index}`,
      position: { lat: result.latitude || 0, lng: result.longitude || 0 },
      title: `Common Ground: ${result.lacCellId}`,
      infoContent: `<b>Tower:</b> ${result.lacCellId}<br/><b>Address:</b> ${result.address || 'N/A'}<br/><b>Approx. Time:</b> ${formatDate(result.approximateTime.toISOString())}<br/><b>Present:</b> ${result.involvedMsisdns.join(', ')}`
    })).filter(marker => marker.position.lat !== 0 || marker.position.lng !== 0);
  }, [results]);

  const handleExportData = () => {
    const headers = ["LAC-CELL_ID", "Address", "Approximate Time", "Involved MSISDNs"];
    const data = sortedResults.map(r => [r.lacCellId, r.address || 'N/A', formatDate(r.approximateTime.toISOString()), r.involvedMsisdns.join('; ')]);
    downloadCSV('common_ground_analysis.csv', data, headers);
  };

  const tableHeaders: { key: keyof CommonGroundResult, label: string, icon?: React.ReactNode }[] = [
    { key: 'lacCellId', label: 'Tower ID', icon: <TowerControl size={14}/> },
    { key: 'address', label: 'Address', icon: <MapPin size={14}/> },
    { key: 'approximateTime', label: 'Approx. Time', icon: <Clock size={14}/> },
    { key: 'involvedMsisdns', label: 'Involved Parties', icon: <Users2 size={14}/> },
  ];

  return (
    <div className="space-y-4">
      <div className="p-4 bg-surface border border-neutral-light rounded-xl shadow-md">
        <h2 className="text-xl font-semibold text-textPrimary mb-2 flex items-center">
            <Users2 size={22} className="mr-2 text-primary"/><MapPin size={22} className="mr-2 text-primary"/>Common Ground Analysis
        </h2>
        <p className="text-sm text-textSecondary">Find locations where multiple targets were present within the same time window.</p>
        
        <div className="mt-4 space-y-4">
            <div>
                <label className="block text-xs font-medium text-textSecondary mb-1">Select Targets (2 or more):</label>
                <div className="max-h-28 overflow-y-auto scrollbar-thin p-2 border border-neutral-light rounded-lg grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
                    {uniqueMSISDNs.map(msisdn => (
                        <label key={msisdn} className="flex items-center space-x-2 text-xs p-1.5 rounded hover:bg-neutral-lightest cursor-pointer has-[:checked]:bg-primary-lighter has-[:checked]:border-primary-dark border border-transparent">
                            <input type="checkbox" checked={selectedTargets.includes(msisdn)} onChange={() => handleTargetSelection(msisdn)} className="form-checkbox h-3.5 w-3.5 text-primary focus:ring-primary-light border-neutral-DEFAULT rounded"/>
                            <span>{msisdn}</span>
                        </label>
                    ))}
                </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-end">
                <div>
                    <label htmlFor="timeWindow" className="block text-xs font-medium text-textSecondary mb-1">Time Window (minutes):</label>
                    <input type="number" id="timeWindow" value={timeWindowMinutes} onChange={e => setTimeWindowMinutes(Math.max(1, Number(e.target.value)))} min="1" className="w-full p-2 border border-neutral-light rounded-md focus:ring-2 focus:ring-primary-light text-sm shadow-sm"/>
                </div>
                <button onClick={handleAnalyze} disabled={isLoading || selectedTargets.length < 2} className="w-full px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-dark text-sm font-medium shadow-md flex items-center justify-center disabled:opacity-60">
                    {isLoading ? <Loader2 size={18} className="animate-spin mr-2"/> : <Search size={18} className="mr-2"/>}
                    Find Common Ground
                </button>
            </div>
        </div>
         {error && <p className="mt-2 text-xs text-danger-dark"><AlertTriangle size={12} className="inline mr-1"/>{error}</p>}
      </div>

       <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-surface p-3 rounded-xl shadow-lg border border-neutral-light">
          {results.length > 0 && (
            <div className="flex justify-between items-center mb-2">
                <h3 className="text-base font-semibold text-textPrimary">Results ({results.length})</h3>
                <button onClick={handleExportData} className="px-3 py-1.5 text-xs bg-secondary text-white rounded-lg hover:bg-secondary-dark flex items-center shadow-sm"><Download size={14} className="mr-1.5"/>Export</button>
            </div>
          )}
          {isLoading ? ( <div className="text-center p-5 text-textSecondary text-sm"><Loader2 className="animate-spin inline mr-2"/>Analyzing...</div> ) :
           results.length > 0 ? (
            <div className="overflow-x-auto max-h-[450px] scrollbar-thin">
              <table className="min-w-full divide-y divide-neutral-light text-xs">
                <thead className="bg-neutral-lightest sticky top-0"><tr>{tableHeaders.map(h => <th key={String(h.key)} onClick={() => requestSort(h.key)} className="group px-2 py-2 text-left font-semibold text-textPrimary uppercase tracking-wider cursor-pointer hover:bg-neutral-light"><div className="flex items-center">{h.icon && <span className="mr-1.5 text-neutral-DEFAULT">{h.icon}</span>}{h.label}{renderSortIcon(h.key)}</div></th>)}</tr></thead>
                <tbody className="bg-surface divide-y divide-neutral-light">{paginatedResults.map((res, i) => <tr key={`${res.lacCellId}-${i}`} className="hover:bg-neutral-lightest/50">
                    <td className="px-2 py-1.5 whitespace-nowrap">{res.lacCellId}</td><td className="px-2 py-1.5 truncate max-w-[150px]" title={res.address}>{res.address || 'N/A'}</td>
                    <td className="px-2 py-1.5 whitespace-nowrap">{formatDate(res.approximateTime.toISOString())}</td><td className="px-2 py-1.5 truncate max-w-[150px]" title={res.involvedMsisdns.join(', ')}>{res.involvedMsisdns.join(', ')}</td>
                </tr>)}</tbody>
              </table>
              {totalPages > 1 && (<div className="flex justify-between items-center mt-2 pt-2 border-t text-[10px]"><span className="text-textSecondary">Page {currentPage} of {totalPages}</span><div className="flex gap-1"><button onClick={()=>setCurrentPage(p=>Math.max(1,p-1))} disabled={currentPage===1} className="px-2 py-1 border rounded-md shadow-sm">Prev</button><button onClick={()=>setCurrentPage(p=>Math.min(totalPages,p+1))} disabled={currentPage===totalPages} className="px-2 py-1 border rounded-md shadow-sm">Next</button></div></div>)}
            </div>
          ) : <div className="text-center p-5 text-textSecondary text-sm"><Info size={20} className="mx-auto mb-2 text-neutral-DEFAULT"/>No results yet. Please select targets and run analysis.</div>}
        </div>
        <div className="h-[500px] bg-neutral-lightest rounded-xl shadow-lg border border-neutral-light overflow-hidden">
          <GoogleMapView center={{ lat: 23.8103, lng: 90.4125 }} zoom={7} markers={mapMarkers} />
        </div>
      </div>
    </div>
  );
};

export default CommonGroundAnalysisView;

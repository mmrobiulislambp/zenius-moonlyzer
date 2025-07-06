import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { Route, Search, User, CalendarDays, Clock, MapPin as MapPinIcon, Info, AlertTriangle, Loader2, Download, ListFilter, ChevronUp, ChevronDown, Eye, X, SmartphoneNfc, TowerControl as TowerControlIcon, FileText as FileTextIcon } from 'lucide-react';
import { useLACContext } from '../contexts/LACContext';
import { LACRecord } from '../types';
import { formatDate, parseDateTime, formatDateFromTimestamp, formatDurationFromSeconds } from '../utils/cdrUtils';
import { downloadCSV } from '../utils/downloadUtils';
import GoogleMapView from './GoogleMapView'; // Assuming GoogleMapView is in the same directory or correctly pathed
import { MapMarkerData, MapPathData } from '../types';

const ROWS_PER_PAGE = 10;
const MODAL_ROWS_PER_PAGE = 10;

// Unwired Labs API Key - a more secure approach would be a backend proxy or environment variables
const UNWIREDLABS_API_KEY = 'pk.0109ed396038127c16979e91be9a0832';


interface TowerVisit {
  sequence: number;
  lacCellId: string;
  arrivalTime: Date;
  departureTime: Date;
  durationMinutes: number;
  usageTypes: string[];
  recordCount: number;
  sourceFiles: string[];
  records: LACRecord[];
  mapMarker?: MapMarkerData; // For map visualization
  firstAddressAttempted?: string; // Store the address used for geocoding attempt
}

const LACTowerTravelPatternView: React.FC = () => {
  const { allLACRecords, getUniqueLACValues, isLoading: contextIsLoading, uploadedLACFiles } = useLACContext();

  const [selectedMsisdn, setSelectedMsisdn] = useState<string | null>(null);
  const [manualMsisdn, setManualMsisdn] = useState<string>('');
  const [msisdnInputType, setMsisdnInputType] = useState<'select' | 'manual'>('select');
  
  const [dateRange, setDateRange] = useState<{ start: string, end: string }>({ 
    start: new Date().toISOString().split('T')[0], 
    end: new Date().toISOString().split('T')[0] 
  });
  const [timeRange, setTimeRange] = useState<{ start: string, end: string }>({ start: '00:00', end: '23:59' });

  const [travelPath, setTravelPath] = useState<TowerVisit[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  
  const [isGeocodingPath, setIsGeocodingPath] = useState(false);
  const geocodeCacheRef = useRef<Map<string, google.maps.LatLngLiteral | null>>(new Map());


  const [currentPage, setCurrentPage] = useState(1);
  const [sortConfig, setSortConfig] = useState<{ key: keyof TowerVisit; direction: 'ascending' | 'descending' }>({ key: 'sequence', direction: 'ascending' });
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalRecords, setModalRecords] = useState<LACRecord[]>([]);
  const [modalTitle, setModalTitle] = useState('');
  const [modalCurrentPage, setModalCurrentPage] = useState(1);
  const [modalSortConfig, setModalSortConfig] = useState<{ key: keyof LACRecord; direction: 'ascending' | 'descending' }>({ key: 'DATE_TIME', direction: 'descending' });

  const uniqueMSISDNs = useMemo(() => getUniqueLACValues('MSISDN').filter(id => id && id.trim() !== ''), [getUniqueLACValues]);
  
  useEffect(() => {
    if (msisdnInputType === 'select') setManualMsisdn('');
    else setSelectedMsisdn(null);
  }, [msisdnInputType]);

  const geocodeAddress = useCallback(async (address: string): Promise<google.maps.LatLngLiteral | null> => {
    if (!address || address.trim() === '' || address.toLowerCase() === 'n/a') return null;
    if (geocodeCacheRef.current.has(address)) return geocodeCacheRef.current.get(address) || null;

    try {
      // Using Unwired Labs for geocoding as an example
      const response = await fetch(`https://us1.unwiredlabs.com/v2/search.php?token=${UNWIREDLABS_API_KEY}&q=${encodeURIComponent(address)}`);
      if (!response.ok) {
        console.error("Geocoding HTTP error:", response.status, response.statusText);
        geocodeCacheRef.current.set(address, null);
        return null;
      }
      const data = await response.json();
      if (data.status === "ok" && data.address && data.address.length > 0) {
        const location = { lat: parseFloat(data.address[0].lat), lng: parseFloat(data.address[0].lon) };
        if(isNaN(location.lat) || isNaN(location.lng)) {
            geocodeCacheRef.current.set(address, null);
            return null;
        }
        geocodeCacheRef.current.set(address, location);
        return location;
      }
      geocodeCacheRef.current.set(address, null);
      return null;
    } catch (error) {
      console.error("Geocoding fetch error:", error);
      geocodeCacheRef.current.set(address, null); // Don't cache network errors as they might be transient
      return null;
    }
  }, []);


  const handleTrackMovement = useCallback(async () => {
    setErrorMsg(null);
    setIsLoading(true);
    setIsGeocodingPath(false);
    setTravelPath([]);
    setCurrentPage(1);

    const targetMSISDN = msisdnInputType === 'select' ? selectedMsisdn : manualMsisdn.trim();
    if (!targetMSISDN) {
      setErrorMsg("MSISDN is required.");
      setIsLoading(false);
      return;
    }
    if (!dateRange.start || !dateRange.end) {
      setErrorMsg("Start Date and End Date are required.");
      setIsLoading(false);
      return;
    }

    try {
      const startFullDateTime = parseDateTime(`${dateRange.start}T${timeRange.start}:00`);
      const endFullDateTime = parseDateTime(`${dateRange.end}T${timeRange.end}:59`);

      if (!startFullDateTime || !endFullDateTime || startFullDateTime >= endFullDateTime) {
        setErrorMsg("Invalid date/time range.");
        setIsLoading(false);
        return;
      }

      const filteredRecords = allLACRecords
        .filter(r => r.MSISDN === targetMSISDN)
        .map(r => ({ ...r, parsedDate: parseDateTime(r.DATE_TIME) }))
        .filter(r => r.parsedDate && r.parsedDate >= startFullDateTime && r.parsedDate <= endFullDateTime && r.LAC && r.CELL_ID)
        .sort((a, b) => a.parsedDate!.getTime() - b.parsedDate!.getTime());

      if (filteredRecords.length === 0) {
        setErrorMsg("No records found for this MSISDN in the selected timeframe.");
        setIsLoading(false);
        return;
      }

      const path: TowerVisit[] = [];
      let sequenceCounter = 0;
      let currentVisitRecords: LACRecord[] = [];

      for (let i = 0; i < filteredRecords.length; i++) {
        const record = filteredRecords[i];
        currentVisitRecords.push(record);

        const isLastRecord = i === filteredRecords.length - 1;
        const nextRecord = isLastRecord ? null : filteredRecords[i + 1];
        const currentLacCell = `${record.LAC}-${record.CELL_ID}`;
        const nextLacCell = nextRecord ? `${nextRecord.LAC}-${nextRecord.CELL_ID}` : null;

        if (isLastRecord || currentLacCell !== nextLacCell) {
          sequenceCounter++;
          const firstRecordOfVisit = currentVisitRecords[0];
          const lastRecordOfVisit = currentVisitRecords[currentVisitRecords.length - 1];
          
          const arrivalTime = parseDateTime(firstRecordOfVisit.DATE_TIME)!;
          const departureTime = parseDateTime(lastRecordOfVisit.DATE_TIME)!;
          const durationMs = departureTime.getTime() - arrivalTime.getTime();
          
          path.push({
            sequence: sequenceCounter,
            lacCellId: currentLacCell,
            arrivalTime,
            departureTime,
            durationMinutes: Math.max(0, Math.round(durationMs / (1000 * 60))), // Ensure non-negative
            usageTypes: Array.from(new Set(currentVisitRecords.map(r => r.USAGE_TYPE || 'Unknown'))),
            recordCount: currentVisitRecords.length,
            sourceFiles: Array.from(new Set(currentVisitRecords.map(r => r.fileName))),
            records: [...currentVisitRecords],
            firstAddressAttempted: firstRecordOfVisit.ADDRESS || undefined,
          });
          currentVisitRecords = [];
        }
      }
      
      // Now geocode paths
      if(path.length > 0) {
          setIsGeocodingPath(true);
          const geocodedPath = await Promise.all(path.map(async (visit, index) => {
            let marker: MapMarkerData | undefined = undefined;
            if (visit.firstAddressAttempted) {
                const coords = await geocodeAddress(visit.firstAddressAttempted);
                if (coords) {
                    marker = {
                        id: `visit-${visit.sequence}`,
                        position: coords,
                        title: `${visit.sequence}. ${visit.lacCellId}`,
                        infoContent: `<b>Seq:</b> ${visit.sequence}<br/><b>LAC-Cell:</b> ${visit.lacCellId}<br/><b>Arrival:</b> ${formatDateFromTimestamp(visit.arrivalTime.getTime())}<br/><b>Departure:</b> ${formatDateFromTimestamp(visit.departureTime.getTime())}<br/><b>Duration:</b> ${formatDurationFromSeconds(visit.durationMinutes * 60)}`
                    };
                }
            }
            // Fallback if no address or geocoding fails - can assign arbitrary unique points later for visualization if needed
            // For now, only add marker if coords found
            return { ...visit, mapMarker: marker };
          }));
          setTravelPath(geocodedPath);
          setIsGeocodingPath(false);
      } else {
        setTravelPath(path);
      }


      if (path.length === 0) setErrorMsg("No valid tower visits found after processing.");
      
    } catch (e) {
      console.error("Tracking error:", e);
      setErrorMsg("An error occurred during movement tracking.");
    } finally {
      setIsLoading(false);
      setIsGeocodingPath(false);
    }
  }, [msisdnInputType, selectedMsisdn, manualMsisdn, dateRange, timeRange, allLACRecords, geocodeAddress]);

  const sortedPath = useMemo(() => {
    return [...travelPath].sort((a, b) => {
      const valA = a[sortConfig.key];
      const valB = b[sortConfig.key];
      let comparison = 0;
      if (valA instanceof Date && valB instanceof Date) {
        comparison = valA.getTime() - valB.getTime();
      } else if (typeof valA === 'number' && typeof valB === 'number') {
        comparison = valA - valB;
      } else if (Array.isArray(valA) && Array.isArray(valB)) { // For usageTypes and sourceFiles
        comparison = valA.length - valB.length;
      } else if (typeof valA === 'string' && typeof valB === 'string') {
        comparison = valA.localeCompare(valB);
      }
      return sortConfig.direction === 'ascending' ? comparison : -comparison;
    });
  }, [travelPath, sortConfig]);

  const paginatedPath = useMemo(() => {
    const startIndex = (currentPage - 1) * ROWS_PER_PAGE;
    return sortedPath.slice(startIndex, startIndex + ROWS_PER_PAGE);
  }, [sortedPath, currentPage]);
  const totalPages = Math.ceil(sortedPath.length / ROWS_PER_PAGE);

  const requestSort = (key: keyof TowerVisit) => {
    let direction: 'ascending' | 'descending' = 'ascending';
    if (sortConfig.key === key && sortConfig.direction === 'ascending') direction = 'descending';
    setSortConfig({ key, direction });
    setCurrentPage(1);
  };
  
  const renderSortIcon = (key: keyof TowerVisit) => {
    if (sortConfig.key !== key) return <ListFilter size={14} className="ml-1 opacity-30 group-hover:opacity-100 inline" />;
    return sortConfig.direction === 'ascending' ? <ChevronUp size={14} className="ml-1 text-primary inline" /> : <ChevronDown size={14} className="ml-1 text-primary inline" />;
  };
  
  const sortedModalRecords = useMemo(() => {
    return [...modalRecords].sort((a, b) => {
        const valA = a[modalSortConfig.key];
        const valB = b[modalSortConfig.key];
        if (modalSortConfig.key === 'DATE_TIME') {
          const timeA = valA ? parseDateTime(String(valA))?.getTime() : 0;
          const timeB = valB ? parseDateTime(String(valB))?.getTime() : 0;
          return modalSortConfig.direction === 'ascending' ? (timeA || 0) - (timeB || 0) : (timeB || 0) - (timeA || 0);
        }
        if (modalSortConfig.key === 'CALL_DURATION') {
            const durationA = parseInt(String(valA), 10) || 0;
            const durationB = parseInt(String(valB), 10) || 0;
            return modalSortConfig.direction === 'ascending' ? durationA - durationB : durationB - durationA;
        }
        if (typeof valA === 'string' && typeof valB === 'string') return modalSortConfig.direction === 'ascending' ? valA.localeCompare(valB) : valB.localeCompare(valA);
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
    if (modalSortConfig.key === key && modalSortConfig.direction === 'descending') direction = 'ascending';
    setModalSortConfig({ key, direction });
    setModalCurrentPage(1);
  };

  const renderModalSortIcon = (key: keyof LACRecord) => {
    if (modalSortConfig.key !== key) return <ListFilter size={12} className="ml-1 opacity-30 group-hover:opacity-100 inline" />;
    return modalSortConfig.direction === 'ascending' ? <ChevronUp size={12} className="ml-1 text-primary inline" /> : <ChevronDown size={12} className="ml-1 text-primary inline" />;
  };

  const handleViewRecords = (towerVisit: TowerVisit) => {
    setModalRecords(towerVisit.records);
    setModalTitle(`Records for ${towerVisit.lacCellId} (Visit #${towerVisit.sequence})`);
    setIsModalOpen(true);
    setModalCurrentPage(1);
  };

  const handleExportPathData = () => {
    if (sortedPath.length === 0) { alert("No path data to export."); return; }
    const headers = ["Seq.", "LAC-CELL_ID", "Arrival Time", "Departure Time", "Duration (min)", "Usage Types", "# Records", "Source File(s)"];
    const data = sortedPath.map(visit => [
      String(visit.sequence), visit.lacCellId, formatDate(visit.arrivalTime.toISOString()), formatDate(visit.departureTime.toISOString()),
      String(visit.durationMinutes), visit.usageTypes.join('; '), String(visit.recordCount), visit.sourceFiles.join('; ')
    ]);
    downloadCSV(`tower_travel_path_${msisdnInputType === 'select' ? selectedMsisdn : manualMsisdn}.csv`, data, headers);
  };
  
  const handleExportModalRecords = () => {
    const headers = Object.keys(modalRecords[0] || {}).filter(k => k !== 'id' && k !== 'sourceFileId' && k !== 'rowIndex' && k !== 'parsedDate');
    const data = modalRecords.map(rec => headers.map(h => String(rec[h as keyof LACRecord] ?? 'N/A')));
    downloadCSV(`travel_path_visit_records_${modalTitle.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.csv`, data, headers);
  };
  
  const tableHeaders: { key: keyof TowerVisit; label: string; icon?: React.ReactNode }[] = [
    { key: 'sequence', label: 'Seq.', icon: <ListFilter size={14}/> },
    { key: 'lacCellId', label: 'LAC-CELL_ID', icon: <TowerControlIcon size={14}/> },
    { key: 'arrivalTime', label: 'Arrival', icon: <Clock size={14}/> },
    { key: 'departureTime', label: 'Departure', icon: <Clock size={14}/> },
    { key: 'durationMinutes', label: 'Duration (min)', icon: <Clock size={14}/> },
    { key: 'usageTypes', label: 'Usage Types', icon: <ListFilter size={14}/> },
    { key: 'recordCount', label: '# Records', icon: <ListFilter size={14}/> },
    { key: 'sourceFiles', label: 'Source File(s)', icon: <FileTextIcon size={14}/> },
  ];
  
  const modalTableHeaders: { key: keyof LACRecord | string; label: string; icon?: React.ReactNode }[] = [
    { key: 'DATE_TIME', label: 'Timestamp', icon: <Clock size={12}/> },
    { key: 'USAGE_TYPE', label: 'Usage Type', icon: <ListFilter size={12}/> },
    { key: 'OTHER_PARTY_NUMBER', label: 'Other Party', icon: <User size={12}/> },
    { key: 'CALL_DURATION', label: 'Duration (s)', icon: <Clock size={12}/> },
    { key: 'IMEI', label: 'IMEI', icon: <SmartphoneNfc size={12}/> },
    { key: 'fileName', label: 'Source File', icon: <FileTextIcon size={12}/> },
  ];
  
  const mapDataForPath = useMemo((): { markers: MapMarkerData[], path: MapPathData | null } => {
    const markers: MapMarkerData[] = [];
    const pathCoordinates: google.maps.LatLngLiteral[] = [];

    sortedPath.forEach(visit => {
        if (visit.mapMarker) { // Only use visits that have successfully geocoded mapMarker
            markers.push(visit.mapMarker);
            pathCoordinates.push(visit.mapMarker.position);
        }
    });
    
    // Color start and end markers if path exists
    if (markers.length > 0) {
        markers[0].icon = { ...(markers[0].icon as google.maps.Symbol), fillColor: '#16A34A', scale: 8 }; // Green for start
        markers[0].title = `START: ${markers[0].title}`;
        if (markers.length > 1) {
            markers[markers.length - 1].icon = { ...(markers[markers.length - 1].icon as google.maps.Symbol), fillColor: '#EF4444', scale: 8 }; // Red for end
             markers[markers.length - 1].title = `END: ${markers[markers.length - 1].title}`;
        }
    }

    return {
        markers,
        path: pathCoordinates.length > 1 ? { id: 'travelPath', coordinates: pathCoordinates, strokeColor: '#3b82f6', strokeWeight: 3, strokeOpacity: 0.8 } : null
    };
  }, [sortedPath]);


  if (contextIsLoading && allLACRecords.length === 0) return <div className="flex justify-center items-center h-64"><Loader2 className="h-12 w-12 animate-spin text-primary" /><p className="ml-3 text-textSecondary">Loading LAC data...</p></div>;
  if (uploadedLACFiles.length === 0 && !contextIsLoading) return <div className="p-6 bg-info-lighter border border-info-light rounded-lg text-center text-info-dark flex flex-col items-center justify-center min-h-[150px] shadow-md"><Info size={28} className="mb-2" /><p className="font-medium">Please upload LAC/Cell data files.</p></div>;

  return (
    <div className="space-y-6">
      {/* Input Section */}
      <div className="p-4 sm:p-5 bg-surface border border-neutral-light rounded-xl shadow-xl">
        <div className="flex items-center text-xl sm:text-2xl font-semibold text-textPrimary mb-1">
          <Route size={24} className="mr-2.5 text-primary" /> Tower Travel Pattern Tracker
        </div>
        <p className="text-sm text-textSecondary">Track the movement of an MSISDN across towers over a specified period.</p>
        
        <div className="mt-4 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-end">
                <div>
                    <label className="block text-xs font-medium text-textSecondary mb-1">MSISDN Input Type:</label>
                    <select value={msisdnInputType} onChange={e => setMsisdnInputType(e.target.value as 'select' | 'manual')} className="w-full p-2.5 border border-neutral-light rounded-lg focus:ring-2 focus:ring-primary-light text-sm shadow-sm">
                        <option value="select">Select from Data</option>
                        <option value="manual">Enter Manually</option>
                    </select>
                </div>
                {msisdnInputType === 'select' ? (
                    <div>
                        <label htmlFor="msisdnSelect" className="block text-xs font-medium text-textSecondary mb-1">Select MSISDN:</label>
                        <select id="msisdnSelect" value={selectedMsisdn || ''} onChange={e => setSelectedMsisdn(e.target.value || null)} disabled={uniqueMSISDNs.length === 0 || isLoading} className="w-full p-2.5 border border-neutral-light rounded-lg focus:ring-2 focus:ring-primary-light text-sm shadow-sm">
                            <option value="">-- Select MSISDN --</option>
                            {uniqueMSISDNs.map(msisdn => <option key={msisdn} value={msisdn}>{msisdn}</option>)}
                        </select>
                    </div>
                ) : (
                    <div>
                        <label htmlFor="manualMsisdn" className="block text-xs font-medium text-textSecondary mb-1">Enter MSISDN:</label>
                        <input type="text" id="manualMsisdn" value={manualMsisdn} onChange={e => setManualMsisdn(e.target.value)} placeholder="Enter MSISDN" className="w-full p-2.5 border border-neutral-light rounded-lg focus:ring-2 focus:ring-primary-light text-sm shadow-sm"/>
                    </div>
                )}
            </div>
             <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 items-end">
                <div>
                    <label htmlFor="startDatePath" className="block text-xs font-medium text-textSecondary mb-1">Start Date:</label>
                    <input type="date" id="startDatePath" value={dateRange.start} onChange={e => setDateRange(prev => ({ ...prev, start: e.target.value }))} className="w-full p-2.5 border border-neutral-light rounded-lg focus:ring-2 focus:ring-primary-light text-sm shadow-sm accent-primary"/>
                </div>
                <div>
                    <label htmlFor="startTimePath" className="block text-xs font-medium text-textSecondary mb-1">Start Time (HH:MM):</label>
                    <input type="time" id="startTimePath" value={timeRange.start} onChange={e => setTimeRange(prev => ({ ...prev, start: e.target.value }))} className="w-full p-2.5 border border-neutral-light rounded-lg focus:ring-2 focus:ring-primary-light text-sm shadow-sm accent-primary"/>
                </div>
                <div>
                    <label htmlFor="endDatePath" className="block text-xs font-medium text-textSecondary mb-1">End Date:</label>
                    <input type="date" id="endDatePath" value={dateRange.end} onChange={e => setDateRange(prev => ({ ...prev, end: e.target.value }))} className="w-full p-2.5 border border-neutral-light rounded-lg focus:ring-2 focus:ring-primary-light text-sm shadow-sm accent-primary"/>
                </div>
                <div>
                    <label htmlFor="endTimePath" className="block text-xs font-medium text-textSecondary mb-1">End Time (HH:MM):</label>
                    <input type="time" id="endTimePath" value={timeRange.end} onChange={e => setTimeRange(prev => ({ ...prev, end: e.target.value }))} className="w-full p-2.5 border border-neutral-light rounded-lg focus:ring-2 focus:ring-primary-light text-sm shadow-sm accent-primary"/>
                </div>
            </div>
            <button onClick={handleTrackMovement} disabled={isLoading || contextIsLoading || (msisdnInputType === 'select' ? !selectedMsisdn : !manualMsisdn.trim())} className="w-full sm:w-auto px-6 py-2.5 bg-primary text-white rounded-lg hover:bg-primary-dark text-sm font-medium shadow-md hover:shadow-lg transition-all disabled:opacity-70 flex items-center justify-center">
                {isLoading ? <Loader2 className="h-5 w-5 animate-spin mr-2"/> : <Search size={18} className="mr-2"/>}
                Track Movement
            </button>
        </div>
      </div>

      {/* Loading/Error/No Data States */}
      {isLoading && travelPath.length === 0 && <div className="flex justify-center items-center h-40"><Loader2 className="h-10 w-10 animate-spin text-primary" /><p className="ml-3 text-textSecondary">Tracking movement...</p></div>}
      {isGeocodingPath && <div className="flex justify-center items-center text-sm text-textSecondary py-2"><Loader2 className="h-4 w-4 animate-spin mr-2"/>Geocoding tower addresses for map...</div>}
      {errorMsg && !isLoading && <div className="p-3 bg-warning-lighter border border-warning-light rounded-lg text-sm text-warning-darker flex items-center shadow-md"><AlertTriangle size={18} className="mr-2"/> {errorMsg}</div>}
      
      {/* Results: Map and Table */}
      {travelPath.length > 0 && !isLoading && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <div className="h-[400px] sm:h-[500px] bg-neutral-lightest rounded-xl shadow-lg border border-neutral-light overflow-hidden">
              <GoogleMapView
                center={mapDataForPath.markers.length > 0 ? mapDataForPath.markers[0].position : { lat: 23.8103, lng: 90.4125 }} // Default to Dhaka or first marker
                zoom={mapDataForPath.markers.length > 0 ? 12 : 6}
                markers={mapDataForPath.markers}
                paths={mapDataForPath.path ? [mapDataForPath.path] : []}
              />
            </div>
          </div>
          <div className="lg:col-span-1 bg-surface p-3 sm:p-4 rounded-xl shadow-xl border border-neutral-light">
            <div className="flex justify-between items-center mb-3">
              <h3 className="text-base font-semibold text-textPrimary">Tower Visit Sequence ({sortedPath.length})</h3>
              <button onClick={handleExportPathData} className="px-3 py-1.5 text-xs bg-secondary text-white rounded-lg hover:bg-secondary-dark flex items-center shadow-sm"><Download size={14} className="mr-1.5"/>Export Path</button>
            </div>
            <div className="overflow-x-auto max-h-[450px] scrollbar-thin">
              <table className="min-w-full divide-y divide-neutral-light">
                <thead className="bg-neutral-lightest sticky top-0">
                  <tr>
                    {tableHeaders.map(h => <th key={h.key as string} onClick={() => requestSort(h.key)} className="group px-2 py-2 text-left text-[10px] font-semibold text-textPrimary uppercase tracking-wider cursor-pointer hover:bg-neutral-lighter"><div className="flex items-center">{h.icon && <span className="mr-1 text-neutral-DEFAULT group-hover:text-primary">{h.icon}</span>}{h.label}{renderSortIcon(h.key)}</div></th>)}
                    <th className="px-2 py-2 text-left text-[10px] font-semibold text-textPrimary uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody className="bg-surface divide-y divide-neutral-light">
                  {paginatedPath.map(visit => (
                    <tr key={visit.sequence} className="hover:bg-neutral-lightest/50">
                      <td className="px-2 py-1.5 whitespace-nowrap text-[11px] text-textSecondary text-center">{visit.sequence}</td>
                      <td className="px-2 py-1.5 whitespace-nowrap text-[11px] text-textPrimary font-medium">{visit.lacCellId}</td>
                      <td className="px-2 py-1.5 whitespace-nowrap text-[11px] text-textSecondary">{formatDate(visit.arrivalTime.toISOString())}</td>
                      <td className="px-2 py-1.5 whitespace-nowrap text-[11px] text-textSecondary">{formatDate(visit.departureTime.toISOString())}</td>
                      <td className="px-2 py-1.5 whitespace-nowrap text-[11px] text-textSecondary text-center">{visit.durationMinutes}</td>
                      <td className="px-2 py-1.5 text-[11px] text-textSecondary truncate max-w-[100px]" title={visit.usageTypes.join(', ')}>{visit.usageTypes.join(', ')}</td>
                      <td className="px-2 py-1.5 whitespace-nowrap text-[11px] text-textSecondary text-center">{visit.recordCount}</td>
                      <td className="px-2 py-1.5 text-[11px] text-textSecondary truncate max-w-[100px]" title={visit.sourceFiles.join(', ')}>{visit.sourceFiles.join(', ')}</td>
                      <td className="px-2 py-1.5 whitespace-nowrap text-[11px]"><button onClick={() => handleViewRecords(visit)} className="text-primary hover:underline flex items-center"><Eye size={12} className="mr-0.5"/>View</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {totalPages > 1 && (
              <div className="flex flex-col sm:flex-row justify-between items-center mt-2 pt-2 border-t border-neutral-light text-xs">
                <span className="text-textSecondary mb-1 sm:mb-0">Page {currentPage} of {totalPages}</span>
                <div className="flex gap-1.5">
                  <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1} className="px-2 py-1 font-medium bg-surface border rounded-md shadow-sm hover:bg-neutral-lighter disabled:opacity-50">Prev</button>
                  <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages} className="px-2 py-1 font-medium bg-surface border rounded-md shadow-sm hover:bg-neutral-lighter disabled:opacity-50">Next</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
      
      {/* Modal for Detailed Records */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-neutral-darkest/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setIsModalOpen(false)}>
          <div className="bg-surface rounded-xl shadow-2xl w-full max-w-3xl max-h-[90vh] p-5 sm:p-6 border border-neutral-light flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-3 pb-2 border-b border-neutral-light">
              <h3 className="text-md font-semibold text-textPrimary truncate" title={modalTitle}>{modalTitle}</h3>
              <button onClick={() => setIsModalOpen(false)} className="text-neutral-DEFAULT hover:text-danger-dark p-1 rounded-full hover:bg-danger-lighter/50"><X size={20}/></button>
            </div>
            <div className="flex-grow overflow-y-auto scrollbar-thin pr-1">
                <div className="flex justify-end mb-2">
                     <button onClick={handleExportModalRecords} className="px-2.5 py-1 text-[10px] bg-info-lighter/60 text-info-dark rounded-md hover:bg-info-lighter/80 font-medium flex items-center shadow-sm"><Download size={12} className="mr-1"/>Export These Records</button>
                </div>
              <table className="min-w-full divide-y divide-neutral-light text-[11px]">
                <thead className="bg-neutral-lightest sticky top-0 z-10">
                    <tr>{modalTableHeaders.map(h => <th key={h.key as string} onClick={() => requestModalSort(h.key as keyof LACRecord)} className="group px-2 py-1.5 text-left font-semibold text-textPrimary uppercase tracking-wider cursor-pointer hover:bg-neutral-light"><div className="flex items-center">{h.icon && <span className="mr-1 text-neutral-DEFAULT group-hover:text-primary">{h.icon}</span>}{h.label}{renderModalSortIcon(h.key as keyof LACRecord)}</div></th>)}</tr>
                </thead>
                <tbody className="bg-surface divide-y divide-neutral-light">
                  {paginatedModalRecords.map((rec, idx) => (
                    <tr key={rec.id + idx} className="hover:bg-neutral-lightest/50">
                       {modalTableHeaders.map(header => {
                        let displayVal = String(rec[header.key as keyof LACRecord] ?? 'N/A');
                        if (header.key === 'DATE_TIME' && rec.DATE_TIME) displayVal = formatDate(rec.DATE_TIME);
                        return <td key={String(header.key)} className="px-2 py-1 whitespace-nowrap text-textSecondary truncate max-w-[120px]" title={displayVal}>{displayVal}</td>
                    })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {totalModalPages > 1 && (
              <div className="flex flex-col sm:flex-row justify-between items-center mt-2 pt-2 border-t border-neutral-light text-[10px]">
                <span className="text-textSecondary mb-1 sm:mb-0">Page {modalCurrentPage} of {totalModalPages}</span>
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

export default LACTowerTravelPatternView;

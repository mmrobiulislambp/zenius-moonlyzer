import React, { useState, useMemo, useCallback } from 'react';
import { LocateFixed, User, Clock, Download, Filter as FilterIcon, Info, CalendarDays, ChevronDown, ChevronUp, MapPin as MapPinIcon, PhoneForwarded, HelpCircle } from 'lucide-react';
import { useCDRContext } from '../contexts/CDRContext';
import { LocationEvent } from '../types';
import { formatDate, parseDateTime } from '../utils/cdrUtils';
import { downloadCSV } from '../utils/downloadUtils';

const ROWS_PER_PAGE = 15;

type TimeOfDay = 'all' | 'morning' | 'afternoon' | 'evening' | 'night' | 'custom';
type SortKey = keyof LocationEvent | 'contactedParty';

const LocationTimelineView: React.FC = () => {
  const { locationTimelineData, isLoading: contextIsLoading } = useCDRContext();
  
  const [selectedAParty, setSelectedAParty] = useState<string>('');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [timeOfDay, setTimeOfDay] = useState<TimeOfDay>('all');
  const [customTimeRange, setCustomTimeRange] = useState({ start: '00:00', end: '23:59' });
  
  const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: 'ascending' | 'descending' }>({ key: 'timestamp', direction: 'ascending' });
  const [currentPage, setCurrentPage] = useState(1);

  const uniqueAParties = useMemo(() => {
    const parties = new Set<string>();
    locationTimelineData.forEach(event => parties.add(event.aparty));
    return Array.from(parties).sort();
  }, [locationTimelineData]);

  const filteredEvents = useMemo(() => {
    if (!selectedAParty) return [];

    return locationTimelineData.filter(event => {
      if (event.aparty !== selectedAParty) return false;

      const eventDate = event.timestamp;
      
      if (startDate) {
        const filterStartDate = parseDateTime(startDate);
        if (filterStartDate && eventDate < filterStartDate) return false;
      }
      if (endDate) {
        const filterEndDate = parseDateTime(endDate + 'T23:59:59');
        if (filterEndDate && eventDate > filterEndDate) return false;
      }

      if (timeOfDay !== 'all') {
        const eventHour = eventDate.getHours();
        if (timeOfDay === 'morning' && (eventHour < 6 || eventHour >= 12)) return false;
        if (timeOfDay === 'afternoon' && (eventHour < 12 || eventHour >= 18)) return false;
        if (timeOfDay === 'evening' && (eventHour < 18 || eventHour >= 22)) return false;
        if (timeOfDay === 'night' && !(eventHour >= 22 || eventHour < 6)) return false;
        if (timeOfDay === 'custom') {
            const [startH, startM] = customTimeRange.start.split(':').map(Number);
            const [endH, endM] = customTimeRange.end.split(':').map(Number);
            const eventMinutes = eventHour * 60 + eventDate.getMinutes();
            const startTotalMinutes = startH * 60 + startM;
            const endTotalMinutes = endH * 60 + endM;
            if (startTotalMinutes <= endTotalMinutes) {
                if (eventMinutes < startTotalMinutes || eventMinutes > endTotalMinutes) return false;
            } else { // Overnight range
                if (eventMinutes > endTotalMinutes && eventMinutes < startTotalMinutes) return false;
            }
        }
      }
      
      return true;
    });
  }, [locationTimelineData, selectedAParty, startDate, endDate, timeOfDay, customTimeRange]);

  const sortedEvents = useMemo(() => {
    return [...filteredEvents].sort((a, b) => {
      const key = sortConfig.key;
      let valA: any = a[key as keyof LocationEvent];
      let valB: any = b[key as keyof LocationEvent];
      
      if(key === 'contactedParty') {
          valA = a.bparty;
          valB = b.bparty;
      }

      if (key === 'timestamp') {
        valA = a.timestamp.getTime();
        valB = b.timestamp.getTime();
      }

      if (typeof valA === 'string' && typeof valB === 'string') {
        return sortConfig.direction === 'ascending' ? valA.localeCompare(valB) : valB.localeCompare(valA);
      }
      if (typeof valA === 'number' && typeof valB === 'number') {
        return sortConfig.direction === 'ascending' ? valA - valB : valB - valA;
      }
      return 0;
    });
  }, [filteredEvents, sortConfig]);

  const paginatedEvents = useMemo(() => {
    const startIndex = (currentPage - 1) * ROWS_PER_PAGE;
    return sortedEvents.slice(startIndex, startIndex + ROWS_PER_PAGE);
  }, [sortedEvents, currentPage]);

  const totalPages = Math.ceil(sortedEvents.length / ROWS_PER_PAGE);

  const requestSort = (key: SortKey) => {
    let direction: 'ascending' | 'descending' = 'ascending';
    if (sortConfig.key === key && sortConfig.direction === 'ascending') {
      direction = 'descending';
    }
    setSortConfig({ key, direction });
    setCurrentPage(1);
  };

  const renderSortIcon = (key: SortKey) => {
    if (sortConfig.key !== key) return <ChevronDown size={14} className="ml-1 text-neutral-DEFAULT opacity-30 group-hover:opacity-100" />;
    return sortConfig.direction === 'ascending' ? <ChevronUp size={14} className="ml-1 text-primary" /> : <ChevronDown size={14} className="ml-1 text-primary" />;
  };

  const handleExport = useCallback(() => {
    if (sortedEvents.length === 0) {
      alert("No data to export.");
      return;
    }
    const headers = ["TIMESTAMP", "APARTY", "CONTACTED (BPARTY)", "USAGE TYPE", "LOCATION (LAC-CID)", "ADDRESS"];
    const data = sortedEvents.map(event => [
      formatDate(event.timestamp.toISOString()),
      event.aparty,
      event.bparty || "N/A",
      event.usageType || "N/A",
      event.locationId,
      event.address || "N/A"
    ]);
    downloadCSV(`location_timeline_${selectedAParty}.csv`, data, headers);
  }, [sortedEvents, selectedAParty]);

  const tableHeaders: { label: string; key: SortKey; icon: React.ReactNode; className?: string }[] = [
    { label: "TIMESTAMP", key: "timestamp", icon: <Clock size={15}/> },
    { label: "APARTY", key: "aparty", icon: <User size={15}/> },
    { label: "CONTACTED (BPARTY)", key: "contactedParty", icon: <PhoneForwarded size={15}/> },
    { label: "USAGE TYPE", key: "usageType", icon: <HelpCircle size={15}/> },
    { label: "LOCATION (LAC-CID)", key: "locationId", icon: <MapPinIcon size={15}/> },
    { label: "ADDRESS", key: "address", icon: <MapPinIcon size={15}/>, className: "min-w-[300px]" },
  ];

  return (
    <div className="space-y-4">
      <div className="p-4 bg-surface border border-neutral-light rounded-xl shadow-md">
        <div className="flex justify-between items-center mb-2">
          <h2 className="text-xl font-semibold text-textPrimary flex items-center">
            <LocateFixed size={22} className="mr-2 text-primary" /> Location Timeline Analysis
          </h2>
          {paginatedEvents.length > 0 && <button onClick={handleExport} className="px-3 py-2 text-sm bg-secondary text-white rounded-lg hover:bg-secondary-dark flex items-center shadow-sm"><Download size={16} className="mr-1.5"/>Export Table Data</button>}
        </div>
        <p className="text-sm text-textSecondary">Track location events. Coordinates are used if present in the data.</p>
      </div>

      <div className="p-4 bg-surface border border-neutral-light rounded-xl shadow-md space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <label htmlFor="apartyFilter" className="block text-xs font-medium text-textSecondary mb-1">Filter by AParty:</label>
            <select id="apartyFilter" value={selectedAParty} onChange={e => setSelectedAParty(e.target.value)} className="w-full p-2 border border-neutral-light rounded-md text-sm shadow-sm">
              <option value="">-- Select AParty --</option>
              {uniqueAParties.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="startDate" className="block text-xs font-medium text-textSecondary mb-1">Start Date:</label>
            <input type="date" id="startDate" value={startDate} onChange={e => setStartDate(e.target.value)} className="w-full p-2 border border-neutral-light rounded-md text-sm shadow-sm" placeholder="mm/dd/yyyy"/>
          </div>
          <div>
            <label htmlFor="endDate" className="block text-xs font-medium text-textSecondary mb-1">End Date:</label>
            <input type="date" id="endDate" value={endDate} onChange={e => setEndDate(e.target.value)} className="w-full p-2 border border-neutral-light rounded-md text-sm shadow-sm" placeholder="mm/dd/yyyy"/>
          </div>
          <div>
            <label htmlFor="timeOfDay" className="block text-xs font-medium text-textSecondary mb-1">Time of Day:</label>
            <select id="timeOfDay" value={timeOfDay} onChange={(e) => setTimeOfDay(e.target.value as TimeOfDay)} className="w-full p-2 border border-neutral-light rounded-md text-sm shadow-sm">
              <option value="all">All Day</option>
              <option value="morning">Morning (6 AM - 12 PM)</option>
              <option value="afternoon">Afternoon (12 PM - 6 PM)</option>
              <option value="evening">Evening (6 PM - 10 PM)</option>
              <option value="night">Night (10 PM - 6 AM)</option>
              <option value="custom">Custom Range</option>
            </select>
          </div>
        </div>
        {timeOfDay === 'custom' && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
            <div className="md:col-start-3">
              <label htmlFor="customStartTime" className="block text-xs font-medium text-textSecondary mb-1">Custom Start Time:</label>
              <input type="time" id="customStartTime" value={customTimeRange.start} onChange={e => setCustomTimeRange(prev => ({...prev, start: e.target.value}))} className="w-full p-2 border border-neutral-light rounded-md text-sm shadow-sm"/>
            </div>
            <div>
              <label htmlFor="customEndTime" className="block text-xs font-medium text-textSecondary mb-1">Custom End Time:</label>
              <input type="time" id="customEndTime" value={customTimeRange.end} onChange={e => setCustomTimeRange(prev => ({...prev, end: e.target.value}))} className="w-full p-2 border border-neutral-light rounded-md text-sm shadow-sm"/>
            </div>
          </div>
        )}
      </div>
      
      {selectedAParty ? (
        <div className="overflow-x-auto bg-surface shadow-md rounded-xl border border-neutral-light">
          <table className="min-w-full divide-y divide-neutral-light">
            <thead className="bg-neutral-lightest">
              <tr>
                {tableHeaders.map(header => (
                  <th key={header.key} onClick={() => requestSort(header.key)} className={`group px-3 py-3 text-left text-xs font-semibold text-textPrimary uppercase tracking-wider cursor-pointer hover:bg-neutral-light/70 transition-colors whitespace-nowrap ${header.className || ''}`}>
                    <div className="flex items-center">{header.icon}<span className="ml-1.5">{header.label}</span> {renderSortIcon(header.key)}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="bg-surface divide-y divide-neutral-light">
              {paginatedEvents.length > 0 ? (
                paginatedEvents.map((event, index) => (
                  <tr key={`${event.id}-${index}`} className="hover:bg-neutral-lightest/50">
                    <td className="px-3 py-2 whitespace-nowrap text-xs text-textSecondary">{formatDate(event.timestamp.toISOString())}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-xs text-textPrimary font-medium">{event.aparty}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-xs text-textSecondary">{event.bparty || 'N/A'}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-xs text-textSecondary">{event.usageType || 'N/A'}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-xs text-textSecondary">{event.locationId}</td>
                    <td className="px-3 py-2 text-xs text-textSecondary max-w-sm truncate" title={event.address}>{event.address || 'N/A'}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={tableHeaders.length} className="text-center py-5 text-sm text-textSecondary">No location events found for the selected criteria.</td>
                </tr>
              )}
            </tbody>
          </table>
          {totalPages > 1 && (
            <div className="flex justify-between items-center p-3 border-t border-neutral-light">
              <span className="text-sm text-textSecondary">Page {currentPage} of {totalPages} (Total: {sortedEvents.length} records)</span>
              <div>
                <button onClick={() => setCurrentPage(p => Math.max(1, p-1))} disabled={currentPage === 1} className="px-3 py-1 text-sm border rounded-md shadow-sm mr-2 disabled:opacity-50">Previous</button>
                <button onClick={() => setCurrentPage(p => Math.min(totalPages, p+1))} disabled={currentPage === totalPages} className="px-3 py-1 text-sm border rounded-md shadow-sm disabled:opacity-50">Next</button>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="p-6 bg-info-lighter border border-info-light rounded-lg text-center text-info-dark flex flex-col items-center justify-center min-h-[150px] shadow-md">
          <Info size={28} className="mb-2" />
          <p className="font-medium">Please select an AParty to view their location timeline.</p>
        </div>
      )}
    </div>
  );
};

export default LocationTimelineView;


import React, { useState, useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { Smartphone, Users2, Send, Activity, Clock, ChevronDown, ChevronUp, Info, ListFilter, TrendingUp, Download, CalendarDays, Repeat } from 'lucide-react'; // Added CalendarDays, Repeat
import { useCDRContext } from '../contexts/CDRContext';
import { DeviceAnalyticsData, AssociatedSimInfo, ContactedPartyByDevice, HourlyActivity, SimChangeEvent } from '../types';
import { formatDate } from '../utils/cdrUtils';
import { downloadCSV } from '../utils/downloadUtils'; 

const ROWS_PER_PAGE_IMEIS = 10;
const ROWS_PER_PAGE_USAGE_DATES = 10; 
const ROWS_PER_PAGE_SIM_CHANGES = 5; // For SIM Change History pagination
const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6']; // Theme colors

const DeviceAnalysisView: React.FC = () => {
  const { deviceAnalyticsData, isLoading, error, uploadedFiles, filesToAnalyze, activeFileTabId } = useCDRContext();
  const [selectedImei, setSelectedImei] = useState<DeviceAnalyticsData | null>(null);
  const [sortConfig, setSortConfig] = useState<{ key: keyof DeviceAnalyticsData | 'simCount' | 'contactCount'; direction: 'ascending' | 'descending' }>({ key: 'recordCount', direction: 'descending' });
  const [currentPage, setCurrentPage] = useState(1);
  const [usageDatesCurrentPage, setUsageDatesCurrentPage] = useState(1);
  const [simChangesCurrentPage, setSimChangesCurrentPage] = useState(1);


  const sortedImeis = useMemo(() => {
    let sortableItems = [...deviceAnalyticsData];
    if (sortConfig.key) {
      sortableItems.sort((a, b) => {
        let valA, valB;
        if (sortConfig.key === 'simCount') {
          valA = a.associatedSims.length;
          valB = b.associatedSims.length;
        } else if (sortConfig.key === 'contactCount') {
          valA = a.contactedParties.length;
          valB = b.contactedParties.length;
        } else {
          valA = a[sortConfig.key as keyof DeviceAnalyticsData];
          valB = b[sortConfig.key as keyof DeviceAnalyticsData];
        }
        
        if (typeof valA === 'object' && valA instanceof Date && typeof valB === 'object' && valB instanceof Date) {
            valA = valA.getTime();
            valB = valB.getTime();
        } else if (typeof valA === 'string' && typeof valB === 'string') {
          valA = valA.toLowerCase();
          valB = valB.toLowerCase();
        }
        
        if (valA === undefined || valA === null) valA = sortConfig.direction === 'ascending' ? Infinity : -Infinity;
        if (valB === undefined || valB === null) valB = sortConfig.direction === 'ascending' ? Infinity : -Infinity;

        if (valA < valB) return sortConfig.direction === 'ascending' ? -1 : 1;
        if (valA > valB) return sortConfig.direction === 'ascending' ? 1 : -1;
        return 0;
      });
    }
    return sortableItems;
  }, [deviceAnalyticsData, sortConfig]);
  
  const paginatedImeis = useMemo(() => {
    const startIndex = (currentPage - 1) * ROWS_PER_PAGE_IMEIS;
    return sortedImeis.slice(startIndex, startIndex + ROWS_PER_PAGE_IMEIS);
  }, [sortedImeis, currentPage]);

  const totalPages = Math.ceil(sortedImeis.length / ROWS_PER_PAGE_IMEIS);

  const paginatedUsageDates = useMemo(() => {
    if (!selectedImei) return [];
    const startIndex = (usageDatesCurrentPage - 1) * ROWS_PER_PAGE_USAGE_DATES;
    const sortedDates = [...selectedImei.usageDates].sort((a, b) => b.getTime() - a.getTime());
    return sortedDates.slice(startIndex, startIndex + ROWS_PER_PAGE_USAGE_DATES);
  }, [selectedImei, usageDatesCurrentPage]);

  const totalUsageDatePages = useMemo(() => {
    if (!selectedImei) return 0;
    return Math.ceil(selectedImei.usageDates.length / ROWS_PER_PAGE_USAGE_DATES);
  }, [selectedImei]);

  const paginatedSimChangeHistory = useMemo(() => {
    if (!selectedImei) return [];
    const startIndex = (simChangesCurrentPage - 1) * ROWS_PER_PAGE_SIM_CHANGES;
    // Sort by timestamp, most recent change first
    const sortedChanges = [...selectedImei.simChangeHistory].sort((a,b) => b.timestamp.getTime() - a.timestamp.getTime());
    return sortedChanges.slice(startIndex, startIndex + ROWS_PER_PAGE_SIM_CHANGES);
  }, [selectedImei, simChangesCurrentPage]);

  const totalSimChangePages = useMemo(() => {
    if(!selectedImei) return 0;
    return Math.ceil(selectedImei.simChangeHistory.length / ROWS_PER_PAGE_SIM_CHANGES);
  }, [selectedImei]);


  const handleImeiRowClick = (device: DeviceAnalyticsData) => {
    setSelectedImei(device);
    setUsageDatesCurrentPage(1); 
    setSimChangesCurrentPage(1); // Reset SIM changes pagination
  };

  const requestSort = (key: keyof DeviceAnalyticsData | 'simCount' | 'contactCount') => {
    let direction: 'ascending' | 'descending' = 'ascending';
    if (sortConfig.key === key && sortConfig.direction === 'ascending') {
      direction = 'descending';
    }
    setSortConfig({ key, direction });
    setCurrentPage(1);
    setSelectedImei(null); 
  };

  const renderSortIcon = (key: string) => {
    if (sortConfig.key !== key) return <ChevronDown className="h-3.5 w-3.5 text-neutral-DEFAULT opacity-30 group-hover:opacity-100 transition-opacity" />; 
    return sortConfig.direction === 'ascending' ? <ChevronUp className="h-3.5 w-3.5 text-primary-dark" /> : <ChevronDown className="h-3.5 w-3.5 text-primary-dark" />;
  };

  const peakActivityHoursForSelectedImei = useMemo(() => {
    if (!selectedImei || selectedImei.hourlyBreakdown.length === 0) return "N/A";
    const hourlyBreakdown = selectedImei.hourlyBreakdown;
    const totalActivity = hourlyBreakdown.reduce((sum, hourData) => sum + hourData.callCount, 0); 
    if (totalActivity === 0) return "No significant activity";
    const averageActivity = totalActivity / 24;
    const threshold = averageActivity * 1.2; 
    let peakHours: {hour: number, activity: number}[] = [];
    hourlyBreakdown.forEach(hourData => {
      if (hourData.callCount > threshold || (hourData.callCount > 0 && averageActivity < 1 && hourData.callCount === hourlyBreakdown.reduce((max,h) => Math.max(max,h.callCount),0))) {
        peakHours.push({hour: hourData.hour, activity: hourData.callCount});
      }
    });
    if (peakHours.length === 0) {
        const sortedHours = [...hourlyBreakdown].sort((a,b) => b.callCount - a.callCount);
        if (sortedHours[0].callCount > 0) {
            peakHours.push({hour: sortedHours[0].hour, activity: sortedHours[0].callCount});
            if (sortedHours.length > 1 && sortedHours[1].callCount > 0 && sortedHours[1].callCount >= sortedHours[0].callCount * 0.7) peakHours.push({hour: sortedHours[1].hour, activity: sortedHours[1].callCount});
            peakHours.sort((a,b) => a.hour - b.hour);
        } else return "Low overall activity";
    }
    let ranges: string[] = []; let currentRangeStart = -1;
    peakHours.forEach((ph, index) => {
        if (currentRangeStart === -1) currentRangeStart = ph.hour;
        if (index === peakHours.length - 1 || peakHours[index+1].hour !== ph.hour + 1) {
            if (currentRangeStart === ph.hour) ranges.push(`${String(currentRangeStart).padStart(2,'0')}:00`);
            else ranges.push(`${String(currentRangeStart).padStart(2,'0')}:00 - ${String(ph.hour).padStart(2,'0')}:59`);
            currentRangeStart = -1;
        }
    });
    return ranges.join(', ') || "N/A";
  }, [selectedImei]);

  const getExportFilenameBase = () => {
    if (activeFileTabId) {
        const activeFile = uploadedFiles.find(f => f.id === activeFileTabId);
        return activeFile ? (activeFile.sourceName || activeFile.name).replace(/[^a-z0-9]/gi, '_').toLowerCase() : "current_file";
    } else if (filesToAnalyze.length === 1) {
        return (filesToAnalyze[0].sourceName || filesToAnalyze[0].name).replace(/[^a-z0-9]/gi, '_').toLowerCase();
    }
    return "all_selected_files";
  };

  const handleExportImeiList = () => {
    const headers = ["IMEI", "Records", "Unique SIMs", "Unique Contacts", "First Seen", "Last Seen"];
    const data = sortedImeis.map(device => [
        device.imei, String(device.recordCount), String(device.associatedSims.length), String(device.contactedParties.length),
        device.firstSeen ? formatDate(device.firstSeen.toISOString()) : 'N/A', 
        device.lastSeen ? formatDate(device.lastSeen.toISOString()) : 'N/A', 
    ]);
    downloadCSV(`device_imei_summary_${getExportFilenameBase()}.csv`, data, headers);
  };

  const handleExportSelectedImeiSims = () => {
    if (!selectedImei) return;
    const headers = ["SIM Identifier", "Type", "Record Count", "First Seen", "Last Seen"];
    const data = selectedImei.associatedSims.map(sim => [
        sim.simIdentifier, sim.type, String(sim.count),
        sim.firstSeen ? formatDate(sim.firstSeen.toISOString()) : 'N/A', 
        sim.lastSeen ? formatDate(sim.lastSeen.toISOString()) : 'N/A', 
    ]);
    downloadCSV(`device_associated_sims_${selectedImei.imei}_${getExportFilenameBase()}.csv`, data, headers);
  };
  
  const handleExportSelectedImeiContacts = () => {
    if (!selectedImei) return;
    const headers = ["Contacted Party", "Contact Count", "Via SIMs"];
    const data = selectedImei.contactedParties.map(party => [
        party.partyNumber, String(party.count), party.viaSims.join('; ')
    ]);
    downloadCSV(`device_contacted_parties_${selectedImei.imei}_${getExportFilenameBase()}.csv`, data, headers);
  };

  const handleExportSelectedImeiActivity = () => {
    if (!selectedImei) return;
    const headers = ["Hour", "Activity Count"];
    const data = selectedImei.hourlyBreakdown.map(h => [h.name, String(h.callCount)]);
    downloadCSV(`device_hourly_activity_${selectedImei.imei}_${getExportFilenameBase()}.csv`, data, headers);
  };

  const handleExportImeiUsageDates = () => {
    if (!selectedImei || selectedImei.usageDates.length === 0) {
      alert("No usage dates to export for this IMEI.");
      return;
    }
    const headers = ["Date of Use"];
    const sortedDatesForExport = [...selectedImei.usageDates].sort((a, b) => b.getTime() - a.getTime());
    const data = sortedDatesForExport.map(date => [formatDate(date.toISOString()).split(' ')[0]]); 
    downloadCSV(`imei_usage_dates_${selectedImei.imei}_${getExportFilenameBase()}.csv`, data, headers);
  };

  const handleExportSimChangeHistory = () => {
    if (!selectedImei || selectedImei.simChangeHistory.length === 0) {
      alert("No SIM change history to export for this IMEI.");
      return;
    }
    const headers = ["Timestamp of Change", "Previous SIM", "New SIM"];
    const sortedChangesForExport = [...selectedImei.simChangeHistory].sort((a,b) => b.timestamp.getTime() - a.timestamp.getTime());
    const data = sortedChangesForExport.map(change => [
        formatDate(change.timestamp.toISOString()),
        change.previousSim || "N/A (First SIM seen)",
        change.newSim
    ]);
    downloadCSV(`imei_sim_change_history_${selectedImei.imei}_${getExportFilenameBase()}.csv`, data, headers);
  };


  if (isLoading) return <div className="flex justify-center items-center h-64"><div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary-dark"></div><p className="ml-3 text-textSecondary">Analyzing device data...</p></div>;
  if (error) return <div className="p-4 bg-danger-lighter text-danger-darker rounded-lg text-center border border-danger-light">{error}</div>;
  if (uploadedFiles.length === 0) return <div className="p-6 bg-info-lighter border border-info-light rounded-lg text-center text-info-dark flex flex-col items-center justify-center min-h-[150px] shadow-md"><Info size={28} className="mb-2" /><p className="font-medium">Please upload CDR files to analyze device activity.</p></div>;
  if (filesToAnalyze.length === 0) return <div className="p-6 bg-warning-lighter border border-warning-light rounded-lg text-center text-warning-darker flex flex-col items-center justify-center min-h-[150px] shadow-md"><Info size={28} className="mb-2" /><p className="font-medium">Please select files in 'Filter Controls' to analyze device activity.</p></div>;
  if (deviceAnalyticsData.length === 0) return <div className="p-6 bg-neutral-lightest border border-neutral-light rounded-lg text-center text-textSecondary flex flex-col items-center justify-center min-h-[150px] shadow-md"><Info size={28} className="mb-2 text-neutral-DEFAULT" /><p>No IMEI data found in the selected records, or no records match current filters.</p></div>;

  const tableHeaders: { key: keyof DeviceAnalyticsData | 'simCount' | 'contactCount'; label: string; icon?: React.ReactNode }[] = [
    { key: 'imei', label: 'IMEI', icon: <Smartphone size={14} /> }, { key: 'recordCount', label: 'Records', icon: <ListFilter size={14} /> },
    { key: 'simCount', label: 'Unique SIMs Used', icon: <Users2 size={14} /> }, { key: 'contactCount', label: 'Unique Contacts Made', icon: <Send size={14} /> },
    { key: 'firstSeen', label: 'First Seen', icon: <Clock size={14} /> }, { key: 'lastSeen', label: 'Last Seen', icon: <Clock size={14} /> },
  ];

  return (
    <div className="space-y-6">
      <div className="p-4 sm:p-5 bg-surface border border-neutral-light rounded-xl shadow-xl"> 
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center">
            <div>
                <div className="flex items-center text-xl sm:text-2xl font-semibold text-textPrimary mb-1"> <Smartphone size={24} className="mr-2.5 text-primary" /> Device (IMEI) Analysis </div>
                <p className="text-sm text-textSecondary"> Showing {deviceAnalyticsData.length} unique IMEIs. Click on an IMEI to see details. </p>
            </div>
            {deviceAnalyticsData.length > 0 && (
                <button onClick={handleExportImeiList} className="mt-3 sm:mt-0 px-3.5 py-2 text-xs sm:text-sm bg-secondary text-white rounded-lg hover:bg-secondary-dark focus:outline-none focus:ring-2 focus:ring-secondary-light focus:ring-offset-1 flex items-center shadow-md hover:shadow-lg transition-all"> <Download size={15} className="mr-1.5" /> Export IMEI List </button>
            )}
        </div>
      </div>

      <div className="bg-surface shadow-xl rounded-xl border border-neutral-light overflow-x-auto"> 
        <table className="min-w-full divide-y divide-neutral-light">
          <thead className="bg-neutral-lightest sticky top-0 z-10">
            <tr> {tableHeaders.map(header => ( <th key={String(header.key)} scope="col" onClick={() => requestSort(header.key)} className="group px-3 py-3 text-left text-xs font-semibold text-textPrimary uppercase tracking-wider cursor-pointer hover:bg-neutral-lighter transition-colors whitespace-nowrap"> <div className="flex items-center"> {header.icon && <span className="mr-1.5 text-neutral-DEFAULT group-hover:text-primary">{header.icon}</span>} {header.label} {renderSortIcon(String(header.key))} </div> </th> ))} </tr>
          </thead>
          <tbody className="bg-surface divide-y divide-neutral-light">
            {paginatedImeis.map((device, index) => (
              <tr key={device.imei} className={`transition-colors cursor-pointer ${selectedImei?.imei === device.imei ? 'bg-primary-lighter/40 ring-2 ring-primary-light' : (index % 2 === 0 ? 'bg-surface' : 'bg-neutral-lightest/70')} hover:bg-primary-lighter/30`} onClick={() => handleImeiRowClick(device)}>
                <td className="px-3 py-2.5 whitespace-nowrap text-xs text-textPrimary font-medium">{device.imei}</td>
                <td className="px-3 py-2.5 whitespace-nowrap text-xs text-textSecondary text-center">{device.recordCount}</td>
                <td className="px-3 py-2.5 whitespace-nowrap text-xs text-textSecondary text-center">{device.associatedSims.length}</td>
                <td className="px-3 py-2.5 whitespace-nowrap text-xs text-textSecondary text-center">{device.contactedParties.length}</td>
                <td className="px-3 py-2.5 whitespace-nowrap text-xs text-textSecondary">{device.firstSeen ? formatDate(device.firstSeen.toISOString()) : 'N/A'}</td>
                <td className="px-3 py-2.5 whitespace-nowrap text-xs text-textSecondary">{device.lastSeen ? formatDate(device.lastSeen.toISOString()) : 'N/A'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {totalPages > 1 && ( <div className="flex flex-col sm:flex-row justify-between items-center mt-4 py-3 px-1"> <span className="text-sm text-textSecondary mb-2 sm:mb-0">Page {currentPage} of {totalPages} (Total: {sortedImeis.length} IMEIs)</span> <div className="flex gap-2"> <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1} className="px-3 py-1.5 text-xs font-medium text-textPrimary bg-surface border border-neutral-light rounded-lg shadow-sm hover:bg-neutral-lighter disabled:opacity-50">Previous</button> <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages} className="px-3 py-1.5 text-xs font-medium text-textPrimary bg-surface border border-neutral-light rounded-lg shadow-sm hover:bg-neutral-lighter disabled:opacity-50">Next</button> </div> </div> )}

      {selectedImei && (
        <div className="mt-6 space-y-6">
          <div className="p-4 sm:p-6 bg-surface rounded-xl shadow-xl border border-neutral-light"> 
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4">
              <h3 className="text-base sm:text-lg font-semibold text-textPrimary mb-2 sm:mb-0">Details for IMEI: <span className="text-primary-dark">{selectedImei.imei}</span></h3>
              <div className="flex flex-wrap gap-2 self-start sm:self-center">
                 <button onClick={handleExportSelectedImeiSims} className="px-2.5 py-1.5 text-[11px] bg-info-lighter/60 text-info-dark rounded-md hover:bg-info-lighter/80 font-medium flex items-center shadow-sm"><Download size={13} className="mr-1"/>SIMs</button>
                 <button onClick={handleExportSelectedImeiContacts} className="px-2.5 py-1.5 text-[11px] bg-success-lighter/60 text-success-dark rounded-md hover:bg-success-lighter/80 font-medium flex items-center shadow-sm"><Download size={13} className="mr-1"/>Contacts</button>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
              <div>
                <h4 className="text-sm sm:text-base font-medium text-textPrimary mb-2 flex items-center"><Users2 size={16} className="mr-2 text-primary"/>Associated SIMs ({selectedImei.associatedSims.length})</h4>
                {selectedImei.associatedSims.length > 0 ? ( <ul className="space-y-1.5 text-xs max-h-48 overflow-y-auto scrollbar-thin scrollbar-thumb-neutral-light scrollbar-track-transparent pr-1"> {selectedImei.associatedSims.map(sim => ( <li key={sim.simIdentifier} className="p-2 bg-neutral-lightest rounded-md border border-neutral-light shadow-xs"> <span className="font-semibold text-textPrimary">{sim.simIdentifier}</span> ({sim.type}, {sim.count} records) <br/> <span className="text-neutral-DEFAULT text-[10px]"> First: {sim.firstSeen ? formatDate(sim.firstSeen.toISOString()) : 'N/A'}, Last: {sim.lastSeen ? formatDate(sim.lastSeen.toISOString()) : 'N/A'} </span> </li> ))} </ul> ) : <p className="text-xs text-textSecondary">No SIMs associated.</p>}
              </div>
              <div>
                <h4 className="text-sm sm:text-base font-medium text-textPrimary mb-2 flex items-center"><Send size={16} className="mr-2 text-primary"/>Contacted Parties ({selectedImei.contactedParties.length})</h4>
                 {selectedImei.contactedParties.length > 0 ? ( <ul className="space-y-1.5 text-xs max-h-48 overflow-y-auto scrollbar-thin scrollbar-thumb-neutral-light scrollbar-track-transparent pr-1"> {selectedImei.contactedParties.map(party => ( <li key={party.partyNumber} className="p-2 bg-neutral-lightest rounded-md border border-neutral-light shadow-xs"> <span className="font-semibold text-textPrimary">{party.partyNumber}</span> ({party.count} times) {party.viaSims.length > 0 && <span className="text-[10px] text-neutral-DEFAULT block">Via SIM(s): {party.viaSims.join(', ')}</span>} </li> ))} </ul> ) : <p className="text-xs text-textSecondary">No B-Parties contacted.</p>}
              </div>
            </div>
          </div>
          
          {/* SIM Change History Section */}
          <div className="bg-surface p-4 sm:p-6 rounded-xl shadow-xl border border-neutral-light">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-3">
                <h4 className="text-base sm:text-lg font-semibold text-textPrimary flex items-center"><Repeat size={18} className="mr-2 text-primary"/>SIM Card Change History ({selectedImei.simChangeHistory.length} changes)</h4>
                {selectedImei.simChangeHistory.length > 0 && (
                    <button onClick={handleExportSimChangeHistory} className="mt-2 sm:mt-0 px-2.5 py-1.5 text-[11px] bg-red-200/60 text-red-700 rounded-md hover:bg-red-200/80 font-medium flex items-center shadow-sm"><Download size={13} className="mr-1"/>Export Changes</button>
                )}
            </div>
            {selectedImei.simChangeHistory.length > 0 ? (
                <>
                    <div className="overflow-x-auto max-h-60 scrollbar-thin scrollbar-thumb-neutral-light scrollbar-track-transparent">
                        <table className="min-w-full divide-y divide-neutral-light">
                            <thead className="bg-neutral-lightest sticky top-0 z-10">
                                <tr>
                                    <th className="px-3 py-2 text-left text-xs font-semibold text-textPrimary uppercase tracking-wider">Timestamp of Change</th>
                                    <th className="px-3 py-2 text-left text-xs font-semibold text-textPrimary uppercase tracking-wider">Previous SIM</th>
                                    <th className="px-3 py-2 text-left text-xs font-semibold text-textPrimary uppercase tracking-wider">New SIM</th>
                                </tr>
                            </thead>
                            <tbody className="bg-surface divide-y divide-neutral-light">
                                {paginatedSimChangeHistory.map((change, index) => (
                                    <tr key={change.timestamp.toISOString() + index} className={index % 2 === 0 ? 'bg-surface' : 'bg-neutral-lightest/70'}>
                                        <td className="px-3 py-2 whitespace-nowrap text-xs text-textSecondary">{formatDate(change.timestamp.toISOString())}</td>
                                        <td className="px-3 py-2 whitespace-nowrap text-xs text-textSecondary">{change.previousSim || "N/A (First SIM seen)"}</td>
                                        <td className="px-3 py-2 whitespace-nowrap text-xs text-textSecondary font-medium">{change.newSim}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    {totalSimChangePages > 1 && (
                        <div className="flex flex-col sm:flex-row justify-between items-center mt-3 pt-2 border-t border-neutral-light text-xs">
                            <span className="text-textSecondary mb-1 sm:mb-0">Page {simChangesCurrentPage} of {totalSimChangePages}</span>
                            <div className="flex gap-1.5">
                                <button onClick={() => setSimChangesCurrentPage(p => Math.max(1, p - 1))} disabled={simChangesCurrentPage === 1} className="px-2.5 py-1 font-medium text-textPrimary bg-surface border border-neutral-light rounded-md shadow-sm hover:bg-neutral-lighter disabled:opacity-50">Prev</button>
                                <button onClick={() => setSimChangesCurrentPage(p => Math.min(totalSimChangePages, p + 1))} disabled={simChangesCurrentPage === totalSimChangePages} className="px-2.5 py-1 font-medium text-textPrimary bg-surface border border-neutral-light rounded-md shadow-sm hover:bg-neutral-lighter disabled:opacity-50">Next</button>
                            </div>
                        </div>
                    )}
                </>
            ) : <p className="text-textSecondary text-center py-5">No SIM changes recorded for this IMEI.</p>}
          </div>


          {/* IMEI Usage Dates Section */}
          <div className="bg-surface p-4 sm:p-6 rounded-xl shadow-xl border border-neutral-light">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-3">
                <h4 className="text-base sm:text-lg font-semibold text-textPrimary flex items-center"><CalendarDays size={18} className="mr-2 text-primary"/>IMEI Usage Dates ({selectedImei.usageDates.length} unique days)</h4>
                {selectedImei.usageDates.length > 0 && (
                    <button onClick={handleExportImeiUsageDates} className="mt-2 sm:mt-0 px-2.5 py-1.5 text-[11px] bg-purple-200/60 text-purple-700 rounded-md hover:bg-purple-200/80 font-medium flex items-center shadow-sm"><Download size={13} className="mr-1"/>Export Dates</button>
                )}
            </div>
            {selectedImei.usageDates.length > 0 ? (
                <>
                    <div className="overflow-x-auto max-h-60 scrollbar-thin scrollbar-thumb-neutral-light scrollbar-track-transparent">
                        <table className="min-w-full divide-y divide-neutral-light">
                            <thead className="bg-neutral-lightest sticky top-0 z-10">
                                <tr><th className="px-3 py-2 text-left text-xs font-semibold text-textPrimary uppercase tracking-wider">Date of Use</th></tr>
                            </thead>
                            <tbody className="bg-surface divide-y divide-neutral-light">
                                {paginatedUsageDates.map((date, index) => (
                                    <tr key={date.toISOString() + index} className={index % 2 === 0 ? 'bg-surface' : 'bg-neutral-lightest/70'}>
                                        <td className="px-3 py-2 whitespace-nowrap text-xs text-textSecondary">{formatDate(date.toISOString()).split(' ')[0]}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    {totalUsageDatePages > 1 && (
                        <div className="flex flex-col sm:flex-row justify-between items-center mt-3 pt-2 border-t border-neutral-light text-xs">
                            <span className="text-textSecondary mb-1 sm:mb-0">Page {usageDatesCurrentPage} of {totalUsageDatePages}</span>
                            <div className="flex gap-1.5">
                                <button onClick={() => setUsageDatesCurrentPage(p => Math.max(1, p - 1))} disabled={usageDatesCurrentPage === 1} className="px-2.5 py-1 font-medium text-textPrimary bg-surface border border-neutral-light rounded-md shadow-sm hover:bg-neutral-lighter disabled:opacity-50">Prev</button>
                                <button onClick={() => setUsageDatesCurrentPage(p => Math.min(totalUsageDatePages, p + 1))} disabled={usageDatesCurrentPage === totalUsageDatePages} className="px-2.5 py-1 font-medium text-textPrimary bg-surface border border-neutral-light rounded-md shadow-sm hover:bg-neutral-lighter disabled:opacity-50">Next</button>
                            </div>
                        </div>
                    )}
                </>
            ) : <p className="text-textSecondary text-center py-5">No usage dates recorded for this IMEI.</p>}
          </div>


          <div className="bg-surface p-4 sm:p-6 rounded-xl shadow-xl border border-neutral-light">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-2">
                <h3 className="text-base sm:text-lg font-semibold text-textPrimary flex items-center"><Activity size={16} className="mr-2 text-primary"/>Hourly Activity for IMEI: <span className="text-primary-dark ml-1">{selectedImei.imei}</span></h3>
                 <button onClick={handleExportSelectedImeiActivity} className="mt-1 sm:mt-0 px-2.5 py-1.5 text-[11px] bg-accent-lighter/60 text-accent-dark rounded-md hover:bg-accent-lighter/80 font-medium flex items-center shadow-sm"><Download size={13} className="mr-1"/>Activity</button>
            </div>
             {selectedImei.hourlyBreakdown.some(h => h.callCount > 0) ? (
              <>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={selectedImei.hourlyBreakdown} margin={{ top: 5, right: 20, left: -5, bottom: 25 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                    <XAxis dataKey="name" angle={-45} textAnchor="end" height={60} interval={1} tick={{fontSize: 10}} stroke="#9ca3af"/>
                    <YAxis allowDecimals={false} label={{ value: 'Activity Count', angle: -90, position: 'insideLeft', offset:10, style: {fontSize: '10px', fill: '#6b7280'} }} tick={{fontSize: 10}} stroke="#9ca3af"/>
                    <Tooltip wrapperStyle={{fontSize: "12px", background: "rgba(255,255,255,0.9)", borderRadius: "4px", border: "1px solid #e5e7eb"}}/>
                    <Legend verticalAlign="top" iconSize={10} wrapperStyle={{fontSize: "12px"}}/>
                    <Bar dataKey="callCount" name="Activity Count" fill={COLORS[2]} radius={[5, 5, 0, 0]} barSize={15}/>
                  </BarChart>
                </ResponsiveContainer>
                <p className="text-xs text-textSecondary mt-3 text-center">
                  <TrendingUp size={14} className="inline mr-1 text-primary"/> Peak Activity for this IMEI: {peakActivityHoursForSelectedImei}
                </p>
              </>
             ) : <p className="text-textSecondary text-center py-10">No hourly activity data for this IMEI.</p>}
          </div>
        </div>
      )}
    </div>
  );
};

export default DeviceAnalysisView;

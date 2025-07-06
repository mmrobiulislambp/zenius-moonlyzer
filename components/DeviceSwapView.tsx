
import React, { useState, useMemo } from 'react';
import { Repeat, Smartphone, ShieldCheck, Users, Clock, ChevronDown, ChevronRight, Info, ListFilter, Download, Maximize2, Minimize2, ChevronUp } from 'lucide-react'; // Added ChevronUp
import { useCDRContext } from '../contexts/CDRContext';
import { SimCardAnalyticsData, AssociatedImeiInfo, ImeiChangeEvent, DeviceAnalyticsData, AssociatedSimInfo, SimChangeEvent } from '../types';
import { formatDate } from '../utils/cdrUtils';
import { downloadCSV } from '../utils/downloadUtils';

const ROWS_PER_PAGE_MAIN = 10;
const ROWS_PER_PAGE_DETAILS = 5;

const DeviceSwapView: React.FC = () => {
  const { simCardAnalytics, deviceAnalyticsData, isLoading, error, uploadedFiles, filesToAnalyze, activeFileTabId } = useCDRContext();

  const [expandedSim, setExpandedSim] = useState<SimCardAnalyticsData | null>(null);
  const [expandedImei, setExpandedImei] = useState<DeviceAnalyticsData | null>(null);
  
  const [currentPageSims, setCurrentPageSims] = useState(1);
  const [currentPageImeis, setCurrentPageImeis] = useState(1);

  const [simSortConfig, setSimSortConfig] = useState<{ key: keyof SimCardAnalyticsData | 'imeiChangeCount' | 'associatedImeiCount'; direction: 'ascending' | 'descending' }>({ key: 'imeiChangeCount', direction: 'descending' });
  const [imeiSortConfig, setImeiSortConfig] = useState<{ key: keyof DeviceAnalyticsData | 'simChangeCount' | 'associatedSimCount'; direction: 'ascending' | 'descending' }>({ key: 'simChangeCount', direction: 'descending' });

  // Memoized and sorted data for SIMs that used multiple IMEIs
  const swappySims = useMemo(() => {
    let filtered = simCardAnalytics.filter(sim => sim.associatedImeis.length > 1 || sim.imeiChangeHistory.length > 0);
    if (simSortConfig.key) {
      filtered.sort((a, b) => {
        let valA, valB;
        if (simSortConfig.key === 'imeiChangeCount') { valA = a.imeiChangeHistory.length; valB = b.imeiChangeHistory.length;} 
        else if (simSortConfig.key === 'associatedImeiCount') { valA = a.associatedImeis.length; valB = b.associatedImeis.length; } 
        else { valA = a[simSortConfig.key as keyof SimCardAnalyticsData]; valB = b[simSortConfig.key as keyof SimCardAnalyticsData]; }
        
        if (valA instanceof Date && valB instanceof Date) { valA = valA.getTime(); valB = valB.getTime(); }
        else if (typeof valA === 'string' && typeof valB === 'string') { valA = valA.toLowerCase(); valB = valB.toLowerCase(); }
        if (valA === undefined || valA === null) valA = simSortConfig.direction === 'ascending' ? Infinity : -Infinity;
        if (valB === undefined || valB === null) valB = simSortConfig.direction === 'ascending' ? Infinity : -Infinity;
        if (valA < valB) return simSortConfig.direction === 'ascending' ? -1 : 1;
        if (valA > valB) return simSortConfig.direction === 'ascending' ? 1 : -1;
        return 0;
      });
    }
    return filtered;
  }, [simCardAnalytics, simSortConfig]);

  const paginatedSwappySims = useMemo(() => {
    const startIndex = (currentPageSims - 1) * ROWS_PER_PAGE_MAIN;
    return swappySims.slice(startIndex, startIndex + ROWS_PER_PAGE_MAIN);
  }, [swappySims, currentPageSims]);
  const totalSimPages = Math.ceil(swappySims.length / ROWS_PER_PAGE_MAIN);

  // Memoized and sorted data for IMEIs that used multiple SIMs
  const swappyImeis = useMemo(() => {
    let filtered = deviceAnalyticsData.filter(dev => dev.associatedSims.length > 1 || dev.simChangeHistory.length > 0);
    if (imeiSortConfig.key) {
      filtered.sort((a, b) => {
        let valA, valB;
        if (imeiSortConfig.key === 'simChangeCount') { valA = a.simChangeHistory.length; valB = b.simChangeHistory.length; } 
        else if (imeiSortConfig.key === 'associatedSimCount') { valA = a.associatedSims.length; valB = b.associatedSims.length; }
        else { valA = a[imeiSortConfig.key as keyof DeviceAnalyticsData]; valB = b[imeiSortConfig.key as keyof DeviceAnalyticsData]; }
        
        if (valA instanceof Date && valB instanceof Date) { valA = valA.getTime(); valB = valB.getTime(); }
        else if (typeof valA === 'string' && typeof valB === 'string') { valA = valA.toLowerCase(); valB = valB.toLowerCase(); }
        if (valA === undefined || valA === null) valA = imeiSortConfig.direction === 'ascending' ? Infinity : -Infinity;
        if (valB === undefined || valB === null) valB = imeiSortConfig.direction === 'ascending' ? Infinity : -Infinity;
        if (valA < valB) return imeiSortConfig.direction === 'ascending' ? -1 : 1;
        if (valA > valB) return imeiSortConfig.direction === 'ascending' ? 1 : -1;
        return 0;
      });
    }
    return filtered;
  }, [deviceAnalyticsData, imeiSortConfig]);

  const paginatedSwappyImeis = useMemo(() => {
    const startIndex = (currentPageImeis - 1) * ROWS_PER_PAGE_MAIN;
    return swappyImeis.slice(startIndex, startIndex + ROWS_PER_PAGE_MAIN);
  }, [swappyImeis, currentPageImeis]);
  const totalImeiPages = Math.ceil(swappyImeis.length / ROWS_PER_PAGE_MAIN);

  const requestSortSims = (key: keyof SimCardAnalyticsData | 'imeiChangeCount' | 'associatedImeiCount') => {
    let direction: 'ascending' | 'descending' = 'descending';
    if (simSortConfig.key === key && simSortConfig.direction === 'descending') direction = 'ascending';
    setSimSortConfig({ key, direction });
    setCurrentPageSims(1);
  };

  const requestSortImeis = (key: keyof DeviceAnalyticsData | 'simChangeCount' | 'associatedSimCount') => {
    let direction: 'ascending' | 'descending' = 'descending';
    if (imeiSortConfig.key === key && imeiSortConfig.direction === 'descending') direction = 'ascending';
    setImeiSortConfig({ key, direction });
    setCurrentPageImeis(1);
  };
  
  const renderSortIcon = (currentKey: string, config: any) => {
    if (config.key !== currentKey) return <ChevronDown className="h-3.5 w-3.5 text-neutral-DEFAULT opacity-30 group-hover:opacity-100 inline" />;
    return config.direction === 'ascending' ? <ChevronUp className="h-3.5 w-3.5 text-primary-dark inline" /> : <ChevronDown className="h-3.5 w-3.5 text-primary-dark inline" />;
  };
  
  const getExportFilenameBase = () => {
    if (activeFileTabId) {
        const activeFile = uploadedFiles.find(f => f.id === activeFileTabId);
        return activeFile ? (activeFile.sourceName || activeFile.name).replace(/[^a-z0-9]/gi, '_').toLowerCase() : "current_file";
    } else if (filesToAnalyze.length === 1) {
        return (filesToAnalyze[0].sourceName || filesToAnalyze[0].name).replace(/[^a-z0-9]/gi, '_').toLowerCase();
    }
    return "all_selected_files";
  };

  const handleExportSimSwaps = () => {
    const headers = ["SIM Identifier", "Type", "Total Records", "# Unique IMEIs", "# IMEI Changes", "First Seen", "Last Seen"];
    const data = swappySims.map(sim => [
      sim.simIdentifier, sim.type, String(sim.recordCount), String(sim.associatedImeis.length), String(sim.imeiChangeHistory.length),
      sim.firstSeenOverall ? formatDate(sim.firstSeenOverall.toISOString()) : 'N/A',
      sim.lastSeenOverall ? formatDate(sim.lastSeenOverall.toISOString()) : 'N/A',
    ]);
    downloadCSV(`sim_device_swaps_summary_${getExportFilenameBase()}.csv`, data, headers);
  };
  
  const handleExportImeiSwaps = () => {
    const headers = ["IMEI", "Total Records", "# Unique SIMs", "# SIM Changes", "First Seen", "Last Seen"];
    const data = swappyImeis.map(dev => [
      dev.imei, String(dev.recordCount), String(dev.associatedSims.length), String(dev.simChangeHistory.length),
      dev.firstSeen ? formatDate(dev.firstSeen.toISOString()) : 'N/A',
      dev.lastSeen ? formatDate(dev.lastSeen.toISOString()) : 'N/A',
    ]);
    downloadCSV(`device_sim_swaps_summary_${getExportFilenameBase()}.csv`, data, headers);
  };

  const handleExportExpandedSimDetails = (simData: SimCardAnalyticsData) => {
    const headers = ["Associated IMEI", "Record Count with this IMEI", "First Seen with SIM", "Last Seen with SIM"];
    const data = simData.associatedImeis.map(imeiInfo => [
        imeiInfo.imei, String(imeiInfo.count),
        imeiInfo.firstSeen ? formatDate(imeiInfo.firstSeen.toISOString()) : 'N/A',
        imeiInfo.lastSeen ? formatDate(imeiInfo.lastSeen.toISOString()) : 'N/A',
    ]);
    data.push(["---","---","---","---"]); // Separator
    data.push(["IMEI Change Timestamp", "Previous IMEI", "New IMEI", "Record ID"]);
    simData.imeiChangeHistory.forEach(change => {
        data.push([
            formatDate(change.timestamp.toISOString()),
            change.previousImei || "N/A",
            change.newImei,
            change.recordId
        ]);
    });
    downloadCSV(`sim_swap_details_${simData.simIdentifier}_${getExportFilenameBase()}.csv`, data, headers);
  };

  const handleExportExpandedImeiDetails = (imeiData: DeviceAnalyticsData) => {
     const headers = ["Associated SIM", "Type", "Record Count with this SIM", "First Seen with IMEI", "Last Seen with IMEI"];
    const data = imeiData.associatedSims.map(simInfo => [
        simInfo.simIdentifier, simInfo.type, String(simInfo.count),
        simInfo.firstSeen ? formatDate(simInfo.firstSeen.toISOString()) : 'N/A',
        simInfo.lastSeen ? formatDate(simInfo.lastSeen.toISOString()) : 'N/A',
    ]);
    data.push(["---","---","---","---","---"]); // Separator
    data.push(["SIM Change Timestamp", "Previous SIM", "New SIM",""]);
    imeiData.simChangeHistory.forEach(change => {
        data.push([
            formatDate(change.timestamp.toISOString()),
            change.previousSim || "N/A",
            change.newSim,
            ""
        ]);
    });
    downloadCSV(`device_swap_details_${imeiData.imei}_${getExportFilenameBase()}.csv`, data, headers);
  };


  if (isLoading) return <div className="flex justify-center items-center h-64"><div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary-dark"></div><p className="ml-3 text-textSecondary">Detecting device swaps...</p></div>;
  if (error) return <div className="p-4 bg-danger-lighter text-danger-darker rounded-lg text-center border border-danger-light">{error}</div>;
  if (uploadedFiles.length === 0) return <div className="p-6 bg-info-lighter border border-info-light rounded-lg text-center text-info-dark flex flex-col items-center justify-center min-h-[150px] shadow-md"><Info size={28} className="mb-2" /><p className="font-medium">Please upload CDR files.</p></div>;
  if (filesToAnalyze.length === 0) return <div className="p-6 bg-warning-lighter border border-warning-light rounded-lg text-center text-warning-darker flex flex-col items-center justify-center min-h-[150px] shadow-md"><Info size={28} className="mb-2" /><p className="font-medium">Please select files in 'Filter Controls'.</p></div>;
  if (simCardAnalytics.length === 0 && deviceAnalyticsData.length === 0) return <div className="p-6 bg-neutral-lightest border border-neutral-light rounded-lg text-center text-textSecondary flex flex-col items-center justify-center min-h-[150px] shadow-md"><Info size={28} className="mb-2 text-neutral-DEFAULT" /><p>No SIM or IMEI data found for swap analysis.</p></div>;


  const simTableHeaders: { key: keyof SimCardAnalyticsData | 'imeiChangeCount' | 'associatedImeiCount'; label: string; icon?: React.ReactNode }[] = [
    { key: 'simIdentifier', label: 'SIM Identifier', icon: <ShieldCheck size={14} /> },
    { key: 'type', label: 'Type', icon: <Info size={14} /> },
    { key: 'recordCount', label: 'Total Records', icon: <ListFilter size={14} /> },
    { key: 'associatedImeiCount', label: '# Unique IMEIs', icon: <Smartphone size={14} /> },
    { key: 'imeiChangeCount', label: '# IMEI Changes', icon: <Repeat size={14} /> },
    { key: 'firstSeenOverall', label: 'First Seen', icon: <Clock size={14} /> },
    { key: 'lastSeenOverall', label: 'Last Seen', icon: <Clock size={14} /> },
  ];

  const imeiTableHeaders: { key: keyof DeviceAnalyticsData | 'simChangeCount' | 'associatedSimCount'; label: string; icon?: React.ReactNode }[] = [
    { key: 'imei', label: 'IMEI', icon: <Smartphone size={14} /> },
    { key: 'recordCount', label: 'Total Records', icon: <ListFilter size={14} /> },
    { key: 'associatedSimCount', label: '# Unique SIMs', icon: <ShieldCheck size={14} /> },
    { key: 'simChangeCount', label: '# SIM Changes', icon: <Repeat size={14} /> },
    { key: 'firstSeen', label: 'First Seen', icon: <Clock size={14} /> },
    { key: 'lastSeen', label: 'Last Seen', icon: <Clock size={14} /> },
  ];

  return (
    <div className="space-y-8">
      <div className="p-4 sm:p-5 bg-surface border border-neutral-light rounded-xl shadow-xl">
        <div className="flex items-center text-xl sm:text-2xl font-semibold text-textPrimary mb-1">
          <Repeat size={24} className="mr-2.5 text-primary" /> Device & SIM Swap Detection
        </div>
        <p className="text-sm text-textSecondary">Identify SIM cards used in multiple devices and devices used with multiple SIM cards.</p>
      </div>

      {/* SIMs using multiple Devices */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center p-3 bg-neutral-lightest/60 border-l-4 border-primary rounded-r-lg shadow-md">
          <h3 className="text-base sm:text-lg font-semibold text-primary-dark flex items-center mb-2 sm:mb-0"><ShieldCheck size={18} className="mr-2"/>SIMs Used in Multiple Devices ({swappySims.length})</h3>
          {swappySims.length > 0 && <button onClick={handleExportSimSwaps} className="px-3 py-1.5 text-xs bg-secondary text-white rounded-lg hover:bg-secondary-dark focus:outline-none focus:ring-2 focus:ring-secondary-light flex items-center shadow-sm"><Download size={14} className="mr-1.5"/>Export List</button>}
        </div>
        {swappySims.length > 0 ? (
        <>
          <div className="bg-surface shadow-lg rounded-xl border border-neutral-light overflow-x-auto">
            <table className="min-w-full divide-y divide-neutral-light">
              <thead className="bg-neutral-lightest/80 sticky top-0 z-10">
                <tr>{simTableHeaders.map(h => <th key={String(h.key)} onClick={() => requestSortSims(h.key)} className="group px-3 py-2.5 text-left text-xs font-semibold text-textPrimary uppercase tracking-wider cursor-pointer hover:bg-neutral-lighter transition-colors whitespace-nowrap"><div className="flex items-center">{h.icon && <span className="mr-1.5 text-neutral-DEFAULT group-hover:text-primary">{h.icon}</span>}{h.label} {renderSortIcon(String(h.key), simSortConfig)}</div></th>)}</tr>
              </thead>
              <tbody className="bg-surface divide-y divide-neutral-light">
                {paginatedSwappySims.map((sim, idx) => (
                  <React.Fragment key={sim.simIdentifier}>
                    <tr className={`transition-colors cursor-pointer ${expandedSim?.simIdentifier === sim.simIdentifier ? 'bg-primary-lighter/30' : (idx % 2 === 0 ? 'bg-surface' : 'bg-neutral-lightest/60')} hover:bg-primary-lighter/20`} onClick={() => setExpandedSim(s => s?.simIdentifier === sim.simIdentifier ? null : sim)}>
                      <td className="px-3 py-2 whitespace-nowrap text-xs text-textPrimary font-medium">{sim.simIdentifier}</td>
                      <td className="px-3 py-2 whitespace-nowrap text-xs text-textSecondary">{sim.type}</td>
                      <td className="px-3 py-2 whitespace-nowrap text-xs text-textSecondary text-center">{sim.recordCount}</td>
                      <td className="px-3 py-2 whitespace-nowrap text-xs text-textSecondary text-center">{sim.associatedImeis.length}</td>
                      <td className="px-3 py-2 whitespace-nowrap text-xs text-textSecondary text-center">{sim.imeiChangeHistory.length}</td>
                      <td className="px-3 py-2 whitespace-nowrap text-xs text-textSecondary">{sim.firstSeenOverall ? formatDate(sim.firstSeenOverall.toISOString()) : 'N/A'}</td>
                      <td className="px-3 py-2 whitespace-nowrap text-xs text-textSecondary">{sim.lastSeenOverall ? formatDate(sim.lastSeenOverall.toISOString()) : 'N/A'}</td>
                    </tr>
                    {expandedSim?.simIdentifier === sim.simIdentifier && (
                      <tr>
                        <td colSpan={simTableHeaders.length} className="p-3 bg-primary-lighter/10 border-l-4 border-primary-light">
                          <div className="text-xs space-y-2">
                            <div className="flex justify-between items-center mb-1">
                                <h5 className="font-semibold text-textPrimary">Details for SIM: {sim.simIdentifier}</h5>
                                <button onClick={(e) => { e.stopPropagation(); handleExportExpandedSimDetails(sim);}} className="px-2 py-1 text-[10px] bg-info-lighter/60 text-info-dark rounded-md hover:bg-info-lighter/80 shadow-sm flex items-center"><Download size={12} className="mr-1"/>Export Details</button>
                            </div>
                            <p><strong className="text-neutral-dark">Associated IMEIs ({sim.associatedImeis.length}):</strong></p>
                            <ul className="list-disc list-inside ml-2 space-y-0.5 max-h-32 overflow-y-auto scrollbar-thin">
                              {sim.associatedImeis.slice(0, ROWS_PER_PAGE_DETAILS).map(ai => <li key={ai.imei} title={`First: ${ai.firstSeen ? formatDate(ai.firstSeen.toISOString()) : 'N/A'}, Last: ${ai.lastSeen ? formatDate(ai.lastSeen.toISOString()) : 'N/A'}`}>{ai.imei} ({ai.count} records)</li>)}
                              {sim.associatedImeis.length > ROWS_PER_PAGE_DETAILS && <li>...and {sim.associatedImeis.length - ROWS_PER_PAGE_DETAILS} more.</li>}
                            </ul>
                            <p className="mt-1"><strong className="text-neutral-dark">IMEI Change History ({sim.imeiChangeHistory.length}):</strong></p>
                            <ul className="list-disc list-inside ml-2 space-y-0.5 max-h-32 overflow-y-auto scrollbar-thin">
                              {sim.imeiChangeHistory.slice(0, ROWS_PER_PAGE_DETAILS).map(ch => <li key={ch.timestamp.toISOString()+ch.newImei}>On {formatDate(ch.timestamp.toISOString())}: <span className="text-danger-dark">{ch.previousImei || 'N/A'}</span> → <span className="text-success-dark">{ch.newImei}</span></li>)}
                              {sim.imeiChangeHistory.length > ROWS_PER_PAGE_DETAILS && <li>...and {sim.imeiChangeHistory.length - ROWS_PER_PAGE_DETAILS} more.</li>}
                            </ul>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
          {totalSimPages > 1 && ( <div className="flex flex-col sm:flex-row justify-between items-center mt-3 py-2 text-xs"> <span className="text-textSecondary mb-1 sm:mb-0">Page {currentPageSims} of {totalSimPages}</span> <div className="flex gap-1.5"> <button onClick={() => setCurrentPageSims(p => Math.max(1, p - 1))} disabled={currentPageSims === 1} className="px-2.5 py-1 font-medium bg-surface border rounded-md shadow-sm hover:bg-neutral-lighter disabled:opacity-50">Prev</button> <button onClick={() => setCurrentPageSims(p => Math.min(totalSimPages, p + 1))} disabled={currentPageSims === totalSimPages} className="px-2.5 py-1 font-medium bg-surface border rounded-md shadow-sm hover:bg-neutral-lighter disabled:opacity-50">Next</button> </div> </div> )}
        </>
        ) : <div className="p-4 bg-neutral-lightest border border-neutral-light rounded-lg text-center text-textSecondary shadow-sm">No SIMs found to be used in multiple devices based on current filters.</div>}
      </div>

      {/* Devices using multiple SIMs */}
      <div className="space-y-4">
         <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center p-3 bg-neutral-lightest/60 border-l-4 border-secondary rounded-r-lg shadow-md">
          <h3 className="text-base sm:text-lg font-semibold text-secondary-dark flex items-center mb-2 sm:mb-0"><Smartphone size={18} className="mr-2"/>Devices (IMEIs) Used with Multiple SIMs ({swappyImeis.length})</h3>
          {swappyImeis.length > 0 && <button onClick={handleExportImeiSwaps} className="px-3 py-1.5 text-xs bg-accent text-white rounded-lg hover:bg-accent-dark focus:outline-none focus:ring-2 focus:ring-accent-light flex items-center shadow-sm"><Download size={14} className="mr-1.5"/>Export List</button>}
        </div>
        {swappyImeis.length > 0 ? (
        <>
          <div className="bg-surface shadow-lg rounded-xl border border-neutral-light overflow-x-auto">
            <table className="min-w-full divide-y divide-neutral-light">
              <thead className="bg-neutral-lightest/80 sticky top-0 z-10">
                <tr>{imeiTableHeaders.map(h => <th key={String(h.key)} onClick={() => requestSortImeis(h.key)} className="group px-3 py-2.5 text-left text-xs font-semibold text-textPrimary uppercase tracking-wider cursor-pointer hover:bg-neutral-light transition-colors whitespace-nowrap"><div className="flex items-center">{h.icon && <span className="mr-1.5 text-neutral-DEFAULT group-hover:text-primary">{h.icon}</span>}{h.label} {renderSortIcon(String(h.key), imeiSortConfig)}</div></th>)}</tr>
              </thead>
              <tbody className="bg-surface divide-y divide-neutral-light">
                {paginatedSwappyImeis.map((dev, idx) => (
                  <React.Fragment key={dev.imei}>
                    <tr className={`transition-colors cursor-pointer ${expandedImei?.imei === dev.imei ? 'bg-secondary-lighter/30' : (idx % 2 === 0 ? 'bg-surface' : 'bg-neutral-lightest/60')} hover:bg-secondary-lighter/20`} onClick={() => setExpandedImei(d => d?.imei === dev.imei ? null : dev)}>
                      <td className="px-3 py-2 whitespace-nowrap text-xs text-textPrimary font-medium">{dev.imei}</td>
                      <td className="px-3 py-2 whitespace-nowrap text-xs text-textSecondary text-center">{dev.recordCount}</td>
                      <td className="px-3 py-2 whitespace-nowrap text-xs text-textSecondary text-center">{dev.associatedSims.length}</td>
                      <td className="px-3 py-2 whitespace-nowrap text-xs text-textSecondary text-center">{dev.simChangeHistory.length}</td>
                      <td className="px-3 py-2 whitespace-nowrap text-xs text-textSecondary">{dev.firstSeen ? formatDate(dev.firstSeen.toISOString()) : 'N/A'}</td>
                      <td className="px-3 py-2 whitespace-nowrap text-xs text-textSecondary">{dev.lastSeen ? formatDate(dev.lastSeen.toISOString()) : 'N/A'}</td>
                    </tr>
                    {expandedImei?.imei === dev.imei && (
                      <tr>
                        <td colSpan={imeiTableHeaders.length} className="p-3 bg-secondary-lighter/10 border-l-4 border-secondary-light">
                          <div className="text-xs space-y-2">
                             <div className="flex justify-between items-center mb-1">
                                <h5 className="font-semibold text-textPrimary">Details for IMEI: {dev.imei}</h5>
                                <button onClick={(e) => { e.stopPropagation(); handleExportExpandedImeiDetails(dev);}} className="px-2 py-1 text-[10px] bg-info-lighter/60 text-info-dark rounded-md hover:bg-info-lighter/80 shadow-sm flex items-center"><Download size={12} className="mr-1"/>Export Details</button>
                            </div>
                            <p><strong className="text-neutral-dark">Associated SIMs ({dev.associatedSims.length}):</strong></p>
                            <ul className="list-disc list-inside ml-2 space-y-0.5 max-h-32 overflow-y-auto scrollbar-thin">
                              {dev.associatedSims.slice(0, ROWS_PER_PAGE_DETAILS).map(as => <li key={as.simIdentifier} title={`First: ${as.firstSeen ? formatDate(as.firstSeen.toISOString()) : 'N/A'}, Last: ${as.lastSeen ? formatDate(as.lastSeen.toISOString()) : 'N/A'}`}>{as.simIdentifier} ({as.type}, {as.count} records)</li>)}
                              {dev.associatedSims.length > ROWS_PER_PAGE_DETAILS && <li>...and {dev.associatedSims.length - ROWS_PER_PAGE_DETAILS} more.</li>}
                            </ul>
                            <p className="mt-1"><strong className="text-neutral-dark">SIM Change History ({dev.simChangeHistory.length}):</strong></p>
                            <ul className="list-disc list-inside ml-2 space-y-0.5 max-h-32 overflow-y-auto scrollbar-thin">
                              {dev.simChangeHistory.slice(0, ROWS_PER_PAGE_DETAILS).map(sch => <li key={sch.timestamp.toISOString()+sch.newSim}>On {formatDate(sch.timestamp.toISOString())}: <span className="text-danger-dark">{sch.previousSim || 'N/A'}</span> → <span className="text-success-dark">{sch.newSim}</span></li>)}
                              {dev.simChangeHistory.length > ROWS_PER_PAGE_DETAILS && <li>...and {dev.simChangeHistory.length - ROWS_PER_PAGE_DETAILS} more.</li>}
                            </ul>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
          {totalImeiPages > 1 && ( <div className="flex flex-col sm:flex-row justify-between items-center mt-3 py-2 text-xs"> <span className="text-textSecondary mb-1 sm:mb-0">Page {currentPageImeis} of {totalImeiPages}</span> <div className="flex gap-1.5"> <button onClick={() => setCurrentPageImeis(p => Math.max(1, p - 1))} disabled={currentPageImeis === 1} className="px-2.5 py-1 font-medium bg-surface border rounded-md shadow-sm hover:bg-neutral-lighter disabled:opacity-50">Prev</button> <button onClick={() => setCurrentPageImeis(p => Math.min(totalImeiPages, p + 1))} disabled={currentPageImeis === totalImeiPages} className="px-2.5 py-1 font-medium bg-surface border rounded-md shadow-sm hover:bg-neutral-lighter disabled:opacity-50">Next</button> </div> </div> )}
        </>
        ) : <div className="p-4 bg-neutral-lightest border border-neutral-light rounded-lg text-center text-textSecondary shadow-sm">No devices found to be used with multiple SIMs based on current filters.</div>}
      </div>
    </div>
  );
};

export default DeviceSwapView;

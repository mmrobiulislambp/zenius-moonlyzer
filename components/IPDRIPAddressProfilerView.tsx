
import React, { useState, useMemo } from 'react';
import { MapPin, Info, Globe as GlobeIcon, Users, SmartphoneNfc, BarChart2, Clock, ListFilter, Download, Server as ServerIcon, FileText, ChevronUp, ChevronDown, AlertTriangle, Loader2 } from 'lucide-react';
import { useIPDRContext } from '../contexts/IPDRContext';
import { IPDRRecord } from '../types';
import { formatDate, parseDateTime } from '../utils/cdrUtils';
import { downloadCSV } from '../utils/downloadUtils';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, Cell } from 'recharts';

const ROWS_PER_PAGE = 10;
const CHART_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];

const formatBytes = (bytes?: number, decimals = 2): string => {
  if (bytes === undefined || bytes === null || isNaN(bytes) || bytes === 0) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
};

const getHostnameFromUrl = (url?: string): string | null => {
    if (!url || typeof url !== 'string' || !url.trim()) return null;
    try {
      let fullUrl = url.trim();
      if (!fullUrl.match(/^([a-zA-Z]+:\/\/)/)) {
        if (fullUrl.includes('.') && !fullUrl.includes(' ') && !fullUrl.startsWith('/')) {
          fullUrl = 'http://' + fullUrl;
        } else { return url; }
      }
      const parsedUrl = new URL(fullUrl);
      let hostname = parsedUrl.hostname;
      if (hostname.startsWith('www.')) hostname = hostname.substring(4);
      return hostname;
    } catch (e) {
      const domainMatch = url.match(/^([a-zA-Z0-9-]+(\.[a-zA-Z0-9-]+)+)/);
      if (domainMatch && domainMatch[1]) {
        let hostname = domainMatch[1];
        if (hostname.startsWith('www.')) hostname = hostname.substring(4);
        return hostname;
      }
      return url;
    }
};


interface AssociatedEntity {
    id: string;
    firstSeen?: Date;
    lastSeen?: Date;
    dataVolume: number;
    sessionCount: number;
}

const IPDRIPAddressProfilerView: React.FC = () => {
  const { allIPDRRecords, isLoading: contextIsLoading } = useIPDRContext();
  const [selectedIP, setSelectedIP] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const [recordsPage, setRecordsPage] = useState(1);
  const [recordsSortConfig, setRecordsSortConfig] = useState<{ key: keyof IPDRRecord | string | null; direction: 'ascending' | 'descending' }>({ key: 'startTime', direction: 'descending' });

  const uniqueIPsForDropdown = useMemo(() => {
    const ips = new Set<string>();
    allIPDRRecords.forEach(r => {
        if (r.publicIP && r.publicIP.trim() !== '') ips.add(r.publicIP);
        if (r.serverIP && r.serverIP.trim() !== '') ips.add(r.serverIP);
    });
    return Array.from(ips).sort();
  }, [allIPDRRecords]);

  const profileData = useMemo(() => {
    if (!selectedIP) return null;
    setIsLoading(true);
    
    const relatedRecords = allIPDRRecords.filter(r => r.publicIP === selectedIP || r.serverIP === selectedIP);
    if (relatedRecords.length === 0) {
      setIsLoading(false);
      return { ip: selectedIP, records: [], summary: null, associatedUsers: [], associatedDevices: [], topApps: [], topUrls: [] };
    }

    let totalUplink = 0;
    let totalDownlink = 0;
    let firstSeen: Date | null = null;
    let lastSeen: Date | null = null;
    const uniqueMsisdns = new Set<string>();
    const uniqueImsis = new Set<string>();
    const uniqueImeis = new Set<string>();
    const appDataVolume = new Map<string, { volume: number, count: number }>();
    const urlCounts = new Map<string, number>();
    
    const associatedUsersMap = new Map<string, AssociatedEntity>();
    const associatedDevicesMap = new Map<string, AssociatedEntity>();


    relatedRecords.forEach(r => {
      totalUplink += r.uplinkTrafficByte || 0;
      totalDownlink += r.downlinkTrafficByte || 0;
      
      const recordTime = r.startTime ? parseDateTime(r.startTime) : (r.natBeginTime ? parseDateTime(r.natBeginTime) : null);
      if (recordTime) {
        if (!firstSeen || recordTime < firstSeen) firstSeen = recordTime;
        if (!lastSeen || recordTime > lastSeen) lastSeen = recordTime;
      }

      const identifier = r.msisdn || r.imsi;
      const recordVolume = (r.uplinkTrafficByte || 0) + (r.downlinkTrafficByte || 0);

      if (identifier) {
        if (r.msisdn) uniqueMsisdns.add(r.msisdn);
        if (r.imsi) uniqueImsis.add(r.imsi);
        
        let userEntry = associatedUsersMap.get(identifier);
        if (!userEntry) userEntry = { id: identifier, dataVolume: 0, sessionCount: 0 };
        userEntry.dataVolume += recordVolume;
        userEntry.sessionCount += 1;
        if (recordTime) {
            if (!userEntry.firstSeen || recordTime < userEntry.firstSeen) userEntry.firstSeen = recordTime;
            if (!userEntry.lastSeen || recordTime > userEntry.lastSeen) userEntry.lastSeen = recordTime;
        }
        associatedUsersMap.set(identifier, userEntry);
      }

      if (r.imeisv) {
        uniqueImeis.add(r.imeisv);
        let deviceEntry = associatedDevicesMap.get(r.imeisv);
        if(!deviceEntry) deviceEntry = { id: r.imeisv, dataVolume: 0, sessionCount: 0};
        deviceEntry.dataVolume += recordVolume;
        deviceEntry.sessionCount += 1;
        if (recordTime) {
            if (!deviceEntry.firstSeen || recordTime < deviceEntry.firstSeen) deviceEntry.firstSeen = recordTime;
            if (!deviceEntry.lastSeen || recordTime > deviceEntry.lastSeen) deviceEntry.lastSeen = recordTime;
        }
        associatedDevicesMap.set(r.imeisv, deviceEntry);
      }
      
      if (r.applicationType) {
        const appEntry = appDataVolume.get(r.applicationType) || { volume: 0, count: 0 };
        appEntry.volume += recordVolume;
        appEntry.count += 1;
        appDataVolume.set(r.applicationType, appEntry);
      }
      const hostname = getHostnameFromUrl(r.url);
      if (hostname) urlCounts.set(hostname, (urlCounts.get(hostname) || 0) + 1);
    });

    const summary = {
      ip: selectedIP,
      totalDataVolume: totalUplink + totalDownlink,
      uniqueUsers: uniqueMsisdns.size + uniqueImsis.size, 
      uniqueImeis: uniqueImeis.size,
      firstSeen, lastSeen,
    };
    
    const topApps = Array.from(appDataVolume.entries()).sort((a,b) => b[1].volume - a[1].volume).slice(0,10).map(([name, data]) => ({ name, DataMB: parseFloat((data.volume / (1024*1024)).toFixed(2)), sessions: data.count }));
    const topUrls = Array.from(urlCounts.entries()).sort((a,b) => b[1]-a[1]).slice(0,10).map(([name, value]) => ({ name, visits: value }));

    setIsLoading(false);
    return { ip: selectedIP, records: relatedRecords, summary, associatedUsers: Array.from(associatedUsersMap.values()), associatedDevices: Array.from(associatedDevicesMap.values()), topApps, topUrls };
  }, [selectedIP, allIPDRRecords]);

  const handleIPSelectionChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const ip = e.target.value;
    if (ip) {
        setSelectedIP(ip);
        setRecordsPage(1); 
    } else {
        setSelectedIP(null);
    }
  };

  const sortedUserRecordsForTable = useMemo(() => {
    if (!profileData) return [];
    let sortableItems = [...profileData.records];
    if (recordsSortConfig.key) {
      sortableItems.sort((a, b) => {
        const valA = a[recordsSortConfig.key as keyof IPDRRecord];
        const valB = b[recordsSortConfig.key as keyof IPDRRecord];
        if (['startTime', 'endTime', 'natBeginTime', 'natEndTime'].includes(recordsSortConfig.key as string)) {
          const timeA = valA ? parseDateTime(String(valA))?.getTime() : 0;
          const timeB = valB ? parseDateTime(String(valB))?.getTime() : 0;
          return recordsSortConfig.direction === 'ascending' ? (timeA || 0) - (timeB || 0) : (timeB || 0) - (timeA || 0);
        }
        if (typeof valA === 'number' && typeof valB === 'number') return recordsSortConfig.direction === 'ascending' ? valA - valB : valB - valA;
        if (typeof valA === 'string' && typeof valB === 'string') return recordsSortConfig.direction === 'ascending' ? valA.localeCompare(valB) : valB.localeCompare(valA);
        return 0;
      });
    }
    return sortableItems;
  }, [profileData, recordsSortConfig]);

  const paginatedUserRecords = useMemo(() => {
    const startIndex = (recordsPage - 1) * ROWS_PER_PAGE;
    return sortedUserRecordsForTable.slice(startIndex, startIndex + ROWS_PER_PAGE);
  }, [sortedUserRecordsForTable, recordsPage]);
  const totalRecordPages = Math.ceil(sortedUserRecordsForTable.length / ROWS_PER_PAGE);
  
  const requestSortRecords = (key: keyof IPDRRecord | string) => {
    let direction: 'ascending' | 'descending' = 'ascending';
    if (recordsSortConfig.key === key && recordsSortConfig.direction === 'ascending') direction = 'descending';
    setRecordsSortConfig({ key, direction });
    setRecordsPage(1);
  };
  const renderSortIconRecords = (key: keyof IPDRRecord | string | null) => {
    if (recordsSortConfig.key !== key) return <ListFilter size={14} className="ml-1 opacity-30 group-hover:opacity-100 inline" />;
    return recordsSortConfig.direction === 'ascending' ? <ChevronUp size={14} className="ml-1 text-primary inline" /> : <ChevronDown size={14} className="ml-1 text-primary inline" />;
  };

  const recordTableHeaders: { key: keyof IPDRRecord | string; label: string; icon?: React.ReactNode }[] = [
    { key: 'startTime', label: 'Start Time', icon: <Clock size={14}/> },
    { key: 'endTime', label: 'End Time', icon: <Clock size={14}/> },
    { key: 'msisdn', label: 'MSISDN', icon: <SmartphoneNfc size={14}/> },
    { key: 'imsi', label: 'IMSI', icon: <SmartphoneNfc size={14}/> },
    { key: 'imeisv', label: 'IMEI', icon: <SmartphoneNfc size={14}/> },
    { key: 'applicationType', label: 'App Type', icon: <ListFilter size={14}/> },
    { key: 'url', label: 'URL/Hostname', icon: <GlobeIcon size={14}/> },
    { key: 'uplinkTrafficByte', label: 'Uplink', icon: <BarChart2 size={14}/> },
    { key: 'downlinkTrafficByte', label: 'Downlink', icon: <BarChart2 size={14}/> },
    { key: 'publicIP', label: 'Public IP', icon: <GlobeIcon size={14}/> },
    { key: 'serverIP', label: 'Server IP', icon: <ServerIcon size={14}/> },
    { key: 'fileName', label: 'Source File', icon: <FileText size={14}/> },
  ];

  const exportIPProfileSummary = () => {
    if (!profileData || !profileData.summary) return;
    const { summary, associatedUsers, associatedDevices, topApps, topUrls } = profileData;
    const dataToExport: (string | number)[][] = [
      ["Metric", "Value"],
      ["Searched IP", summary.ip],
      ["Total Data Volume", formatBytes(summary.totalDataVolume)],
      ["Unique Users (MSISDN/IMSI)", summary.uniqueUsers],
      ["Unique IMEIs", summary.uniqueImeis],
      ["First Seen", summary.firstSeen ? formatDate(summary.firstSeen.toISOString()) : 'N/A'],
      ["Last Seen", summary.lastSeen ? formatDate(summary.lastSeen.toISOString()) : 'N/A'],
      ["---Associated Users---", ""],
      ["User ID", "Data Volume", "Sessions", "First Seen", "Last Seen"],
      ...associatedUsers.map(u => [u.id, formatBytes(u.dataVolume), u.sessionCount, u.firstSeen ? formatDate(u.firstSeen.toISOString()) : 'N/A', u.lastSeen ? formatDate(u.lastSeen.toISOString()) : 'N/A']),
      ["---Associated Devices---", ""],
      ["Device IMEI", "Data Volume", "Sessions", "First Seen", "Last Seen"],
      ...associatedDevices.map(d => [d.id, formatBytes(d.dataVolume), d.sessionCount, d.firstSeen ? formatDate(d.firstSeen.toISOString()) : 'N/A', d.lastSeen ? formatDate(d.lastSeen.toISOString()) : 'N/A']),
      ["---Top Apps by Data Volume---", ""],
      ["Application", "Data (MB)", "Sessions"],
      ...topApps.map(app => [app.name, app.DataMB, app.sessions]),
      ["---Top URLs by Visits---", ""],
      ["URL/Hostname", "Visit Count"],
      ...topUrls.map(url => [url.name, url.visits]),
    ];
    downloadCSV(`ip_profile_summary_${summary.ip}.csv`, dataToExport.map(row => row.map(String)), []);
  };
  
  const exportIPProfileRecords = () => {
    if (!profileData || profileData.records.length === 0) return;
    const headers = Object.keys(profileData.records[0]).filter(k => k !== 'id' && k !== 'sourceFileId' && k !== 'rowIndex');
    const data = profileData.records.map(rec => headers.map(h => {
        const val = rec[h as keyof IPDRRecord];
        if (['startTime', 'endTime', 'natBeginTime', 'natEndTime'].includes(h)) return val ? formatDate(String(val)) : 'N/A';
        if (['uplinkTrafficByte', 'downlinkTrafficByte'].includes(h)) return formatBytes(Number(val));
        return String(val ?? 'N/A');
    }));
    downloadCSV(`ip_profile_records_${profileData.ip}.csv`, data, headers);
  };


  if (contextIsLoading && allIPDRRecords.length === 0) {
    return <div className="flex justify-center items-center h-64"><Loader2 className="h-12 w-12 animate-spin text-primary" /><p className="ml-3 text-textSecondary">Loading IPDR data...</p></div>;
  }
  
  return (
    <div className="space-y-6">
      <div className="p-4 sm:p-5 bg-surface border border-neutral-light rounded-xl shadow-xl">
        <div className="flex items-center text-xl sm:text-2xl font-semibold text-textPrimary mb-1">
          <MapPin size={24} className="mr-2.5 text-primary" /> IP Address Profiler
        </div>
        <p className="text-sm text-textSecondary">Select an IP address to view its activity profile.</p>
        <div className="mt-4">
          <label htmlFor="ipAddressSelector" className="block text-xs font-medium text-textSecondary mb-1">Select IP Address:</label>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <GlobeIcon className="h-4 w-4 text-neutral-DEFAULT" />
            </div>
            <select
              id="ipAddressSelector"
              value={selectedIP || ''}
              onChange={handleIPSelectionChange}
              disabled={isLoading || uniqueIPsForDropdown.length === 0}
              className="w-full p-2.5 pl-10 pr-8 border border-neutral-light rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-light focus:border-primary-light text-sm bg-surface shadow-sm appearance-none"
            >
              <option value="">-- Select IP --</option>
              {uniqueIPsForDropdown.map(ip => (
                <option key={ip} value={ip}>{ip}</option>
              ))}
            </select>
            <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                <ChevronDown className="h-4 w-4 text-neutral-DEFAULT" />
            </div>
          </div>
           {uniqueIPsForDropdown.length === 0 && !contextIsLoading && <p className="text-xs text-warning-dark mt-1">No IP addresses found in the loaded data.</p>}
        </div>
      </div>

      {isLoading && <div className="flex justify-center items-center h-40"><Loader2 className="h-10 w-10 animate-spin text-primary" /><p className="ml-3 text-textSecondary">Profiling IP...</p></div>}
      
      {!isLoading && selectedIP && !profileData?.summary && (
        <div className="p-6 bg-warning-lighter border border-warning-light rounded-lg text-center text-warning-darker flex flex-col items-center justify-center min-h-[100px] shadow-md">
            <AlertTriangle size={24} className="mb-2" />
            <p>No records found for IP Address: <span className="font-semibold">{selectedIP}</span>.</p>
        </div>
      )}

      {profileData && profileData.summary && !isLoading && (
        <>
          <div className="p-4 sm:p-5 bg-surface border border-neutral-light rounded-xl shadow-lg">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-3">
                <h3 className="text-base sm:text-lg font-semibold text-textPrimary">Summary for IP: <span className="text-primary-dark">{profileData.summary.ip}</span></h3>
                <button onClick={exportIPProfileSummary} className="mt-2 sm:mt-0 px-3 py-1.5 text-xs bg-secondary text-white rounded-lg hover:bg-secondary-dark flex items-center shadow-sm"><Download size={14} className="mr-1.5"/>Export Summary</button>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 text-xs">
              <div className="p-2 bg-neutral-lightest rounded border border-neutral-light shadow-sm"><strong className="block text-neutral-dark">Total Data:</strong> {formatBytes(profileData.summary.totalDataVolume)}</div>
              <div className="p-2 bg-neutral-lightest rounded border border-neutral-light shadow-sm"><strong className="block text-neutral-dark">Unique Users:</strong> {profileData.summary.uniqueUsers}</div>
              <div className="p-2 bg-neutral-lightest rounded border border-neutral-light shadow-sm"><strong className="block text-neutral-dark">Unique IMEIs:</strong> {profileData.summary.uniqueImeis}</div>
              <div className="p-2 bg-neutral-lightest rounded border border-neutral-light shadow-sm col-span-2 sm:col-span-1 lg:col-span-1"><strong className="block text-neutral-dark">First Seen:</strong> {profileData.summary.firstSeen ? formatDate(profileData.summary.firstSeen.toISOString()) : 'N/A'}</div>
              <div className="p-2 bg-neutral-lightest rounded border border-neutral-light shadow-sm col-span-2 sm:col-span-1 lg:col-span-1"><strong className="block text-neutral-dark">Last Seen:</strong> {profileData.summary.lastSeen ? formatDate(profileData.summary.lastSeen.toISOString()) : 'N/A'}</div>
            </div>
             <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                <div className="bg-neutral-lightest/50 p-3 rounded border border-neutral-light">
                    <h4 className="text-xs font-semibold text-textPrimary mb-1">Top 5 Associated Users (MSISDN/IMSI) by Volume</h4>
                    {profileData.associatedUsers.length > 0 ? <ul className="text-[11px] space-y-0.5 max-h-28 overflow-y-auto scrollbar-thin">{profileData.associatedUsers.sort((a,b)=>b.dataVolume-a.dataVolume).slice(0,5).map(u => <li key={u.id} title={`Sessions: ${u.sessionCount}, First: ${u.firstSeen ? formatDate(u.firstSeen.toISOString()):'N/A'}, Last: ${u.lastSeen ? formatDate(u.lastSeen.toISOString()):'N/A'}`}>{u.id} ({formatBytes(u.dataVolume)})</li>)}</ul> : <p className="text-[11px] text-textSecondary">None</p>}
                </div>
                <div className="bg-neutral-lightest/50 p-3 rounded border border-neutral-light">
                    <h4 className="text-xs font-semibold text-textPrimary mb-1">Top 5 Associated Devices (IMEI) by Volume</h4>
                    {profileData.associatedDevices.length > 0 ? <ul className="text-[11px] space-y-0.5 max-h-28 overflow-y-auto scrollbar-thin">{profileData.associatedDevices.sort((a,b)=>b.dataVolume-a.dataVolume).slice(0,5).map(d => <li key={d.id} title={`Sessions: ${d.sessionCount}, First: ${d.firstSeen ? formatDate(d.firstSeen.toISOString()):'N/A'}, Last: ${d.lastSeen ? formatDate(d.lastSeen.toISOString()):'N/A'}`}>{d.id} ({formatBytes(d.dataVolume)})</li>)}</ul> : <p className="text-[11px] text-textSecondary">None</p>}
                </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                <div className="bg-neutral-lightest/50 p-3 rounded border border-neutral-light">
                    <h4 className="text-xs font-semibold text-textPrimary mb-1">Top Apps (by Data Volume)</h4>
                    {profileData.topApps.length > 0 ? (
                        <ResponsiveContainer width="100%" height={150}>
                             <BarChart data={profileData.topApps} layout="vertical" margin={{top:5, right:10, left:60, bottom:5}}>
                                <CartesianGrid strokeDasharray="2 2" opacity={0.3}/>
                                <XAxis type="number" dataKey="DataMB" tick={{fontSize:8}} unit="MB" />
                                <YAxis type="category" dataKey="name" tick={{fontSize:8, width:55}} width={60} interval={0}/>
                                <Tooltip wrapperStyle={{fontSize: "10px"}} formatter={(value:number) => `${value.toFixed(2)} MB`}/>
                                <Bar dataKey="DataMB" fill={CHART_COLORS[1]} radius={[0,3,3,0]} barSize={10}/>
                             </BarChart>
                        </ResponsiveContainer>
                    ): <p className="text-[11px] text-textSecondary text-center py-2">No app data.</p>}
                </div>
                <div className="bg-neutral-lightest/50 p-3 rounded border border-neutral-light">
                    <h4 className="text-xs font-semibold text-textPrimary mb-1">Top URLs/Hostnames (by Access Count)</h4>
                    {profileData.topUrls.length > 0 ? (
                         <ResponsiveContainer width="100%" height={150}>
                             <BarChart data={profileData.topUrls} layout="vertical" margin={{top:5, right:10, left:60, bottom:5}}>
                                <CartesianGrid strokeDasharray="2 2" opacity={0.3}/>
                                <XAxis type="number" dataKey="visits" tick={{fontSize:8}} allowDecimals={false}/>
                                <YAxis type="category" dataKey="name" tick={{fontSize:8, width:55}} width={60} interval={0}/>
                                <Tooltip wrapperStyle={{fontSize: "12px"}}/>
                                <Bar dataKey="visits" name="Accesses" fill={CHART_COLORS[2]} radius={[0,3,3,0]} barSize={10}/>
                             </BarChart>
                        </ResponsiveContainer>
                    ): <p className="text-[11px] text-textSecondary text-center py-2">No URL data.</p>}
                </div>
            </div>
          </div>

          <div className="p-4 sm:p-5 bg-surface border border-neutral-light rounded-xl shadow-xl">
            <div className="flex justify-between items-center mb-3">
              <h3 className="text-md sm:text-lg font-semibold text-textPrimary">Detailed IPDR Records ({sortedUserRecordsForTable.length})</h3>
              {sortedUserRecordsForTable.length > 0 && <button onClick={exportIPProfileRecords} className="px-3 py-1.5 text-xs bg-info-lighter text-info-dark rounded-lg hover:bg-info-light/70 font-medium flex items-center shadow-sm"><Download size={14} className="mr-1.5"/>Export Records</button>}
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-neutral-light">
                <thead className="bg-neutral-lightest sticky top-0">
                  <tr>{recordTableHeaders.map(h => <th key={h.key as string} onClick={() => requestSortRecords(h.key)} className="group px-3 py-2.5 text-left text-xs font-semibold text-textPrimary uppercase tracking-wider cursor-pointer hover:bg-neutral-lighter"><div className="flex items-center">{h.icon && <span className="mr-1.5 text-neutral-DEFAULT group-hover:text-primary">{h.icon}</span>}{h.label}{renderSortIconRecords(h.key)}</div></th>)}</tr>
                </thead>
                <tbody className="bg-surface divide-y divide-neutral-light">
                  {paginatedUserRecords.map((rec, idx) => (
                    <tr key={rec.id + idx} className="hover:bg-neutral-lightest/50">
                      {recordTableHeaders.map(header => {
                        let val = rec[header.key as keyof IPDRRecord];
                         if (header.key === 'totalTrafficBytes') { val = (rec.uplinkTrafficByte || 0) + (rec.downlinkTrafficByte || 0); }
                        let displayVal = String(val ?? 'N/A');
                        if (['startTime', 'endTime', 'natBeginTime', 'natEndTime'].includes(header.key as string) && val) displayVal = formatDate(String(val));
                        if (['uplinkTrafficByte', 'downlinkTrafficByte', 'totalTrafficBytes'].includes(header.key as string)) displayVal = formatBytes(Number(val));
                        if (header.key === 'url' && val) displayVal = getHostnameFromUrl(String(val)) || String(val);
                        return <td key={String(header.key)} className="px-3 py-2 whitespace-nowrap text-xs text-textSecondary truncate max-w-xs" title={String(val ?? '')}>{displayVal}</td>
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {totalRecordPages > 1 && (
              <div className="flex flex-col sm:flex-row justify-between items-center mt-3 pt-2 border-t border-neutral-light text-xs">
                <span className="text-textSecondary mb-1 sm:mb-0">Page {recordsPage} of {totalRecordPages}</span>
                <div className="flex gap-1.5">
                  <button onClick={() => setRecordsPage(p => Math.max(1, p - 1))} disabled={recordsPage === 1} className="px-2.5 py-1 font-medium bg-surface border rounded-md shadow-sm hover:bg-neutral-lighter disabled:opacity-50">Prev</button>
                  <button onClick={() => setRecordsPage(p => Math.min(totalRecordPages, p + 1))} disabled={recordsPage === totalRecordPages} className="px-2.5 py-1 font-medium bg-surface border rounded-md shadow-sm hover:bg-neutral-lighter disabled:opacity-50">Next</button>
                </div>
              </div>
            )}
          </div>
        </>
      )}
       {!isLoading && !selectedIP && (
         <div className="p-6 bg-info-lighter border border-info-light rounded-lg text-center text-info-dark flex flex-col items-center justify-center min-h-[100px] shadow-md">
            <Info size={24} className="mb-2" />
            <p>Please select an IP address from the dropdown to view its profile.</p>
        </div>
      )}
    </div>
  );
};

export default IPDRIPAddressProfilerView;


import React, { useState, useMemo } from 'react';
import { UserSearch, Info, Activity, Globe as GlobeIcon, SmartphoneNfc, ListFilter, Download, BarChart2, Clock, ChevronDown, ChevronUp, Server as ServerIcon, FileText } from 'lucide-react';
import { useIPDRContext } from '../contexts/IPDRContext';
import { IPDRRecord } from '../types';
import { formatDate, parseDateTime } from '../utils/cdrUtils';
import { downloadCSV } from '../utils/downloadUtils';

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
      } else {
        return url;
      }
    }
    const parsedUrl = new URL(fullUrl);
    let hostname = parsedUrl.hostname;
    if (hostname.startsWith('www.')) {
      hostname = hostname.substring(4);
    }
    return hostname;
  } catch (e) {
    const domainMatch = url.match(/^([a-zA-Z0-9-]+(\.[a-zA-Z0-9-]+)+)/);
    if (domainMatch && domainMatch[1]) {
      let hostname = domainMatch[1];
      if (hostname.startsWith('www.')) {
        hostname = hostname.substring(4);
      }
      return hostname;
    }
    return url;
  }
};

const IPDRUserActivityView: React.FC = () => {
  const { filteredIPDRRecords, getUniqueIPDRValues } = useIPDRContext();
  const [selectedIdentifier, setSelectedIdentifier] = useState<string | null>(null);
  const [identifierType, setIdentifierType] = useState<'msisdn' | 'imsi'>('msisdn');
  
  const [currentPage, setCurrentPage] = useState(1);
  const [sortConfig, setSortConfig] = useState<{ key: keyof IPDRRecord | string | null; direction: 'ascending' | 'descending' }>({ key: 'startTime', direction: 'descending' });


  const uniqueIdentifiers = useMemo(() => {
    return getUniqueIPDRValues(identifierType).filter(id => id && id.trim() !== '');
  }, [getUniqueIPDRValues, identifierType]);

  const userRecords = useMemo(() => {
    if (!selectedIdentifier) return [];
    return filteredIPDRRecords.filter(r => r[identifierType] === selectedIdentifier);
  }, [filteredIPDRRecords, selectedIdentifier, identifierType]);

  const userSummary = useMemo(() => {
    if (userRecords.length === 0) return null;
    let totalSessions = userRecords.length;
    let totalUplink = 0;
    let totalDownlink = 0;
    let firstSeen: Date | null = null;
    let lastSeen: Date | null = null;
    const appCounts = new Map<string, number>();
    const urlCounts = new Map<string, number>();
    const associatedIPs = new Set<string>();
    const associatedIMEIs = new Set<string>();

    userRecords.forEach(r => {
      totalUplink += r.uplinkTrafficByte || 0;
      totalDownlink += r.downlinkTrafficByte || 0;
      const recordTime = r.startTime ? parseDateTime(r.startTime) : (r.natBeginTime ? parseDateTime(r.natBeginTime) : null);
      if (recordTime) {
        if (!firstSeen || recordTime < firstSeen) firstSeen = recordTime;
        if (!lastSeen || recordTime > lastSeen) lastSeen = recordTime;
      }
      if (r.applicationType) appCounts.set(r.applicationType, (appCounts.get(r.applicationType) || 0) + 1);
      const hostname = getHostnameFromUrl(r.url);
      if (hostname) urlCounts.set(hostname, (urlCounts.get(hostname) || 0) + 1);
      if (r.publicIP) associatedIPs.add(r.publicIP);
      if (r.imeisv) associatedIMEIs.add(r.imeisv);
    });

    const topApps = Array.from(appCounts.entries()).sort((a,b) => b[1]-a[1]).slice(0,5).map(([name, value]) => ({ name, value }));
    const topURLs = Array.from(urlCounts.entries()).sort((a,b) => b[1]-a[1]).slice(0,5).map(([name, value]) => ({ name, value }));
    
    return { totalSessions, totalUplink, totalDownlink, firstSeen, lastSeen, topApps, topURLs, associatedIPs: Array.from(associatedIPs), associatedIMEIs: Array.from(associatedIMEIs) };
  }, [userRecords]);

  const sortedUserRecords = useMemo(() => {
    let sortableItems = [...userRecords];
    if (sortConfig.key) {
      sortableItems.sort((a, b) => {
        const valA = a[sortConfig.key as keyof IPDRRecord];
        const valB = b[sortConfig.key as keyof IPDRRecord];
        if (['startTime', 'endTime', 'natBeginTime', 'natEndTime'].includes(sortConfig.key as string)) {
          const timeA = valA ? parseDateTime(String(valA))?.getTime() : 0;
          const timeB = valB ? parseDateTime(String(valB))?.getTime() : 0;
          return sortConfig.direction === 'ascending' ? (timeA || 0) - (timeB || 0) : (timeB || 0) - (timeA || 0);
        }
        if (typeof valA === 'number' && typeof valB === 'number') return sortConfig.direction === 'ascending' ? valA - valB : valB - valA;
        if (typeof valA === 'string' && typeof valB === 'string') return sortConfig.direction === 'ascending' ? valA.localeCompare(valB) : valB.localeCompare(valA);
        return 0;
      });
    }
    return sortableItems;
  }, [userRecords, sortConfig]);

  const paginatedUserRecords = useMemo(() => {
    const startIndex = (currentPage - 1) * ROWS_PER_PAGE;
    return sortedUserRecords.slice(startIndex, startIndex + ROWS_PER_PAGE);
  }, [sortedUserRecords, currentPage]);
  const totalPages = Math.ceil(sortedUserRecords.length / ROWS_PER_PAGE);

  const requestSort = (key: keyof IPDRRecord | string) => {
    let direction: 'ascending' | 'descending' = 'ascending';
    if (sortConfig.key === key && sortConfig.direction === 'ascending') direction = 'descending';
    setSortConfig({ key, direction });
    setCurrentPage(1);
  };
  const renderSortIcon = (key: keyof IPDRRecord | string | null) => {
    if (sortConfig.key !== key) return <ListFilter size={14} className="ml-1 opacity-30 group-hover:opacity-100 inline" />;
    return sortConfig.direction === 'ascending' ? <ChevronUp size={14} className="ml-1 text-primary inline" /> : <ChevronDown size={14} className="ml-1 text-primary inline" />;
  };

  const handleExportUserRecords = () => {
    if (!selectedIdentifier || userRecords.length === 0) return;
    const headers = Object.keys(userRecords[0]).filter(k => k !== 'id' && k !== 'sourceFileId' && k !== 'rowIndex');
    const data = userRecords.map(rec => headers.map(h => {
        const val = rec[h as keyof IPDRRecord];
        if (['startTime', 'endTime', 'natBeginTime', 'natEndTime'].includes(h)) return val ? formatDate(String(val)) : 'N/A';
        if (['uplinkTrafficByte', 'downlinkTrafficByte'].includes(h)) return formatBytes(Number(val));
        return String(val ?? 'N/A');
    }));
    downloadCSV(`user_activity_${identifierType}_${selectedIdentifier}.csv`, data, headers);
  };

  const tableHeaders: { key: keyof IPDRRecord | string; label: string; icon?: React.ReactNode }[] = [
    { key: 'startTime', label: 'Start Time', icon: <Clock size={14}/> },
    { key: 'endTime', label: 'End Time', icon: <Clock size={14}/> },
    { key: 'applicationType', label: 'App Type', icon: <ListFilter size={14}/> },
    { key: 'url', label: 'URL/Hostname', icon: <GlobeIcon size={14}/> },
    { key: 'totalTrafficBytes', label: 'Data Volume', icon: <BarChart2 size={14}/> }, // Assuming totalTrafficBytes is added to IPDRRecord or calculated
    { key: 'serverIP', label: 'Server IP', icon: <ServerIcon size={14}/> },
    { key: 'publicIP', label: 'Public IP', icon: <GlobeIcon size={14}/> },
    { key: 'imeisv', label: 'IMEI', icon: <SmartphoneNfc size={14}/> },
    { key: 'fileName', label: 'Source File', icon: <FileText size={14}/> },
  ];


  if (filteredIPDRRecords.length === 0 && Boolean(!useIPDRContext().isLoading)) { 
     return <div className="p-6 bg-info-lighter border border-info-light rounded-lg text-center text-info-dark flex flex-col items-center justify-center min-h-[150px] shadow-md"><Info size={28} className="mb-2" /><p className="font-medium">No IPDR data loaded or matched by current global filters.</p></div>;
  }


  return (
    <div className="space-y-6">
      <div className="p-4 sm:p-5 bg-surface border border-neutral-light rounded-xl shadow-xl">
        <div className="flex items-center text-xl sm:text-2xl font-semibold text-textPrimary mb-1">
          <UserSearch size={24} className="mr-2.5 text-primary" /> IPDR User Activity Explorer
        </div>
        <p className="text-sm text-textSecondary">Select a user by MSISDN or IMSI to view their detailed IPDR activity.</p>
        
        <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
          <div>
            <label htmlFor="identifierType" className="block text-xs font-medium text-textSecondary mb-1">Identifier Type:</label>
            <select id="identifierType" value={identifierType} onChange={e => { setIdentifierType(e.target.value as 'msisdn' | 'imsi'); setSelectedIdentifier(null); }} className="w-full p-2 border border-neutral-light rounded-md focus:ring-2 focus:ring-primary-light focus:border-primary-light text-sm bg-surface shadow-sm">
              <option value="msisdn">MSISDN</option>
              <option value="imsi">IMSI</option>
            </select>
          </div>
          <div className="md:col-span-2">
            <label htmlFor="selectedIdentifier" className="block text-xs font-medium text-textSecondary mb-1">Select {identifierType.toUpperCase()}:</label>
            <select id="selectedIdentifier" value={selectedIdentifier || ''} onChange={e => setSelectedIdentifier(e.target.value || null)} disabled={uniqueIdentifiers.length === 0} className="w-full p-2 border border-neutral-light rounded-md focus:ring-2 focus:ring-primary-light focus:border-primary-light text-sm bg-surface shadow-sm disabled:bg-neutral-lighter">
              <option value="">-- Select {identifierType.toUpperCase()} --</option>
              {uniqueIdentifiers.map(id => <option key={id} value={id}>{id}</option>)}
            </select>
          </div>
        </div>
      </div>

      {selectedIdentifier && userSummary && (
        <div className="p-4 sm:p-5 bg-surface border border-neutral-light rounded-xl shadow-lg">
          <h3 className="text-base sm:text-lg font-semibold text-textPrimary mb-3">Summary for {identifierType.toUpperCase()}: <span className="text-primary-dark">{selectedIdentifier}</span></h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 text-xs">
            <div className="p-2 bg-neutral-lightest rounded border border-neutral-light shadow-sm"><strong className="block text-neutral-dark">Total Sessions:</strong> {userSummary.totalSessions.toLocaleString()}</div>
            <div className="p-2 bg-neutral-lightest rounded border border-neutral-light shadow-sm"><strong className="block text-neutral-dark">Total Uplink:</strong> {formatBytes(userSummary.totalUplink)}</div>
            <div className="p-2 bg-neutral-lightest rounded border border-neutral-light shadow-sm"><strong className="block text-neutral-dark">Total Downlink:</strong> {formatBytes(userSummary.totalDownlink)}</div>
            <div className="p-2 bg-neutral-lightest rounded border border-neutral-light shadow-sm"><strong className="block text-neutral-dark">Total Data:</strong> {formatBytes(userSummary.totalUplink + userSummary.totalDownlink)}</div>
            <div className="p-2 bg-neutral-lightest rounded border border-neutral-light shadow-sm"><strong className="block text-neutral-dark">First Seen:</strong> {userSummary.firstSeen ? formatDate(userSummary.firstSeen.toISOString()) : 'N/A'}</div>
            <div className="p-2 bg-neutral-lightest rounded border border-neutral-light shadow-sm"><strong className="block text-neutral-dark">Last Seen:</strong> {userSummary.lastSeen ? formatDate(userSummary.lastSeen.toISOString()) : 'N/A'}</div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 mt-3 text-xs">
            <div className="p-2 bg-neutral-lightest rounded border border-neutral-light shadow-sm"><strong className="block text-neutral-dark">Associated Public IPs ({userSummary.associatedIPs.length}):</strong> <span className="truncate" title={userSummary.associatedIPs.join(', ')}>{userSummary.associatedIPs.slice(0,3).join(', ')}{userSummary.associatedIPs.length > 3 ? '...' : ''}</span></div>
            <div className="p-2 bg-neutral-lightest rounded border border-neutral-light shadow-sm"><strong className="block text-neutral-dark">Associated IMEIs ({userSummary.associatedIMEIs.length}):</strong> <span className="truncate" title={userSummary.associatedIMEIs.join(', ')}>{userSummary.associatedIMEIs.slice(0,3).join(', ')}{userSummary.associatedIMEIs.length > 3 ? '...' : ''}</span></div>
          </div>
           <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                <div className="bg-neutral-lightest/50 p-3 rounded border border-neutral-light">
                    <h4 className="text-xs font-semibold text-textPrimary mb-2">Top 5 Apps (by session count)</h4>
                    {userSummary.topApps.length > 0 ? <ul className="text-[11px] space-y-0.5">{userSummary.topApps.map(app => <li key={app.name} className="flex justify-between"><span>{app.name}</span> <span>{app.value} sessions</span></li>)}</ul> : <p className="text-[11px] text-textSecondary">No app data.</p>}
                </div>
                <div className="bg-neutral-lightest/50 p-3 rounded border border-neutral-light">
                    <h4 className="text-xs font-semibold text-textPrimary mb-2">Top 5 URLs (by session count)</h4>
                     {userSummary.topURLs.length > 0 ? <ul className="text-[11px] space-y-0.5">{userSummary.topURLs.map(url => <li key={url.name} className="flex justify-between truncate" title={url.name}><span className="truncate">{url.name}</span> <span>{url.value} sessions</span></li>)}</ul> : <p className="text-[11px] text-textSecondary">No URL data.</p>}
                </div>
            </div>
        </div>
      )}

      {selectedIdentifier && userRecords.length > 0 && (
        <div className="p-4 sm:p-5 bg-surface border border-neutral-light rounded-xl shadow-xl">
          <div className="flex justify-between items-center mb-3">
            <h3 className="text-md sm:text-lg font-semibold text-textPrimary">Activity Records for {selectedIdentifier} ({sortedUserRecords.length})</h3>
            <button onClick={handleExportUserRecords} className="px-3 py-1.5 text-xs bg-secondary text-white rounded-lg hover:bg-secondary-dark flex items-center shadow-sm"><Download size={14} className="mr-1.5"/>Export Records</button>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-neutral-light">
              <thead className="bg-neutral-lightest sticky top-0">
                <tr>{tableHeaders.map(h => <th key={h.key as string} onClick={() => requestSort(h.key)} className="group px-3 py-2.5 text-left text-xs font-semibold text-textPrimary uppercase tracking-wider cursor-pointer hover:bg-neutral-lighter"><div className="flex items-center">{h.icon && <span className="mr-1.5 text-neutral-DEFAULT group-hover:text-primary">{h.icon}</span>}{h.label}{renderSortIcon(h.key)}</div></th>)}</tr>
              </thead>
              <tbody className="bg-surface divide-y divide-neutral-light">
                {paginatedUserRecords.map((rec, idx) => (
                  <tr key={rec.id + idx} className="hover:bg-neutral-lightest/50">
                    {tableHeaders.map(header => {
                        // For totalTrafficBytes, it's not directly in IPDRRecord, so we calculate it or it's added in userRecords calculation.
                        // Assuming 'totalTrafficBytes' is dynamically added to the records for this view, or needs to be calculated here if not.
                        // For now, if header.key is 'totalTrafficBytes', we'll calculate it on the fly.
                        let val = rec[header.key as keyof IPDRRecord];
                        if (header.key === 'totalTrafficBytes') {
                            val = (rec.uplinkTrafficByte || 0) + (rec.downlinkTrafficByte || 0);
                        }
                        
                        let displayVal = String(val ?? 'N/A');
                        if (['startTime', 'endTime', 'natBeginTime', 'natEndTime'].includes(header.key as string) && val) displayVal = formatDate(String(val));
                        if (header.key === 'totalTrafficBytes') displayVal = formatBytes(Number(val)); // Use 'totalTrafficBytes' after potential calculation
                        if (header.key === 'url' && val) displayVal = getHostnameFromUrl(String(val)) || String(val);
                        return <td key={String(header.key)} className="px-3 py-2 whitespace-nowrap text-xs text-textSecondary truncate max-w-xs" title={String(val ?? '')}>{displayVal}</td>
                    })}
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
      )}
      {selectedIdentifier && userRecords.length === 0 && Boolean(!useIPDRContext().isLoading) && (
         <div className="p-6 bg-neutral-lightest border border-neutral-light rounded-lg text-center text-textSecondary flex flex-col items-center justify-center min-h-[100px] shadow-md">
            <Info size={24} className="mb-2 text-neutral-DEFAULT" />
            <p>No IPDR records found for {identifierType.toUpperCase()} <span className="font-semibold text-textPrimary">{selectedIdentifier}</span> with current global filters.</p>
        </div>
      )}
       {!selectedIdentifier && Boolean(!useIPDRContext().isLoading) && filteredIPDRRecords.length > 0 && (
         <div className="p-6 bg-info-lighter border border-info-light rounded-lg text-center text-info-dark flex flex-col items-center justify-center min-h-[100px] shadow-md">
            <Info size={24} className="mb-2" />
            <p>Please select an {identifierType.toUpperCase()} from the dropdown to view activity details.</p>
        </div>
       )}
    </div>
  );
};

export default IPDRUserActivityView;

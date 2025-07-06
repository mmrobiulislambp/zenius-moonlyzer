
import React, { useMemo, useState } from 'react';
import { Network, Download, Info, AlertTriangle, Loader2, ListFilter, BarChart2, PieChart as PieChartIcon, Users as UsersIcon, SmartphoneNfc, Clock, FileText, ChevronUp, ChevronDown, User, Smartphone, X } from 'lucide-react';
import { useIPDRContext } from '../contexts/IPDRContext';
import { IPDRRecord } from '../types';
import { formatDate, parseDateTime, formatDateFromTimestamp } from '../utils/cdrUtils';
import { downloadCSV } from '../utils/downloadUtils';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, Cell, PieChart, Pie } from 'recharts';

const CHART_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];
const ROWS_PER_PAGE = 15;

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

interface DomainActivitySummary {
  domain: string;
  visitCount: number;
  totalDataVolume: number;
  uniqueUsers: Set<string>;
  uniqueDevices: Set<string>;
  firstSeen?: Date;
  lastSeen?: Date;
}

interface AssociatedEntityDetail {
    id: string;
    firstSeenWithDomain?: Date;
    lastSeenWithDomain?: Date;
    sessionsWithDomain: number;
    dataVolumeWithDomain: number;
}

interface SelectedDomainModalData {
    domain: string;
    users: AssociatedEntityDetail[];
    devices: AssociatedEntityDetail[];
}

const IPDRDomainAnalysisView: React.FC = () => {
  const { filteredIPDRRecords, isLoading: contextIsLoading, error: contextError, uploadedIPDRFiles } = useIPDRContext();
  const [currentPage, setCurrentPage] = useState(1);
  const [sortConfig, setSortConfig] = useState<{ key: keyof DomainActivitySummary | string; direction: 'ascending' | 'descending' }>({ key: 'visitCount', direction: 'descending' });

  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [selectedDomainData, setSelectedDomainData] = useState<SelectedDomainModalData | null>(null);


  const domainSummaryData = useMemo((): DomainActivitySummary[] => {
    const summaryMap = new Map<string, DomainActivitySummary>();

    filteredIPDRRecords.forEach(record => {
      const hostname = getHostnameFromUrl(record.url);
      if (!hostname) return;

      let entry = summaryMap.get(hostname);
      if (!entry) {
        entry = {
          domain: hostname,
          visitCount: 0,
          totalDataVolume: 0,
          uniqueUsers: new Set<string>(),
          uniqueDevices: new Set<string>(),
        };
      }

      entry.visitCount += 1;
      entry.totalDataVolume += (record.uplinkTrafficByte || 0) + (record.downlinkTrafficByte || 0);
      
      const userIdMsisdn = record.msisdn;
      const userIdImsi = record.imsi;
      if (userIdMsisdn && userIdMsisdn.trim() !== '') entry.uniqueUsers.add(userIdMsisdn);
      if (userIdImsi && userIdImsi.trim() !== '') entry.uniqueUsers.add(userIdImsi); // Consider IMSI as a user identifier
      if (record.imeisv && record.imeisv.trim() !== '') entry.uniqueDevices.add(record.imeisv);


      const recordTime = record.startTime ? parseDateTime(record.startTime) : (record.natBeginTime ? parseDateTime(record.natBeginTime) : null);
      if (recordTime) {
        if (!entry.firstSeen || recordTime < entry.firstSeen) entry.firstSeen = recordTime;
        if (!entry.lastSeen || recordTime > entry.lastSeen) entry.lastSeen = recordTime;
      }
      summaryMap.set(hostname, entry);
    });
    return Array.from(summaryMap.values());
  }, [filteredIPDRRecords]);

  const handleDomainClick = (domainName: string) => {
    const domainSpecificRecords = filteredIPDRRecords.filter(record => getHostnameFromUrl(record.url) === domainName);
    
    const usersMap = new Map<string, AssociatedEntityDetail>();
    const devicesMap = new Map<string, AssociatedEntityDetail>();

    domainSpecificRecords.forEach(record => {
        const recordTime = record.startTime ? parseDateTime(record.startTime) : (record.natBeginTime ? parseDateTime(record.natBeginTime) : null);
        const recordVolume = (record.uplinkTrafficByte || 0) + (record.downlinkTrafficByte || 0);

        const processEntity = (map: Map<string, AssociatedEntityDetail>, id: string) => {
            if (!id || id.trim() === "") return;
            let entity = map.get(id);
            if (!entity) {
                entity = { id, sessionsWithDomain: 0, dataVolumeWithDomain: 0 };
            }
            entity.sessionsWithDomain += 1;
            entity.dataVolumeWithDomain += recordVolume;
            if (recordTime) {
                if (!entity.firstSeenWithDomain || recordTime < entity.firstSeenWithDomain) entity.firstSeenWithDomain = recordTime;
                if (!entity.lastSeenWithDomain || recordTime > entity.lastSeenWithDomain) entity.lastSeenWithDomain = recordTime;
            }
            map.set(id, entity);
        };

        if (record.msisdn && record.msisdn.trim() !== '') processEntity(usersMap, record.msisdn);
        if (record.imsi && record.imsi.trim() !== '') processEntity(usersMap, record.imsi);
        if (record.imeisv && record.imeisv.trim() !== '') processEntity(devicesMap, record.imeisv);
    });
    
    setSelectedDomainData({
        domain: domainName,
        users: Array.from(usersMap.values()).sort((a,b) => b.sessionsWithDomain - a.sessionsWithDomain),
        devices: Array.from(devicesMap.values()).sort((a,b) => b.sessionsWithDomain - a.sessionsWithDomain),
    });
    setIsDetailModalOpen(true);
  };

  const handleExportModalData = (type: 'users' | 'devices') => {
    if (!selectedDomainData) return;
    const dataToExport = type === 'users' ? selectedDomainData.users : selectedDomainData.devices;
    const filename = `domain_${selectedDomainData.domain}_associated_${type}.csv`;
    
    const headers = [
        type === 'users' ? "User ID (MSISDN/IMSI)" : "Device IMEI",
        "First Seen with Domain", 
        "Last Seen with Domain",
        "Sessions with Domain",
        "Data Volume with Domain"
    ];
    const csvData = dataToExport.map(d => [
        d.id,
        d.firstSeenWithDomain ? formatDate(d.firstSeenWithDomain.toISOString()) : 'N/A',
        d.lastSeenWithDomain ? formatDate(d.lastSeenWithDomain.toISOString()) : 'N/A',
        String(d.sessionsWithDomain),
        formatBytes(d.dataVolumeWithDomain)
    ]);
    downloadCSV(filename, csvData, headers);
  };


  const topDomainsByVisits = useMemo(() => {
    return [...domainSummaryData]
      .sort((a, b) => b.visitCount - a.visitCount)
      .slice(0, 10)
      .map(d => ({ name: d.domain, visits: d.visitCount }));
  }, [domainSummaryData]);

  const topDomainsByDataVolume = useMemo(() => {
    return [...domainSummaryData]
      .sort((a, b) => b.totalDataVolume - a.totalDataVolume)
      .slice(0, 10)
      .map(d => ({ name: d.domain, volumeMB: parseFloat((d.totalDataVolume / (1024 * 1024)).toFixed(2)) }));
  }, [domainSummaryData]);

  const sortedTableData = useMemo(() => {
    let sortableItems = [...domainSummaryData];
    if (sortConfig.key) {
      sortableItems.sort((a, b) => {
        let valA, valB;
        if (sortConfig.key === 'uniqueUsers' || sortConfig.key === 'uniqueDevices') {
          valA = a[sortConfig.key].size;
          valB = b[sortConfig.key].size;
        } else {
          valA = a[sortConfig.key as keyof DomainActivitySummary];
          valB = b[sortConfig.key as keyof DomainActivitySummary];
        }
        
        if (valA instanceof Date && valB instanceof Date) {
          return sortConfig.direction === 'ascending' ? valA.getTime() - valB.getTime() : valB.getTime() - valA.getTime();
        }
        if (typeof valA === 'number' && typeof valB === 'number') {
          return sortConfig.direction === 'ascending' ? valA - valB : valB - valA;
        }
        if (typeof valA === 'string' && typeof valB === 'string') {
          return sortConfig.direction === 'ascending' ? valA.localeCompare(valB) : valB.localeCompare(valA);
        }
        return 0;
      });
    }
    return sortableItems;
  }, [domainSummaryData, sortConfig]);

  const paginatedTableData = useMemo(() => {
    const startIndex = (currentPage - 1) * ROWS_PER_PAGE;
    return sortedTableData.slice(startIndex, startIndex + ROWS_PER_PAGE);
  }, [sortedTableData, currentPage]);

  const totalPages = Math.ceil(sortedTableData.length / ROWS_PER_PAGE);

  const requestSort = (key: keyof DomainActivitySummary | string) => {
    let direction: 'ascending' | 'descending' = 'ascending';
    if (sortConfig.key === key && sortConfig.direction === 'ascending') {
      direction = 'descending';
    }
    setSortConfig({ key, direction });
    setCurrentPage(1);
  };

  const renderSortIcon = (key: string) => {
    if (sortConfig.key !== key) return <ListFilter size={14} className="ml-1 text-neutral-DEFAULT opacity-30 group-hover:opacity-100 inline" />;
    return sortConfig.direction === 'ascending' ? <ChevronUp size={14} className="ml-1 text-primary inline" /> : <ChevronDown size={14} className="ml-1 text-primary inline" />;
  };

  const handleExportChartData = (type: 'visits' | 'volume') => {
    let headers: string[];
    let data: (string | number)[][];
    let filename: string;

    if (type === 'visits') {
      headers = ["Domain", "Visit Count"];
      data = topDomainsByVisits.map(item => [item.name, item.visits]);
      filename = `top_domains_by_visits_${new Date().toISOString().split('T')[0]}.csv`;
    } else {
      headers = ["Domain", "Data Volume (MB)"];
      data = topDomainsByDataVolume.map(item => [item.name, item.volumeMB]);
      filename = `top_domains_by_volume_${new Date().toISOString().split('T')[0]}.csv`;
    }
    downloadCSV(filename, data.map(row => row.map(String)), headers);
  };

  const handleExportTableData = () => {
    const headers = ["Domain", "Total Visits", "Total Data Volume", "Unique Users", "Unique Devices", "First Seen", "Last Seen"];
    const data = sortedTableData.map(d => [
      d.domain,
      String(d.visitCount),
      formatBytes(d.totalDataVolume),
      String(d.uniqueUsers.size),
      String(d.uniqueDevices.size),
      d.firstSeen ? formatDate(d.firstSeen.toISOString()) : 'N/A',
      d.lastSeen ? formatDate(d.lastSeen.toISOString()) : 'N/A',
    ]);
    downloadCSV(`domain_activity_summary_${new Date().toISOString().split('T')[0]}.csv`, data, headers);
  };

  if (contextIsLoading && domainSummaryData.length === 0) return <div className="flex justify-center items-center h-64"><Loader2 className="h-12 w-12 animate-spin text-primary" /><p className="ml-3 text-textSecondary">Loading domain data...</p></div>;
  if (contextError) return <div className="p-4 bg-danger-lighter text-danger-darker rounded-lg text-center border border-danger-light">{contextError}</div>;
  if (uploadedIPDRFiles.length === 0) return <div className="p-6 bg-info-lighter border border-info-light rounded-lg text-center text-info-dark flex flex-col items-center justify-center min-h-[150px] shadow-md"><Info size={28} className="mb-2" /><p className="font-medium">Please upload IPDR files.</p></div>;
  
  if (domainSummaryData.length === 0) return (
    <div className="p-6 bg-neutral-lightest border border-neutral-light rounded-lg text-center text-textSecondary flex flex-col items-center justify-center min-h-[150px] shadow-md">
      <Network size={28} className="mb-2 text-neutral-DEFAULT" />
      <p>No domain activity (based on URLs) found in the selected IPDR records.</p>
      <p className="text-xs mt-1">Ensure your data contains URL information.</p>
    </div>
  );
  
  const tableHeaders: { key: keyof DomainActivitySummary | string; label: string; icon?: React.ReactNode }[] = [
    { key: 'domain', label: 'Domain (Hostname)', icon: <Network size={14}/> },
    { key: 'visitCount', label: 'Total Visits', icon: <ListFilter size={14}/> },
    { key: 'totalDataVolume', label: 'Data Volume', icon: <BarChart2 size={14}/> },
    { key: 'uniqueUsers', label: '# Unique Users', icon: <UsersIcon size={14}/> },
    { key: 'uniqueDevices', label: '# Unique Devices', icon: <SmartphoneNfc size={14}/> },
    { key: 'firstSeen', label: 'First Seen', icon: <Clock size={14}/> },
    { key: 'lastSeen', label: 'Last Seen', icon: <Clock size={14}/> },
  ];

  return (
    <div className="space-y-6">
      <div className="p-4 sm:p-5 bg-surface border border-neutral-light rounded-xl shadow-xl">
        <div className="flex items-center text-xl sm:text-2xl font-semibold text-textPrimary mb-1">
          <Network size={24} className="mr-2.5 text-primary" /> IPDR Domain Analysis
        </div>
        <p className="text-sm text-textSecondary">Analyzing domain visits, data volume, and user/device interactions from IPDR URL data.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-surface p-4 sm:p-6 rounded-xl shadow-lg border border-neutral-light">
          <div className="flex justify-between items-center mb-3">
            <h3 className="text-base sm:text-lg font-semibold text-textPrimary flex items-center">
              <BarChart2 size={18} className="mr-2 text-secondary"/>Top Domains by Visits
            </h3>
            {topDomainsByVisits.length > 0 && (
              <button onClick={() => handleExportChartData('visits')} className="px-3 py-1.5 text-xs bg-secondary-lighter text-secondary-dark rounded-lg hover:bg-secondary-light/70 font-medium flex items-center shadow-sm"><Download size={14} className="mr-1.5"/>Export</button>
            )}
          </div>
          {topDomainsByVisits.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={topDomainsByVisits} layout="vertical" margin={{ top: 5, right: 20, left: 80, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.5}/>
                <XAxis type="number" dataKey="visits" tick={{ fontSize: 10 }} allowDecimals={false}/>
                <YAxis type="category" dataKey="name" tick={{ fontSize: 10, width: 120 }} width={130} interval={0}/>
                <Tooltip wrapperStyle={{fontSize: "12px"}}/>
                <Legend wrapperStyle={{fontSize: "11px"}}/>
                <Bar dataKey="visits" name="Visit Count" fill={CHART_COLORS[0]} radius={[0, 4, 4, 0]} barSize={15}/>
              </BarChart>
            </ResponsiveContainer>
          ) : <p className="text-textSecondary text-center py-10">No data for top domains by visits chart.</p>}
        </div>

        <div className="bg-surface p-4 sm:p-6 rounded-xl shadow-lg border border-neutral-light">
          <div className="flex justify-between items-center mb-3">
            <h3 className="text-base sm:text-lg font-semibold text-textPrimary flex items-center">
              <PieChartIcon size={18} className="mr-2 text-accent"/>Top Domains by Data Volume
            </h3>
            {topDomainsByDataVolume.length > 0 && (
              <button onClick={() => handleExportChartData('volume')} className="px-3 py-1.5 text-xs bg-accent-lighter text-accent-dark rounded-lg hover:bg-accent-light/70 font-medium flex items-center shadow-sm"><Download size={14} className="mr-1.5"/>Export</button>
            )}
          </div>
          {topDomainsByDataVolume.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie data={topDomainsByDataVolume} dataKey="volumeMB" nameKey="name" cx="50%" cy="50%" outerRadius={100} labelLine={false} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                  {topDomainsByDataVolume.map((_entry, index) => (
                    <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip wrapperStyle={{fontSize: "12px"}} formatter={(value: number) => `${value.toFixed(2)} MB`}/>
                <Legend wrapperStyle={{fontSize: "11px", paddingTop: "10px"}} iconSize={10}/>
              </PieChart>
            </ResponsiveContainer>
          ) : <p className="text-textSecondary text-center py-10">No data for top domains by volume chart.</p>}
        </div>
      </div>
      
      <div className="bg-surface p-4 sm:p-6 rounded-xl shadow-lg border border-neutral-light">
         <div className="flex justify-between items-center mb-3">
            <h3 className="text-base sm:text-lg font-semibold text-textPrimary flex items-center">
                <ListFilter size={18} className="mr-2 text-info"/>Domain Activity Details ({sortedTableData.length} domains)
            </h3>
            {sortedTableData.length > 0 && (
                <button onClick={handleExportTableData} className="px-3 py-1.5 text-xs bg-info-lighter text-info-dark rounded-lg hover:bg-info-light/70 font-medium flex items-center shadow-sm"><Download size={14} className="mr-1.5"/>Export Table</button>
            )}
        </div>
        {sortedTableData.length > 0 ? (
          <>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-neutral-light">
                <thead className="bg-neutral-lightest sticky top-0">
                  <tr>
                    {tableHeaders.map(header => (
                      <th key={header.key} onClick={() => requestSort(header.key)} className="group px-3 py-2.5 text-left text-xs font-semibold text-textPrimary uppercase tracking-wider cursor-pointer hover:bg-neutral-lighter transition-colors whitespace-nowrap">
                        <div className="flex items-center">
                          {header.icon && <span className="mr-1.5 text-neutral-DEFAULT group-hover:text-primary">{header.icon}</span>}
                          {header.label} {renderSortIcon(header.key)}
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="bg-surface divide-y divide-neutral-light">
                  {paginatedTableData.map((d) => (
                    <tr key={d.domain} className="hover:bg-neutral-lightest/50">
                      <td 
                        className="px-3 py-2 whitespace-nowrap text-xs text-primary-dark font-medium truncate max-w-xs cursor-pointer hover:underline" 
                        title={`Click to see users/devices for ${d.domain}`}
                        onClick={() => handleDomainClick(d.domain)}
                       >
                        {d.domain}
                       </td>
                      <td className="px-3 py-2 whitespace-nowrap text-xs text-textSecondary text-center">{d.visitCount}</td>
                      <td className="px-3 py-2 whitespace-nowrap text-xs text-textSecondary">{formatBytes(d.totalDataVolume)}</td>
                      <td className="px-3 py-2 whitespace-nowrap text-xs text-textSecondary text-center">{d.uniqueUsers.size}</td>
                      <td className="px-3 py-2 whitespace-nowrap text-xs text-textSecondary text-center">{d.uniqueDevices.size}</td>
                      <td className="px-3 py-2 whitespace-nowrap text-xs text-textSecondary">{d.firstSeen ? formatDate(d.firstSeen.toISOString()) : 'N/A'}</td>
                      <td className="px-3 py-2 whitespace-nowrap text-xs text-textSecondary">{d.lastSeen ? formatDate(d.lastSeen.toISOString()) : 'N/A'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {totalPages > 1 && (
              <div className="flex flex-col sm:flex-row justify-between items-center mt-4 pt-3 border-t border-neutral-light text-xs">
                <span className="text-textSecondary mb-2 sm:mb-0">Page {currentPage} of {totalPages}</span>
                <div className="flex gap-1.5">
                  <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1} className="px-2.5 py-1 font-medium bg-surface border rounded-md shadow-sm hover:bg-neutral-lighter disabled:opacity-50">Previous</button>
                  <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages} className="px-2.5 py-1 font-medium bg-surface border rounded-md shadow-sm hover:bg-neutral-lighter disabled:opacity-50">Next</button>
                </div>
              </div>
            )}
          </>
        ) : <p className="text-textSecondary text-center py-10">No detailed domain activity to display.</p>}
      </div>

      {isDetailModalOpen && selectedDomainData && (
        <div 
            className="fixed inset-0 bg-neutral-darkest/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 transition-opacity duration-300"
            onClick={() => setIsDetailModalOpen(false)}
        >
            <div 
                className="bg-surface rounded-xl shadow-2xl w-full max-w-2xl max-h-[80vh] p-5 sm:p-6 border border-neutral-light flex flex-col"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex justify-between items-center mb-4 pb-3 border-b border-neutral-light">
                    <h2 className="text-base sm:text-lg font-semibold text-primary flex items-center">
                        <Network size={20} className="mr-2.5"/>Details for: <span className="text-primary-dark ml-1 truncate" title={selectedDomainData.domain}>{selectedDomainData.domain}</span>
                    </h2>
                    <button onClick={() => setIsDetailModalOpen(false)} className="text-neutral-DEFAULT hover:text-danger-dark p-1 rounded-full hover:bg-danger-lighter/50 transition-colors"><X size={20}/></button>
                </div>
                <div className="flex-grow overflow-y-auto scrollbar-thin scrollbar-thumb-neutral-light pr-1 space-y-4">
                    <div>
                        <div className="flex justify-between items-center mb-1.5">
                            <h4 className="text-sm font-medium text-textPrimary flex items-center"><User size={16} className="mr-2 text-secondary"/>Associated Users ({selectedDomainData.users.length})</h4>
                            {selectedDomainData.users.length > 0 && <button onClick={() => handleExportModalData('users')} className="px-2 py-1 text-[10px] bg-secondary-lighter text-secondary-dark rounded-md hover:bg-secondary-light/70 font-medium flex items-center shadow-sm"><Download size={12} className="mr-1"/>Export Users</button>}
                        </div>
                        {selectedDomainData.users.length > 0 ? (
                            <div className="max-h-60 overflow-y-auto scrollbar-thin bg-neutral-lightest/50 p-2 rounded-md border border-neutral-light text-xs">
                                <table className="min-w-full">
                                    <thead className="sticky top-0 bg-neutral-lightest/80 z-10"><tr><th className="px-1 py-0.5 text-left font-semibold">User ID</th><th className="px-1 py-0.5 text-left font-semibold">First Seen</th><th className="px-1 py-0.5 text-left font-semibold">Last Seen</th><th className="px-1 py-0.5 text-left font-semibold">Sessions</th><th className="px-1 py-0.5 text-left font-semibold">Volume</th></tr></thead>
                                    <tbody>{selectedDomainData.users.map(user => <tr key={user.id} className="border-t border-neutral-light/50"><td className="px-1 py-0.5 truncate" title={user.id}>{user.id}</td><td className="px-1 py-0.5 whitespace-nowrap">{user.firstSeenWithDomain ? formatDateFromTimestamp(user.firstSeenWithDomain.getTime()) : 'N/A'}</td><td className="px-1 py-0.5 whitespace-nowrap">{user.lastSeenWithDomain ? formatDateFromTimestamp(user.lastSeenWithDomain.getTime()) : 'N/A'}</td><td className="px-1 py-0.5">{user.sessionsWithDomain}</td><td className="px-1 py-0.5 whitespace-nowrap">{formatBytes(user.dataVolumeWithDomain)}</td></tr>)}</tbody>
                                </table>
                            </div>
                        ) : <p className="text-xs text-textSecondary p-2 bg-neutral-lightest/50 rounded-md border border-neutral-light">No users found for this domain.</p>}
                    </div>
                    <div>
                         <div className="flex justify-between items-center mb-1.5">
                            <h4 className="text-sm font-medium text-textPrimary flex items-center"><Smartphone size={16} className="mr-2 text-accent"/>Associated Devices ({selectedDomainData.devices.length})</h4>
                            {selectedDomainData.devices.length > 0 && <button onClick={() => handleExportModalData('devices')} className="px-2 py-1 text-[10px] bg-accent-lighter text-accent-dark rounded-md hover:bg-accent-light/70 font-medium flex items-center shadow-sm"><Download size={12} className="mr-1"/>Export Devices</button>}
                        </div>
                        {selectedDomainData.devices.length > 0 ? (
                             <div className="max-h-60 overflow-y-auto scrollbar-thin bg-neutral-lightest/50 p-2 rounded-md border border-neutral-light text-xs">
                                <table className="min-w-full">
                                    <thead className="sticky top-0 bg-neutral-lightest/80 z-10"><tr><th className="px-1 py-0.5 text-left font-semibold">Device IMEI</th><th className="px-1 py-0.5 text-left font-semibold">First Seen</th><th className="px-1 py-0.5 text-left font-semibold">Last Seen</th><th className="px-1 py-0.5 text-left font-semibold">Sessions</th><th className="px-1 py-0.5 text-left font-semibold">Volume</th></tr></thead>
                                    <tbody>{selectedDomainData.devices.map(device => <tr key={device.id} className="border-t border-neutral-light/50"><td className="px-1 py-0.5 truncate" title={device.id}>{device.id}</td><td className="px-1 py-0.5 whitespace-nowrap">{device.firstSeenWithDomain ? formatDateFromTimestamp(device.firstSeenWithDomain.getTime()) : 'N/A'}</td><td className="px-1 py-0.5 whitespace-nowrap">{device.lastSeenWithDomain ? formatDateFromTimestamp(device.lastSeenWithDomain.getTime()) : 'N/A'}</td><td className="px-1 py-0.5">{device.sessionsWithDomain}</td><td className="px-1 py-0.5 whitespace-nowrap">{formatBytes(device.dataVolumeWithDomain)}</td></tr>)}</tbody>
                                </table>
                            </div>
                        ) : <p className="text-xs text-textSecondary p-2 bg-neutral-lightest/50 rounded-md border border-neutral-light">No devices found for this domain.</p>}
                    </div>
                </div>
                 <button 
                    onClick={() => setIsDetailModalOpen(false)}
                    className="mt-5 px-4 py-2 bg-primary text-white text-sm rounded-lg hover:bg-primary-dark self-end shadow-md"
                >
                    Close
                </button>
            </div>
        </div>
      )}
    </div>
  );
};

export default IPDRDomainAnalysisView;



import React, { useMemo, useState } from 'react';
import { Network, Download, Info, AlertTriangle, Loader2, ListFilter, BarChart2, Clock, Globe as GlobeIcon, Server, FileText, ChevronUp, ChevronDown } from 'lucide-react';
import { useIPDRContext } from '../contexts/IPDRContext';
import { IPDRRecord } from '../types';
import { formatDate, parseDateTime } from '../utils/cdrUtils';
import { downloadCSV } from '../utils/downloadUtils';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, Cell } from 'recharts';

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
        return url; // Return original if it doesn't look like a parsable URL starting point
      }
    }
    const parsedUrl = new URL(fullUrl);
    let hostname = parsedUrl.hostname;
    if (hostname.startsWith('www.')) {
      hostname = hostname.substring(4);
    }
    return hostname;
  } catch (e) {
    // Fallback for simpler domain-like strings if URL parsing fails
    const domainMatch = url.match(/^([a-zA-Z0-9-]+(\.[a-zA-Z0-9-]+)+)/);
    if (domainMatch && domainMatch[1]) {
      let hostname = domainMatch[1];
      if (hostname.startsWith('www.')) {
        hostname = hostname.substring(4);
      }
      return hostname;
    }
    return url; // Return original if no better extraction
  }
};


interface BrowsingEventForTable extends IPDRRecord {
  hostname?: string | null;
  totalTrafficBytes?: number;
}

const IPDRBrowsingBehaviorView: React.FC = () => {
  const { filteredIPDRRecords, isLoading: contextIsLoading, error: contextError, uploadedIPDRFiles } = useIPDRContext();
  const [currentPage, setCurrentPage] = useState(1);
  const [sortConfig, setSortConfig] = useState<{ key: keyof BrowsingEventForTable | string; direction: 'ascending' | 'descending' }>({ key: 'startTime', direction: 'descending' });

  const browsingEvents = useMemo((): BrowsingEventForTable[] => {
    return filteredIPDRRecords
      .filter(r => r.url || (r.applicationType && r.applicationType.toLowerCase().includes('http'))) // Basic filter for web traffic
      .map(r => ({
        ...r,
        hostname: getHostnameFromUrl(r.url),
        totalTrafficBytes: (r.uplinkTrafficByte || 0) + (r.downlinkTrafficByte || 0),
      }));
  }, [filteredIPDRRecords]);

  const topVisitedWebsites = useMemo(() => {
    const counts = new Map<string, number>();
    browsingEvents.forEach(event => {
      if (event.hostname) {
        counts.set(event.hostname, (counts.get(event.hostname) || 0) + 1);
      }
    });
    return Array.from(counts.entries())
      .map(([name, value]) => ({ name, visits: value }))
      .sort((a, b) => b.visits - a.visits)
      .slice(0, 10);
  }, [browsingEvents]);

  const sortedTableEvents = useMemo(() => {
    let sortableItems = [...browsingEvents];
    if (sortConfig.key) {
      sortableItems.sort((a, b) => {
        const valA = a[sortConfig.key as keyof BrowsingEventForTable];
        const valB = b[sortConfig.key as keyof BrowsingEventForTable];

        if (sortConfig.key === 'startTime' || sortConfig.key === 'endTime') {
          const timeA = valA ? parseDateTime(String(valA))?.getTime() : 0;
          const timeB = valB ? parseDateTime(String(valB))?.getTime() : 0;
          return sortConfig.direction === 'ascending' ? (timeA || 0) - (timeB || 0) : (timeB || 0) - (timeA || 0);
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
  }, [browsingEvents, sortConfig]);

  const paginatedTableEvents = useMemo(() => {
    const startIndex = (currentPage - 1) * ROWS_PER_PAGE;
    return sortedTableEvents.slice(startIndex, startIndex + ROWS_PER_PAGE);
  }, [sortedTableEvents, currentPage]);

  const totalPages = Math.ceil(sortedTableEvents.length / ROWS_PER_PAGE);

  const requestSort = (key: keyof BrowsingEventForTable | string) => {
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
  
  const handleExportChartData = () => {
    const headers = ["Hostname", "Visit Count"];
    const data = topVisitedWebsites.map(item => [item.name, String(item.visits)]);
    downloadCSV(`top_visited_websites_${new Date().toISOString().split('T')[0]}.csv`, data, headers);
  };

  const handleExportTableData = () => {
    const headers = ["Timestamp", "Hostname/URL", "Application Type", "Data Volume", "Server IP", "Source File"];
    const data = sortedTableEvents.map(event => [
      event.startTime ? formatDate(event.startTime) : 'N/A',
      event.hostname || event.url || 'N/A',
      event.applicationType || 'N/A',
      formatBytes(event.totalTrafficBytes),
      event.serverIP || 'N/A',
      event.fileName
    ]);
    downloadCSV(`browsing_history_${new Date().toISOString().split('T')[0]}.csv`, data, headers);
  };


  if (contextIsLoading && browsingEvents.length === 0) return <div className="flex justify-center items-center h-64"><Loader2 className="h-12 w-12 animate-spin text-primary" /><p className="ml-3 text-textSecondary">Loading browsing data...</p></div>;
  if (contextError) return <div className="p-4 bg-danger-lighter text-danger-darker rounded-lg text-center border border-danger-light">{contextError}</div>;
  if (uploadedIPDRFiles.length === 0) return <div className="p-6 bg-info-lighter border border-info-light rounded-lg text-center text-info-dark flex flex-col items-center justify-center min-h-[150px] shadow-md"><Info size={28} className="mb-2" /><p className="font-medium">Please upload IPDR files.</p></div>;
  
  if (browsingEvents.length === 0) return (
    <div className="p-6 bg-neutral-lightest border border-neutral-light rounded-lg text-center text-textSecondary flex flex-col items-center justify-center min-h-[150px] shadow-md">
      <Network size={28} className="mb-2 text-neutral-DEFAULT" />
      <p>No browsing activity (related to URLs or HTTP applications) found in the selected IPDR records.</p>
      <p className="text-xs mt-1">Ensure your data contains URL information or relevant application types.</p>
    </div>
  );


  const tableHeaders = [
    { key: 'startTime', label: 'Timestamp', icon: <Clock size={14}/> },
    { key: 'hostname', label: 'Hostname/URL', icon: <GlobeIcon size={14}/> },
    { key: 'applicationType', label: 'App Type', icon: <ListFilter size={14}/> },
    { key: 'totalTrafficBytes', label: 'Data Volume', icon: <BarChart2 size={14}/> },
    { key: 'serverIP', label: 'Server IP', icon: <Server size={14}/> },
    { key: 'fileName', label: 'Source File', icon: <FileText size={14}/> },
  ];

  return (
    <div className="space-y-6">
      <div className="p-4 sm:p-5 bg-surface border border-neutral-light rounded-xl shadow-xl">
        <div className="flex items-center text-xl sm:text-2xl font-semibold text-textPrimary mb-1">
          <Network size={24} className="mr-2.5 text-primary" /> IPDR Browsing Behavior Analysis
        </div>
        <p className="text-sm text-textSecondary">Analyzing website visits and related data from IPDR records.</p>
      </div>

      {/* Top Visited Websites Chart */}
      <div className="bg-surface p-4 sm:p-6 rounded-xl shadow-lg border border-neutral-light">
        <div className="flex justify-between items-center mb-3">
          <h3 className="text-base sm:text-lg font-semibold text-textPrimary flex items-center">
            <BarChart2 size={18} className="mr-2 text-secondary"/>Top Visited Websites (Hostnames)
          </h3>
          {topVisitedWebsites.length > 0 && (
            <button onClick={handleExportChartData} className="px-3 py-1.5 text-xs bg-secondary-lighter text-secondary-dark rounded-lg hover:bg-secondary-light/70 font-medium flex items-center shadow-sm"><Download size={14} className="mr-1.5"/>Export Chart Data</button>
          )}
        </div>
        {topVisitedWebsites.length > 0 ? (
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={topVisitedWebsites} layout="vertical" margin={{ top: 5, right: 20, left: 80, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.5}/>
              <XAxis type="number" tick={{ fontSize: 10 }} allowDecimals={false}/>
              <YAxis type="category" dataKey="name" tick={{ fontSize: 10, width: 120 }} width={130} interval={0}/>
              <Tooltip wrapperStyle={{fontSize: "12px"}}/>
              <Legend wrapperStyle={{fontSize: "11px"}}/>
              <Bar dataKey="visits" name="Visit Count" fill={CHART_COLORS[0]} radius={[0, 4, 4, 0]} barSize={15}/>
            </BarChart>
          </ResponsiveContainer>
        ) : <p className="text-textSecondary text-center py-10">No website data to display for chart.</p>}
      </div>

      {/* Browsing History Table */}
      <div className="bg-surface p-4 sm:p-6 rounded-xl shadow-lg border border-neutral-light">
         <div className="flex justify-between items-center mb-3">
            <h3 className="text-base sm:text-lg font-semibold text-textPrimary flex items-center">
                <ListFilter size={18} className="mr-2 text-accent"/>Detailed Browsing History ({sortedTableEvents.length} records)
            </h3>
            {sortedTableEvents.length > 0 && (
                <button onClick={handleExportTableData} className="px-3 py-1.5 text-xs bg-accent-lighter text-accent-dark rounded-lg hover:bg-accent-light/70 font-medium flex items-center shadow-sm"><Download size={14} className="mr-1.5"/>Export Table Data</button>
            )}
        </div>
        {sortedTableEvents.length > 0 ? (
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
                  {paginatedTableEvents.map((event) => (
                    <tr key={event.id} className="hover:bg-neutral-lightest/50">
                      <td className="px-3 py-2 whitespace-nowrap text-xs text-textSecondary">{event.startTime ? formatDate(event.startTime) : 'N/A'}</td>
                      <td className="px-3 py-2 whitespace-nowrap text-xs text-textPrimary font-medium truncate max-w-xs" title={event.url || event.hostname || ''}>{event.hostname || event.url || 'N/A'}</td>
                      <td className="px-3 py-2 whitespace-nowrap text-xs text-textSecondary">{event.applicationType || 'N/A'}</td>
                      <td className="px-3 py-2 whitespace-nowrap text-xs text-textSecondary">{formatBytes(event.totalTrafficBytes)}</td>
                      <td className="px-3 py-2 whitespace-nowrap text-xs text-textSecondary">{event.serverIP || 'N/A'}</td>
                      <td className="px-3 py-2 whitespace-nowrap text-xs text-textSecondary truncate max-w-[150px]" title={event.fileName}>{event.fileName}</td>
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
        ) : <p className="text-textSecondary text-center py-10">No detailed browsing events to display based on filters.</p>}
      </div>
    </div>
  );
};

export default IPDRBrowsingBehaviorView;

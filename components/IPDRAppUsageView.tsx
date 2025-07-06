
import React, { useMemo, useState } from 'react';
import { AppWindow, Download, Info, AlertTriangle, Loader2, ListFilter, BarChart2, PieChart as PieChartIcon, Database, Clock, Server, FileText, ChevronUp, ChevronDown } from 'lucide-react';
import { useIPDRContext } from '../contexts/IPDRContext';
import { IPDRRecord } from '../types';
import { formatDate, parseDateTime } from '../utils/cdrUtils';
import { downloadCSV } from '../utils/downloadUtils';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, PieChart, Pie, Cell } from 'recharts';

const CHART_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#6366f1', '#f97316', '#06b6d4', '#d946ef'];
const ROWS_PER_PAGE = 15;

const formatBytes = (bytes?: number, decimals = 2): string => {
  if (bytes === undefined || bytes === null || isNaN(bytes) || bytes === 0) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
};

interface AppUsageSummary extends Partial<IPDRRecord> {
  applicationType: string;
  totalDataVolumeBytes: number;
  recordCount: number;
  uniqueServerIPs: Set<string>;
  firstSeenTimestamp?: number;
  lastSeenTimestamp?: number;
}


const IPDRAppUsageView: React.FC = () => {
  const { filteredIPDRRecords, isLoading: contextIsLoading, error: contextError, uploadedIPDRFiles } = useIPDRContext();
  const [currentPage, setCurrentPage] = useState(1);
  const [sortConfig, setSortConfig] = useState<{ key: keyof AppUsageSummary | string; direction: 'ascending' | 'descending' }>({ key: 'totalDataVolumeBytes', direction: 'descending' });

  const appUsageSummary = useMemo((): AppUsageSummary[] => {
    const summaryMap = new Map<string, AppUsageSummary>();

    filteredIPDRRecords.forEach(record => {
      const appType = record.applicationType || 'Unknown';
      let entry = summaryMap.get(appType);

      if (!entry) {
        entry = {
          applicationType: appType,
          totalDataVolumeBytes: 0,
          uplinkTrafficByte: 0,
          downlinkTrafficByte: 0,
          recordCount: 0,
          uniqueServerIPs: new Set<string>(),
        };
      }

      entry.totalDataVolumeBytes! += (record.uplinkTrafficByte || 0) + (record.downlinkTrafficByte || 0);
      entry.uplinkTrafficByte = (entry.uplinkTrafficByte || 0) + (record.uplinkTrafficByte || 0);
      entry.downlinkTrafficByte = (entry.downlinkTrafficByte || 0) + (record.downlinkTrafficByte || 0);
      entry.recordCount! += 1;
      if (record.serverIP) entry.uniqueServerIPs!.add(record.serverIP);
      
      const recordTime = record.startTime ? parseDateTime(record.startTime)?.getTime() : (record.natBeginTime ? parseDateTime(record.natBeginTime)?.getTime() : undefined);
      if (recordTime) {
        if (!entry.firstSeenTimestamp || recordTime < entry.firstSeenTimestamp) {
          entry.firstSeenTimestamp = recordTime;
        }
        if (!entry.lastSeenTimestamp || recordTime > entry.lastSeenTimestamp) {
          entry.lastSeenTimestamp = recordTime;
        }
      }
      summaryMap.set(appType, entry);
    });
    return Array.from(summaryMap.values());
  }, [filteredIPDRRecords]);

  const topUsedAppsByVolume = useMemo(() => {
    return [...appUsageSummary]
      .sort((a, b) => (b.totalDataVolumeBytes || 0) - (a.totalDataVolumeBytes || 0))
      .slice(0, 10)
      .map(app => ({
        name: app.applicationType!,
        value: parseFloat(((app.totalDataVolumeBytes || 0) / (1024 * 1024)).toFixed(2)), // MB
      }));
  }, [appUsageSummary]);

  const dataUsagePerTopApp = useMemo(() => {
    return topUsedAppsByVolume.map(topApp => {
      const summaryEntry = appUsageSummary.find(s => s.applicationType === topApp.name);
      return {
        name: topApp.name,
        UplinkMB: parseFloat(((summaryEntry?.uplinkTrafficByte || 0) / (1024 * 1024)).toFixed(2)),
        DownlinkMB: parseFloat(((summaryEntry?.downlinkTrafficByte || 0) / (1024 * 1024)).toFixed(2)),
      };
    });
  }, [appUsageSummary, topUsedAppsByVolume]);

  const sortedTableData = useMemo(() => {
    let sortableItems = [...appUsageSummary];
    if (sortConfig.key) {
      sortableItems.sort((a, b) => {
        const valA = a[sortConfig.key as keyof AppUsageSummary];
        const valB = b[sortConfig.key as keyof AppUsageSummary];

        if (sortConfig.key === 'firstSeenTimestamp' || sortConfig.key === 'lastSeenTimestamp') {
          return sortConfig.direction === 'ascending' ? (valA || 0) - (valB || 0) : (valB || 0) - (valA || 0);
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
  }, [appUsageSummary, sortConfig]);

  const paginatedTableData = useMemo(() => {
    const startIndex = (currentPage - 1) * ROWS_PER_PAGE;
    return sortedTableData.slice(startIndex, startIndex + ROWS_PER_PAGE);
  }, [sortedTableData, currentPage]);

  const totalPages = Math.ceil(sortedTableData.length / ROWS_PER_PAGE);

  const requestSort = (key: keyof AppUsageSummary | string) => {
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

  const handleExportChartData = (type: 'topApps' | 'dataUsagePerApp') => {
    let headers: string[];
    let data: (string | number)[][];
    let filename: string;

    if (type === 'topApps') {
      headers = ["Application Type", "Total Data (MB)"];
      data = topUsedAppsByVolume.map(item => [item.name, item.value]);
      filename = `top_used_applications_${new Date().toISOString().split('T')[0]}.csv`;
    } else {
      headers = ["Application Type", "Uplink (MB)", "Downlink (MB)"];
      data = dataUsagePerTopApp.map(item => [item.name, item.UplinkMB, item.DownlinkMB]);
      filename = `data_usage_per_app_${new Date().toISOString().split('T')[0]}.csv`;
    }
    downloadCSV(filename, data.map(row => row.map(String)), headers);
  };

  const handleExportTableData = () => {
    const headers = ["Application Type", "Total Data Volume", "Total Uplink", "Total Downlink", "# Records/Sessions", "First Seen", "Last Seen", "# Unique Server IPs"];
    const data = sortedTableData.map(app => [
      app.applicationType!,
      formatBytes(app.totalDataVolumeBytes),
      formatBytes(app.uplinkTrafficByte),
      formatBytes(app.downlinkTrafficByte),
      String(app.recordCount || 0),
      app.firstSeenTimestamp ? formatDate(new Date(app.firstSeenTimestamp).toISOString()) : 'N/A',
      app.lastSeenTimestamp ? formatDate(new Date(app.lastSeenTimestamp).toISOString()) : 'N/A',
      String(app.uniqueServerIPs?.size || 0),
    ]);
    downloadCSV(`app_activity_summary_${new Date().toISOString().split('T')[0]}.csv`, data, headers);
  };

  if (contextIsLoading && appUsageSummary.length === 0) return <div className="flex justify-center items-center h-64"><Loader2 className="h-12 w-12 animate-spin text-primary" /><p className="ml-3 text-textSecondary">Loading app usage data...</p></div>;
  if (contextError) return <div className="p-4 bg-danger-lighter text-danger-darker rounded-lg text-center border border-danger-light">{contextError}</div>;
  if (uploadedIPDRFiles.length === 0) return <div className="p-6 bg-info-lighter border border-info-light rounded-lg text-center text-info-dark flex flex-col items-center justify-center min-h-[150px] shadow-md"><Info size={28} className="mb-2" /><p className="font-medium">Please upload IPDR files.</p></div>;
  
  if (appUsageSummary.length === 0) return (
    <div className="p-6 bg-neutral-lightest border border-neutral-light rounded-lg text-center text-textSecondary flex flex-col items-center justify-center min-h-[150px] shadow-md">
      <AppWindow size={28} className="mb-2 text-neutral-DEFAULT" />
      <p>No application usage data (related to 'applicationType') found in the selected IPDR records.</p>
      <p className="text-xs mt-1">Ensure your data contains application type information.</p>
    </div>
  );

  const tableHeaders = [
    { key: 'applicationType', label: 'App Type', icon: <AppWindow size={14}/> },
    { key: 'totalDataVolumeBytes', label: 'Total Data', icon: <Database size={14}/> },
    { key: 'uplinkTrafficByte', label: 'Uplink', icon: <BarChart2 size={14}/> },
    { key: 'downlinkTrafficByte', label: 'Downlink', icon: <BarChart2 size={14}/> },
    { key: 'recordCount', label: '# Records', icon: <ListFilter size={14}/> },
    { key: 'firstSeenTimestamp', label: 'First Seen', icon: <Clock size={14}/> },
    { key: 'lastSeenTimestamp', label: 'Last Seen', icon: <Clock size={14}/> },
    { key: 'uniqueServerIPs', label: '# Server IPs', icon: <Server size={14}/> },
  ];


  return (
    <div className="space-y-6">
      <div className="p-4 sm:p-5 bg-surface border border-neutral-light rounded-xl shadow-xl">
        <div className="flex items-center text-xl sm:text-2xl font-semibold text-textPrimary mb-1">
          <AppWindow size={24} className="mr-2.5 text-primary" /> IPDR Application Usage Analysis
        </div>
        <p className="text-sm text-textSecondary">Analyzing application types and their data consumption from IPDR records.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top Used Applications by Data Volume */}
        <div className="bg-surface p-4 sm:p-6 rounded-xl shadow-lg border border-neutral-light">
          <div className="flex justify-between items-center mb-3">
            <h3 className="text-base sm:text-lg font-semibold text-textPrimary flex items-center">
              <PieChartIcon size={18} className="mr-2 text-secondary"/>Top Used Apps (by Data Volume)
            </h3>
            {topUsedAppsByVolume.length > 0 && (
              <button onClick={() => handleExportChartData('topApps')} className="px-3 py-1.5 text-xs bg-secondary-lighter text-secondary-dark rounded-lg hover:bg-secondary-light/70 font-medium flex items-center shadow-sm"><Download size={14} className="mr-1.5"/>Export Chart</button>
            )}
          </div>
          {topUsedAppsByVolume.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie data={topUsedAppsByVolume} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={100} labelLine={false} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} >
                  {topUsedAppsByVolume.map((_entry, index) => (
                    <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip wrapperStyle={{fontSize: "12px"}} formatter={(value: number) => `${value.toFixed(2)} MB`}/>
                <Legend wrapperStyle={{fontSize: "11px", paddingTop: "10px"}} iconSize={10}/>
              </PieChart>
            </ResponsiveContainer>
          ) : <p className="text-xs text-textSecondary text-center py-10">No data for top used applications chart.</p>}
        </div>

        {/* Data Usage per Top Application (Uplink/Downlink) */}
        <div className="bg-surface p-4 sm:p-6 rounded-xl shadow-lg border border-neutral-light">
          <div className="flex justify-between items-center mb-3">
            <h3 className="text-base sm:text-lg font-semibold text-textPrimary flex items-center">
              <BarChart2 size={18} className="mr-2 text-accent"/>Data Usage per Top App (MB)
            </h3>
            {dataUsagePerTopApp.length > 0 && (
              <button onClick={() => handleExportChartData('dataUsagePerApp')} className="px-3 py-1.5 text-xs bg-accent-lighter text-accent-dark rounded-lg hover:bg-accent-light/70 font-medium flex items-center shadow-sm"><Download size={14} className="mr-1.5"/>Export Chart</button>
            )}
          </div>
          {dataUsagePerTopApp.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={dataUsagePerTopApp} margin={{ top: 5, right: 5, left: -15, bottom: 60 }}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.5} />
                <XAxis dataKey="name" angle={-30} textAnchor='end' tick={{ fontSize: 10 }} interval={0}/>
                <YAxis tick={{ fontSize: 10 }} label={{ value: 'Data (MB)', angle: -90, position: 'insideLeft', offset:-5, style:{fontSize:'10px'} }}/>
                <Tooltip wrapperStyle={{fontSize: "12px"}} formatter={(value: number, name: string) => [`${Number(value).toFixed(2)} MB`, name === 'UplinkMB' ? 'Uplink' : 'Downlink']}/>
                <Legend wrapperStyle={{fontSize: "11px"}}/>
                <Bar dataKey="UplinkMB" name="Uplink" stackId="a" fill={CHART_COLORS[2]} radius={[4, 4, 0, 0]} barSize={20}/>
                <Bar dataKey="DownlinkMB" name="Downlink" stackId="a" fill={CHART_COLORS[3]} radius={[4, 4, 0, 0]} barSize={20}/>
              </BarChart>
            </ResponsiveContainer>
          ) : <p className="text-xs text-textSecondary text-center py-10">No data for app data usage breakdown.</p>}
        </div>
      </div>

      {/* Application Activity Summary Table */}
      <div className="bg-surface p-4 sm:p-6 rounded-xl shadow-lg border border-neutral-light">
         <div className="flex justify-between items-center mb-3">
            <h3 className="text-base sm:text-lg font-semibold text-textPrimary flex items-center">
                <ListFilter size={18} className="mr-2 text-info"/>Application Activity Summary ({sortedTableData.length} types)
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
                  {paginatedTableData.map((app) => (
                    <tr key={app.applicationType} className="hover:bg-neutral-lightest/50">
                      <td className="px-3 py-2 whitespace-nowrap text-xs text-textPrimary font-medium">{app.applicationType}</td>
                      <td className="px-3 py-2 whitespace-nowrap text-xs text-textSecondary">{formatBytes(app.totalDataVolumeBytes)}</td>
                      <td className="px-3 py-2 whitespace-nowrap text-xs text-textSecondary">{formatBytes(app.uplinkTrafficByte)}</td>
                      <td className="px-3 py-2 whitespace-nowrap text-xs text-textSecondary">{formatBytes(app.downlinkTrafficByte)}</td>
                      <td className="px-3 py-2 whitespace-nowrap text-xs text-textSecondary text-center">{app.recordCount}</td>
                      <td className="px-3 py-2 whitespace-nowrap text-xs text-textSecondary">{app.firstSeenTimestamp ? formatDate(new Date(app.firstSeenTimestamp).toISOString()) : 'N/A'}</td>
                      <td className="px-3 py-2 whitespace-nowrap text-xs text-textSecondary">{app.lastSeenTimestamp ? formatDate(new Date(app.lastSeenTimestamp).toISOString()) : 'N/A'}</td>
                      <td className="px-3 py-2 whitespace-nowrap text-xs text-textSecondary text-center">{app.uniqueServerIPs?.size || 0}</td>
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
        ) : <p className="text-xs text-textSecondary text-center py-10">No application summary data to display.</p>}
      </div>
    </div>
  );
};

export default IPDRAppUsageView;

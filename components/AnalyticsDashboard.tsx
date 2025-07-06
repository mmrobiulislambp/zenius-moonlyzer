import React, { useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { Users, PhoneOutgoing, PhoneIncoming, MessageSquare, Clock, BarChart2, PieChart as PieIcon, Info, FileText, Activity, TrendingUp, Download, CalendarDays, AlertTriangle } from 'lucide-react'; // Added AlertTriangle, CalendarDays
import { useCDRContext } from '../contexts/CDRContext';
import { CDRRecord } from '../types';
import { parseDateTime, isOutgoingCallType, isIncomingCallType, isAnyCall, formatDate } from '../utils/cdrUtils'; // Added formatDate
import { downloadCSV } from '../utils/downloadUtils';

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#6366f1', '#f97316', '#06b6d4', '#d946ef']; // Theme colors
const MAX_RECORDS_FOR_DASHBOARD = 50000;

const AnalyticsCard: React.FC<{ title: string; value: string | number; icon: React.ReactNode; children?: React.ReactNode; iconBgColor?: string }> = ({ title, value, icon, children, iconBgColor = 'bg-primary-lighter/40' }) => ( // Slightly darker default icon BG
  <div className="bg-surface p-4 sm:p-5 rounded-xl shadow-lg border border-neutral-light flex flex-col items-start hover:shadow-xl transition-shadow duration-150">
    <div className="flex items-center w-full mb-2.5"> {/* Increased mb */}
      <div className={`p-2.5 rounded-lg ${iconBgColor} mr-3 shadow-sm`}> {/* Added shadow to icon bg */}
        {icon}
      </div>
      <h3 className="text-sm sm:text-base font-semibold text-textPrimary">{title}</h3> {/* Adjusted font size */}
    </div>
    <p className="text-2xl sm:text-3xl font-bold text-textPrimary mb-2">{value}</p>
    {children && <div className="text-xs text-textSecondary w-full mt-1">{children}</div>}
  </div>
);

interface ColumnConfig<T> {
  header: string;
  accessor: keyof T | ((item: T) => string | number);
}

const prepareAnalyticsDataForCSV = <T extends object>(
  rawData: T[],
  columnConfigs: ColumnConfig<T>[],
  filename: string
) => {
  if (rawData.length === 0) {
    alert("No data to export for this section.");
    return;
  }

  const exportHeaders = columnConfigs.map(config => config.header);
  const dataForCsv = rawData.map(item => {
    return columnConfigs.map(config => {
      if (typeof config.accessor === 'function') {
        return String(config.accessor(item));
      }
      return String(item[config.accessor as keyof T] ?? '');
    });
  });

  downloadCSV(filename, dataForCsv, exportHeaders);
};


export const AnalyticsDashboard: React.FC = () => {
  const { filteredRecords, activeFileTabId, uploadedFiles, filesToAnalyze } = useCDRContext();

  const totalRecords = filteredRecords.length;

  const summaryTitle = useMemo(() => {
    if (activeFileTabId) {
      const activeFile = uploadedFiles.find(f => f.id === activeFileTabId);
      return activeFile ? `Summary for: ${activeFile.sourceName || activeFile.name}` : "Summary for Selected File";
    }
    if (filesToAnalyze.length > 0 && filesToAnalyze.length < uploadedFiles.length) {
      if (filesToAnalyze.length === 1) {
        return `Summary for: ${filesToAnalyze[0].sourceName || filesToAnalyze[0].name}`;
      }
      return `Summary for: ${filesToAnalyze.length} Selected Files`;
    }
    if (uploadedFiles.length > 0) {
      return `Summary for: All Uploaded Files (${uploadedFiles.length})`;
    }
    return "Analytics Dashboard";
  }, [activeFileTabId, uploadedFiles, filesToAnalyze]);

  const uniqueNumbers = useMemo(() => {
    const numbers = new Set<string>();
    filteredRecords.forEach(r => {
      if (r.APARTY) numbers.add(r.APARTY);
      if (r.BPARTY) numbers.add(r.BPARTY);
    });
    return numbers.size;
  }, [filteredRecords]);

  const callDurationStats = useMemo(() => {
    const durations = filteredRecords
      .filter(r => isAnyCall(r.USAGE_TYPE)) // Consider only call types for duration stats
      .map(r => parseInt(r.CALL_DURATION, 10))
      .filter(d => !isNaN(d) && d >= 0);
    if (durations.length === 0) return { avg: 0, total: 0, count: 0 };
    const total = durations.reduce((sum, d) => sum + d, 0);
    const callCountWithDuration = durations.filter(d => d > 0).length; // Count only calls with duration > 0 for average
    return {
      avg: callCountWithDuration > 0 ? Math.round(total / callCountWithDuration) : 0,
      total: total,
      count: durations.length 
    };
  }, [filteredRecords]);
  
  const usageTypeDistribution = useMemo(() => {
    const counts: Record<string, number> = {};
    filteredRecords.forEach(r => {
      counts[r.USAGE_TYPE || "Unknown"] = (counts[r.USAGE_TYPE || "Unknown"] || 0) + 1;
    });
    return Object.entries(counts)
      .map(([name, value]) => ({ name, value }))
      .sort((a,b) => b.value - a.value);
  }, [filteredRecords]);

  const topCallers = useMemo(() => {
    const callers: Record<string, number> = {};
    filteredRecords.forEach(r => {
      const usageType = r.USAGE_TYPE;
      if (isOutgoingCallType(usageType) && r.APARTY) {
        callers[r.APARTY] = (callers[r.APARTY] || 0) + 1;
      } else if (isIncomingCallType(usageType) && r.BPARTY) { 
        // For an incoming call type (e.g., MTC), BPARTY is the initiator
        callers[r.BPARTY] = (callers[r.BPARTY] || 0) + 1;
      }
    });
    return Object.entries(callers)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 10);
  }, [filteredRecords]);

  const networkTypeDistribution = useMemo(() => {
    const counts: Record<string, number> = {};
    filteredRecords.forEach(r => {
      counts[r.NETWORK_TYPE || "Unknown"] = (counts[r.NETWORK_TYPE || "Unknown"] || 0) + 1;
    });
    return Object.entries(counts).map(([name, value]) => ({ name, value }));
  }, [filteredRecords]);

  const hourlyCallDistribution = useMemo(() => {
    const countsByHour = Array(24).fill(null).map((_, i) => ({
      hour: i,
      name: `${String(i).padStart(2, '0')}:00`,
      calls: 0,
    }));

    filteredRecords.forEach(record => {
      if (isAnyCall(record.USAGE_TYPE)) { // Consider only call records for hourly call distribution
        const date = parseDateTime(record.START_DTTIME);
        if (date) {
          const hour = date.getHours(); 
          if (hour >= 0 && hour <= 23) {
            countsByHour[hour].calls++;
          }
        }
      }
    });
    return countsByHour;
  }, [filteredRecords]);

  const peakActivityHours = useMemo(() => {
    if (hourlyCallDistribution.length === 0) return "N/A";
    const totalCalls = hourlyCallDistribution.reduce((sum, hourData) => sum + hourData.calls, 0);
    if (totalCalls === 0) return "No significant call activity";
    const averageCallsPerHour = totalCalls / 24;
    const significantThreshold = averageCallsPerHour * 1.5; 
    let peakHours: {hour: number, calls: number}[] = [];
    hourlyCallDistribution.forEach(hourData => {
      if (hourData.calls > significantThreshold && hourData.calls > 0) {
        peakHours.push(hourData);
      }
    });
    if (peakHours.length === 0) { 
        const sortedHours = [...hourlyCallDistribution].sort((a,b) => b.calls - a.calls);
        if (sortedHours[0].calls > 0) {
            peakHours.push(sortedHours[0]);
            if (sortedHours.length > 1 && sortedHours[1].calls > 0 && sortedHours[1].calls >= sortedHours[0].calls * 0.8) peakHours.push(sortedHours[1]);
            if (sortedHours.length > 2 && sortedHours[2].calls > 0 && sortedHours[2].calls >= sortedHours[0].calls * 0.7) peakHours.push(sortedHours[2]);
            peakHours.sort((a,b) => a.hour - b.hour); 
        } else { return "Low overall activity"; }
    }
    if (peakHours.length === 0) return "Activity is evenly distributed or very low.";
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
  }, [hourlyCallDistribution]);

  const dataTimeframe = useMemo(() => {
    if (filteredRecords.length === 0) {
      return { earliest: "N/A", latest: "N/A" };
    }
    let earliestDate: Date | null = null;
    let latestDate: Date | null = null;

    filteredRecords.forEach(record => {
      const recordDate = parseDateTime(record.START_DTTIME);
      if (recordDate) {
        if (!earliestDate || recordDate < earliestDate) {
          earliestDate = recordDate;
        }
        if (!latestDate || recordDate > latestDate) {
          latestDate = recordDate;
        }
      }
    });
    return {
      earliest: earliestDate ? formatDate(earliestDate.toISOString()) : "N/A",
      latest: latestDate ? formatDate(latestDate.toISOString()) : "N/A",
    };
  }, [filteredRecords]);


  const getExportFilename = (base: string): string => {
    let suffix = "all_selected_files";
    if (activeFileTabId) {
        const activeFile = uploadedFiles.find(f => f.id === activeFileTabId);
        suffix = activeFile ? (activeFile.sourceName || activeFile.name).replace(/[^a-z0-9]/gi, '_').toLowerCase() : "current_file";
    } else if (filesToAnalyze.length === 1) {
        suffix = (filesToAnalyze[0].sourceName || filesToAnalyze[0].name).replace(/[^a-z0-9]/gi, '_').toLowerCase();
    }
    return `${base}_${suffix}.csv`;
  };

  const exportKeyMetrics = () => {
    const data = [
        { metric: "Total Records Analyzed", value: totalRecords },
        { metric: "Unique Numbers Involved", value: uniqueNumbers },
        { metric: "Avg. Call Duration (s) (for calls > 0s)", value: callDurationStats.avg },
        { metric: "Total Call Duration (s)", value: callDurationStats.total },
        { metric: "Total Call Records with Duration", value: callDurationStats.count},
        { metric: "Earliest Record Timestamp", value: dataTimeframe.earliest },
        { metric: "Latest Record Timestamp", value: dataTimeframe.latest },
    ];
    const columns: ColumnConfig<typeof data[0]>[] = [
        { header: "Metric", accessor: "metric" },
        { header: "Value", accessor: "value" },
    ];
    prepareAnalyticsDataForCSV(data, columns, getExportFilename("summary_key_metrics"));
  };

  const exportUsageTypeDistribution = () => {
    const columns: ColumnConfig<typeof usageTypeDistribution[0]>[] = [
        { header: "Usage Type", accessor: "name" },
        { header: "Count", accessor: "value" },
    ];
    prepareAnalyticsDataForCSV(usageTypeDistribution, columns, getExportFilename("usage_type_dist"));
  };

  const exportTopCallers = () => {
     const columns: ColumnConfig<typeof topCallers[0]>[] = [
        { header: "Caller (Initiator)", accessor: "name" },
        { header: "Call Count", accessor: "value" },
    ];
    prepareAnalyticsDataForCSV(topCallers, columns, getExportFilename("top_callers_initiators"));
  };
  
  const exportHourlyActivity = () => {
    const columns: ColumnConfig<typeof hourlyCallDistribution[0]>[] = [
        { header: "Hour", accessor: "name" },
        { header: "Call Count", accessor: "calls" },
    ];
    prepareAnalyticsDataForCSV(hourlyCallDistribution, columns, getExportFilename("hourly_call_activity"));
  };

  const exportNetworkTypeDistribution = () => {
    const columns: ColumnConfig<typeof networkTypeDistribution[0]>[] = [
        { header: "Network Type", accessor: "name" },
        { header: "Count", accessor: "value" },
    ];
    prepareAnalyticsDataForCSV(networkTypeDistribution, columns, getExportFilename("network_type_dist"));
  };


  if (uploadedFiles.length === 0) {
    return <div className="p-6 bg-info-lighter border border-info-light rounded-lg text-center text-info-dark flex flex-col items-center justify-center min-h-[200px]"><Info size={32} className="mb-3" /><p className="font-medium">Please upload CDR files to view analytics.</p></div>;
  }

  if (totalRecords > MAX_RECORDS_FOR_DASHBOARD) {
    return (
        <div className="space-y-4">
            <div className="p-4 sm:p-5 bg-surface border border-neutral-light rounded-xl shadow-lg">
                <div className="flex items-center text-xl font-semibold text-textPrimary mb-1"> <FileText size={24} className="mr-2 text-primary" /> {summaryTitle} </div>
            </div>
            <div className="p-6 bg-warning-lighter border border-warning-light rounded-lg text-center text-warning-darker flex flex-col items-center justify-center min-h-[200px] shadow-md">
                <AlertTriangle size={32} className="mb-3" />
                <h3 className="text-lg font-semibold">Performance Warning</h3>
                <p className="max-w-md mt-1">
                    The current dataset ({totalRecords.toLocaleString()} records) is too large for an interactive dashboard summary. 
                    Please apply more specific filters (e.g., date range, specific files) to reduce the number of records below {MAX_RECORDS_FOR_DASHBOARD.toLocaleString()} to view analytics.
                </p>
            </div>
        </div>
    );
  }

  if (totalRecords === 0) {
    return (
        <div className="space-y-4">
            <div className="p-4 sm:p-5 bg-surface border border-neutral-light rounded-xl shadow-lg">
                <div className="flex items-center text-xl font-semibold text-textPrimary mb-1"> <FileText size={24} className="mr-2 text-primary" /> {summaryTitle} </div>
            </div>
            <div className="p-6 bg-neutral-lightest border border-neutral-light rounded-lg text-center text-textSecondary min-h-[150px] flex flex-col items-center justify-center"><Info size={28} className="mb-2 text-neutral-DEFAULT" /><p>No data available for analytics based on current filters.</p></div>
        </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="p-4 sm:p-5 bg-surface border border-neutral-light rounded-xl shadow-xl"> {/* Enhanced title card shadow */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center">
            <div>
                <div className="flex items-center text-xl sm:text-2xl font-semibold text-textPrimary mb-1"> <FileText size={24} className="mr-2.5 text-primary" /> {summaryTitle} </div>
                <p className="text-sm text-textSecondary"> Displaying analytics based on the currently selected file(s) and filters. </p>
            </div>
            <button
                onClick={exportKeyMetrics}
                className="mt-3 sm:mt-0 px-3.5 py-2 text-xs sm:text-sm bg-secondary text-white rounded-lg hover:bg-secondary-dark focus:outline-none focus:ring-2 focus:ring-secondary-light focus:ring-offset-1 flex items-center shadow-md hover:shadow-lg transition-all"
            >
                <Download size={15} className="mr-1.5" /> Export Key Metrics
            </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5 sm:gap-6"> {/* Changed to 4 columns for new card */}
        <AnalyticsCard title="Total Records Analyzed" value={totalRecords.toLocaleString()} icon={<BarChart2 size={22} className="text-primary"/>} iconBgColor="bg-primary-lighter/40" />
        <AnalyticsCard title="Unique Numbers Involved" value={uniqueNumbers.toLocaleString()} icon={<Users size={22} className="text-secondary"/>} iconBgColor="bg-secondary-lighter/40" />
        <AnalyticsCard 
          title="Data Timeframe" 
          value={dataTimeframe.earliest} 
          icon={<CalendarDays size={22} className="text-purple-500"/>} 
          iconBgColor="bg-purple-200/40"
        >
          Latest Record: {dataTimeframe.latest}
        </AnalyticsCard>
        <AnalyticsCard title="Avg. Call Duration" value={`${callDurationStats.avg}s`} icon={<Clock size={22} className="text-accent"/>} iconBgColor="bg-accent-lighter/40"> Total Call Duration: {Math.round(callDurationStats.total / 60).toLocaleString()} min <br/> (Based on {callDurationStats.count.toLocaleString()} call records with duration) </AnalyticsCard>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 sm:gap-6"> {/* Increased gap */}
        <div className="bg-surface p-4 sm:p-6 rounded-xl shadow-xl border border-neutral-light"> {/* Enhanced chart card shadow */}
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-base sm:text-lg font-semibold text-textPrimary flex items-center"> <PieIcon size={18} className="mr-2 text-primary"/>Usage Type Distribution </h3>
            <button onClick={exportUsageTypeDistribution} className="px-2.5 py-1.5 text-xs bg-primary-lighter/50 text-primary-dark rounded-md hover:bg-primary-lighter/70 font-medium flex items-center shadow-sm hover:shadow-md transition-shadow"><Download size={13} className="inline mr-1"/>CSV</button>
          </div>
          {usageTypeDistribution.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie data={usageTypeDistribution} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={100} labelLine={false} label={({ cx, cy, midAngle, innerRadius, outerRadius, percent }) => { const RADIAN = Math.PI / 180; const radius = innerRadius + (outerRadius - innerRadius) * 0.55; const x = cx + radius * Math.cos(-midAngle * RADIAN); const y = cy + radius * Math.sin(-midAngle * RADIAN); return ( <text x={x} y={y} fill="white" textAnchor={x > cx ? 'start' : 'end'} dominantBaseline="central" fontSize="10px" fontWeight="bold"> {`${(percent * 100).toFixed(0)}%`} </text> );}} >
                  {usageTypeDistribution.map((_entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} stroke={"#fff"} strokeWidth={1}/> 
                  ))}
                </Pie>
                <Tooltip wrapperStyle={{fontSize: "12px", background: "rgba(255,255,255,0.9)", borderRadius: "4px", border: "1px solid #e5e7eb"}}/>
                <Legend iconSize={10} wrapperStyle={{fontSize: "12px", paddingTop: "10px"}}/>
              </PieChart>
            </ResponsiveContainer>
          ) : <p className="text-textSecondary text-center py-10">No usage type data.</p>}
        </div>

        <div className="bg-surface p-4 sm:p-6 rounded-xl shadow-xl border border-neutral-light">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-base sm:text-lg font-semibold text-textPrimary flex items-center"> <BarChart2 size={18} className="mr-2 text-secondary"/>Top 10 Call Initiators </h3>
            <button onClick={exportTopCallers} className="px-2.5 py-1.5 text-xs bg-secondary-lighter/50 text-secondary-dark rounded-md hover:bg-secondary-lighter/70 font-medium flex items-center shadow-sm hover:shadow-md transition-shadow"><Download size={13} className="inline mr-1"/>CSV</button>
          </div>
          {topCallers.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={topCallers} layout="vertical" margin={{ top: 5, right: 30, left: 70, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6"/> {/* Lighter grid lines */}
                <XAxis type="number" tick={{fontSize: 10}} stroke="#9ca3af"/>
                <YAxis type="category" dataKey="name" width={90} tick={{fontSize: 10, width: 85}}  interval={0} stroke="#9ca3af"/>
                <Tooltip wrapperStyle={{fontSize: "12px", background: "rgba(255,255,255,0.9)", borderRadius: "4px", border: "1px solid #e5e7eb"}}/>
                <Legend iconSize={10} wrapperStyle={{fontSize: "12px"}}/>
                <Bar dataKey="value" name="Initiated Call Count" fill={COLORS[1]} radius={[0, 5, 5, 0]} barSize={15}/>
              </BarChart>
            </ResponsiveContainer>
          ): <p className="text-textSecondary text-center py-10">No caller data.</p>}
        </div>
        
        <div className="bg-surface p-4 sm:p-6 rounded-xl shadow-xl border border-neutral-light">
           <div className="flex justify-between items-center mb-4">
            <h3 className="text-base sm:text-lg font-semibold text-textPrimary flex items-center"> <Activity size={18} className="mr-2 text-accent"/>Hourly Call Activity </h3>
            <button onClick={exportHourlyActivity} className="px-2.5 py-1.5 text-xs bg-accent-lighter/50 text-accent-dark rounded-md hover:bg-accent-lighter/70 font-medium flex items-center shadow-sm hover:shadow-md transition-shadow"><Download size={13} className="inline mr-1"/>CSV</button>
          </div>
           {hourlyCallDistribution.some(h => h.calls > 0) ? (
            <>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={hourlyCallDistribution} margin={{ top: 5, right: 20, left: -5, bottom: 25 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                  <XAxis dataKey="name" angle={-45} textAnchor="end" height={60} interval={1} tick={{fontSize: 10}} stroke="#9ca3af"/>
                  <YAxis allowDecimals={false} tick={{fontSize: 10}} stroke="#9ca3af"/>
                  <Tooltip wrapperStyle={{fontSize: "12px", background: "rgba(255,255,255,0.9)", borderRadius: "4px", border: "1px solid #e5e7eb"}}/>
                  <Legend verticalAlign="top" iconSize={10} wrapperStyle={{fontSize: "12px"}}/>
                  <Bar dataKey="calls" name="Calls per Hour" fill={COLORS[2]} radius={[5, 5, 0, 0]} barSize={15}/>
                </BarChart>
              </ResponsiveContainer>
              <p className="text-xs text-textSecondary mt-3 text-center">
                <TrendingUp size={14} className="inline mr-1 text-primary"/> Peak Activity Hours: {peakActivityHours}
              </p>
            </>
          ): <p className="text-textSecondary text-center py-10">Not enough data for hourly activity analysis.</p>}
        </div>
        
         <div className="bg-surface p-4 sm:p-6 rounded-xl shadow-xl border border-neutral-light">
            <div className="flex justify-between items-center mb-4">
                <h3 className="text-base sm:text-lg font-semibold text-textPrimary flex items-center"> <PieIcon size={18} className="mr-2 text-info"/>Network Type Distribution </h3>
                <button onClick={exportNetworkTypeDistribution} className="px-2.5 py-1.5 text-xs bg-info-lighter/50 text-info-dark rounded-md hover:bg-info-lighter/70 font-medium flex items-center shadow-sm hover:shadow-md transition-shadow"><Download size={13} className="inline mr-1"/>CSV</button>
            </div>
          {networkTypeDistribution.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie data={networkTypeDistribution} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={100} labelLine={false} label={({ cx, cy, midAngle, innerRadius, outerRadius, percent }) => { const RADIAN = Math.PI / 180; const radius = innerRadius + (outerRadius - innerRadius) * 0.55; const x = cx + radius * Math.cos(-midAngle * RADIAN); const y = cy + radius * Math.sin(-midAngle * RADIAN); return ( <text x={x} y={y} fill="white" textAnchor={x > cx ? 'start' : 'end'} dominantBaseline="central" fontSize="10px" fontWeight="bold"> {`${(percent * 100).toFixed(0)}%`} </text> );}}>
                  {networkTypeDistribution.map((_entry, index) => (
                    <Cell key={`cell-network-${index}`} fill={COLORS[(index + 3) % COLORS.length]} stroke={"#fff"} strokeWidth={1} />
                  ))}
                </Pie>
                <Tooltip wrapperStyle={{fontSize: "12px", background: "rgba(255,255,255,0.9)", borderRadius: "4px", border: "1px solid #e5e7eb"}}/>
                <Legend iconSize={10} wrapperStyle={{fontSize: "12px", paddingTop: "10px"}}/>
              </PieChart>
            </ResponsiveContainer>
          ) : <p className="text-textSecondary text-center py-10">No network type data.</p>}
        </div>
      </div>
    </div>
  );
};

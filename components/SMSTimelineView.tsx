import React, { useMemo } from 'react';
import { Activity, CalendarDays, Download, Info, Loader2, Send, Inbox } from 'lucide-react';
import { useSMSContext } from '../contexts/SMSContext';
import { SMSRecord } from '../types';
import { parseDateTime, formatDate } from '../utils/cdrUtils';
import { downloadCSV } from '../utils/downloadUtils';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell } from 'recharts';

const CHART_COLORS = {
  sent: '#3b82f6', // Blue-500
  received: '#10b981', // Emerald-500
};

interface DailySMSData {
  date: string;
  sent: number;
  received: number;
  total: number;
}

const SMSTimelineView: React.FC = () => {
  const { filteredSMSRecords, isLoading: contextIsLoading, uploadedSMSFiles } = useSMSContext();

  const dailySMSActivity = useMemo((): DailySMSData[] => {
    if (contextIsLoading || filteredSMSRecords.length === 0) return [];

    const dailyData: Record<string, { sent: number; received: number; total: number }> = {};
    
    filteredSMSRecords.forEach(sms => {
      const dateObj = parseDateTime(sms.Timestamp);
      if (dateObj) {
        const dateStr = dateObj.toISOString().split('T')[0]; // YYYY-MM-DD format
        if (!dailyData[dateStr]) {
          dailyData[dateStr] = { sent: 0, received: 0, total: 0 };
        }
        dailyData[dateStr].total++;
        if (sms.OriginalDirection === 'SMSMO') {
          dailyData[dateStr].sent++;
        } else if (sms.OriginalDirection === 'SMSMT') {
          dailyData[dateStr].received++;
        }
      }
    });

    return Object.entries(dailyData)
      .map(([date, counts]) => ({ date, ...counts }))
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }, [filteredSMSRecords, contextIsLoading]);

  const handleExportData = () => {
    if (dailySMSActivity.length === 0) {
      alert("No data to export.");
      return;
    }
    const headers = ["Date", "Sent SMS", "Received SMS", "Total SMS"];
    const data = dailySMSActivity.map(item => [
      item.date,
      String(item.sent),
      String(item.received),
      String(item.total),
    ]);
    downloadCSV(`sms_daily_activity_timeline_${new Date().toISOString().split('T')[0]}.csv`, data, headers);
  };

  if (contextIsLoading && dailySMSActivity.length === 0) {
    return (
      <div className="flex justify-center items-center h-64">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <p className="ml-3 text-textSecondary">Loading SMS activity data...</p>
      </div>
    );
  }

  if (uploadedSMSFiles.length === 0 && !contextIsLoading) {
    return (
      <div className="p-6 bg-info-lighter border border-info-light rounded-lg text-center text-info-dark flex flex-col items-center justify-center min-h-[200px] shadow-md">
        <Info size={28} className="mb-2" />
        <p className="font-medium">Please upload SMS data files to view the activity timeline.</p>
      </div>
    );
  }
  
  if (dailySMSActivity.length === 0 && !contextIsLoading) {
    return (
      <div className="p-6 bg-neutral-lightest border border-neutral-light rounded-lg text-center text-textSecondary flex flex-col items-center justify-center min-h-[200px] shadow-md">
        <Activity size={28} className="mb-2 text-neutral-DEFAULT" />
        <p>No SMS activity found for the current filters.</p>
        <p className="text-xs mt-1">Try adjusting global filters or ensure data has timestamps.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="p-4 sm:p-5 bg-surface border border-neutral-light rounded-xl shadow-xl">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center">
            <div>
                <div className="flex items-center text-xl sm:text-2xl font-semibold text-textPrimary mb-1">
                    <Activity size={24} className="mr-2.5 text-primary" /> SMS Activity Timeline
                </div>
                <p className="text-sm text-textSecondary">Daily breakdown of sent and received SMS messages.</p>
            </div>
            {dailySMSActivity.length > 0 && (
                <button 
                    onClick={handleExportData} 
                    className="mt-3 sm:mt-0 px-3.5 py-2 text-xs sm:text-sm bg-secondary text-white rounded-lg hover:bg-secondary-dark focus:outline-none focus:ring-2 focus:ring-secondary-light focus:ring-offset-1 flex items-center shadow-md hover:shadow-lg transition-all"
                >
                    <Download size={15} className="mr-1.5" /> Export Timeline Data
                </button>
            )}
        </div>
      </div>

      <div className="bg-surface p-4 sm:p-6 rounded-xl shadow-lg border border-neutral-light">
        <h3 className="text-base sm:text-lg font-semibold text-textPrimary mb-4 flex items-center">
          <CalendarDays size={18} className="mr-2 text-secondary"/>Daily SMS Volume
        </h3>
        <ResponsiveContainer width="100%" height={400}>
          <BarChart 
            data={dailySMSActivity} 
            margin={{ top: 5, right: 5, left: -20, bottom: 60 }}
          >
            <CartesianGrid strokeDasharray="3 3" opacity={0.5}/>
            <XAxis 
              dataKey="date" 
              tickFormatter={(dateStr) => formatDate(dateStr).split(' ')[0]} // Show only date part
              angle={-45} 
              textAnchor="end" 
              height={70} 
              interval={'preserveStartEnd'}
              tick={{fontSize: 10}}
            />
            <YAxis allowDecimals={false} tick={{fontSize: 10}} label={{ value: 'SMS Count', angle: -90, position: 'insideLeft', offset: 10, style:{fontSize: '11px'} }}/>
            <Tooltip 
              wrapperStyle={{fontSize: "12px", background: "rgba(255,255,255,0.95)", borderRadius: "4px", border: "1px solid #e5e7eb", boxShadow: "0 2px 10px rgba(0,0,0,0.1)"}}
              labelFormatter={(label) => formatDate(label).split(' ')[0]}
              formatter={(value, name) => [value, name === 'sent' ? 'Sent' : (name === 'received' ? 'Received' : 'Total')]}
            />
            <Legend wrapperStyle={{fontSize: "11px", paddingTop: "10px"}} iconSize={10}/>
            <Bar dataKey="sent" name="Sent" stackId="a" fill={CHART_COLORS.sent} radius={[4,4,0,0]} barSize={Math.max(15, Math.min(30, 400 / dailySMSActivity.length))} />
            <Bar dataKey="received" name="Received" stackId="a" fill={CHART_COLORS.received} radius={[4,4,0,0]} barSize={Math.max(15, Math.min(30, 400 / dailySMSActivity.length))} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export default SMSTimelineView;

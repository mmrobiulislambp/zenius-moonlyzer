
import React, { useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { MessageSquare, Send, Inbox, BarChart2 as BarChartIcon, TrendingUp, CalendarDays, Users } from 'lucide-react';
import { useSMSContext } from '../contexts/SMSContext';
import { SMSRecord } from '../types';
import { parseDateTime, formatDate } from '../utils/cdrUtils';

const CHART_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

interface DailySMSData {
  date: string;
  sent: number;
  received: number;
  total: number;
}

const AnalyticsCardSMS: React.FC<{ title: string; value: string | number; icon: React.ReactNode; children?: React.ReactNode }> = ({ title, value, icon, children }) => (
  <div className="bg-surface p-4 rounded-xl shadow-lg border border-neutral-light flex flex-col items-start hover:shadow-xl transition-shadow">
    <div className="flex items-center w-full mb-2">
      <div className="p-2.5 rounded-lg bg-primary-lighter/40 mr-3 shadow-sm">
        {icon}
      </div>
      <h3 className="text-sm font-semibold text-textPrimary">{title}</h3>
    </div>
    <p className="text-2xl font-bold text-textPrimary mb-1">{value}</p>
    {children && <div className="text-xs text-textSecondary w-full mt-1">{children}</div>}
  </div>
);

const SMSDashboardView: React.FC = () => {
  const { filteredSMSRecords } = useSMSContext();

  const summaryStats = useMemo(() => {
    const totalSMS = filteredSMSRecords.length;
    const sentSMS = filteredSMSRecords.filter(sms => sms.OriginalDirection === 'SMSMO').length;
    const receivedSMS = filteredSMSRecords.filter(sms => sms.OriginalDirection === 'SMSMT').length;
    
    const uniqueInitiators = new Set(filteredSMSRecords.map(sms => sms.Initiator)).size;
    const uniqueRecipients = new Set(filteredSMSRecords.map(sms => sms.Recipient)).size;

    return { totalSMS, sentSMS, receivedSMS, uniqueInitiators, uniqueRecipients };
  }, [filteredSMSRecords]);

  const dailySMSActivity = useMemo(() => {
    const dailyData: Record<string, { sent: number; received: number; total: number }> = {};
    filteredSMSRecords.forEach(sms => {
      const dateObj = parseDateTime(sms.Timestamp);
      if (dateObj) {
        const dateStr = dateObj.toISOString().split('T')[0]; // YYYY-MM-DD
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
  }, [filteredSMSRecords]);

  const topSenders = useMemo(() => {
    const senderCounts: Record<string, number> = {};
    filteredSMSRecords.filter(sms => sms.OriginalDirection === 'SMSMO').forEach(sms => {
      senderCounts[sms.Initiator] = (senderCounts[sms.Initiator] || 0) + 1;
    });
    return Object.entries(senderCounts)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 10);
  }, [filteredSMSRecords]);
  
  const topRecipients = useMemo(() => {
    const recipientCounts: Record<string, number> = {};
    filteredSMSRecords.filter(sms => sms.OriginalDirection === 'SMSMT').forEach(sms => {
      recipientCounts[sms.Recipient] = (recipientCounts[sms.Recipient] || 0) + 1;
    });
    return Object.entries(recipientCounts)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 10);
  }, [filteredSMSRecords]);


  if (filteredSMSRecords.length === 0) {
    return <div className="p-6 bg-neutral-lightest border border-neutral-light rounded-lg text-center text-textSecondary">No SMS data available for dashboard.</div>;
  }

  return (
    <div className="space-y-6">
      <div className="p-4 sm:p-5 bg-surface border border-neutral-light rounded-xl shadow-xl">
        <div className="flex items-center text-xl sm:text-2xl font-semibold text-textPrimary mb-1">
          <MessageSquare size={24} className="mr-2.5 text-primary" /> SMS Analytics Dashboard
        </div>
        <p className="text-sm text-textSecondary">Overview of SMS activity based on current filters.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
        <AnalyticsCardSMS title="Total SMS" value={summaryStats.totalSMS.toLocaleString()} icon={<MessageSquare size={20} className="text-primary"/>} />
        <AnalyticsCardSMS title="Sent SMS (SMSMO)" value={summaryStats.sentSMS.toLocaleString()} icon={<Send size={20} className="text-blue-500"/>} />
        <AnalyticsCardSMS title="Received SMS (SMSMT)" value={summaryStats.receivedSMS.toLocaleString()} icon={<Inbox size={20} className="text-green-500"/>} />
        <AnalyticsCardSMS title="Unique Numbers" value={(summaryStats.uniqueInitiators + summaryStats.uniqueRecipients).toLocaleString()} icon={<Users size={20} className="text-purple-500"/>}>
          Initiators: {summaryStats.uniqueInitiators}, Recipients: {summaryStats.uniqueRecipients}
        </AnalyticsCardSMS>
      </div>
      
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-surface p-4 sm:p-6 rounded-xl shadow-lg border border-neutral-light">
          <h3 className="text-base sm:text-lg font-semibold text-textPrimary mb-3 flex items-center">
            <CalendarDays size={18} className="mr-2 text-primary"/>Daily SMS Volume
          </h3>
          {dailySMSActivity.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={dailySMSActivity} margin={{ top: 5, right: 5, left: -20, bottom: 40 }}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.5}/>
                <XAxis dataKey="date" tickFormatter={(dateStr) => formatDate(dateStr).split(' ')[0]} angle={-30} textAnchor="end" height={50} tick={{fontSize: 10}}/>
                <YAxis allowDecimals={false} tick={{fontSize: 10}}/>
                <Tooltip wrapperStyle={{fontSize: "12px"}}/>
                <Legend wrapperStyle={{fontSize: "11px"}}/>
                <Bar dataKey="sent" name="Sent" stackId="a" fill={CHART_COLORS[0]} radius={[4,4,0,0]} barSize={20}/>
                <Bar dataKey="received" name="Received" stackId="a" fill={CHART_COLORS[1]} radius={[4,4,0,0]} barSize={20}/>
              </BarChart>
            </ResponsiveContainer>
          ) : <p className="text-textSecondary text-center py-10">No daily activity data.</p>}
        </div>

        <div className="bg-surface p-4 sm:p-6 rounded-xl shadow-lg border border-neutral-light">
          <h3 className="text-base sm:text-lg font-semibold text-textPrimary mb-3 flex items-center">
            <TrendingUp size={18} className="mr-2 text-secondary"/>Top Senders (SMSMO Initiators)
          </h3>
          {topSenders.length > 0 ? (
             <ResponsiveContainer width="100%" height={300}>
              <BarChart data={topSenders} layout="vertical" margin={{ top: 5, right: 20, left: 70, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.5} />
                <XAxis type="number" tick={{fontSize: 10}} allowDecimals={false}/>
                <YAxis type="category" dataKey="name" width={90} tick={{fontSize: 10, width: 85}} interval={0}/>
                <Tooltip wrapperStyle={{fontSize: "12px"}}/>
                <Legend wrapperStyle={{fontSize: "11px"}}/>
                <Bar dataKey="value" name="SMS Sent" fill={CHART_COLORS[2]} radius={[0,4,4,0]} barSize={15}/>
              </BarChart>
            </ResponsiveContainer>
          ) : <p className="text-textSecondary text-center py-10">No sender data.</p>}
        </div>

        <div className="bg-surface p-4 sm:p-6 rounded-xl shadow-lg border border-neutral-light lg:col-span-2">
          <h3 className="text-base sm:text-lg font-semibold text-textPrimary mb-3 flex items-center">
            <TrendingUp size={18} className="mr-2 text-accent"/>Top Recipients (SMSMT Recipients)
          </h3>
          {topRecipients.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={topRecipients} layout="vertical" margin={{ top: 5, right: 20, left: 70, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.5}/>
                <XAxis type="number" tick={{fontSize: 10}} allowDecimals={false}/>
                <YAxis type="category" dataKey="name" width={90} tick={{fontSize: 10, width: 85}} interval={0}/>
                <Tooltip wrapperStyle={{fontSize: "12px"}}/>
                <Legend wrapperStyle={{fontSize: "11px"}}/>
                <Bar dataKey="value" name="SMS Received" fill={CHART_COLORS[3]} radius={[0,4,4,0]} barSize={15}/>
              </BarChart>
            </ResponsiveContainer>
          ) : <p className="text-textSecondary text-center py-10">No recipient data.</p>}
        </div>
      </div>
    </div>
  );
};

export default SMSDashboardView;

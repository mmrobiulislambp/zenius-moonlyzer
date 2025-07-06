
import React, { useMemo } from 'react';
import { LayoutDashboard, Info, Download, DollarSign, TrendingUp, ArrowRightLeft, Users, CalendarDays, PieChart as PieChartRechartsIcon, BarChart2 as BarChartRechartsIcon, Activity as LineChartIcon, Pocket } from 'lucide-react';
import { useBkashContext } from '../contexts/BkashContext';
import { BkashRecord } from '../types';
import { formatDate, parseDateTime } from '../utils/cdrUtils';
import { downloadCSV } from '../utils/downloadUtils';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, PieChart, Pie, Cell, LineChart, Line } from 'recharts';

const CHART_COLORS = ['#ec4899', '#ef4444', '#f97316', '#eab308', '#22c55e', '#0ea5e9', '#6366f1', '#db2777', '#d97706', '#ca8a04']; // Pink/Rose theme variations

const formatCurrency = (amount?: number, currency = 'BDT') => {
  if (amount === undefined || amount === null || isNaN(amount)) return 'N/A';
  return `${currency} ${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const AnalyticsCard: React.FC<{ title: string; value: string | number; icon: React.ReactNode; children?: React.ReactNode; iconBgColor?: string }> = ({ title, value, icon, children, iconBgColor = 'bg-pink-100/40' }) => (
  <div className="bg-surface p-4 rounded-xl shadow-lg border border-neutral-light flex flex-col items-start hover:shadow-xl transition-shadow">
    <div className="flex items-center w-full mb-2">
      <div className={`p-2.5 rounded-lg ${iconBgColor} mr-3 shadow-sm`}>
        {icon}
      </div>
      <h3 className="text-sm font-semibold text-textPrimary">{title}</h3>
    </div>
    <p className="text-2xl font-bold text-textPrimary mb-1">{value}</p>
    {children && <div className="text-xs text-textSecondary w-full mt-1">{children}</div>}
  </div>
);

interface DailyTxData {
  date: string;
  sentCount: number; // Debit
  receivedCount: number; // Credit
  totalCount: number;
  sentAmount: number;
  receivedAmount: number;
}

const BkashTransactionDashboard: React.FC = () => {
  const { globallyFilteredBkashRecords, isLoading, uploadedBkashFiles } = useBkashContext();

  const summaryStats = useMemo(() => {
    if (isLoading || globallyFilteredBkashRecords.length === 0) {
      return {
        totalTransactions: 0, totalSentAmount: 0, totalReceivedAmount: 0, netFlow: 0,
        uniquePartners: 0, firstTransactionDate: 'N/A', lastTransactionDate: 'N/A',
      };
    }

    let totalSent = 0;
    let totalReceived = 0;
    const partners = new Set<string>();
    let firstDate: Date | null = null;
    let lastDate: Date | null = null;

    globallyFilteredBkashRecords.forEach(r => {
      if (r.transactionDirection === 'DEBIT') totalSent += r.transactedAmount;
      if (r.transactionDirection === 'CREDIT') totalReceived += r.transactedAmount;
      
      if (r.sender && r.sender.trim() !== '' && r.sender.toLowerCase() !== 'system') partners.add(r.sender);
      if (r.receiver && r.receiver.trim() !== '' && r.receiver.toLowerCase() !== 'system') partners.add(r.receiver);

      const recordDate = parseDateTime(r.transactionDate);
      if (recordDate) {
        if (!firstDate || recordDate < firstDate) firstDate = recordDate;
        if (!lastDate || recordDate > lastDate) lastDate = recordDate;
      }
    });

    return {
      totalTransactions: globallyFilteredBkashRecords.length,
      totalSentAmount: totalSent,
      totalReceivedAmount: totalReceived,
      netFlow: totalReceived - totalSent,
      uniquePartners: partners.size,
      firstTransactionDate: firstDate ? formatDate(firstDate.toISOString()).split(' ')[0] : 'N/A',
      lastTransactionDate: lastDate ? formatDate(lastDate.toISOString()).split(' ')[0] : 'N/A',
    };
  }, [globallyFilteredBkashRecords, isLoading]);

  const dailyTransactionData = useMemo((): DailyTxData[] => {
    const dailyDataMap: Record<string, DailyTxData> = {};
    globallyFilteredBkashRecords.forEach(r => {
      const dateObj = parseDateTime(r.transactionDate);
      if (dateObj) {
        const dateStr = dateObj.toISOString().split('T')[0];
        if (!dailyDataMap[dateStr]) {
          dailyDataMap[dateStr] = { date: dateStr, sentCount: 0, receivedCount: 0, totalCount: 0, sentAmount: 0, receivedAmount: 0 };
        }
        dailyDataMap[dateStr].totalCount++;
        if (r.transactionDirection === 'DEBIT') {
          dailyDataMap[dateStr].sentCount++;
          dailyDataMap[dateStr].sentAmount += r.transactedAmount;
        } else if (r.transactionDirection === 'CREDIT') {
          dailyDataMap[dateStr].receivedCount++;
          dailyDataMap[dateStr].receivedAmount += r.transactedAmount;
        }
      }
    });
    return Object.values(dailyDataMap).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }, [globallyFilteredBkashRecords]);
  
  const transactionTypeDistribution = useMemo(() => {
    const counts: Record<string, number> = {};
    globallyFilteredBkashRecords.forEach(r => {
      counts[r.trxType || "Unknown"] = (counts[r.trxType || "Unknown"] || 0) + 1;
    });
    return Object.entries(counts).map(([name, value]) => ({ name, value })).sort((a,b) => b.value - a.value);
  }, [globallyFilteredBkashRecords]);

  const topSenders = useMemo(() => {
    const senderCounts: Record<string, {count: number, volume: number}> = {};
    globallyFilteredBkashRecords.filter(r => r.transactionDirection === 'DEBIT' && r.sender).forEach(r => {
        senderCounts[r.sender] = senderCounts[r.sender] || {count: 0, volume: 0};
        senderCounts[r.sender].count++;
        senderCounts[r.sender].volume += r.transactedAmount;
    });
    return Object.entries(senderCounts).map(([name, data]) => ({name, count: data.count, volume: data.volume})).sort((a,b) => b.count - a.count).slice(0,10);
  }, [globallyFilteredBkashRecords]);

  const topReceivers = useMemo(() => {
    const receiverCounts: Record<string, {count: number, volume: number}> = {};
    globallyFilteredBkashRecords.filter(r => r.transactionDirection === 'CREDIT' && r.receiver).forEach(r => {
        receiverCounts[r.receiver] = receiverCounts[r.receiver] || {count: 0, volume: 0};
        receiverCounts[r.receiver].count++;
        receiverCounts[r.receiver].volume += r.transactedAmount;
    });
    return Object.entries(receiverCounts).map(([name, data]) => ({name, count: data.count, volume: data.volume})).sort((a,b) => b.count - a.count).slice(0,10);
  }, [globallyFilteredBkashRecords]);

  const balanceTrendData = useMemo(() => {
    return globallyFilteredBkashRecords
      .map(r => {
          const parsedDate = parseDateTime(r.transactionDate);
          if (parsedDate && typeof r.balance === 'number') {
              return {
                  date: parsedDate.getTime(),
                  balance: r.balance,
                  tooltipDate: formatDate(r.transactionDate), // Original string for formatting
              };
          }
          return null; 
      })
      .filter(item => item !== null)
      .sort((a,b) => a!.date - b!.date) as { date: number; balance: number; tooltipDate: string }[];
  }, [globallyFilteredBkashRecords]);

  const handleExportData = (chartName: string, data: any[], headers: string[]) => {
    if (data.length === 0) { alert(`No data to export for ${chartName}.`); return; }
    const csvData = data.map(item => headers.map(header => String(item[header.toLowerCase().replace(/\s+/g, '')] ?? item[header] ?? 'N/A')));
    downloadCSV(`bkash_dashboard_${chartName.toLowerCase().replace(/\s+/g, '_')}.csv`, csvData, headers);
  };

  if (isLoading && uploadedBkashFiles.length === 0) {
    return (
      <div className="flex justify-center items-center h-64">
        <LayoutDashboard size={32} className="animate-pulse text-pink-500" />
        <p className="ml-3 text-textSecondary">Loading bKash Dashboard...</p>
      </div>
    );
  }
  if (uploadedBkashFiles.length === 0) {
    return (
       <div className="p-6 bg-info-lighter border border-info-light rounded-lg text-center text-info-dark flex flex-col items-center justify-center min-h-[200px] shadow-md">
        <Info size={28} className="mb-2" />
        <p className="font-medium">Please upload bKash statement files to view the transaction dashboard.</p>
      </div>
    );
  }
  if (globallyFilteredBkashRecords.length === 0 && !isLoading) {
     return (
       <div className="p-6 bg-neutral-lightest border border-neutral-light rounded-lg text-center text-textSecondary flex flex-col items-center justify-center min-h-[200px] shadow-md">
        <Info size={28} className="mb-2 text-neutral-DEFAULT" />
        <p>No bKash records match the current filters. Please adjust or clear filters.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="p-4 sm:p-5 bg-surface border border-neutral-light rounded-xl shadow-xl">
        <div className="flex items-center text-xl sm:text-2xl font-semibold text-textPrimary mb-1">
          <Pocket size={24} className="mr-2.5 text-pink-500" /> bKash Transaction Dashboard
        </div>
        <p className="text-sm text-textSecondary">Summary and trends from bKash transaction data.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-5">
        <AnalyticsCard title="Total Transactions" value={summaryStats.totalTransactions.toLocaleString()} icon={<TrendingUp size={20} className="text-pink-500"/>} />
        <AnalyticsCard title="Total Sent" value={formatCurrency(summaryStats.totalSentAmount)} icon={<DollarSign size={20} className="text-red-500"/>} iconBgColor="bg-red-100/50"/>
        <AnalyticsCard title="Total Received" value={formatCurrency(summaryStats.totalReceivedAmount)} icon={<DollarSign size={20} className="text-green-500"/>} iconBgColor="bg-green-100/50"/>
        <AnalyticsCard title="Net Flow" value={formatCurrency(summaryStats.netFlow)} icon={<ArrowRightLeft size={20} className="text-blue-500"/>} iconBgColor="bg-blue-100/50"/>
        <AnalyticsCard title="Unique Partners" value={summaryStats.uniquePartners.toLocaleString()} icon={<Users size={20} className="text-purple-500"/>} iconBgColor="bg-purple-100/50"/>
      </div>
       <div className="p-3 bg-pink-50 border border-pink-200 rounded-lg text-center text-xs text-pink-700">
          Data from <strong className="font-semibold">{summaryStats.firstTransactionDate}</strong> to <strong className="font-semibold">{summaryStats.lastTransactionDate}</strong>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-surface p-4 sm:p-6 rounded-xl shadow-lg border border-neutral-light">
          <div className="flex justify-between items-center mb-3"><h3 className="text-base font-semibold text-textPrimary flex items-center"><BarChartRechartsIcon size={18} className="mr-2 text-pink-500"/>Daily Transactions</h3><button onClick={() => handleExportData('DailyVolume', dailyTransactionData, ['date', 'sentCount', 'receivedCount', 'totalCount', 'sentAmount', 'receivedAmount'])} className="px-2.5 py-1.5 text-xs bg-pink-100 text-pink-700 rounded-md hover:bg-pink-200/70 font-medium flex items-center shadow-sm"><Download size={13} className="mr-1"/>Export</button></div>
          {dailyTransactionData.length > 0 ? <ResponsiveContainer width="100%" height={300}>
            <BarChart data={dailyTransactionData} margin={{top: 5, right: 5, left: -25, bottom: 45}}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.5}/>
              <XAxis dataKey="date" tickFormatter={(dateStr) => formatDate(dateStr).split(' ')[0]} angle={-30} textAnchor="end" height={55} tick={{fontSize: 10}}/>
              <YAxis yAxisId="left" orientation="left" stroke={CHART_COLORS[0]} allowDecimals={false} tick={{fontSize: 10}} label={{value: 'Txn Count', angle: -90, position: 'insideLeft', offset: 10, style:{fontSize:'10px'}}}/>
              <YAxis yAxisId="right" orientation="right" stroke={CHART_COLORS[1]} tickFormatter={(value) => formatCurrency(value,'').replace(' BDT','')} allowDecimals={false} tick={{fontSize: 10}} label={{value: 'Amount', angle: -90, position: 'insideRight', offset: 10, style:{fontSize:'10px'}}}/>
              <Tooltip wrapperStyle={{fontSize: "12px"}} labelFormatter={(label) => formatDate(label).split(' ')[0]} formatter={(value: number, name: string) => [name.includes("Amount") ? formatCurrency(value) : value, name.replace("sent","Sent ").replace("received","Rcvd ").replace("Count"," Cnt").replace("Amount"," Amt")]}/>
              <Legend wrapperStyle={{fontSize: "11px"}} iconSize={10}/>
              <Bar yAxisId="left" dataKey="sentCount" name="Sent Cnt" stackId="count" fill={CHART_COLORS[0]} radius={[3,3,0,0]} barSize={15}/>
              <Bar yAxisId="left" dataKey="receivedCount" name="Rcvd Cnt" stackId="count" fill={CHART_COLORS[1]} radius={[3,3,0,0]} barSize={15}/>
            </BarChart>
          </ResponsiveContainer> : <p className="text-xs text-textSecondary text-center py-10">No daily volume data.</p>}
        </div>

        <div className="bg-surface p-4 sm:p-6 rounded-xl shadow-lg border border-neutral-light">
          <div className="flex justify-between items-center mb-3"><h3 className="text-base font-semibold text-textPrimary flex items-center"><LineChartIcon size={18} className="mr-2 text-rose-500"/>Balance Trend</h3><button onClick={() => handleExportData('BalanceTrend', balanceTrendData, ['tooltipDate', 'balance'])} className="px-2.5 py-1.5 text-xs bg-rose-100 text-rose-700 rounded-md hover:bg-rose-200/70 font-medium flex items-center shadow-sm"><Download size={13} className="mr-1"/>Export</button></div>
          {balanceTrendData.length > 1 ? <ResponsiveContainer width="100%" height={300}>
            <LineChart data={balanceTrendData} margin={{top: 5, right: 5, left: 0, bottom: 5}}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.5}/>
              <XAxis dataKey="date" type="number" domain={['dataMin', 'dataMax']} tickFormatter={(unixTime) => formatDate(new Date(unixTime).toISOString()).split(' ')[0]} tick={{fontSize: 10}}/>
              <YAxis tickFormatter={(value) => formatCurrency(value, '').replace(' BDT','')} tick={{fontSize: 10}} domain={['auto', 'auto']}/>
              <Tooltip wrapperStyle={{fontSize: "12px"}} labelFormatter={(label) => formatDate(new Date(label).toISOString())} formatter={(value: number) => [formatCurrency(value), "Balance"]}/>
              <Legend wrapperStyle={{fontSize: "11px"}} iconSize={10}/>
              <Line type="monotone" dataKey="balance" stroke={CHART_COLORS[2]} strokeWidth={2} dot={{r:2}} activeDot={{r:5}} name="Balance"/>
            </LineChart>
          </ResponsiveContainer> : <p className="text-xs text-textSecondary text-center py-10">Not enough data for balance trend.</p>}
        </div>
        
        <div className="bg-surface p-4 sm:p-6 rounded-xl shadow-lg border border-neutral-light">
          <div className="flex justify-between items-center mb-3"><h3 className="text-base font-semibold text-textPrimary flex items-center"><PieChartRechartsIcon size={18} className="mr-2 text-fuchsia-500"/>Transaction Type Distribution</h3><button onClick={() => handleExportData('TxnTypeDist', transactionTypeDistribution, ['name', 'value'])} className="px-2.5 py-1.5 text-xs bg-fuchsia-100 text-fuchsia-700 rounded-md hover:bg-fuchsia-200/70 font-medium flex items-center shadow-sm"><Download size={13} className="mr-1"/>Export</button></div>
          {transactionTypeDistribution.length > 0 ? <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie data={transactionTypeDistribution} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={100} labelLine={false} label={({name, percent}) => `${name} (${(percent*100).toFixed(0)}%)`} legendType="circle">
                {transactionTypeDistribution.map((_entry, index) => <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />)}
              </Pie>
              <Tooltip wrapperStyle={{fontSize: "12px"}}/>
              <Legend wrapperStyle={{fontSize: "11px", paddingTop: "10px"}} iconSize={10}/>
            </PieChart>
          </ResponsiveContainer> : <p className="text-xs text-textSecondary text-center py-10">No transaction type data.</p>}
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 lg:col-span-2">
            <div className="bg-surface p-4 sm:p-6 rounded-xl shadow-lg border border-neutral-light">
              <div className="flex justify-between items-center mb-3"><h3 className="text-base font-semibold text-textPrimary flex items-center"><TrendingUp size={18} className="mr-2 text-pink-400"/>Top Senders (by Txn Count)</h3><button onClick={() => handleExportData('TopSenders', topSenders, ['name', 'count', 'volume'])} className="px-2.5 py-1.5 text-xs bg-pink-100 text-pink-700 rounded-md hover:bg-pink-200/70 font-medium flex items-center shadow-sm"><Download size={13} className="mr-1"/>Export</button></div>
              {topSenders.length > 0 ? (
                 <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={topSenders} layout="vertical" margin={{ top: 5, right: 15, left: 60, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.5} />
                    <XAxis type="number" dataKey="count" tick={{fontSize: 9}} allowDecimals={false}/>
                    <YAxis type="category" dataKey="name" width={80} tick={{fontSize: 9, width: 75}} interval={0}/>
                    <Tooltip wrapperStyle={{fontSize: "11px"}} formatter={(value: number, name: string) => [value, name === 'count' ? 'Txn Count' : 'Total Volume']}/>
                    <Bar dataKey="count" name="Txn Count" fill={CHART_COLORS[4]} radius={[0,3,3,0]} barSize={12}/>
                  </BarChart>
                </ResponsiveContainer>
              ) : <p className="text-xs text-textSecondary text-center py-10">No sender data.</p>}
            </div>
             <div className="bg-surface p-4 sm:p-6 rounded-xl shadow-lg border border-neutral-light">
              <div className="flex justify-between items-center mb-3"><h3 className="text-base font-semibold text-textPrimary flex items-center"><TrendingUp size={18} className="mr-2 text-rose-400"/>Top Receivers (by Txn Count)</h3><button onClick={() => handleExportData('TopReceivers', topReceivers, ['name', 'count', 'volume'])} className="px-2.5 py-1.5 text-xs bg-rose-100 text-rose-700 rounded-md hover:bg-rose-200/70 font-medium flex items-center shadow-sm"><Download size={13} className="mr-1"/>Export</button></div>
              {topReceivers.length > 0 ? (
                 <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={topReceivers} layout="vertical" margin={{ top: 5, right: 15, left: 60, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.5} />
                    <XAxis type="number" dataKey="count" tick={{fontSize: 9}} allowDecimals={false}/>
                    <YAxis type="category" dataKey="name" width={80} tick={{fontSize: 9, width: 75}} interval={0}/>
                    <Tooltip wrapperStyle={{fontSize: "11px"}} formatter={(value: number, name: string) => [value, name === 'count' ? 'Txn Count' : 'Total Volume']}/>
                    <Bar dataKey="count" name="Txn Count" fill={CHART_COLORS[5]} radius={[0,3,3,0]} barSize={12}/>
                  </BarChart>
                </ResponsiveContainer>
              ) : <p className="text-xs text-textSecondary text-center py-10">No receiver data.</p>}
            </div>
        </div>


      </div>
    </div>
  );
};

export default BkashTransactionDashboard;
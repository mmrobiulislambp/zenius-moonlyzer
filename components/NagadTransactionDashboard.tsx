
import React, { useMemo } from 'react';
import { LayoutDashboard, Info, Download, DollarSign, TrendingUp, ArrowRightLeft, Tv2, Users, CalendarDays, PieChart as PieChartRechartsIcon, BarChart2 as BarChartRechartsIcon, Activity as LineChartIcon } from 'lucide-react';
import { useNagadContext } from '../contexts/NagadContext';
import { NagadRecord } from '../types';
import { formatDate, parseDateTime } from '../utils/cdrUtils';
import { downloadCSV } from '../utils/downloadUtils';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, PieChart, Pie, Cell, LineChart, Line } from 'recharts';

const CHART_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#6366f1', '#f97316', '#06b6d4', '#d946ef'];

const formatCurrency = (amount?: number, currency = 'BDT') => {
  if (amount === undefined || amount === null || isNaN(amount)) return 'N/A';
  return `${currency} ${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const AnalyticsCard: React.FC<{ title: string; value: string | number; icon: React.ReactNode; children?: React.ReactNode; iconBgColor?: string }> = ({ title, value, icon, children, iconBgColor = 'bg-primary-lighter/40' }) => (
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
  creditCount: number;
  debitCount: number;
  totalCount: number;
  creditAmount: number;
  debitAmount: number;
}

const NagadTransactionDashboard: React.FC = () => {
  const { globallyFilteredNagadRecords, isLoading, uploadedNagadFiles } = useNagadContext();

  const summaryStats = useMemo(() => {
    if (isLoading || globallyFilteredNagadRecords.length === 0) {
      return {
        totalTransactions: 0, totalCreditAmount: 0, totalDebitAmount: 0, netFlow: 0,
        uniquePartners: 0, firstTransactionDate: 'N/A', lastTransactionDate: 'N/A',
      };
    }

    let totalCredit = 0;
    let totalDebit = 0;
    const partners = new Set<string>();
    let firstDate: Date | null = null;
    let lastDate: Date | null = null;

    globallyFilteredNagadRecords.forEach(r => {
      if (r.TXN_TYPE_DR_CR === 'CREDIT') totalCredit += r.TXN_AMT;
      if (r.TXN_TYPE_DR_CR === 'DEBIT') totalDebit += r.TXN_AMT;
      if (r.TXN_WITH_ACC) partners.add(r.TXN_WITH_ACC);

      const recordDate = parseDateTime(r.TXN_DATE_TIME);
      if (recordDate) {
        if (!firstDate || recordDate < firstDate) firstDate = recordDate;
        if (!lastDate || recordDate > lastDate) lastDate = recordDate;
      }
    });

    return {
      totalTransactions: globallyFilteredNagadRecords.length,
      totalCreditAmount: totalCredit,
      totalDebitAmount: totalDebit,
      netFlow: totalCredit - totalDebit,
      uniquePartners: partners.size,
      firstTransactionDate: firstDate ? formatDate(firstDate.toISOString()).split(' ')[0] : 'N/A',
      lastTransactionDate: lastDate ? formatDate(lastDate.toISOString()).split(' ')[0] : 'N/A',
    };
  }, [globallyFilteredNagadRecords, isLoading]);

  const dailyTransactionData = useMemo((): DailyTxData[] => {
    const dailyDataMap: Record<string, DailyTxData> = {};
    globallyFilteredNagadRecords.forEach(r => {
      const dateObj = parseDateTime(r.TXN_DATE_TIME);
      if (dateObj) {
        const dateStr = dateObj.toISOString().split('T')[0];
        if (!dailyDataMap[dateStr]) {
          dailyDataMap[dateStr] = { date: dateStr, creditCount: 0, debitCount: 0, totalCount: 0, creditAmount: 0, debitAmount: 0 };
        }
        dailyDataMap[dateStr].totalCount++;
        if (r.TXN_TYPE_DR_CR === 'CREDIT') {
          dailyDataMap[dateStr].creditCount++;
          dailyDataMap[dateStr].creditAmount += r.TXN_AMT;
        } else if (r.TXN_TYPE_DR_CR === 'DEBIT') {
          dailyDataMap[dateStr].debitCount++;
          dailyDataMap[dateStr].debitAmount += r.TXN_AMT;
        }
      }
    });
    return Object.values(dailyDataMap).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }, [globallyFilteredNagadRecords]);
  
  const transactionTypeDistribution = useMemo(() => {
    const counts: Record<string, number> = {};
    globallyFilteredNagadRecords.forEach(r => {
      counts[r.TXN_TYPE || "Unknown"] = (counts[r.TXN_TYPE || "Unknown"] || 0) + 1;
    });
    return Object.entries(counts).map(([name, value]) => ({ name, value })).sort((a,b) => b.value - a.value);
  }, [globallyFilteredNagadRecords]);

  const channelDistribution = useMemo(() => {
    const counts: Record<string, number> = {};
    globallyFilteredNagadRecords.forEach(r => {
      counts[r.CHANNEL || "Unknown"] = (counts[r.CHANNEL || "Unknown"] || 0) + 1;
    });
    return Object.entries(counts).map(([name, value]) => ({ name, value })).sort((a,b) => b.value - a.value);
  }, [globallyFilteredNagadRecords]);
  
  const balanceTrendData = useMemo(() => {
    return globallyFilteredNagadRecords
      .map(r => {
          const parsedDate = parseDateTime(r.TXN_DATE_TIME);
          if (parsedDate && typeof r.AVAILABLE_BLC_AFTER_TXN === 'number') {
              return {
                  date: parsedDate.getTime(),
                  balance: r.AVAILABLE_BLC_AFTER_TXN,
                  tooltipDate: formatDate(r.TXN_DATE_TIME), 
              };
          }
          return null; 
      })
      .filter(item => item !== null)
      .sort((a,b) => a!.date - b!.date) as { date: number; balance: number; tooltipDate: string }[];
  }, [globallyFilteredNagadRecords]);

  const handleExportData = (chartName: string, data: any[], headers: string[]) => {
    if (data.length === 0) { alert(`No data to export for ${chartName}.`); return; }
    const csvData = data.map(item => headers.map(header => String(item[header.toLowerCase().replace(/\s+/g, '')] ?? item[header] ?? 'N/A')));
    downloadCSV(`nagad_dashboard_${chartName.toLowerCase().replace(/\s+/g, '_')}.csv`, csvData, headers);
  };

  if (isLoading && uploadedNagadFiles.length === 0) { 
    return (
      <div className="flex justify-center items-center h-64">
        <LayoutDashboard size={32} className="animate-pulse text-primary" />
        <p className="ml-3 text-textSecondary">Loading Nagad Dashboard...</p>
      </div>
    );
  }

  if (uploadedNagadFiles.length === 0) {
    return (
       <div className="p-6 bg-info-lighter border border-info-light rounded-lg text-center text-info-dark flex flex-col items-center justify-center min-h-[200px] shadow-md">
        <Info size={28} className="mb-2" />
        <p className="font-medium">Please upload Nagad statement files to view the transaction dashboard.</p>
      </div>
    );
  }
  
  if (globallyFilteredNagadRecords.length === 0 && !isLoading) {
     return (
       <div className="p-6 bg-neutral-lightest border border-neutral-light rounded-lg text-center text-textSecondary flex flex-col items-center justify-center min-h-[200px] shadow-md">
        <Info size={28} className="mb-2 text-neutral-DEFAULT" />
        <p>No Nagad records match the current filters. Please adjust filters to see the dashboard.</p>
      </div>
    );
  }


  return (
    <div className="space-y-6">
      <div className="p-4 sm:p-5 bg-surface border border-neutral-light rounded-xl shadow-xl">
        <div className="flex items-center text-xl sm:text-2xl font-semibold text-textPrimary mb-1">
          <LayoutDashboard size={24} className="mr-2.5 text-primary" /> Nagad Transaction Dashboard
        </div>
        <p className="text-sm text-textSecondary">Summary and trends from Nagad transaction data.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-5">
        <AnalyticsCard title="Total Transactions" value={summaryStats.totalTransactions.toLocaleString()} icon={<TrendingUp size={20} className="text-primary"/>} />
        <AnalyticsCard title="Total Credit" value={formatCurrency(summaryStats.totalCreditAmount)} icon={<DollarSign size={20} className="text-success-dark"/>} iconBgColor="bg-success-lighter/50"/>
        <AnalyticsCard title="Total Debit" value={formatCurrency(summaryStats.totalDebitAmount)} icon={<DollarSign size={20} className="text-danger-dark"/>} iconBgColor="bg-danger-lighter/50"/>
        <AnalyticsCard title="Net Flow" value={formatCurrency(summaryStats.netFlow)} icon={<ArrowRightLeft size={20} className="text-info-dark"/>} iconBgColor="bg-info-lighter/50"/>
        <AnalyticsCard title="Unique Partners" value={summaryStats.uniquePartners.toLocaleString()} icon={<Users size={20} className="text-purple-500"/>} iconBgColor="bg-purple-200/50"/>
      </div>
       <div className="p-3 bg-neutral-lightest border border-neutral-light rounded-lg text-center text-xs text-textSecondary">
          Data from <strong className="text-primary-dark">{summaryStats.firstTransactionDate}</strong> to <strong className="text-primary-dark">{summaryStats.lastTransactionDate}</strong>
      </div>


      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-surface p-4 sm:p-6 rounded-xl shadow-lg border border-neutral-light">
          <div className="flex justify-between items-center mb-3"><h3 className="text-base font-semibold text-textPrimary flex items-center"><BarChartRechartsIcon size={18} className="mr-2 text-primary"/>Daily Transaction Volume</h3><button onClick={() => handleExportData('DailyVolume', dailyTransactionData, ['date', 'creditCount', 'debitCount', 'totalCount', 'creditAmount', 'debitAmount'])} className="px-2.5 py-1.5 text-xs bg-primary-lighter/50 text-primary-dark rounded-md hover:bg-primary-lighter/70 font-medium flex items-center shadow-sm"><Download size={13} className="mr-1"/>Export</button></div>
          {dailyTransactionData.length > 0 ? <ResponsiveContainer width="100%" height={300}>
            <BarChart data={dailyTransactionData} margin={{top: 5, right: 5, left: -25, bottom: 45}}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.5}/>
              <XAxis dataKey="date" tickFormatter={(dateStr) => formatDate(dateStr).split(' ')[0]} angle={-30} textAnchor="end" height={55} tick={{fontSize: 10}}/>
              <YAxis yAxisId="left" orientation="left" stroke={CHART_COLORS[0]} allowDecimals={false} tick={{fontSize: 10}} label={{value: 'Txn Count', angle: -90, position: 'insideLeft', offset: 10, style:{fontSize:'10px'}}}/>
              <YAxis yAxisId="right" orientation="right" stroke={CHART_COLORS[1]} tickFormatter={(value) => formatCurrency(value,'').replace(' BDT','')} allowDecimals={false} tick={{fontSize: 10}} label={{value: 'Amount', angle: -90, position: 'insideRight', offset: 10, style:{fontSize:'10px'}}}/>
              <Tooltip wrapperStyle={{fontSize: "12px"}} labelFormatter={(label) => formatDate(label).split(' ')[0]} formatter={(value: number, name: string) => [name.includes("Amount") ? formatCurrency(value) : value, name.replace("Count"," Cnt").replace("Amount"," Amt")]}/>
              <Legend wrapperStyle={{fontSize: "11px"}} iconSize={10}/>
              <Bar yAxisId="left" dataKey="creditCount" name="Credit Cnt" stackId="count" fill={CHART_COLORS[0]} radius={[3,3,0,0]} barSize={15}/>
              <Bar yAxisId="left" dataKey="debitCount" name="Debit Cnt" stackId="count" fill={CHART_COLORS[1]} radius={[3,3,0,0]} barSize={15}/>
            </BarChart>
          </ResponsiveContainer> : <p className="text-xs text-textSecondary text-center py-10">No daily volume data.</p>}
        </div>

        <div className="bg-surface p-4 sm:p-6 rounded-xl shadow-lg border border-neutral-light">
          <div className="flex justify-between items-center mb-3"><h3 className="text-base font-semibold text-textPrimary flex items-center"><LineChartIcon size={18} className="mr-2 text-accent"/>Balance Trend</h3><button onClick={() => handleExportData('BalanceTrend', balanceTrendData, ['tooltipDate', 'balance'])} className="px-2.5 py-1.5 text-xs bg-accent-lighter/50 text-accent-dark rounded-md hover:bg-accent-lighter/70 font-medium flex items-center shadow-sm"><Download size={13} className="mr-1"/>Export</button></div>
          {balanceTrendData.length > 1 ? <ResponsiveContainer width="100%" height={300}>
            <LineChart data={balanceTrendData} margin={{top: 5, right: 5, left: 0, bottom: 5}}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.5}/>
              <XAxis dataKey="date" type="number" domain={['dataMin', 'dataMax']} tickFormatter={(unixTime) => formatDate(new Date(unixTime).toISOString()).split(' ')[0]} tick={{fontSize: 10}}/>
              <YAxis tickFormatter={(value) => formatCurrency(value, '').replace(' BDT','')} tick={{fontSize: 10}} domain={['auto', 'auto']}/>
              <Tooltip wrapperStyle={{fontSize: "12px"}} labelFormatter={(label) => formatDate(new Date(label).toISOString())} formatter={(value: number) => [formatCurrency(value), "Balance"]}/>
              <Legend wrapperStyle={{fontSize: "11px"}} iconSize={10}/>
              <Line type="monotone" dataKey="balance" stroke={CHART_COLORS[2]} strokeWidth={2} dot={{r:2}} activeDot={{r:5}} name="Available Balance"/>
            </LineChart>
          </ResponsiveContainer> : <p className="text-xs text-textSecondary text-center py-10">Not enough data points for a balance trend.</p>}
        </div>
        
        <div className="bg-surface p-4 sm:p-6 rounded-xl shadow-lg border border-neutral-light">
          <div className="flex justify-between items-center mb-3"><h3 className="text-base font-semibold text-textPrimary flex items-center"><PieChartRechartsIcon size={18} className="mr-2 text-purple-500"/>Transaction Type Distribution</h3><button onClick={() => handleExportData('TxnTypeDist', transactionTypeDistribution, ['name', 'value'])} className="px-2.5 py-1.5 text-xs bg-purple-200/50 text-purple-700 rounded-md hover:bg-purple-200/70 font-medium flex items-center shadow-sm"><Download size={13} className="mr-1"/>Export</button></div>
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

        <div className="bg-surface p-4 sm:p-6 rounded-xl shadow-lg border border-neutral-light">
          <div className="flex justify-between items-center mb-3"><h3 className="text-base font-semibold text-textPrimary flex items-center"><Tv2 size={18} className="mr-2 text-pink-500"/>Channel Distribution</h3><button onClick={() => handleExportData('ChannelDist', channelDistribution, ['name', 'value'])} className="px-2.5 py-1.5 text-xs bg-pink-200/50 text-pink-700 rounded-md hover:bg-pink-200/70 font-medium flex items-center shadow-sm"><Download size={13} className="mr-1"/>Export</button></div>
          {channelDistribution.length > 0 ? <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie data={channelDistribution} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={100} labelLine={false} label={({name, percent}) => `${name} (${(percent*100).toFixed(0)}%)`}>
                {channelDistribution.map((_entry, index) => <Cell key={`cell-${index}`} fill={CHART_COLORS[(index + 2) % CHART_COLORS.length]} />)}
              </Pie>
              <Tooltip wrapperStyle={{fontSize: "12px"}}/>
              <Legend wrapperStyle={{fontSize: "11px", paddingTop: "10px"}} iconSize={10}/>
            </PieChart>
          </ResponsiveContainer> : <p className="text-xs text-textSecondary text-center py-10">No channel data.</p>}
        </div>
      </div>
    </div>
  );
};

export default NagadTransactionDashboard;
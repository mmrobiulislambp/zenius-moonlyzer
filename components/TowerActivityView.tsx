
import React, { useState, useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { SignalHigh, ListFilter, Users, Phone, Clock, MapPin, Info, ChevronDown, ChevronRight, TrendingUp, ChevronUp, Download } from 'lucide-react';
import { useCDRContext } from '../contexts/CDRContext';
import { CellTowerAnalyticsData } from '../types';
import { formatDate } from '../utils/cdrUtils';
import { downloadCSV } from '../utils/downloadUtils';
import GoogleMapView from './GoogleMapView';
import { MapMarkerData } from '../types';

const ROWS_PER_PAGE_TOWERS = 10;
const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];

const TowerActivityView: React.FC = () => {
  const { cellTowerAnalytics, isLoading, error, uploadedFiles, filesToAnalyze, activeFileTabId } = useCDRContext();
  const [selectedTower, setSelectedTower] = useState<CellTowerAnalyticsData | null>(null);
  const [sortConfig, setSortConfig] = useState<{ key: keyof CellTowerAnalyticsData | 'uniqueAPartiesCount' | 'uniqueBPartiesCount'; direction: 'ascending' | 'descending' }>({ key: 'recordCount', direction: 'descending' });
  const [currentPage, setCurrentPage] = useState(1);

  const sortedTowers = useMemo(() => {
    let sortableItems = [...cellTowerAnalytics];
    if (sortConfig.key) {
      sortableItems.sort((a, b) => {
        let valA, valB;
        if (sortConfig.key === 'uniqueAPartiesCount') valA = a.uniqueAParties.size;
        else if (sortConfig.key === 'uniqueBPartiesCount') valA = b.uniqueBParties.size;
        else valA = a[sortConfig.key as keyof CellTowerAnalyticsData];
        
        if (sortConfig.key === 'uniqueAPartiesCount') valB = b.uniqueAParties.size;
        else if (sortConfig.key === 'uniqueBPartiesCount') valB = b.uniqueBParties.size;
        else valB = b[sortConfig.key as keyof CellTowerAnalyticsData];

        if (typeof valA === 'string' && typeof valB === 'string') valA = valA.toLowerCase();
        if (typeof valB === 'string' && typeof valA === 'string') valB = valB.toLowerCase();
        if (valA instanceof Date && valB instanceof Date) { valA = valA.getTime(); valB = valB.getTime(); }
        if (valA === undefined || valA === null) valA = sortConfig.direction === 'ascending' ? Infinity : -Infinity;
        if (valB === undefined || valB === null) valB = sortConfig.direction === 'ascending' ? Infinity : -Infinity;

        if (valA < valB) return sortConfig.direction === 'ascending' ? -1 : 1;
        if (valA > valB) return sortConfig.direction === 'ascending' ? 1 : -1;
        return 0;
      });
    }
    return sortableItems;
  }, [cellTowerAnalytics, sortConfig]);
  
  const paginatedTowers = useMemo(() => {
    const startIndex = (currentPage - 1) * ROWS_PER_PAGE_TOWERS;
    return sortedTowers.slice(startIndex, startIndex + ROWS_PER_PAGE_TOWERS);
  }, [sortedTowers, currentPage]);

  const totalPages = Math.ceil(sortedTowers.length / ROWS_PER_PAGE_TOWERS);

  const requestSort = (key: keyof CellTowerAnalyticsData | 'uniqueAPartiesCount' | 'uniqueBPartiesCount') => {
    let direction: 'ascending' | 'descending' = 'ascending';
    if (sortConfig.key === key && sortConfig.direction === 'ascending') direction = 'descending';
    setSortConfig({ key, direction });
    setCurrentPage(1);
    setSelectedTower(null); 
  };

  const renderSortIcon = (key: string) => {
    if (sortConfig.key !== key) return <ChevronDown className="h-3.5 w-3.5 text-neutral-DEFAULT opacity-30 group-hover:opacity-100 transition-opacity" />;
    return sortConfig.direction === 'ascending' ? <ChevronUp className="h-3.5 w-3.5 text-primary-dark" /> : <ChevronDown className="h-3.5 w-3.5 text-primary-dark" />;
  };
  
  const peakActivityHoursForSelectedTower = useMemo(() => {
    if (!selectedTower || selectedTower.hourlyBreakdown.length === 0) return "N/A";
    const hourlyBreakdown = selectedTower.hourlyBreakdown;
    const totalCalls = hourlyBreakdown.reduce((sum, hourData) => sum + hourData.callCount, 0);
    if (totalCalls === 0) return "No significant activity";
    const averageCallsPerHour = totalCalls / 24;
    const significantThreshold = averageCallsPerHour * 1.2; 
    let peakHours: {hour: number, calls: number}[] = [];
    hourlyBreakdown.forEach(hourData => {
      if (hourData.callCount > significantThreshold || (hourData.callCount > 0 && averageCallsPerHour < 1 && hourData.callCount === hourlyBreakdown.reduce((max,h) => Math.max(max,h.callCount),0))) {
        peakHours.push({hour: hourData.hour, calls: hourData.callCount});
      }
    });
    if (peakHours.length === 0) {
        const sortedH = [...hourlyBreakdown].sort((a,b) => b.callCount - a.callCount);
        if (sortedH[0].callCount > 0) {
            peakHours.push({hour: sortedH[0].hour, calls: sortedH[0].callCount});
            if (sortedH.length > 1 && sortedH[1].callCount > 0 && sortedH[1].callCount >= sortedH[0].callCount * 0.7) peakHours.push({hour: sortedH[1].hour, calls: sortedH[1].callCount});
            peakHours.sort((a,b) => a.hour - b.hour);
        } else return "Low overall activity";
    }
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
  }, [selectedTower]);

  const handleExportTowersList = () => {
    const headers = ["Tower ID (LAC-CID)", "Address", "Records", "Total Duration (min)", "Unique A-Parties", "Unique B-Parties", "First Seen", "Last Seen"];
    const data = sortedTowers.map(tower => [
        `${tower.lac}-${tower.cid}`, tower.address || 'N/A', String(tower.recordCount), String(Math.round(tower.totalCallDuration / 60)),
        String(tower.uniqueAParties.size), String(tower.uniqueBParties.size),
        tower.firstSeen ? formatDate(tower.firstSeen.toISOString()) : 'N/A', tower.lastSeen ? formatDate(tower.lastSeen.toISOString()) : 'N/A', 
    ]);
    downloadCSV(`tower_activity_summary.csv`, data, headers);
  };

  const handleExportSelectedTowerActivity = () => {
    if (!selectedTower) return;
    const headers = ["Hour", "Call Count", "Total Duration (s)"];
    const data = selectedTower.hourlyBreakdown.map(h => [h.name, String(h.callCount), String(h.totalDuration)]);
    downloadCSV(`tower_hourly_activity_${selectedTower.lac}-${selectedTower.cid}.csv`, data, headers);
  };

  if (isLoading) return <div className="p-4 text-center">Analyzing tower activity...</div>;
  if (error) return <div className="p-4 bg-red-100 text-red-700 rounded-lg">{error}</div>;
  if (uploadedFiles.length === 0) return <div className="p-6 bg-info-lighter border border-info-light rounded-lg text-center text-info-dark"><Info size={24} className="mx-auto mb-2" />Please upload CDR files to analyze tower activity.</div>;
  if (filesToAnalyze.length === 0) return <div className="p-6 bg-warning-lighter border border-warning-light rounded-lg text-center text-warning-darker"><Info size={24} className="mx-auto mb-2" />Please select files in 'Filter Controls'.</div>;
  if (cellTowerAnalytics.length === 0) return <div className="p-6 bg-neutral-lightest border rounded-lg text-center text-textSecondary"><Info size={24} className="mx-auto mb-2" />No cell tower data found in selected records.</div>;

  const tableHeaders: { key: keyof CellTowerAnalyticsData | 'uniqueAPartiesCount' | 'uniqueBPartiesCount'; label: string; icon?: React.ReactNode }[] = [
    { key: 'id', label: 'Tower ID (LAC-CID)', icon: <SignalHigh size={14} /> }, { key: 'address', label: 'Address', icon: <MapPin size={14} /> },
    { key: 'recordCount', label: 'Records', icon: <ListFilter size={14} /> }, { key: 'totalCallDuration', label: 'Total Duration (min)', icon: <Clock size={14} /> },
    { key: 'uniqueAPartiesCount', label: 'Unique A-Parties', icon: <Users size={14} /> }, { key: 'uniqueBPartiesCount', label: 'Unique B-Parties (via Tower)', icon: <Phone size={14} /> },
    { key: 'firstSeen', label: 'First Seen', icon: <Clock size={14} /> }, { key: 'lastSeen', label: 'Last Seen', icon: <Clock size={14} /> },
  ];

  return (
    <div className="space-y-6">
      <div className="p-4 sm:p-5 bg-surface border border-neutral-light rounded-xl shadow-xl">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center">
            <div>
                <div className="flex items-center text-xl sm:text-2xl font-semibold text-textPrimary mb-1"> <SignalHigh size={24} className="mr-2.5 text-primary" /> Tower Activity Analysis </div>
                <p className="text-sm text-textSecondary"> Showing {cellTowerAnalytics.length} unique cell towers. Click on a tower to see its hourly activity breakdown. </p>
            </div>
            {cellTowerAnalytics.length > 0 && (
                <button onClick={handleExportTowersList} className="mt-3 sm:mt-0 px-3.5 py-2 text-xs sm:text-sm bg-secondary text-white rounded-lg hover:bg-secondary-dark focus:outline-none focus:ring-2 focus:ring-secondary-light flex items-center shadow-md"> <Download size={15} className="mr-1.5" /> Export Towers List </button>
            )}
        </div>
      </div>

      <div className="bg-surface shadow-xl rounded-xl border border-neutral-light overflow-x-auto">
        <table className="min-w-full divide-y divide-neutral-light">
          <thead className="bg-neutral-lightest sticky top-0 z-10">
            <tr> {tableHeaders.map(header => ( <th key={String(header.key)} scope="col" onClick={() => requestSort(header.key)} className="group px-3 py-3 text-left text-xs font-semibold text-textPrimary uppercase tracking-wider cursor-pointer hover:bg-neutral-lighter"><div className="flex items-center"> {header.icon && <span className="mr-1.5 text-neutral-DEFAULT group-hover:text-primary">{header.icon}</span>} {header.label} {renderSortIcon(String(header.key))} </div> </th> ))} </tr>
          </thead>
          <tbody className="bg-surface divide-y divide-neutral-light">
            {paginatedTowers.map((tower, index) => (
              <tr key={tower.id} className={`transition-colors cursor-pointer ${selectedTower?.id === tower.id ? 'bg-primary-lighter/40 ring-1 ring-primary-light' : ''} hover:bg-primary-lighter/30`} onClick={() => setSelectedTower(tower)}>
                <td className="px-3 py-2.5 whitespace-nowrap text-xs text-textPrimary font-medium">{tower.lac}-{tower.cid}</td>
                <td className="px-3 py-2.5 text-xs text-textSecondary truncate max-w-xs" title={tower.address}>{tower.address || 'N/A'}</td>
                <td className="px-3 py-2.5 whitespace-nowrap text-xs text-textSecondary text-center">{tower.recordCount}</td>
                <td className="px-3 py-2.5 whitespace-nowrap text-xs text-textSecondary text-center">{String(Math.round(tower.totalCallDuration / 60))}</td>
                <td className="px-3 py-2.5 whitespace-nowrap text-xs text-textSecondary text-center">{tower.uniqueAParties.size}</td>
                <td className="px-3 py-2.5 whitespace-nowrap text-xs text-textSecondary text-center">{tower.uniqueBParties.size}</td>
                <td className="px-3 py-2.5 whitespace-nowrap text-xs text-textSecondary">{tower.firstSeen ? formatDate(tower.firstSeen.toISOString()) : 'N/A'}</td>
                <td className="px-3 py-2.5 whitespace-nowrap text-xs text-textSecondary">{tower.lastSeen ? formatDate(tower.lastSeen.toISOString()): 'N/A'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {totalPages > 1 && ( <div className="flex flex-col sm:flex-row justify-between items-center mt-4 py-3 px-1"> <span className="text-sm text-textSecondary mb-2 sm:mb-0">Page {currentPage} of {totalPages}</span> <div className="flex gap-2"> <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1} className="px-3 py-1.5 text-xs font-medium border rounded-lg shadow-sm">Previous</button> <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages} className="px-3 py-1.5 text-xs font-medium border rounded-lg shadow-sm">Next</button> </div> </div> )}

      {selectedTower && (
        <div className="mt-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 bg-surface p-4 sm:p-6 rounded-xl shadow-xl border border-neutral-light">
            <div className="flex justify-between items-center mb-3">
              <h3 className="text-base font-semibold text-textPrimary"> Hourly Activity for Tower: {selectedTower.id}</h3>
              <button onClick={handleExportSelectedTowerActivity} className="px-2.5 py-1.5 text-xs bg-secondary-lighter/50 text-secondary-dark rounded-md hover:bg-secondary-lighter/70 font-medium flex items-center shadow-sm"><Download size={13} className="mr-1.5" /> Export Activity </button>
            </div>
            {selectedTower.hourlyBreakdown.some(h => h.callCount > 0 || h.totalDuration > 0) ? (
              <>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={selectedTower.hourlyBreakdown} margin={{ top: 5, right: 20, left: 0, bottom: 25 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                  <XAxis dataKey="name" angle={-45} textAnchor="end" height={60} interval={1} tick={{fontSize: 10}}/>
                  <YAxis yAxisId="left" orientation="left" stroke={COLORS[0]} allowDecimals={false} label={{ value: 'Call Count', angle: -90, position: 'insideLeft', offset:10, style: {fontSize: '10px', fill: COLORS[0]} }} tick={{fontSize: 10}}/>
                  <YAxis yAxisId="right" orientation="right" stroke={COLORS[1]} allowDecimals={false} label={{ value: 'Total Duration (min)', angle: -90, position: 'insideRight', offset:10, style: {fontSize: '10px', fill: COLORS[1]} }} tickFormatter={(value) => String(Math.round(Number(value) / 60))} tick={{fontSize: 10}}/>
                  <Tooltip wrapperStyle={{fontSize: "12px"}} formatter={(value, name) => [name === 'Total Duration' ? `${Math.round(Number(value) / 60)} min` : String(value), name]} />
                  <Legend verticalAlign="top" iconSize={10} wrapperStyle={{fontSize: "12px"}}/>
                  <Bar yAxisId="left" dataKey="callCount" name="Calls" fill={COLORS[0]} radius={[5, 5, 0, 0]} barSize={12}/>
                  <Bar yAxisId="right" dataKey="totalDuration" name="Total Duration" fill={COLORS[1]} radius={[5, 5, 0, 0]} barSize={12}/>
                </BarChart>
              </ResponsiveContainer>
              <p className="text-xs text-textSecondary mt-3 text-center"> <TrendingUp size={14} className="inline mr-1 text-primary"/> Peak Activity: {peakActivityHoursForSelectedTower} </p>
              </>
            ) : ( <p className="text-textSecondary text-center py-10">No hourly activity data for this tower.</p> )}
          </div>
          <div className="h-full min-h-[300px] bg-neutral-lightest rounded-xl shadow-lg border border-neutral-light overflow-hidden">
             {selectedTower.latitude && selectedTower.longitude ? (
                <GoogleMapView 
                    center={{lat: selectedTower.latitude, lng: selectedTower.longitude}}
                    zoom={14}
                    markers={[{
                        id: selectedTower.id,
                        position: {lat: selectedTower.latitude, lng: selectedTower.longitude},
                        title: `Tower: ${selectedTower.id}`,
                        infoContent: `<b>Tower:</b> ${selectedTower.id}<br/><b>Address:</b> ${selectedTower.address || 'N/A'}`
                    }]}
                />
             ) : (
                <div className="flex items-center justify-center h-full text-textSecondary text-center p-4">
                    <Info size={24} className="mx-auto mb-2 text-neutral-DEFAULT"/> No coordinates available for this tower.
                </div>
             )}
          </div>
        </div>
      )}
    </div>
  );
};

export default TowerActivityView;

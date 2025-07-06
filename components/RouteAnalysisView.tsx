
import React, { useState, useMemo, useCallback } from 'react';
import { Waypoints, MapPin, User, Search, Info, Loader2, AlertTriangle } from 'lucide-react';
import { useCDRContext } from '../contexts/CDRContext';
import GoogleMapView from './GoogleMapView';
import { MapMarkerData, MapPathData } from '../types';
import { parseDateTime } from '../utils/cdrUtils';

const RouteAnalysisView: React.FC = () => {
  const { allRecords, getUniqueValues } = useCDRContext();
  const [selectedTarget, setSelectedTarget] = useState<string>('');
  const [analysisResult, setAnalysisResult] = useState<{
    path: MapPathData;
    markers: MapMarkerData[];
    mostFrequent1?: { id: string; count: number; address?: string };
    mostFrequent2?: { id: string; count: number; address?: string };
  } | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const uniqueMSISDNs = useMemo(() => getUniqueValues('APARTY'), [getUniqueValues]);
  
  const handleAnalyze = useCallback(() => {
    if (!selectedTarget) {
      setError("Please select a target MSISDN.");
      return;
    }
    setError(null);
    setIsLoading(true);
    setAnalysisResult(null);

    setTimeout(() => {
        try {
            const records = allRecords
                .filter(r => r.APARTY === selectedTarget && r.LACSTARTA && r.CISTARTA && r.latitude != null && r.longitude != null)
                .sort((a,b) => (parseDateTime(a.START_DTTIME)?.getTime() || 0) - (parseDateTime(b.START_DTTIME)?.getTime() || 0));
            
            if (records.length < 2) {
                setError("Not enough location data points (<2) to analyze a route for this target.");
                setIsLoading(false);
                return;
            }

            const towerCounts = new Map<string, {count: number, address?: string}>();
            records.forEach(r => {
                const lacCellId = `${r.LACSTARTA}-${r.CISTARTA}`;
                const entry = towerCounts.get(lacCellId) || { count: 0, address: r.ADDRESS };
                entry.count++;
                if (!entry.address && r.ADDRESS) entry.address = r.ADDRESS;
                towerCounts.set(lacCellId, entry);
            });

            const sortedTowers = Array.from(towerCounts.entries()).sort((a,b) => b[1].count - a[1].count);
            const mostFrequent1 = sortedTowers[0] ? { id: sortedTowers[0][0], ...sortedTowers[0][1] } : undefined;
            const mostFrequent2 = sortedTowers[1] ? { id: sortedTowers[1][0], ...sortedTowers[1][1] } : undefined;
            
            const markers: MapMarkerData[] = [];
            const pathCoordinates: { lat: number, lng: number }[] = [];
            const addedMarkers = new Set<string>();

            records.forEach((record) => {
                const position = { lat: record.latitude!, lng: record.longitude! };
                const lacCellId = `${record.LACSTARTA}-${record.CISTARTA}`;
                pathCoordinates.push(position);
                
                if (!addedMarkers.has(lacCellId)) {
                    const isFrequent1 = lacCellId === mostFrequent1?.id;
                    const isFrequent2 = lacCellId === mostFrequent2?.id;
                    let markerLabel = isFrequent1 ? "A" : (isFrequent2 ? "B" : undefined);
                    let markerScale = isFrequent1 || isFrequent2 ? 9 : 4;
                    let markerColor = isFrequent1 ? '#ef4444' : (isFrequent2 ? '#f97316' : '#60a5fa');
                    
                    markers.push({
                        id: lacCellId,
                        position,
                        title: `Tower: ${lacCellId}\nAddress: ${record.ADDRESS || 'N/A'}`,
                        infoContent: `<b>Tower:</b> ${lacCellId}<br/><b>Address:</b> ${record.ADDRESS || 'N/A'}`,
                        icon: {
                          path: window.google?.maps?.SymbolPath?.CIRCLE,
                          scale: markerScale,
                          fillColor: markerColor,
                          fillOpacity: 1,
                          strokeWeight: 1.5,
                          strokeColor: '#ffffff',
                        },
                        ...(markerLabel && { label: { text: markerLabel, color: 'white', fontWeight: 'bold', fontSize: '10px' } })
                    });
                    addedMarkers.add(lacCellId);
                }
            });

            setAnalysisResult({
                path: { id: `path-${selectedTarget}`, coordinates: pathCoordinates, strokeColor: '#0ea5e9', strokeWeight: 2.5, strokeOpacity: 0.9 },
                markers,
                mostFrequent1,
                mostFrequent2
            });

        } catch (e) {
            setError("An error occurred during route analysis.");
            console.error(e);
        } finally {
            setIsLoading(false);
        }
    }, 50);

  }, [selectedTarget, allRecords]);

  return (
    <div className="space-y-4">
      <div className="p-4 bg-surface border border-neutral-light rounded-xl shadow-md">
        <h2 className="text-xl font-semibold text-textPrimary mb-2 flex items-center">
            <Waypoints size={22} className="mr-2 text-primary"/>Tower Travel Pattern
        </h2>
        <p className="text-sm text-textSecondary">Visualize the chronological travel path of a target between cell towers. The two most frequently visited towers are highlighted.</p>
        <div className="mt-4 flex flex-col sm:flex-row gap-3 items-end">
          <div className="flex-grow">
            <label htmlFor="targetMsisdnRouteView" className="block text-xs font-medium text-textSecondary mb-1">Select Target MSISDN:</label>
            <select id="targetMsisdnRouteView" value={selectedTarget} onChange={e => setSelectedTarget(e.target.value)} className="w-full p-2 border border-neutral-light rounded-md focus:ring-2 focus:ring-primary-light text-sm shadow-sm">
              <option value="">-- Select Target --</option>
              {uniqueMSISDNs.map(msisdn => <option key={msisdn} value={msisdn}>{msisdn}</option>)}
            </select>
          </div>
          <button onClick={handleAnalyze} disabled={isLoading || !selectedTarget} className="w-full sm:w-auto px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-dark text-sm font-medium shadow-md flex items-center justify-center disabled:opacity-60">
            {isLoading ? <Loader2 size={18} className="animate-spin mr-2"/> : <Search size={18} className="mr-2"/>}
            Analyze Route
          </button>
        </div>
        {error && <p className="mt-2 text-xs text-danger-dark"><AlertTriangle size={12} className="inline mr-1"/>{error}</p>}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 h-[600px] bg-neutral-lightest rounded-xl shadow-lg border border-neutral-light overflow-hidden">
          {analysisResult ? (
            <GoogleMapView
              center={analysisResult.markers[0]?.position || { lat: 23.8103, lng: 90.4125 }}
              zoom={10}
              markers={analysisResult.markers}
              paths={analysisResult.path ? [analysisResult.path] : []}
            />
          ) : (
             <div className="flex items-center justify-center h-full text-textSecondary text-center p-4">
                {isLoading ? (
                    <div><Loader2 className="animate-spin h-8 w-8 mx-auto mb-2 text-primary"/><p>Analyzing route...</p></div>
                ) : (
                    <div><Info size={28} className="mx-auto mb-2 text-neutral-DEFAULT"/><p>Select a target and click "Analyze Route" to see the travel path.</p></div>
                )}
            </div>
          )}
        </div>
        <div className="lg:col-span-1 p-4 bg-surface rounded-xl shadow-lg border border-neutral-light">
          <h3 className="text-base font-semibold text-textPrimary mb-3">Route Information</h3>
          {analysisResult ? (
            <div className="text-xs space-y-3">
              <div className="p-2 bg-red-100/50 rounded-md border border-red-200">
                <p className="font-semibold text-red-700">Most Frequent Tower (A):</p>
                <p className="text-textPrimary">{analysisResult.mostFrequent1?.id || 'N/A'}</p>
                 <p className="text-textSecondary truncate" title={analysisResult.mostFrequent1?.address || ''}>Address: {analysisResult.mostFrequent1?.address || 'N/A'}</p>
                <p className="text-textSecondary">({analysisResult.mostFrequent1?.count || 0} records)</p>
              </div>
              <div className="p-2 bg-orange-100/50 rounded-md border border-orange-200">
                <p className="font-semibold text-orange-700">2nd Most Frequent Tower (B):</p>
                <p className="text-textPrimary">{analysisResult.mostFrequent2?.id || 'N/A'}</p>
                <p className="text-textSecondary truncate" title={analysisResult.mostFrequent2?.address || ''}>Address: {analysisResult.mostFrequent2?.address || 'N/A'}</p>
                <p className="text-textSecondary">({analysisResult.mostFrequent2?.count || 0} records)</p>
              </div>
              <div className="p-2 bg-neutral-lightest rounded-md border">
                <p className="font-semibold text-textPrimary">Path Summary:</p>
                <p>{analysisResult.path.coordinates.length - 1} movements between {analysisResult.markers.length} unique towers.</p>
              </div>
            </div>
          ) : (
            <p className="text-xs text-textSecondary text-center py-5">No analysis performed yet.</p>
          )}
        </div>
      </div>
    </div>
  );
};

export default RouteAnalysisView;

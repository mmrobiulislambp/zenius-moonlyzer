
import React, { useState, useCallback, useMemo } from 'react';
import { Layers, Play, AlertTriangle, Trash2, Info, Loader2, LogIn, LogOut, User } from 'lucide-react';
import { useCDRContext } from '../contexts/CDRContext';
import GoogleMapView from './GoogleMapView';
import { CDRRecord, MapMarkerData } from '../types';
import { formatDate, parseDateTime } from '../utils/cdrUtils';

interface GeofenceAlert {
  type: 'ENTER' | 'LEAVE';
  timestamp: Date;
  lacCellId: string;
  address?: string;
  recordId: string;
}

const GeofencingView: React.FC = () => {
  const { allRecords, getUniqueValues } = useCDRContext();
  const [selectedTarget, setSelectedTarget] = useState<string>('');
  const [drawnShape, setDrawnShape] = useState<google.maps.Polygon | google.maps.Circle | null>(null);
  const [alerts, setAlerts] = useState<GeofenceAlert[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const uniqueMSISDNs = useMemo(() => getUniqueValues('APARTY'), [getUniqueValues]);

  const handleShapeComplete = useCallback((shape: google.maps.Polygon | google.maps.Circle) => {
    if (drawnShape) {
      (drawnShape as any).setMap(null);
    }
    setDrawnShape(shape);
    (shape as any).setOptions({ clickable: false });
  }, [drawnShape]);

  const handleClearGeofence = () => {
    if (drawnShape) {
      (drawnShape as any).setMap(null);
    }
    setDrawnShape(null);
    setAlerts([]);
    setError(null);
  };
  
  const handleAnalyze = () => {
    if (!selectedTarget) {
      setError("Please select a target MSISDN.");
      return;
    }
    if (!drawnShape) {
      setError("Please draw a geofence on the map first.");
      return;
    }
    
    setIsLoading(true);
    setError(null);
    setAlerts([]);

    setTimeout(() => {
        try {
            const targetRecords = allRecords
              .filter(r => (r.APARTY === selectedTarget || r.BPARTY === selectedTarget) && r.latitude != null && r.longitude != null)
              .sort((a, b) => (parseDateTime(a.START_DTTIME)?.getTime() || 0) - (parseDateTime(b.START_DTTIME)?.getTime() || 0));

            if (targetRecords.length === 0) {
              setError("No location records found for the selected target.");
              setIsLoading(false);
              return;
            }

            const newAlerts: GeofenceAlert[] = [];
            let wasInside: boolean | null = null;

            targetRecords.forEach(record => {
              const position = new window.google.maps.LatLng(record.latitude!, record.longitude!);
              
              const isInside = drawnShape instanceof window.google.maps.Polygon
                ? window.google.maps.geometry.poly.containsLocation(position, drawnShape)
                : window.google.maps.geometry.spherical.computeDistanceBetween(position, (drawnShape as google.maps.Circle).getCenter()) <= (drawnShape as google.maps.Circle).getRadius();

              if (wasInside === null) {
                // Initial state
              } else if (isInside && !wasInside) {
                newAlerts.push({ type: 'ENTER', timestamp: parseDateTime(record.START_DTTIME)!, lacCellId: `${record.LACSTARTA}-${record.CISTARTA}`, address: record.ADDRESS, recordId: record.id });
              } else if (!isInside && wasInside) {
                 newAlerts.push({ type: 'LEAVE', timestamp: parseDateTime(record.START_DTTIME)!, lacCellId: `${record.LACSTARTA}-${record.CISTARTA}`, address: record.ADDRESS, recordId: record.id });
              }
              wasInside = isInside;
            });

            setAlerts(newAlerts);
             if (newAlerts.length === 0) {
                 setError("No geofence enter/leave events detected for the target.");
            }
        } catch (e: any) {
            setError("An error occurred during analysis.");
            console.error(e);
        } finally {
            setIsLoading(false);
        }
    }, 50);
  };

  const mapMarkers = useMemo((): MapMarkerData[] => {
    const targetData = selectedTarget ? allRecords.filter(r => (r.APARTY === selectedTarget || r.BPARTY === selectedTarget) && r.latitude != null && r.longitude != null) : [];
    return targetData.map(r => ({
        id: r.id,
        position: { lat: r.latitude!, lng: r.longitude! },
        title: `Tower: ${r.LACSTARTA}-${r.CISTARTA}`,
        icon: {
            path: window.google?.maps?.SymbolPath?.CIRCLE,
            scale: 2.5,
            fillColor: '#3b82f6',
            fillOpacity: 0.8,
            strokeWeight: 0,
        },
    }));
  }, [allRecords, selectedTarget]);

  return (
    <div className="space-y-4">
      <div className="p-4 bg-surface border border-neutral-light rounded-xl shadow-md">
        <h2 className="text-xl font-semibold text-textPrimary mb-2 flex items-center">
            <Layers size={22} className="mr-2 text-primary"/>Geofencing Alerts
        </h2>
        <p className="text-sm text-textSecondary">Draw a geofence on the map, select a target, and run analysis to detect when the target enters or leaves the area.</p>
        
        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 items-end">
            <div>
                <label htmlFor="targetMsisdnGeo" className="block text-xs font-medium text-textSecondary mb-1 flex items-center"><User size={14} className="mr-1"/>Target MSISDN:</label>
                <select id="targetMsisdnGeo" value={selectedTarget} onChange={e => setSelectedTarget(e.target.value)} className="w-full p-2 border border-neutral-light rounded-md focus:ring-2 focus:ring-primary-light text-sm shadow-sm">
                    <option value="">-- Select Target --</option>
                    {uniqueMSISDNs.map(msisdn => <option key={msisdn} value={msisdn}>{msisdn}</option>)}
                </select>
            </div>
            <div className="flex gap-2 items-center">
                <button onClick={handleAnalyze} disabled={isLoading || !selectedTarget || !drawnShape} className="w-full px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-dark text-sm font-medium shadow-md flex items-center justify-center disabled:opacity-60">
                    {isLoading ? <Loader2 size={18} className="animate-spin mr-2"/> : <Play size={18} className="mr-2"/>}
                    Run Analysis
                </button>
                <button onClick={handleClearGeofence} className="p-2.5 bg-neutral-light hover:bg-neutral-DEFAULT/30 rounded-lg shadow-sm" title="Clear drawn geofence and alerts">
                    <Trash2 size={16} className="text-neutral-darker"/>
                </button>
            </div>
        </div>
        {error && <p className="mt-2 text-xs text-danger-dark"><AlertTriangle size={12} className="inline mr-1"/>{error}</p>}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 h-[500px] bg-neutral-lightest rounded-xl shadow-lg border border-neutral-light overflow-hidden">
             <GoogleMapView
                center={{ lat: 23.8103, lng: 90.4125 }}
                zoom={7}
                markers={mapMarkers}
                drawingTools={{
                    enabled: true,
                    onCircleComplete: handleShapeComplete,
                    onPolygonComplete: handleShapeComplete,
                }}
            />
        </div>
        <div className="lg:col-span-1 p-4 bg-surface rounded-xl shadow-lg border border-neutral-light">
          <h3 className="text-base font-semibold text-textPrimary mb-3">Alerts</h3>
          {isLoading ? (
            <div className="text-center text-textSecondary"><Loader2 className="animate-spin inline mr-2"/>Loading alerts...</div>
          ) : alerts.length === 0 ? (
            <div className="text-center text-textSecondary text-sm p-4 bg-neutral-lightest rounded-md">
                <Info size={20} className="mx-auto mb-2 text-neutral-DEFAULT"/>
                No alerts to display. Run analysis to see results.
            </div>
          ) : (
            <ul className="space-y-2 max-h-[450px] overflow-y-auto scrollbar-thin">
              {alerts.map((alert, index) => (
                <li key={alert.recordId + index} className={`p-2 rounded-md flex items-start text-xs border-l-4 ${alert.type === 'ENTER' ? 'bg-green-100/50 border-green-500' : 'bg-red-100/50 border-red-500'}`}>
                    {alert.type === 'ENTER' ? <LogIn size={16} className="text-green-600 mr-2 mt-0.5 flex-shrink-0"/> : <LogOut size={16} className="text-red-600 mr-2 mt-0.5 flex-shrink-0"/>}
                    <div>
                        <p className="font-semibold text-textPrimary">{alert.type}</p>
                        <p className="text-textSecondary">{formatDate(alert.timestamp.toISOString())}</p>
                        <p className="text-textSecondary text-[10px]">Tower: {alert.lacCellId}</p>
                         <p className="text-textSecondary text-[10px] truncate" title={alert.address}>Address: {alert.address || 'N/A'}</p>
                    </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
};

export default GeofencingView;

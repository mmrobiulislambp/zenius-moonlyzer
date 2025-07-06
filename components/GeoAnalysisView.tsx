
import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { MapPin as MapIconLucide, Search, AlertTriangle, Loader2, Info, XCircle } from 'lucide-react'; 
import { useCDRContext } from '../contexts/CDRContext';
import { CellTowerAnalyticsData } from '../types';
import GoogleMapView from './GoogleMapView';
import { MapMarkerData } from '../types';

const GeoAnalysisView: React.FC = () => {
  const { cellTowerAnalytics, isLoading: contextIsLoading, uploadedFiles } = useCDRContext();
  
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [mapCenter, setMapCenter] = useState<google.maps.LatLngLiteral>({ lat: 23.8103, lng: 90.4125 });
  const [mapZoom, setMapZoom] = useState<number>(6);
  const [searchMarker, setSearchMarker] = useState<MapMarkerData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const geocoderRef = useRef<google.maps.Geocoder | null>(null);

  useEffect(() => {
    if (window.google && window.google.maps && window.googleMapsApiLoaded && !geocoderRef.current) {
      geocoderRef.current = new window.google.maps.Geocoder();
    }
  }, []);

  const towerMarkers = useMemo((): MapMarkerData[] => {
    return cellTowerAnalytics
      .filter(tower => tower.latitude !== undefined && tower.longitude !== undefined)
      .map(tower => ({
        id: tower.id,
        position: { lat: tower.latitude!, lng: tower.longitude! },
        title: `Tower: ${tower.id}`,
        infoContent: `<b>Tower:</b> ${tower.id}<br/><b>Address:</b> ${tower.address || 'N/A'}<br/><b>Records:</b> ${tower.recordCount}`
      }));
  }, [cellTowerAnalytics]);

  const allMarkers = useMemo(() => {
    return searchMarker ? [...towerMarkers, searchMarker] : towerMarkers;
  }, [towerMarkers, searchMarker]);

  const handleSearch = useCallback(async () => {
    if (!searchQuery.trim()) {
      setError("Please enter a location to search.");
      return;
    }
    if (!geocoderRef.current) {
        setError("Geocoding service is not available.");
        return;
    }

    setIsLoading(true);
    setError(null);
    setSearchMarker(null);

    geocoderRef.current.geocode({ address: searchQuery }, (results, status) => {
        setIsLoading(false);
        if (status === 'OK' && results && results[0]) {
          const location = results[0].geometry.location;
          const newCenter = { lat: location.lat(), lng: location.lng() };
          setMapCenter(newCenter);
          setMapZoom(14); // Zoom into the searched location
          setSearchMarker({
            id: 'search-result',
            position: newCenter,
            title: results[0].formatted_address,
            icon: {
              url: 'http://maps.google.com/mapfiles/ms/icons/blue-dot.png',
            },
            infoContent: `<b>Searched Location:</b><br/>${results[0].formatted_address}`
          });
        } else {
          setError(`Geocoding failed: ${status}. No results for "${searchQuery}".`);
          setSearchMarker(null);
        }
      });

  }, [searchQuery]);
  
  const clearSearch = () => {
      setSearchQuery('');
      setSearchMarker(null);
      setError(null);
  }

  if (contextIsLoading && cellTowerAnalytics.length === 0) return <div className="flex justify-center items-center h-64"><Loader2 className="h-12 w-12 animate-spin text-primary" /><p className="ml-3 text-textSecondary">Loading tower data for map...</p></div>;
  if (uploadedFiles.length > 0 && cellTowerAnalytics.length === 0 && !contextIsLoading) {
    return (
      <div className="p-6 bg-warning-lighter border border-warning-light rounded-lg text-center text-warning-darker flex flex-col items-center justify-center min-h-[150px] shadow-md">
        <AlertTriangle size={28} className="mb-2" />
        <p className="font-medium">No geocodable tower data (LAC/CID) found in the current CDR records, or Tower Database is empty.</p>
        <p className="text-xs mt-1">Please ensure your data has location information or upload a Tower Database.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
       <div className="p-4 sm:p-5 bg-surface border border-neutral-light rounded-xl shadow-xl">
        <div className="flex items-center text-xl sm:text-2xl font-semibold text-textPrimary mb-1">
          <MapIconLucide size={24} className="mr-2.5 text-primary" /> Geospatial Overview
        </div>
        <p className="text-sm text-textSecondary">Map of all cell tower locations from the current dataset. Use the search to pinpoint specific addresses.</p>
        
        <div className="mt-4 flex flex-col sm:flex-row gap-3 items-stretch">
          <div className="relative flex-grow">
            <input
              type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search address or place name..."
              className="w-full p-3 border border-neutral-light rounded-lg focus:ring-2 focus:ring-primary-light text-sm shadow-sm"
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            />
             {searchQuery && (
                <button onClick={clearSearch} className="absolute inset-y-0 right-0 pr-3 flex items-center text-neutral-DEFAULT hover:text-danger" title="Clear search">
                    <XCircle size={16} />
                </button>
            )}
          </div>
          <button onClick={handleSearch} disabled={isLoading || !searchQuery.trim() || !geocoderRef.current} className="px-6 py-3 bg-primary text-white rounded-lg hover:bg-primary-dark text-sm font-medium shadow-md disabled:opacity-60 flex items-center justify-center">
            {isLoading ? <Loader2 size={18} className="animate-spin mr-2"/> : <Search size={18} className="mr-2" />}
            {isLoading ? 'Searching...' : 'Search Map'}
          </button>
        </div>
        {error && <p className="mt-2 text-xs text-danger-dark"><AlertTriangle size={12} className="inline mr-1"/>{error}</p>}
      </div>

      <div className="h-[600px] sm:h-[700px] bg-neutral-lightest rounded-xl shadow-xl border border-neutral-light overflow-hidden">
        {(typeof window !== 'undefined' && window.google && window.google.maps && window.googleMapsApiLoaded) ? (
          <GoogleMapView center={mapCenter} zoom={mapZoom} markers={allMarkers} />
        ) : (
           <div className="w-full h-full flex flex-col items-center justify-center text-textSecondary"><Loader2 className="h-12 w-12 animate-spin text-primary mb-4"/><p>Loading Map...</p></div>
        )}
      </div>
    </div>
  );
};

export default GeoAnalysisView;

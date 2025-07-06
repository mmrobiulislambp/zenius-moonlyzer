
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { MapPin, Search, XCircle, Loader2, AlertTriangle, Info } from 'lucide-react';
import GoogleMapView from './GoogleMapView'; 
import { MapMarkerData } from '../types';

const BTSLocationSearchView: React.FC = () => {
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [mapCenter, setMapCenter] = useState<google.maps.LatLngLiteral>({ lat: 23.8103, lng: 90.4125 }); 
  const [marker, setMarker] = useState<MapMarkerData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [geocoder, setGeocoder] = useState<google.maps.Geocoder | null>(null);
  const apiKeyErrorShownRef = useRef(false); // To show API key error only once

  useEffect(() => {
    const initializeGeocoder = () => {
      if (window.google && window.google.maps && window.googleMapsApiLoaded && !geocoder) {
        setGeocoder(new window.google.maps.Geocoder());
      }
    };
    if (window.googleMapsApiLoaded) {
      initializeGeocoder();
    } else {
      const intervalId = setInterval(() => {
        if (window.googleMapsApiLoaded) {
          clearInterval(intervalId);
          initializeGeocoder();
        }
      }, 100);
      return () => clearInterval(intervalId);
    }
  }, [geocoder]);


  const handleSearch = useCallback(async () => {
    if (!searchQuery.trim()) {
      setError("Please enter a location to search.");
      return;
    }
    if (!geocoder) {
        setError("Geocoding service is not available. Please check map API loading status or try again later.");
        return;
    }

    setIsLoading(true);
    setError(null);
    setMarker(null);
    // apiKeyErrorShownRef.current = false; // Reset based on specific error handling below

    try {
      geocoder.geocode({ address: searchQuery }, (results, status) => {
        setIsLoading(false);
        if (status === window.google.maps.GeocoderStatus.OK && results && results[0]) {
          const location = results[0].geometry.location;
          const newCenter = { lat: location.lat(), lng: location.lng() };
          setMapCenter(newCenter);

          const divStyle = "font-family: Inter, sans-serif; font-size: 13px; max-width: 250px; padding: 3px;";
          const p1Style = "font-weight: 600; margin-bottom: 4px; color: #1d4ed8;"; // primary-dark
          const p2Style = "font-size:11px; color: #4b5563;"; // text-secondary
          const formattedAddress = results[0].formatted_address;
          const lat = newCenter.lat.toFixed(6);
          const lng = newCenter.lng.toFixed(6);

          const infoContentString = `
            <div style="${divStyle}">
              <p style="${p1Style}">${formattedAddress}</p>
              <p style="${p2Style}">Lat: ${lat}, Lng: ${lng}</p>
            </div>
          `;

          setMarker({
            id: 'searchedLocation',
            position: newCenter,
            title: formattedAddress,
            infoContent: infoContentString
          });
          apiKeyErrorShownRef.current = false; // Reset on successful search
        } else {
          let userFriendlyError = `Geocoding failed: ${status}. No results found for "${searchQuery}".`;
          if (status === window.google.maps.GeocoderStatus.REQUEST_DENIED) {
            userFriendlyError = "Geocoding Service Error: The current API key is not authorized to use the Google Maps Geocoding API or the API is not enabled. Please check your API key configuration in the Google Cloud Console.";
            if (!apiKeyErrorShownRef.current) {
                 setError(userFriendlyError);
                 apiKeyErrorShownRef.current = true; 
            } else {
                // If error is already shown, don't set it again to avoid flicker, but ensure no other error message persists.
                // If `error` state already holds this exact message, this effectively does nothing.
                // If `error` state holds a different message, this clears it if the API key error was already the active one.
                if (error !== userFriendlyError) setError(null);
            }
          } else if (status === window.google.maps.GeocoderStatus.OVER_QUERY_LIMIT) {
            userFriendlyError = "Geocoding Service Error: Query limit exceeded. Please try again later or check your Google Maps API quota."
            setError(userFriendlyError);
            apiKeyErrorShownRef.current = false; 
          } else {
            setError(userFriendlyError);
            apiKeyErrorShownRef.current = false;
          }
          
          // Log other errors to console for debugging, but not REQUEST_DENIED if it's already been shown and handled
          if (!(status === window.google.maps.GeocoderStatus.REQUEST_DENIED && apiKeyErrorShownRef.current)) {
             if (status !== window.google.maps.GeocoderStatus.REQUEST_DENIED) console.warn(`Geocoding status: ${status} for query: ${searchQuery}`);
          }
          setMarker(null);
        }
      });
    } catch (e: any) {
      setIsLoading(false);
      setError(`An error occurred during geocoding: ${e.message || 'Unknown error'}`);
      console.error("Geocoding error:", e);
      apiKeyErrorShownRef.current = false; 
    }
  }, [searchQuery, geocoder, error]); 

  const handleClearSearch = () => {
    setSearchQuery('');
    setMarker(null);
    setError(null);
    apiKeyErrorShownRef.current = false; 
  };

  return (
    <div className="space-y-5">
      <div className="p-4 sm:p-5 bg-surface border border-neutral-light rounded-xl shadow-xl">
        <div className="flex items-center text-xl sm:text-2xl font-semibold text-textPrimary mb-1">
          <MapPin size={24} className="mr-2.5 text-primary" /> Location Search Tool
        </div>
        <p className="text-sm text-textSecondary">Find any address or place on the map. Useful for identifying specific locations mentioned in reports or for general orientation.</p>
        
        <div className="mt-4 flex flex-col sm:flex-row gap-3 items-stretch">
          <div className="relative flex-grow">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Enter address or place name..."
              className="w-full p-3 border border-neutral-light rounded-lg focus:ring-2 focus:ring-primary-light focus:border-primary-light text-sm shadow-sm bg-surface placeholder-neutral-DEFAULT"
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              aria-label="Location search input"
            />
            {searchQuery && (
                <button onClick={() => setSearchQuery('')} className="absolute inset-y-0 right-0 pr-3 flex items-center text-neutral-DEFAULT hover:text-danger" title="Clear input">
                    <XCircle size={16} />
                </button>
            )}
          </div>
          <button
            onClick={handleSearch}
            disabled={isLoading || !searchQuery.trim() || !geocoder}
            className="px-6 py-3 bg-primary text-white rounded-lg hover:bg-primary-dark text-sm font-medium shadow-md hover:shadow-lg transition-all disabled:opacity-60 flex items-center justify-center"
          >
            {isLoading ? <Loader2 className="h-5 w-5 animate-spin mr-2"/> : <Search size={18} className="mr-2" />}
            {isLoading ? 'Searching...' : 'Search Location'}
          </button>
          <button
            onClick={handleClearSearch}
            disabled={isLoading || (!searchQuery && !marker && !error)} 
            className="px-4 py-3 bg-neutral-light hover:bg-neutral-DEFAULT/30 text-textPrimary rounded-lg text-sm font-medium shadow-sm hover:shadow-md transition-all disabled:opacity-60 flex items-center justify-center"
          >
            Clear
          </button>
        </div>
        {!geocoder && !window.googleMapsApiLoaded && (
             <p className="text-xs text-warning-dark mt-2">Map API is still loading. Please wait a moment...</p>
        )}
         {!geocoder && window.googleMapsApiLoaded && !error && 
             <p className="text-xs text-danger-dark mt-2">Geocoding service could not be initialized. The map might not function correctly.</p>
        }
      </div>

      {error && (
        <div className="p-3 bg-danger-lighter text-danger-darker rounded-lg border border-danger-light flex items-center shadow-md">
          <AlertTriangle size={18} className="mr-2"/> {error}
        </div>
      )}
      
       {(!marker && !error && !isLoading && searchQuery && !apiKeyErrorShownRef.current) && ( 
         <div className="p-4 bg-info-lighter border border-info-light rounded-lg text-info-dark flex items-center shadow-md">
            <Info size={18} className="mr-2"/> After entering a location, click "Search Location" to see it on the map.
        </div>
      )}


      <div className="h-[500px] sm:h-[600px] bg-neutral-lightest rounded-xl shadow-xl border border-neutral-light overflow-hidden">
        {(window.google && window.google.maps && window.googleMapsApiLoaded) ? (
          <GoogleMapView
            center={mapCenter}
            zoom={marker ? 15 : 6} 
            markers={marker ? [marker] : []}
            mapContainerStyle={{ height: '100%', width: '100%' }}
          />
        ) : (
           <div className="w-full h-full flex flex-col items-center justify-center text-textSecondary">
                <Loader2 className="h-12 w-12 animate-spin text-primary mb-4"/>
                <p>Loading Map Interface...</p>
                <p className="text-xs mt-1">Ensure you have a stable internet connection.</p>
            </div>
        )}
      </div>
    </div>
  );
};

export default BTSLocationSearchView;

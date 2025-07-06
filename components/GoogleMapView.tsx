
import React, { useEffect, useRef, useState } from 'react';
import { MapMarkerData, MapPathData } from '../types';

// Declare global types for Google Maps API to avoid TypeScript errors
declare global {
  interface Window {
    google: any;
    googleMapsApiLoaded?: boolean;
    initMapApp?: () => void;
  }

  namespace google.maps {
    // --- Basic Geometrics ---
    export class LatLng { constructor(lat: number, lng: number, noWrap?: boolean); lat(): number; lng(): number; }
    export interface LatLngLiteral { lat: number; lng: number; }
    export class LatLngBounds { constructor(sw?: LatLng | LatLngLiteral | null, ne?: LatLng | LatLngLiteral | null); extend(point: LatLng | LatLngLiteral): LatLngBounds; getCenter(): LatLng; isEmpty(): boolean; }
    export interface LatLngBoundsLiteral { east: number; north: number; south: number; west: number; }
    export class Point { constructor(x: number, y: number); }
    export class Size { constructor(width: number, height: number, widthUnit?: string, heightUnit?: string); }

    // --- Map ---
    export class Map { constructor(mapDiv: HTMLElement, opts?: MapOptions); setCenter(latlng: LatLng | LatLngLiteral): void; setZoom(zoom: number): void; fitBounds(bounds: LatLngBounds | LatLngBoundsLiteral, padding?: number): void; }
    export interface MapOptions { center?: LatLng | LatLngLiteral; zoom?: number; mapTypeId?: string; mapTypeControl?: boolean; streetViewControl?: boolean; fullscreenControl?: boolean; zoomControl?: boolean; }
    
    // --- Overlays: Marker, InfoWindow, Polylines ---
    export class MVCObject { addListener(eventName: string, handler: (...args: any[]) => void): MapsEventListener; }
    export interface MapsEventListener { remove(): void; }
    export class Marker extends MVCObject { constructor(opts?: MarkerOptions); setMap(map: Map | null): void; getPosition(): LatLng | null; }
    export interface MarkerOptions { position?: LatLng | LatLngLiteral; map?: Map; title?: string; icon?: string | Icon | Symbol; label?: any; }
    export interface MarkerLabel { text: string; color?: string; fontFamily?: string; fontSize?: string; fontWeight?: string; }
    export class InfoWindow { constructor(opts?: any); open(map: Map, anchor?: MVCObject): void; setContent(content: string | Node): void; close(): void; }
    export class Polyline extends MVCObject { constructor(opts?: PolylineOptions); setMap(map: Map | null): void; }
    export interface PolylineOptions { path?: any[]; strokeColor?: string; strokeOpacity?: number; strokeWeight?: number; map?: Map; }
    export interface Icon { url: string; scaledSize?: Size; }
    export interface Symbol { path: string | number; scale?: number; fillColor?: string; fillOpacity?: number; strokeWeight?: number; strokeColor?: string; labelOrigin?: Point; }
    export enum SymbolPath { CIRCLE, FORWARD_CLOSED_ARROW }

    // --- Geocoding ---
    export class Geocoder {
        constructor();
        geocode(
            request: GeocoderRequest,
            callback: (results: GeocoderResult[] | null, status: GeocoderStatus) => void
        ): void;
    }
    export interface GeocoderRequest { address?: string; location?: LatLng | LatLngLiteral; placeId?: string; }
    export interface GeocoderResult { formatted_address: string; geometry: GeocoderGeometry; }
    export interface GeocoderGeometry { location: LatLng; }
    export enum GeocoderStatus {
        OK = "OK",
        ZERO_RESULTS = "ZERO_RESULTS",
        OVER_QUERY_LIMIT = "OVER_QUERY_LIMIT",
        REQUEST_DENIED = "REQUEST_DENIED",
        INVALID_REQUEST = "INVALID_REQUEST",
        UNKNOWN_ERROR = "UNKNOWN_ERROR",
        ERROR = "ERROR",
    }


    // --- Drawing Manager ---
    namespace drawing {
      export class DrawingManager extends MVCObject { constructor(options?: DrawingManagerOptions); setMap(map: Map | null): void; setDrawingMode(drawingMode: OverlayType | null): void; }
      export interface DrawingManagerOptions { drawingMode?: OverlayType | null; drawingControl?: boolean; drawingControlOptions?: DrawingControlOptions; map?: Map; circleOptions?: CircleOptions; polygonOptions?: PolygonOptions; }
      export interface DrawingControlOptions { drawingModes?: OverlayType[]; position?: ControlPosition; }
      export enum OverlayType { CIRCLE = 'circle', POLYGON = 'polygon', }
      export interface OverlayCompleteEvent { overlay: Circle | Polygon | null; type: OverlayType; }
    }
    
    // --- Shapes ---
    export class Polygon extends MVCObject { constructor(opts?: PolygonOptions); setMap(map: Map | null): void; getPath(): any; getBounds(): LatLngBounds | null; }
    export interface PolygonOptions { paths?: any[]; strokeColor?: string; strokeOpacity?: number; strokeWeight?: number; fillColor?: string; fillOpacity?: number; clickable?: boolean; editable?: boolean; }
    export class Circle extends MVCObject { constructor(opts?: CircleOptions); setMap(map: Map | null): void; getBounds(): LatLngBounds | null; getCenter(): LatLng; getRadius(): number; }
    export interface CircleOptions { center?: LatLng | LatLngLiteral; radius?: number; strokeColor?: string; strokeOpacity?: number; strokeWeight?: number; fillColor?: string; fillOpacity?: number; clickable?: boolean; editable?: boolean; }
    export enum ControlPosition { TOP_CENTER }

    // --- Geometry Library ---
    namespace geometry {
        export const poly: { containsLocation(point: LatLng | LatLngLiteral, polygon: Polygon): boolean; };
        export const spherical: { computeDistanceBetween(from: LatLng | LatLngLiteral, to: LatLng | LatLngLiteral, radius?: number): number; };
    }
  }
}

interface GoogleMapViewProps {
  center: google.maps.LatLngLiteral;
  zoom: number;
  markers?: MapMarkerData[];
  paths?: MapPathData[];
  mapContainerStyle?: React.CSSProperties;
  drawingTools?: {
    enabled: boolean;
    onCircleComplete: (circle: google.maps.Circle) => void;
    onPolygonComplete: (polygon: google.maps.Polygon) => void;
  };
}

const GoogleMapView: React.FC<GoogleMapViewProps> = ({
  center, zoom, markers = [], paths = [],
  mapContainerStyle = { height: '100%', width: '100%' },
  drawingTools,
}) => {
  const mapRef = useRef<HTMLDivElement>(null);
  const [map, setMap] = useState<google.maps.Map | null>(null);
  const infoWindowRef = useRef<google.maps.InfoWindow | null>(null);
  
  const drawingManagerRef = useRef<google.maps.drawing.DrawingManager | null>(null);
  const currentMarkersRef = useRef<google.maps.Marker[]>([]);
  const currentPathsRef = useRef<google.maps.Polyline[]>([]);

  // Initialize map
  useEffect(() => {
    const init = () => {
      if (mapRef.current && window.google && window.google.maps) {
        const newMap = new window.google.maps.Map(mapRef.current, {
          center, zoom, mapTypeControl: true, streetViewControl: false, fullscreenControl: false, zoomControl: true,
        });
        setMap(newMap);
        infoWindowRef.current = new window.google.maps.InfoWindow();
      }
    };

    if (window.googleMapsApiLoaded) { init(); } 
    else { const intervalId = setInterval(() => { if (window.googleMapsApiLoaded) { clearInterval(intervalId); init(); } }, 100); return () => clearInterval(intervalId); }
  }, []); // Only run once on mount

  // Initialize or update DrawingManager
  useEffect(() => {
    if (!map) return;
    if (drawingTools?.enabled && window.google?.maps?.drawing) {
      if (!drawingManagerRef.current) {
        const newDrawingManager = new window.google.maps.drawing.DrawingManager({
          drawingMode: null, drawingControl: true,
          drawingControlOptions: {
            position: window.google.maps.ControlPosition.TOP_CENTER,
            drawingModes: [ window.google.maps.drawing.OverlayType.POLYGON, window.google.maps.drawing.OverlayType.CIRCLE ],
          },
          circleOptions: { fillColor: '#4285F4', fillOpacity: 0.2, strokeWeight: 2, clickable: false, editable: true, zIndex: 1 },
          polygonOptions: { fillColor: '#4285F4', fillOpacity: 0.2, strokeWeight: 2, clickable: false, editable: true, zIndex: 1 },
        });

        window.google.maps.event.addListener(newDrawingManager, 'overlaycomplete', (event: google.maps.drawing.OverlayCompleteEvent) => {
          if (event.type === window.google.maps.drawing.OverlayType.CIRCLE) {
            drawingTools.onCircleComplete(event.overlay as google.maps.Circle);
          } else if (event.type === window.google.maps.drawing.OverlayType.POLYGON) {
            drawingTools.onPolygonComplete(event.overlay as google.maps.Polygon);
          }
          newDrawingManager.setDrawingMode(null); // Exit drawing mode after one shape
        });

        newDrawingManager.setMap(map);
        drawingManagerRef.current = newDrawingManager;
      } else {
        drawingManagerRef.current.setMap(map);
      }
    } else {
      if (drawingManagerRef.current) drawingManagerRef.current.setMap(null);
    }
  }, [map, drawingTools]);

  // Update markers
  useEffect(() => {
    if (!map || !infoWindowRef.current) return;

    currentMarkersRef.current.forEach(marker => marker.setMap(null));
    currentMarkersRef.current = [];

    markers.forEach(markerData => {
      const markerOptions: google.maps.MarkerOptions = {
        position: markerData.position,
        map: map,
        title: markerData.title,
        icon: markerData.icon,
        label: markerData.label,
      };

      const marker = new window.google.maps.Marker(markerOptions);

      if (markerData.infoContent) {
        marker.addListener('click', () => {
          infoWindowRef.current!.setContent(markerData.infoContent!);
          infoWindowRef.current!.open(map, marker);
        });
      }
      currentMarkersRef.current.push(marker);
    });
    
    if (markers.length > 0 && window.google?.maps?.LatLngBounds) {
        const bounds = new window.google.maps.LatLngBounds();
        markers.forEach(m => bounds.extend(m.position));
        if (!bounds.isEmpty()) {
            map.fitBounds(bounds, 50);
        }
    }
  }, [map, markers]);

  // Update paths
  useEffect(() => {
    if (!map) return;

    currentPathsRef.current.forEach(path => path.setMap(null));
    currentPathsRef.current = [];

    paths.forEach(pathData => {
      const polyline = new window.google.maps.Polyline({
        path: pathData.coordinates, geodesic: true,
        strokeColor: pathData.strokeColor || '#FF0000', strokeOpacity: pathData.strokeOpacity || 1.0, strokeWeight: pathData.strokeWeight || 2,
        map: map,
        icons: [{ icon: { path: window.google.maps.SymbolPath.FORWARD_CLOSED_ARROW }, offset: '100%' }]
      });
      currentPathsRef.current.push(polyline);
    });

    if (paths.length > 0 && markers.length === 0 && window.google?.maps?.LatLngBounds) {
        const bounds = new window.google.maps.LatLngBounds();
        paths.forEach(p => p.coordinates.forEach(coord => bounds.extend(coord)));
         if (!bounds.isEmpty()) map.fitBounds(bounds, 50);
    }

  }, [map, paths, markers.length]); 

  return <div ref={mapRef} style={mapContainerStyle} aria-label="Location map" role="application" />;
};

export default GoogleMapView;

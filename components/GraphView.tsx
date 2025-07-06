import React, { useEffect, useRef, useMemo, useState, useCallback } from 'react';
import cytoscape, { BreadthFirstLayoutOptions } from 'cytoscape'; 
import { Share2, Zap, Info, ZoomIn, ZoomOut, RefreshCw, EyeOff, Eye, Edit, Download, X, Search as SearchIcon, XCircle, CodeXml, Phone, Clock, FileText, Users, Link as LinkIcon, CalendarDays, TowerControl, Route, Eraser, History, Filter as FilterIconLucide, Palette as PaletteIcon, Droplets, Smartphone as SmartphoneIcon, Landmark as BankIcon, MessageSquare as SmsIcon, Mail as MailIcon, User as UserSquareIcon, UserRound as UserRoundIcon, UserX, ShieldCheck, Skull, Truck, CarFront, Bike, CircleSlash, ChevronDown, ChevronUp, Maximize2, Minimize2, PaintBucket, Image as ImageIcon, LayoutGrid, RefreshCcw, AlertTriangle } from 'lucide-react'; // Added AlertTriangle, LayoutGrid, RefreshCcw
import { useCDRContext } from '../contexts/CDRContext';
import { GraphData, NodeContextMenuData, GraphNode, GraphEdge, EdgeContextMenuData } from '../types'; 
import { downloadJSON, downloadPNGFromBase64 } from '../utils/downloadUtils'; 
import { formatDateFromTimestamp } from '../utils/cdrUtils';


// Helper function to format duration from seconds to a readable string
const formatDurationDisplay = (seconds: number): string => { 
  if (isNaN(seconds) || seconds < 0) return '0s';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  let str = '';
  if (h > 0) str += `${h}h `;
  if (m > 0 || h > 0) str += `${m}m `;
  str += `${s}s`;
  return str.trim() || '0s';
};

const isValidTimestamp = (timestamp: any): timestamp is number => {
  return typeof timestamp === 'number' && !isNaN(timestamp) && timestamp > 0;
};


interface TooltipInfo {
  visible: boolean;
  content: React.ReactNode | string;
  x: number;
  y: number;
}

const DISTINCT_COLORS_HIGHLIGHT = [
  '#FF6347', // Tomato
  '#4682B4', // SteelBlue
  '#32CD32', // LimeGreen
  '#FFD700', // Gold
  '#6A5ACD', // SlateBlue
  '#FF4500', // OrangeRed
  '#20B2AA', // LightSeaGreen
  '#9370DB', // MediumPurple
  '#DAA520', // GoldenRod
  '#00CED1', // DarkTurquoise
];

// Define colors for different usage types
const USAGE_TYPE_COLORS: Record<string, string> = {
  MOC: '#3b82f6',     // Primary Blue
  MTC: '#10b981',     // Secondary Green
  SMSMO: '#f59e0b',   // Accent Orange
  SMSMT: '#8b5cf6',   // Violet
  DEFAULT: '#a1a1aa'  // Neutral Gray
};

const getDefaultEdgeColor = (usageType?: string): string => {
  if (!usageType) return USAGE_TYPE_COLORS.DEFAULT;
  const upperUsageType = usageType.toUpperCase();
  return USAGE_TYPE_COLORS[upperUsageType] || USAGE_TYPE_COLORS.DEFAULT;
};


const PREDEFINED_NODE_AND_EDGE_COLORS = [
  '#ef4444', '#f97316', '#eab308', '#22c55e', '#0ea5e9', '#6366f1', '#ec4899', '#78716c', 
  '#dc2626', '#d97706', '#ca8a04', '#16a34a', '#0284c7', '#4f46e5', '#db2777', '#57534e', 
  '#a16207', '#047857', '#0369a1', '#3730a3', '#86198f', '#7f1d1d', '#7c2d12', '#713f12'
];


const calculateTooltipPosition = (rawMouseX: number, rawMouseY: number, viewportWidth: number, viewportHeight: number) => {
    const baseOffsetX = 20; const baseOffsetY = 20;
    const estimatedTooltipWidth = 360; const estimatedTooltipHeight = 280;
    
    let currentX: number = rawMouseX + baseOffsetX;
    let currentY: number = rawMouseY + baseOffsetY;

    if (currentX + estimatedTooltipWidth > viewportWidth) {
        currentX = rawMouseX - estimatedTooltipWidth - baseOffsetX;
    }
    if (currentY + estimatedTooltipHeight > viewportHeight) {
        currentY = rawMouseY - estimatedTooltipHeight - baseOffsetY;
    }
    
    const finalX = Math.max(10, currentX);
    const finalY = Math.max(10, currentY);

    return { x: finalX, y: finalY };
};

const NODE_BASE_ICONS: Record<string, string> = {
  default: 'none',
  phone: `data:image/svg+xml;base64,${btoa('<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="20" x="5" y="2" rx="2" ry="2"/><path d="M12 18h.01"/></svg>')}`,
  bank: `data:image/svg+xml;base64,${btoa('<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="3" x2="21" y1="22" y2="22"/><line x1="6" x2="6" y1="18" y2="11"/><line x1="10" x2="10" y1="18" y2="11"/><line x1="14" x2="14" y1="18" y2="11"/><line x1="18" x2="18" y1="18" y2="11"/><polygon points="12 2 20 7 4 7"/></svg>')}`,
  sms: `data:image/svg+xml;base64,${btoa('<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>')}`,
  mail: `data:image/svg+xml;base64,${btoa('<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>')}`,
  male: `data:image/svg+xml;base64,${btoa('<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>')}`,
  female: `data:image/svg+xml;base64,${btoa('<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="5"/><path d="M20 21a8 8 0 0 0-16 0"/></svg>')}`,
  suspect: `data:image/svg+xml;base64,${btoa('<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="17" x2="22" y1="8" y2="13"/><line x1="22" x2="17" y1="8" y2="13"/></svg>')}`,
  police: `data:image/svg+xml;base64,${btoa('<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/></svg>')}`,
  robber: `data:image/svg+xml;base64,${btoa('<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="12" r="1"/><circle cx="15" cy="12" r="1"/><path d="M8 20v2h8v-2"/><path d="m12.5 17-.5-1-.5 1h1z"/><path d="M16 20a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2"/><path d="M16 20a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2"/><path d="M12 2c1.5 0 2 .7 2 2S13 6 12 6s-2-.7-2-2 .5-2 2-2Z"/><path d="M13 14H7.5c-.7 0-1-.3-1-1V9c0-1 1.5-3 4.5-3s4.5 2 4.5 3v4c0 .7-.3 1-1 1Z"/></svg>')}`,
  courier: `data:image/svg+xml;base64,${btoa('<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 18H3c-.6 0-1-.4-1-1V7c0-.6.4-1 1-1h10c.6 0 1 .4 1 1v11"/><path d="M14 9h4l4 4v4h-8v-4l-4-4Z"/><circle cx="7.5" cy="18.5" r="2.5"/><circle cx="17.5" cy="18.5" r="2.5"/></svg>')}`,
  car: `data:image/svg+xml;base64,${btoa('<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.1c-.5-.4-1.1-.7-1.8-.7H9.5c-.7 0-1.3.3-1.8.7-.9.7-2.2 2.1-2.2 2.1S5.3 10.6 3.5 10.1C2.7 9.9 2 10.5 2 11.4V16c0 .6.4 1 1 1h2"/><path d="M12 10V6.5"/><path d="m3 16-2 2"/><path d="m21 16 2 2"/><path d="M3 11v2.5"/><path d="M21 11v2.5"/><path d="M12 17a2 2 0 0 0-2-2H7a2 2 0 0 0-2 2"/><path d="M12 17a2 2 0 0 1 2-2h3a2 2 0 0 1 2 2"/></svg>')}`,
  motorcycle: `data:image/svg+xml;base64,${btoa('<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="5.5" cy="17.5" r="3.5"/><circle cx="18.5" cy="17.5" r="3.5"/><path d="M15 6l-4 4-4-4"/><path d="M15 6V4a2 2 0 0 0-2-2h-2a2 2 0 0 0-2 2v2"/><path d="M15 17.5h-1.5l-3-3-3 3H5.5"/></svg>')}`,
};

const ICON_PALETTE_ITEMS = [
    { key: 'phone', icon: <SmartphoneIcon size={18} />, label: 'Mobile' },
    { key: 'bank', icon: <BankIcon size={18} />, label: 'Bank' },
    { key: 'sms', icon: <SmsIcon size={18} />, label: 'SMS' },
    { key: 'mail', icon: <MailIcon size={18} />, label: 'Mail' },
    { key: 'male', icon: <UserSquareIcon size={18} />, label: 'Male' },
    { key: 'female', icon: <UserRoundIcon size={18} />, label: 'Female' },
    { key: 'suspect', icon: <UserX size={18} />, label: 'Suspect' },
    { key: 'police', icon: <ShieldCheck size={18} />, label: 'Police' },
    { key: 'robber', icon: <Skull size={18} />, label: 'Robber' },
    { key: 'courier', icon: <Truck size={18} />, label: 'Courier' },
    { key: 'car', icon: <CarFront size={18} />, label: 'Car' },
    { key: 'motorcycle', icon: <Bike size={18} />, label: 'Motorcycle' },
];

interface PaletteProps {
  selectedTool: { type: 'color' | 'icon', value: string } | null;
  onSelectTool: (tool: { type: 'color' | 'icon', value: string } | null) => void;
}

const Palette: React.FC<PaletteProps> = ({ selectedTool, onSelectTool }) => {
  return (
    <div className="w-48 bg-neutral-lightest border-l border-neutral-light p-3 space-y-4 flex-shrink-0 h-full overflow-y-auto scrollbar-thin">
      <div>
        <h4 className="text-xs font-semibold text-textPrimary mb-2">Edge Color</h4>
        <div className="grid grid-cols-5 gap-1.5">
          {PREDEFINED_NODE_AND_EDGE_COLORS.slice(0,15).map(color => ( 
            <button
              key={`edge-${color}`}
              title={`Select edge color ${color}`}
              className={`w-6 h-6 rounded-full border-2 transition-all ${selectedTool?.type === 'color' && selectedTool?.value === color ? 'border-primary-dark ring-2 ring-offset-1 ring-primary-dark' : 'border-transparent hover:border-neutral-dark'}`}
              style={{ backgroundColor: color }}
              onClick={() => onSelectTool({ type: 'color', value: color })}
              aria-pressed={selectedTool?.type === 'color' && selectedTool?.value === color}
            />
          ))}
        </div>
      </div>
      <div>
        <h4 className="text-xs font-semibold text-textPrimary mb-2">Node Icon</h4>
        <div className="grid grid-cols-4 gap-1.5">
          {ICON_PALETTE_ITEMS.map(item => (
            <button
              key={`icon-${item.key}`}
              title={`Select icon: ${item.label}`}
              className={`p-1.5 aspect-square flex flex-col items-center justify-center rounded-md border-2 transition-all text-textSecondary hover:text-primary hover:border-primary-light ${selectedTool?.type === 'icon' && selectedTool?.value === item.key ? 'border-primary-dark ring-2 ring-offset-1 ring-primary-dark bg-primary-lighter/50' : 'border-neutral-light bg-surface hover:bg-neutral-lightest'}`}
              onClick={() => onSelectTool({ type: 'icon', value: item.key })}
              aria-pressed={selectedTool?.type === 'icon' && selectedTool?.value === item.key}
            >
              {React.cloneElement(item.icon, {size: 20})}
              <span className="text-[8px] mt-0.5 text-center">{item.label}</span>
            </button>
          ))}
        </div>
      </div>
       <button 
          onClick={() => onSelectTool(null)}
          className="mt-2 w-full text-xs py-1.5 px-2 bg-neutral-light hover:bg-neutral-DEFAULT/30 rounded-md text-textPrimary shadow-sm disabled:opacity-50"
          disabled={!selectedTool}
          title="Clear current tool selection"
        >
          Clear Tool Selection
        </button>
    </div>
  );
};


const GraphView: React.FC = () => {
  const cyRef = useRef<cytoscape.Core | null>(null);
  const graphContainerRef = useRef<HTMLDivElement>(null);
  const activeLayoutRef = useRef<cytoscape.Layouts | null>(null); 
  const nodePositionsRef = useRef<Map<string, cytoscape.Position>>(new Map());
  


  const { 
    graphData, isLoading, error, 
    hiddenNodeIds, hideNode, showNode, resetHiddenNodes,
    customNodeLabels, setCustomNodeLabel, removeCustomNodeLabel, clearCustomNodeLabels,
    customEdgeColors, setCustomEdgeColor, removeCustomEdgeColor, clearAllCustomEdgeColors, 
    customNodeColors, setCustomNodeColor, removeCustomNodeColor, clearAllCustomNodeColors, 
    customNodeBaseIcons, setCustomNodeBaseIcon, removeCustomNodeBaseIcon, clearAllCustomNodeBaseIcons, 
    hiddenEdgeIds, hideEdge, showEdge, showAllHiddenEdges, 
    targetNodeForGraphView, setTargetNodeForGraphView, 
    filesToAnalyze, 
    activeGraphLayout, setActiveGraphLayout, 
    filteredRecords, 
    uploadedFiles,
    isGraphDataTrimmed,   
  } = useCDRContext();

  const [nodeContextMenu, setNodeContextMenu] = useState<NodeContextMenuData>({
    visible: false, x: 0, y: 0, nodeId: null, currentLabel: null, showNodeColorPalette: false, showNodeIconPalette: false
  });
  const [edgeContextMenu, setEdgeContextMenu] = useState<EdgeContextMenuData>({ 
    visible: false, x: 0, y: 0, edgeId: null, showEdgeColorPalette: false
  });
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [searchError, setSearchError] = useState<string | null>(null);
  const [tooltip, setTooltip] = useState<TooltipInfo>({ visible: false, content: '', x: 0, y: 0 });

  const [pathSourceNode, setPathSourceNode] = useState<string>("");
  const [pathTargetNode, setPathTargetNode] = useState<string>("");
  const [pathfindingError, setPathfindingError] = useState<string | null>(null);
  const [isPathfindingActive, setIsPathfindingActive] = useState<boolean>(false);
  const [showPathfindingControls, setShowPathfindingControls] = useState<boolean>(false);

  const [fullTimeSpan, setFullTimeSpan] = useState<{ min: number; max: number } | null>(null);
  const [timelineFilter, setTimelineFilter] = useState<{ start: number; end: number } | null>(null);
  const [interactionMessage, setInteractionMessage] = useState<string | null>(null);
  const [showTimelineControls, setShowTimelineControls] = useState<boolean>(false);

  const [uniqueUsageTypesForFilter, setUniqueUsageTypesForFilter] = useState<string[]>([]);
  const [highlightFilters, setHighlightFilters] = useState<{
    usageTypes: string[];
    minEdgeDuration: number | null;
    maxEdgeDuration: number | null;
    towerId: string;
    commonAcrossFiles: boolean;
  }>({
    usageTypes: [],
    minEdgeDuration: null,
    maxEdgeDuration: null,
    towerId: '',
    commonAcrossFiles: false,
  });
  const [isHighlightActive, setIsHighlightActive] = useState<boolean>(false);
  const [highlightInteractionMessage, setHighlightInteractionMessage] = useState<string | null>(null);
  const [showHighlightControls, setShowHighlightControls] = useState(false);

  const [selectedPaletteTool, setSelectedPaletteTool] = useState<{ type: 'color' | 'icon', value: string } | null>(null);
  const [isGraphFullscreen, setIsGraphFullscreen] = useState<boolean>(false);

  const availableLayouts = useMemo(() => [
    { name: 'cose', label: 'Cose (Default)' },
    { name: 'breadthfirst', label: 'Breadthfirst' },
    { name: 'circle', label: 'Circle' },
    { name: 'grid', label: 'Grid' },
    { name: 'random', label: 'Random' },
  ], []);


  useEffect(() => {
    const usageTypes = new Set<string>();
    graphData.edges.forEach(edge => {
      if (edge.data.usageType) {
        usageTypes.add(edge.data.usageType);
      }
    });
    setUniqueUsageTypesForFilter(Array.from(usageTypes).sort());
  }, [graphData.edges]);


  useEffect(() => {
    let minTs: number | undefined = undefined;
    let maxTs: number | undefined = undefined;

    graphData.nodes.forEach(node => {
      const firstSeen = node.data.firstSeenTimestamp;
      if (isValidTimestamp(firstSeen)) { 
        if (minTs === undefined || firstSeen < minTs) minTs = firstSeen;
      }
      const lastSeen = node.data.lastSeenTimestamp;
      if (isValidTimestamp(lastSeen)) { 
        if (maxTs === undefined || lastSeen > maxTs) maxTs = lastSeen;
      }
    });
     graphData.edges.forEach(edge => {
      const firstCall = edge.data.firstCallTimestamp;
      if (isValidTimestamp(firstCall)) { 
        if (minTs === undefined || firstCall < minTs) minTs = firstCall;
      }
      const lastCall = edge.data.lastCallTimestamp;
      if (isValidTimestamp(lastCall)) { 
        if (maxTs === undefined || lastCall > maxTs) maxTs = lastCall;
      }
    });

    if (minTs !== undefined && maxTs !== undefined && minTs <= maxTs) {
      const span = { min: minTs, max: maxTs };
      setFullTimeSpan(span);
      if (!timelineFilter || timelineFilter.start < span.min || timelineFilter.end > span.max || timelineFilter.start > timelineFilter.end) {
         setTimelineFilter({ start: span.min, end: span.max });
      }
    } else {
      setFullTimeSpan(null);
      setTimelineFilter(null);
    }
  }, [graphData.nodes, graphData.edges, timelineFilter]); 
  
  const timeFilteredCytoscapeElements = useMemo(() => {
    if (!timelineFilter || !fullTimeSpan) { 
      const nodes = graphData.nodes.map(nodeDefinition => ({ group: 'nodes' as const, data: nodeDefinition.data }));
      const edges = graphData.edges.map(edgeDefinition => ({ group: 'edges' as const, data: edgeDefinition.data }));
      return [...nodes, ...edges];
    }

    let currentNodesData = graphData.nodes.map(n => n.data);
    let currentEdgesData = graphData.edges.map(e => e.data);

    const { start: filterStart, end: filterEnd } = timelineFilter;
    currentNodesData = currentNodesData.filter(n => {
        const nodeFirstSeen = n.firstSeenTimestamp;
        const nodeLastSeen = n.lastSeenTimestamp;
        return isValidTimestamp(nodeFirstSeen) && isValidTimestamp(nodeLastSeen) &&
               nodeLastSeen >= filterStart && nodeFirstSeen <= filterEnd;
    });

    const visibleNodeIdsAfterTimeline = new Set(currentNodesData.map(n => n.id));

    currentEdgesData = currentEdgesData.filter(edge => {
        if (!visibleNodeIdsAfterTimeline.has(edge.source) || !visibleNodeIdsAfterTimeline.has(edge.target)) {
            return false; 
        }
        const edgeFirstCall = edge.firstCallTimestamp;
        const edgeLastCall = edge.lastCallTimestamp;
        return isValidTimestamp(edgeFirstCall) && isValidTimestamp(edgeLastCall) &&
               edgeLastCall >= filterStart && edgeFirstCall <= filterEnd;
    });
    
    return [
      ...currentNodesData.map(nodeData => ({ group: 'nodes' as const, data: nodeData })),
      ...currentEdgesData.map(edgeData => ({ group: 'edges' as const, data: edgeData }))
    ];
  }, [graphData, timelineFilter, fullTimeSpan]); 
  
  useEffect(() => {
    if (targetNodeForGraphView && cyRef.current && cyRef.current.nodes().length > 0) {
        const nodeToSelect = cyRef.current.getElementById(targetNodeForGraphView);
        if (nodeToSelect.length > 0) {
             if ((nodeToSelect as any).visible()) { 
                 cyRef.current.$(':selected').unselect(); 
                nodeToSelect.select();
                cyRef.current.animate({
                    fit: { eles: nodeToSelect, padding: 150 },
                    duration: 500
                });
                setInteractionMessage(`Node ${targetNodeForGraphView} highlighted.`);
            } else {
                 setInteractionMessage(`Node ${targetNodeForGraphView} found but is currently hidden or filtered out.`);
            }
        } else {
            setInteractionMessage(`Node ${targetNodeForGraphView} not found in the current graph view. It might be filtered out by timeline or other active filters.`);
        }
        setTargetNodeForGraphView(null);
    } else if (targetNodeForGraphView && (!cyRef.current || cyRef.current.nodes().length === 0)) {
        setTargetNodeForGraphView(null); 
    }
  }, [targetNodeForGraphView, setTargetNodeForGraphView, timeFilteredCytoscapeElements]);

  const coseLayoutOptions = useMemo(() => {
    const isMultiFileContext = filesToAnalyze.length > 1;
    return {
        name: 'cose',
        idealEdgeLength: isMultiFileContext ? 120 : 100,
        nodeOverlap: 20, 
        refresh: 20, 
        fit: true, 
        padding: 50, 
        componentSpacing: isMultiFileContext ? 150 : 100,
        nodeRepulsion: (node: any) => isMultiFileContext ? 600000 : 400000,
        edgeElasticity: isMultiFileContext ? 60 : 80,
        nestingFactor: 5, 
        gravity: isMultiFileContext ? 15 : 25,
        numIter: 1000, 
        initialTemp: 200, 
        coolingFactor: 0.95, 
        minTemp: 1.0,
    };
  }, [filesToAnalyze.length]);


  const closeAllContextMenus = useCallback(() => {
    setNodeContextMenu({ visible: false, x: 0, y: 0, nodeId: null, currentLabel: null, showNodeColorPalette: false, showNodeIconPalette: false });
    setEdgeContextMenu({visible: false, x:0, y:0, edgeId: null, showEdgeColorPalette: false});
    setIsRenaming(false); setRenameValue("");
  }, []);

  const closeNodeContextMenu = closeAllContextMenus; 
  const closeEdgeContextMenu = closeAllContextMenus; 
  

 const runAlgorithmicLayout = useCallback((layoutNameToRun: string, animated = true, isReapply = false) => {
    if (cyRef.current && cyRef.current.nodes().length > 0) {
        if (activeLayoutRef.current && typeof activeLayoutRef.current.stop === 'function') {
            activeLayoutRef.current.stop();
        }

        const previousLayoutName = cyRef.current.scratch('_currentLayoutName');
        if (!isReapply && previousLayoutName !== layoutNameToRun) {
            nodePositionsRef.current.clear(); // Clear positions for a fresh layout
        }
        
        let currentLayoutOptions: cytoscape.LayoutOptions;
        const aPartyNode = cyRef.current.$('node[?isAPartyNode]');
        const roots = aPartyNode.length > 0 ? aPartyNode : undefined;

        switch(layoutNameToRun) {
            case 'breadthfirst': {
                const options: BreadthFirstLayoutOptions = { name: 'breadthfirst', directed: true, padding: 30, spacingFactor: 1.2, animate: animated, animationDuration: 500, ...(roots && roots.size() > 0 && { roots }) };
                currentLayoutOptions = options;
                break;
            }
            case 'circle': {
                const options: cytoscape.CircleLayoutOptions = { name: 'circle', padding: 30, spacingFactor: 1.2, animate: animated, animationDuration: 500 };
                currentLayoutOptions = options;
                break;
            }
            case 'grid': {
                const options: cytoscape.GridLayoutOptions = { name: 'grid', padding: 30, spacingFactor: 1.2, animate: animated, animationDuration: 500 };
                currentLayoutOptions = options;
                break;
            }
            case 'random': {
                 const options: cytoscape.RandomLayoutOptions = { name: 'random', fit:true, padding: 30, animate: animated, animationDuration: 500 };
                 currentLayoutOptions = options;
                break;
            }
            case 'cose':
            default:{
                 const options: cytoscape.CoseLayoutOptions = { 
                    name: 'cose',
                    ...coseLayoutOptions,
                    animate: animated, 
                    animationDuration: animated ? 500 : 0,
                    randomize: (isReapply && previousLayoutName === 'cose') ? false : true,
                };
                currentLayoutOptions = options;
                break;
            }
        }
        activeLayoutRef.current = cyRef.current.layout(currentLayoutOptions);
        
        activeLayoutRef.current.one('layoutstop', () => {
            if (cyRef.current) {
                cyRef.current.nodes().forEach(node => {
                    if ((node as any).inside() && !(node as any).hasClass('hidden-by-user')) { 
                        nodePositionsRef.current.set(node.id(), { ...node.position() });
                    }
                });
            }
        });
        
        activeLayoutRef.current.run();
        if(cyRef.current) cyRef.current.scratch('_currentLayoutName', layoutNameToRun);
    }
  }, [coseLayoutOptions]);

  const applyHighlightStyles = useCallback(() => {
    if (!cyRef.current) return;
    const cy = cyRef.current;

    cy.elements().removeClass('user-highlighted user-dimmed highlighted-path-node highlighted-path-edge');
    
    if (!isHighlightActive) {
        setHighlightInteractionMessage(null); 
        return;
    }

    const { usageTypes, minEdgeDuration, maxEdgeDuration, towerId, commonAcrossFiles } = highlightFilters;
    
    let nodesToHighlight = cy.collection();
    let edgesToHighlight = cy.collection();

    cy.nodes().forEach(node => {
        const nodeData = node.data() as GraphNode;
        let matchesNodeCriteria = false;
        if (towerId && nodeData.associatedTowers?.includes(towerId.trim())) {
            matchesNodeCriteria = true;
        }
        if (commonAcrossFiles && filesToAnalyze.length > 0 && nodeData.fileIds) {
            const nodeFileIdsSet = new Set(nodeData.fileIds);
            const allSelectedFileIds = filesToAnalyze.map(f => f.id);
            let inAllSelected = allSelectedFileIds.length > 0;
            for (const selectedFileId of allSelectedFileIds) {
                if (!nodeFileIdsSet.has(selectedFileId)) {
                    inAllSelected = false;
                    break;
                }
            }
            if (inAllSelected) matchesNodeCriteria = true;
        }
        if (matchesNodeCriteria) {
            nodesToHighlight = nodesToHighlight.union(node);
        }
    });
    
    cy.edges().forEach(edge => {
        const edgeData = edge.data() as GraphEdge;
        let matchesEdgeCriteria = false;
        if (usageTypes.length > 0 && edgeData.usageType && usageTypes.includes(edgeData.usageType)) {
            matchesEdgeCriteria = true;
        }
        if (minEdgeDuration !== null && typeof edgeData.durationSum === 'number' && edgeData.durationSum >= minEdgeDuration) {
            matchesEdgeCriteria = true;
        }
        if (maxEdgeDuration !== null && typeof edgeData.durationSum === 'number' && edgeData.durationSum <= maxEdgeDuration) {
            matchesEdgeCriteria = true;
        }
        if (matchesEdgeCriteria) {
            edgesToHighlight = edgesToHighlight.union(edge);
        }
    });

    if (edgesToHighlight.length > 0) {
        edgesToHighlight.forEach(edge => {
            nodesToHighlight = nodesToHighlight.union(edge.source());
            nodesToHighlight = nodesToHighlight.union(edge.target());
        });
    }

    const allHighlightedElements = nodesToHighlight.union(edgesToHighlight);
    const anyFilterActive = usageTypes.length > 0 || minEdgeDuration !== null || maxEdgeDuration !== null || !!towerId || commonAcrossFiles;

    if (allHighlightedElements.length > 0) {
        allHighlightedElements.addClass('user-highlighted');
        cy.elements().not(allHighlightedElements).addClass('user-dimmed');
        setHighlightInteractionMessage(`${nodesToHighlight.length} node(s) and ${edgesToHighlight.length} edge(s) highlighted.`);
    } else if (anyFilterActive) {
        cy.elements().removeClass('user-highlighted user-dimmed');
        setHighlightInteractionMessage("No elements match the current highlight criteria.");
    } else {
        cy.elements().removeClass('user-highlighted user-dimmed');
        setHighlightInteractionMessage(null);
    }
  }, [highlightFilters, isHighlightActive, filesToAnalyze]);


  useEffect(() => {
    if (!graphContainerRef.current) return;
    
    const initialGetDefaultEdgeColor = (usageType?: string): string => {
      if (!usageType) return USAGE_TYPE_COLORS.DEFAULT;
      const upperUsageType = usageType.toUpperCase();
      return USAGE_TYPE_COLORS[upperUsageType] || USAGE_TYPE_COLORS.DEFAULT;
    };

    const cyInstance = cytoscape({
      container: graphContainerRef.current,
      elements: [], 
      style: [
        {
          selector: 'node',
          style: {
            'background-color': (ele: cytoscape.NodeSingular): string => {
                const customColor = customNodeColors.get(ele.id());
                if (customColor) return customColor;
                if (ele.data('isAPartyNode')) return '#f59e0b'; 
                if (ele.data('isHub')) return '#ef4444'; 
                return '#3b82f6'; 
            },
            'background-image': (ele: cytoscape.NodeSingular): string => {
                const customIconKey = customNodeBaseIcons.get(ele.id());
                return customIconKey ? NODE_BASE_ICONS[customIconKey] || NODE_BASE_ICONS.default : NODE_BASE_ICONS.default;
            },
            'background-fit': 'contain',
            'background-clip': 'none',
            'background-width': '60%',
            'background-height': '60%',
            'background-opacity': (ele: cytoscape.NodeSingular): number => {
                const customIconKey = customNodeBaseIcons.get(ele.id());
                return (customIconKey && NODE_BASE_ICONS[customIconKey] !== NODE_BASE_ICONS.default) ? 1 : 0;
            },
            'label': 'data(label)',
            'width': (ele: cytoscape.NodeSingular): string => `${Math.max(25, Math.min(60, (Number(ele.data('callCount')) || 3) * 1.7 + 18))}px`, 
            'height': (ele: cytoscape.NodeSingular): string => `${Math.max(25, Math.min(60, (Number(ele.data('callCount')) || 3) * 1.7 + 18))}px`,
            'font-size': 9,
            'text-valign': (ele: cytoscape.NodeSingular): 'center' | 'bottom' => ele.data('isAPartyNode') ? 'center' : 'bottom',
            'text-halign': 'center',
            'text-margin-y': (ele: cytoscape.NodeSingular): number => ele.data('isAPartyNode') ? 0 : 4, 
            'color': (ele: cytoscape.NodeSingular): string => {
                 const customIconKey = customNodeBaseIcons.get(ele.id());
                 const hasVisibleIcon = customIconKey && NODE_BASE_ICONS[customIconKey] !== NODE_BASE_ICONS.default;
                 if (hasVisibleIcon || ele.data('isAPartyNode')) return '#ffffff'; 
                 return '#111827'; 
            },
            'text-outline-width': 2, 
            'text-outline-color': (ele: cytoscape.NodeSingular): string => {
                 const customIconKey = customNodeBaseIcons.get(ele.id());
                 const hasVisibleIcon = customIconKey && NODE_BASE_ICONS[customIconKey] !== NODE_BASE_ICONS.default;
                 if (hasVisibleIcon) return '#4b5563'; 
                 if (ele.data('isAPartyNode')) return '#B45309'; 
                 return '#ffffff';
            },
            'text-wrap': 'wrap', 
            'text-overflow-wrap': 'anywhere', 
            'text-max-width': (ele: cytoscape.NodeSingular): string => `${(ele.data('isAPartyNode') || (customNodeBaseIcons.get(ele.id()) && NODE_BASE_ICONS[customNodeBaseIcons.get(ele.id())!] !== NODE_BASE_ICONS.default)) ? 85 : 70}px`,
            'border-width': (ele: cytoscape.NodeSingular): number => (ele.data('isAPartyNode') || ele.data('isHub')) ? 3 : 2, 
            'border-color': (ele: cytoscape.NodeSingular): string => {
                const customColor = customNodeColors.get(ele.id()); 
                if (customColor) return customColor; 
                if (ele.data('isAPartyNode')) return '#d97706'; 
                if (ele.data('isHub')) return '#dc2626';   
                return '#2563eb'; 
            },
            'transition-property': 'background-color, line-color, target-arrow-color, border-color, opacity, width, height, display, background-image, background-opacity', 
            'transition-duration': 250
          }
        },
         { 
          selector: 'node[?isAPartyNode]',
          style: {
            'text-valign': 'center', 
            'text-halign': 'center', 
            'text-margin-y': 0,
            'text-max-width': '85px',
          }
        },
        {
          selector: 'edge',
          style: {
            'width': (ele: cytoscape.EdgeSingular): string => `${Math.max(1.5, Math.min(10, (Number(ele.data('callCount')) || 1) * 1.2))}px`,
            'line-color': (ele: cytoscape.EdgeSingular): string => {
                const customColor = customEdgeColors.get(ele.id());
                return customColor || initialGetDefaultEdgeColor(ele.data('usageType'));
            },
            'target-arrow-color': (ele: cytoscape.EdgeSingular): string => {
                const customColor = customEdgeColors.get(ele.id());
                return customColor || initialGetDefaultEdgeColor(ele.data('usageType'));
            },
            'target-arrow-shape': 'triangle-tee', 
            'arrow-scale': 1.2, 
            'curve-style': 'bezier',
            'label': 'data(label)', 
            'font-size': 9, 
            'color': '#374151', 
            'text-background-opacity': 1, 
            'text-background-color': '#f8fafc', 
            'text-background-padding': '2px', 
            'text-background-shape': 'roundrectangle', 
            'text-rotation': 'autorotate', 
            'text-overflow-wrap': 'anywhere', 
            'text-max-width': '80px',
            'transition-property': 'background-color, line-color, target-arrow-color, border-color, opacity, width, display',
            'transition-duration': 250 
          }
        },
        { selector: 'node:selected', style: { 'border-width': 4, 'border-color': '#f59e0b', 'background-color': '#fbbf24', 'text-outline-color': '#fef3c7' } },
        { selector: 'edge:selected', style: { 'line-color': (ele: cytoscape.EdgeSingular): string => customEdgeColors.get(ele.id()) || USAGE_TYPE_COLORS.SMSMO, 'target-arrow-color': (ele: cytoscape.EdgeSingular): string => customEdgeColors.get(ele.id()) || USAGE_TYPE_COLORS.SMSMO, 'width': '5px' } }, 
        { selector: '.highlighted-path-node', style: { 'background-color': '#fcd34d', 'border-color': '#f59e0b', 'border-width': 4, 'z-index': 100, 'opacity': 1, } },
        { selector: '.highlighted-path-edge', style: { 'line-color': '#f59e0b', 'target-arrow-color': '#f59e0b', 'width': '5px', 'z-index': 100, 'opacity': 1, } }, 
        { selector: '.dimmed-element', style: { 'opacity': 0.15 } },
        { selector: 'node.user-highlighted', style: { 'background-color': DISTINCT_COLORS_HIGHLIGHT[0], 'border-color': DISTINCT_COLORS_HIGHLIGHT[1], 'border-width': 4, 'opacity': 1, 'z-index': 90, }},
        { selector: 'edge.user-highlighted', style: { 'line-color': (ele: cytoscape.EdgeSingular): string => DISTINCT_COLORS_HIGHLIGHT[0], 'target-arrow-color': (ele: cytoscape.EdgeSingular): string => DISTINCT_COLORS_HIGHLIGHT[0], 'width': '4px', 'opacity': 1, 'z-index': 90, }}, 
        { selector: '.user-dimmed', style: { 'opacity': 0.15, 'z-index': 1 } },
        { selector: '.hidden-by-user', style: { 'display': 'none' } } 
      ],
      layout: {name: 'preset'}, 
    });

    const graphContainerElement = graphContainerRef.current;
    const preventDefaultContextMenu = (event: MouseEvent) => {
      event.preventDefault();
    };
    if (graphContainerElement) {
      graphContainerElement.addEventListener('contextmenu', preventDefaultContextMenu, true);
    }
    
    cyInstance.on('cxttap', 'node', (event: cytoscape.EventObject) => {
      closeAllContextMenus();
      const node = event.target;
      setNodeContextMenu({ visible: true, x: event.renderedPosition.x, y: event.renderedPosition.y, nodeId: node.id(), currentLabel: node.data('label'), showNodeColorPalette: false, showNodeIconPalette: false });
    });

    cyInstance.on('cxttap', 'edge', (event: cytoscape.EventObject) => {
      closeAllContextMenus();
      const edge = event.target;
      setEdgeContextMenu({ visible: true, x: event.renderedPosition.x, y: event.renderedPosition.y, edgeId: edge.id(), showEdgeColorPalette: false });
    });

    cyInstance.on('cxttap', (event: cytoscape.EventObject) => {
      if (event.target === cyInstance) { 
        closeAllContextMenus();
      }
    });


    cyInstance.on('dragfreeon', 'node', (event) => {
        const node = event.target;
        if(!(node as any).hasClass('hidden-by-user')) { 
            nodePositionsRef.current.set(node.id(), { ...node.position() }); 
        }
    });
    
    cyInstance.on('tap', 'node', (event) => {
        const node = event.target;
        if (selectedPaletteTool?.type === 'icon' && selectedPaletteTool.value) {
            setCustomNodeBaseIcon(node.id(), selectedPaletteTool.value);
            setSelectedPaletteTool(null); 
        } else if (selectedPaletteTool?.type === 'color') {
             setCustomNodeColor(node.id(), selectedPaletteTool.value);
            setSelectedPaletteTool(null); 
        } else {
            closeAllContextMenus();
        }
    });
    cyInstance.on('tap', 'edge', (event) => {
        const edge = event.target;
        if (selectedPaletteTool?.type === 'color') {
            setCustomEdgeColor(edge.id(), selectedPaletteTool.value);
            setSelectedPaletteTool(null); 
        } else {
            closeAllContextMenus();
        }
    });
    cyInstance.on('tap', (event) => { 
      if (event.target === cyInstance) { 
        closeAllContextMenus();
        setSelectedPaletteTool(null); 
      }
    });
    cyInstance.on('zoom pan', () => { 
      closeAllContextMenus();
      setTooltip(prev => ({ ...prev, visible: false }));
    });

    const commonTooltipStyle = "text-xs space-y-0.5 text-textPrimary"; 
    cyInstance.on('mouseover', 'node', (evt) => { 
      const node = evt.target; const nodeData = node.data();
      const pos = calculateTooltipPosition(evt.originalEvent.clientX, evt.originalEvent.clientY, window.innerWidth, window.innerHeight);
      const tooltipContent = (<div className={commonTooltipStyle}> <p><strong>{customNodeLabels.get(nodeData.id) || nodeData.id}</strong> {nodeData.isAPartyNode ? '(AParty)' : ''} {nodeData.isHub ? <span className="text-xs font-bold text-danger-dark">(HUB)</span> : ''}</p> <p>Total Interactions: {nodeData.callCount || 0}</p> <p>Outgoing: {nodeData.outgoingCalls || 0} | Incoming: {nodeData.incomingCalls || 0}</p> <p>Total Duration: {formatDurationDisplay(nodeData.totalDuration || 0)}</p> {nodeData.firstSeenTimestamp && <p>First Seen: {formatDateFromTimestamp(nodeData.firstSeenTimestamp)}</p>} {nodeData.lastSeenTimestamp && <p>Last Seen: {formatDateFromTimestamp(nodeData.lastSeenTimestamp)}</p>} {nodeData.associatedTowers && nodeData.associatedTowers.length > 0 && <p className="max-w-[280px] truncate">Towers: {nodeData.associatedTowers.join(', ')}</p>} {nodeData.rawFileNames && nodeData.rawFileNames.length > 0 && <p className="max-w-[280px] truncate">Files: {nodeData.rawFileNames.join(', ')}</p>} {nodeData.imei && <p>IMEI (last seen): {nodeData.imei}</p>} </div>);
      setTooltip({ visible: true, content: tooltipContent, x: pos.x, y: pos.y });
    });
    cyInstance.on('mouseout', 'node', () => setTooltip(prev => ({ ...prev, visible: false })));
    cyInstance.on('mouseover', 'edge', (evt) => { 
      const edge = evt.target; const edgeData = edge.data();
      const pos = calculateTooltipPosition(evt.originalEvent.clientX, evt.originalEvent.clientY, window.innerWidth, window.innerHeight);
      const tooltipContent = (<div className={commonTooltipStyle}> <p>From: <strong>{customNodeLabels.get(edgeData.source) || edgeData.source}</strong> To: <strong>{customNodeLabels.get(edgeData.target) || edgeData.target}</strong></p> <p>Type: {edgeData.usageType || 'N/A'}</p> <p>Interactions: {edgeData.callCount || 0}</p> <p>Total Duration: {formatDurationDisplay(edgeData.durationSum || 0)}</p> {edgeData.firstCallTimestamp && <p>First Interaction: {formatDateFromTimestamp(edgeData.firstCallTimestamp)}</p>} {edgeData.lastCallTimestamp && <p>Last Interaction: {formatDateFromTimestamp(edgeData.lastCallTimestamp)}</p>} {edgeData.rawFileNamesForEdge && edgeData.rawFileNamesForEdge.length > 0 && <p className="max-w-[280px] truncate">Files: {edgeData.rawFileNamesForEdge.join(', ')}</p>} </div>);
      setTooltip({ visible: true, content: tooltipContent, x: pos.x, y: pos.y });
    });
    cyInstance.on('mouseout', 'edge', () => setTooltip(prev => ({ ...prev, visible: false })));

    cyRef.current = cyInstance;
    if (cyRef.current) cyRef.current.scratch('_currentLayoutName', 'preset');
    
    return () => { 
        if (activeLayoutRef.current && typeof activeLayoutRef.current.stop === 'function') { 
            activeLayoutRef.current.stop(); activeLayoutRef.current = null; 
        } 
        if (graphContainerElement) {
            graphContainerElement.removeEventListener('contextmenu', preventDefaultContextMenu, true);
        }
        if (cyRef.current) { cyRef.current.destroy(); cyRef.current = null; }
        nodePositionsRef.current.clear();
    };
  }, []); 

  useEffect(() => {
      if (cyRef.current && activeGraphLayout && cyRef.current.nodes().length > 0) {
          runAlgorithmicLayout(activeGraphLayout, true, false);
      }
  }, [activeGraphLayout, runAlgorithmicLayout]);

  useEffect(() => {
    if (cyRef.current && !isLoading) {
        if (activeLayoutRef.current && typeof activeLayoutRef.current.stop === 'function') {
            activeLayoutRef.current.stop();
        }

        const currentZoom = cyRef.current.zoom();
        const currentPan = cyRef.current.pan();
        const previousLayoutName = cyRef.current.scratch('_currentLayoutName');

        cyRef.current.batch(() => {
            if(cyRef.current) {
                cyRef.current.elements().remove();
                cyRef.current.add(timeFilteredCytoscapeElements);
            }
        });
        
        cyRef.current.nodes().forEach(nodeEle => {
            if (hiddenNodeIds.has(nodeEle.id())) nodeEle.addClass('hidden-by-user');
            else nodeEle.removeClass('hidden-by-user');
        });
        cyRef.current.edges().forEach(edgeEle => {
            if (hiddenEdgeIds.has(edgeEle.id())) edgeEle.addClass('hidden-by-user');
            else edgeEle.removeClass('hidden-by-user');
        });
        
        if (cyRef.current) {
            const cy = cyRef.current;
            const getDynamicLineColor = (ele: cytoscape.EdgeSingular): string => {
                const customColor = customEdgeColors.get(ele.id());
                return customColor || getDefaultEdgeColor(ele.data('usageType'));
            };
            const getDynamicArrowColor = (ele: cytoscape.EdgeSingular): string => {
                const customColor = customEdgeColors.get(ele.id());
                return customColor || getDefaultEdgeColor(ele.data('usageType'));
            };
            const getDynamicNodeIcon = (ele: cytoscape.NodeSingular): string => {
                const customIconKey = customNodeBaseIcons.get(ele.id());
                return customIconKey ? NODE_BASE_ICONS[customIconKey] || NODE_BASE_ICONS.default : NODE_BASE_ICONS.default;
            };
             const getDynamicNodeIconOpacity = (ele: cytoscape.NodeSingular): number => {
                const customIconKey = customNodeBaseIcons.get(ele.id());
                return (customIconKey && NODE_BASE_ICONS[customIconKey] !== NODE_BASE_ICONS.default) ? 1 : 0;
            };
            const getDynamicNodeColor = (ele: cytoscape.NodeSingular): string => {
                const customColor = customNodeColors.get(ele.id());
                if (customColor) return customColor;
                if (ele.data('isAPartyNode')) return '#f59e0b';
                if (ele.data('isHub')) return '#ef4444';
                return '#3b82f6';
            };


            cy.style()
              .selector('edge').style({ 'line-color': getDynamicLineColor, 'target-arrow-color': getDynamicArrowColor })
              .selector('node').style({ 
                  'background-image': getDynamicNodeIcon, 
                  'background-opacity': getDynamicNodeIconOpacity,
                  'background-color': getDynamicNodeColor,
                  'border-color': (el: cytoscape.NodeSingular) => {
                      const customColor = customNodeColors.get(el.id());
                      if(customColor) return customColor; 
                      if (el.data('isAPartyNode')) return '#d97706'; 
                      if (el.data('isHub')) return '#dc2626';   
                      return '#2563eb'; 
                  }
               })
              .update();
        }
        
        graphData.nodes.forEach(nodeDef => {
          const nodeEle = cyRef.current!.getElementById(nodeDef.data.id);
          if (nodeEle.length > 0) {
            const originalId = nodeDef.data.originalId || nodeDef.data.id;
            const nodeDataFromContext = nodeDef.data; 
            const customName = customNodeLabels.get(originalId);
            
            let finalDisplayLabel = nodeDataFromContext.label; 
            if (customName && customName.trim() !== "") { 
              const statsLabel = `O:${nodeDataFromContext.outgoingCalls || 0} | I:${nodeDataFromContext.incomingCalls || 0}`;
              let mainPartWithCustomName = `${customName.trim()} (${originalId})`;
              if (nodeDataFromContext.isAPartyNode) {
                finalDisplayLabel = mainPartWithCustomName;
                if (nodeDataFromContext.imei) finalDisplayLabel += `\nIMEI: ${nodeDataFromContext.imei}`;
                finalDisplayLabel += `\n${statsLabel}`;
              } else {
                finalDisplayLabel = `${mainPartWithCustomName}\n${statsLabel}`;
              }
            }
            if (nodeEle.data('label') !== finalDisplayLabel) nodeEle.data('label', finalDisplayLabel);
          }
        });
        
        if (isHighlightActive) {
            applyHighlightStyles();
        } else if (isPathfindingActive) {
            const pathNodes = cyRef.current.elements('.highlighted-path-node');
            if ((pathNodes as any).some((node: any) => node.hasClass('hidden-by-user') || !node.visible())) {
                handleClearPath();
            }
        } else {
             if (cyRef.current) {
               cyRef.current.elements().removeClass('highlighted-path-node highlighted-path-edge dimmed-element user-highlighted user-dimmed');
            }
        }

        if (cyRef.current) {
            cyRef.current.style().update();
        }

        Promise.resolve().then(() => {
            if (cyRef.current && timeFilteredCytoscapeElements.some(el => el.group === 'nodes')) {
                const layoutToUse = activeGraphLayout || 'cose';
                
                if (nodePositionsRef.current.size > 0 && previousLayoutName === layoutToUse) { 
                    const presetLayoutOptions: cytoscape.PresetLayoutOptions = {
                        name: 'preset',
                        positions: (node: any) => {
                            const p = nodePositionsRef.current.get(node.id());
                            // Fallback for nodes that might have been added and don't have a stored position
                            return p || { x: Math.random() * 800, y: Math.random() * 600 };
                        },
                        fit: false,
                        animate: false,
                    };
                    activeLayoutRef.current = cyRef.current.layout(presetLayoutOptions);
                    activeLayoutRef.current.run();
                } else {
                    // If layout changed or no positions saved for this layout, run algorithmic.
                    // isReapply is false because this useEffect is for data changes, not explicit re-apply button.
                    runAlgorithmicLayout(layoutToUse, true, false); 
                }
                 if(cyRef.current) cyRef.current.scratch('_currentLayoutName', layoutToUse);
            }
        });
    }
  }, [timeFilteredCytoscapeElements, isLoading, runAlgorithmicLayout, activeGraphLayout, hiddenNodeIds, hiddenEdgeIds, customEdgeColors, customNodeLabels, customNodeColors, customNodeBaseIcons, applyHighlightStyles, graphData.nodes, isHighlightActive, isPathfindingActive]);


  const handleHideNodeContextMenu = () => { if (nodeContextMenu.nodeId) hideNode(nodeContextMenu.nodeId); closeNodeContextMenu(); };
  const handleRenameNodeContextMenu = () => { if (nodeContextMenu.nodeId) { const originalId = nodeContextMenu.nodeId; const currentCustomName = customNodeLabels.get(originalId) || ""; setRenameValue(currentCustomName); setIsRenaming(true); } else closeNodeContextMenu(); };
  const submitRenameContextMenu = () => { if (nodeContextMenu.nodeId && renameValue.trim()) setCustomNodeLabel(nodeContextMenu.nodeId, renameValue.trim()); else if (nodeContextMenu.nodeId && !renameValue.trim()) removeCustomNodeLabel(nodeContextMenu.nodeId); closeNodeContextMenu(); };
  const handleToggleEdgeVisibilityContextMenu = () => { if (edgeContextMenu.edgeId) { if (hiddenEdgeIds.has(edgeContextMenu.edgeId)) showEdge(edgeContextMenu.edgeId); else hideEdge(edgeContextMenu.edgeId); } closeEdgeContextMenu(); };
  
  const handleResetNodeIcon = () => { if(nodeContextMenu.nodeId) removeCustomNodeBaseIcon(nodeContextMenu.nodeId); closeNodeContextMenu(); };
  const handleResetNodeColor = () => { if(nodeContextMenu.nodeId) removeCustomNodeColor(nodeContextMenu.nodeId); closeNodeContextMenu(); };
  const handleResetEdgeColor = () => { if(edgeContextMenu.edgeId) removeCustomEdgeColor(edgeContextMenu.edgeId); closeEdgeContextMenu(); };


  const downloadPNG = () => { if (cyRef.current) { const png64 = cyRef.current.png({ output: 'base64uri', full: true, scale: 2, bg: '#f8fafc' }); downloadPNGFromBase64(png64, `call_network_graph_${new Date().toISOString().split('T')[0]}.png`); }};
  const downloadGraphJSON = () => { if (cyRef.current) { const graphJson = cyRef.current.json(); downloadJSON(`call_network_graph_data_${new Date().toISOString().split('T')[0]}.json`, graphJson); }};
  const handleNodeSearch = () => { if (!cyRef.current || !searchTerm.trim()) { setSearchError(null); return; } const termLower = searchTerm.trim().toLowerCase(); const matchedNodes = cyRef.current.nodes().filter(node => (node.data('originalId') || node.id()).toLowerCase().includes(termLower) || String(node.data('label')).toLowerCase().includes(termLower) || (customNodeLabels.get(node.id()) || "").toLowerCase().includes(termLower) ); cyRef.current.$(':selected').unselect(); if (matchedNodes.length > 0) { matchedNodes.select(); cyRef.current.animate({ fit: { eles: matchedNodes, padding: 150 }, duration: 500 }); setSearchError(`${matchedNodes.length} node(s) found.`); } else { setSearchError(`Node "${searchTerm}" not found.`); }};
  const handleSearchKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => { if (event.key === 'Enter') handleNodeSearch(); };
  const clearSearch = () => { setSearchTerm(""); setSearchError(null); if (!isPathfindingActive && !isHighlightActive && cyRef.current) cyRef.current.$(':selected').unselect(); }
  
  const handleFindPath = () => { 
    if (!cyRef.current || !pathSourceNode.trim() || !pathTargetNode.trim()) { setPathfindingError("Both source and target node IDs are required."); setIsPathfindingActive(false); return; } 
    cyRef.current.elements().removeClass('highlighted-path-node highlighted-path-edge dimmed-element user-highlighted user-dimmed');
    const source = cyRef.current.getElementById(pathSourceNode.trim()); const target = cyRef.current.getElementById(pathTargetNode.trim()); 
    if (source.length === 0 || target.length === 0) { setPathfindingError("Source or target node not found in the graph."); setIsPathfindingActive(false); return; } 
    const aStar = cyRef.current.elements().aStar({ root: source, goal: target, directed: false }); 
    if (aStar.found) { 
        cyRef.current.elements().addClass('dimmed-element'); 
        aStar.path.addClass('highlighted-path-node highlighted-path-edge').removeClass('dimmed-element'); 
        cyRef.current.animate({ fit: { eles: aStar.path, padding: 80 }, duration: 500 }); 
        setPathfindingError(null); 
        setIsPathfindingActive(true); 
        setIsHighlightActive(false);
    } else { 
        setPathfindingError(`No path found between ${pathSourceNode} and ${pathTargetNode}.`); 
        setIsPathfindingActive(false); 
        cyRef.current.elements().removeClass('dimmed-element');
    } 
  };

  const handleClearPath = () => { 
    if (cyRef.current) cyRef.current.elements().removeClass('highlighted-path-node highlighted-path-edge dimmed-element user-highlighted user-dimmed'); 
    setPathSourceNode(""); setPathTargetNode(""); setPathfindingError(null); setIsPathfindingActive(false); 
  };
  
  const handleTimelineChange = (type: 'start' | 'end', value: string) => {
    if (!fullTimeSpan) return;
    const newTimeValue = parseInt(value, 10);

    setTimelineFilter(prevFilter => {
        const currentRange = prevFilter || { start: fullTimeSpan.min, end: fullTimeSpan.max };
        let newStart = currentRange.start;
        let newEnd = currentRange.end;

        if (type === 'start') {
            newStart = newTimeValue;
        } else { 
            newEnd = newTimeValue;
        }
        
        newStart = Math.max(fullTimeSpan.min, Math.min(newStart, fullTimeSpan.max));
        newEnd = Math.max(fullTimeSpan.min, Math.min(newEnd, fullTimeSpan.max));

        if (newStart > newEnd) {
           if (type === 'start') newStart = newEnd;
           else newEnd = newStart;
        }
        
        return { start: newStart, end: newEnd };
    });
  };


  const resetTimelineFilter = () => {
    if (fullTimeSpan) {
      setTimelineFilter({ start: fullTimeSpan.min, end: fullTimeSpan.max });
    }
    setInteractionMessage(null);
  };

  const handleHighlightFilterChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => { const { name, value, type } = e.target; if (type === 'checkbox') { const { checked } = e.target as HTMLInputElement; if (name === "commonAcrossFiles") { setHighlightFilters(prev => ({ ...prev, commonAcrossFiles: checked })); } else { setHighlightFilters(prev => ({ ...prev, usageTypes: checked ? [...prev.usageTypes, value] : prev.usageTypes.filter(v => v !== value) })); } } else { setHighlightFilters(prev => ({ ...prev, [name]: value === '' ? null : (type === 'number' ? Number(value) : value) })); } };
  
  const handleApplyHighlights = () => { 
    setIsHighlightActive(true); 
    setIsPathfindingActive(false); 
    if(cyRef.current) cyRef.current.elements().removeClass('highlighted-path-node highlighted-path-edge dimmed-element');
    applyHighlightStyles(); 
  }; 
  
  const handleClearHighlights = () => { 
    setIsHighlightActive(false); 
    setHighlightFilters({ usageTypes: [], minEdgeDuration: null, maxEdgeDuration: null, towerId: '', commonAcrossFiles: false }); 
    setHighlightInteractionMessage(null); 
    if (cyRef.current) cyRef.current.elements().removeClass('user-highlighted user-dimmed highlighted-path-node highlighted-path-edge dimmed-element'); 
  };

  const togglePathfindingControls = () => {
    const nextState = !showPathfindingControls;
    setShowPathfindingControls(nextState);
    if (nextState) { 
        setShowTimelineControls(false); setShowHighlightControls(false);
        if (isHighlightActive) handleClearHighlights();
        if (timelineFilter && fullTimeSpan && (timelineFilter.start !== fullTimeSpan.min || timelineFilter.end !== fullTimeSpan.max)) resetTimelineFilter();
    } else { 
        if (isPathfindingActive) handleClearPath();
    }
  };
  
  const toggleTimelineControls = () => {
    const nextState = !showTimelineControls;
    setShowTimelineControls(nextState);
    if (nextState) { 
        setShowPathfindingControls(false); setShowHighlightControls(false);
        if (isPathfindingActive) handleClearPath();
        if (isHighlightActive) handleClearHighlights();
    } else { 
        if (timelineFilter && fullTimeSpan && (timelineFilter.start !== fullTimeSpan.min || timelineFilter.end !== fullTimeSpan.max)) resetTimelineFilter();
    }
  };
  
  const toggleHighlightControls = () => {
    const nextState = !showHighlightControls;
    setShowHighlightControls(nextState);
    if (nextState) { 
        setShowPathfindingControls(false); setShowTimelineControls(false);
        if (isPathfindingActive) handleClearPath();
        if (timelineFilter && fullTimeSpan && (timelineFilter.start !== fullTimeSpan.min || timelineFilter.end !== fullTimeSpan.max)) resetTimelineFilter();
    } else { 
        if (isHighlightActive) handleClearHighlights();
    }
  };


  if (isLoading && graphData.nodes.length === 0) return <div className="flex justify-center items-center h-96"><div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary-dark"></div><p className="ml-3 text-textSecondary">Loading graph data...</p></div>;
  if (error) return <div className="p-4 bg-danger-lighter text-danger-darker rounded-lg text-center border border-danger-light">{error}</div>;
  if (uploadedFiles.length === 0 && !isLoading) return <div className="p-6 bg-info-lighter border border-info-light rounded-lg text-center text-info-dark flex flex-col items-center justify-center min-h-[150px] shadow-md"><Info size={28} className="mb-2" /><p className="font-medium">Please upload CDR files to visualize the network.</p></div>;
  if (filteredRecords.length === 0 && !isLoading) return <div className="p-6 bg-neutral-lightest border border-neutral-light rounded-lg text-center text-textSecondary flex flex-col items-center justify-center min-h-[150px] shadow-md"><Info size={28} className="mb-2 text-neutral-DEFAULT" /><p>No records match current filters. Please adjust filters to see graph.</p></div>;
  if (graphData.nodes.length === 0 && hiddenNodeIds.size === 0 && !timelineFilter && !isHighlightActive && !isLoading) return <div className="p-6 bg-neutral-lightest border border-neutral-light rounded-lg text-center text-textSecondary flex flex-col items-center justify-center min-h-[150px] shadow-md"><Info size={28} className="mb-2 text-neutral-DEFAULT" /><p>No graph data to display. Ensure records have AParty and BParty, and check timestamps.</p></div>;
  
  const visibleNodesCount = timeFilteredCytoscapeElements.filter(el => el.group === 'nodes' && !hiddenNodeIds.has(el.data.id)).length;
  const visibleEdgesCount = timeFilteredCytoscapeElements.filter(el => el.group === 'edges' && !hiddenEdgeIds.has(el.data.id)).length;

  if (visibleNodesCount === 0 && graphData.nodes.length > 0 && !isLoading) {
    if (hiddenNodeIds.size === graphData.nodes.length) {
        return <div className="p-6 bg-neutral-lightest border border-neutral-light rounded-lg text-center text-textSecondary flex flex-col items-center justify-center min-h-[150px] shadow-md"><Info size={28} className="mb-2 text-neutral-DEFAULT" /><p>All nodes are currently hidden.</p><button onClick={resetHiddenNodes} className="ml-2 mt-3 px-4 py-2 bg-primary text-white rounded-lg text-sm hover:bg-primary-dark shadow-md">Show All Nodes</button></div>;
    }
    if (timelineFilter && fullTimeSpan && (timelineFilter.start !== fullTimeSpan?.min || timelineFilter.end !== fullTimeSpan?.max)) { 
        return <div className="p-6 bg-neutral-lightest border border-neutral-light rounded-lg text-center text-textSecondary flex flex-col items-center justify-center min-h-[150px] shadow-md"><Info size={28} className="mb-2 text-neutral-DEFAULT" /><p>No nodes match the selected timeline filter.</p> <button onClick={resetTimelineFilter} className="ml-2 mt-3 px-4 py-2 bg-primary text-white rounded-lg text-sm hover:bg-primary-dark shadow-md">Reset Timeline</button></div>;
    }
    if (isHighlightActive) {
        return <div className="p-6 bg-neutral-lightest border border-neutral-light rounded-lg text-center text-textSecondary flex flex-col items-center justify-center min-h-[150px] shadow-md"><Info size={28} className="mb-2 text-neutral-DEFAULT" /><p>No nodes match the current highlight criteria or timeline filter.</p> <button onClick={handleClearHighlights} className="ml-2 mt-3 px-4 py-2 bg-primary text-white rounded-lg text-sm hover:bg-primary-dark shadow-md">Clear Highlights</button></div>;
    }
  }


  return (
    <div className="space-y-5 relative">
       {isGraphDataTrimmed && (
        <div className="p-3 bg-warning-lighter text-warning-darker rounded-lg border border-warning-light flex items-center shadow-md">
          <AlertTriangle size={18} className="mr-2"/>
          <p className="text-sm">
            Dataset is too large. The graph is showing a partial view of the first 15,000 records. Please apply more specific filters for a complete analysis.
          </p>
        </div>
      )}
      <div className="p-4 sm:p-5 bg-surface border border-neutral-light rounded-xl shadow-xl space-y-4">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
            <div className="mb-2 md:mb-0">
                <div className="flex items-center text-xl sm:text-2xl font-semibold text-textPrimary mb-1"> <Share2 size={24} className="mr-2.5 text-primary" /> Call Network Graph </div>
                <p className="text-sm text-textSecondary"> Visualizing {visibleNodesCount} numbers and {visibleEdgesCount} visible links. <br/> <Zap size={14} className="inline text-danger-dark" /> Hubs highlighted. Node size by call volume. Right-click for options. </p>
            </div>
             <div className="w-full md:w-auto flex flex-col sm:flex-row flex-wrap gap-2.5 items-stretch">
                 <div className="flex-grow sm:flex-grow-0 flex">
                    <div className="relative flex-grow">
                        <input type="text" placeholder="Find Node (ID/Name)" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} onKeyDown={handleSearchKeyDown} className="w-full pl-3 pr-10 py-2.5 text-sm border border-neutral-light rounded-l-lg focus:ring-2 focus:ring-primary-light focus:border-primary-light bg-surface text-textPrimary placeholder-neutral-DEFAULT shadow-sm" aria-label="Find Node in Graph" />
                        {searchTerm && <button onClick={clearSearch} className="absolute inset-y-0 right-0 pr-3 flex items-center text-neutral-DEFAULT hover:text-danger-dark" title="Clear search"><XCircle size={16} /></button>}
                    </div>
                    <button onClick={handleNodeSearch} title="Find Node" className="px-4 py-2.5 bg-primary text-white rounded-r-lg hover:bg-primary-dark text-sm flex items-center shadow-md hover:shadow-lg transition-all"> <SearchIcon size={16} className="mr-1 sm:mr-0"/> <span className="hidden sm:inline ml-1.5">Find</span> </button>
                </div>
                <div className="flex gap-2 flex-wrap items-center"> {/* Layout and Re-apply Controls */}
                    <select value={activeGraphLayout} onChange={(e) => setActiveGraphLayout(e.target.value)} className="p-2.5 text-xs border border-neutral-light rounded-lg focus:ring-2 focus:ring-primary-light focus:border-primary-light shadow-sm min-w-[100px] h-full" title="Select Layout Algorithm">
                        {availableLayouts.map(layout => (
                            <option key={layout.name} value={layout.name}>{layout.label}</option>
                        ))}
                    </select>
                    <button onClick={() => runAlgorithmicLayout(activeGraphLayout, true, true)} title="Re-apply Current Layout" className="p-2.5 bg-neutral-lighter hover:bg-neutral-light rounded-lg text-primary-dark shadow-sm hover:shadow-md transition-all h-full"><RefreshCcw size={18}/></button>
                </div>
                <div className="flex gap-2 flex-wrap"> {/* Existing Action Buttons */}
                    {hiddenNodeIds.size > 0 && <button onClick={resetHiddenNodes} title="Show All Hidden Nodes" className="p-2.5 bg-secondary-lighter/60 hover:bg-secondary-lighter/80 rounded-lg text-secondary-darker flex items-center text-xs shadow-sm hover:shadow-md transition-all"> <Eye size={16} className="mr-1.5"/> Show All Nodes ({hiddenNodeIds.size}) </button>}
                    {hiddenEdgeIds.size > 0 && <button onClick={showAllHiddenEdges} title="Show All Hidden Edges" className="p-2.5 bg-teal-100 hover:bg-teal-200 rounded-lg text-teal-700 flex items-center text-xs shadow-sm hover:shadow-md transition-all"> <Eye size={16} className="mr-1.5"/> Show All Edges ({hiddenEdgeIds.size}) </button>}
                    <button onClick={() => cyRef.current?.zoom(cyRef.current?.zoom() * 1.2)} title="Zoom In" className="p-2.5 bg-neutral-lighter hover:bg-neutral-light rounded-lg text-neutral-darker shadow-sm hover:shadow-md transition-all"><ZoomIn size={18}/></button>
                    <button onClick={() => cyRef.current?.zoom(cyRef.current?.zoom() * 0.8)} title="Zoom Out" className="p-2.5 bg-neutral-lighter hover:bg-neutral-light rounded-lg text-neutral-darker shadow-sm hover:shadow-md transition-all"><ZoomOut size={18}/></button>
                    <button onClick={() => cyRef.current?.fit(undefined, 50)} title="Fit to View" className="p-2.5 bg-neutral-lighter hover:bg-neutral-light rounded-lg text-neutral-darker shadow-sm hover:shadow-md transition-all"><Maximize2 size={18}/></button>
                    <button onClick={downloadPNG} title="Download Graph as PNG" className="p-2.5 bg-success text-white rounded-lg hover:bg-success-dark flex items-center text-xs shadow-sm hover:shadow-md transition-all"> <Download size={16} className="mr-1.5"/> PNG </button>
                    <button onClick={downloadGraphJSON} title="Download Graph as JSON" className="p-2.5 bg-info text-white rounded-lg hover:bg-info-dark flex items-center text-xs shadow-sm hover:shadow-md transition-all"> <CodeXml size={16} className="mr-1.5"/> JSON </button>
                </div>
            </div>
        </div>
         <div className="flex flex-wrap gap-2 pt-3 border-t border-neutral-light">
          {[
            {show: showPathfindingControls, toggle: togglePathfindingControls, title: "Find Path", icon: <Route size={16}/>, error: pathfindingError, isActive: isPathfindingActive},
            ...(fullTimeSpan ? [{show: showTimelineControls, toggle: toggleTimelineControls, title: "Timeline", icon: <History size={16}/>, error: null, isActive: !!timelineFilter && (timelineFilter.start !== fullTimeSpan.min || timelineFilter.end !== fullTimeSpan.max) }] : []),
            {show: showHighlightControls, toggle: toggleHighlightControls, title: "Highlight", icon: <PaletteIcon size={16}/>, error: highlightInteractionMessage, isActive: isHighlightActive},
          ].map(section => section && (
            <button 
                key={section.title} 
                onClick={section.toggle} 
                title={section.title}
                className={`px-3 py-2 rounded-lg text-xs flex items-center shadow-sm hover:shadow-md transition-all ${section.show ? 'bg-primary text-white ring-1 ring-primary-dark' : 'bg-neutral-lightest hover:bg-neutral-lighter text-textSecondary'}`}
                aria-pressed={section.show}
            >
                {React.cloneElement(section.icon, {className: `mr-1.5 ${section.show ? 'text-white': 'text-neutral-DEFAULT group-hover:text-primary-dark'}`})}
                {section.title}
                {section.show ? <ChevronUp size={14} className="ml-1 opacity-70"/> : <ChevronDown size={14} className="ml-1 opacity-70"/>}
            </button>
          ))}
        </div>
        {searchError && <p className="mt-2 text-xs text-danger-dark text-center md:text-right">{searchError}</p>}
        {interactionMessage && <p className="mt-2 text-xs text-warning-darker text-center md:text-left">{interactionMessage}</p>}
      </div>

      {showPathfindingControls && ( <div className="p-3 sm:p-4 bg-neutral-lightest/90 border border-neutral-light rounded-xl shadow-lg space-y-3 text-xs mt-4"> <h4 className="font-semibold text-textPrimary mb-1.5">Find Path Between Nodes</h4><div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-end"><input type="text" placeholder="Source Node ID" value={pathSourceNode} onChange={e => setPathSourceNode(e.target.value)} className="w-full p-1.5 border border-neutral-DEFAULT/50 rounded shadow-sm text-xs"/><input type="text" placeholder="Target Node ID" value={pathTargetNode} onChange={e => setPathTargetNode(e.target.value)} className="w-full p-1.5 border border-neutral-DEFAULT/50 rounded shadow-sm text-xs"/></div><div className="flex gap-2 mt-2"><button onClick={handleFindPath} className="px-3 py-1.5 bg-primary text-white rounded hover:bg-primary-dark text-xs shadow-sm flex items-center"><SearchIcon size={14} className="mr-1"/>Find Path</button><button onClick={handleClearPath} className="px-3 py-1.5 bg-neutral-light hover:bg-neutral-DEFAULT/30 text-textPrimary rounded text-xs shadow-sm flex items-center"><Eraser size={14} className="mr-1"/>Clear Path</button></div>{pathfindingError && <p className="text-xs text-danger-dark mt-1">{pathfindingError}</p>}</div> )}
      {fullTimeSpan && showTimelineControls && ( <div className="p-3 sm:p-4 bg-neutral-lightest/90 border border-neutral-light rounded-xl shadow-lg space-y-3 text-xs mt-4"> <h4 className="font-semibold text-textPrimary mb-1.5">Filter by Timeline</h4><div className="space-y-2"><div className="flex items-center justify-between"><label htmlFor="timelineStart" className="text-textSecondary mr-2">Start: {timelineFilter ? formatDateFromTimestamp(timelineFilter.start) : 'N/A'}</label><input type="range" id="timelineStart" min={fullTimeSpan.min} max={fullTimeSpan.max} value={timelineFilter?.start || fullTimeSpan.min} onChange={e => handleTimelineChange('start', e.target.value)} className="w-full accent-primary"/></div><div className="flex items-center justify-between"><label htmlFor="timelineEnd" className="text-textSecondary mr-2">End: {timelineFilter ? formatDateFromTimestamp(timelineFilter.end) : 'N/A'}</label><input type="range" id="timelineEnd" min={fullTimeSpan.min} max={fullTimeSpan.max} value={timelineFilter?.end || fullTimeSpan.max} onChange={e => handleTimelineChange('end', e.target.value)} className="w-full accent-primary"/></div></div><button onClick={resetTimelineFilter} className="mt-2 px-3 py-1.5 bg-neutral-light hover:bg-neutral-DEFAULT/30 text-textPrimary rounded text-xs shadow-sm flex items-center"><Eraser size={14} className="mr-1"/>Reset Timeline</button></div> )}
      {showHighlightControls && ( <div className="p-3 sm:p-4 bg-neutral-lightest/90 border border-neutral-light rounded-xl shadow-lg space-y-3.5 text-xs mt-4"> <h4 className="font-semibold text-textPrimary mb-1.5">Highlight Elements</h4><div className="grid grid-cols-1 sm:grid-cols-2 gap-3"><div className="space-y-1"><label className="block text-textSecondary">Usage Types:</label><div className="max-h-20 overflow-y-auto scrollbar-thin p-1 border border-neutral-DEFAULT/30 rounded">{uniqueUsageTypesForFilter.map(type => <label key={type} className="flex items-center text-textSecondary hover:text-textPrimary text-[10px]"><input type="checkbox" name={type} checked={highlightFilters.usageTypes.includes(type)} onChange={e => handleHighlightFilterChange(e as any)} value={type} className="mr-1 h-3 w-3 accent-primary"/>{type}</label>)}</div></div><div className="space-y-1"><label className="block text-textSecondary">Min Edge Duration (s):</label><input type="number" name="minEdgeDuration" value={highlightFilters.minEdgeDuration ?? ''} onChange={handleHighlightFilterChange} placeholder="e.g., 60" className="w-full p-1.5 border border-neutral-DEFAULT/50 rounded shadow-sm text-xs"/><label className="block text-textSecondary mt-1">Max Edge Duration (s):</label><input type="number" name="maxEdgeDuration" value={highlightFilters.maxEdgeDuration ?? ''} onChange={handleHighlightFilterChange} placeholder="e.g., 300" className="w-full p-1.5 border border-neutral-DEFAULT/50 rounded shadow-sm text-xs"/></div><div className="space-y-1 sm:col-span-2"><label className="block text-textSecondary">Tower ID (LAC-CID):</label><input type="text" name="towerId" value={highlightFilters.towerId} onChange={handleHighlightFilterChange} placeholder="Enter LAC-CID" className="w-full p-1.5 border border-neutral-DEFAULT/50 rounded shadow-sm text-xs"/></div><div className="sm:col-span-2 flex items-center"><input type="checkbox" id="commonAcrossFiles" name="commonAcrossFiles" checked={highlightFilters.commonAcrossFiles} onChange={handleHighlightFilterChange} className="mr-1.5 h-3.5 w-3.5 accent-primary"/><label htmlFor="commonAcrossFiles" className="text-textSecondary">Highlight nodes common across all selected files</label></div></div><div className="flex gap-2 mt-2"><button onClick={handleApplyHighlights} className="px-3 py-1.5 bg-primary text-white rounded hover:bg-primary-dark text-xs shadow-sm flex items-center"><Zap size={14} className="mr-1"/>Apply Highlights</button><button onClick={handleClearHighlights} className="px-3 py-1.5 bg-neutral-light hover:bg-neutral-DEFAULT/30 text-textPrimary rounded text-xs shadow-sm flex items-center"><Eraser size={14} className="mr-1"/>Clear Highlights</button></div>{highlightInteractionMessage && <p className="text-xs text-info-dark mt-1">{highlightInteractionMessage}</p>}</div> )}
      
    <div className={`flex ${isGraphFullscreen ? 'fixed inset-0 z-[999] bg-background' : ''}`}> 
      <div 
        ref={graphContainerRef} 
        className="flex-grow h-[600px] sm:h-[700px] border border-neutral-light rounded-xl bg-neutral-lightest/30 shadow-inner overflow-hidden scrollbar-thin scrollbar-thumb-neutral-light scrollbar-track-transparent" 
        style={isGraphFullscreen ? {height: '100vh', borderRadius: '0'} : {}}
      />
       <Palette
          selectedTool={selectedPaletteTool}
          onSelectTool={setSelectedPaletteTool}
        />
    </div>
      
       {tooltip.visible && ( <div style={{ position: 'fixed', left: tooltip.x, top: tooltip.y, background: 'rgba(255, 255, 255, 0.98)', border: '1px solid #e0e7ff', padding: '10px 14px', borderRadius: '10px', boxShadow: '0 8px 24px rgba(0, 0, 0, 0.15)', zIndex: 10000, maxWidth: '360px', pointerEvents: 'none', fontSize: '12px', lineHeight: '1.6', color: '#1f2937', backdropFilter: 'blur(3px)', }} > {tooltip.content} </div> )}
       
      {nodeContextMenu.visible && nodeContextMenu.nodeId && !isPathfindingActive && !isHighlightActive && (
        <div style={{ top: nodeContextMenu.y, left: nodeContextMenu.x }} className="absolute z-50 bg-surface border border-neutral-light rounded-lg shadow-xl py-1.5 text-sm min-w-[240px]" onClick={(e) => e.stopPropagation()}>
            {isRenaming ? (
                <div className="p-2.5">
                    <input type="text" value={renameValue} onChange={(e) => setRenameValue(e.target.value)} placeholder="Enter custom name" className="w-full p-1.5 border border-primary-light rounded-md text-xs mb-2 focus:ring-1 focus:ring-primary" autoFocus onKeyDown={(e) => { if (e.key === 'Enter') submitRenameContextMenu(); if (e.key === 'Escape') closeNodeContextMenu(); }}/>
                    <button onClick={submitRenameContextMenu} className="w-full px-3 py-1.5 text-xs bg-primary text-white rounded-md hover:bg-primary-dark">Save Name</button>
                </div>
            ) : (
            <>
                <div className="px-3 py-2 font-semibold text-xs text-primary-dark border-b border-neutral-light truncate" title={nodeContextMenu.currentLabel || nodeContextMenu.nodeId}>Node: {nodeContextMenu.currentLabel || nodeContextMenu.nodeId}</div>
                <button onClick={handleRenameNodeContextMenu} className="w-full text-left px-3 py-2 hover:bg-primary-lighter/50 flex items-center transition-colors text-xs"><Edit size={14} className="mr-2 text-neutral-DEFAULT"/>Rename Node</button>
                <button onClick={handleHideNodeContextMenu} className="w-full text-left px-3 py-2 hover:bg-primary-lighter/50 flex items-center transition-colors text-xs"><EyeOff size={14} className="mr-2 text-neutral-DEFAULT"/>Hide Node</button>
                <button onClick={() => setNodeContextMenu(prev => ({...prev, showNodeIconPalette: !prev.showNodeIconPalette, showNodeColorPalette: false}))} className="w-full text-left px-3 py-2 hover:bg-primary-lighter/50 flex items-center transition-colors text-xs"><ImageIcon size={14} className="mr-2 text-neutral-DEFAULT"/>Change Icon {nodeContextMenu.showNodeIconPalette ? <ChevronUp size={14} className="ml-auto"/> : <ChevronDown size={14} className="ml-auto"/>}</button>
                {nodeContextMenu.showNodeIconPalette && (
                    <div className="p-2 border-t border-neutral-light grid grid-cols-4 gap-1.5 bg-neutral-lightest">
                        {ICON_PALETTE_ITEMS.map(item => (
                            <button key={`ctx-icon-${item.key}`} title={item.label} onClick={() => { if(nodeContextMenu.nodeId) setCustomNodeBaseIcon(nodeContextMenu.nodeId, item.key); closeNodeContextMenu();}} className="p-1.5 aspect-square flex flex-col items-center justify-center rounded-md border border-neutral-DEFAULT/30 hover:bg-primary-lighter/60 text-textSecondary hover:text-primary-dark"><div className="text-primary">{React.cloneElement(item.icon, {size: 20})}</div><span className="text-[8px] mt-0.5 text-center">{item.label}</span></button>
                        ))}
                        <button onClick={handleResetNodeIcon} title="Reset to default icon" className="p-1.5 aspect-square flex flex-col items-center justify-center rounded-md border border-neutral-DEFAULT/30 hover:bg-danger-lighter text-danger text-center"><CircleSlash size={16}/><span className="text-[8px] mt-0.5">Reset</span></button>
                    </div>
                )}
                <button onClick={() => setNodeContextMenu(prev => ({...prev, showNodeColorPalette: !prev.showNodeColorPalette, showNodeIconPalette: false}))} className="w-full text-left px-3 py-2 hover:bg-primary-lighter/50 flex items-center transition-colors text-xs"><PaintBucket size={14} className="mr-2 text-neutral-DEFAULT"/>Change Color {nodeContextMenu.showNodeColorPalette ? <ChevronUp size={14} className="ml-auto"/> : <ChevronDown size={14} className="ml-auto"/>}</button>
                {nodeContextMenu.showNodeColorPalette && (
                    <div className="p-2 border-t border-neutral-light grid grid-cols-5 gap-1 bg-neutral-lightest">
                        {PREDEFINED_NODE_AND_EDGE_COLORS.map(color => (
                            <button key={`ctx-node-color-${color}`} title={color} onClick={() => { if(nodeContextMenu.nodeId) setCustomNodeColor(nodeContextMenu.nodeId, color); closeNodeContextMenu();}} className="w-5 h-5 rounded-full border border-neutral-DEFAULT/40 hover:ring-1 hover:ring-primary" style={{backgroundColor: color}} />
                        ))}
                         <button onClick={handleResetNodeColor} title="Reset to default color" className="w-5 h-5 flex items-center justify-center rounded-full border border-neutral-DEFAULT/40 text-danger hover:bg-danger-lighter"><CircleSlash size={12}/></button>
                    </div>
                )}
            </>
            )}
        </div>
      )}
      {edgeContextMenu.visible && edgeContextMenu.edgeId && !isPathfindingActive && !isHighlightActive && (
        <div style={{ top: edgeContextMenu.y, left: edgeContextMenu.x }} className="absolute z-50 bg-surface border border-neutral-light rounded-lg shadow-xl py-1.5 text-sm min-w-[200px]" onClick={(e) => e.stopPropagation()}>
            <div className="px-3 py-2 font-semibold text-xs text-primary-dark border-b border-neutral-light truncate">Edge Actions</div>
            <button onClick={handleToggleEdgeVisibilityContextMenu} className="w-full text-left px-3 py-2 hover:bg-primary-lighter/50 flex items-center transition-colors text-xs">{hiddenEdgeIds.has(edgeContextMenu.edgeId) ? <Eye size={14} className="mr-2"/> : <EyeOff size={14} className="mr-2"/>}{hiddenEdgeIds.has(edgeContextMenu.edgeId) ? 'Show Edge' : 'Hide Edge'}</button>
            <button onClick={() => setEdgeContextMenu(prev => ({...prev, showEdgeColorPalette: !prev.showEdgeColorPalette}))} className="w-full text-left px-3 py-2 hover:bg-primary-lighter/50 flex items-center transition-colors text-xs"><PaintBucket size={14} className="mr-2 text-neutral-DEFAULT"/>Change Edge Color {edgeContextMenu.showEdgeColorPalette ? <ChevronUp size={14} className="ml-auto"/> : <ChevronDown size={14} className="ml-auto"/>}</button>
             {edgeContextMenu.showEdgeColorPalette && (
                <div className="p-2 border-t border-neutral-light grid grid-cols-5 gap-1 bg-neutral-lightest">
                    {PREDEFINED_NODE_AND_EDGE_COLORS.map(color => (
                        <button key={`ctx-edge-color-${color}`} title={color} onClick={() => { if(edgeContextMenu.edgeId) setCustomEdgeColor(edgeContextMenu.edgeId, color); closeEdgeContextMenu();}} className="w-5 h-5 rounded-full border border-neutral-DEFAULT/40 hover:ring-1 hover:ring-primary" style={{backgroundColor: color}} />
                    ))}
                    <button onClick={handleResetEdgeColor} title="Reset to default color" className="w-5 h-5 flex items-center justify-center rounded-full border border-neutral-DEFAULT/40 text-danger hover:bg-danger-lighter"><CircleSlash size={12}/></button>
                </div>
            )}
        </div>
      )}
    </div>
  );
};

export default GraphView;
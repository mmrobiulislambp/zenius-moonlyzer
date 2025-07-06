
import React, { useEffect, useRef, useMemo, useState, useCallback } from 'react';
import cytoscape from 'cytoscape';
import { Share2, Zap, Info, ZoomIn, ZoomOut, RefreshCw, EyeOff, Eye, Edit, Download, X, Search as SearchIcon, XCircle, CodeXml, Maximize2, Minimize2, Pocket } from 'lucide-react';
import { useBkashContext } from '../contexts/BkashContext';
import { BkashRecord, GraphNode, GraphEdge } from '../types';
import { downloadJSON, downloadPNGFromBase64 } from '../utils/downloadUtils';
import { formatDateFromTimestamp, parseDateTime } from '../utils/cdrUtils';

const formatCurrencyMini = (amount?: number): string => {
  if (amount === undefined || amount === null || isNaN(amount)) return 'N/A';
  if (Math.abs(amount) >= 1e7) return `${(amount / 1e7).toFixed(1)}cr`;
  if (Math.abs(amount) >= 1e5) return `${(amount / 1e5).toFixed(1)}L`;
  if (Math.abs(amount) >= 1e3) return `${(amount / 1e3).toFixed(1)}k`;
  return amount.toFixed(0);
};

interface TooltipInfo {
  visible: boolean;
  content: React.ReactNode | string;
  x: number;
  y: number;
}

interface NodeContextMenuData {
  visible: boolean;
  x: number;
  y: number;
  nodeId: string | null;
  currentLabel: string | null;
}

const BKASH_NODE_COLOR = '#E2136E'; // bKash Pink
const BKASH_NODE_BORDER_COLOR = '#C00A5B';
const BKASH_SYSTEM_NODE_COLOR = '#f59e0b'; // Accent Orange
const BKASH_SYSTEM_NODE_BORDER_COLOR = '#d97706';

const EDGE_COLOR_SEND_MONEY = '#D946EF'; // Violet-500
const EDGE_COLOR_PAYMENT = '#10B981'; // Emerald-500
const EDGE_COLOR_CASH_IN = '#22C55E'; // Green-500
const EDGE_COLOR_CASH_OUT = '#EF4444'; // Red-500
const EDGE_COLOR_AIRTIME = '#0EA5E9'; // Sky-500
const EDGE_COLOR_DEFAULT = '#A1A1AA'; // Neutral-400


const BkashNetworkVisualizer: React.FC = () => {
  const cyRef = useRef<cytoscape.Core | null>(null);
  const graphContainerRef = useRef<HTMLDivElement>(null);
  const activeLayoutRef = useRef<cytoscape.Layouts | null>(null);
  const { globallyFilteredBkashRecords, isLoading, uploadedBkashFiles } = useBkashContext();

  const [tooltip, setTooltip] = useState<TooltipInfo>({ visible: false, content: '', x: 0, y: 0 });
  const [nodeContextMenu, setNodeContextMenu] = useState<NodeContextMenuData>({ visible: false, x: 0, y: 0, nodeId: null, currentLabel: null });
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [searchError, setSearchError] = useState<string | null>(null);
  const [isGraphFullscreen, setIsGraphFullscreen] = useState(false);
  const [hiddenNodeIds, setHiddenNodeIds] = useState<Set<string>>(new Set());
  const [customNodeLabels, setCustomNodeLabels] = useState<Map<string, string>>(new Map());


  const bkashGraphData = useMemo(() => {
    const nodesMap = new Map<string, GraphNode & { transactionCount: number; totalSent: number; totalReceived: number; }>();
    const edgesMap = new Map<string, GraphEdge & { transactionTypes: Set<string>; firstTimestamp?: number; lastTimestamp?: number }>();

    globallyFilteredBkashRecords.forEach(record => {
      const sender = record.sender;
      const receiver = record.receiver;
      const amount = record.transactedAmount;
      const trxType = record.trxType;
      const timestamp = parseDateTime(record.transactionDate)?.getTime();

      if (!sender || !receiver || typeof amount !== 'number') return;

      // Process Sender Node
      if (!nodesMap.has(sender)) {
        nodesMap.set(sender, { id: sender, label: sender, type: 'account', transactionCount: 0, totalSent: 0, totalReceived: 0 });
      }
      const senderNode = nodesMap.get(sender)!;
      senderNode.transactionCount = (senderNode.transactionCount || 0) + 1;
      senderNode.totalSent = (senderNode.totalSent || 0) + amount;

      // Process Receiver Node
      if (!nodesMap.has(receiver)) {
        nodesMap.set(receiver, { id: receiver, label: receiver, type: 'account', transactionCount: 0, totalSent: 0, totalReceived: 0 });
      }
      const receiverNode = nodesMap.get(receiver)!;
      receiverNode.transactionCount = (receiverNode.transactionCount || 0) + 1;
      receiverNode.totalReceived = (receiverNode.totalReceived || 0) + amount;

      // Edge: From Sender to Receiver
      const edgeKey = `${sender}->${receiver}`;
      let edge = edgesMap.get(edgeKey);
      if (!edge) {
        edge = { id: edgeKey, source: sender, target: receiver, callCount: 0, durationSum: 0, transactionTypes: new Set() };
      }
      edge.callCount!++;
      edge.durationSum! += amount;
      if (trxType) edge.transactionTypes.add(trxType);
      if (timestamp) {
        if (!edge.firstTimestamp || timestamp < edge.firstTimestamp) edge.firstTimestamp = timestamp;
        if (!edge.lastTimestamp || timestamp > edge.lastTimestamp) edge.lastTimestamp = timestamp;
      }
      edgesMap.set(edgeKey, edge);
    });

    nodesMap.forEach(node => {
      const customName = customNodeLabels.get(node.id);
      node.label = `${customName || node.id}\n(Tx: ${node.transactionCount}, S: ${formatCurrencyMini(node.totalSent)}, R: ${formatCurrencyMini(node.totalReceived)})`;
    });

    edgesMap.forEach(edge => {
      edge.label = `${edge.callCount} Tx(s), ${formatCurrencyMini(edge.durationSum || 0)}`;
      if (edge.transactionTypes.size > 0 && edge.transactionTypes.size <= 2) { 
        edge.label += `\n[${Array.from(edge.transactionTypes).slice(0,2).join(', ')}${edge.transactionTypes.size > 2 ? '...' : ''}]`;
      }
    });
    
    const finalNodes = Array.from(nodesMap.values()).filter(n => !hiddenNodeIds.has(n.id)).map(n => ({ data: n as GraphNode }));
    const finalEdges = Array.from(edgesMap.values()).filter(e => !hiddenNodeIds.has(e.source) && !hiddenNodeIds.has(e.target)).map(e => ({ data: e as GraphEdge }));

    return { nodes: finalNodes, edges: finalEdges };
  }, [globallyFilteredBkashRecords, hiddenNodeIds, customNodeLabels]);


  const layoutOptions = useMemo(() => ({
    name: 'cose',
    idealEdgeLength: () => 180, nodeOverlap: 20, refresh: 20, fit: true, padding: 50,
    randomize: false, componentSpacing: 100, nodeRepulsion: () => 400000,
    edgeElasticity: () => 100, nestingFactor: 5, gravity: 80, numIter: 1000,
    initialTemp: 200, coolingFactor: 0.95, minTemp: 1.0,
    animate: true, animationDuration: 500,
  }), []);

  const runLayout = useCallback(() => {
    if (cyRef.current) {
      if (activeLayoutRef.current && typeof activeLayoutRef.current.stop === 'function') {
        activeLayoutRef.current.stop();
      }
      activeLayoutRef.current = cyRef.current.layout(layoutOptions);
      activeLayoutRef.current.run();
    }
  }, [layoutOptions]);

  const closeNodeContextMenu = useCallback(() => {
    setNodeContextMenu({ visible: false, x: 0, y: 0, nodeId: null, currentLabel: null });
    setIsRenaming(false); setRenameValue("");
  }, []);

  const handleHideNode = () => {
    if (nodeContextMenu.nodeId) {
      setHiddenNodeIds(prev => new Set(prev).add(nodeContextMenu.nodeId!));
    }
    closeNodeContextMenu();
  };
  const handleShowAllNodes = () => setHiddenNodeIds(new Set());
  const handleRenameNode = () => {
    if (nodeContextMenu.nodeId) {
      setRenameValue(customNodeLabels.get(nodeContextMenu.nodeId) || "");
      setIsRenaming(true);
    } else { closeNodeContextMenu(); }
  };
  const submitRename = () => {
    if (nodeContextMenu.nodeId && renameValue.trim()) {
      setCustomNodeLabels(prev => new Map(prev).set(nodeContextMenu.nodeId!, renameValue.trim()));
    } else if (nodeContextMenu.nodeId && !renameValue.trim()) {
       setCustomNodeLabels(prev => { const map = new Map(prev); map.delete(nodeContextMenu.nodeId!); return map; });
    }
    closeNodeContextMenu();
  };


  useEffect(() => {
    if (!graphContainerRef.current) return;

    const getEdgeColorByDominantType = (txnTypes: Set<string>): string => {
        // Prioritize types for coloring
        if (txnTypes.has('Send Money')) return EDGE_COLOR_SEND_MONEY;
        if (txnTypes.has('Payment')) return EDGE_COLOR_PAYMENT;
        if (txnTypes.has('Cash In')) return EDGE_COLOR_CASH_IN;
        if (txnTypes.has('Cash Out')) return EDGE_COLOR_CASH_OUT;
        if (txnTypes.has('Mobile Recharge') || txnTypes.has('Airtime Topup')) return EDGE_COLOR_AIRTIME;
        return EDGE_COLOR_DEFAULT;
    };

    const cyInstance = cytoscape({
      container: graphContainerRef.current,
      elements: [],
      style: [
        {
          selector: 'node',
          style: {
            'background-color': (ele: cytoscape.NodeSingular) => ele.data('id') === "SYSTEM_NODE" ? BKASH_SYSTEM_NODE_COLOR : BKASH_NODE_COLOR,
            'label': 'data(label)',
            'width': (ele: cytoscape.NodeSingular):number => Math.max(40, Math.min(100, (ele.data('transactionCount') || 1) * 2 + 35)),
            'height': (ele: cytoscape.NodeSingular):number => Math.max(40, Math.min(100, (ele.data('transactionCount') || 1) * 2 + 35)),
            'font-size': 9, 'text-valign': 'center', 'text-halign': 'center',
            'color': '#ffffff', 'text-outline-width': 1, 'text-outline-color': '#780c3a', // Darker bKash pink for outline
            'text-wrap': 'wrap', 'text-max-width': '90px',
            'border-width': 2.5,
            'border-color': (ele: cytoscape.NodeSingular) => ele.data('id') === "SYSTEM_NODE" ? BKASH_SYSTEM_NODE_BORDER_COLOR : BKASH_NODE_BORDER_COLOR,
          }
        },
        {
          selector: 'edge',
          style: {
            'width': (ele: cytoscape.EdgeSingular): number => Math.max(2, Math.min(10, (ele.data('callCount') || 1) * 0.8 + 1.5)),
            'line-color': (ele: cytoscape.EdgeSingular) => getEdgeColorByDominantType(ele.data('transactionTypes')),
            'target-arrow-color': (ele: cytoscape.EdgeSingular) => getEdgeColorByDominantType(ele.data('transactionTypes')),
            'target-arrow-shape': 'triangle', 'arrow-scale': 1.2, 'curve-style': 'bezier',
            'label': 'data(label)', 'font-size': 8, 'color': '#374151',
            'text-background-opacity': 0.85, 'text-background-color': '#f3f4f6',
            'text-background-padding': '2px', 'text-background-shape': 'roundrectangle',
            'text-rotation': 'autorotate',
          }
        },
        { selector: 'node:selected', style: { 'border-width': 4, 'border-color': '#f59e0b' } }, 
        { selector: 'edge:selected', style: { 'line-color': '#f59e0b', 'target-arrow-color': '#f59e0b', width: 5 } }
      ],
      layout: { name: 'preset' },
    });

    cyInstance.on('cxttap', 'node', (event) => {
      const node = event.target;
      setNodeContextMenu({ visible: true, x: event.renderedPosition.x, y: event.renderedPosition.y, nodeId: node.id(), currentLabel: node.data('label') });
    });
    cyInstance.on('tap', (event) => { if (event.target === cyInstance) closeNodeContextMenu(); });
    cyInstance.on('zoom pan', closeNodeContextMenu);

    const setupTooltips = (cy: cytoscape.Core) => {
        cy.on('mouseover', 'node', (evt) => {
            const node = evt.target;
            const data = node.data();
            setTooltip({
            visible: true,
            content: (
                <div className="text-xs p-1 space-y-0.5">
                    <p><strong>Account:</strong> {customNodeLabels.get(data.id) || (data.id === "SYSTEM_NODE" ? "SYSTEM" : data.id)}</p>
                    <p><strong>Transactions:</strong> {data.transactionCount || 0}</p>
                    <p><strong>Total Sent:</strong> {formatCurrencyMini(data.totalSent || 0)}</p>
                    <p><strong>Total Received:</strong> {formatCurrencyMini(data.totalReceived || 0)}</p>
                </div>
            ),
            x: evt.renderedPosition.x + 15, y: evt.renderedPosition.y + 15,
            });
        });
        cy.on('mouseout', 'node', () => setTooltip(prev => ({ ...prev, visible: false })));
        cy.on('mouseover', 'edge', (evt) => {
            const edge = evt.target;
            const data = edge.data();
            setTooltip({
            visible: true,
            content: (
                <div className="text-xs p-1 space-y-0.5">
                <p><strong>From:</strong> {customNodeLabels.get(data.source) || data.source}</p>
                <p><strong>To:</strong> {customNodeLabels.get(data.target) || data.target}</p>
                <p><strong>Txn Count:</strong> {data.callCount || 0}</p>
                <p><strong>Total Amount:</strong> {formatCurrencyMini(data.durationSum || 0)}</p>
                {data.transactionTypes && Array.from(data.transactionTypes).length > 0 && <p className="max-w-[200px] truncate"><strong>Types:</strong> {Array.from(data.transactionTypes).join(', ')}</p>}
                {data.firstTimestamp && <p><strong>First:</strong> {formatDateFromTimestamp(data.firstTimestamp)}</p>}
                {data.lastTimestamp && <p><strong>Last:</strong> {formatDateFromTimestamp(data.lastTimestamp)}</p>}
                </div>
            ),
            x: evt.renderedPosition.x + 15, y: evt.renderedPosition.y + 15,
            });
        });
        cy.on('mouseout', 'edge', () => setTooltip(prev => ({ ...prev, visible: false })));
        cy.on('tap', (event) => { if (event.target === cy) setTooltip(prev => ({ ...prev, visible: false })); });
        cy.on('zoom pan', () => setTooltip(prev => ({ ...prev, visible: false })));
    };
    setupTooltips(cyInstance);
    cyRef.current = cyInstance;
    return () => { cyInstance.destroy(); cyRef.current = null; };
  }, [customNodeLabels]); 

  useEffect(() => {
    if (cyRef.current && !isLoading) {
      if (activeLayoutRef.current && typeof activeLayoutRef.current.stop === 'function') {
        activeLayoutRef.current.stop();
      }
      cyRef.current.batch(() => {
        if (cyRef.current) {
          cyRef.current.elements().remove();
          cyRef.current.add([...bkashGraphData.nodes, ...bkashGraphData.edges]);
        }
      });
      runLayout();
    }
  }, [bkashGraphData, isLoading, runLayout]);

  const downloadPNG = () => {
    if (cyRef.current) {
      const png64 = cyRef.current.png({ output: 'base64uri', full: true, scale: 2, bg: '#FFF1F2' }); // Light bKash pink background
      downloadPNGFromBase64(png64, `bkash_network_graph_${new Date().toISOString().split('T')[0]}.png`);
    }
  };
  const downloadGraphJSON = () => {
    if (cyRef.current) {
      const graphJson = cyRef.current.json();
      downloadJSON(`bkash_network_graph_data_${new Date().toISOString().split('T')[0]}.json`, graphJson);
    }
  };
  const handleNodeSearch = () => {
    if (!cyRef.current || !searchTerm.trim()) { setSearchError(null); return; }
    const termLower = searchTerm.trim().toLowerCase();
    const matchedNodes = cyRef.current.nodes().filter(node => {
        const nodeLabel = String(node.data('label')).toLowerCase();
        const nodeId = String(node.id()).toLowerCase();
        const customLabel = customNodeLabels.get(node.id())?.toLowerCase();
        return nodeId.includes(termLower) || nodeLabel.includes(termLower) || (customLabel && customLabel.includes(termLower));
    });
    cyRef.current.$(':selected').unselect();
    if (matchedNodes.length > 0) {
      matchedNodes.select();
      cyRef.current.animate({ fit: { eles: matchedNodes, padding: 150 }, duration: 500 });
      setSearchError(`${matchedNodes.length} node(s) found.`);
    } else {
      setSearchError(`Node "${searchTerm}" not found.`);
    }
  };
  const clearSearch = () => { setSearchTerm(""); setSearchError(null); if (cyRef.current) cyRef.current.$(':selected').unselect(); };


  if (isLoading && bkashGraphData.nodes.length === 0 && uploadedBkashFiles.length > 0) {
    return <div className="p-6 text-center text-textSecondary">Loading bKash data for visualization...</div>;
  }
  if (uploadedBkashFiles.length === 0 && !isLoading) {
    return (
      <div className="p-6 bg-info-lighter border border-info-light rounded-lg text-center text-info-dark flex flex-col items-center justify-center min-h-[200px] shadow-md">
        <Info size={32} className="mb-3" />
        <h2 className="text-lg font-semibold mb-2">bKash Network Visualizer</h2>
        <p className="text-sm">Please upload bKash statement files to visualize the transaction network.</p>
      </div>
    );
  }
  if (globallyFilteredBkashRecords.length === 0 && !isLoading) {
     return (
      <div className="p-6 bg-neutral-lightest border border-neutral-light rounded-lg text-center text-textSecondary flex flex-col items-center justify-center min-h-[200px] shadow-md">
        <Share2 size={32} className="mb-3 text-pink-500" />
        <h2 className="text-lg font-semibold text-textPrimary mb-2">bKash Network Visualizer</h2>
        <p className="text-sm">No bKash records match the current filters. Please adjust filters.</p>
      </div>
    );
  }
  if (bkashGraphData.nodes.length === 0 && !isLoading) {
    return (
      <div className="p-6 bg-neutral-lightest border border-neutral-light rounded-lg text-center text-textSecondary flex flex-col items-center justify-center min-h-[200px] shadow-md">
        <Share2 size={32} className="mb-3 text-pink-500" />
        <h2 className="text-lg font-semibold text-textPrimary mb-2">bKash Network Visualizer</h2>
        <p className="text-sm">No visualizable interactions in the current bKash data.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="p-4 bg-surface border border-neutral-light rounded-xl shadow-lg flex flex-col sm:flex-row justify-between items-center gap-3">
        <div className="flex items-center text-lg font-semibold text-textPrimary">
          <Share2 size={22} className="mr-2 text-pink-500" /> bKash Transaction Network
        </div>
        <div className="w-full md:w-auto flex flex-col sm:flex-row flex-wrap gap-2 items-stretch">
            <div className="flex-grow sm:flex-grow-0 flex">
                <div className="relative flex-grow">
                    <input type="text" placeholder="Find Account" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleNodeSearch()} className="w-full pl-3 pr-10 py-2 text-sm border border-neutral-light rounded-l-lg focus:ring-2 focus:ring-pink-400 focus:border-pink-400" aria-label="Find Account in Graph" />
                    {searchTerm && <button onClick={clearSearch} className="absolute inset-y-0 right-0 pr-3 flex items-center text-neutral-DEFAULT hover:text-danger" title="Clear search"><XCircle size={16} /></button>}
                </div>
                <button onClick={handleNodeSearch} title="Find Account" className="px-3 py-2 bg-pink-500 text-white rounded-r-lg hover:bg-pink-600 text-sm flex items-center shadow-md"><SearchIcon size={16}/></button>
            </div>
            <div className="flex gap-2 flex-wrap">
                <button onClick={() => cyRef.current?.fit(undefined, 50)} title="Fit to View" className="p-2 bg-neutral-lighter hover:bg-neutral-light rounded-lg text-neutral-darker shadow-sm"><ZoomIn size={16}/></button>
                <button onClick={runLayout} title="Re-run Layout" className="p-2 bg-neutral-lighter hover:bg-neutral-light rounded-lg text-pink-600 shadow-sm"><RefreshCw size={16}/></button>
                {hiddenNodeIds.size > 0 && <button onClick={handleShowAllNodes} title="Show All Hidden Nodes" className="p-2 bg-pink-100 hover:bg-pink-200 rounded-lg text-pink-700 flex items-center text-xs shadow-sm"><Eye size={14} className="mr-1"/> Show All ({hiddenNodeIds.size})</button>}
                <button onClick={downloadPNG} title="Download PNG" className="p-2 bg-green-500 text-white rounded-lg hover:bg-green-600 text-xs flex items-center shadow-sm"><Download size={14} className="mr-1"/>PNG</button>
                <button onClick={downloadGraphJSON} title="Download JSON" className="p-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 text-xs flex items-center shadow-sm"><CodeXml size={14} className="mr-1"/>JSON</button>
                <button onClick={() => setIsGraphFullscreen(!isGraphFullscreen)} title={isGraphFullscreen ? "Exit Fullscreen" : "Fullscreen"} className="p-2 bg-neutral-lighter hover:bg-neutral-light rounded-lg text-neutral-darker shadow-sm">{isGraphFullscreen ? <Minimize2 size={16}/> : <Maximize2 size={16}/>}</button>
            </div>
        </div>
        {searchError && <p className="text-xs text-danger text-center sm:text-right mt-1">{searchError}</p>}
      </div>
      <div 
        ref={graphContainerRef} 
        className={`w-full border border-pink-200 rounded-xl bg-pink-50/30 shadow-inner overflow-hidden ${isGraphFullscreen ? 'fixed inset-0 z-[1000] !rounded-none !border-none' : 'h-[650px]'}`}
      />
      {tooltip.visible && (
        <div
          style={{ position: 'fixed', left: tooltip.x, top: tooltip.y, background: 'rgba(255, 240, 245, 0.98)', border: '1px solid #f472b6', padding: '8px 12px', borderRadius: '8px', boxShadow: '0 5px 15px rgba(0,0,0,0.1)', zIndex: 10001, maxWidth: '320px', pointerEvents: 'none', fontSize: '11px', lineHeight: '1.55', color: '#500724', backdropFilter: 'blur(3px)' }}
        >
          {tooltip.content}
        </div>
      )}
      {nodeContextMenu.visible && nodeContextMenu.nodeId && (
        <div style={{ top: nodeContextMenu.y, left: nodeContextMenu.x }} className="absolute z-50 bg-white border border-pink-300 rounded-lg shadow-xl py-1.5 text-sm min-w-[200px]" onClick={(e) => e.stopPropagation()}>
          {isRenaming ? (
            <div className="p-2.5">
              <input type="text" value={renameValue} onChange={(e) => setRenameValue(e.target.value)} placeholder="Enter custom name" className="w-full p-1.5 border border-pink-300 rounded-md text-xs mb-2 focus:ring-1 focus:ring-pink-500" autoFocus onKeyDown={(e) => { if (e.key === 'Enter') submitRename(); if (e.key === 'Escape') closeNodeContextMenu(); }}/>
              <button onClick={submitRename} className="w-full px-3 py-1.5 text-xs bg-pink-500 text-white rounded-md hover:bg-pink-600">Save Name</button>
            </div>
          ) : (
            <>
              <div className="px-3 py-2 font-semibold text-xs text-pink-700 border-b border-pink-200 truncate" title={nodeContextMenu.currentLabel || nodeContextMenu.nodeId}>Node: {nodeContextMenu.currentLabel || nodeContextMenu.nodeId}</div>
              <button onClick={handleHideNode} className="w-full text-left px-3 py-2 hover:bg-pink-50 flex items-center transition-colors text-xs"><EyeOff size={14} className="mr-2 text-neutral-500"/>Hide Node</button>
              <button onClick={handleRenameNode} className="w-full text-left px-3 py-2 hover:bg-pink-50 flex items-center transition-colors text-xs"><Edit size={14} className="mr-2 text-neutral-500"/>Rename Node</button>
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default BkashNetworkVisualizer;

import React, { useEffect, useRef, useMemo, useState, useCallback } from 'react';
import cytoscape from 'cytoscape';
import { Share2, Download, Info, ZoomIn, ZoomOut, RefreshCw, Maximize2, Minimize2, CodeXml } from 'lucide-react';
import { useNagadContext } from '../contexts/NagadContext';
import { NagadRecord, GraphNode, GraphEdge } from '../types'; // Ensure these types can accommodate Nagad specifics
import { downloadJSON, downloadPNGFromBase64 } from '../utils/downloadUtils';
import { formatDateFromTimestamp, parseDateTime } from '../utils/cdrUtils';

const formatCurrencyMini = (amount?: number): string => {
  if (amount === undefined || amount === null || isNaN(amount)) return 'N/A';
  if (Math.abs(amount) >= 1e7) return `${(amount / 1e7).toFixed(1)}cr`; // Crore
  if (Math.abs(amount) >= 1e5) return `${(amount / 1e5).toFixed(1)}L`;   // Lakh
  if (Math.abs(amount) >= 1e3) return `${(amount / 1e3).toFixed(1)}k`;   // Thousand
  return amount.toFixed(0);
};

interface TooltipInfo {
  visible: boolean;
  content: React.ReactNode | string;
  x: number;
  y: number;
}

const NagadNetworkVisualizer: React.FC = () => {
  const cyRef = useRef<cytoscape.Core | null>(null);
  const graphContainerRef = useRef<HTMLDivElement>(null);
  const activeLayoutRef = useRef<cytoscape.Layouts | null>(null);
  const { globallyFilteredNagadRecords, isLoading, uploadedNagadFiles } = useNagadContext();

  const [tooltip, setTooltip] = useState<TooltipInfo>({ visible: false, content: '', x: 0, y: 0 });
  const [isGraphFullscreen, setIsGraphFullscreen] = useState(false);

  const nagadGraphData = useMemo(() => {
    const allStatementAccountIDs = new Set<string>();
    uploadedNagadFiles.forEach(file => {
        (file.records || []).forEach(record => { // Ensure records exist
            if (record.STATEMENT_FOR_ACC) {
                allStatementAccountIDs.add(record.STATEMENT_FOR_ACC);
            }
        });
    });

    const nodesMap = new Map<string, GraphNode & { isStatementAccount?: boolean; transactionCount: number; totalAmount: number }>();
    const edgesMap = new Map<string, GraphEdge & { transactionTypes: Set<string> }>();

    globallyFilteredNagadRecords.forEach(record => {
      const sfa = record.STATEMENT_FOR_ACC;
      const twa = record.TXN_WITH_ACC === "SYSTEM" ? "SYSTEM_NODE" : record.TXN_WITH_ACC; // Handle SYSTEM node
      const drCr = record.TXN_TYPE_DR_CR;
      const amount = record.TXN_AMT;
      const txnType = record.TXN_TYPE;

      if (!sfa || !twa || typeof amount !== 'number') return;

      // Process SFA node
      if (!nodesMap.has(sfa)) {
        nodesMap.set(sfa, { id: sfa, label: sfa, type: 'account', isStatementAccount: true, transactionCount: 0, totalAmount: 0 });
      }
      const sfaNode = nodesMap.get(sfa)!;
      sfaNode.transactionCount = (sfaNode.transactionCount || 0) + 1;
      sfaNode.totalAmount = (sfaNode.totalAmount || 0) + (drCr === 'CREDIT' ? amount : -amount);

      // Process TWA node
      if (!nodesMap.has(twa)) {
        const twaIsStatementAccount = allStatementAccountIDs.has(twa);
        nodesMap.set(twa, { id: twa, label: twa, type: 'account', isStatementAccount: twaIsStatementAccount, transactionCount: 0, totalAmount: 0 });
      }
      const twaNode = nodesMap.get(twa)!;
      if (!twaNode.isStatementAccount && allStatementAccountIDs.has(twa)) { // Ensure isStatementAccount is true if it's in the global list
          twaNode.isStatementAccount = true;
      }
      twaNode.transactionCount = (twaNode.transactionCount || 0) + 1;
      twaNode.totalAmount = (twaNode.totalAmount || 0) + (drCr === 'CREDIT' ? -amount : amount);

      // Edge
      const source = drCr === 'CREDIT' ? twa : sfa;
      const target = drCr === 'CREDIT' ? sfa : twa;
      const edgeKey = `${source}->${target}`;

      let edge = edgesMap.get(edgeKey);
      if (!edge) {
        edge = { id: edgeKey, source, target, callCount: 0, durationSum: 0, transactionTypes: new Set() };
      }
      edge.callCount!++;
      edge.durationSum! += amount;
      if (txnType) edge.transactionTypes.add(txnType);
      edgesMap.set(edgeKey, edge);
    });

    nodesMap.forEach(node => {
      node.label = `${node.id === "SYSTEM_NODE" ? "SYSTEM" : node.id}${node.isStatementAccount && node.id !== "SYSTEM_NODE" ? ' (SFA)' : ''}\n(Tx: ${node.transactionCount}, Net: ${formatCurrencyMini(node.totalAmount)})`;
    });
    edgesMap.forEach(edge => {
      edge.label = `${edge.callCount} Txn(s), ${formatCurrencyMini(edge.durationSum || 0)}`;
      if (edge.transactionTypes.size > 0 && edge.transactionTypes.size <= 3) {
        edge.label += `\n[${Array.from(edge.transactionTypes).join(', ')}]`;
      }
    });

    return {
      nodes: Array.from(nodesMap.values()).map(n => ({ data: n as GraphNode })),
      edges: Array.from(edgesMap.values()).map(e => ({ data: e as GraphEdge })),
    };
  }, [globallyFilteredNagadRecords, uploadedNagadFiles]);

  const layoutOptions = useMemo(() => ({
    name: 'cose',
    idealEdgeLength: () => 180,
    nodeOverlap: 25,
    refresh: 20,
    fit: true,
    padding: 60,
    randomize: false,
    componentSpacing: 120,
    nodeRepulsion: () => 500000,
    edgeElasticity: () => 120,
    nestingFactor: 5,
    gravity: 90,
    numIter: 1200,
    initialTemp: 250,
    coolingFactor: 0.95,
    minTemp: 1.0,
    animate: true,
    animationDuration: 500,
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

  useEffect(() => {
    if (!graphContainerRef.current) return;

    const cyInstance = cytoscape({
      container: graphContainerRef.current,
      elements: [],
      style: [
        {
          selector: 'node',
          style: {
            'background-color': (ele: cytoscape.NodeSingular) => ele.data('isStatementAccount') ? '#3b82f6' : (ele.data('id') === 'SYSTEM_NODE' ? '#f59e0b' : '#6b7280'), // primary, accent, neutral
            'label': 'data(label)',
            'width': (ele: cytoscape.NodeSingular):number => Math.max(35, Math.min(90, (ele.data('transactionCount') || 1) * 2.5 + 30)),
            'height': (ele: cytoscape.NodeSingular):number => Math.max(35, Math.min(90, (ele.data('transactionCount') || 1) * 2.5 + 30)),
            'font-size': 9,
            'text-valign': 'center', 'text-halign': 'center',
            'color': '#ffffff', 'text-outline-width': 1, 'text-outline-color': '#4b5563',
            'text-wrap': 'wrap', 'text-max-width': '85px',
            'border-width': 2.5,
            'border-color': (ele: cytoscape.NodeSingular) => ele.data('isStatementAccount') ? '#1d4ed8' : (ele.data('id') === 'SYSTEM_NODE' ? '#d97706' : '#4b5563'),
          }
        },
        {
          selector: 'edge',
          style: {
            'width': (ele: cytoscape.EdgeSingular): number => Math.max(1.5, Math.min(9, (ele.data('callCount') || 1) * 0.6 + 1.5)),
            'line-color': (ele: cytoscape.EdgeSingular) => {
                const sourceIsSFA = ele.source().data('isStatementAccount');
                const targetIsSFA = ele.target().data('isStatementAccount');
                // If SFA -> Other (Debit from SFA) OR SFA1 -> SFA2 (Debit from SFA1)
                if (sourceIsSFA) return '#ef4444'; // Red for money out
                // If Other -> SFA (Credit to SFA)
                if (targetIsSFA) return '#10b981'; // Green for money in
                return '#a1a1aa'; // Neutral for Other -> Other (should be rare here)
            },
            'target-arrow-color': (ele: cytoscape.EdgeSingular) => {
                const sourceIsSFA = ele.source().data('isStatementAccount');
                if (sourceIsSFA) return '#ef4444';
                if (ele.target().data('isStatementAccount')) return '#10b981';
                return '#a1a1aa';
            },
            'target-arrow-shape': 'triangle', 'arrow-scale': 1.3, 'curve-style': 'bezier',
            'label': 'data(label)', 'font-size': 8, 'color': '#374151',
            'text-background-opacity': 0.85, 'text-background-color': '#f3f4f6',
            'text-background-padding': '2px', 'text-background-shape': 'roundrectangle',
            'text-rotation': 'autorotate',
          }
        },
        { selector: 'node:selected', style: { 'border-width': 4.5, 'border-color': '#f59e0b' } },
        { selector: 'edge:selected', style: { 'line-color': '#f59e0b', 'target-arrow-color': '#f59e0b', width: 5 } }
      ],
      layout: { name: 'preset' },
    });

    // Tooltip logic
    const setupTooltips = (cy: cytoscape.Core) => {
        cy.on('mouseover', 'node', (evt) => {
            const node = evt.target;
            const data = node.data();
            setTooltip({
            visible: true,
            content: (
                <div className="text-xs p-1 space-y-0.5">
                    <p><strong>Account:</strong> {data.id === "SYSTEM_NODE" ? "SYSTEM" : data.id}</p>
                    <p><strong>Type:</strong> {data.isStatementAccount && data.id !== "SYSTEM_NODE" ? 'Statement Account' : (data.id === "SYSTEM_NODE" ? "System Entity" : 'External Party')}</p>
                    <p><strong>Transactions:</strong> {data.transactionCount || 0}</p>
                    <p><strong>Net Flow:</strong> {formatCurrencyMini(data.totalAmount || 0)}</p>
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
                <p><strong>From:</strong> {data.source === "SYSTEM_NODE" ? "SYSTEM" : data.source}</p>
                <p><strong>To:</strong> {data.target === "SYSTEM_NODE" ? "SYSTEM" : data.target}</p>
                <p><strong>Txn Count:</strong> {data.callCount || 0}</p>
                <p><strong>Total Amount:</strong> {formatCurrencyMini(data.durationSum || 0)}</p>
                {data.transactionTypes && Array.from(data.transactionTypes).length > 0 && <p className="max-w-[200px] truncate"><strong>Types:</strong> {Array.from(data.transactionTypes).join(', ')}</p>}
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
  }, []);

  useEffect(() => {
    if (cyRef.current && !isLoading) {
      if (activeLayoutRef.current && typeof activeLayoutRef.current.stop === 'function') {
        activeLayoutRef.current.stop();
      }
      cyRef.current.batch(() => {
        if (cyRef.current) { // Check again inside batch
          cyRef.current.elements().remove();
          cyRef.current.add([...nagadGraphData.nodes, ...nagadGraphData.edges]);
        }
      });
      runLayout();
    }
  }, [nagadGraphData, isLoading, runLayout]);

  const downloadPNG = () => {
    if (cyRef.current) {
      const png64 = cyRef.current.png({ output: 'base64uri', full: true, scale: 2, bg: '#f8fafc' });
      downloadPNGFromBase64(png64, `nagad_network_graph_${new Date().toISOString().split('T')[0]}.png`);
    }
  };

  const downloadGraphJSON = () => {
    if (cyRef.current) {
      const graphJson = cyRef.current.json();
      downloadJSON(`nagad_network_graph_data_${new Date().toISOString().split('T')[0]}.json`, graphJson);
    }
  };
  
  if (isLoading && nagadGraphData.nodes.length === 0 && uploadedNagadFiles.length > 0) {
    return <div className="p-6 text-center text-textSecondary">Loading Nagad data for visualization...</div>;
  }

  if (uploadedNagadFiles.length === 0 && !isLoading) {
    return (
      <div className="p-6 bg-info-lighter border border-info-light rounded-lg text-center text-info-dark flex flex-col items-center justify-center min-h-[200px] shadow-md">
        <Info size={32} className="mb-3" />
        <h2 className="text-lg font-semibold mb-2">Nagad Network Visualizer</h2>
        <p className="text-sm">Please upload Nagad statement files to visualize the transaction network.</p>
      </div>
    );
  }
  
  if (globallyFilteredNagadRecords.length === 0 && !isLoading) {
     return (
      <div className="p-6 bg-neutral-lightest border border-neutral-light rounded-lg text-center text-textSecondary flex flex-col items-center justify-center min-h-[200px] shadow-md">
        <Share2 size={32} className="mb-3 text-primary" />
        <h2 className="text-lg font-semibold text-textPrimary mb-2">Nagad Network Visualizer</h2>
        <p className="text-sm">No Nagad records match the current filters. Please adjust filters.</p>
      </div>
    );
  }

  if (nagadGraphData.nodes.length === 0 && !isLoading) {
    return (
      <div className="p-6 bg-neutral-lightest border border-neutral-light rounded-lg text-center text-textSecondary flex flex-col items-center justify-center min-h-[200px] shadow-md">
        <Share2 size={32} className="mb-3 text-primary" />
        <h2 className="text-lg font-semibold text-textPrimary mb-2">Nagad Network Visualizer</h2>
        <p className="text-sm">No visualizable interactions in the current Nagad data (e.g., missing critical account numbers, amounts, or valid DR/CR types).</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="p-4 bg-surface border border-neutral-light rounded-xl shadow-lg flex flex-col sm:flex-row justify-between items-center gap-3">
        <div className="flex items-center text-lg font-semibold text-textPrimary">
          <Share2 size={22} className="mr-2 text-primary" /> Nagad Transaction Network
        </div>
        <div className="flex gap-2 flex-wrap">
            <button onClick={() => cyRef.current?.fit(undefined, 60)} title="Fit to View" className="p-2 bg-neutral-lighter hover:bg-neutral-light rounded-lg text-neutral-darker shadow-sm"><ZoomIn size={16}/></button>
            <button onClick={runLayout} title="Re-run Layout" className="p-2 bg-neutral-lighter hover:bg-neutral-light rounded-lg text-primary-dark shadow-sm"><RefreshCw size={16}/></button>
            <button onClick={downloadPNG} title="Download PNG" className="p-2 bg-success text-white rounded-lg hover:bg-success-dark text-xs flex items-center shadow-sm"><Download size={14} className="mr-1"/>PNG</button>
            <button onClick={downloadGraphJSON} title="Download JSON" className="p-2 bg-info text-white rounded-lg hover:bg-info-dark text-xs flex items-center shadow-sm"><CodeXml size={14} className="mr-1"/>JSON</button>
            <button onClick={() => setIsGraphFullscreen(!isGraphFullscreen)} title={isGraphFullscreen ? "Exit Fullscreen" : "Fullscreen"} className="p-2 bg-neutral-lighter hover:bg-neutral-light rounded-lg text-neutral-darker shadow-sm">{isGraphFullscreen ? <Minimize2 size={16}/> : <Maximize2 size={16}/>}</button>
        </div>
      </div>
      <div 
        ref={graphContainerRef} 
        className={`w-full border border-neutral-light rounded-xl bg-neutral-lightest/40 shadow-inner overflow-hidden ${isGraphFullscreen ? 'fixed inset-0 z-[1000] !rounded-none !border-none' : 'h-[650px]'}`}
      />
      {tooltip.visible && (
        <div
          style={{
            position: 'fixed', left: tooltip.x, top: tooltip.y,
            background: 'rgba(255, 255, 255, 0.98)', border: '1px solid #d1d5db',
            padding: '8px 12px', borderRadius: '8px', boxShadow: '0 5px 15px rgba(0,0,0,0.1)',
            zIndex: 10001, maxWidth: '320px', pointerEvents: 'none', fontSize: '11px',
            lineHeight: '1.55', color: '#1f2937', backdropFilter: 'blur(3px)',
          }}
        >
          {tooltip.content}
        </div>
      )}
    </div>
  );
};

export default NagadNetworkVisualizer;
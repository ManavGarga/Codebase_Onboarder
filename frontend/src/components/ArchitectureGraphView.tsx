import React, { useState, useMemo } from 'react';
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  Node,
  Edge,
  useNodesState,
  useEdgesState,
  MarkerType,
} from 'reactflow';
import 'reactflow/dist/style.css';
import {
  Route,
  Database,
  Cpu,
  Package,
  FileCode,
  Search,
  SlidersHorizontal,
  X,
  ExternalLink,
} from 'lucide-react';
import { KnowledgeGraphData, Repository } from '../types';

interface ArchitectureGraphViewProps {
  repository: Repository | null;
  graphData: KnowledgeGraphData | null;
  onSelectFileInMonaco?: (file: string, line?: number) => void;
}

export const ArchitectureGraphView: React.FC<ArchitectureGraphViewProps> = ({
  repository,
  graphData,
  onSelectFileInMonaco,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<string>('all');
  const [selectedNodeData, setSelectedNodeData] = useState<any | null>(null);

  // Layout nodes into a hierarchical grid
  const initialNodes: Node[] = useMemo(() => {
    if (!graphData?.nodes) return [];

    return graphData.nodes.map((node, index) => {
      // Determine columns by type
      let x = 100;
      let y = 100;

      const colIdx = ['route', 'class', 'function', 'model', 'file', 'package'].indexOf(node.type);
      x = (colIdx === -1 ? 0 : colIdx) * 280 + 50;
      y = (index % 12) * 90 + 50;

      let borderCol = 'border-blue-500/40';
      let badgeCol = 'bg-blue-500/20 text-blue-300';
      let icon = FileCode;

      if (node.type === 'route') {
        borderCol = 'border-emerald-500/50';
        badgeCol = 'bg-emerald-500/20 text-emerald-300';
        icon = Route;
      } else if (node.type === 'model') {
        borderCol = 'border-amber-500/50';
        badgeCol = 'bg-amber-500/20 text-amber-300';
        icon = Database;
      } else if (node.type === 'class' || node.type === 'service') {
        borderCol = 'border-indigo-500/50';
        badgeCol = 'bg-indigo-500/20 text-indigo-300';
        icon = Cpu;
      } else if (node.type === 'package') {
        borderCol = 'border-slate-500/40';
        badgeCol = 'bg-slate-500/20 text-slate-300';
        icon = Package;
      }

      return {
        id: node.id,
        position: { x, y },
        data: {
          ...node.data,
          label: (
            <div className="flex flex-col gap-1 text-left">
              <div className="flex items-center justify-between gap-2">
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider ${badgeCol}`}>
                  {node.type}
                </span>
                {node.data?.http_method && (
                  <span className="text-[10px] font-bold text-emerald-400">
                    {node.data.http_method}
                  </span>
                )}
              </div>
              <span className="text-xs font-semibold text-white truncate max-w-[200px]" title={node.label}>
                {node.label}
              </span>
              {node.file_path && (
                <span className="text-[10px] text-slate-400 truncate max-w-[200px]">
                  {node.file_path}
                </span>
              )}
            </div>
          ),
          rawNode: node,
        },
        style: {
          background: 'rgba(15, 23, 42, 0.85)',
          backdropFilter: 'blur(8px)',
          border: `1px solid`,
          borderColor: borderCol.replace('border-', ''),
          borderRadius: '12px',
          padding: '10px 14px',
          width: 220,
          color: '#fff',
        },
      };
    });
  }, [graphData]);

  const initialEdges: Edge[] = useMemo(() => {
    if (!graphData?.edges) return [];
    return graphData.edges.map((edge) => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      label: edge.label,
      animated: edge.animated || edge.label === 'HANDLES' || edge.label === 'QUERIES',
      style: { stroke: '#6366f1', strokeWidth: 1.5 },
      labelStyle: { fill: '#94a3b8', fontSize: 10, fontWeight: 600 },
      markerEnd: {
        type: MarkerType.ArrowClosed,
        color: '#6366f1',
      },
    }));
  }, [graphData]);

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  // Update nodes when initialNodes changes
  React.useEffect(() => {
    setNodes(initialNodes);
    setEdges(initialEdges);
  }, [initialNodes, initialEdges, setNodes, setEdges]);

  // Filter nodes
  const filteredNodes = useMemo(() => {
    return nodes.filter((n) => {
      const raw = n.data?.rawNode;
      if (!raw) return true;
      const matchesSearch =
        searchQuery === '' ||
        raw.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (raw.file_path && raw.file_path.toLowerCase().includes(searchQuery.toLowerCase()));
      const matchesType = filterType === 'all' || raw.type === filterType;
      return matchesSearch && matchesType;
    });
  }, [nodes, searchQuery, filterType]);

  const onNodeClick = (_: React.MouseEvent, node: Node) => {
    setSelectedNodeData(node.data?.rawNode || null);
  };

  return (
    <div className="relative w-full h-[calc(100vh-105px)] bg-dark-950 flex flex-col">
      {/* Top Filter Controls */}
      <div className="flex flex-wrap items-center justify-between gap-4 p-4 border-b border-white/10 bg-dark-900/60 backdrop-blur-md z-10">
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-2.5 w-3.5 h-3.5 text-slate-400" />
            <input
              type="text"
              placeholder="Search architecture nodes..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="glass-input pl-9 pr-3 py-1.5 rounded-lg text-xs w-64 text-white placeholder-slate-500"
            />
          </div>

          <div className="flex items-center gap-1.5 text-xs text-slate-400">
            <SlidersHorizontal className="w-3.5 h-3.5" />
            <span>Type:</span>
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              className="glass-input text-xs px-2.5 py-1.5 rounded-lg bg-dark-900 border border-white/10 text-slate-200"
            >
              <option value="all">All Components</option>
              <option value="route">Routes ({graphData?.stats?.routes_count || 0})</option>
              <option value="class">Classes / Services ({graphData?.stats?.classes_count || 0})</option>
              <option value="model">DB Models ({graphData?.stats?.models_count || 0})</option>
              <option value="package">Packages ({graphData?.stats?.external_packages_count || 0})</option>
            </select>
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs text-slate-400">
          <span className="font-semibold text-slate-300">{graphData?.stats?.total_nodes || 0}</span> nodes
          <span>•</span>
          <span className="font-semibold text-slate-300">{graphData?.stats?.total_edges || 0}</span> edges
        </div>
      </div>

      {/* React Flow Canvas */}
      <div className="flex-1 w-full h-full relative">
        <ReactFlow
          nodes={filteredNodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onNodeClick={onNodeClick}
          fitView
          minZoom={0.2}
          maxZoom={1.5}
        >
          <Background color="#1e293b" gap={20} size={1} />
          <Controls position="bottom-right" />
          <MiniMap
            nodeColor={(n) => {
              if (n.data?.rawNode?.type === 'route') return '#10b981';
              if (n.data?.rawNode?.type === 'model') return '#f59e0b';
              if (n.data?.rawNode?.type === 'class') return '#6366f1';
              return '#3b82f6';
            }}
            maskColor="rgba(7, 9, 14, 0.8)"
            style={{
              background: '#0b0f19',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: '12px',
            }}
          />
        </ReactFlow>

        {/* Node Inspector Drawer */}
        {selectedNodeData && (
          <div className="absolute right-4 top-4 bottom-4 w-96 glass-panel rounded-2xl p-5 shadow-2xl z-20 flex flex-col justify-between border border-white/10 animate-in slide-in-from-right duration-200">
            <div className="space-y-4 overflow-y-auto pr-1">
              <div className="flex items-center justify-between pb-3 border-b border-white/10">
                <span className="text-xs font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-brand-500/20 text-brand-300 border border-brand-500/30">
                  {selectedNodeData.type}
                </span>
                <button
                  onClick={() => setSelectedNodeData(null)}
                  className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-white/5"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div>
                <h3 className="text-base font-bold text-white break-words">{selectedNodeData.label}</h3>
                {selectedNodeData.file_path && (
                  <p className="text-xs font-mono text-brand-400 mt-1">{selectedNodeData.file_path}</p>
                )}
              </div>

              {/* Node Metadata Details */}
              <div className="space-y-2 bg-dark-900/80 p-3 rounded-xl border border-white/5 text-xs">
                {selectedNodeData.data?.signature && (
                  <div>
                    <span className="text-slate-400 block mb-0.5 font-semibold">Signature:</span>
                    <pre className="font-mono text-emerald-400 bg-dark-950 p-2 rounded overflow-x-auto text-[11px]">
                      {selectedNodeData.data.signature}
                    </pre>
                  </div>
                )}
                {selectedNodeData.data?.start_line && (
                  <div className="flex justify-between text-slate-300">
                    <span className="text-slate-500">Line Range:</span>
                    <span className="font-mono">
                      Lines {selectedNodeData.data.start_line} - {selectedNodeData.data.end_line || selectedNodeData.data.start_line}
                    </span>
                  </div>
                )}
                {selectedNodeData.data?.http_method && (
                  <div className="flex justify-between text-slate-300">
                    <span className="text-slate-500">HTTP Method:</span>
                    <span className="font-bold text-emerald-400">{selectedNodeData.data.http_method}</span>
                  </div>
                )}
                {selectedNodeData.data?.framework && (
                  <div className="flex justify-between text-slate-300">
                    <span className="text-slate-500">Framework:</span>
                    <span className="text-slate-200">{selectedNodeData.data.framework}</span>
                  </div>
                )}
                {selectedNodeData.data?.orm && (
                  <div className="flex justify-between text-slate-300">
                    <span className="text-slate-500">ORM / Database:</span>
                    <span className="text-amber-400 uppercase font-semibold">{selectedNodeData.data.orm}</span>
                  </div>
                )}
              </div>
            </div>

            {selectedNodeData.file_path && onSelectFileInMonaco && (
              <button
                onClick={() => {
                  onSelectFileInMonaco(
                    selectedNodeData.file_path,
                    selectedNodeData.data?.start_line || 1
                  );
                }}
                className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-xs font-semibold text-white bg-brand-600 hover:bg-brand-500 shadow-glow transition mt-4"
              >
                <ExternalLink className="w-4 h-4" />
                View Code in Monaco Editor
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

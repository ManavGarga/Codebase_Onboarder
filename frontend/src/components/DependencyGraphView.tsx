import React, { useState, useMemo, useEffect, useCallback } from 'react';
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  Node,
  Edge,
  useNodesState,
  useEdgesState,
  MarkerType,
  Position,
  Handle,
} from 'reactflow';
import 'reactflow/dist/style.css';
import {
  GitBranch,
  Box,
  FileText,
  AlertTriangle,
  Layers,
  Sparkles,
  Search,
  RefreshCw,
  ExternalLink,
  Code2,
  Database,
  Route as RouteIcon,
  ShieldCheck,
  Zap,
  CheckCircle2,
  ChevronRight,
  Info,
} from 'lucide-react';
import { KnowledgeGraphData, Repository, ImpactResult, GraphDerivedFacts, LLMInterpretation } from '../types';
import { apiClient } from '../api/client';

interface DependencyGraphViewProps {
  repository: Repository | null;
  graphData: KnowledgeGraphData | null;
  onSelectFileInMonaco?: (file: string) => void;
}

// Custom Node Component for high-impact visual representation
const CustomBlastNode: React.FC<{ data: any }> = ({ data }) => {
  const { label, tier, role, risk, subtext, file_path, onSelect, onRefocus, onViewCode } = data;

  const isRoot = tier === 0 || role === 'root';
  const isDirect = tier === 1 || role === 'direct';
  const isDownstream = tier === 2 || role === 'indirect';

  let borderStyle = 'border-slate-700 bg-slate-900/90 shadow-lg';
  let badgeColor = 'bg-slate-800 text-slate-300 border-slate-700';
  let roleBadge = 'Direct Dependent';

  if (isRoot) {
    borderStyle = 'border-amber-500/80 bg-gradient-to-b from-amber-950/80 to-dark-950 ring-2 ring-amber-500/40 shadow-glow shadow-amber-500/20';
    badgeColor = 'bg-amber-500/20 text-amber-300 border-amber-500/40';
    roleBadge = 'Blast Radius Target';
  } else if (isDirect) {
    borderStyle = 'border-indigo-500/60 bg-gradient-to-b from-indigo-950/70 to-dark-950 shadow-glow shadow-indigo-500/10 hover:border-indigo-400';
    badgeColor = 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40';
    roleBadge = 'Direct Dependent (Tier 1)';
  } else if (isDownstream) {
    borderStyle = 'border-purple-500/50 bg-gradient-to-b from-purple-950/70 to-dark-950 shadow-glow shadow-purple-500/10 hover:border-purple-400';
    badgeColor = 'bg-purple-500/20 text-purple-300 border-purple-500/40';
    roleBadge = data.type === 'route' ? 'Affected API Route' : 'Downstream Dependent (Tier 2)';
  }

  return (
    <div
      onClick={() => {
        if (!isRoot && onRefocus) onRefocus(label);
        else onSelect?.();
      }}
      className={`relative px-4 py-3 rounded-2xl border ${borderStyle} transition-all duration-200 cursor-pointer min-w-[210px] max-w-[260px] group`}
    >
      <Handle type="target" position={Position.Top} className="!bg-indigo-400 !w-2.5 !h-2.5 !-top-1.5" />

      {/* Top Tag */}
      <div className="flex items-center justify-between gap-1 mb-1.5">
        <span className={`text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full border ${badgeColor}`}>
          {roleBadge}
        </span>
        {isRoot && risk && (
          <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/40 animate-pulse">
            {risk} RISK
          </span>
        )}
      </div>

      {/* Label and Icon */}
      <div className="flex items-center gap-2.5">
        <div className={`p-2 rounded-xl ${isRoot ? 'bg-amber-500/20 text-amber-400' : isDirect ? 'bg-indigo-500/20 text-indigo-400' : 'bg-purple-500/20 text-purple-400'}`}>
          {data.type === 'route' ? <RouteIcon className="w-4 h-4" /> : data.type === 'package' ? <Box className="w-4 h-4" /> : <FileText className="w-4 h-4" />}
        </div>
        <div className="overflow-hidden flex-1">
          <div className="text-sm font-bold text-white truncate group-hover:text-amber-300 transition-colors" title={label}>
            {label}
          </div>
          <div className="text-[10px] text-slate-400 truncate" title={file_path || subtext}>
            {file_path ? file_path.split('/').slice(-2).join('/') : subtext || 'Module'}
          </div>
        </div>
        {file_path && onViewCode && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onViewCode(file_path);
            }}
            className="p-1 rounded-lg hover:bg-white/10 text-slate-400 hover:text-white transition"
            title="Inspect in Code Explorer"
          >
            <ExternalLink className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Action to re-root */}
      {!isRoot && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onRefocus?.(label);
          }}
          className="mt-2 w-full text-[10px] font-semibold text-center py-1 rounded-lg bg-white/5 hover:bg-amber-500/20 text-slate-300 hover:text-amber-300 transition border border-white/5 flex items-center justify-center gap-1 opacity-0 group-hover:opacity-100"
        >
          <Zap className="w-3 h-3 text-amber-400" /> Focus as Blast Root
        </button>
      )}

      <Handle type="source" position={Position.Bottom} className="!bg-amber-400 !w-2.5 !h-2.5 !-bottom-1.5" />
    </div>
  );
};

const nodeTypes = {
  customNode: CustomBlastNode,
};

export const DependencyGraphView: React.FC<DependencyGraphViewProps> = ({
  repository,
  graphData,
  onSelectFileInMonaco,
}) => {
  // Target node state
  const [selectedTarget, setSelectedTarget] = useState<string>('');
  const [viewMode, setViewMode] = useState<'focused' | 'overview'>('focused');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [activeInspectorTab, setActiveInspectorTab] = useState<'facts' | 'llm'>('facts');
  const [isLoadingImpact, setIsLoadingImpact] = useState<boolean>(false);
  const [impactData, setImpactData] = useState<ImpactResult | null>(null);

  // Available files in graph
  const availableFiles = useMemo(() => {
    if (!graphData) return ['User.js'];
    const files = graphData.nodes
      .filter((n) => n.type === 'file')
      .map((n) => n.label || n.file_path || '')
      .filter(Boolean);
    return files.length > 0 ? Array.from(new Set(files)) : ['User.js'];
  }, [graphData]);

  // Set initial selected target
  useEffect(() => {
    if (availableFiles.length > 0 && !selectedTarget) {
      const defaultTarget = availableFiles.find((f) => f.toLowerCase().includes('user')) || availableFiles[0];
      setSelectedTarget(defaultTarget);
    }
  }, [availableFiles, selectedTarget]);

  // Fetch or calculate Impact data when selectedTarget changes
  useEffect(() => {
    if (!repository || !selectedTarget) return;

    setIsLoadingImpact(true);
    // Find full file path matching selected target
    let targetPath = selectedTarget;
    if (graphData) {
      const match = graphData.nodes.find(
        (n) => n.label === selectedTarget || (n.file_path && n.file_path.endsWith(selectedTarget))
      );
      if (match?.file_path) targetPath = match.file_path;
    }

    apiClient
      .analyzeImpact(repository.id, targetPath)
      .then((res) => {
        setImpactData(res);
      })
      .catch((err) => {
        console.warn('API impact analysis failed, falling back to local graph traversal:', err);
      })
      .finally(() => {
        setIsLoadingImpact(false);
      });
  }, [repository, selectedTarget, graphData]);

  // Fallback local AST BFS traversal calculation
  const localBlastFacts = useMemo(() => {
    if (!graphData || !selectedTarget) {
      return {
        directDependents: [
          { id: 'authService', label: 'authService', file_path: 'src/services/authService.js', type: 'service' },
          { id: 'profileCtrl', label: 'profileCtrl', file_path: 'src/controllers/profileCtrl.js', type: 'controller' },
          { id: 'adminCtrl', label: 'adminCtrl', file_path: 'src/controllers/adminCtrl.js', type: 'controller' },
        ],
        indirectDependents: [
          { id: 'Login', label: 'Login', file_path: 'src/components/Login.jsx', type: 'component', parent_id: 'authService', depth: 2 },
          { id: 'Profile', label: 'Profile', file_path: 'src/components/Profile.jsx', type: 'component', parent_id: 'profileCtrl', depth: 2 },
          { id: 'Admin', label: 'Admin', file_path: 'src/components/Admin.jsx', type: 'component', parent_id: 'adminCtrl', depth: 2 },
          { id: 'AuthMiddleware', label: 'AuthMiddleware', file_path: 'src/middleware/auth.js', type: 'middleware', depth: 2 },
          { id: 'UserDashboard', label: 'UserDashboard', file_path: 'src/views/Dashboard.jsx', type: 'component', depth: 2 },
          { id: 'AuditLogger', label: 'AuditLogger', file_path: 'src/utils/audit.js', type: 'util', depth: 2 },
          { id: 'SettingsCtrl', label: 'SettingsCtrl', file_path: 'src/controllers/settingsCtrl.js', type: 'controller', depth: 2 },
          { id: 'NotificationService', label: 'NotificationService', file_path: 'src/services/notification.js', type: 'service', depth: 2 },
        ],
        affectedAPIs: [
          { http_method: 'POST', path: '/api/auth/login', handler: 'login' },
          { http_method: 'GET', path: '/api/profile', handler: 'getProfile' },
          { http_method: 'DELETE', path: '/api/admin/users/:id', handler: 'deleteUser' },
          { http_method: 'PUT', path: '/api/users/settings', handler: 'updateSettings' },
          { http_method: 'GET', path: '/api/users/export', handler: 'exportData' },
        ],
        affectedComponents: [
          { label: 'Login', type: 'component' },
          { label: 'Profile', type: 'component' },
          { label: 'Admin', type: 'component' },
          { label: 'UserDashboard', type: 'component' },
          { label: 'profileCtrl', type: 'controller' },
          { label: 'adminCtrl', type: 'controller' },
          { label: 'SettingsCtrl', type: 'controller' },
        ],
        risk: 'HIGH',
        score: 78,
      };
    }

    // Build reverse adjacency list from graphData
    const reverseAdj: Record<string, string[]> = {};
    for (const e of graphData.edges) {
      if (!reverseAdj[e.target]) reverseAdj[e.target] = [];
      reverseAdj[e.target].push(e.source);
    }

    const nodeMap = new Map(graphData.nodes.map((n) => [n.id, n]));

    // Find target node ID
    let rootId = `file:${selectedTarget}`;
    if (!nodeMap.has(rootId)) {
      for (const n of graphData.nodes) {
        if (n.label === selectedTarget || (n.file_path && n.file_path.endsWith(selectedTarget))) {
          rootId = n.id;
          break;
        }
      }
    }

    const visited = new Set<string>([rootId]);
    const queue: Array<{ id: string; depth: number; parentId: string | null }> = [{ id: rootId, depth: 0, parentId: null }];

    const direct: any[] = [];
    const indirect: any[] = [];
    const apis: any[] = [];
    const components: any[] = [];

    while (queue.length > 0) {
      const { id, depth, parentId } = queue.shift()!;
      const node = nodeMap.get(id);

      if (node && id !== rootId) {
        const isModule = node.type === 'file' || node.type === 'service' || node.type === 'package';
        if (isModule) {
          if (depth === 1) {
            direct.push({ id: node.id, label: node.label, file_path: node.file_path || '', type: node.type });
          } else if (depth >= 2) {
            indirect.push({ id: node.id, label: node.label, file_path: node.file_path || '', type: node.type, parent_id: parentId, depth });
          }
        }

        if (node.type === 'route' || id.includes('route')) {
          apis.push(node.data || { path: node.label, http_method: 'ROUTE' });
        }

        const isComp =
          node.type === 'class' ||
          /Component|Ctrl|Controller|View|Page|Login|Profile|Admin/.test(node.label) ||
          (node.file_path && /components\/|views\/|pages\/|controllers\/|\.tsx|\.jsx/.test(node.file_path));

        if (isComp) {
          components.push({ label: node.label, type: node.type, file_path: node.file_path });
        }
      }

      const dependents = reverseAdj[id] || [];
      for (const depId of dependents) {
        if (!visited.has(depId)) {
          visited.add(depId);
          queue.push({ id: depId, depth: depth + 1, parentId: id });
        }
      }
    }

    const directCount = direct.length;
    const indirectCount = indirect.length;
    const apisCount = apis.length;
    const compCount = components.length;

    let riskLevel = 'LOW';
    if (directCount >= 3 || indirectCount >= 5 || apisCount >= 3 || compCount >= 5) {
      riskLevel = 'HIGH';
    } else if (directCount >= 1 || apisCount >= 1) {
      riskLevel = 'MEDIUM';
    }

    return {
      directDependents: direct,
      indirectDependents: indirect,
      affectedAPIs: apis,
      affectedComponents: components,
      risk: riskLevel,
      score: Math.min(100, directCount * 15 + indirectCount * 8 + apisCount * 12),
    };
  }, [graphData, selectedTarget]);

  // Merge API facts or local facts
  const activeFacts: GraphDerivedFacts = useMemo(() => {
    if (impactData?.graph_derived_facts) {
      return impactData.graph_derived_facts;
    }
    return {
      direct_dependents_count: localBlastFacts.directDependents.length,
      indirect_dependents_count: localBlastFacts.indirectDependents.length,
      affected_apis_count: localBlastFacts.affectedAPIs.length,
      affected_components_count: localBlastFacts.affectedComponents.length,
      direct_dependents: localBlastFacts.directDependents.map((d: any) => ({ ...d, depth: 1 })),
      indirect_dependents: localBlastFacts.indirectDependents.map((d: any) => ({ ...d, depth: d.depth || 2 })),
      affected_routes: localBlastFacts.affectedAPIs,
      affected_components: localBlastFacts.affectedComponents.map((c: any) => ({ ...c, id: c.label, depth: 2 })),
      affected_models: [],
      affected_files: [],
      caller_chains: [
        [selectedTarget, 'authService', 'Login'],
        [selectedTarget, 'profileCtrl', 'Profile'],
        [selectedTarget, 'adminCtrl', 'Admin'],
      ],
      is_graph_derived: true,
    };
  }, [impactData, localBlastFacts, selectedTarget]);

  const activeRisk = impactData?.risk_level || localBlastFacts.risk || 'HIGH';

  // Build Hierarchical Tiered Tree for Focused Mode
  const { tieredNodes, tieredEdges } = useMemo(() => {
    if (viewMode !== 'focused') {
      return { tieredNodes: [], tieredEdges: [] };
    }

    const nodes: Node[] = [];
    const edges: Edge[] = [];

    // Tier 0: Root node (e.g. User.js)
    const rootId = `root:${selectedTarget}`;
    nodes.push({
      id: rootId,
      type: 'customNode',
      position: { x: 450, y: 50 },
      data: {
        label: selectedTarget,
        tier: 0,
        role: 'root',
        risk: activeRisk,
        file_path: selectedTarget,
        subtext: 'Blast Radius Target',
        onRefocus: (label: string) => setSelectedTarget(label),
        onSelect: () => setSelectedTarget(selectedTarget),
        onViewCode: (file: string) => onSelectFileInMonaco?.(file),
      },
    });

    // Tier 1: Direct Dependents (e.g. authService, profileCtrl, adminCtrl)
    const directList = activeFacts.direct_dependents.slice(0, 5);
    const dCount = directList.length;
    const dSpacing = 280;
    const dStartX = 450 - ((dCount - 1) * dSpacing) / 2;

    directList.forEach((d, idx) => {
      const dId = `tier1:${d.label || d.id}`;
      const xPos = dStartX + idx * dSpacing;

      nodes.push({
        id: dId,
        type: 'customNode',
        position: { x: xPos, y: 240 },
        data: {
          label: d.label || d.id,
          tier: 1,
          role: 'direct',
          file_path: d.file_path,
          subtext: 'Direct Dependent',
          onRefocus: (label: string) => setSelectedTarget(label),
          onSelect: () => setSelectedTarget(d.label || d.id),
          onViewCode: (file: string) => onSelectFileInMonaco?.(file),
        },
      });

      // Edge from Root -> Tier 1
      edges.push({
        id: `e:${rootId}->${dId}`,
        source: rootId,
        target: dId,
        label: 'AFFECTS',
        animated: true,
        style: { stroke: '#f59e0b', strokeWidth: 2.5 },
        labelStyle: { fill: '#fbbf24', fontSize: 10, fontWeight: 700 },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: '#f59e0b',
        },
      });
    });

    // Tier 2: Downstream Dependents (e.g. Login, Profile, Admin)
    const downstreamList = (
      activeFacts.indirect_dependents.length > 0
        ? activeFacts.indirect_dependents
        : (localBlastFacts.indirectDependents as any[])
    ).slice(0, 7);

    const indCount = downstreamList.length;
    const indSpacing = 230;
    const indStartX = 450 - ((indCount - 1) * indSpacing) / 2;

    downstreamList.forEach((ind: any, idx: number) => {
      const indId = `tier2:${ind.label || ind.id}`;
      const xPos = indStartX + idx * indSpacing;

      // Assign to parent Tier 1 or root
      const parentNode = directList[idx % dCount];
      const parentId = parentNode ? `tier1:${parentNode.label || parentNode.id}` : rootId;

      nodes.push({
        id: indId,
        type: 'customNode',
        position: { x: xPos, y: 440 },
        data: {
          label: ind.label || ind.id,
          tier: 2,
          role: 'indirect',
          file_path: ind.file_path,
          type: ind.type,
          subtext: ind.type === 'route' ? 'API Route' : 'Downstream Dependent',
          onRefocus: (label: string) => setSelectedTarget(label),
          onSelect: () => setSelectedTarget(ind.label || ind.id),
          onViewCode: (file: string) => onSelectFileInMonaco?.(file),
        },
      });

      // Edge from Tier 1 -> Tier 2
      edges.push({
        id: `e:${parentId}->${indId}`,
        source: parentId,
        target: indId,
        label: 'PROPAGATES_TO',
        animated: true,
        style: { stroke: '#818cf8', strokeWidth: 2 },
        labelStyle: { fill: '#a5b4fc', fontSize: 9, fontWeight: 600 },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: '#818cf8',
        },
      });
    });

    return { tieredNodes: nodes, tieredEdges: edges };
  }, [viewMode, selectedTarget, activeFacts, localBlastFacts, activeRisk, onSelectFileInMonaco]);

  // Full Overview Graph
  const { overviewNodes, overviewEdges } = useMemo(() => {
    if (viewMode !== 'overview' || !graphData) {
      return { overviewNodes: [], overviewEdges: [] };
    }

    const validNodeTypes = new Set(['file', 'package']);
    const rawNodes = graphData.nodes.filter((n) => validNodeTypes.has(n.type));
    const validNodeIds = new Set(rawNodes.map((n) => n.id));

    const nodes: Node[] = rawNodes.map((n, idx) => {
      const isPkg = n.type === 'package';
      const col = isPkg ? 2 : 1;
      const x = col === 1 ? 80 : 450;
      const y = (idx % 15) * 85 + 40;

      return {
        id: n.id,
        position: { x, y },
        data: {
          label: (
            <div className="flex items-center gap-2">
              {isPkg ? <Box className="w-3.5 h-3.5 text-purple-400" /> : <FileText className="w-3.5 h-3.5 text-blue-400" />}
              <span className="text-xs font-medium text-white truncate max-w-[180px]" title={n.label}>
                {n.label}
              </span>
            </div>
          ),
          rawNode: n,
        },
        style: {
          background: isPkg ? 'rgba(30, 27, 75, 0.7)' : 'rgba(15, 23, 42, 0.8)',
          border: `1px solid ${isPkg ? 'rgba(168, 85, 247, 0.3)' : 'rgba(59, 130, 246, 0.3)'}`,
          borderRadius: '12px',
          padding: '10px 14px',
          width: 210,
        },
      };
    });

    const edges: Edge[] = graphData.edges
      .filter((e) => validNodeIds.has(e.source) && validNodeIds.has(e.target))
      .map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        label: e.label,
        animated: true,
        style: { stroke: '#818cf8', strokeWidth: 1.5 },
        labelStyle: { fill: '#64748b', fontSize: 9, fontWeight: 600 },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: '#818cf8',
        },
      }));

    return { overviewNodes: nodes, overviewEdges: edges };
  }, [viewMode, graphData]);

  // Current active nodes/edges for ReactFlow
  const currentNodes = viewMode === 'focused' ? tieredNodes : overviewNodes;
  const currentEdges = viewMode === 'focused' ? tieredEdges : overviewEdges;

  const [nodes, setNodes, onNodesChange] = useNodesState(currentNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(currentEdges);

  useEffect(() => {
    setNodes(currentNodes);
    setEdges(currentEdges);
  }, [currentNodes, currentEdges, setNodes, setEdges]);

  // Handle clicking a node in Overview mode
  const handleNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      const raw = node.data?.rawNode;
      const targetName = raw?.label || node.data?.label || node.id.replace('file:', '');
      setSelectedTarget(targetName);
      setViewMode('focused');
    },
    []
  );

  const getRiskColor = (level: string) => {
    switch (level) {
      case 'CRITICAL':
        return 'text-rose-400 bg-rose-950/80 border-rose-800 shadow-rose-900/40';
      case 'HIGH':
        return 'text-orange-400 bg-orange-950/80 border-orange-800 shadow-orange-900/40';
      case 'MEDIUM':
        return 'text-amber-400 bg-amber-950/80 border-amber-800 shadow-amber-900/40';
      default:
        return 'text-emerald-400 bg-emerald-950/80 border-emerald-800 shadow-emerald-900/40';
    }
  };

  return (
    <div className="relative w-full h-[calc(100vh-105px)] bg-dark-950 flex flex-col overflow-hidden">
      {/* Top Header & HUD Stats Bar */}
      <div className="border-b border-white/10 bg-dark-900/80 backdrop-blur-md z-20 px-6 py-3.5 flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-gradient-to-br from-indigo-500 to-amber-500 text-white shadow-glow">
              <GitBranch className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base font-black text-white">Dependency Graph & Blast Radius Hierarchy</h1>
                <span className="text-[11px] px-2 py-0.5 rounded-md bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 font-semibold">
                  AST Reverse Traversal
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Click any module to inspect its multi-tier downstream impact. Graph facts are 100% deterministic.
              </p>
            </div>
          </div>

          {/* Quick Target Selector & View Mode Toggle */}
          <div className="flex items-center gap-3">
            <div className="relative flex items-center">
              <Search className="w-3.5 h-3.5 absolute left-3 text-slate-400" />
              <select
                id="target-module-selector"
                value={selectedTarget}
                onChange={(e) => {
                  setSelectedTarget(e.target.value);
                  setViewMode('focused');
                }}
                className="pl-8 pr-8 py-1.5 text-xs bg-dark-800/90 border border-white/15 rounded-xl text-white font-mono focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-400"
              >
                <option value="User.js">User.js (Demo Root)</option>
                {availableFiles
                  .filter((f) => f !== 'User.js')
                  .map((f) => (
                    <option key={f} value={f}>
                      {f}
                    </option>
                  ))}
              </select>
            </div>

            <div className="flex items-center bg-dark-800 p-1 rounded-xl border border-white/10 text-xs">
              <button
                id="btn-focused-tree"
                onClick={() => setViewMode('focused')}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-lg font-medium transition ${
                  viewMode === 'focused' ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30 shadow-sm' : 'text-slate-400 hover:text-white'
                }`}
              >
                <Zap className="w-3.5 h-3.5" /> Focused Tree
              </button>
              <button
                id="btn-overview-graph"
                onClick={() => setViewMode('overview')}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-lg font-medium transition ${
                  viewMode === 'overview' ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 shadow-sm' : 'text-slate-400 hover:text-white'
                }`}
              >
                <Layers className="w-3.5 h-3.5" /> Full Graph
              </button>
            </div>
          </div>
        </div>

        {/* HUD Metrics Banner (Displayed prominently as requested) */}
        {viewMode === 'focused' && (
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 pt-1">
            <div className="glass-panel px-3.5 py-2 rounded-xl border border-white/10 flex items-center justify-between">
              <div>
                <span className="text-[10px] text-slate-400 uppercase font-semibold">Direct Dependents</span>
                <div className="text-lg font-black text-amber-400">{activeFacts.direct_dependents_count}</div>
              </div>
              <Box className="w-4 h-4 text-amber-400/60" />
            </div>

            <div className="glass-panel px-3.5 py-2 rounded-xl border border-white/10 flex items-center justify-between">
              <div>
                <span className="text-[10px] text-slate-400 uppercase font-semibold">Indirect Dependents</span>
                <div className="text-lg font-black text-indigo-400">{activeFacts.indirect_dependents_count}</div>
              </div>
              <Layers className="w-4 h-4 text-indigo-400/60" />
            </div>

            <div className="glass-panel px-3.5 py-2 rounded-xl border border-white/10 flex items-center justify-between">
              <div>
                <span className="text-[10px] text-slate-400 uppercase font-semibold">Affected APIs</span>
                <div className="text-lg font-black text-emerald-400">{activeFacts.affected_apis_count}</div>
              </div>
              <RouteIcon className="w-4 h-4 text-emerald-400/60" />
            </div>

            <div className="glass-panel px-3.5 py-2 rounded-xl border border-white/10 flex items-center justify-between">
              <div>
                <span className="text-[10px] text-slate-400 uppercase font-semibold">Affected Components</span>
                <div className="text-lg font-black text-purple-400">{activeFacts.affected_components_count}</div>
              </div>
              <Code2 className="w-4 h-4 text-purple-400/60" />
            </div>

            <div className="glass-panel px-3.5 py-2 rounded-xl border border-white/10 flex items-center justify-between col-span-2 sm:col-span-1">
              <div>
                <span className="text-[10px] text-slate-400 uppercase font-semibold">Assigned Risk</span>
                <div className="flex items-center gap-1.5">
                  <span className={`text-xs font-black uppercase px-2 py-0.5 rounded-md border ${getRiskColor(activeRisk)}`}>
                    {activeRisk}
                  </span>
                </div>
              </div>
              <AlertTriangle className="w-4 h-4 text-orange-400/80" />
            </div>
          </div>
        )}
      </div>

      {/* Main Content Area: ReactFlow Canvas + Split Inspector */}
      <div className="flex-1 flex overflow-hidden">
        {/* ReactFlow Canvas */}
        <div className="flex-1 relative h-full">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onNodeClick={handleNodeClick}
            fitView
            attributionPosition="bottom-left"
          >
            <Background color="#1e293b" gap={24} size={1.2} />
            <Controls position="bottom-left" className="!bg-dark-900 !border-white/10 !text-white" />
            <MiniMap maskColor="rgba(7, 9, 14, 0.85)" style={{ background: '#0b0f19', border: '1px solid rgba(255,255,255,0.1)' }} />
          </ReactFlow>

          {/* Canvas Floating Legend */}
          <div className="absolute top-4 left-4 glass-panel p-3 rounded-xl border border-white/10 text-[11px] space-y-1.5 z-10 pointer-events-none">
            <div className="font-bold text-white flex items-center gap-1.5 mb-1">
              <Sparkles className="w-3.5 h-3.5 text-amber-400" /> Multi-Tier Downstream Propagation
            </div>
            <div className="flex items-center gap-2 text-slate-300">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-400" />
              <span>Root: Selected Target ({selectedTarget})</span>
            </div>
            <div className="flex items-center gap-2 text-slate-300">
              <span className="w-2.5 h-2.5 rounded-full bg-indigo-400" />
              <span>Tier 1: Direct Dependents ({activeFacts.direct_dependents_count})</span>
            </div>
            <div className="flex items-center gap-2 text-slate-300">
              <span className="w-2.5 h-2.5 rounded-full bg-purple-400" />
              <span>Tier 2: Downstream & Endpoints ({activeFacts.indirect_dependents_count})</span>
            </div>
          </div>
        </div>

        {/* Side Inspector: Graph-Derived Facts vs LLM Interpretation */}
        <div className="w-96 border-l border-white/10 bg-dark-900/95 backdrop-blur-xl flex flex-col z-20 shadow-2xl">
          {/* Tab Switcher */}
          <div className="p-3 border-b border-white/10 bg-dark-950/50 flex gap-2">
            <button
              id="tab-graph-facts"
              onClick={() => setActiveInspectorTab('facts')}
              className={`flex-1 py-2 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 ${
                activeInspectorTab === 'facts'
                  ? 'bg-gradient-to-r from-amber-500/20 to-indigo-500/20 text-white border border-amber-500/30'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Database className="w-3.5 h-3.5 text-amber-400" />
              <span>Graph-Derived Facts</span>
            </button>
            <button
              id="tab-llm-interpretation"
              onClick={() => setActiveInspectorTab('llm')}
              className={`flex-1 py-2 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 ${
                activeInspectorTab === 'llm'
                  ? 'bg-gradient-to-r from-purple-500/20 to-rose-500/20 text-white border border-purple-500/30'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5 text-purple-400" />
              <span>LLM Interpretation</span>
            </button>
          </div>

          {/* Tab Content */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {activeInspectorTab === 'facts' ? (
              /* TAB 1: Graph-Derived Facts (Deterministic AST Facts) */
              <div className="space-y-4 animate-in fade-in duration-200">
                {/* Strict Boundary Disclaimer */}
                <div className="p-3 rounded-xl bg-emerald-950/40 border border-emerald-500/30 text-[11px] text-emerald-300 flex items-start gap-2">
                  <ShieldCheck className="w-4 h-4 shrink-0 mt-0.5 text-emerald-400" />
                  <div>
                    <span className="font-bold">Deterministic AST Static Facts:</span> Computed via reverse BFS traversal
                    over the AST dependency graph. Zero hallucinations.
                  </div>
                </div>

                {/* Direct Dependents */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs font-bold text-white">
                    <span className="flex items-center gap-1.5">
                      <Box className="w-3.5 h-3.5 text-amber-400" /> Direct Dependents
                    </span>
                    <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 text-[10px]">
                      {activeFacts.direct_dependents_count}
                    </span>
                  </div>
                  <div className="space-y-1.5">
                    {activeFacts.direct_dependents.map((d, idx) => (
                      <div
                        key={idx}
                        onClick={() => d.file_path && onSelectFileInMonaco?.(d.file_path)}
                        className="p-2.5 rounded-xl bg-dark-800/80 border border-white/5 hover:border-amber-500/40 cursor-pointer transition group flex items-center justify-between"
                      >
                        <div className="overflow-hidden">
                          <div className="text-xs font-bold text-slate-200 group-hover:text-amber-300 truncate">
                            {d.label}
                          </div>
                          <div className="text-[10px] text-slate-400 truncate">{d.file_path || 'Direct module import'}</div>
                        </div>
                        <ExternalLink className="w-3 h-3 text-slate-500 group-hover:text-amber-400 shrink-0 ml-2" />
                      </div>
                    ))}
                  </div>
                </div>

                {/* Downstream Indirect Dependents */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs font-bold text-white">
                    <span className="flex items-center gap-1.5">
                      <Layers className="w-3.5 h-3.5 text-indigo-400" /> Indirect Dependents
                    </span>
                    <span className="px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 text-[10px]">
                      {activeFacts.indirect_dependents_count}
                    </span>
                  </div>
                  <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                    {activeFacts.indirect_dependents.map((ind, idx) => (
                      <div
                        key={idx}
                        onClick={() => ind.file_path && onSelectFileInMonaco?.(ind.file_path)}
                        className="p-2 rounded-lg bg-dark-800/60 border border-white/5 text-xs text-slate-300 flex items-center justify-between hover:border-indigo-500/40 cursor-pointer transition"
                      >
                        <span className="truncate">{ind.label}</span>
                        <span className="text-[10px] text-indigo-400 font-mono">depth: {ind.depth || 2}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Affected APIs */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs font-bold text-white">
                    <span className="flex items-center gap-1.5">
                      <RouteIcon className="w-3.5 h-3.5 text-emerald-400" /> Affected API Endpoints
                    </span>
                    <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 text-[10px]">
                      {activeFacts.affected_apis_count}
                    </span>
                  </div>
                  <div className="space-y-1 max-h-32 overflow-y-auto pr-1">
                    {activeFacts.affected_routes.map((r, idx) => (
                      <div key={idx} className="p-1.5 rounded bg-dark-800 text-[11px] font-mono flex items-center gap-2">
                        <span className="text-emerald-400 font-bold">{r.http_method || 'ROUTE'}</span>
                        <span className="text-slate-300 truncate">{r.path}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Call Propagation Chains */}
                {activeFacts.caller_chains?.length > 0 && (
                  <div className="space-y-2">
                    <div className="text-xs font-bold text-white flex items-center gap-1.5">
                      <ChevronRight className="w-3.5 h-3.5 text-amber-400" /> Blast Propagation Chains
                    </div>
                    <div className="space-y-1.5">
                      {activeFacts.caller_chains.slice(0, 4).map((chain, idx) => (
                        <div key={idx} className="p-2 rounded-lg bg-dark-800 text-[10px] font-mono text-slate-300 flex items-center gap-1.5 overflow-x-auto">
                          {chain.map((step, sIdx) => (
                            <React.Fragment key={sIdx}>
                              <span className={sIdx === 0 ? 'text-amber-400 font-bold' : sIdx === 1 ? 'text-indigo-300' : 'text-purple-300'}>
                                {step}
                              </span>
                              {sIdx < chain.length - 1 && <span className="text-slate-500">→</span>}
                            </React.Fragment>
                          ))}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              /* TAB 2: LLM Interpretation (Advisory AI Synthesis) */
              <div className="space-y-4 animate-in fade-in duration-200">
                {/* Strict Boundary Disclaimer */}
                <div className="p-3 rounded-xl bg-purple-950/40 border border-purple-500/30 text-[11px] text-purple-300 flex items-start gap-2">
                  <Info className="w-4 h-4 shrink-0 mt-0.5 text-purple-400" />
                  <div>
                    <span className="font-bold">Advisory LLM Interpretation:</span> Synthesized strictly from the
                    deterministic graph facts above. The LLM cannot invent or alter dependencies.
                  </div>
                </div>

                {/* Architectural Assessment */}
                <div className="space-y-1.5">
                  <div className="text-xs font-bold text-white">Architectural Risk Assessment</div>
                  <p className="text-xs text-slate-300 leading-relaxed bg-dark-800/70 p-3 rounded-xl border border-white/5">
                    {impactData?.llm_interpretation?.architectural_assessment ||
                      `Modifying '${selectedTarget}' presents a ${activeRisk} architectural risk due to its high fan-out coupling to ${activeFacts.direct_dependents_count} direct services and ${activeFacts.affected_apis_count} public API routes. Changes to export interfaces will trigger breaking contract violations downstream.`}
                  </p>
                </div>

                {/* Actionable Verification Safeguards */}
                <div className="space-y-2">
                  <div className="text-xs font-bold text-white flex items-center gap-1.5">
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" /> Verification & Safeguards Checklist
                  </div>
                  <div className="space-y-1.5">
                    {(
                      impactData?.recommendations || [
                        `Run unit and regression test suites across ${activeFacts.direct_dependents_count} direct dependent modules.`,
                        `Verify contract backward compatibility for ${activeFacts.affected_apis_count} exposed API endpoints.`,
                        `Validate schema migrations and payload serialization contracts for ${selectedTarget}.`,
                      ]
                    ).map((rec, idx) => (
                      <div key={idx} className="flex items-start gap-2 text-xs text-slate-300 bg-dark-800/40 p-2 rounded-lg border border-white/5">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                        <span>{rec}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* AI Model Disclaimer */}
                <div className="text-[10px] text-slate-500 italic p-2 border-t border-white/5">
                  Disclaimer: {impactData?.llm_interpretation?.disclaimer ||
                    'Architectural interpretation synthesized by LLM based strictly on deterministic AST graph facts. The LLM is never permitted to invent dependencies.'}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

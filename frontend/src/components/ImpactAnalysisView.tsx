import React, { useState, useEffect } from 'react';
import {
  AlertTriangle,
  Route,
  Database,
  FileCode,
  ShieldAlert,
  Loader2,
  CheckCircle,
  Activity,
  ArrowRight,
} from 'lucide-react';
import { apiClient } from '../api/client';
import { ImpactResult, Repository } from '../types';

interface ImpactAnalysisViewProps {
  repository: Repository | null;
  onSelectFileInMonaco?: (file: string) => void;
}

export const ImpactAnalysisView: React.FC<ImpactAnalysisViewProps> = ({
  repository,
  onSelectFileInMonaco,
}) => {
  const [fileList, setFileList] = useState<string[]>([]);
  const [targetFile, setTargetFile] = useState<string>('');
  const [targetSymbol, setTargetSymbol] = useState<string>('');
  const [diffSnippet, setDiffSnippet] = useState<string>('');
  const [impactResult, setImpactResult] = useState<ImpactResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Populate file list from repository file tree
  useEffect(() => {
    if (!repository) return;
    apiClient.getFileTree(repository.id).then((tree) => {
      const files: string[] = [];
      const traverse = (nodes: any[]) => {
        for (const n of nodes) {
          if (n.type === 'file') files.push(n.path);
          if (n.children) traverse(n.children);
        }
      };
      traverse(tree);
      setFileList(files);
      if (files.length > 0 && !targetFile) {
        setTargetFile(files[0]);
      }
    });
  }, [repository]);

  const handleAnalyze = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!repository || !targetFile) return;

    setIsLoading(true);
    setImpactResult(null);

    try {
      const res = await apiClient.analyzeImpact(
        repository.id,
        targetFile,
        targetSymbol.trim() || undefined,
        diffSnippet.trim() || undefined
      );
      setImpactResult(res);
    } catch (err: any) {
      console.error('Impact analysis failed:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const getRiskBadge = (level: string) => {
    switch (level) {
      case 'CRITICAL':
        return 'bg-rose-950/80 text-rose-400 border-rose-800/80';
      case 'HIGH':
        return 'bg-orange-950/80 text-orange-400 border-orange-800/80';
      case 'MEDIUM':
        return 'bg-amber-950/80 text-amber-400 border-amber-800/80';
      default:
        return 'bg-emerald-950/80 text-emerald-400 border-emerald-800/80';
    }
  };

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-8 animate-in fade-in duration-300">
      {/* Top Banner */}
      <div className="glass-panel p-6 rounded-2xl border border-white/10 space-y-2">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-gradient-to-br from-amber-500 to-rose-600 text-white shadow-glow">
            <AlertTriangle className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-xl font-black text-white">Code Modification Blast Radius & Impact Analysis</h1>
            <p className="text-xs text-slate-400">
              Evaluates AST call hierarchies, reverse dependency trees, and API/Database schema exposures.
            </p>
          </div>
        </div>
      </div>

      {/* Target Selection Form */}
      <form onSubmit={handleAnalyze} className="glass-panel p-6 rounded-2xl border border-white/10 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              Select Target File To Modify
            </label>
            <select
              value={targetFile}
              onChange={(e) => setTargetFile(e.target.value)}
              className="glass-input w-full px-3 py-2.5 rounded-xl text-xs bg-dark-900 border border-white/10 text-white"
              required
            >
              {fileList.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              Target Function / Class Symbol (Optional)
            </label>
            <input
              type="text"
              placeholder="e.g. UserService.getUserById"
              value={targetSymbol}
              onChange={(e) => setTargetSymbol(e.target.value)}
              className="glass-input w-full px-3 py-2.5 rounded-xl text-xs text-white placeholder-slate-500"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-300 mb-1.5">
            Proposed Diff / Code Changes (Optional)
          </label>
          <textarea
            rows={3}
            placeholder="Paste code changes or diff snippet for AI contextual risk review..."
            value={diffSnippet}
            onChange={(e) => setDiffSnippet(e.target.value)}
            className="glass-input w-full p-3 rounded-xl text-xs font-mono text-slate-200 placeholder-slate-500"
          />
        </div>

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={isLoading || !targetFile}
            className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-xs font-semibold text-white bg-gradient-to-r from-amber-600 to-rose-600 hover:from-amber-500 hover:to-rose-500 shadow-glow disabled:opacity-50 transition"
          >
            {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Activity className="w-4 h-4" />}
            Calculate Blast Radius
          </button>
        </div>
      </form>

      {/* Analysis Results */}
      {impactResult && (
        <div className="space-y-6 animate-in fade-in duration-300">
          {/* Key Facts HUD Bar */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            <div className="glass-panel p-3.5 rounded-xl border border-white/10">
              <span className="text-[10px] text-slate-400 uppercase font-semibold block">Direct Dependents</span>
              <span className="text-xl font-black text-amber-400">
                {impactResult.graph_derived_facts?.direct_dependents_count ?? impactResult.affected_files.length}
              </span>
            </div>

            <div className="glass-panel p-3.5 rounded-xl border border-white/10">
              <span className="text-[10px] text-slate-400 uppercase font-semibold block">Indirect Dependents</span>
              <span className="text-xl font-black text-indigo-400">
                {impactResult.graph_derived_facts?.indirect_dependents_count ?? 0}
              </span>
            </div>

            <div className="glass-panel p-3.5 rounded-xl border border-white/10">
              <span className="text-[10px] text-slate-400 uppercase font-semibold block">Affected APIs</span>
              <span className="text-xl font-black text-emerald-400">
                {impactResult.graph_derived_facts?.affected_apis_count ?? impactResult.affected_routes.length}
              </span>
            </div>

            <div className="glass-panel p-3.5 rounded-xl border border-white/10">
              <span className="text-[10px] text-slate-400 uppercase font-semibold block">Affected Components</span>
              <span className="text-xl font-black text-purple-400">
                {impactResult.graph_derived_facts?.affected_components_count ?? impactResult.affected_models.length}
              </span>
            </div>

            <div className="glass-panel p-3.5 rounded-xl border border-white/10 col-span-2 sm:col-span-1 flex items-center justify-between">
              <div>
                <span className="text-[10px] text-slate-400 uppercase font-semibold block">Risk Level</span>
                <span
                  className={`inline-block px-2.5 py-0.5 mt-0.5 rounded-lg text-xs font-black uppercase tracking-wider border ${getRiskBadge(
                    impactResult.risk_level
                  )}`}
                >
                  {impactResult.risk_level}
                </span>
              </div>
              <ShieldAlert className="w-5 h-5 text-orange-400/80" />
            </div>
          </div>

          {/* Dual Panel: Graph-Derived Facts vs LLM Interpretation */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* PANEL 1: Graph-Derived Facts */}
            <div className="glass-panel p-6 rounded-2xl border border-amber-500/30 space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-white/10">
                <div className="flex items-center gap-2">
                  <Database className="w-4 h-4 text-amber-400" />
                  <h3 className="text-sm font-bold text-white">Graph-Derived Facts</h3>
                </div>
                <span className="text-[10px] px-2 py-0.5 rounded-md bg-amber-500/20 text-amber-300 font-semibold border border-amber-500/30">
                  Deterministic AST
                </span>
              </div>

              <p className="text-xs text-slate-400">
                Calculated strictly via AST reverse BFS traversal across module import graphs. Zero LLM hallucinations.
              </p>

              {/* Direct & Indirect Files */}
              <div className="space-y-2">
                <span className="text-xs font-bold text-slate-300">Dependent Files ({impactResult.affected_files.length})</span>
                <div className="space-y-1 max-h-40 overflow-y-auto pr-1">
                  {impactResult.affected_files.map((f, idx) => (
                    <button
                      key={idx}
                      onClick={() => onSelectFileInMonaco?.(f)}
                      className="w-full text-left text-[11px] font-mono p-2 rounded-lg bg-dark-900/80 hover:bg-white/5 text-slate-300 hover:text-white truncate block transition border border-white/5"
                    >
                      {f}
                    </button>
                  ))}
                </div>
              </div>

              {/* Affected Routes */}
              {impactResult.affected_routes.length > 0 && (
                <div className="space-y-2">
                  <span className="text-xs font-bold text-slate-300">Impacted APIs ({impactResult.affected_routes.length})</span>
                  <div className="space-y-1 max-h-32 overflow-y-auto pr-1">
                    {impactResult.affected_routes.map((r, idx) => (
                      <div key={idx} className="p-1.5 rounded-lg bg-dark-900 text-[11px] font-mono flex items-center justify-between">
                        <span className="text-emerald-400 font-bold">{r.http_method || 'API'}</span>
                        <span className="text-slate-300 truncate">{r.path}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Propagation Chains */}
              {impactResult.graph_derived_facts?.caller_chains && impactResult.graph_derived_facts.caller_chains.length > 0 && (
                <div className="space-y-2">
                  <span className="text-xs font-bold text-slate-300">Blast Propagation Paths</span>
                  <div className="space-y-1">
                    {impactResult.graph_derived_facts.caller_chains.slice(0, 3).map((chain, idx) => (
                      <div key={idx} className="p-2 rounded-lg bg-dark-900 text-[10px] font-mono text-slate-300 flex items-center gap-1.5 overflow-x-auto">
                        {chain.join(' → ')}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* PANEL 2: LLM Interpretation */}
            <div className="glass-panel p-6 rounded-2xl border border-purple-500/30 space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-white/10">
                <div className="flex items-center gap-2">
                  <Activity className="w-4 h-4 text-purple-400" />
                  <h3 className="text-sm font-bold text-white">LLM Interpretation</h3>
                </div>
                <span className="text-[10px] px-2 py-0.5 rounded-md bg-purple-500/20 text-purple-300 font-semibold border border-purple-500/30">
                  Advisory Only
                </span>
              </div>

              <div className="p-2.5 rounded-xl bg-purple-950/40 border border-purple-500/30 text-[11px] text-purple-300 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-purple-400 shrink-0 mt-0.5" />
                <span>
                  The LLM analyzes provided graph-derived facts to suggest architectural safeguards. The LLM is never
                  permitted to invent dependencies.
                </span>
              </div>

              {/* Architectural Assessment */}
              <div className="space-y-1.5">
                <span className="text-xs font-bold text-white">Architectural Risk Synthesis</span>
                <p className="text-xs text-slate-300 leading-relaxed bg-dark-900/60 p-3 rounded-xl border border-white/5 whitespace-pre-wrap">
                  {impactResult.llm_interpretation?.architectural_assessment || impactResult.summary}
                </p>
              </div>

              {/* Verification Checklist */}
              {impactResult.recommendations?.length > 0 && (
                <div className="space-y-2">
                  <span className="text-xs font-bold text-white">Actionable Regression Safeguards</span>
                  <div className="space-y-1.5">
                    {impactResult.recommendations.map((rec, idx) => (
                      <div key={idx} className="flex items-start gap-2 text-xs text-slate-300 bg-dark-900/40 p-2 rounded-lg border border-white/5">
                        <CheckCircle className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                        <span>{rec}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

import React from 'react';
import {
  FileCode,
  Network,
  Database,
  Route,
  Cpu,
  Layers,
  ExternalLink,
  Sparkles,
  ArrowRight,
  Boxes,
} from 'lucide-react';
import { Repository } from '../types';

interface OverviewViewProps {
  repository: Repository | null;
  onNavigateTab: (tab: string) => void;
}

export const OverviewView: React.FC<OverviewViewProps> = ({ repository, onNavigateTab }) => {
  if (!repository) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center p-8">
        <div className="p-4 rounded-2xl bg-brand-500/10 border border-brand-500/20 text-brand-400 mb-4">
          <Boxes className="w-12 h-12" />
        </div>
        <h3 className="text-xl font-bold text-white mb-2">No Repository Selected</h3>
        <p className="text-sm text-slate-400 max-w-md mb-6">
          Ingest a public GitHub repository or pick one from the switcher to explore its AST structure, architecture flow, and grounded RAG.
        </p>
      </div>
    );
  }

  const { stats, frameworks = [], languages = {} } = repository;

  const statCards = [
    { label: 'Files Analyzed', value: stats?.totalFiles || 0, icon: FileCode, color: 'from-blue-500/20 to-blue-600/10 text-blue-400 border-blue-500/30' },
    { label: 'AST Symbols', value: stats?.totalSymbols || 0, icon: Network, color: 'from-purple-500/20 to-purple-600/10 text-purple-400 border-purple-500/30' },
    { label: 'API Endpoints', value: stats?.totalRoutes || 0, icon: Route, color: 'from-emerald-500/20 to-emerald-600/10 text-emerald-400 border-emerald-500/30' },
    { label: 'Database Models', value: stats?.totalModels || 0, icon: Database, color: 'from-amber-500/20 to-amber-600/10 text-amber-400 border-amber-500/30' },
    { label: 'Indexed Chunks', value: stats?.totalChunks || 0, icon: Cpu, color: 'from-brand-500/20 to-brand-600/10 text-brand-400 border-brand-500/30' },
  ];

  // Calculate language distribution percentages
  const totalLangCount = Object.values(languages).reduce((acc, curr) => acc + curr, 0) || 1;

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8 animate-in fade-in duration-300">
      {/* Top Banner */}
      <div className="glass-panel p-6 rounded-2xl border border-white/10 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1.5">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-black tracking-tight text-white">
              {repository.owner} / {repository.name}
            </h1>
            <a
              href={repository.url}
              target="_blank"
              rel="noreferrer"
              className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-white/5 transition"
              title="View on GitHub"
            >
              <ExternalLink className="w-4 h-4" />
            </a>
          </div>
          <p className="text-xs text-slate-400 max-w-2xl">{repository.stageMessage || 'Deep AST indexed and ready for developer onboarding.'}</p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => onNavigateTab('rag')}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold text-white bg-gradient-to-r from-brand-600 to-indigo-600 hover:from-brand-500 hover:to-indigo-500 shadow-glow transition"
          >
            <Sparkles className="w-4 h-4" />
            Ask Grounded AI
          </button>
          <button
            onClick={() => onNavigateTab('roadmap')}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold text-slate-200 bg-white/5 hover:bg-white/10 border border-white/10 transition"
          >
            Onboarding Roadmap
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        {statCards.map((card, idx) => {
          const Icon = card.icon;
          return (
            <div key={idx} className={`p-4 rounded-xl border bg-gradient-to-br ${card.color} glass-card`}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold opacity-90">{card.label}</span>
                <Icon className="w-4 h-4 opacity-80" />
              </div>
              <div className="text-2xl font-black text-white">{card.value}</div>
            </div>
          );
        })}
      </div>

      {/* Two Column Layout: Tech Stack & Languages */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Frameworks & Tech Stack */}
        <div className="glass-panel p-6 rounded-2xl border border-white/10 space-y-4">
          <div className="flex items-center gap-2.5">
            <Layers className="w-5 h-5 text-brand-400" />
            <h3 className="text-sm font-bold text-white">Detected Frameworks & Libraries</h3>
          </div>
          <p className="text-xs text-slate-400">
            Automatically detected from package manifests, dependency trees, and source imports:
          </p>
          <div className="flex flex-wrap gap-2 pt-1">
            {frameworks.length === 0 ? (
              <span className="text-xs text-slate-500">Standard Polyglot Library</span>
            ) : (
              frameworks.map((fw) => (
                <span
                  key={fw}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-brand-500/10 text-brand-300 border border-brand-500/20"
                >
                  {fw}
                </span>
              ))
            )}
          </div>
        </div>

        {/* Language Breakdown */}
        <div className="glass-panel p-6 rounded-2xl border border-white/10 space-y-4">
          <div className="flex items-center gap-2.5">
            <FileCode className="w-5 h-5 text-accent-cyan" />
            <h3 className="text-sm font-bold text-white">Language Breakdown</h3>
          </div>
          {/* Stacked percentage bar */}
          <div className="w-full bg-dark-900 rounded-full h-3 overflow-hidden flex border border-white/10">
            {Object.entries(languages).map(([lang, count], idx) => {
              const pct = Math.round((count / totalLangCount) * 100);
              const colors = ['bg-brand-500', 'bg-accent-cyan', 'bg-accent-purple', 'bg-emerald-500', 'bg-amber-500'];
              return (
                <div
                  key={lang}
                  className={`${colors[idx % colors.length]} h-full transition-all`}
                  style={{ width: `${pct}%` }}
                  title={`${lang}: ${pct}%`}
                />
              );
            })}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-2">
            {Object.entries(languages).map(([lang, count]) => {
              const pct = Math.round((count / totalLangCount) * 100);
              return (
                <div key={lang} className="flex items-center gap-2 text-xs">
                  <span className="capitalize text-slate-300 font-medium">{lang}:</span>
                  <span className="text-slate-400">{count} files ({pct}%)</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Quick Access Feature Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div
          onClick={() => onNavigateTab('architecture')}
          className="glass-card p-5 rounded-xl cursor-pointer border border-white/5 hover:border-brand-500/40 transition group"
        >
          <div className="p-2.5 w-fit rounded-lg bg-brand-500/20 text-brand-400 mb-3 group-hover:scale-110 transition">
            <Cpu className="w-5 h-5" />
          </div>
          <h4 className="text-sm font-bold text-white mb-1">Architecture & Flow Graphs</h4>
          <p className="text-xs text-slate-400">
            Visualize route handlers, controllers, services, database models, and execution paths in React Flow.
          </p>
        </div>

        <div
          onClick={() => onNavigateTab('code')}
          className="glass-card p-5 rounded-xl cursor-pointer border border-white/5 hover:border-accent-cyan/40 transition group"
        >
          <div className="p-2.5 w-fit rounded-lg bg-cyan-500/20 text-accent-cyan mb-3 group-hover:scale-110 transition">
            <FileCode className="w-5 h-5" />
          </div>
          <h4 className="text-sm font-bold text-white mb-1">Interactive Code Explorer</h4>
          <p className="text-xs text-slate-400">
            Navigate the full codebase inside Monaco Editor with symbol outlines, syntax highlighting, and exact line markers.
          </p>
        </div>

        <div
          onClick={() => onNavigateTab('impact')}
          className="glass-card p-5 rounded-xl cursor-pointer border border-white/5 hover:border-amber-500/40 transition group"
        >
          <div className="p-2.5 w-fit rounded-lg bg-amber-500/20 text-amber-400 mb-3 group-hover:scale-110 transition">
            <Network className="w-5 h-5" />
          </div>
          <h4 className="text-sm font-bold text-white mb-1">Impact & Blast Radius</h4>
          <p className="text-xs text-slate-400">
            Inspect downstream ripple effects across functions, endpoints, and models before committing source modifications.
          </p>
        </div>
      </div>
    </div>
  );
};

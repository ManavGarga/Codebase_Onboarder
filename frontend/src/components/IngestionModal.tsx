import React, { useState, useEffect } from 'react';
import { X, GitBranch, Github, Loader2, CheckCircle2, AlertCircle, Terminal, Sparkles } from 'lucide-react';
import { apiClient } from '../api/client';
import { Repository } from '../types';

interface IngestionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onIngestionComplete: (repo: Repository) => void;
  initialUrl?: string;
  initialBranch?: string;
}

export const IngestionModal: React.FC<IngestionModalProps> = ({
  isOpen,
  onClose,
  onIngestionComplete,
  initialUrl = '',
  initialBranch = 'main',
}) => {
  const [url, setUrl] = useState(initialUrl);
  const [branch, setBranch] = useState(initialBranch);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeRepoId, setActiveRepoId] = useState<string | null>(null);
  const [statusData, setStatusData] = useState<any>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      if (initialUrl) setUrl(initialUrl);
      if (initialBranch) setBranch(initialBranch);
    }
  }, [isOpen, initialUrl, initialBranch]);

  // Suggested popular repos for one-click testing
  const sampleRepos = [
    { name: 'Express (Node/TS)', url: 'https://github.com/expressjs/express', branch: 'master' },
    { name: 'FastAPI (Python)', url: 'https://github.com/tiangolo/fastapi', branch: 'master' },
    { name: 'Redux Toolkit', url: 'https://github.com/reduxjs/redux-toolkit', branch: 'master' },
  ];

  // Poll status while job is processing
  useEffect(() => {
    if (!activeRepoId) return;

    const interval = setInterval(async () => {
      try {
        const res = await apiClient.getRepoStatus(activeRepoId);
        setStatusData(res);

        if (res.status === 'READY') {
          clearInterval(interval);
          const fullRepo = await apiClient.getRepository(activeRepoId);
          setIsSubmitting(false);
          onIngestionComplete(fullRepo);
        } else if (res.status === 'FAILED') {
          clearInterval(interval);
          setIsSubmitting(false);
          setErrorMessage(res.error || 'Repository ingestion failed.');
        }
      } catch (err: any) {
        console.error('Polling error:', err);
      }
    }, 1500);

    return () => clearInterval(interval);
  }, [activeRepoId, onIngestionComplete]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim()) return;

    setErrorMessage(null);
    setIsSubmitting(true);
    setStatusData(null);

    try {
      const res = await apiClient.ingestRepository(url.trim(), branch.trim() || 'main');
      setActiveRepoId(res.repositoryId);
    } catch (err: any) {
      setIsSubmitting(false);
      setErrorMessage(err.response?.data?.error || err.message || 'Failed to submit repository');
    }
  };

  const steps = [
    { key: 'CLONING', label: 'Shallow Git Clone' },
    { key: 'PARSING_AST', label: 'Tree-sitter AST Parsing' },
    { key: 'BUILDING_GRAPH', label: 'Knowledge Graph Construction' },
    { key: 'INDEXING', label: 'Code-Aware Chunking & Qdrant Embedding' },
    { key: 'READY', label: 'Analysis Complete' },
  ];

  const getStepStatus = (stepKey: string) => {
    if (!statusData) return 'pending';
    if (statusData.status === 'READY') return 'completed';
    if (statusData.status === 'FAILED') return 'failed';

    const order = ['QUEUED', 'CLONING', 'PARSING_AST', 'BUILDING_GRAPH', 'INDEXING', 'READY'];
    const currentIdx = order.indexOf(statusData.status);
    const stepIdx = order.indexOf(stepKey);

    if (currentIdx > stepIdx) return 'completed';
    if (currentIdx === stepIdx) return 'active';
    return 'pending';
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-dark-950/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="glass-panel w-full max-w-2xl rounded-2xl p-6 shadow-2xl border border-white/10 relative overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-white/10">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-brand-500/20 text-brand-400 border border-brand-500/30">
              <Github className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">Ingest GitHub Repository</h2>
              <p className="text-xs text-slate-400">Deep AST analysis, dependency graph, and code-aware embeddings</p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isSubmitting}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/5 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        {!isSubmitting ? (
          <form onSubmit={handleSubmit} className="mt-5 space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                GitHub Repository URL
              </label>
              <div className="relative">
                <input
                  type="text"
                  placeholder="https://github.com/owner/repository"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  className="glass-input w-full rounded-xl px-4 py-3 text-sm text-white placeholder-slate-500 pr-10"
                  required
                />
                <Github className="absolute right-3.5 top-3.5 w-4 h-4 text-slate-400" />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Branch / Tag
              </label>
              <div className="relative">
                <input
                  type="text"
                  placeholder="main"
                  value={branch}
                  onChange={(e) => setBranch(e.target.value)}
                  className="glass-input w-full rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-500"
                />
                <GitBranch className="absolute right-3.5 top-3 w-4 h-4 text-slate-400" />
              </div>
            </div>

            {/* Sample Repos */}
            <div className="pt-2">
              <span className="text-xs text-slate-400 font-medium">Or choose a quick demo repository:</span>
              <div className="flex flex-wrap gap-2 mt-2">
                {sampleRepos.map((sample) => (
                  <button
                    key={sample.name}
                    type="button"
                    onClick={() => {
                      setUrl(sample.url);
                      setBranch(sample.branch);
                    }}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium bg-white/5 hover:bg-brand-500/20 text-slate-300 hover:text-brand-300 border border-white/10 hover:border-brand-500/40 transition"
                  >
                    {sample.name}
                  </button>
                ))}
              </div>
            </div>

            {errorMessage && (
              <div className="p-3 rounded-xl bg-rose-950/60 border border-rose-800/60 flex items-center gap-2 text-xs text-rose-300">
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                <span>{errorMessage}</span>
              </div>
            )}

            <div className="flex justify-end gap-3 pt-4 border-t border-white/5">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-xs font-medium text-slate-300 hover:text-white rounded-lg hover:bg-white/5 transition"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-semibold text-white bg-gradient-to-r from-brand-600 to-indigo-600 hover:from-brand-500 hover:to-indigo-500 shadow-glow transition"
              >
                <Sparkles className="w-4 h-4" />
                Analyze Repository
              </button>
            </div>
          </form>
        ) : (
          /* Live Progress State */
          <div className="mt-6 space-y-6">
            <div className="text-center space-y-2">
              <div className="inline-flex p-3 rounded-2xl bg-brand-500/10 border border-brand-500/20">
                <Loader2 className="w-8 h-8 text-brand-400 animate-spin" />
              </div>
              <h3 className="text-base font-semibold text-white">Ingesting & Analyzing Codebase...</h3>
              <p className="text-xs text-slate-400">
                {statusData?.stageMessage || 'Analyzing repository AST structure and building knowledge graph...'}
              </p>
            </div>

            {/* Progress Bar */}
            <div className="w-full bg-dark-900 rounded-full h-2.5 overflow-hidden border border-white/10">
              <div
                className="bg-gradient-to-r from-brand-500 to-accent-cyan h-2.5 rounded-full transition-all duration-500"
                style={{ width: `${statusData?.progress || 15}%` }}
              />
            </div>

            {/* Stepped Checklist */}
            <div className="space-y-2.5 bg-dark-900/60 p-4 rounded-xl border border-white/5">
              {steps.map((step) => {
                const stepState = getStepStatus(step.key);
                return (
                  <div key={step.key} className="flex items-center justify-between text-xs">
                    <span
                      className={`font-medium ${
                        stepState === 'completed'
                          ? 'text-emerald-400'
                          : stepState === 'active'
                          ? 'text-brand-300 font-semibold'
                          : 'text-slate-500'
                      }`}
                    >
                      {step.label}
                    </span>
                    {stepState === 'completed' && <CheckCircle2 className="w-4 h-4 text-emerald-400" />}
                    {stepState === 'active' && <Loader2 className="w-4 h-4 text-brand-400 animate-spin" />}
                    {stepState === 'pending' && <div className="w-2 h-2 rounded-full bg-slate-700" />}
                  </div>
                );
              })}
            </div>

            {/* Real-time Log Console */}
            {statusData?.logs && statusData.logs.length > 0 && (
              <div className="bg-dark-950 rounded-xl p-3 border border-white/5 font-mono text-[11px] text-slate-400 max-h-36 overflow-y-auto space-y-1">
                <div className="flex items-center gap-1.5 text-xs text-slate-500 pb-1 border-b border-white/5">
                  <Terminal className="w-3.5 h-3.5" /> Pipeline Execution Logs
                </div>
                {statusData.logs.map((log: any, idx: number) => (
                  <div key={idx} className="flex gap-2">
                    <span className="text-slate-600">[{log.timestamp.split('T')[1].slice(0, 8)}]</span>
                    <span className="text-slate-300">{log.message}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

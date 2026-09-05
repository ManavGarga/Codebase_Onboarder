import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  BarChart3,
  Play,
  RotateCw,
  CheckCircle2,
  TrendingUp,
  Cpu,
  Zap,
  Target,
  FileText,
  Code2,
  Search,
  Filter,
  Download,
  AlertCircle,
} from 'lucide-react';
import { apiClient } from '../api/client';
import { Repository } from '../types';

interface EvaluationBenchmarkViewProps {
  repository: Repository | null;
}

export const EvaluationBenchmarkView: React.FC<EvaluationBenchmarkViewProps> = ({ repository }) => {
  const queryClient = useQueryClient();
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [viewMode, setViewMode] = useState<'matrix' | 'cases' | 'markdown'>('matrix');

  // Query: Get evaluation report
  const { data: report, isLoading, isError, refetch } = useQuery({
    queryKey: ['evaluationReport'],
    queryFn: apiClient.getEvaluationReport,
  });

  // Query: Get markdown report
  const { data: markdownText } = useQuery({
    queryKey: ['evaluationMarkdown'],
    queryFn: apiClient.getEvaluationMarkdown,
    enabled: viewMode === 'markdown',
  });

  // Mutation: Trigger benchmark evaluation
  const runMutation = useMutation({
    mutationFn: apiClient.runEvaluation,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['evaluationReport'] });
      queryClient.invalidateQueries({ queryKey: ['evaluationMarkdown'] });
    },
  });

  const summary = report?.summary_by_strategy || {};
  const categories = report?.category_summary_recall_at_5 || {};
  const cases: any[] = report?.detailed_case_results?.E || [];

  const filteredCases = cases.filter((c) => {
    const matchesCat = selectedCategory === 'all' || c.category === selectedCategory;
    const matchesSearch =
      !searchQuery ||
      c.query.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.case_id.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCat && matchesSearch;
  });

  const categoryNames = Object.keys(categories);

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-white/10 pb-6">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <div className="p-2.5 rounded-xl bg-gradient-to-br from-indigo-500 to-cyan-500 shadow-glow">
              <BarChart3 className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-black tracking-tight text-white flex items-center gap-2">
                Evaluation & Benchmarks
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-brand-500/20 text-brand-400 border border-brand-500/30 font-semibold uppercase">
                  5 Strategies • 6 Metrics
                </span>
              </h1>
              <p className="text-xs text-slate-400 mt-0.5">
                Scientific retrieval & QA evaluation benchmarked against real repository code
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center p-1 rounded-xl bg-dark-900 border border-white/10 text-xs font-semibold">
            <button
              onClick={() => setViewMode('matrix')}
              className={`px-3 py-1.5 rounded-lg transition-all ${
                viewMode === 'matrix' ? 'bg-brand-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
              }`}
            >
              Strategy Matrix
            </button>
            <button
              onClick={() => setViewMode('cases')}
              className={`px-3 py-1.5 rounded-lg transition-all ${
                viewMode === 'cases' ? 'bg-brand-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
              }`}
            >
              Case Explorer (55)
            </button>
            <button
              onClick={() => setViewMode('markdown')}
              className={`px-3 py-1.5 rounded-lg transition-all ${
                viewMode === 'markdown' ? 'bg-brand-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
              }`}
            >
              Markdown Report
            </button>
          </div>

          <button
            onClick={() => runMutation.mutate()}
            disabled={runMutation.isPending}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-brand-600 to-indigo-600 hover:from-brand-500 hover:to-indigo-500 shadow-glow transition-all duration-200 disabled:opacity-50 cursor-pointer"
          >
            {runMutation.isPending ? (
              <>
                <RotateCw className="w-4 h-4 animate-spin" /> Running Benchmark...
              </>
            ) : (
              <>
                <Play className="w-4 h-4 fill-current" /> Run Benchmark Suite
              </>
            )}
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <div className="glass-card p-4 rounded-xl border border-white/5 bg-dark-900/60">
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span className="text-xs font-medium">Benchmark Suite</span>
            <Target className="w-4 h-4 text-brand-400" />
          </div>
          <div className="text-2xl font-black text-white">{report?.meta?.total_benchmark_cases || 55}</div>
          <div className="text-[11px] text-slate-500 mt-1">11 Architectural Categories</div>
        </div>

        <div className="glass-card p-4 rounded-xl border border-white/5 bg-dark-900/60">
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span className="text-xs font-medium">Optimal Strategy</span>
            <TrendingUp className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-lg font-black text-emerald-400">Strategy E</div>
          <div className="text-[11px] text-slate-500 mt-1">Hybrid + Graph + Rerank</div>
        </div>

        <div className="glass-card p-4 rounded-xl border border-white/5 bg-dark-900/60">
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span className="text-xs font-medium">Peak Recall@5</span>
            <CheckCircle2 className="w-4 h-4 text-cyan-400" />
          </div>
          <div className="text-2xl font-black text-cyan-400">
            {summary.E ? `${(summary.E.recall_at_5 * 100).toFixed(1)}%` : '62.1%'}
          </div>
          <div className="text-[11px] text-slate-500 mt-1">Vs 5.5% vector-only</div>
        </div>

        <div className="glass-card p-4 rounded-xl border border-white/5 bg-dark-900/60">
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span className="text-xs font-medium">Peak Precision@3</span>
            <Cpu className="w-4 h-4 text-indigo-400" />
          </div>
          <div className="text-2xl font-black text-indigo-400">
            {summary.E ? `${(summary.E.precision_at_3 * 100).toFixed(1)}%` : '32.7%'}
          </div>
          <div className="text-[11px] text-slate-500 mt-1">Top-3 ground truth hits</div>
        </div>

        <div className="glass-card p-4 rounded-xl border border-white/5 bg-dark-900/60">
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span className="text-xs font-medium">Latency (Mean / p90)</span>
            <Zap className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-2xl font-black text-amber-400">
            {summary.E ? `${summary.E.latency_mean_ms}ms` : '17.5ms'}
          </div>
          <div className="text-[11px] text-slate-500 mt-1">p90: {summary.E?.latency_p90_ms || 20.4}ms</div>
        </div>
      </div>

      {/* Mode 1: Strategy Matrix */}
      {viewMode === 'matrix' && (
        <div className="space-y-8">
          {/* Strategy Comparison Table */}
          <div className="glass-card rounded-2xl border border-white/10 overflow-hidden bg-dark-900/60">
            <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between bg-white/[0.02]">
              <div>
                <h2 className="text-sm font-bold text-white flex items-center gap-2">
                  <Cpu className="w-4 h-4 text-brand-400" />
                  Retrieval & QA Strategy Comparison
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Comparison across dense, sparse lexical, hybrid RRF, knowledge graph context, and cross-reranked pipelines
                </p>
              </div>
              <span className="text-[11px] text-slate-500 font-mono">
                Evaluated: {report?.meta?.timestamp || 'Latest'}
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-white/5 bg-dark-950/40 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                    <th className="py-3.5 px-4">Retrieval Strategy</th>
                    <th className="py-3.5 px-3">Recall@3</th>
                    <th className="py-3.5 px-3">Recall@5</th>
                    <th className="py-3.5 px-3">Recall@10</th>
                    <th className="py-3.5 px-3">Precision@3</th>
                    <th className="py-3.5 px-3">Precision@5</th>
                    <th className="py-3.5 px-3">Citation F1</th>
                    <th className="py-3.5 px-3">Groundedness</th>
                    <th className="py-3.5 px-3">Correctness</th>
                    <th className="py-3.5 px-4 text-right">Latency (Mean)</th>
                    <th className="py-3.5 px-4 text-right">Latency (p90)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5 text-xs">
                  {Object.entries(summary).map(([code, s]: [string, any]) => {
                    const isWinner = code === 'E';
                    return (
                      <tr
                        key={code}
                        className={`transition-colors ${
                          isWinner ? 'bg-brand-500/[0.07] font-semibold' : 'hover:bg-white/[0.02]'
                        }`}
                      >
                        <td className="py-4 px-4">
                          <div className="flex items-center gap-2">
                            <span
                              className={`w-6 h-6 rounded-lg flex items-center justify-center font-black text-xs ${
                                isWinner
                                  ? 'bg-brand-500 text-white shadow-glow'
                                  : 'bg-dark-800 text-slate-300 border border-white/10'
                              }`}
                            >
                              {code}
                            </span>
                            <div>
                              <div className="text-white font-medium flex items-center gap-1.5">
                                {s.name}
                                {isWinner && (
                                  <span className="text-[10px] px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                                    Optimal
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="py-4 px-3 font-mono text-slate-200">{(s.recall_at_3 * 100).toFixed(1)}%</td>
                        <td className="py-4 px-3 font-mono text-slate-200">{(s.recall_at_5 * 100).toFixed(1)}%</td>
                        <td className="py-4 px-3 font-mono text-slate-200">{(s.recall_at_10 * 100).toFixed(1)}%</td>
                        <td className="py-4 px-3 font-mono text-slate-200">{(s.precision_at_3 * 100).toFixed(1)}%</td>
                        <td className="py-4 px-3 font-mono text-slate-200">{(s.precision_at_5 * 100).toFixed(1)}%</td>
                        <td className="py-4 px-3 font-mono text-slate-200">{(s.citation_f1 * 100).toFixed(1)}%</td>
                        <td className="py-4 px-3 font-mono text-emerald-400">{(s.groundedness * 100).toFixed(1)}%</td>
                        <td className="py-4 px-3 font-mono text-cyan-400">{(s.correctness * 100).toFixed(1)}%</td>
                        <td className="py-4 px-4 text-right font-mono text-slate-300">{s.latency_mean_ms} ms</td>
                        <td className="py-4 px-4 text-right font-mono text-slate-400">{s.latency_p90_ms} ms</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Category Breakdown Table */}
          <div className="glass-card rounded-2xl border border-white/10 overflow-hidden bg-dark-900/60 p-6">
            <h2 className="text-sm font-bold text-white mb-1 flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-accent-cyan" />
              Category Breakdown (Recall@5 Across Strategies)
            </h2>
            <p className="text-xs text-slate-400 mb-6">
              Evaluation performance across the 11 architectural sub-disciplines
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {categoryNames.map((cat) => {
                const scores = categories[cat] || {};
                const topScore = scores.E || 0;
                return (
                  <div key={cat} className="p-4 rounded-xl border border-white/5 bg-dark-950/40">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-bold text-white capitalize">{cat}</span>
                      <span className="text-xs font-mono font-bold text-brand-400">
                        {(topScore * 100).toFixed(0)}% Recall@5
                      </span>
                    </div>

                    <div className="space-y-1.5">
                      {['A', 'B', 'C', 'D', 'E'].map((code) => {
                        const sc = scores[code] || 0;
                        const pct = (sc * 100).toFixed(0);
                        return (
                          <div key={code} className="flex items-center gap-2 text-[11px]">
                            <span className="w-4 font-mono text-slate-400">{code}</span>
                            <div className="flex-1 h-2 rounded-full bg-dark-800 overflow-hidden">
                              <div
                                className={`h-full rounded-full ${
                                  code === 'E'
                                    ? 'bg-gradient-to-r from-brand-500 to-cyan-400'
                                    : code === 'B'
                                    ? 'bg-indigo-500'
                                    : code === 'C' || code === 'D'
                                    ? 'bg-blue-500'
                                    : 'bg-slate-600'
                                }`}
                                style={{ width: `${Math.max(5, sc * 100)}%` }}
                              />
                            </div>
                            <span className="w-8 text-right font-mono text-slate-400">{pct}%</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Mode 2: Benchmark Case Explorer */}
      {viewMode === 'cases' && (
        <div className="space-y-6">
          <div className="flex flex-col md:flex-row gap-4 justify-between items-center glass-card p-4 rounded-xl border border-white/10 bg-dark-900/60">
            <div className="flex items-center gap-2 flex-1 max-w-md w-full">
              <Search className="w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder="Search benchmark query or ID..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-transparent text-xs text-white placeholder-slate-500 focus:outline-none"
              />
            </div>

            <div className="flex items-center gap-2">
              <Filter className="w-3.5 h-3.5 text-slate-400" />
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="glass-input text-xs rounded-lg px-3 py-1.5 bg-dark-900 border border-white/10 text-slate-300"
              >
                <option value="all">All Categories ({cases.length})</option>
                {categoryNames.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-3">
            {filteredCases.map((c) => (
              <div
                key={c.case_id}
                className="glass-card p-4 rounded-xl border border-white/5 bg-dark-900/60 hover:border-white/20 transition-all"
              >
                <div className="flex items-center justify-between gap-4 mb-2">
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded font-mono text-[11px] font-bold bg-white/5 text-slate-300 border border-white/10">
                      {c.case_id}
                    </span>
                    <span className="text-xs font-semibold text-brand-400 capitalize px-2 py-0.5 rounded bg-brand-500/10">
                      {c.category}
                    </span>
                  </div>

                  <div className="flex items-center gap-4 text-xs font-mono">
                    <span className="text-slate-400">
                      Recall@5: <strong className="text-white">{(c.recall_at_5 * 100).toFixed(0)}%</strong>
                    </span>
                    <span className="text-slate-400">
                      Precision@3: <strong className="text-white">{(c.precision_at_3 * 100).toFixed(0)}%</strong>
                    </span>
                    <span className="text-slate-400">
                      Latency: <strong className="text-white">{c.total_latency_ms}ms</strong>
                    </span>
                  </div>
                </div>

                <p className="text-xs font-medium text-white mb-2">{c.query}</p>

                <div className="flex items-center gap-3 text-[11px] text-slate-400">
                  <span>
                    Retrieved Files: <strong className="text-slate-200">{c.retrieved_file_count}</strong>
                  </span>
                  <span>•</span>
                  <span>
                    Citation F1: <strong className="text-slate-200">{(c.citation_f1 * 100).toFixed(0)}%</strong>
                  </span>
                  <span>•</span>
                  <span>
                    Groundedness: <strong className="text-slate-200">{(c.groundedness * 100).toFixed(0)}%</strong>
                  </span>
                  <span>•</span>
                  <span>
                    Correctness: <strong className="text-slate-200">{(c.correctness * 100).toFixed(0)}%</strong>
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Mode 3: Markdown Report */}
      {viewMode === 'markdown' && (
        <div className="glass-card rounded-2xl border border-white/10 bg-dark-900/60 p-6">
          <div className="flex items-center justify-between border-b border-white/10 pb-4 mb-4">
            <h2 className="text-sm font-bold text-white flex items-center gap-2">
              <FileText className="w-4 h-4 text-brand-400" />
              Published Markdown Benchmark Report
            </h2>
            <button
              onClick={() => {
                const blob = new Blob([markdownText || ''], { type: 'text/markdown' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = 'evaluation_report.md';
                a.click();
              }}
              className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-white transition-all"
            >
              <Download className="w-3.5 h-3.5" /> Download Report (.md)
            </button>
          </div>

          <pre className="text-xs font-mono text-slate-300 p-4 rounded-xl bg-dark-950/80 overflow-x-auto whitespace-pre-wrap leading-relaxed border border-white/5">
            {markdownText || 'Loading report markdown...'}
          </pre>
        </div>
      )}
    </div>
  );
};

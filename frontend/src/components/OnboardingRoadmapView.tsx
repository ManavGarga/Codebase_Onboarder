import React, { useState, useEffect } from 'react';
import {
  MapPin,
  Calendar,
  CheckCircle2,
  Circle,
  FileCode2,
  Sparkles,
  Loader2,
  ExternalLink,
  BookOpen,
} from 'lucide-react';
import { apiClient } from '../api/client';
import { OnboardingRoadmap, Repository } from '../types';

interface OnboardingRoadmapViewProps {
  repository: Repository | null;
  onSelectFileInMonaco?: (file: string) => void;
}

export const OnboardingRoadmapView: React.FC<OnboardingRoadmapViewProps> = ({
  repository,
  onSelectFileInMonaco,
}) => {
  const [roadmap, setRoadmap] = useState<OnboardingRoadmap | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [checkedItems, setCheckedItems] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!repository) return;
    setIsLoading(true);
    apiClient
      .getRoadmap(repository.id)
      .then((data) => {
        setRoadmap(data);
        setIsLoading(false);
      })
      .catch((err) => {
        console.error('Failed to load roadmap:', err);
        setIsLoading(false);
      });
  }, [repository]);

  const toggleCheck = (id: string) => {
    setCheckedItems((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center p-8">
        <Loader2 className="w-8 h-8 text-brand-400 animate-spin mb-3" />
        <p className="text-sm font-semibold text-white">Generating Tailored Onboarding Curriculum...</p>
        <p className="text-xs text-slate-400">Synthesizing entrypoints, domain logic, and progression paths</p>
      </div>
    );
  }

  if (!roadmap) {
    return (
      <div className="p-8 text-center text-xs text-slate-500">
        No roadmap available. Ensure the repository has completed AST analysis.
      </div>
    );
  }

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-8 animate-in fade-in duration-300">
      {/* Header Banner */}
      <div className="glass-panel p-6 rounded-2xl border border-white/10 space-y-3">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-gradient-to-br from-brand-600 to-accent-cyan text-white shadow-glow">
            <MapPin className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-xl font-black text-white">
              Developer Onboarding Roadmap — {roadmap.repository_name}
            </h1>
            <p className="text-xs text-slate-400">{roadmap.summary}</p>
          </div>
        </div>

        {/* Recommended Reading Order */}
        {roadmap.reading_order && roadmap.reading_order.length > 0 && (
          <div className="pt-3 border-t border-white/10 space-y-2">
            <div className="flex items-center gap-2 text-xs font-semibold text-brand-300">
              <BookOpen className="w-3.5 h-3.5" />
              <span>Recommended Reading Order:</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {roadmap.reading_order.map((file, idx) => (
                <button
                  key={idx}
                  onClick={() => onSelectFileInMonaco?.(file)}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-mono bg-dark-900 text-slate-300 hover:text-white border border-white/10 hover:border-brand-500/40 transition group"
                >
                  <span className="text-brand-400 font-bold">{idx + 1}.</span>
                  <span>{file}</span>
                  <ExternalLink className="w-2.5 h-2.5 opacity-40 group-hover:opacity-100" />
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Phased Milestones Timeline */}
      <div className="space-y-6">
        {roadmap.milestones.map((milestone, mIdx) => (
          <div
            key={mIdx}
            className="glass-panel p-6 rounded-2xl border border-white/10 space-y-4 hover:border-brand-500/30 transition"
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-white/5">
              <div className="flex items-center gap-2.5">
                <div className="p-1.5 rounded-lg bg-brand-500/20 text-brand-400 border border-brand-500/30">
                  <Calendar className="w-4 h-4" />
                </div>
                <div>
                  <span className="text-[11px] font-bold uppercase tracking-wider text-brand-400 block">
                    {milestone.phase}
                  </span>
                  <h3 className="text-base font-bold text-white">{milestone.title}</h3>
                </div>
              </div>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">{milestone.description}</p>

            {/* Prerequisites & Key Files */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
              {milestone.prerequisites?.length > 0 && (
                <div className="bg-dark-900/60 p-3 rounded-xl border border-white/5 text-xs space-y-1">
                  <span className="font-semibold text-slate-400 block">Prerequisites & Concepts:</span>
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {milestone.prerequisites.map((p, pIdx) => (
                      <span key={pIdx} className="px-2 py-0.5 rounded bg-white/5 text-slate-300 text-[11px]">
                        {p}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {milestone.key_files?.length > 0 && (
                <div className="bg-dark-900/60 p-3 rounded-xl border border-white/5 text-xs space-y-1">
                  <span className="font-semibold text-slate-400 block">Key Modules To Review:</span>
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {milestone.key_files.map((kf, kIdx) => (
                      <button
                        key={kIdx}
                        onClick={() => onSelectFileInMonaco?.(kf)}
                        className="flex items-center gap-1 px-2 py-0.5 rounded bg-brand-500/10 text-brand-300 hover:bg-brand-500/20 font-mono text-[11px] border border-brand-500/20 transition"
                      >
                        <FileCode2 className="w-3 h-3 text-brand-400" />
                        <span>{kf}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Action Items Checklist */}
            <div className="pt-2 space-y-2">
              <span className="text-xs font-semibold text-slate-300">Action Items & Exercises:</span>
              <div className="space-y-1.5">
                {milestone.action_items?.map((item, aIdx) => {
                  const itemId = `${mIdx}_action_${aIdx}`;
                  const isChecked = checkedItems.has(itemId);
                  return (
                    <div
                      key={itemId}
                      onClick={() => toggleCheck(itemId)}
                      className={`flex items-start gap-2.5 p-2 rounded-lg cursor-pointer transition text-xs ${
                        isChecked ? 'bg-emerald-950/20 text-slate-500 line-through' : 'hover:bg-white/5 text-slate-300'
                      }`}
                    >
                      {isChecked ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                      ) : (
                        <Circle className="w-4 h-4 text-slate-600 shrink-0 mt-0.5" />
                      )}
                      <span>{item}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Suggested Starter Tasks */}
            {milestone.suggested_starter_tasks?.length > 0 && (
              <div className="p-3 rounded-xl bg-brand-950/30 border border-brand-800/40 text-xs space-y-1">
                <div className="flex items-center gap-1.5 font-bold text-brand-400">
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>First Starter Contribution:</span>
                </div>
                <ul className="list-disc list-inside text-slate-300 space-y-0.5 pl-1">
                  {milestone.suggested_starter_tasks.map((st, sIdx) => (
                    <li key={sIdx}>{st}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

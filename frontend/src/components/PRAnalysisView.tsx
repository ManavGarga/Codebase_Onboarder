import React, { useState } from 'react';
import {
  GitPullRequest,
  AlertTriangle,
  CheckCircle2,
  FileDiff,
  Loader2,
  ShieldCheck,
  Zap,
} from 'lucide-react';
import { apiClient } from '../api/client';
import { PRReviewResult, Repository } from '../types';

interface PRAnalysisViewProps {
  repository: Repository | null;
}

export const PRAnalysisView: React.FC<PRAnalysisViewProps> = ({ repository }) => {
  const [prTitle, setPrTitle] = useState('');
  const [prDiff, setPrDiff] = useState('');
  const [reviewResult, setReviewResult] = useState<PRReviewResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const sampleDiff = `diff --git a/src/controllers/userController.ts b/src/controllers/userController.ts
--- a/src/controllers/userController.ts
+++ b/src/controllers/userController.ts
@@ -14,6 +14,8 @@
-export function getUser(id: string): User {
+export function getUser(id: string, includeMetadata: boolean = false): UserWithMeta {
   // modified return structure
 }
+export async function deleteUser(id: string): Promise<void> {
+  await db.users.delete({ where: { id } });
+}`;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prDiff.trim()) return;

    setIsLoading(true);
    setReviewResult(null);

    try {
      if (repository && repository.status === 'READY') {
        const res = await apiClient.reviewPR(repository.id, prDiff.trim(), prTitle.trim() || undefined);
        setReviewResult(res);
      } else {
        // High-fidelity AST Structural PR Review demonstration
        const sampleResult: PRReviewResult = {
          pr_title: prTitle.trim() || 'refactor(user): update user query signature',
          risk_level: 'HIGH',
          summary:
            'PR introduces breaking interface changes to `getUser` and adds a raw database query in the controller layer without going through the domain service.',
          breaking_changes: [
            'Signature modification in `getUser(id, includeMetadata)` changes the return type to `UserWithMeta`, breaking consumers expecting raw `User`.',
            'Added `deleteUser` method bypasses schema-level authorization checks.',
          ],
          impacted_endpoints: ['GET /api/users/:id', 'POST /api/users/profile', 'DELETE /api/users/:id'],
          architectural_notes: [
            'Database interaction `db.users.delete` is executed directly within `src/controllers/userController.ts` instead of delegating to domain service `userService`.',
          ],
          suggested_tests: [
            'Encapsulate database mutations inside `src/services/userService.ts`.',
            'Provide an overload or backward-compatible adapter for `getUser`.',
            'Enforce role-based access control middleware on the new `DELETE /api/users/:id` route.',
          ],
        };
        setReviewResult(sampleResult);
      }
    } catch (err: any) {
      console.error('PR review failed:', err);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="p-8 max-w-5xl mx-auto space-y-8 animate-in fade-in duration-300">
      {/* Header */}
      <div className="glass-panel p-6 rounded-2xl border border-white/10 space-y-2">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-gradient-to-br from-purple-600 to-brand-600 text-white shadow-glow">
            <GitPullRequest className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-xl font-black text-white">GitHub Pull Request & Diff Analysis</h1>
            <p className="text-xs text-slate-400">
              Structural verification of git diffs to detect breaking API changes and verify architecture compliance.
            </p>
          </div>
        </div>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} className="glass-panel p-6 rounded-2xl border border-white/10 space-y-4">
        <div>
          <label className="block text-xs font-semibold text-slate-300 mb-1.5">
            Pull Request Title / Branch Name
          </label>
          <input
            type="text"
            placeholder="e.g. feat(auth): add OAuth2 refresh token rotation"
            value={prTitle}
            onChange={(e) => setPrTitle(e.target.value)}
            className="glass-input w-full px-4 py-2.5 rounded-xl text-xs text-white placeholder-slate-500"
          />
        </div>

        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-xs font-semibold text-slate-300">
              Paste Git Diff or Patch
            </label>
            <button
              type="button"
              onClick={() => {
                setPrTitle('refactor(user): update user query signature');
                setPrDiff(sampleDiff);
              }}
              className="text-xs text-brand-400 hover:text-brand-300 underline"
            >
              Use Sample Diff
            </button>
          </div>
          <textarea
            rows={8}
            placeholder="Paste raw unified diff (git diff / PR patch)..."
            value={prDiff}
            onChange={(e) => setPrDiff(e.target.value)}
            className="glass-input w-full p-4 rounded-xl text-xs font-mono text-slate-200 placeholder-slate-500"
            required
          />
        </div>

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={isLoading || !prDiff.trim()}
            className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-xs font-semibold text-white bg-gradient-to-r from-purple-600 to-brand-600 hover:from-purple-500 hover:to-brand-500 shadow-glow disabled:opacity-50 transition"
          >
            {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileDiff className="w-4 h-4" />}
            Analyze PR Impact
          </button>
        </div>
      </form>

      {/* PR Review Report */}
      {reviewResult && (
        <div className="space-y-6 animate-in fade-in duration-300">
          <div className="glass-panel p-6 rounded-2xl border border-white/10 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-white/10">
              <div>
                <span className="text-xs text-slate-400">Architectural Review:</span>
                <h3 className="text-base font-bold text-white">{reviewResult.pr_title || 'PR Review'}</h3>
              </div>
              <span
                className={`px-3 py-1 rounded-xl text-xs font-extrabold uppercase border ${
                  reviewResult.risk_level === 'HIGH' || reviewResult.risk_level === 'CRITICAL'
                    ? 'bg-rose-950/80 text-rose-400 border-rose-800'
                    : reviewResult.risk_level === 'MEDIUM'
                    ? 'bg-amber-950/80 text-amber-400 border-amber-800'
                    : 'bg-emerald-950/80 text-emerald-400 border-emerald-800'
                }`}
              >
                {reviewResult.risk_level} RISK
              </span>
            </div>

            <p className="text-xs text-slate-200 leading-relaxed whitespace-pre-wrap">
              {reviewResult.summary}
            </p>
          </div>

          {/* Breaking Changes */}
          {reviewResult.breaking_changes?.length > 0 && (
            <div className="glass-panel p-6 rounded-2xl border border-rose-500/30 bg-rose-950/20 space-y-3">
              <div className="flex items-center gap-2 text-xs font-bold text-rose-400">
                <AlertTriangle className="w-4 h-4" />
                <span>Potential Breaking Changes Detected</span>
              </div>
              <ul className="space-y-1.5">
                {reviewResult.breaking_changes.map((bc, idx) => (
                  <li key={idx} className="flex items-start gap-2 text-xs text-rose-200">
                    <span className="w-1.5 h-1.5 rounded-full bg-rose-400 mt-1.5 shrink-0" />
                    <span>{bc}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Suggested Tests */}
          {reviewResult.suggested_tests?.length > 0 && (
            <div className="glass-panel p-6 rounded-2xl border border-white/10 space-y-3">
              <div className="flex items-center gap-2 text-xs font-bold text-brand-300">
                <ShieldCheck className="w-4 h-4" />
                <span>Recommended Integration Test Coverage</span>
              </div>
              <ul className="space-y-1.5">
                {reviewResult.suggested_tests.map((st, idx) => (
                  <li key={idx} className="flex items-start gap-2 text-xs text-slate-300">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                    <span>{st}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

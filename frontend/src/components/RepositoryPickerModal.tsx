import React, { useState, useEffect } from 'react';
import {
  X,
  Search,
  Lock,
  Globe,
  Star,
  GitBranch,
  Loader2,
  CheckCircle2,
  Key,
  FolderGit2,
  ExternalLink,
  ShieldCheck,
} from 'lucide-react';
import { GitHubRepository, GitHubUser } from '../types';
import { apiClient } from '../api/client';

interface RepositoryPickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectRepository: (repoUrl: string, branch: string, isPrivate: boolean) => void;
  currentUser: GitHubUser | null;
  onLoginSuccess?: (user: GitHubUser) => void;
}

export const RepositoryPickerModal: React.FC<RepositoryPickerModalProps> = ({
  isOpen,
  onClose,
  onSelectRepository,
  currentUser,
  onLoginSuccess,
}) => {
  const [repositories, setRepositories] = useState<GitHubRepository[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'public' | 'private'>('all');
  const [isLoading, setIsLoading] = useState(false);
  const [patInput, setPatInput] = useState('');
  const [activeTab, setActiveTab] = useState<'repos' | 'pat'>('repos');
  const [patError, setPatError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    setIsLoading(true);
    apiClient
      .getGitHubRepositories()
      .then((repos) => {
        setRepositories(repos || []);
      })
      .catch((err) => {
        console.warn('Failed to load GitHub repositories:', err);
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, [isOpen]);

  if (!isOpen) return null;

  const filteredRepos = repositories.filter((r) => {
    const matchesSearch =
      r.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (r.description && r.description.toLowerCase().includes(searchQuery.toLowerCase()));

    if (filterType === 'private') return matchesSearch && r.private;
    if (filterType === 'public') return matchesSearch && !r.private;
    return matchesSearch;
  });

  const handlePatLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!patInput.trim()) return;

    setIsLoading(true);
    setPatError(null);
    try {
      const authUrlRes = await apiClient.getGitHubAuthUrl();
      // Use direct callback endpoint to register PAT session
      const res = await fetch('/api/auth/github/callback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ personalAccessToken: patInput.trim() }),
      });
      const data = await res.json();
      if (data.success && data.user) {
        onLoginSuccess?.(data.user);
        const repos = await apiClient.getGitHubRepositories();
        setRepositories(repos || []);
        setActiveTab('repos');
        setPatInput('');
      } else {
        setPatError(data.error || 'Failed to authenticate token with GitHub.');
      }
    } catch (err: any) {
      setPatError(err.message || 'Token authentication failed.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="glass-panel w-full max-w-2xl bg-dark-900 border border-white/10 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="p-5 border-b border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 text-white shadow-glow">
              <FolderGit2 className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                Import Repository from GitHub
                {currentUser && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-semibold border border-emerald-500/30">
                    Connected as @{currentUser.login}
                  </span>
                )}
              </h2>
              <p className="text-xs text-slate-400">
                Select any public or private repository to start AI AST ingestion and code intelligence.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/5 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Selection */}
        <div className="px-5 pt-3 border-b border-white/10 flex gap-4 text-xs font-semibold">
          <button
            onClick={() => setActiveTab('repos')}
            className={`pb-2.5 border-b-2 transition flex items-center gap-1.5 ${
              activeTab === 'repos'
                ? 'border-indigo-400 text-indigo-300'
                : 'border-transparent text-slate-400 hover:text-white'
            }`}
          >
            <FolderGit2 className="w-4 h-4" />
            <span>Accessible Repositories ({repositories.length})</span>
          </button>
          <button
            onClick={() => setActiveTab('pat')}
            className={`pb-2.5 border-b-2 transition flex items-center gap-1.5 ${
              activeTab === 'pat'
                ? 'border-indigo-400 text-indigo-300'
                : 'border-transparent text-slate-400 hover:text-white'
            }`}
          >
            <Key className="w-4 h-4" />
            <span>Personal Access Token</span>
          </button>
        </div>

        {/* Body Content */}
        {activeTab === 'repos' ? (
          <div className="p-5 flex-1 overflow-y-auto space-y-4">
            {/* Search and Filters */}
            <div className="flex items-center gap-3">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  placeholder="Filter repositories by name or description..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 rounded-xl text-xs bg-dark-800 border border-white/10 text-white placeholder-slate-500 focus:outline-none focus:border-indigo-400"
                />
              </div>
              <div className="flex items-center bg-dark-800 p-1 rounded-xl border border-white/10 text-xs">
                {(['all', 'public', 'private'] as const).map((type) => (
                  <button
                    key={type}
                    onClick={() => setFilterType(type)}
                    className={`px-3 py-1 rounded-lg capitalize transition font-medium ${
                      filterType === type
                        ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    {type}
                  </button>
                ))}
              </div>
            </div>

            {/* Repositories List */}
            {isLoading ? (
              <div className="py-16 text-center space-y-2">
                <Loader2 className="w-6 h-6 animate-spin text-indigo-400 mx-auto" />
                <p className="text-xs text-slate-400">Fetching repositories from GitHub API...</p>
              </div>
            ) : filteredRepos.length === 0 ? (
              <div className="py-16 text-center space-y-2">
                <FolderGit2 className="w-8 h-8 text-slate-600 mx-auto" />
                <p className="text-xs text-slate-400">No repositories found matching your filter.</p>
              </div>
            ) : (
              <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
                {filteredRepos.map((repo) => (
                  <div
                    key={repo.id}
                    className="p-3.5 rounded-xl bg-dark-800/80 border border-white/5 hover:border-indigo-500/40 transition flex items-center justify-between group"
                  >
                    <div className="space-y-1 overflow-hidden pr-3">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-white group-hover:text-indigo-300 truncate">
                          {repo.full_name}
                        </span>
                        {repo.private ? (
                          <span className="flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/30">
                            <Lock className="w-2.5 h-2.5" /> Private
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                            <Globe className="w-2.5 h-2.5" /> Public
                          </span>
                        )}
                      </div>
                      {repo.description && (
                        <p className="text-[11px] text-slate-400 truncate">{repo.description}</p>
                      )}
                      <div className="flex items-center gap-3 text-[10px] text-slate-500 font-mono">
                        {repo.language && <span>{repo.language}</span>}
                        <span className="flex items-center gap-1">
                          <Star className="w-3 h-3 text-amber-400" /> {repo.stargazers_count}
                        </span>
                        <span className="flex items-center gap-1">
                          <GitBranch className="w-3 h-3 text-slate-400" /> {repo.default_branch}
                        </span>
                      </div>
                    </div>

                    <button
                      onClick={() => {
                        onSelectRepository(repo.html_url, repo.default_branch, repo.private);
                        onClose();
                      }}
                      className="px-3 py-1.5 rounded-xl text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 transition shadow-glow shrink-0 flex items-center gap-1"
                    >
                      <span>Analyze</span>
                      <ExternalLink className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          /* Personal Access Token Tab */
          <form onSubmit={handlePatLogin} className="p-6 space-y-4">
            <div className="p-3.5 rounded-xl bg-indigo-950/40 border border-indigo-500/30 text-xs text-indigo-300 flex items-start gap-2.5">
              <ShieldCheck className="w-4 h-4 shrink-0 mt-0.5 text-indigo-400" />
              <div>
                <span className="font-bold">Private Repository Authentication:</span> Enter a GitHub Personal Access
                Token (PAT) with <code className="text-amber-300">repo</code> scope to analyze private repositories.
                Tokens are encrypted in-memory and never written to disk.
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-slate-300">
                GitHub Personal Access Token (PAT)
              </label>
              <input
                type="password"
                placeholder="ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                value={patInput}
                onChange={(e) => setPatInput(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl text-xs bg-dark-800 border border-white/10 text-white font-mono placeholder-slate-500 focus:outline-none focus:border-indigo-400"
                required
              />
            </div>

            {patError && <p className="text-xs text-rose-400">{patError}</p>}

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setActiveTab('repos')}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white"
              >
                Back to Repositories
              </button>
              <button
                type="submit"
                disabled={isLoading || !patInput.trim()}
                className="flex items-center gap-1.5 px-5 py-2 rounded-xl text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 transition shadow-glow disabled:opacity-50"
              >
                {isLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Key className="w-3.5 h-3.5" />}
                Authenticate & Load Repositories
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};

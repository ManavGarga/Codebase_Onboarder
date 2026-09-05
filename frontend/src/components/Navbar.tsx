import {
  Code2,
  GitBranch,
  PlusCircle,
  Cpu,
  Layers,
  FileCode2,
  MessageSquareCode,
  MapPin,
  AlertTriangle,
  GitPullRequest,
  CheckCircle2,
  Clock,
  AlertCircle,
  BarChart3,
  Route,
  Github,
} from 'lucide-react';
import { Repository, IngestionStatus, GitHubUser } from '../types';

interface NavbarProps {
  repositories: Repository[];
  selectedRepo: Repository | null;
  onSelectRepo: (repo: Repository) => void;
  onOpenIngestModal: () => void;
  onOpenGitHubModal?: () => void;
  gitHubUser?: GitHubUser | null;
  activeTab: string;
  onTabChange: (tab: string) => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  repositories,
  selectedRepo,
  onSelectRepo,
  onOpenIngestModal,
  onOpenGitHubModal,
  gitHubUser,
  activeTab,
  onTabChange,
}) => {
  const getStatusBadge = (status?: IngestionStatus) => {
    switch (status) {
      case 'READY':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-950/80 text-emerald-400 border border-emerald-800/60">
            <CheckCircle2 className="w-3.5 h-3.5" /> Ready
          </span>
        );
      case 'FAILED':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-950/80 text-rose-400 border border-rose-800/60">
            <AlertCircle className="w-3.5 h-3.5" /> Failed
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-950/80 text-amber-300 border border-amber-800/60 animate-pulse">
            <Clock className="w-3.5 h-3.5" /> {status || 'Processing'}
          </span>
        );
    }
  };

  const navTabs = [
    { id: 'overview', label: 'Overview', icon: Layers },
    { id: 'architecture', label: 'Architecture', icon: Cpu },
    { id: 'dependencies', label: 'Dependencies', icon: GitBranch },
    { id: 'flow', label: 'Execution Flow', icon: Route },
    { id: 'code', label: 'Code Explorer', icon: FileCode2 },
    { id: 'rag', label: 'Code Intelligence RAG', icon: MessageSquareCode },
    { id: 'roadmap', label: 'Onboarding Roadmap', icon: MapPin },
    { id: 'impact', label: 'Impact Analysis', icon: AlertTriangle },
    { id: 'pr', label: 'PR Review', icon: GitPullRequest },
    { id: 'benchmarks', label: 'Evaluation Benchmarks', icon: BarChart3 },
  ];

  return (
    <header className="sticky top-0 z-40 w-full border-b border-white/10 bg-dark-950/90 backdrop-blur-xl">
      {/* Top Bar */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-white/5">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-gradient-to-br from-brand-600 to-accent-cyan shadow-glow">
              <Code2 className="w-6 h-6 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-extrabold text-lg tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white via-slate-200 to-brand-400">
                  Codebase Onboarder
                </span>
                <span className="text-[10px] font-semibold tracking-wider uppercase px-1.5 py-0.5 rounded bg-brand-500/20 text-brand-400 border border-brand-500/30">
                  AST + RAG
                </span>
              </div>
              <p className="text-xs text-slate-400">AI-Powered Developer Onboarding Platform</p>
            </div>
          </div>

          <div className="h-6 w-px bg-white/10 mx-2" />

          {/* Repo Switcher */}
          <div className="flex items-center gap-3">
            <select
              value={selectedRepo?.id || ''}
              onChange={(e) => {
                const found = repositories.find((r) => r.id === e.target.value);
                if (found) onSelectRepo(found);
              }}
              className="glass-input text-xs font-medium rounded-lg px-3 py-1.5 bg-dark-900 border border-white/10 focus:ring-1 focus:ring-brand-500 text-slate-200 cursor-pointer"
            >
              {repositories.length === 0 && <option value="">No repositories yet</option>}
              {repositories.map((repo) => (
                <option key={repo.id} value={repo.id}>
                  {repo.owner}/{repo.name} ({repo.branch})
                </option>
              ))}
            </select>

            {selectedRepo && getStatusBadge(selectedRepo.status)}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2.5">
          {onOpenGitHubModal && (
            <button
              onClick={onOpenGitHubModal}
              id="github-repos-btn"
              data-testid="github-repos-btn"
              className="flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold text-slate-200 bg-dark-800/90 hover:bg-dark-700 border border-white/10 hover:border-white/20 transition-all duration-200"
              title="Browse GitHub repositories (Public & Private)"
            >
              {gitHubUser?.avatar_url ? (
                <img
                  src={gitHubUser.avatar_url}
                  alt={gitHubUser.login}
                  className="w-4 h-4 rounded-full border border-brand-400"
                />
              ) : (
                <Github className="w-4 h-4 text-slate-300" />
              )}
              <span>{gitHubUser ? `@${gitHubUser.login}` : 'GitHub Repos'}</span>
            </button>
          )}

          <button
            onClick={onOpenIngestModal}
            id="ingest-repo-btn"
            data-testid="ingest-repo-btn"
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold text-white bg-gradient-to-r from-brand-600 to-indigo-600 hover:from-brand-500 hover:to-indigo-500 shadow-glow transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]"
          >
            <PlusCircle className="w-4 h-4" />
            Ingest Repository
          </button>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex items-center gap-1 px-6 overflow-x-auto scrollbar-none py-1">
        {navTabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              id={`nav-tab-${tab.id}`}
              data-testid={`nav-tab-${tab.id}`}
              onClick={() => onTabChange(tab.id)}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-medium transition-all whitespace-nowrap cursor-pointer ${
                isActive
                  ? 'bg-brand-600/20 text-brand-300 border border-brand-500/40 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
              }`}
            >
              <Icon className={`w-4 h-4 ${isActive ? 'text-brand-400' : 'text-slate-400'}`} />
              {tab.label}
            </button>
          );
        })}
      </div>
    </header>
  );
};

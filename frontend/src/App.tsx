import React, { useState, useEffect, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from './api/client';
import { Repository, GitHubUser } from './types';
import { Navbar } from './components/Navbar';
import { IngestionModal } from './components/IngestionModal';
import { RepositoryPickerModal } from './components/RepositoryPickerModal';
import { OverviewView } from './components/OverviewView';
import { ArchitectureGraphView } from './components/ArchitectureGraphView';
import { DependencyGraphView } from './components/DependencyGraphView';
import { ExecutionFlowView } from './components/ExecutionFlowView';
import { CodeExplorerView } from './components/CodeExplorerView';
import { CodeRagView } from './components/CodeRagView';
import { OnboardingRoadmapView } from './components/OnboardingRoadmapView';
import { ImpactAnalysisView } from './components/ImpactAnalysisView';
import { PRAnalysisView } from './components/PRAnalysisView';
import { EvaluationBenchmarkView } from './components/EvaluationBenchmarkView';

export const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<string>('overview');
  const [selectedRepoId, setSelectedRepoId] = useState<string | null>(null);
  const [isIngestModalOpen, setIsIngestModalOpen] = useState(false);
  const [isGitHubPickerOpen, setIsGitHubPickerOpen] = useState(false);
  const [gitHubUser, setGitHubUser] = useState<GitHubUser | null>(null);
  const [ingestInitialUrl, setIngestInitialUrl] = useState('');
  const [ingestInitialBranch, setIngestInitialBranch] = useState('main');

  // Jump-to-line coordination state
  const [activeEditorFile, setActiveEditorFile] = useState<string | null>(null);
  const [activeEditorLine, setActiveEditorLine] = useState<number | null>(null);

  // Track if RAG tab has been visited so its conversation state is kept alive across tab switches
  const [hasVisitedRag, setHasVisitedRag] = useState(false);

  useEffect(() => {
    if (activeTab === 'rag') {
      setHasVisitedRag(true);
    }
  }, [activeTab]);

  // Load GitHub user on mount or handle OAuth redirect code
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    const mock = params.get('mock') === 'true';

    if (code) {
      fetch('/api/auth/github/callback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, mock }),
      })
        .then((r) => r.json())
        .then((data) => {
          if (data.success && data.user) {
            if (data.sessionToken) {
              apiClient.setAuthSession(data.sessionToken, data.user);
            }
            setGitHubUser(data.user);
            refetchRepos();
          }
        })
        .finally(() => {
          window.history.replaceState({}, document.title, window.location.pathname);
        });
    } else {
      apiClient
        .getGitHubUser()
        .then((user) => setGitHubUser(user))
        .catch(() => setGitHubUser(null));
    }
  }, []);

  // Query: List repositories for current tenant only
  const { data: repositories = [], refetch: refetchRepos } = useQuery({
    queryKey: ['repositories', gitHubUser?.login],
    queryFn: apiClient.listRepositories,
    refetchInterval: 5000,
  });

  // Automatically select the first repository if none selected
  useEffect(() => {
    if (repositories.length > 0 && !selectedRepoId) {
      setSelectedRepoId(repositories[0].id);
    }
  }, [repositories, selectedRepoId]);

  const selectedRepo = repositories.find((r) => r.id === selectedRepoId) || null;

  // Query: Knowledge Graph data for active repo
  const { data: graphData } = useQuery({
    queryKey: ['graph', selectedRepoId],
    queryFn: () => (selectedRepoId ? apiClient.getGraph(selectedRepoId) : null),
    enabled: !!selectedRepoId && selectedRepo?.status === 'READY',
  });

  const handleSelectFileInMonaco = useCallback((filePath: string, line?: number) => {
    setActiveEditorFile(filePath);
    setActiveEditorLine(line || 1);
    setActiveTab('code');
  }, []);

  const handleIngestionComplete = useCallback((newRepo: Repository) => {
    refetchRepos();
    setSelectedRepoId(newRepo.id);
    setIsIngestModalOpen(false);
    setActiveTab('overview');
  }, [refetchRepos]);

  const handleLogout = useCallback(async () => {
    await apiClient.logoutGitHub();
    setGitHubUser(null);
    setSelectedRepoId(null);
    refetchRepos();
  }, [refetchRepos]);

  const handleSelectGitHubRepository = (repoUrl: string, branch: string, _isPrivate: boolean) => {
    setIngestInitialUrl(repoUrl);
    setIngestInitialBranch(branch || 'main');
    setIsGitHubPickerOpen(false);
    setIsIngestModalOpen(true);
  };

  return (
    <div className="min-h-screen flex flex-col bg-dark-950 text-slate-100 selection:bg-brand-600 selection:text-white">
      {/* Top Navbar */}
      <Navbar
        repositories={repositories}
        selectedRepo={selectedRepo}
        onSelectRepo={(r) => setSelectedRepoId(r.id)}
        onOpenIngestModal={() => {
          setIngestInitialUrl('');
          setIngestInitialBranch('main');
          setIsIngestModalOpen(true);
        }}
        onOpenGitHubModal={() => setIsGitHubPickerOpen(true)}
        gitHubUser={gitHubUser}
        onLogout={handleLogout}
        activeTab={activeTab}
        onTabChange={setActiveTab}
      />

      {/* Main Tab Content */}
      <main className="flex-1 w-full overflow-y-auto">
        {activeTab === 'overview' && (
          <OverviewView
            repository={selectedRepo}
            onNavigateTab={setActiveTab}
          />
        )}

        {activeTab === 'architecture' && (
          <ArchitectureGraphView
            repository={selectedRepo}
            graphData={graphData || null}
            onSelectFileInMonaco={handleSelectFileInMonaco}
          />
        )}

        {activeTab === 'dependencies' && (
          <DependencyGraphView
            repository={selectedRepo}
            graphData={graphData || null}
            onSelectFileInMonaco={(file) => handleSelectFileInMonaco(file, 1)}
          />
        )}

        {activeTab === 'flow' && (
          <ExecutionFlowView
            repository={selectedRepo}
            graphData={graphData || null}
            onSelectFileInMonaco={handleSelectFileInMonaco}
          />
        )}

        {activeTab === 'code' && (
          <CodeExplorerView
            repository={selectedRepo}
            activeFilePath={activeEditorFile}
            targetLine={activeEditorLine}
          />
        )}

        {(hasVisitedRag || activeTab === 'rag') && (
          <div className={activeTab === 'rag' ? '' : 'hidden'}>
            <CodeRagView
              key={selectedRepo?.id || 'demo'}
              repository={selectedRepo}
              onJumpToCitation={handleSelectFileInMonaco}
            />
          </div>
        )}

        {activeTab === 'roadmap' && (
          <OnboardingRoadmapView
            repository={selectedRepo}
            onSelectFileInMonaco={(file) => handleSelectFileInMonaco(file, 1)}
          />
        )}

        {activeTab === 'impact' && (
          <ImpactAnalysisView
            repository={selectedRepo}
            onSelectFileInMonaco={(file) => handleSelectFileInMonaco(file, 1)}
          />
        )}

        {activeTab === 'pr' && (
          <PRAnalysisView repository={selectedRepo} />
        )}

        {activeTab === 'benchmarks' && (
          <EvaluationBenchmarkView repository={selectedRepo} />
        )}
      </main>

      {/* Ingestion Modal */}
      <IngestionModal
        isOpen={isIngestModalOpen}
        onClose={() => setIsIngestModalOpen(false)}
        onIngestionComplete={handleIngestionComplete}
        initialUrl={ingestInitialUrl}
        initialBranch={ingestInitialBranch}
      />

      {/* GitHub Repository Picker Modal */}
      <RepositoryPickerModal
        isOpen={isGitHubPickerOpen}
        onClose={() => setIsGitHubPickerOpen(false)}
        currentUser={gitHubUser}
        onSelectRepository={handleSelectGitHubRepository}
        onLoginSuccess={(user) => {
          setGitHubUser(user);
          refetchRepos();
        }}
      />
    </div>
  );
};

export default App;

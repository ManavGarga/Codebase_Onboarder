import React, { useState, useEffect } from 'react';
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

  // Load GitHub user on mount
  useEffect(() => {
    apiClient
      .getGitHubUser()
      .then((user) => setGitHubUser(user))
      .catch(() => setGitHubUser(null));
  }, []);

  // Query: List repositories
  const { data: repositories = [], refetch: refetchRepos } = useQuery({
    queryKey: ['repositories'],
    queryFn: apiClient.listRepositories,
    refetchInterval: 5000,
  });

  // Select first repo if none selected
  useEffect(() => {
    if (!selectedRepoId && repositories.length > 0) {
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

  const handleSelectFileInMonaco = (filePath: string, line?: number) => {
    setActiveEditorFile(filePath);
    setActiveEditorLine(line || 1);
    setActiveTab('code');
  };

  const handleIngestionComplete = (newRepo: Repository) => {
    refetchRepos();
    setSelectedRepoId(newRepo.id);
    setIsIngestModalOpen(false);
    setActiveTab('overview');
  };

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

        {activeTab === 'rag' && (
          <CodeRagView
            repository={selectedRepo}
            onJumpToCitation={handleSelectFileInMonaco}
          />
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
        onLoginSuccess={(user) => setGitHubUser(user)}
      />
    </div>
  );
};

export default App;

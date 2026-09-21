import axios from 'axios';
import {
  Repository,
  FileTreeNode,
  SymbolItem,
  RouteItem,
  ModelItem,
  KnowledgeGraphData,
  GroundedAnswer,
  OnboardingRoadmap,
  ImpactResult,
  PRReviewResult,
  ExecutionFlowTrace,
  GitHubUser,
  GitHubRepository,
} from '../types';

const api = axios.create({
  baseURL: '/api',
  headers: {
    'Content-Type': 'application/json',
    'x-user-id': 'default_user',
  },
});

export const apiClient = {
  // Repositories
  listRepositories: async (): Promise<Repository[]> => {
    const res = await api.get('/repositories');
    return res.data.repositories || [];
  },

  getRepository: async (id: string): Promise<Repository> => {
    const res = await api.get(`/repositories/${id}`);
    return res.data.repository;
  },

  ingestRepository: async (url: string, branch: string = 'main', accessToken?: string) => {
    const res = await api.post('/repositories', { url, branch, ...(accessToken ? { accessToken } : {}) });
    return res.data;
  },

  getRepoStatus: async (id: string) => {
    const res = await api.get(`/repositories/${id}/status`);
    return res.data;
  },

  // Code & Files
  getFileTree: async (id: string): Promise<FileTreeNode[]> => {
    const res = await api.get(`/repositories/${id}/file-tree`);
    return res.data.tree || [];
  },

  getFileContent: async (id: string, path: string): Promise<{ content: string; totalLines: number }> => {
    const res = await api.get(`/repositories/${id}/file-content`, {
      params: { path },
    });
    return res.data;
  },

  // AST Symbols & Graph
  getSymbols: async (id: string): Promise<SymbolItem[]> => {
    const res = await api.get(`/repositories/${id}/symbols`);
    return res.data.symbols || [];
  },

  getRoutes: async (id: string): Promise<RouteItem[]> => {
    const res = await api.get(`/repositories/${id}/routes`);
    return res.data.routes || [];
  },

  getModels: async (id: string): Promise<ModelItem[]> => {
    const res = await api.get(`/repositories/${id}/models`);
    return res.data.models || [];
  },

  getGraph: async (id: string): Promise<KnowledgeGraphData> => {
    const res = await api.get(`/repositories/${id}/graph`);
    return res.data.graph;
  },

  // AI & RAG Queries
  queryQA: async (id: string, query: string): Promise<GroundedAnswer> => {
    const res = await api.post(`/repositories/${id}/qa`, { query });
    return res.data.data;
  },

  getRoadmap: async (id: string): Promise<OnboardingRoadmap> => {
    const res = await api.get(`/repositories/${id}/roadmap`);
    return res.data.roadmap;
  },

  analyzeImpact: async (
    id: string,
    targetFile: string,
    targetSymbol?: string,
    diffSnippet?: string
  ): Promise<ImpactResult> => {
    const res = await api.post(`/repositories/${id}/impact`, {
      targetFile,
      targetSymbol,
      diffSnippet,
    });
    return res.data.impact;
  },

  reviewPR: async (id: string, prDiff: string, prTitle?: string): Promise<PRReviewResult> => {
    const res = await api.post(`/repositories/${id}/pr-analysis`, {
      prDiff,
      prTitle,
    });
    return res.data.review;
  },

  deleteRepository: async (id: string) => {
    const res = await api.delete(`/repositories/${id}`);
    return res.data;
  },

  // Benchmarking & Evaluation
  getEvaluationReport: async () => {
    const res = await api.get('/repositories/evaluation/report');
    return res.data.data;
  },

  runEvaluation: async () => {
    const res = await api.post('/repositories/evaluation/run');
    return res.data;
  },

  getEvaluationMarkdown: async () => {
    const res = await api.get('/repositories/evaluation/markdown');
    return res.data.report_markdown;
  },

  // Intelligent Execution Flow
  traceExecutionFlow: async (id: string, query: string, entrypoint?: string): Promise<ExecutionFlowTrace> => {
    const res = await api.post(`/repositories/${id}/flow`, { query, entrypoint });
    return res.data.flow;
  },

  // GitHub OAuth & Private Repositories
  getGitHubAuthUrl: async () => {
    const res = await api.get('/auth/github/url');
    return res.data;
  },

  getGitHubUser: async () => {
    const res = await api.get('/auth/github/user');
    return res.data.user;
  },

  getGitHubRepositories: async () => {
    const res = await api.get('/auth/github/repositories');
    return res.data.repositories;
  },

  logoutGitHub: async () => {
    const res = await api.post('/auth/logout');
    return res.data;
  },
};

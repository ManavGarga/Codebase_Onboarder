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

const STORAGE_KEYS = {
  TENANT_ID: 'codebase_onboarder_tenant_id',
  SESSION_TOKEN: 'codebase_onboarder_token',
};

// Generates or retrieves a unique per-browser client tenant ID
export const getClientTenantId = (): string => {
  if (typeof window === 'undefined') return 'server_render';

  let tenantId = localStorage.getItem(STORAGE_KEYS.TENANT_ID);
  if (!tenantId || tenantId === 'default_user') {
    const randomSuffix =
      typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID().replace(/-/g, '').substring(0, 16)
        : Math.random().toString(36).substring(2, 10) + Date.now().toString(36);
    tenantId = `guest_${randomSuffix}`;
    localStorage.setItem(STORAGE_KEYS.TENANT_ID, tenantId);
  }
  return tenantId;
};

const api = axios.create({
  baseURL: '/api',
  headers: {
    'Content-Type': 'application/json',
  },
});

// Dynamic interceptor attaching tenant ID and auth token to every request
api.interceptors.request.use((config) => {
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem(STORAGE_KEYS.SESSION_TOKEN);
    const tenantId = getClientTenantId();

    if (token) {
      config.headers['Authorization'] = `Bearer ${token}`;
    }
    config.headers['x-user-id'] = tenantId;
  }
  return config;
});

export const apiClient = {
  // Authentication & Session Management
  setAuthSession: (sessionToken: string, user?: { login?: string }) => {
    localStorage.setItem(STORAGE_KEYS.SESSION_TOKEN, sessionToken);
    if (user?.login) {
      localStorage.setItem(STORAGE_KEYS.TENANT_ID, user.login);
    }
  },

  clearAuthSession: () => {
    localStorage.removeItem(STORAGE_KEYS.SESSION_TOKEN);
    const randomSuffix =
      typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID().replace(/-/g, '').substring(0, 16)
        : Math.random().toString(36).substring(2, 10) + Date.now().toString(36);
    localStorage.setItem(STORAGE_KEYS.TENANT_ID, `guest_${randomSuffix}`);
  },

  getCurrentTenantId: (): string => getClientTenantId(),

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
    const token = typeof window !== 'undefined' ? localStorage.getItem(STORAGE_KEYS.SESSION_TOKEN) : null;
    if (!token) {
      return null;
    }
    try {
      const res = await api.get('/auth/github/user');
      return res.data.user;
    } catch {
      localStorage.removeItem(STORAGE_KEYS.SESSION_TOKEN);
      return null;
    }
  },

  getGitHubRepositories: async () => {
    const res = await api.get('/auth/github/repositories');
    return res.data.repositories;
  },

  logoutGitHub: async () => {
    try {
      await api.post('/auth/logout');
    } catch {}
    apiClient.clearAuthSession();
    return { success: true };
  },
};

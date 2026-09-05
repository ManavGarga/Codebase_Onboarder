import axios, { AxiosInstance } from 'axios';
import { config } from '../config/env';

class AiServiceClient {
  private client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: `${config.aiServiceUrl}/api/v1`,
      timeout: 120000, // 2 minutes for large AST parsing / embedding
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }

  async triggerAnalysis(payload: {
    userId: string;
    repositoryId: string;
    repoPath: string;
    repoUrl?: string;
    branch?: string;
    commit_sha?: string;
    previous_commit_sha?: string;
    is_incremental?: boolean;
    changed_files?: string[];
    added_files?: string[];
    deleted_files?: string[];
  }) {
    const res = await this.client.post('/analyze', {
      user_id: payload.userId,
      repository_id: payload.repositoryId,
      repo_path: payload.repoPath,
      repo_url: payload.repoUrl,
      branch: payload.branch || 'main',
      commit_sha: payload.commit_sha,
      previous_commit_sha: payload.previous_commit_sha,
      is_incremental: payload.is_incremental,
      changed_files: payload.changed_files,
      added_files: payload.added_files,
      deleted_files: payload.deleted_files,
    });
    return res.data;
  }

  async getGraph(repositoryId: string) {
    const res = await this.client.get(`/graph/${repositoryId}`);
    return res.data;
  }

  async getSymbols(repositoryId: string) {
    const res = await this.client.get(`/symbols/${repositoryId}`);
    return res.data;
  }

  async getRoutes(repositoryId: string) {
    const res = await this.client.get(`/routes/${repositoryId}`);
    return res.data;
  }

  async getModels(repositoryId: string) {
    const res = await this.client.get(`/models/${repositoryId}`);
    return res.data;
  }

  async queryGroundedQA(payload: {
    userId: string;
    repositoryId: string;
    query: string;
  }) {
    const res = await this.client.post('/qa', {
      user_id: payload.userId,
      repository_id: payload.repositoryId,
      query: payload.query,
    });
    return res.data;
  }

  async getRoadmap(payload: {
    repositoryId: string;
    repositoryName: string;
    repoPath?: string;
  }) {
    const res = await this.client.post('/roadmap', {
      repository_id: payload.repositoryId,
      repository_name: payload.repositoryName,
      repo_path: payload.repoPath,
    });
    return res.data;
  }

  async analyzeImpact(payload: {
    repositoryId: string;
    targetFile: string;
    targetSymbol?: string;
    diffSnippet?: string;
  }) {
    const res = await this.client.post('/impact', {
      repository_id: payload.repositoryId,
      target_file: payload.targetFile,
      target_symbol: payload.targetSymbol || '',
      diff_snippet: payload.diffSnippet || '',
    });
    return res.data;
  }

  async reviewPR(payload: {
    prDiff: string;
    prTitle?: string;
  }) {
    const res = await this.client.post('/pr-review', {
      pr_diff: payload.prDiff,
      pr_title: payload.prTitle,
    });
    return res.data;
  }

  async runEvaluation() {
    const res = await this.client.post('/evaluation/run', {});
    return res.data;
  }

  async getEvaluationReport() {
    const res = await this.client.get('/evaluation/report/json');
    return res.data;
  }

  async getEvaluationMarkdown() {
    const res = await this.client.get('/evaluation/report/markdown');
    return res.data;
  }

  async traceExecutionFlow(payload: {
    repositoryId: string;
    query: string;
    entrypoint?: string;
  }) {
    const res = await this.client.post('/flow/trace', {
      repository_id: payload.repositoryId,
      query: payload.query,
      entrypoint: payload.entrypoint || '',
    });
    return res.data;
  }
}

export const aiServiceClient = new AiServiceClient();

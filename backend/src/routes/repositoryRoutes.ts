import { Router, Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import path from 'path';
import fs from 'fs';
import { gitService } from '../services/gitService';
import { queueService } from '../services/queueService';
import { aiServiceClient } from '../services/aiServiceClient';
import { RepositoryModel, inMemoryRepos } from '../models/Repository';
import { inMemoryJobs } from '../models/Job';
import { config } from '../config/env';
import { getDbStatus } from '../config/db';
import { ingestionRateLimiter, aiOperationRateLimiter } from '../middlewares/rateLimiter';
import { activeSessions } from './authRoutes';

const router = Router();

// Validate repository ID format to prevent traversal & injection
export const isValidRepoId = (id: string): boolean => {
  return /^[a-f0-9]{16,32}$/.test(id);
};

// Strict tenant-isolated repository lookup
export const findRepo = async (userId: string, id: string) => {
  if (!id || !isValidRepoId(id)) return null;

  // 1. Check in-memory store
  const mem = inMemoryRepos.get(id);
  if (mem) {
    // Strictly verify ownership - NEVER fall back to another tenant's repo
    return mem.userId === userId ? mem : null;
  }

  // 2. Check MongoDB store
  if (getDbStatus()) {
    try {
      const doc = await RepositoryModel.findOne({ id, userId });
      return doc ? doc.toObject() : null;
    } catch {}
  }

  return null;
};

/**
 * POST /api/repositories
 * Ingest a public GitHub repository asynchronously.
 * Protected by SSRF validation and ingestion rate limiter.
 */
router.post('/', ingestionRateLimiter, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { url, branch = 'main' } = req.body;
    if (!url || typeof url !== 'string') {
      return res.status(400).json({ success: false, error: 'Repository URL is required and must be a string.' });
    }

    // SSRF, protocol, domain, and DNS resolution validation
    const { owner, name, normalizedUrl } = await gitService.validateAndParseGithubUrl(url);
    const sanitizedBranch = gitService.sanitizeBranch(branch);

    const repoId = crypto.createHash('md5').update(`${req.userId}:${owner}/${name}`).digest('hex').substring(0, 16);
    const jobId = `job_${Date.now()}_${repoId}`;
    const localPath = path.resolve(config.repoStoragePath, `${req.userId}_${repoId}`);

    const repoData = {
      id: repoId,
      userId: req.userId,
      name,
      owner,
      url: normalizedUrl,
      branch: sanitizedBranch,
      status: 'QUEUED' as const,
      progress: 5,
      stageMessage: 'Job queued for processing',
      localPath,
      languages: {},
      frameworks: [],
      stats: {
        totalFiles: 0,
        totalSymbols: 0,
        totalRoutes: 0,
        totalModels: 0,
        totalChunks: 0,
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    inMemoryRepos.set(repoId, repoData);

    if (getDbStatus()) {
      try {
        await RepositoryModel.findOneAndUpdate({ id: repoId, userId: req.userId }, repoData, { upsert: true });
      } catch {}
    }

    // Extract OAuth access token if available
    const sessionToken = (req.headers['authorization'] || '').replace(/^Bearer\s+/, '');
    const session = activeSessions.get(sessionToken);
    const accessToken = req.body.accessToken || session?.accessToken;

    // Enqueue background processing
    await queueService.enqueueIngestion({
      jobId,
      repositoryId: repoId,
      userId: req.userId,
      url: normalizedUrl,
      branch: sanitizedBranch,
      accessToken,
    });

    res.status(202).json({
      success: true,
      repositoryId: repoId,
      jobId,
      message: 'Repository ingestion queued.',
      repository: repoData,
    });
  } catch (err: any) {
    if (err.message && (err.message.includes('SSRF') || err.message.includes('Unauthorized') || err.message.includes('Forbidden') || err.message.includes('Invalid'))) {
      return res.status(400).json({ success: false, error: err.message });
    }
    next(err);
  }
});

/**
 * GET /api/repositories
 * List repositories for authenticated user tenant only.
 */
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const repos: any[] = [];
    inMemoryRepos.forEach((r) => {
      if (r.userId === req.userId) repos.push(r);
    });

    if (getDbStatus()) {
      try {
        const dbRepos = await RepositoryModel.find({ userId: req.userId }).sort({ updatedAt: -1 });
        for (const d of dbRepos) {
          if (!repos.find((r) => r.id === d.id)) {
            repos.push(d.toObject());
          }
        }
      } catch {}
    }

    res.json({ success: true, count: repos.length, repositories: repos });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/repositories/evaluation/run
 */
router.post('/evaluation/run', aiOperationRateLimiter, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await aiServiceClient.runEvaluation();
    res.json({ success: true, ...data });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/repositories/evaluation/report
 */
router.get('/evaluation/report', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await aiServiceClient.getEvaluationReport();
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/repositories/evaluation/markdown
 */
router.get('/evaluation/markdown', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await aiServiceClient.getEvaluationMarkdown();
    res.json({ success: true, ...data });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/repositories/:id
 */
router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!isValidRepoId(req.params.id)) {
      return res.status(400).json({ success: false, error: 'Invalid repository ID format.' });
    }
    const repo = await findRepo(req.userId, req.params.id);
    if (!repo) {
      return res.status(404).json({ success: false, error: 'Repository not found or access denied.' });
    }
    res.json({ success: true, repository: repo });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/repositories/:id/status
 * Poll real-time ingestion status and job logs for tenant's repo.
 */
router.get('/:id/status', async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!isValidRepoId(req.params.id)) {
      return res.status(400).json({ success: false, error: 'Invalid repository ID format.' });
    }
    const repo = await findRepo(req.userId, req.params.id);
    if (!repo) {
      return res.status(404).json({ success: false, error: 'Repository not found or access denied.' });
    }

    let job: any = null;
    inMemoryJobs.forEach((j) => {
      if (j.repositoryId === req.params.id && j.userId === req.userId) job = j;
    });

    res.json({
      success: true,
      status: repo.status,
      progress: repo.progress,
      stageMessage: repo.stageMessage,
      error: repo.error,
      logs: job?.logs || [],
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/repositories/:id/file-tree
 */
router.get('/:id/file-tree', async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!isValidRepoId(req.params.id)) {
      return res.status(400).json({ success: false, error: 'Invalid repository ID format.' });
    }
    const repo = await findRepo(req.userId, req.params.id);
    if (!repo) {
      return res.status(404).json({ success: false, error: 'Repository not found or access denied.' });
    }

    const tree = gitService.buildFileTree(repo.localPath);
    res.json({ success: true, tree });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/repositories/:id/file-content?path=src/index.ts
 */
router.get('/:id/file-content', async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!isValidRepoId(req.params.id)) {
      return res.status(400).json({ success: false, error: 'Invalid repository ID format.' });
    }
    const filePath = req.query.path as string;
    if (!filePath) {
      return res.status(400).json({ success: false, error: 'File path query param is required.' });
    }

    const repo = await findRepo(req.userId, req.params.id);
    if (!repo) {
      return res.status(404).json({ success: false, error: 'Repository not found or access denied.' });
    }

    const { content, totalLines } = gitService.readFileContent(repo.localPath, filePath);
    res.json({
      success: true,
      filePath,
      totalLines,
      content,
    });
  } catch (err: any) {
    if (err.message && (err.message.includes('Access denied') || err.message.includes('too large'))) {
      return res.status(403).json({ success: false, error: err.message });
    }
    if (err.message && err.message.includes('File not found')) {
      return res.status(404).json({ success: false, error: err.message });
    }
    next(err);
  }
});

/**
 * GET /api/repositories/:id/file?path=src/index.ts (Alias for file-content)
 */
router.get('/:id/file', async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!isValidRepoId(req.params.id)) {
      return res.status(400).json({ success: false, error: 'Invalid repository ID format.' });
    }
    const filePath = req.query.path as string;
    if (!filePath) {
      return res.status(400).json({ success: false, error: 'File path query param is required.' });
    }

    const repo = await findRepo(req.userId, req.params.id);
    if (!repo) {
      return res.status(404).json({ success: false, error: 'Repository not found or access denied.' });
    }

    const { content, totalLines } = gitService.readFileContent(repo.localPath, filePath);
    res.json({
      success: true,
      filePath,
      totalLines,
      content,
    });
  } catch (err: any) {
    if (err.message && (err.message.includes('Access denied') || err.message.includes('too large'))) {
      return res.status(403).json({ success: false, error: err.message });
    }
    if (err.message && err.message.includes('File not found')) {
      return res.status(404).json({ success: false, error: err.message });
    }
    next(err);
  }
});

/**
 * GET /api/repositories/:id/graph
 * Tenant-isolated knowledge graph fetch
 */
router.get('/:id/graph', async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!isValidRepoId(req.params.id)) {
      return res.status(400).json({ success: false, error: 'Invalid repository ID format.' });
    }
    const repo = await findRepo(req.userId, req.params.id);
    if (!repo) {
      return res.status(404).json({ success: false, error: 'Repository not found or access denied.' });
    }

    const graphData = await aiServiceClient.getGraph(req.params.id);
    res.json({ success: true, graph: graphData });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/repositories/:id/symbols
 */
router.get('/:id/symbols', async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!isValidRepoId(req.params.id)) {
      return res.status(400).json({ success: false, error: 'Invalid repository ID format.' });
    }
    const repo = await findRepo(req.userId, req.params.id);
    if (!repo) {
      return res.status(404).json({ success: false, error: 'Repository not found or access denied.' });
    }

    const symbols = await aiServiceClient.getSymbols(req.params.id);
    res.json({ success: true, symbols });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/repositories/:id/routes
 */
router.get('/:id/routes', async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!isValidRepoId(req.params.id)) {
      return res.status(400).json({ success: false, error: 'Invalid repository ID format.' });
    }
    const repo = await findRepo(req.userId, req.params.id);
    if (!repo) {
      return res.status(404).json({ success: false, error: 'Repository not found or access denied.' });
    }

    const routes = await aiServiceClient.getRoutes(req.params.id);
    res.json({ success: true, routes });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/repositories/:id/models
 */
router.get('/:id/models', async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!isValidRepoId(req.params.id)) {
      return res.status(400).json({ success: false, error: 'Invalid repository ID format.' });
    }
    const repo = await findRepo(req.userId, req.params.id);
    if (!repo) {
      return res.status(404).json({ success: false, error: 'Repository not found or access denied.' });
    }

    const models = await aiServiceClient.getModels(req.params.id);
    res.json({ success: true, models });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/repositories/:id/qa
 * Grounded Code QA with exact line-level citations.
 */
router.post('/:id/qa', aiOperationRateLimiter, async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!isValidRepoId(req.params.id)) {
      return res.status(400).json({ success: false, error: 'Invalid repository ID format.' });
    }
    const repo = await findRepo(req.userId, req.params.id);
    if (!repo) {
      return res.status(404).json({ success: false, error: 'Repository not found or access denied.' });
    }

    const { query } = req.body;
    if (!query || typeof query !== 'string') {
      return res.status(400).json({ success: false, error: 'Query is required and must be a string.' });
    }

    // Protect against prompt injection / oversized query payloads
    if (query.length > 2000) {
      return res.status(400).json({ success: false, error: 'Query exceeds maximum allowed length (2,000 characters).' });
    }

    const answer = await aiServiceClient.queryGroundedQA({
      userId: req.userId,
      repositoryId: req.params.id,
      query: query.trim(),
    });

    res.json({ success: true, data: answer });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/repositories/:id/roadmap
 */
router.get('/:id/roadmap', aiOperationRateLimiter, async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!isValidRepoId(req.params.id)) {
      return res.status(400).json({ success: false, error: 'Invalid repository ID format.' });
    }
    const repo = await findRepo(req.userId, req.params.id);
    if (!repo) {
      return res.status(404).json({ success: false, error: 'Repository not found or access denied.' });
    }

    const roadmap = await aiServiceClient.getRoadmap({
      repositoryId: req.params.id,
      repositoryName: repo.name || req.params.id,
      repoPath: repo.localPath,
    });

    res.json({ success: true, roadmap });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/repositories/:id/impact
 */
router.post('/:id/impact', aiOperationRateLimiter, async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!isValidRepoId(req.params.id)) {
      return res.status(400).json({ success: false, error: 'Invalid repository ID format.' });
    }
    const repo = await findRepo(req.userId, req.params.id);
    if (!repo) {
      return res.status(404).json({ success: false, error: 'Repository not found or access denied.' });
    }

    const { targetFile, targetSymbol, diffSnippet } = req.body;
    if (!targetFile) {
      return res.status(400).json({ success: false, error: 'targetFile is required.' });
    }

    const impact = await aiServiceClient.analyzeImpact({
      repositoryId: req.params.id,
      targetFile,
      targetSymbol,
      diffSnippet,
    });

    res.json({ success: true, impact });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/repositories/:id/pr-analysis
 */
router.post('/:id/pr-analysis', aiOperationRateLimiter, async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!isValidRepoId(req.params.id)) {
      return res.status(400).json({ success: false, error: 'Invalid repository ID format.' });
    }
    const repo = await findRepo(req.userId, req.params.id);
    if (!repo) {
      return res.status(404).json({ success: false, error: 'Repository not found or access denied.' });
    }

    const { prDiff, prTitle } = req.body;
    if (!prDiff) {
      return res.status(400).json({ success: false, error: 'prDiff is required.' });
    }

    const review = await aiServiceClient.reviewPR({
      prDiff,
      prTitle,
    });

    res.json({ success: true, review });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/repositories/:id/flow
 * Intelligent execution flow discovery from user intent / query
 */
router.post('/:id/flow', aiOperationRateLimiter, async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!isValidRepoId(req.params.id)) {
      return res.status(400).json({ success: false, error: 'Invalid repository ID format.' });
    }
    const repo = await findRepo(req.userId, req.params.id);
    if (!repo) {
      return res.status(404).json({ success: false, error: 'Repository not found or access denied.' });
    }

    const { query, entrypoint } = req.body;
    if (!query || typeof query !== 'string') {
      return res.status(400).json({ success: false, error: 'query string is required.' });
    }

    const flow = await aiServiceClient.traceExecutionFlow({
      repositoryId: req.params.id,
      query: query.trim(),
      entrypoint: entrypoint?.trim(),
    });

    res.json({ success: true, flow });
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /api/repositories/:id
 */
router.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!isValidRepoId(req.params.id)) {
      return res.status(400).json({ success: false, error: 'Invalid repository ID format.' });
    }
    const repo = await findRepo(req.userId, req.params.id);
    if (!repo) {
      return res.status(404).json({ success: false, error: 'Repository not found or access denied.' });
    }

    // Clean up local files safely
    if (fs.existsSync(repo.localPath)) {
      fs.rmSync(repo.localPath, { recursive: true, force: true });
    }

    inMemoryRepos.delete(req.params.id);
    try {
      await RepositoryModel.deleteOne({ id: req.params.id, userId: req.userId });
    } catch {}

    res.json({ success: true, message: 'Repository deleted successfully.' });
  } catch (err) {
    next(err);
  }
});

export default router;

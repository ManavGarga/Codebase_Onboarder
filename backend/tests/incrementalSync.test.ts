import fs from 'fs';
import path from 'path';
import os from 'os';
import { execFile } from 'child_process';
import util from 'util';
import { gitService } from '../src/services/gitService';
import { aiServiceClient } from '../src/services/aiServiceClient';
import { queueService } from '../src/services/queueService';
import { inMemoryRepos } from '../src/models/Repository';
import { inMemoryJobs } from '../src/models/Job';

const execFileAsync = util.promisify(execFile);

describe('Incremental Repository Indexing - Backend Suite', () => {
  let tempRepoPath: string;

  beforeAll(async () => {
    tempRepoPath = fs.mkdtempSync(path.join(os.tmpdir(), 'git-sync-test-'));
    // Initialize a mock git repository with 2 commits
    await execFileAsync('git', ['init'], { cwd: tempRepoPath });
    await execFileAsync('git', ['config', 'user.email', 'test@test.com'], { cwd: tempRepoPath });
    await execFileAsync('git', ['config', 'user.name', 'Test User'], { cwd: tempRepoPath });

    fs.writeFileSync(path.join(tempRepoPath, 'index.ts'), 'console.log("hello");');
    await execFileAsync('git', ['add', '.'], { cwd: tempRepoPath });
    await execFileAsync('git', ['commit', '-m', 'commit 1'], { cwd: tempRepoPath });
  });

  afterAll(() => {
    try {
      fs.rmSync(tempRepoPath, { recursive: true, force: true });
    } catch {}
  });

  it('resolves latest commit SHA accurately using git rev-parse HEAD', async () => {
    const sha = await gitService.getCommitSha(tempRepoPath);
    expect(sha).toBeDefined();
    expect(sha.length).toBe(40);
    expect(/^[a-f0-9]{40}$/.test(sha)).toBe(true);
  });

  it('detects existing checkout and returns isIncremental: true', async () => {
    const syncRes = await gitService.syncRepository(
      'https://github.com/expressjs/express',
      tempRepoPath,
      'main'
    );

    expect(syncRes.isIncremental).toBe(true);
    expect(syncRes.newCommit).toBeDefined();
    expect(syncRes.newCommit.length).toBe(40);
  });

  it('processes incremental job and records incremental metrics on repository', async () => {
    const repoId = 'abcdef1234567890';
    const userId = 'dev_user_inc';
    const jobId = `job_inc_${Date.now()}`;

    inMemoryRepos.set(repoId, {
      id: repoId,
      userId,
      name: 'express',
      owner: 'expressjs',
      url: 'https://github.com/expressjs/express',
      branch: 'main',
      status: 'QUEUED',
      progress: 5,
      stageMessage: 'Queued',
      localPath: tempRepoPath,
      languages: {},
      frameworks: [],
      stats: { totalFiles: 1, totalSymbols: 1, totalRoutes: 0, totalModels: 0, totalChunks: 1 },
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // Mock AI service to return incremental response
    jest.spyOn(aiServiceClient, 'triggerAnalysis').mockResolvedValue({
      success: true,
      repository_id: repoId,
      total_files_analyzed: 10,
      total_symbols_extracted: 25,
      total_routes_detected: 4,
      total_models_detected: 2,
      total_chunks_indexed: 30,
      languages_detected: { typescript: 10 },
      frameworks_detected: ['Express'],
      processing_time_sec: 0.05,
      is_incremental: true,
      total_files: 10,
      changed_files: 0,
      added_files: 0,
      deleted_files: 0,
      skipped_files: 10,
      embeddings_regenerated: 0,
      affected_downstream_files: [],
    });

    // Mock gitService.syncRepository to return mock diff
    jest.spyOn(gitService, 'syncRepository').mockResolvedValue({
      oldCommit: '1111111111111111111111111111111111111111',
      newCommit: '1111111111111111111111111111111111111111',
      isIncremental: true,
      changedFiles: [],
      addedFiles: [],
      deletedFiles: [],
    });

    // Enqueue
    await queueService.enqueueIngestion({
      jobId,
      repositoryId: repoId,
      userId,
      url: 'https://github.com/expressjs/express',
      branch: 'main',
    });

    // Allow setImmediate worker to run
    await new Promise((r) => setTimeout(r, 200));

    const updatedRepo = inMemoryRepos.get(repoId);
    expect(updatedRepo.status).toBe('READY');
    expect(updatedRepo.incrementalStats).toBeDefined();
    expect(updatedRepo.incrementalStats.isIncremental).toBe(true);
    expect(updatedRepo.incrementalStats.skippedFiles).toBe(10);
    expect(updatedRepo.incrementalStats.embeddingsRegenerated).toBe(0);
    expect(updatedRepo.stageMessage).toContain('Incremental sync complete');
  });
});

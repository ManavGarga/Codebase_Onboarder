import path from 'path';
import fs from 'fs';
import { gitService } from './gitService';
import { aiServiceClient } from './aiServiceClient';
import { config } from '../config/env';
import { RepositoryModel, inMemoryRepos, IngestionStatus } from '../models/Repository';
import { inMemoryJobs, IngestionJob } from '../models/Job';
import { getRedisClient, getRedisStatus } from '../config/redis';
import { getDbStatus } from '../config/db';

export class QueueService {
  private queueKey = 'queue:repo_ingestion';

  async enqueueIngestion(data: {
    jobId: string;
    repositoryId: string;
    userId: string;
    url: string;
    branch?: string;
    accessToken?: string;
  }): Promise<void> {
    const job: IngestionJob = {
      jobId: data.jobId,
      repositoryId: data.repositoryId,
      userId: data.userId,
      url: data.url,
      branch: data.branch || 'main',
      accessToken: data.accessToken,
      stage: 'QUEUED',
      progress: 5,
      logs: [
        {
          timestamp: new Date().toISOString(),
          stage: 'QUEUED',
          message: `Ingestion job created for ${data.url}`,
        },
      ],
    };

    inMemoryJobs.set(data.jobId, job);

    // If Redis is online, push to Redis queue; also trigger worker asynchronously
    if (getRedisStatus()) {
      try {
        const client = getRedisClient();
        await client.lpush(this.queueKey, JSON.stringify(job));
      } catch (err) {
        console.warn('[QueueService] Failed to push to Redis queue, running in-memory worker:', err);
      }
    }

    // Process asynchronously without blocking HTTP response
    setImmediate(() => {
      this.processJob(job).catch((err) => {
        console.error(`[QueueService] Job ${data.jobId} unhandled error:`, err);
      });
    });
  }

  private async updateJobProgress(jobId: string, repoId: string, stage: IngestionStatus, progress: number, message: string) {
    const job = inMemoryJobs.get(jobId);
    if (job) {
      job.stage = stage;
      job.progress = progress;
      job.logs.push({
        timestamp: new Date().toISOString(),
        stage,
        message,
      });
    }

    // Update in-memory repo
    const memRepo = inMemoryRepos.get(repoId);
    if (memRepo) {
      memRepo.status = stage;
      memRepo.progress = progress;
      memRepo.stageMessage = message;
    }

    // Update MongoDB if connected
    if (getDbStatus()) {
      try {
        await RepositoryModel.findOneAndUpdate(
          { id: repoId },
          {
            status: stage,
            progress,
            stageMessage: message,
          }
        );
      } catch {
        // Ignored if DB offline
      }
    }
  }

  private async processJob(job: IngestionJob): Promise<void> {
    const repoId = job.repositoryId;
    const targetPath = path.resolve(config.repoStoragePath, `${job.userId}_${repoId}`);

    try {
      // 1. Stage: CLONING / SYNCING
      const isExistingCheckout = fs.existsSync(path.join(targetPath, '.git'));
      await this.updateJobProgress(
        job.jobId,
        repoId,
        'CLONING',
        20,
        isExistingCheckout
          ? `Fetching latest commits and diffing changes for ${job.url}...`
          : `Cloning repository ${job.url}...`
      );

      const syncResult = await gitService.syncRepository(job.url, targetPath, job.branch, job.accessToken);

      // 2. Stage: PARSING_AST
      await this.updateJobProgress(
        job.jobId,
        repoId,
        'PARSING_AST',
        40,
        syncResult.isIncremental
          ? `Parsing affected files with Tree-sitter AST engine...`
          : 'Parsing code with Tree-sitter AST engine...'
      );

      // 3. Stage: BUILDING_GRAPH, CHUNKING, EMBEDDING & INDEXING
      await this.updateJobProgress(
        job.jobId,
        repoId,
        'BUILDING_GRAPH',
        60,
        'Extracting symbols, routes, models, and updating Knowledge Graph...'
      );

      const analysisResult = await aiServiceClient.triggerAnalysis({
        userId: job.userId,
        repositoryId: repoId,
        repoPath: targetPath,
        repoUrl: job.url,
        branch: job.branch,
        commit_sha: syncResult.newCommit,
        previous_commit_sha: syncResult.oldCommit,
        is_incremental: syncResult.isIncremental,
        changed_files: syncResult.changedFiles,
        added_files: syncResult.addedFiles,
        deleted_files: syncResult.deletedFiles,
      });

      // 4. Stage: INDEXING
      await this.updateJobProgress(
        job.jobId,
        repoId,
        'INDEXING',
        85,
        analysisResult.is_incremental
          ? `Incremental index complete: ${analysisResult.skipped_files} skipped, ${analysisResult.embeddings_regenerated} embeddings regenerated.`
          : `Indexed ${analysisResult.total_chunks_indexed} code chunks in Qdrant.`
      );

      // 5. Stage: READY
      const summaryMsg = analysisResult.is_incremental
        ? `Incremental sync complete: ${analysisResult.total_files || analysisResult.total_files_analyzed} files (${analysisResult.changed_files} changed, ${analysisResult.added_files} added, ${analysisResult.skipped_files} skipped).`
        : `Successfully onboarded repository: ${analysisResult.total_files_analyzed} files, ${analysisResult.total_symbols_extracted} symbols, ${analysisResult.total_routes_detected} routes.`;

      await this.updateJobProgress(job.jobId, repoId, 'READY', 100, summaryMsg);

      // Update final repo details
      const updateData = {
        status: 'READY' as IngestionStatus,
        progress: 100,
        stageMessage: summaryMsg,
        languages: analysisResult.languages_detected || {},
        frameworks: analysisResult.frameworks_detected || [],
        stats: {
          totalFiles: analysisResult.total_files || analysisResult.total_files_analyzed,
          totalSymbols: analysisResult.total_symbols_extracted,
          totalRoutes: analysisResult.total_routes_detected,
          totalModels: analysisResult.total_models_detected,
          totalChunks: analysisResult.total_chunks_indexed,
        },
        commitSha: syncResult.newCommit,
        lastIndexedCommitSha: syncResult.newCommit,
        incrementalStats: {
          isIncremental: !!analysisResult.is_incremental,
          changedFiles: analysisResult.changed_files || 0,
          addedFiles: analysisResult.added_files || 0,
          deletedFiles: analysisResult.deleted_files || 0,
          skippedFiles: analysisResult.skipped_files || 0,
          embeddingsRegenerated: analysisResult.embeddings_regenerated || 0,
          indexingTimeSec: analysisResult.processing_time_sec || 0,
        },
      };

      const memRepo = inMemoryRepos.get(repoId);
      if (memRepo) {
        Object.assign(memRepo, updateData);
      }

      try {
        await RepositoryModel.findOneAndUpdate({ id: repoId }, updateData);
      } catch {}

      job.completedAt = new Date().toISOString();
      console.log(`[QueueService] Job ${job.jobId} completed successfully.`);
    } catch (error: any) {
      console.error(`[QueueService] Job ${job.jobId} failed:`, error);
      const errMsg = error?.response?.data?.detail || error.message || 'Unknown processing error';

      job.stage = 'FAILED';
      job.error = errMsg;
      job.logs.push({
        timestamp: new Date().toISOString(),
        stage: 'FAILED',
        message: `Failed: ${errMsg}`,
      });

      const memRepo = inMemoryRepos.get(repoId);
      if (memRepo) {
        memRepo.status = 'FAILED';
        memRepo.error = errMsg;
        memRepo.stageMessage = errMsg;
      }

      try {
        await RepositoryModel.findOneAndUpdate(
          { id: repoId },
          {
            status: 'FAILED',
            error: errMsg,
            stageMessage: errMsg,
          }
        );
      } catch {}
    }
  }

  getJob(jobId: string): IngestionJob | undefined {
    return inMemoryJobs.get(jobId);
  }
}

export const queueService = new QueueService();

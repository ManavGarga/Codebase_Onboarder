import request from 'supertest';
import { createApp } from '../src/app';
import { gitService } from '../src/services/gitService';
import { aiServiceClient } from '../src/services/aiServiceClient';
import fs from 'fs';
import path from 'path';

describe('Backend API & Repository Routes', () => {
  const app = createApp();

  describe('GET /health', () => {
    it('returns healthy status', async () => {
      const res = await request(app).get('/health');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('healthy');
      expect(res.body.service).toBe('codebase-onboarder-backend');
    });
  });

  describe('GitService URL Parser', () => {
    it('parses valid GitHub URLs', () => {
      const parsed1 = gitService.parseGithubUrl('https://github.com/expressjs/express');
      expect(parsed1.owner).toBe('expressjs');
      expect(parsed1.name).toBe('express');

      const parsed2 = gitService.parseGithubUrl('https://github.com/tiangolo/fastapi.git');
      expect(parsed2.owner).toBe('tiangolo');
      expect(parsed2.name).toBe('fastapi');
    });

    it('throws on invalid GitHub URLs', () => {
      expect(() => gitService.parseGithubUrl('https://gitlab.com/owner/repo')).toThrow();
      expect(() => gitService.parseGithubUrl('not-a-url')).toThrow();
    });
  });

  describe('POST /api/repositories', () => {
    it('rejects request with missing url', async () => {
      const res = await request(app).post('/api/repositories').send({});
      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('rejects invalid GitHub url', async () => {
      const res = await request(app).post('/api/repositories').send({ url: 'https://google.com' });
      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('accepts valid GitHub url and queues ingestion', async () => {
      jest.spyOn(gitService, 'cloneRepository').mockResolvedValue(undefined);
      jest.spyOn(aiServiceClient, 'triggerAnalysis').mockResolvedValue({
        success: true,
        total_files_analyzed: 5,
        total_symbols_extracted: 10,
        total_routes_detected: 2,
        total_models_detected: 1,
        total_chunks_indexed: 15,
        languages_detected: { typescript: 5 },
        frameworks_detected: ['Express'],
        processing_time_sec: 0.1,
      });
      const res = await request(app)
        .post('/api/repositories')
        .set('x-user-id', 'test_user_unit')
        .send({ url: 'https://github.com/expressjs/express' });

      expect(res.status).toBe(202);
      expect(res.body.success).toBe(true);
      expect(res.body.repositoryId).toBeDefined();
      expect(res.body.jobId).toBeDefined();
    });
  });

  describe('File Tree and Traversal Protection', () => {
    const testDir = path.join(__dirname, 'mock_repo');

    beforeAll(() => {
      fs.mkdirSync(path.join(testDir, 'src'), { recursive: true });
      fs.writeFileSync(path.join(testDir, 'src', 'index.ts'), 'export const hello = "world";');
      fs.writeFileSync(path.join(testDir, 'README.md'), '# Mock Repo');
    });

    afterAll(() => {
      fs.rmSync(testDir, { recursive: true, force: true });
    });

    it('builds recursive file tree correctly', () => {
      const tree = gitService.buildFileTree(testDir);
      expect(tree.length).toBeGreaterThan(0);
      const srcDir = tree.find((t) => t.name === 'src');
      expect(srcDir).toBeDefined();
      expect(srcDir?.children).toBeDefined();
      expect(srcDir?.children?.length).toBe(1);
    });

    it('reads file content accurately', () => {
      const res = gitService.readFileContent(testDir, 'src/index.ts');
      expect(res.content).toContain('hello = "world"');
      expect(res.totalLines).toBe(1);
    });

    it('prevents directory traversal', () => {
      expect(() => {
        gitService.readFileContent(testDir, '../../package.json');
      }).toThrow('Access denied: path traversal detected.');
    });
  });
});

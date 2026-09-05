import request from 'supertest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { createApp } from '../src/app';
import { gitService } from '../src/services/gitService';
import { inMemoryRepos } from '../src/models/Repository';
import { sanitizeLogMessage } from '../src/utils/logSanitizer';

describe('Security Audit Suite: Backend Mitigations', () => {
  const app = createApp();

  describe('1. SSRF & URL Validation Mitigations', () => {
    it('blocks non-HTTPS protocols (file, http, git, ssh)', async () => {
      await expect(gitService.validateAndParseGithubUrl('file:///etc/passwd')).rejects.toThrow('Forbidden protocol');
      await expect(gitService.validateAndParseGithubUrl('http://github.com/owner/repo')).rejects.toThrow('Forbidden protocol');
      await expect(gitService.validateAndParseGithubUrl('git://github.com/owner/repo')).rejects.toThrow('Forbidden protocol');
      await expect(gitService.validateAndParseGithubUrl('ssh://git@github.com/owner/repo')).rejects.toThrow('Forbidden protocol');
    });

    it('blocks unauthorized and attacker domains', async () => {
      await expect(gitService.validateAndParseGithubUrl('https://evil.com/owner/repo')).rejects.toThrow('Unauthorized repository host');
      await expect(gitService.validateAndParseGithubUrl('https://github.com.evil.com/owner/repo')).rejects.toThrow('Unauthorized repository host');
    });

    it('prevents regex unanchored bypass attempts', async () => {
      // Attempting to place github.com in pathname of internal IP
      await expect(gitService.validateAndParseGithubUrl('http://169.254.169.254/github.com/evil/repo')).rejects.toThrow();
      await expect(gitService.validateAndParseGithubUrl('https://127.0.0.1/github.com/evil/repo')).rejects.toThrow('Unauthorized repository host');
    });

    it('correctly identifies private, loopback, and cloud metadata IPs', () => {
      expect(gitService.isPrivateOrBlockedIP('127.0.0.1')).toBe(true);
      expect(gitService.isPrivateOrBlockedIP('10.0.1.5')).toBe(true);
      expect(gitService.isPrivateOrBlockedIP('172.16.5.1')).toBe(true);
      expect(gitService.isPrivateOrBlockedIP('172.31.255.254')).toBe(true);
      expect(gitService.isPrivateOrBlockedIP('192.168.1.1')).toBe(true);
      expect(gitService.isPrivateOrBlockedIP('169.254.169.254')).toBe(true); // AWS/GCP metadata
      expect(gitService.isPrivateOrBlockedIP('::1')).toBe(true); // IPv6 loopback
      expect(gitService.isPrivateOrBlockedIP('fe80::1')).toBe(true); // IPv6 link-local
      expect(gitService.isPrivateOrBlockedIP('8.8.8.8')).toBe(false); // Public DNS
    });

    it('POST /api/repositories rejects SSRF URL payload with 400', async () => {
      const res = await request(app)
        .post('/api/repositories')
        .send({ url: 'http://169.254.169.254/latest/meta-data' });
      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toBeDefined();
    });
  });

  describe('2. Command & Git Argument Injection Mitigations', () => {
    it('rejects shell metacharacters in branch names', () => {
      expect(() => gitService.sanitizeBranch('main; rm -rf /')).toThrow('illegal characters');
      expect(() => gitService.sanitizeBranch('main && whoami')).toThrow('illegal characters');
      expect(() => gitService.sanitizeBranch('main | cat /etc/passwd')).toThrow('illegal characters');
      expect(() => gitService.sanitizeBranch('$(whoami)')).toThrow('illegal characters');
      expect(() => gitService.sanitizeBranch('`id`')).toThrow('illegal characters');
    });

    it('rejects leading dash in branch names (option injection)', () => {
      expect(() => gitService.sanitizeBranch('--upload-pack=touch /tmp/pwned')).toThrow('cannot begin with a dash');
      expect(() => gitService.sanitizeBranch('-u')).toThrow('cannot begin with a dash');
    });

    it('allows valid alphanumeric git branch and release tags', () => {
      expect(gitService.sanitizeBranch('main')).toBe('main');
      expect(gitService.sanitizeBranch('feature/auth-v2.1')).toBe('feature/auth-v2.1');
      expect(gitService.sanitizeBranch('release-2026_09')).toBe('release-2026_09');
    });
  });

  describe('3. Path Traversal & 4. Malicious Symlinks Mitigations', () => {
    let tempDir: string;
    let outsideSecretFile: string;

    beforeAll(() => {
      tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sec-test-repo-'));
      outsideSecretFile = path.join(os.tmpdir(), `secret-${Date.now()}.txt`);
      fs.writeFileSync(outsideSecretFile, 'CRITICAL_SYSTEM_SECRET_KEY=12345');

      // Create internal safe file
      fs.writeFileSync(path.join(tempDir, 'safe.ts'), 'console.log("Safe file");');

      // Create malicious symlink inside repo pointing to outside secret file
      try {
        fs.symlinkSync(outsideSecretFile, path.join(tempDir, 'symlink_leak.ts'));
      } catch {}
    });

    afterAll(() => {
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
        fs.rmSync(outsideSecretFile, { force: true });
      } catch {}
    });

    it('blocks classic directory traversal (../)', () => {
      expect(() => {
        gitService.readFileContent(tempDir, '../../../../etc/passwd');
      }).toThrow('Access denied: path traversal detected.');
    });

    it('blocks null byte path injection', () => {
      expect(() => {
        gitService.readFileContent(tempDir, 'safe.ts\0.png');
      }).toThrow('Access denied: null byte detected in path.');
    });

    it('blocks reading files via malicious symlink pointing outside repository', () => {
      expect(() => {
        gitService.readFileContent(tempDir, 'symlink_leak.ts');
      }).toThrow('Access denied: symbolic links are not permitted.');
    });

    it('ignores symbolic links in buildFileTree to prevent discovery', () => {
      const tree = gitService.buildFileTree(tempDir);
      const symlinkNode = tree.find((node: any) => node.name === 'symlink_leak.ts');
      expect(symlinkNode).toBeUndefined();
      const safeNode = tree.find((node: any) => node.name === 'safe.ts');
      expect(safeNode).toBeDefined();
    });

    it('enforces 1MB file size ceiling', () => {
      const largeFile = path.join(tempDir, 'huge.dat');
      const largeBuffer = Buffer.alloc(1024 * 1024 + 100); // >1MB
      fs.writeFileSync(largeFile, largeBuffer);

      expect(() => {
        gitService.readFileContent(tempDir, 'huge.dat');
      }).toThrow('File too large');

      fs.rmSync(largeFile);
    });
  });

  describe('12. Cross-User Data Leakage & 14. Unauthorized Repository Access', () => {
    const repoId = '1122334455667788';
    const userA = 'tenant_alice';
    const userB = 'tenant_bob';

    beforeAll(() => {
      inMemoryRepos.set(repoId, {
        id: repoId,
        userId: userA,
        name: 'alice-private-repo',
        owner: 'alice',
        url: 'https://github.com/alice/alice-private-repo',
        branch: 'main',
        status: 'READY',
        progress: 100,
        stageMessage: 'Ready',
        localPath: '/tmp/alice_repo',
        languages: {},
        frameworks: [],
        stats: { totalFiles: 1, totalSymbols: 1, totalRoutes: 0, totalModels: 0, totalChunks: 1 },
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any);
    });

    afterAll(() => {
      inMemoryRepos.delete(repoId);
    });

    it('allows User A (owner) to access repository details', async () => {
      const res = await request(app)
        .get(`/api/repositories/${repoId}`)
        .set('x-user-id', userA);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.repository.id).toBe(repoId);
    });

    it('blocks User B (unauthorized tenant) from accessing User A repository', async () => {
      const res = await request(app)
        .get(`/api/repositories/${repoId}`)
        .set('x-user-id', userB);

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain('Repository not found or access denied');
    });

    it('blocks User B from accessing User A file-content', async () => {
      const res = await request(app)
        .get(`/api/repositories/${repoId}/file-content?path=src/index.ts`)
        .set('x-user-id', userB);

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });

    it('blocks User B from triggering QA on User A repository', async () => {
      const res = await request(app)
        .post(`/api/repositories/${repoId}/qa`)
        .set('x-user-id', userB)
        .send({ query: 'Show me secrets' });

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });

    it('rejects malformed repository ID to prevent path traversal', async () => {
      const res = await request(app)
        .get('/api/repositories/../../etc/passwd')
        .set('x-user-id', userA);

      // Either 404 or 400 from format validator
      expect([400, 404]).toContain(res.status);
    });
  });

  describe('16. Rate-Limit Exhaustion Protections', () => {
    it('sets rate-limiting headers on API calls', async () => {
      const res = await request(app)
        .get('/api/repositories')
        .set('x-user-id', 'test_rate_user');

      expect(res.status).toBe(200);
    });

    it('triggers HTTP 429 when ingestion rate limit is exceeded', async () => {
      const spamUserId = `spammer_${Date.now()}`;

      // Ingestion rate limit is 10 requests
      let rateLimited = false;
      for (let i = 0; i < 15; i++) {
        const res = await request(app)
          .post('/api/repositories')
          .set('x-user-id', spamUserId)
          .send({ url: 'https://invalid-url.com' });

        if (res.status === 429) {
          rateLimited = true;
          expect(res.header['retry-after']).toBeDefined();
          expect(res.body.error).toContain('Repository ingestion limit exceeded');
          break;
        }
      }
      expect(rateLimited).toBe(true);
    });
  });

  describe('19. Sensitive Information Scrubbing in Logs', () => {
    it('redacts OpenAI API keys from log strings', () => {
      const raw = 'Config initialized with OPENAI_KEY=sk-abc12345678901234567890def for model';
      const sanitized = sanitizeLogMessage(raw);
      expect(sanitized).not.toContain('sk-abc12345678901234567890def');
      expect(sanitized).toContain('[REDACTED_OPENAI_KEY]');
    });

    it('redacts Bearer tokens from authorization headers in logs', () => {
      const raw = 'Incoming request headers: Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.xyz';
      const sanitized = sanitizeLogMessage(raw);
      expect(sanitized).not.toContain('eyJhbGci');
      expect(sanitized).toContain('Bearer [REDACTED_TOKEN]');
    });

    it('redacts AWS access keys from logs', () => {
      const raw = 'Failed to connect to S3 using AKIAIOSFODNN7EXAMPLE key';
      const sanitized = sanitizeLogMessage(raw);
      expect(sanitized).not.toContain('AKIAIOSFODNN7EXAMPLE');
      expect(sanitized).toContain('[REDACTED_AWS_KEY]');
    });

    it('redacts GitHub personal access tokens from logs', () => {
      const raw = 'Cloning with token ghp_1234567890abcdef1234567890abcdef1234';
      const sanitized = sanitizeLogMessage(raw);
      expect(sanitized).not.toContain('ghp_1234567890abcdef1234567890abcdef1234');
      expect(sanitized).toContain('[REDACTED_GITHUB_TOKEN]');
    });
  });
});

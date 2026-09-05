import request from 'supertest';
import { createApp } from '../src/app';

const app = createApp();

describe('GitHub OAuth & Private Repository Management', () => {
  it('GET /api/auth/github/url returns authorization URL', async () => {
    const res = await request(app).get('/api/auth/github/url');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.url).toBeDefined();
    expect(typeof res.body.url).toBe('string');
  });

  it('POST /api/auth/github/callback returns authenticated user and sessionToken', async () => {
    const res = await request(app)
      .post('/api/auth/github/callback')
      .send({ code: 'demo_oauth_code', mock: true });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.sessionToken).toBeDefined();
    expect(res.body.user).toBeDefined();
    expect(res.body.user.login).toBe('octocat-engineer');
  });

  it('GET /api/auth/github/user returns current authenticated user profile', async () => {
    const res = await request(app)
      .get('/api/auth/github/user')
      .set('Authorization', 'Bearer dev_github_session_token_123');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.user.login).toBe('octocat-engineer');
  });

  it('GET /api/auth/github/repositories lists public AND private repositories', async () => {
    const res = await request(app)
      .get('/api/auth/github/repositories')
      .set('Authorization', 'Bearer dev_github_session_token_123');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.repositories)).toBe(true);
    expect(res.body.repositories.length).toBeGreaterThanOrEqual(2);

    // Verify private repositories are included
    const hasPrivate = res.body.repositories.some((r: any) => r.private === true);
    const hasPublic = res.body.repositories.some((r: any) => r.private === false);
    expect(hasPrivate).toBe(true);
    expect(hasPublic).toBe(true);
  });

  it('POST /api/auth/logout invalidates session', async () => {
    const res = await request(app)
      .post('/api/auth/logout')
      .set('Authorization', 'Bearer dev_github_session_token_123');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

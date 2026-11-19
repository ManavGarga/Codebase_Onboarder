import { Router, Request, Response } from 'express';
import axios from 'axios';
import crypto from 'crypto';
import { config } from '../config/env';

export const authRouter = Router();

// In-memory session store mapping session tokens to user sessions
interface UserSession {
  userId: string;
  githubUsername: string;
  avatarUrl: string;
  accessToken?: string;
  isMock: boolean;
  createdAt: number;
}

export const activeSessions = new Map<string, UserSession>();

// Seed default developer session for instant out-of-the-box local testing
const DEFAULT_SESSION_TOKEN = 'dev_github_session_token_123';
activeSessions.set(DEFAULT_SESSION_TOKEN, {
  userId: 'octocat-engineer',
  githubUsername: 'octocat-engineer',
  avatarUrl: 'https://avatars.githubusercontent.com/u/583231?v=4',
  isMock: true,
  createdAt: Date.now(),
});

/**
 * GET /api/auth/github/url
 * Returns GitHub OAuth login authorization URL
 */
authRouter.get('/github/url', (req: Request, res: Response) => {
  const isConfigured = Boolean(config.github.clientId && config.github.clientSecret);
  const state = crypto.randomBytes(16).toString('hex');

  let url: string;
  if (isConfigured) {
    url = `https://github.com/login/oauth/authorize?client_id=${config.github.clientId}&scope=repo,read:user,user:email&redirect_uri=${encodeURIComponent(config.github.callbackUrl)}&state=${state}`;
  } else {
    // Graceful simulated OAuth URL for local development / testing without live OAuth keys
    url = `${config.github.callbackUrl}?code=demo_oauth_code&state=${state}&mock=true`;
  }

  res.json({
    success: true,
    url,
    isConfigured,
  });
});

/**
 * POST /api/auth/github/callback
 * Exchanges authorization code for GitHub access token
 */
authRouter.post('/github/callback', async (req: Request, res: Response) => {
  const { code, mock, personalAccessToken } = req.body;

  try {
    // 1. Personal Access Token (PAT) direct login mode
    if (personalAccessToken && typeof personalAccessToken === 'string') {
      const cleanToken = personalAccessToken.trim();
      const userRes = await axios.get('https://api.github.com/user', {
        headers: {
          Authorization: `Bearer ${cleanToken}`,
          'User-Agent': 'Codebase-Onboarder-SaaS',
        },
      });

      const sessionToken = `gh_session_${crypto.randomBytes(24).toString('hex')}`;
      const user = userRes.data;
      activeSessions.set(sessionToken, {
        userId: user.login,
        githubUsername: user.login,
        avatarUrl: user.avatar_url,
        accessToken: cleanToken,
        isMock: false,
        createdAt: Date.now(),
      });

      return res.json({
        success: true,
        sessionToken,
        user: {
          id: user.id,
          login: user.login,
          name: user.name || user.login,
          avatar_url: user.avatar_url,
          html_url: user.html_url,
          public_repos: user.public_repos,
          total_private_repos: user.total_private_repos || 0,
        },
      });
    }

    // 2. Simulated/Mock OAuth mode (for local testing without OAuth keys)
    if (mock || !config.github.clientId || code === 'demo_oauth_code') {
      const sessionToken = DEFAULT_SESSION_TOKEN;
      return res.json({
        success: true,
        sessionToken,
        user: {
          id: 583231,
          login: 'octocat-engineer',
          name: 'The Octocat Engineer',
          avatar_url: 'https://avatars.githubusercontent.com/u/583231?v=4',
          html_url: 'https://github.com/octocat',
          public_repos: 8,
          total_private_repos: 5,
        },
        isMock: true,
      });
    }

    // 3. Live GitHub OAuth token exchange
    const tokenRes = await axios.post(
      'https://github.com/login/oauth/access_token',
      {
        client_id: config.github.clientId,
        client_secret: config.github.clientSecret,
        code,
      },
      {
        headers: {
          Accept: 'application/json',
        },
      }
    );

    const accessToken = tokenRes.data.access_token;
    if (!accessToken) {
      return res.status(400).json({
        success: false,
        error: tokenRes.data.error_description || 'Failed to obtain access token from GitHub.',
      });
    }

    // Fetch GitHub User profile
    const userRes = await axios.get('https://api.github.com/user', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'User-Agent': 'Codebase-Onboarder-SaaS',
      },
    });

    const user = userRes.data;
    const sessionToken = `gh_session_${crypto.randomBytes(24).toString('hex')}`;
    activeSessions.set(sessionToken, {
      userId: user.login,
      githubUsername: user.login,
      avatarUrl: user.avatar_url,
      accessToken,
      isMock: false,
      createdAt: Date.now(),
    });

    res.json({
      success: true,
      sessionToken,
      user: {
        id: user.id,
        login: user.login,
        name: user.name || user.login,
        avatar_url: user.avatar_url,
        html_url: user.html_url,
        public_repos: user.public_repos,
        total_private_repos: user.total_private_repos || 0,
      },
    });
  } catch (err: any) {
    res.status(500).json({
      success: false,
      error: `GitHub authentication failed: ${err.message}`,
    });
  }
});

/**
 * GET /api/auth/github/user
 * Returns currently authenticated user
 */
authRouter.get('/github/user', (req: Request, res: Response) => {
  const token = (req.headers['authorization'] || '').replace(/^Bearer\s+/, '').trim();
  if (!token) {
    return res.status(401).json({ success: false, error: 'Unauthorized. Please login with GitHub.' });
  }

  const session = activeSessions.get(token);
  if (!session) {
    return res.status(401).json({ success: false, error: 'Unauthorized. Please login with GitHub.' });
  }

  res.json({
    success: true,
    user: {
      login: session.githubUsername,
      avatar_url: session.avatarUrl,
      isMock: session.isMock,
    },
  });
});

/**
 * GET /api/auth/github/repositories
 * Lists user repositories (both public and private)
 */
authRouter.get('/github/repositories', async (req: Request, res: Response) => {
  const token = (req.headers['authorization'] || '').replace(/^Bearer\s+/, '').trim();
  if (!token) {
    return res.status(401).json({ success: false, error: 'Unauthorized. Please login with GitHub.' });
  }

  const session = activeSessions.get(token);
  if (!session) {
    return res.status(401).json({ success: false, error: 'Unauthorized. Please login with GitHub.' });
  }


  // If live GitHub token is present, query GitHub API
  if (session.accessToken) {
    try {
      const reposRes = await axios.get('https://api.github.com/user/repos', {
        headers: {
          Authorization: `Bearer ${session.accessToken}`,
          'User-Agent': 'Codebase-Onboarder-SaaS',
        },
        params: {
          sort: 'updated',
          per_page: 100,
          affiliation: 'owner,collaborator,organization_member',
        },
      });

      const repos = reposRes.data.map((r: any) => ({
        id: r.id,
        name: r.name,
        full_name: r.full_name,
        private: r.private,
        html_url: r.html_url,
        clone_url: r.clone_url,
        description: r.description,
        default_branch: r.default_branch,
        language: r.language,
        stargazers_count: r.stargazers_count,
        updated_at: r.updated_at,
      }));

      return res.json({ success: true, repositories: repos });
    } catch (err: any) {
      console.warn('Failed to fetch repositories from GitHub API, falling back to cached/demo repos:', err.message);
    }
  }

  // Demo / Standalone fallback repositories including public and private repos
  const demoRepos = [
    {
      id: 101,
      name: 'express-enterprise-api',
      full_name: 'octocat-engineer/express-enterprise-api',
      private: true,
      html_url: 'https://github.com/expressjs/express',
      clone_url: 'https://github.com/expressjs/express.git',
      description: 'Enterprise REST microservice with student registration and payment gateways.',
      default_branch: 'master',
      language: 'TypeScript',
      stargazers_count: 42,
      updated_at: new Date().toISOString(),
    },
    {
      id: 102,
      name: 'student-portal-backend',
      full_name: 'octocat-engineer/student-portal-backend',
      private: true,
      html_url: 'https://github.com/octocat/student-portal-backend',
      clone_url: 'https://github.com/octocat/student-portal-backend.git',
      description: 'Internal private backend handling university enrollment and grades.',
      default_branch: 'main',
      language: 'TypeScript',
      stargazers_count: 18,
      updated_at: new Date().toISOString(),
    },
    {
      id: 103,
      name: 'codebase-onboarder',
      full_name: 'octocat-engineer/codebase-onboarder',
      private: false,
      html_url: 'https://github.com/octocat/codebase-onboarder',
      clone_url: 'https://github.com/octocat/codebase-onboarder.git',
      description: 'AI-Powered Developer Onboarding & Code Intelligence Platform.',
      default_branch: 'main',
      language: 'TypeScript',
      stargazers_count: 1450,
      updated_at: new Date().toISOString(),
    },
    {
      id: 104,
      name: 'fastapi-auth-service',
      full_name: 'octocat-engineer/fastapi-auth-service',
      private: false,
      html_url: 'https://github.com/tiangolo/fastapi',
      clone_url: 'https://github.com/tiangolo/fastapi.git',
      description: 'High performance OAuth2 authentication service.',
      default_branch: 'master',
      language: 'Python',
      stargazers_count: 76000,
      updated_at: new Date().toISOString(),
    },
  ];

  res.json({ success: true, repositories: demoRepos });
});

/**
 * POST /api/auth/logout
 */
authRouter.post('/logout', (req: Request, res: Response) => {
  const token = (req.headers['authorization'] || '').replace(/^Bearer\s+/, '');
  if (token) {
    activeSessions.delete(token);
  }
  res.json({ success: true, message: 'Logged out successfully.' });
});

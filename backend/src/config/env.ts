import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../../.env') });
dotenv.config(); // fallback to local

export const config = {
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '4000', 10),
  mongoUri: process.env.MONGODB_URI || 'mongodb://localhost:27017/codebase_onboarder',
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD || undefined,
  },
  aiServiceUrl: process.env.AI_SERVICE_URL || 'http://localhost:8000',
  repoStoragePath: process.env.REPO_STORAGE_PATH || path.resolve(process.cwd(), 'data/repos'),
  maxRepoSizeMb: parseInt(process.env.MAX_REPO_SIZE_MB || '250', 10),
  github: {
    clientId: process.env.GITHUB_CLIENT_ID || '',
    clientSecret: process.env.GITHUB_CLIENT_SECRET || '',
    callbackUrl: process.env.GITHUB_CALLBACK_URL || 'http://localhost:5173/auth/callback',
  },
  jwtSecret: process.env.JWT_SECRET || 'codebase_onboarder_jwt_secret_dev_key',
};

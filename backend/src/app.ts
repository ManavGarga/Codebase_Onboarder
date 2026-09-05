import express, { Application } from 'express';
import cors from 'cors';
import morgan from 'morgan';
import repositoryRoutes from './routes/repositoryRoutes';
import { authRouter } from './routes/authRoutes';
import { authMiddleware } from './middlewares/auth';
import { errorHandler } from './middlewares/errorHandler';
import { getDbStatus } from './config/db';
import { getRedisStatus } from './config/redis';
import { createSanitizedMorganFormat } from './utils/logSanitizer';

export const createApp = (): Application => {
  const app = express();

  // Standard Middlewares
  app.use(cors());
  // Protect against API abuse and memory exhaustion with strict 1mb payload limits
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));

  // Sanitized HTTP request logger (redacting secrets and tokens)
  app.use(morgan(createSanitizedMorganFormat()));

  // Health check endpoint
  app.get('/health', (req, res) => {
    res.json({
      status: 'healthy',
      service: 'codebase-onboarder-backend',
      mongodb: getDbStatus() ? 'connected' : 'standalone_fallback',
      redis: getRedisStatus() ? 'connected' : 'standalone_fallback',
      timestamp: new Date().toISOString(),
    });
  });

  // Authentication & GitHub OAuth Routes
  app.use('/api/auth', authRouter);

  // API Routes with auth / tenant isolation
  app.use('/api/repositories', authMiddleware, repositoryRoutes);

  // Centralized Error Handling
  app.use(errorHandler);

  return app;
};

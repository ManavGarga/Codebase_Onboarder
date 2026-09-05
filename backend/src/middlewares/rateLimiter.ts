import { Request, Response, NextFunction } from 'express';
import { getRedisClient, getRedisStatus } from '../config/redis';

interface RateLimitOptions {
  windowMs: number; // Duration of window in milliseconds
  maxRequests: number; // Max number of requests allowed in window
  keyPrefix: string;
  message?: string;
}

interface InMemoryRecord {
  count: number;
  resetTime: number;
}

const inMemoryStores = new Map<string, Map<string, InMemoryRecord>>();

export const createRateLimiter = (options: RateLimitOptions) => {
  const {
    windowMs,
    maxRequests,
    keyPrefix,
    message = 'Too many requests. Rate limit exceeded. Please try again later.',
  } = options;

  if (!inMemoryStores.has(keyPrefix)) {
    inMemoryStores.set(keyPrefix, new Map());
  }
  const memoryStore = inMemoryStores.get(keyPrefix)!;

  return async (req: Request, res: Response, next: NextFunction) => {
    // Identify client by userId or remote IP
    const identifier = req.userId || req.ip || req.socket.remoteAddress || 'anonymous';
    const key = `ratelimit:${keyPrefix}:${identifier}`;
    const now = Date.now();

    // 1. If Redis is available, use atomic Redis sliding window / counter
    if (getRedisStatus()) {
      try {
        const client = getRedisClient();
        const current = await client.incr(key);
        if (current === 1) {
          await client.pexpire(key, windowMs);
        }
        const ttlMs = await client.pttl(key);
        const resetSeconds = Math.max(1, Math.ceil((ttlMs > 0 ? ttlMs : windowMs) / 1000));

        res.setHeader('X-RateLimit-Limit', maxRequests);
        res.setHeader('X-RateLimit-Remaining', Math.max(0, maxRequests - current));
        res.setHeader('X-RateLimit-Reset', resetSeconds);

        if (current > maxRequests) {
          res.setHeader('Retry-After', resetSeconds);
          return res.status(429).json({
            success: false,
            error: message,
            retryAfterSeconds: resetSeconds,
          });
        }
        return next();
      } catch {
        // Fallback to in-memory store if Redis command fails
      }
    }

    // 2. In-memory rate limiting fallback
    let record = memoryStore.get(identifier);
    if (!record || now > record.resetTime) {
      record = {
        count: 1,
        resetTime: now + windowMs,
      };
      memoryStore.set(identifier, record);
    } else {
      record.count += 1;
    }

    const remaining = Math.max(0, maxRequests - record.count);
    const resetSeconds = Math.max(1, Math.ceil((record.resetTime - now) / 1000));

    res.setHeader('X-RateLimit-Limit', maxRequests);
    res.setHeader('X-RateLimit-Remaining', remaining);
    res.setHeader('X-RateLimit-Reset', resetSeconds);

    if (record.count > maxRequests) {
      res.setHeader('Retry-After', resetSeconds);
      return res.status(429).json({
        success: false,
        error: message,
        retryAfterSeconds: resetSeconds,
      });
    }

    next();
  };
};

// Preset limiters:
// Ingestion: max 10 repo creations per 15 minutes
export const ingestionRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  maxRequests: 10,
  keyPrefix: 'ingest',
  message: 'Repository ingestion limit exceeded. Max 10 repositories per 15 minutes.',
});

// Heavy operations (QA, Roadmap, Impact, Evaluation): max 60 per minute
export const aiOperationRateLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 60,
  keyPrefix: 'ai_ops',
  message: 'Rate limit exceeded for AI operations. Max 60 requests per minute.',
});

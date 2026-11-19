import { Request, Response, NextFunction } from 'express';
import { activeSessions } from '../routes/authRoutes';

declare global {
  namespace Express {
    interface Request {
      userId: string;
    }
  }
}

export const authMiddleware = (req: Request, res: Response, next: NextFunction) => {
  // 1. Check if Authorization header with valid session token is provided
  const authHeader = req.headers['authorization'];
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.replace(/^Bearer\s+/, '').trim();
    const session = activeSessions.get(token);
    if (session && session.userId) {
      req.userId = session.userId.substring(0, 64);
      return next();
    }
  }

  // 2. Support client-supplied tenant identifier from x-user-id header or query param
  const rawUserId = (req.headers['x-user-id'] as string) || (req.query.user_id as string);
  if (rawUserId) {
    const sanitized = rawUserId.trim().replace(/[^a-zA-Z0-9_.\-@]/g, '');
    if (sanitized && !sanitized.includes('..')) {
      req.userId = sanitized.substring(0, 64);
      return next();
    }
  }

  // 3. Fallback tenant only if no session token or header was passed
  req.userId = 'anonymous_guest';
  next();
};

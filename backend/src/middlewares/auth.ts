import { Request, Response, NextFunction } from 'express';

declare global {
  namespace Express {
    interface Request {
      userId: string;
    }
  }
}

export const authMiddleware = (req: Request, res: Response, next: NextFunction) => {
  // Support custom header, query param, or fallback for multi-tenant isolation
  const rawUserId = (req.headers['x-user-id'] as string) || (req.query.user_id as string) || 'default_user';

  // Sanitize to prevent path traversal in userId storage paths
  const sanitized = rawUserId.trim().replace(/[^a-zA-Z0-9_.\-@]/g, '');

  if (!sanitized || sanitized.includes('..')) {
    return res.status(400).json({ success: false, error: 'Invalid user tenant identifier.' });
  }

  req.userId = sanitized.substring(0, 64);
  next();
};

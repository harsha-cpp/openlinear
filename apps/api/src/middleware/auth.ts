import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { logger } from '../logger';

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('[Auth] JWT_SECRET is required in production');
    }
    return 'openlinear-dev-secret-change-in-production';
  }
  return secret;
}

const TRUST_PROXY_AUTH_FLAG = 'OPENLINEAR_TRUST_PROXY_AUTH';

// Footgun guard: refuse to boot in production with proxy-trust enabled —
// it lets any caller forge identity by sending an unsigned JWT.
if (
  process.env[TRUST_PROXY_AUTH_FLAG] === '1' &&
  process.env.NODE_ENV === 'production'
) {
  logger.fatal(
    `[Auth] FATAL: ${TRUST_PROXY_AUTH_FLAG}=1 is not allowed when NODE_ENV=production`,
  );
  process.exit(1);
}

function trustProxyAuth(): boolean {
  return process.env[TRUST_PROXY_AUTH_FLAG] === '1';
}

function decodeToken(token: string): { userId: string; username: string } | null {
  if (trustProxyAuth()) {
    const decoded = jwt.decode(token) as { userId?: string; username?: string } | null;
    if (decoded?.userId && decoded?.username) {
      return { userId: decoded.userId, username: decoded.username };
    }
    return null;
  }
  try {
    const verified = jwt.verify(token, getJwtSecret()) as {
      userId: string;
      username: string;
    };
    return { userId: verified.userId, username: verified.username };
  } catch {
    return null;
  }
}

function warnTrustProxy(req: Request): void {
  if (trustProxyAuth()) {
    logger.warn(
      { path: req.path, method: req.method },
      `[Auth] ${TRUST_PROXY_AUTH_FLAG}=1 is active — JWTs accepted WITHOUT signature verification (dev only)`,
    );
  }
}

export interface AuthRequest extends Request {
  userId?: string;
  username?: string;
}

export function optionalAuth(req: AuthRequest, _res: Response, next: NextFunction) {
  warnTrustProxy(req);
  const authHeader = req.headers.authorization;

  if (authHeader?.startsWith('Bearer ')) {
    const claims = decodeToken(authHeader.substring(7));
    if (claims) {
      req.userId = claims.userId;
      req.username = claims.username;
    }
  }

  next();
}

export function requireAuth(req: AuthRequest, res: Response, next: NextFunction) {
  warnTrustProxy(req);
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const claims = decodeToken(authHeader.substring(7));
  if (!claims) {
    res.status(401).json({ error: 'Invalid token' });
    return;
  }

  req.userId = claims.userId;
  req.username = claims.username;
  next();
}

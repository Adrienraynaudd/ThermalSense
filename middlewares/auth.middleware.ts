import 'dotenv/config';
import type { NextFunction, Request, Response } from 'express';
import * as jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'change-me';
const JWT_LOGS_ENABLED = process.env.JWT_LOGS !== 'false';

const getClientIp = (req: Request): string => {
  const forwardedFor = req.headers['x-forwarded-for'];

  if (typeof forwardedFor === 'string') {
    const firstForwardedIp = forwardedFor.split(',')[0];
    return firstForwardedIp ? firstForwardedIp.trim() : 'unknown';
  }

  if (Array.isArray(forwardedFor) && forwardedFor.length > 0) {
    return forwardedFor[0] || 'unknown';
  }

  return req.ip || 'unknown';
};

const getTokenPreview = (token: string): string => {
  if (token.length <= 14) {
    return token;
  }

  return `${token.slice(0, 8)}...${token.slice(-6)}`;
};

const getSubjectFromToken = (decodedToken: string | jwt.JwtPayload): string => {
  if (typeof decodedToken === 'string') {
    return decodedToken;
  }

  if (decodedToken.sub) {
    return String(decodedToken.sub);
  }

  return 'unknown';
};

const logJwt = (
  level: 'info' | 'warn' | 'error',
  message: string,
  metadata: Record<string, unknown>,
): void => {
  if (!JWT_LOGS_ENABLED) {
    return;
  }

  if (level === 'info') {
    console.info(message, metadata);
    return;
  }

  if (level === 'warn') {
    console.warn(message, metadata);
    return;
  }

  console.error(message, metadata);
};

export interface AuthenticatedRequest extends Request {
  user?: string | jwt.JwtPayload;
}

export const authenticateToken = (
  req: Request,
  res: Response,
  next: NextFunction,
): void => {
  const ip = getClientIp(req);
  const route = `${req.method} ${req.originalUrl}`;
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    logJwt('warn', '[JWT][VERIFY][MISSING] Missing or invalid auth header', {
      ip,
      route,
    });
    res.status(401).json({ message: 'Unauthorized' });
    return;
  }

  const token = authHeader.slice(7).trim();

  if (!token) {
    logJwt('warn', '[JWT][VERIFY][MISSING] Empty bearer token', {
      ip,
      route,
    });
    res.status(401).json({ message: 'Unauthorized' });
    return;
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    (req as AuthenticatedRequest).user = decoded;

    logJwt('info', '[JWT][VERIFY][SUCCESS] Token verified', {
      ip,
      route,
      subject: getSubjectFromToken(decoded),
      tokenPreview: getTokenPreview(token),
    });

    next();
  } catch (error) {
    logJwt('warn', '[JWT][VERIFY][FAILED] Token verification failed', {
      ip,
      route,
      tokenPreview: getTokenPreview(token),
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    res.status(401).json({ message: 'Unauthorized' });
  }
};

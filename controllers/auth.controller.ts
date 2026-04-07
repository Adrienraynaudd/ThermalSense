import 'dotenv/config';
import type { Request, Response } from 'express';
import * as jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'change-me';
const JWT_EXPIRES_IN =
  (process.env.JWT_EXPIRES_IN as jwt.SignOptions['expiresIn']) || '5m';
const AUTH_USERNAME = process.env.AUTH_USERNAME || 'admin';
const AUTH_PASSWORD = process.env.AUTH_PASSWORD || 'admin123';
const JWT_LOGS_ENABLED = process.env.JWT_LOGS !== 'false';
const JWT_AUDIENCE = process.env.JWT_AUDIENCE || 'thermalsense-api';
const JWT_SCOPE = process.env.JWT_SCOPE || 'api:read api:write';

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

export const login = async (req: Request, res: Response): Promise<void> => {
  const ip = getClientIp(req);

  try {
    const { username, password } = req.body as {
      username?: string;
      password?: string;
    };

    if (!username || !password) {
      logJwt('warn', '[JWT][LOGIN][BAD_REQUEST] Missing credentials', { ip });
      res.status(400).json({ message: 'Bad request' });
      return;
    }

    if (username !== AUTH_USERNAME || password !== AUTH_PASSWORD) {
      logJwt('warn', '[JWT][LOGIN][UNAUTHORIZED] Invalid credentials', {
        ip,
        username,
      });
      res.status(401).json({ message: 'Unauthorized' });
      return;
    }

    const token = jwt.sign(
      { sub: username, role: 'admin', scope: JWT_SCOPE },
      JWT_SECRET,
      {
        expiresIn: JWT_EXPIRES_IN,
        audience: JWT_AUDIENCE,
      },
    );

    logJwt('info', '[JWT][LOGIN][SUCCESS] Token generated', {
      ip,
      sub: username,
      role: 'admin',
      scope: JWT_SCOPE,
      audience: JWT_AUDIENCE,
      expiresIn: JWT_EXPIRES_IN,
    });

    res.status(200).json({
      accessToken: token,
      tokenType: 'Bearer',
      expiresIn: JWT_EXPIRES_IN,
    });
  } catch (error) {
    logJwt('error', '[JWT][LOGIN][ERROR] Failed to generate token', {
      ip,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    res.status(500).json({ message: 'Internal server error' });
  }
};

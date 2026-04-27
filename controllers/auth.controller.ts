import 'dotenv/config';
import type { Request, Response } from 'express';
import * as jwt from 'jsonwebtoken';
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';
import type { AuthenticatedRequest } from '../middlewares/auth.middleware';
import { logSecurityEvent } from '../utils/securityLogger';

const adapter = new PrismaBetterSqlite3({ url: './dev.db' });
const prisma = new PrismaClient({ adapter });
const userRepository = (prisma as unknown as { user: any }).user;

const JWT_SECRET = process.env.JWT_SECRET || 'change-me';
const JWT_EXPIRES_IN =
  (process.env.JWT_EXPIRES_IN as jwt.SignOptions['expiresIn']) || '5m';
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || JWT_SECRET;
const JWT_REFRESH_EXPIRES_IN =
  (process.env.JWT_REFRESH_EXPIRES_IN as jwt.SignOptions['expiresIn']) || '7d';
const AUTH_USERNAME = process.env.AUTH_USERNAME || 'admin';
const AUTH_PASSWORD = process.env.AUTH_PASSWORD || 'admin123';
const JWT_LOGS_ENABLED = process.env.JWT_LOGS !== 'false';
const JWT_AUDIENCE = process.env.JWT_AUDIENCE || 'thermalsense-api';
const JWT_REFRESH_AUDIENCE =
  process.env.JWT_REFRESH_AUDIENCE || `${JWT_AUDIENCE}:refresh`;
const AUTH_FALLBACK_ENABLED = process.env.AUTH_FALLBACK !== 'false';
const SCRYPT_KEYLEN = 64;
const activeRefreshTokens = new Set<string>();

type AppRole = 'ADMIN' | 'OPERATEUR' | 'LECTEUR' | 'DEVICE_IOT';

const ROLE_SCOPE: Record<AppRole, string> = {
  ADMIN: 'api:read api:write users:manage',
  OPERATEUR: 'api:read api:write:zone',
  LECTEUR: 'api:read',
  DEVICE_IOT: 'api:read device:write',
};

const logJwt = (
  level: 'info' | 'warn' | 'error',
  event: string,
  message: string,
  req: Request,
  metadata: Record<string, unknown>,
): void => {
  if (!JWT_LOGS_ENABLED) {
    return;
  }

  logSecurityEvent(level, event, message, req, metadata);
};

const getScopeForRole = (role: AppRole): string => {
  return ROLE_SCOPE[role] || 'api:read';
};

const parseRole = (roleInput: unknown): AppRole | null => {
  if (typeof roleInput !== 'string') {
    return null;
  }

  const normalizedRole = roleInput.trim().toUpperCase();

  if (normalizedRole === 'ADMIN') {
    return 'ADMIN';
  }

  if (normalizedRole === 'OPERATEUR') {
    return 'OPERATEUR';
  }

  if (normalizedRole === 'LECTEUR') {
    return 'LECTEUR';
  }

  if (normalizedRole === 'DEVICE_IOT') {
    return 'DEVICE_IOT';
  }

  return null;
};

const hashPassword = (password: string): string => {
  const salt = randomBytes(16).toString('hex');
  const derivedKey = scryptSync(password, salt, SCRYPT_KEYLEN).toString('hex');
  return `${salt}:${derivedKey}`;
};

const verifyPassword = (password: string, storedHash: string): boolean => {
  const [salt, originalDerivedKey] = storedHash.split(':');

  if (!salt || !originalDerivedKey) {
    return false;
  }

  const currentDerivedKey = scryptSync(password, salt, SCRYPT_KEYLEN).toString(
    'hex',
  );

  return timingSafeEqual(
    Buffer.from(originalDerivedKey, 'hex'),
    Buffer.from(currentDerivedKey, 'hex'),
  );
};

const createAccessToken = (subject: string, role: AppRole, zoneId?: string): string => {
  const scope = getScopeForRole(role);

  return jwt.sign(
    { sub: subject, role, scope, zoneId, tokenUse: 'access' },
    JWT_SECRET,
    {
      expiresIn: JWT_EXPIRES_IN,
      audience: JWT_AUDIENCE,
    },
  );
};

const createRefreshToken = (subject: string): string => {
  return jwt.sign({ sub: subject, tokenUse: 'refresh' }, JWT_REFRESH_SECRET, {
    expiresIn: JWT_REFRESH_EXPIRES_IN,
    audience: JWT_REFRESH_AUDIENCE,
  });
};

const buildTokenPair = (subject: string, role: AppRole, zoneId?: string) => {
  const accessToken = createAccessToken(subject, role, zoneId);
  const refreshToken = createRefreshToken(subject);

  activeRefreshTokens.add(refreshToken);

  return {
    accessToken,
    refreshToken,
    tokenType: 'Bearer',
    expiresIn: JWT_EXPIRES_IN,
    refreshExpiresIn: JWT_REFRESH_EXPIRES_IN,
  };
};

const getFallbackAuthUser = (username: string, password: string) => {
  if (!AUTH_FALLBACK_ENABLED) {
    return null;
  }

  if (username !== AUTH_USERNAME || password !== AUTH_PASSWORD) {
    return null;
  }

  return {
    username,
    role: 'ADMIN' as AppRole,
    zoneId: null as string | null,
  };
};

export const register = async (req: Request, res: Response): Promise<void> => {
  try {
    const { username, password, role, zoneId } = req.body as {
      username?: string;
      password?: string;
      role?: string;
      zoneId?: string;
    };

    if (!username || !password || !role) {
      logJwt(
        'warn',
        'AUTH_REGISTER_BAD_REQUEST',
        'Missing required fields',
        req,
        {},
      );
      res.status(400).json({ message: 'Bad request' });
      return;
    }

    const parsedRole = parseRole(role);

    if (!parsedRole) {
      res.status(400).json({ message: 'Bad request' });
      return;
    }

    if (parsedRole === 'OPERATEUR' && !zoneId) {
      res.status(400).json({ message: 'Bad request' });
      return;
    }

    if (parsedRole !== 'OPERATEUR' && zoneId) {
      res.status(400).json({ message: 'Bad request' });
      return;
    }

    if (parsedRole === 'OPERATEUR' && zoneId) {
      const zone = await prisma.zone.findUnique({ where: { id: zoneId } });

      if (!zone) {
        res.status(404).json({ message: 'Zone not found' });
        return;
      }
    }

    const existingUser = await userRepository.findUnique({ where: { username } });

    if (existingUser) {
      res.status(409).json({ message: 'User already exists' });
      return;
    }

    const user = await userRepository.create({
      data: {
        username,
        passwordHash: hashPassword(password),
        role: parsedRole,
        zoneId: parsedRole === 'OPERATEUR' ? (zoneId as string) : null,
      },
      select: {
        id: true,
        username: true,
        role: true,
        zoneId: true,
        createdAt: true,
      },
    });

    logJwt('info', 'AUTH_REGISTER_SUCCESS', 'User created', req, {
      username: user.username,
      role: user.role,
      zoneId: user.zoneId,
    });

    res.status(201).json(user);
  } catch (error) {
    logJwt(
      'error',
      'AUTH_REGISTER_ERROR',
      'Failed to create user',
      req,
      { error: error instanceof Error ? error.message : 'Unknown error' },
    );
    res.status(500).json({ message: 'Internal server error' });
  }
};

export const login = async (req: Request, res: Response): Promise<void> => {
  try {
    const { username, password } = req.body as {
      username?: string;
      password?: string;
    };

    if (!username || !password) {
      logJwt(
        'warn',
        'AUTH_LOGIN_BAD_REQUEST',
        'Missing credentials',
        req,
        {},
      );
      res.status(400).json({ message: 'Bad request' });
      return;
    }

    const user = await userRepository.findUnique({ where: { username } });

    if (!user) {
      const fallbackUser = getFallbackAuthUser(username, password);

      if (!fallbackUser) {
        logJwt(
          'warn',
          'AUTH_LOGIN_UNAUTHORIZED',
          'Invalid credentials',
          req,
          { username },
        );
        res.status(401).json({ message: 'Unauthorized' });
        return;
      }

      const fallbackTokenPair = buildTokenPair(
        fallbackUser.username,
        fallbackUser.role,
        fallbackUser.zoneId || undefined,
      );

      res.status(200).json(fallbackTokenPair);
      return;
    }

    if (!verifyPassword(password, user.passwordHash)) {
      logJwt(
        'warn',
        'AUTH_LOGIN_UNAUTHORIZED',
        'Invalid credentials',
        req,
        { username },
      );
      res.status(401).json({ message: 'Unauthorized' });
      return;
    }

    const tokenPair = buildTokenPair(
      user.username,
      user.role,
      user.zoneId || undefined,
    );
    const scope = getScopeForRole(user.role);

    logJwt('info', 'AUTH_LOGIN_SUCCESS', 'Token pair generated', req, {
      sub: user.username,
      role: user.role,
      zoneId: user.zoneId,
      scope,
      audience: JWT_AUDIENCE,
      expiresIn: JWT_EXPIRES_IN,
      refreshAudience: JWT_REFRESH_AUDIENCE,
      refreshExpiresIn: JWT_REFRESH_EXPIRES_IN,
    });

    res.status(200).json(tokenPair);
  } catch (error) {
    logJwt(
      'error',
      'AUTH_LOGIN_ERROR',
      'Failed to generate token pair',
      req,
      { error: error instanceof Error ? error.message : 'Unknown error' },
    );
    res.status(500).json({ message: 'Internal server error' });
  }
};

export const refresh = async (req: Request, res: Response): Promise<void> => {
  try {
    const { refreshToken } = req.body as {
      refreshToken?: string;
    };

    if (!refreshToken) {
      logJwt(
        'warn',
        'AUTH_REFRESH_BAD_REQUEST',
        'Missing refresh token',
        req,
        {},
      );
      res.status(400).json({ message: 'Bad request' });
      return;
    }

    if (!activeRefreshTokens.has(refreshToken)) {
      logJwt(
        'warn',
        'AUTH_REFRESH_UNAUTHORIZED',
        'Unknown refresh token',
        req,
        {},
      );
      res.status(401).json({ message: 'Unauthorized' });
      return;
    }

    const decoded = jwt.verify(refreshToken, JWT_REFRESH_SECRET, {
      audience: JWT_REFRESH_AUDIENCE,
    });

    if (typeof decoded === 'string' || !decoded.sub) {
      logJwt(
        'warn',
        'AUTH_REFRESH_UNAUTHORIZED',
        'Invalid refresh payload',
        req,
        {},
      );
      res.status(401).json({ message: 'Unauthorized' });
      return;
    }

    if (decoded.tokenUse !== 'refresh') {
      res.status(401).json({ message: 'Unauthorized' });
      return;
    }

    const username = String(decoded.sub);
    const user = await userRepository.findUnique({ where: { username } });
    const fallbackUser = getFallbackAuthUser(username, AUTH_PASSWORD);

    if (!user && !fallbackUser) {
      activeRefreshTokens.delete(refreshToken);
      res.status(401).json({ message: 'Unauthorized' });
      return;
    }

    activeRefreshTokens.delete(refreshToken);

    const role = (user?.role as AppRole | undefined) || 'ADMIN';
    const zoneId = user?.zoneId || undefined;
    const tokenPair = buildTokenPair(username, role, zoneId);

    logJwt('info', 'AUTH_REFRESH_SUCCESS', 'Token pair rotated', req, {
      sub: username,
      role,
      zoneId,
      audience: JWT_AUDIENCE,
      refreshAudience: JWT_REFRESH_AUDIENCE,
      expiresIn: JWT_EXPIRES_IN,
      refreshExpiresIn: JWT_REFRESH_EXPIRES_IN,
    });

    res.status(200).json(tokenPair);
  } catch (error) {
    if (req.body && typeof req.body.refreshToken === 'string') {
      activeRefreshTokens.delete(req.body.refreshToken);
    }

    logJwt(
      'warn',
      'AUTH_REFRESH_FAILED',
      'Refresh token verification failed',
      req,
      { error: error instanceof Error ? error.message : 'Unknown error' },
    );
    res.status(401).json({ message: 'Unauthorized' });
  }
};

export const me = async (req: Request, res: Response): Promise<void> => {
  const authenticatedRequest = req as AuthenticatedRequest;

  if (
    !authenticatedRequest.user ||
    typeof authenticatedRequest.user === 'string' ||
    !authenticatedRequest.user.sub
  ) {
    res.status(401).json({ message: 'Unauthorized' });
    return;
  }

  try {
    const username = String(authenticatedRequest.user.sub);
    const user = await userRepository.findUnique({
      where: { username },
      include: {
        zone: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    if (!user) {
      const roleFromToken =
        typeof authenticatedRequest.user.role === 'string'
          ? authenticatedRequest.user.role
          : 'ADMIN';

      res.status(200).json({
        username,
        role: roleFromToken,
        zoneId: null,
      });
      return;
    }

    res.status(200).json({
      id: user.id,
      username: user.username,
      role: user.role,
      zoneId: user.zoneId,
      zone: user.zone,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    });
  } catch (error) {
    logJwt('error', 'AUTH_ME_ERROR', 'Failed to get current user', req, {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    res.status(500).json({ message: 'Internal server error' });
  }
};

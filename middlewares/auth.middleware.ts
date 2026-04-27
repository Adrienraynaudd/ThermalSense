import 'dotenv/config';
import type { NextFunction, Request, Response } from 'express';
import * as jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';
import { getClientIp, logSecurityEvent } from '../utils/securityLogger';

const adapter = new PrismaBetterSqlite3({ url: './dev.db' });
const prisma = new PrismaClient({ adapter });

const JWT_SECRET = process.env.JWT_SECRET || 'change-me';
const JWT_LOGS_ENABLED = process.env.JWT_LOGS !== 'false';
const JWT_AUDIENCE = process.env.JWT_AUDIENCE || 'thermalsense-api';
const PUBLIC_PATH_PREFIXES = [
  '/docs',
  '/auth/login',
  '/auth/refresh',
];

type AppRole = 'ADMIN' | 'OPERATEUR' | 'LECTEUR' | 'DEVICE_IOT';
type RouteKey =
  | 'sensor:list'
  | 'sensor:create'
  | 'sensor:read'
  | 'sensor:delete'
  | 'sensor:config:read'
  | 'sensor:config:write'
  | 'measurement:list'
  | 'measurement:create'
  | 'actuator:list'
  | 'actuator:commands:read'
  | 'actuator:commands:write'
  | 'threshold:list'
  | 'threshold:create'
  | 'threshold:update'
  | 'threshold:delete'
  | 'auth:register'
  | 'auth:me'
  | 'other';

interface JwtUserClaims extends jwt.JwtPayload {
  sub?: string;
  role?: AppRole;
  zoneId?: string;
}

const getSubjectFromToken = (decodedToken: string | jwt.JwtPayload): string => {
  if (typeof decodedToken === 'string') {
    return decodedToken;
  }

  if (decodedToken.sub) {
    return String(decodedToken.sub);
  }

  return 'unknown';
};

const getRoleFromToken = (decodedToken: string | jwt.JwtPayload): string => {
  if (typeof decodedToken === 'string') {
    return 'unknown';
  }

  if (decodedToken.role) {
    return String(decodedToken.role);
  }

  return 'unknown';
};

const getScopeFromToken = (decodedToken: string | jwt.JwtPayload): string => {
  if (typeof decodedToken === 'string') {
    return '';
  }

  if (decodedToken.scope) {
    return String(decodedToken.scope);
  }

  return '';
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

const isPublicPath = (path: string): boolean => {
  return PUBLIC_PATH_PREFIXES.some(
    (publicPath) => path === publicPath || path.startsWith(`${publicPath}/`),
  );
};

export interface AuthenticatedRequest extends Request {
  user?: string | JwtUserClaims;
}

const parseRole = (decodedToken: string | jwt.JwtPayload): AppRole | null => {
  if (typeof decodedToken === 'string') {
    return null;
  }

  const role = String(decodedToken.role || '').toUpperCase();

  if (
    role === 'ADMIN' ||
    role === 'OPERATEUR' ||
    role === 'LECTEUR' ||
    role === 'DEVICE_IOT'
  ) {
    return role;
  }

  return null;
};

const getZoneIdFromToken = (decodedToken: string | jwt.JwtPayload): string | null => {
  if (typeof decodedToken === 'string') {
    return null;
  }

  if (!decodedToken.zoneId) {
    return null;
  }

  return String(decodedToken.zoneId);
};

const ROUTE_RULES: Array<{ method: string; matcher: RegExp; key: RouteKey }> = [
  { method: 'GET', matcher: /^\/sensors?$/, key: 'sensor:list' },
  {
    method: 'POST',
    matcher: /^(\/sensors?|\/zone\/[^/]+\/sensor)$/,
    key: 'sensor:create',
  },
  { method: 'GET', matcher: /^\/sensors?\/[^/]+$/, key: 'sensor:read' },
  { method: 'DELETE', matcher: /^\/sensors?\/[^/]+$/, key: 'sensor:delete' },
  {
    method: 'GET',
    matcher: /^\/sensors\/[^/]+\/config$/,
    key: 'sensor:config:read',
  },
  {
    method: 'PATCH',
    matcher: /^\/sensors\/[^/]+\/config$/,
    key: 'sensor:config:write',
  },
  { method: 'GET', matcher: /^\/measurement$/, key: 'measurement:list' },
  {
    method: 'POST',
    matcher: /^\/sensors?\/[^/]+\/measurement$/,
    key: 'measurement:create',
  },
  { method: 'GET', matcher: /^\/actuators?$/, key: 'actuator:list' },
  {
    method: 'GET',
    matcher: /^\/actuators\/[^/]+\/commands$/,
    key: 'actuator:commands:read',
  },
  {
    method: 'POST',
    matcher: /^\/actuators\/[^/]+\/commands$/,
    key: 'actuator:commands:write',
  },
  { method: 'GET', matcher: /^\/alert-threshold$/, key: 'threshold:list' },
  {
    method: 'POST',
    matcher: /^\/zone\/[^/]+\/alert-threshold$/,
    key: 'threshold:create',
  },
  {
    method: 'PATCH',
    matcher: /^\/alert-threshold\/[^/]+$/,
    key: 'threshold:update',
  },
  {
    method: 'DELETE',
    matcher: /^\/alert-threshold\/[^/]+$/,
    key: 'threshold:delete',
  },
  { method: 'POST', matcher: /^\/auth\/register$/, key: 'auth:register' },
  { method: 'GET', matcher: /^\/auth\/me$/, key: 'auth:me' },
];

const getRouteKey = (method: string, path: string): RouteKey => {
  const routeRule = ROUTE_RULES.find(
    (rule) => rule.method === method && rule.matcher.test(path),
  );

  return routeRule ? routeRule.key : 'other';
};

const getIdAt = (path: string, index: number): string | null => {
  const parts = path.split('/').filter(Boolean);
  return parts[index] || null;
};

const getSensorZoneId = async (sensorId: string): Promise<string | null> => {
  const sensor = await prisma.sensor.findUnique({
    where: { id: sensorId },
    select: { zoneId: true },
  });
  return sensor?.zoneId || null;
};

const getActuatorZoneId = async (actuatorId: string): Promise<string | null> => {
  const actuator = await prisma.actuator.findUnique({
    where: { id: actuatorId },
    select: { zoneId: true },
  });
  return actuator?.zoneId || null;
};

const getThresholdZoneId = async (thresholdId: string): Promise<string | null> => {
  const threshold = await prisma.alertThreshold.findUnique({
    where: { id: thresholdId },
    select: { zoneId: true },
  });
  return threshold?.zoneId || null;
};

const resolveSensorCreateZone = async (req: Request): Promise<string | null> => {
  if (/^\/zone\/[^/]+\/sensor$/.test(req.path)) {
    return getIdAt(req.path, 1);
  }

  if (req.body && typeof req.body.zoneId === 'string') {
    return req.body.zoneId;
  }

  return null;
};

const resolveSensorResourceZone = async (req: Request): Promise<string | null> => {
  const sensorId = getIdAt(req.path, 1);
  if (!sensorId) {
    return null;
  }

  return getSensorZoneId(sensorId);
};

const resolveMeasurementListZone = async (req: Request): Promise<string | null> => {
  if (typeof req.query.zoneId === 'string') {
    return req.query.zoneId;
  }

  if (typeof req.query.sensorId === 'string') {
    return getSensorZoneId(req.query.sensorId);
  }

  return null;
};

const resolveActuatorZone = async (req: Request): Promise<string | null> => {
  const actuatorId = getIdAt(req.path, 1);
  if (!actuatorId) {
    return null;
  }

  return getActuatorZoneId(actuatorId);
};

const resolveThresholdZone = async (req: Request): Promise<string | null> => {
  const thresholdId = getIdAt(req.path, 1);
  if (!thresholdId) {
    return null;
  }

  return getThresholdZoneId(thresholdId);
};

const resolveRegisterZone = async (req: Request): Promise<string | null> => {
  if (req.body && typeof req.body.zoneId === 'string') {
    return req.body.zoneId;
  }

  return null;
};

const ROUTE_ZONE_RESOLVERS: Partial<
  Record<RouteKey, (req: Request) => Promise<string | null>>
> = {
  'sensor:create': resolveSensorCreateZone,
  'sensor:read': resolveSensorResourceZone,
  'sensor:delete': resolveSensorResourceZone,
  'sensor:config:read': resolveSensorResourceZone,
  'sensor:config:write': resolveSensorResourceZone,
  'measurement:create': resolveSensorResourceZone,
  'measurement:list': resolveMeasurementListZone,
  'actuator:commands:read': resolveActuatorZone,
  'actuator:commands:write': resolveActuatorZone,
  'threshold:create': async (req: Request) => getIdAt(req.path, 1),
  'threshold:update': resolveThresholdZone,
  'threshold:delete': resolveThresholdZone,
  'auth:register': resolveRegisterZone,
};

const resolveTargetZoneId = async (
  routeKey: RouteKey,
  req: Request,
): Promise<string | null> => {
  const resolver = ROUTE_ZONE_RESOLVERS[routeKey];
  if (!resolver) {
    return null;
  }

  return resolver(req);
};

const isRoleAllowed = (routeKey: RouteKey, role: AppRole): boolean => {
  const matrix: Record<RouteKey, AppRole[]> = {
    'sensor:list': ['ADMIN', 'OPERATEUR', 'LECTEUR'],
    'sensor:create': ['ADMIN', 'OPERATEUR'],
    'sensor:read': ['ADMIN', 'OPERATEUR', 'LECTEUR', 'DEVICE_IOT'],
    'sensor:delete': ['ADMIN', 'OPERATEUR'],
    'sensor:config:read': ['ADMIN', 'OPERATEUR'],
    'sensor:config:write': ['ADMIN', 'OPERATEUR'],
    'measurement:list': ['ADMIN', 'OPERATEUR', 'LECTEUR'],
    'measurement:create': ['ADMIN', 'OPERATEUR', 'DEVICE_IOT'],
    'actuator:list': ['ADMIN', 'OPERATEUR', 'LECTEUR'],
    'actuator:commands:read': ['ADMIN', 'OPERATEUR', 'LECTEUR'],
    'actuator:commands:write': ['ADMIN', 'OPERATEUR'],
    'threshold:list': ['ADMIN', 'OPERATEUR', 'LECTEUR', 'DEVICE_IOT'],
    'threshold:create': ['ADMIN', 'OPERATEUR'],
    'threshold:update': ['ADMIN', 'OPERATEUR'],
    'threshold:delete': ['ADMIN', 'OPERATEUR'],
    'auth:register': ['ADMIN', 'OPERATEUR'],
    'auth:me': ['ADMIN', 'OPERATEUR', 'LECTEUR', 'DEVICE_IOT'],
    other: ['ADMIN', 'OPERATEUR', 'LECTEUR', 'DEVICE_IOT'],
  };

  return matrix[routeKey].includes(role);
};

const isOperatorOwnZoneOnly = (routeKey: RouteKey): boolean => {
  return [
    'sensor:create',
    'sensor:delete',
    'sensor:config:write',
    'measurement:list',
    'measurement:create',
    'actuator:commands:write',
    'threshold:create',
    'threshold:update',
    'threshold:delete',
    'auth:register',
  ].includes(routeKey);
};

const authorizeRequest = async (
  req: Request,
  decoded: string | jwt.JwtPayload,
): Promise<boolean> => {
  const role = parseRole(decoded);
  if (!role) {
    return false;
  }

  const routeKey = getRouteKey(req.method, req.path);

  if (!isRoleAllowed(routeKey, role)) {
    return false;
  }

  if (role !== 'OPERATEUR') {
    return true;
  }

  if (!isOperatorOwnZoneOnly(routeKey)) {
    return true;
  }

  const operatorZoneId = getZoneIdFromToken(decoded);
  if (!operatorZoneId) {
    return false;
  }

  const targetZoneId = await resolveTargetZoneId(routeKey, req);
  if (!targetZoneId) {
    return false;
  }

  return operatorZoneId === targetZoneId;
};

export const authenticateToken = (
  req: Request,
  res: Response,
  next: NextFunction,
): void => {
  const ip = getClientIp(req);
  const route = `${req.method} ${req.originalUrl}`;

  if (isPublicPath(req.path)) {
    next();
    return;
  }

  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith('Bearer ')) {
    logJwt(
      'warn',
      'AUTH_VERIFY_HEADER_MISSING',
      'Missing or invalid authorization header',
      req,
      { ip, route },
    );
    res.status(401).json({ message: 'Unauthorized' });
    return;
  }

  const token = authHeader.slice(7).trim();

  if (!token) {
    logJwt(
      'warn',
      'AUTH_VERIFY_TOKEN_MISSING',
      'Empty bearer token',
      req,
      { ip, route },
    );
    res.status(401).json({ message: 'Unauthorized' });
    return;
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET, { audience: JWT_AUDIENCE });
    const scope = getScopeFromToken(decoded);

    if (!scope.trim()) {
      logJwt(
        'warn',
        'AUTH_VERIFY_SCOPE_MISSING',
        'Missing scope claim in JWT',
        req,
        {
          ip,
          route,
          subject: getSubjectFromToken(decoded),
        },
      );
      res.status(401).json({ message: 'Unauthorized' });
      return;
    }

    authorizeRequest(req, decoded)
      .then((isAuthorized) => {
        if (!isAuthorized) {
          logJwt(
            'warn',
            'AUTH_AUTHORIZE_FORBIDDEN',
            'Access denied by role policy',
            req,
            {
              ip,
              route,
              subject: getSubjectFromToken(decoded),
              role: getRoleFromToken(decoded),
            },
          );
          res.status(403).json({ message: 'Forbidden' });
          return;
        }

        (req as AuthenticatedRequest).user = decoded as JwtUserClaims;

        logJwt('info', 'AUTH_VERIFY_SUCCESS', 'JWT verified', req, {
          ip,
          route,
          subject: getSubjectFromToken(decoded),
          role: getRoleFromToken(decoded),
          scope,
          audience: JWT_AUDIENCE,
        });

        next();
      })
      .catch((error) => {
        logJwt(
          'error',
          'AUTH_AUTHORIZE_ERROR',
          'Failed to evaluate authorization policy',
          req,
          {
            ip,
            route,
            error: error instanceof Error ? error.message : 'Unknown error',
          },
        );
        res.status(500).json({ message: 'Internal server error' });
      });
  } catch (error) {
    logJwt('warn', 'AUTH_VERIFY_FAILED', 'Token verification failed', req, {
      ip,
      route,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    res.status(401).json({ message: 'Unauthorized' });
  }
};

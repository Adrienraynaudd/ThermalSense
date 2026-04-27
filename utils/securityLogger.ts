import type { Request } from 'express';

export type SecurityLogLevel = 'info' | 'warn' | 'error';

interface SecurityLogPayload {
  level: SecurityLogLevel;
  event: string;
  message: string;
  timestamp: string;
  requestId?: string;
  ip?: string;
  method?: string;
  path?: string;
  userAgent?: string;
  metadata?: Record<string, unknown>;
}

export const getClientIp = (req: Request): string => {
  const forwardedFor = req.headers['x-forwarded-for'];

  if (typeof forwardedFor === 'string') {
    const firstForwardedIp = forwardedFor.split(',')[0];
    return firstForwardedIp ? firstForwardedIp.trim() : req.ip || 'unknown';
  }

  if (Array.isArray(forwardedFor) && forwardedFor.length > 0) {
    return forwardedFor[0] || req.ip || 'unknown';
  }

  return req.ip || 'unknown';
};

export const getRequestId = (req: Request): string => {
  const requestId = req.headers['x-request-id'];

  if (typeof requestId === 'string' && requestId.trim()) {
    return requestId.trim();
  }

  return 'unknown';
};

export const logSecurityEvent = (
  level: SecurityLogLevel,
  event: string,
  message: string,
  req?: Request,
  metadata?: Record<string, unknown>,
): void => {
  const payload: SecurityLogPayload = {
    level,
    event,
    message,
    timestamp: new Date().toISOString(),
  };

  if (metadata) {
    payload.metadata = metadata;
  }

  if (req) {
    payload.requestId = getRequestId(req);
    payload.ip = getClientIp(req);
    payload.method = req.method;
    payload.path = req.originalUrl || req.path;
    payload.userAgent = req.headers['user-agent'] || 'unknown';
  }

  const serializedPayload = JSON.stringify(payload);

  if (level === 'info') {
    console.info(serializedPayload);
    return;
  }

  if (level === 'warn') {
    console.warn(serializedPayload);
    return;
  }

  console.error(serializedPayload);
};

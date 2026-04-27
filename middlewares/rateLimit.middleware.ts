import type { Request, Response } from 'express';
import { ipKeyGenerator, rateLimit } from 'express-rate-limit';
import { logSecurityEvent } from '../utils/securityLogger';

interface RateLimiterOptions {
  skipSuccessfulRequests?: boolean;
}

const getClientIp = (req: Request): string => {
  const forwardedFor = req.headers['x-forwarded-for'];

  if (typeof forwardedFor === 'string') {
    const firstForwardedIp = forwardedFor.split(',')[0];
    return firstForwardedIp ? firstForwardedIp.trim() : req.ip || '127.0.0.1';
  }

  if (Array.isArray(forwardedFor) && forwardedFor.length > 0) {
    return forwardedFor[0] || req.ip || '127.0.0.1';
  }

  return req.ip || '127.0.0.1';
};

const createRateLimiter = (
  limiterName: string,
  windowMs: number,
  max: number,
  message = 'Too many requests, please try again later.',
  options: RateLimiterOptions = {},
) => {
  return rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: options.skipSuccessfulRequests ?? false,
    keyGenerator: (req: Request) => ipKeyGenerator(getClientIp(req)),
    message: { message },
    handler: (req: Request, res: Response) => {
      logSecurityEvent(
        'warn',
        'RATE_LIMIT_EXCEEDED',
        'Rate limit exceeded on protected endpoint',
        req,
        {
          limiter: limiterName,
          windowMs,
          max,
        },
      );

      res.status(429).json({ message });
    },
  });
};

export const authLoginRateLimiter = createRateLimiter(
  'auth_login',
  10 * 60 * 1000,
  8,
  'Too many login attempts, please try again later.',
  { skipSuccessfulRequests: true },
);

export const authRefreshRateLimiter = createRateLimiter(
  'auth_refresh',
  10 * 60 * 1000,
  30,
  'Too many token refresh requests, please try again later.',
);

export const criticalWriteRateLimiter = createRateLimiter(
  'critical_write',
  15 * 60 * 1000,
  60,
  'Too many write operations, please slow down.',
);

import type { NextFunction, Request, Response } from 'express';
import { logger } from '../utils/logger';
import { getClientIp } from '../utils/securityLogger';

export const httpLogger = (req: Request, res: Response, next: NextFunction): void => {
  const start = Date.now();
  const requestId = req.headers['x-request-id'] as string | undefined;

  res.on('finish', () => {
    const durationMs = Date.now() - start;
    const level = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info';

    logger[level]('HTTP_REQUEST', `${req.method} ${req.path} ${res.statusCode}`, {
      requestId,
      method: req.method,
      path: req.originalUrl || req.path,
      status: res.statusCode,
      durationMs,
      ip: getClientIp(req),
      userAgent: req.headers['user-agent'] ?? 'unknown',
    });
  });

  next();
};

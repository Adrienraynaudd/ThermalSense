import type { NextFunction, Request, Response } from 'express';
import { randomUUID } from 'node:crypto';

export const attachRequestId = (
  req: Request,
  res: Response,
  next: NextFunction,
): void => {
  const incomingRequestId = req.headers['x-request-id'];
  const requestId =
    typeof incomingRequestId === 'string' && incomingRequestId.trim()
      ? incomingRequestId.trim()
      : randomUUID();

  req.headers['x-request-id'] = requestId;
  res.setHeader('x-request-id', requestId);

  next();
};

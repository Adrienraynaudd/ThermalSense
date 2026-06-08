jest.mock('@prisma/adapter-better-sqlite3', () => ({
  PrismaBetterSqlite3: jest.fn().mockImplementation(() => ({})),
}));
jest.mock('dotenv/config', () => ({}));
jest.mock('better-sqlite3', () => jest.fn().mockImplementation(() => ({})));
jest.mock('../utils/securityLogger', () => ({
  logSecurityEvent: jest.fn(),
  getClientIp: jest.fn().mockReturnValue('127.0.0.1'),
  getRequestId: jest.fn().mockReturnValue('req-1'),
}));
jest.mock('@prisma/client', () => ({
  PrismaClient: jest.fn().mockImplementation(() => ({
    zone: { findUnique: jest.fn() },
    user: {
      findUnique: jest.fn(),
      create: jest.fn(),
    },
  })),
}));

import request from 'supertest';
import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import { PrismaClient } from '@prisma/client';
import * as authController from '../controllers/auth.controller';

// Minimal auth middleware that just attaches a test user
function attachTestUser(req: Request, res: Response, next: NextFunction) {
  (req as any).user = { sub: 'admin', role: 'ADMIN', scope: 'api:read api:write users:manage' };
  next();
}

function createApp() {
  const app = express();
  app.use(express.json());
  // Public routes
  app.post('/auth/login', authController.login);
  app.post('/auth/refresh', authController.refresh);
  // Protected routes (use test middleware instead of real JWT check)
  app.post('/auth/register', attachTestUser, authController.register);
  app.get('/auth/me', attachTestUser, authController.me);
  return app;
}

let db: any;
let app: express.Application;

beforeAll(() => {
  db = (PrismaClient as jest.Mock).mock.results[0]?.value;
  app = createApp();
});

beforeEach(() => {
  jest.clearAllMocks();
  // Reset env to defaults
  process.env.AUTH_USERNAME = 'admin';
  process.env.AUTH_PASSWORD = 'admin123';
  process.env.JWT_SECRET = 'test-secret';
  process.env.JWT_AUDIENCE = 'thermalsense-api';
  process.env.AUTH_FALLBACK = 'true';
});

describe('POST /auth/login', () => {
  it('returns 200 with token pair for valid fallback credentials', async () => {
    db.user.findUnique.mockResolvedValue(null); // No DB user → use fallback
    const res = await request(app)
      .post('/auth/login')
      .send({ username: 'admin', password: 'admin123' });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('accessToken');
    expect(res.body).toHaveProperty('refreshToken');
    expect(res.body.tokenType).toBe('Bearer');
  });

  it('returns 401 with wrong password', async () => {
    db.user.findUnique.mockResolvedValue(null);
    const res = await request(app)
      .post('/auth/login')
      .send({ username: 'admin', password: 'wrong' });
    expect(res.status).toBe(401);
  });

  it('returns 400 when credentials are missing', async () => {
    const res = await request(app).post('/auth/login').send({});
    expect(res.status).toBe(400);
  });

  it('returns 400 when password is missing', async () => {
    const res = await request(app).post('/auth/login').send({ username: 'admin' });
    expect(res.status).toBe(400);
  });
});

describe('POST /auth/refresh', () => {
  it('returns 400 when refreshToken is missing', async () => {
    const res = await request(app).post('/auth/refresh').send({});
    expect(res.status).toBe(400);
  });

  it('returns 401 for an unknown refresh token', async () => {
    const res = await request(app)
      .post('/auth/refresh')
      .send({ refreshToken: 'invalid-token' });
    expect(res.status).toBe(401);
  });

  it('returns 200 with new token pair for a valid refresh token', async () => {
    db.user.findUnique.mockResolvedValue(null);
    const loginRes = await request(app)
      .post('/auth/login')
      .send({ username: 'admin', password: 'admin123' });
    expect(loginRes.status).toBe(200);

    const { refreshToken } = loginRes.body as { refreshToken: string };

    db.user.findUnique.mockResolvedValue(null);
    const refreshRes = await request(app)
      .post('/auth/refresh')
      .send({ refreshToken });
    expect(refreshRes.status).toBe(200);
    expect(refreshRes.body).toHaveProperty('accessToken');
    expect(refreshRes.body).toHaveProperty('refreshToken');
  });

  it('invalidates old refresh token after rotation', async () => {
    // Use a unique jti per token so they remain distinct within the same second
    const jwtLib = require('jsonwebtoken');
    let counter = 0;
    const originalSign = jwtLib.sign;
    const signSpy = jest.spyOn(jwtLib, 'sign').mockImplementation(
      (payload: any, secret: any, options: any) =>
        originalSign({ ...payload, jti: String(++counter) }, secret, options),
    );
    try {
      db.user.findUnique.mockResolvedValue(null);
      const loginRes = await request(app)
        .post('/auth/login')
        .send({ username: 'admin', password: 'admin123' });
      const { refreshToken } = loginRes.body as { refreshToken: string };

      db.user.findUnique.mockResolvedValue(null);
      await request(app).post('/auth/refresh').send({ refreshToken });

      const secondRes = await request(app).post('/auth/refresh').send({ refreshToken });
      expect(secondRes.status).toBe(401);
    } finally {
      signSpy.mockRestore();
    }
  });
});

describe('POST /auth/register', () => {
  it('returns 201 with created user', async () => {
    db.user.findUnique.mockResolvedValue(null);
    db.user.create.mockResolvedValue({
      id: 'u1',
      username: 'newuser',
      role: 'LECTEUR',
      zoneId: null,
      createdAt: new Date().toISOString(),
    });
    const res = await request(app)
      .post('/auth/register')
      .send({ username: 'newuser', password: 'pass123', role: 'LECTEUR' });
    expect(res.status).toBe(201);
    expect(res.body.username).toBe('newuser');
    expect(res.body.role).toBe('LECTEUR');
  });

  it('returns 409 when username already exists', async () => {
    db.user.findUnique.mockResolvedValue({ id: 'u1', username: 'existing' });
    const res = await request(app)
      .post('/auth/register')
      .send({ username: 'existing', password: 'pass123', role: 'LECTEUR' });
    expect(res.status).toBe(409);
  });

  it('returns 400 when required fields are missing', async () => {
    const res = await request(app).post('/auth/register').send({ username: 'x' });
    expect(res.status).toBe(400);
  });

  it('returns 400 for unknown role', async () => {
    const res = await request(app)
      .post('/auth/register')
      .send({ username: 'x', password: 'pass', role: 'SUPERADMIN' });
    expect(res.status).toBe(400);
  });

  it('returns 400 when OPERATEUR role has no zoneId', async () => {
    const res = await request(app)
      .post('/auth/register')
      .send({ username: 'op', password: 'pass', role: 'OPERATEUR' });
    expect(res.status).toBe(400);
  });

  it('returns 400 when non-OPERATEUR role provides a zoneId', async () => {
    const res = await request(app)
      .post('/auth/register')
      .send({ username: 'reader', password: 'pass', role: 'LECTEUR', zoneId: 'z1' });
    expect(res.status).toBe(400);
  });

  it('returns 404 when OPERATEUR zoneId does not exist', async () => {
    db.zone.findUnique.mockResolvedValue(null);
    db.user.findUnique.mockResolvedValue(null);
    const res = await request(app)
      .post('/auth/register')
      .send({ username: 'op', password: 'pass', role: 'OPERATEUR', zoneId: 'unknown' });
    expect(res.status).toBe(404);
  });
});

describe('GET /auth/me', () => {
  it('returns 200 with user from DB', async () => {
    db.user.findUnique.mockResolvedValue({
      id: 'u1',
      username: 'admin',
      role: 'ADMIN',
      zoneId: null,
      zone: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    const res = await request(app).get('/auth/me');
    expect(res.status).toBe(200);
    expect(res.body.username).toBe('admin');
  });

  it('returns 200 with token data when user not in DB (fallback)', async () => {
    db.user.findUnique.mockResolvedValue(null);
    const res = await request(app).get('/auth/me');
    expect(res.status).toBe(200);
    expect(res.body.username).toBe('admin');
    expect(res.body.role).toBe('ADMIN');
  });

  it('returns 500 on DB error', async () => {
    db.user.findUnique.mockRejectedValue(new Error('DB down'));
    const res = await request(app).get('/auth/me');
    expect(res.status).toBe(500);
  });
});


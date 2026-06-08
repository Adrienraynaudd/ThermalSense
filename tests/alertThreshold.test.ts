jest.mock('@prisma/adapter-better-sqlite3', () => ({
  PrismaBetterSqlite3: jest.fn().mockImplementation(() => ({})),
}));
jest.mock('dotenv/config', () => ({}));
jest.mock('better-sqlite3', () => jest.fn().mockImplementation(() => ({})));
jest.mock('@prisma/client', () => ({
  PrismaClient: jest.fn().mockImplementation(() => ({
    zone: { findUnique: jest.fn() },
    alertThreshold: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
  })),
}));

import request from 'supertest';
import express from 'express';
import { PrismaClient } from '@prisma/client';
import * as alertThresholdController from '../controllers/alertThreshold.controller';

function createApp() {
  const app = express();
  app.use(express.json());
  app.get('/alert-threshold', alertThresholdController.getAll);
  app.post('/zone/:id/alert-threshold', alertThresholdController.create);
  app.patch('/alert-threshold/:id', alertThresholdController.update);
  app.delete('/alert-threshold/:id', alertThresholdController.remove);
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
});

const ZONE = { id: 'z1', name: 'Zone Nord', buildingId: 'bld1' };
const THRESHOLD = { id: 't1', type: 'temperature', min: 18.0, max: 28.0, zoneId: 'z1' };

describe('GET /alert-threshold', () => {
  it('returns 200 with all thresholds', async () => {
    db.alertThreshold.findMany.mockResolvedValue([THRESHOLD]);
    const res = await request(app).get('/alert-threshold');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([THRESHOLD]);
  });

  it('filters by zone query param', async () => {
    db.alertThreshold.findMany.mockResolvedValue([THRESHOLD]);
    await request(app).get('/alert-threshold?zone=z1');
    expect(db.alertThreshold.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ zoneId: 'z1' }) }),
    );
  });

  it('filters by type query param', async () => {
    db.alertThreshold.findMany.mockResolvedValue([THRESHOLD]);
    await request(app).get('/alert-threshold?type=temperature');
    expect(db.alertThreshold.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ type: 'temperature' }) }),
    );
  });

  it('returns 500 on DB error', async () => {
    db.alertThreshold.findMany.mockRejectedValue(new Error('DB down'));
    const res = await request(app).get('/alert-threshold');
    expect(res.status).toBe(500);
  });
});

describe('POST /zone/:id/alert-threshold', () => {
  it('returns 201 when zone exists', async () => {
    db.zone.findUnique.mockResolvedValue(ZONE);
    db.alertThreshold.create.mockResolvedValue(THRESHOLD);
    const res = await request(app)
      .post('/zone/z1/alert-threshold')
      .send({ type: 'temperature', min: 18.0, max: 28.0 });
    expect(res.status).toBe(201);
    expect(res.body).toEqual(THRESHOLD);
  });

  it('returns 404 when zone not found', async () => {
    db.zone.findUnique.mockResolvedValue(null);
    const res = await request(app)
      .post('/zone/unknown/alert-threshold')
      .send({ type: 'temperature', min: 18.0, max: 28.0 });
    expect(res.status).toBe(404);
  });

  it('returns 400 on DB create error', async () => {
    db.zone.findUnique.mockResolvedValue(ZONE);
    db.alertThreshold.create.mockRejectedValue(new Error('constraint'));
    const res = await request(app).post('/zone/z1/alert-threshold').send({});
    expect(res.status).toBe(400);
  });

  it('includes zoneId in created data', async () => {
    db.zone.findUnique.mockResolvedValue(ZONE);
    db.alertThreshold.create.mockResolvedValue(THRESHOLD);
    await request(app)
      .post('/zone/z1/alert-threshold')
      .send({ type: 'temperature', min: 18.0, max: 28.0 });
    expect(db.alertThreshold.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ zoneId: 'z1' }) }),
    );
  });
});

describe('PATCH /alert-threshold/:id', () => {
  it('returns 200 with updated threshold', async () => {
    const updated = { ...THRESHOLD, max: 30.0 };
    db.alertThreshold.findUnique.mockResolvedValue(THRESHOLD);
    db.alertThreshold.update.mockResolvedValue(updated);
    const res = await request(app).patch('/alert-threshold/t1').send({ max: 30.0 });
    expect(res.status).toBe(200);
    expect(res.body.max).toBe(30.0);
  });

  it('returns 404 when threshold not found', async () => {
    db.alertThreshold.findUnique.mockResolvedValue(null);
    const res = await request(app).patch('/alert-threshold/unknown').send({ max: 30.0 });
    expect(res.status).toBe(404);
  });
});

describe('DELETE /alert-threshold/:id', () => {
  it('returns 204 on success', async () => {
    db.alertThreshold.findUnique.mockResolvedValue(THRESHOLD);
    db.alertThreshold.delete.mockResolvedValue(THRESHOLD);
    const res = await request(app).delete('/alert-threshold/t1');
    expect(res.status).toBe(204);
  });

  it('returns 404 when not found', async () => {
    db.alertThreshold.findUnique.mockResolvedValue(null);
    const res = await request(app).delete('/alert-threshold/unknown');
    expect(res.status).toBe(404);
  });

  it('returns 500 on DB delete error', async () => {
    db.alertThreshold.findUnique.mockResolvedValue(THRESHOLD);
    db.alertThreshold.delete.mockRejectedValue(new Error('DB error'));
    const res = await request(app).delete('/alert-threshold/t1');
    expect(res.status).toBe(500);
  });
});

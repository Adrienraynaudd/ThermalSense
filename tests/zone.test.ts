jest.mock('@prisma/adapter-better-sqlite3', () => ({
  PrismaBetterSqlite3: jest.fn().mockImplementation(() => ({})),
}));
jest.mock('dotenv/config', () => ({}));
jest.mock('better-sqlite3', () => jest.fn().mockImplementation(() => ({})));
jest.mock('@prisma/client', () => ({
  PrismaClient: jest.fn().mockImplementation(() => ({
    building: { findUnique: jest.fn() },
    zone: {
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
import * as zoneController from '../controllers/zone.controller';

function createApp() {
  const app = express();
  app.use(express.json());
  app.get('/zone', zoneController.getAll);
  app.post('/building/:id/zone', zoneController.create);
  app.get('/zone/:id', zoneController.getById);
  app.patch('/zone/:id', zoneController.update);
  app.delete('/zone/:id', zoneController.remove);
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

const BUILDING = { id: 'bld1', name: 'Bat A', address: '1 rue X' };
const ZONE = { id: 'z1', name: 'Zone Nord', buildingId: 'bld1' };

describe('GET /zone', () => {
  it('returns 200 with all zones', async () => {
    db.zone.findMany.mockResolvedValue([ZONE]);
    const res = await request(app).get('/zone');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([ZONE]);
  });

  it('filters by buildingId query param', async () => {
    db.zone.findMany.mockResolvedValue([ZONE]);
    await request(app).get('/zone?building=bld1');
    expect(db.zone.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { buildingId: 'bld1' } }),
    );
  });

  it('returns 500 on DB error', async () => {
    db.zone.findMany.mockRejectedValue(new Error('DB down'));
    const res = await request(app).get('/zone');
    expect(res.status).toBe(500);
  });
});

describe('GET /zone/:id', () => {
  it('returns 200 when found', async () => {
    db.zone.findUnique.mockResolvedValue(ZONE);
    const res = await request(app).get('/zone/z1');
    expect(res.status).toBe(200);
    expect(res.body).toEqual(ZONE);
  });

  it('returns 404 when not found', async () => {
    db.zone.findUnique.mockResolvedValue(null);
    const res = await request(app).get('/zone/unknown');
    expect(res.status).toBe(404);
  });
});

describe('POST /building/:id/zone', () => {
  it('returns 201 when building exists', async () => {
    db.building.findUnique.mockResolvedValue(BUILDING);
    db.zone.create.mockResolvedValue(ZONE);
    const res = await request(app).post('/building/bld1/zone').send({ name: 'Zone Nord' });
    expect(res.status).toBe(201);
    expect(res.body).toEqual(ZONE);
  });

  it('returns 404 when building not found', async () => {
    db.building.findUnique.mockResolvedValue(null);
    const res = await request(app).post('/building/unknown/zone').send({ name: 'Zone Nord' });
    expect(res.status).toBe(404);
  });

  it('returns 400 on DB create error', async () => {
    db.building.findUnique.mockResolvedValue(BUILDING);
    db.zone.create.mockRejectedValue(new Error('constraint'));
    const res = await request(app).post('/building/bld1/zone').send({});
    expect(res.status).toBe(400);
  });
});

describe('PATCH /zone/:id', () => {
  it('returns 200 with updated zone', async () => {
    const updated = { ...ZONE, name: 'Zone Sud' };
    db.zone.findUnique.mockResolvedValue(ZONE);
    db.zone.update.mockResolvedValue(updated);
    const res = await request(app).patch('/zone/z1').send({ name: 'Zone Sud' });
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Zone Sud');
  });

  it('returns 404 when zone not found', async () => {
    db.zone.findUnique.mockResolvedValue(null);
    const res = await request(app).patch('/zone/unknown').send({ name: 'X' });
    expect(res.status).toBe(404);
  });
});

describe('DELETE /zone/:id', () => {
  it('returns 204 on success', async () => {
    db.zone.findUnique.mockResolvedValue(ZONE);
    db.zone.delete.mockResolvedValue(ZONE);
    const res = await request(app).delete('/zone/z1');
    expect(res.status).toBe(204);
  });

  it('returns 404 when not found', async () => {
    db.zone.findUnique.mockResolvedValue(null);
    const res = await request(app).delete('/zone/unknown');
    expect(res.status).toBe(404);
  });

  it('returns 500 on DB delete error', async () => {
    db.zone.findUnique.mockResolvedValue(ZONE);
    db.zone.delete.mockRejectedValue(new Error('DB error'));
    const res = await request(app).delete('/zone/z1');
    expect(res.status).toBe(500);
  });
});

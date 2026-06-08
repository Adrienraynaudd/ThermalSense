jest.mock('@prisma/adapter-better-sqlite3', () => ({
  PrismaBetterSqlite3: jest.fn().mockImplementation(() => ({})),
}));
jest.mock('dotenv/config', () => ({}));
jest.mock('better-sqlite3', () => jest.fn().mockImplementation(() => ({})));
jest.mock('@prisma/client', () => ({
  PrismaClient: jest.fn().mockImplementation(() => ({
    zone: { findUnique: jest.fn() },
    actuator: {
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
import * as actuatorController from '../controllers/actuator.controller';

function createApp() {
  const app = express();
  app.use(express.json());
  app.get('/actuator', actuatorController.getAll);
  app.get('/actuators', actuatorController.getAll);
  app.post('/zone/:id/actuator', actuatorController.create);
  app.get('/actuator/:id', actuatorController.getById);
  app.get('/actuators/:id/commands', actuatorController.getCommands);
  app.post('/actuators/:id/commands', actuatorController.createCommand);
  app.patch('/actuator/:id', actuatorController.update);
  app.delete('/actuator/:id', actuatorController.remove);
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
const ACTUATOR = { id: 'a1', type: 'fan', status: 'off', zoneId: 'z1' };

describe('GET /actuator', () => {
  it('returns 200 with all actuators', async () => {
    db.actuator.findMany.mockResolvedValue([ACTUATOR]);
    const res = await request(app).get('/actuator');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([ACTUATOR]);
  });

  it('filters by zone query param', async () => {
    db.actuator.findMany.mockResolvedValue([ACTUATOR]);
    await request(app).get('/actuator?zone=z1');
    expect(db.actuator.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ zoneId: 'z1' }) }),
    );
  });

  it('returns 500 on DB error', async () => {
    db.actuator.findMany.mockRejectedValue(new Error('DB down'));
    const res = await request(app).get('/actuator');
    expect(res.status).toBe(500);
  });
});

describe('GET /actuator/:id', () => {
  it('returns 200 when found', async () => {
    db.actuator.findUnique.mockResolvedValue(ACTUATOR);
    const res = await request(app).get('/actuator/a1');
    expect(res.status).toBe(200);
    expect(res.body).toEqual(ACTUATOR);
  });

  it('returns 404 when not found', async () => {
    db.actuator.findUnique.mockResolvedValue(null);
    const res = await request(app).get('/actuator/unknown');
    expect(res.status).toBe(404);
  });
});

describe('GET /actuators/:id/commands (delegates to getById)', () => {
  it('returns 200 with actuator data', async () => {
    db.actuator.findUnique.mockResolvedValue(ACTUATOR);
    const res = await request(app).get('/actuators/a1/commands');
    expect(res.status).toBe(200);
    expect(res.body).toEqual(ACTUATOR);
  });
});

describe('POST /zone/:id/actuator', () => {
  it('returns 201 when zone exists', async () => {
    db.zone.findUnique.mockResolvedValue(ZONE);
    db.actuator.create.mockResolvedValue(ACTUATOR);
    const res = await request(app).post('/zone/z1/actuator').send({ type: 'fan', status: 'off' });
    expect(res.status).toBe(201);
    expect(res.body).toEqual(ACTUATOR);
  });

  it('returns 404 when zone not found', async () => {
    db.zone.findUnique.mockResolvedValue(null);
    const res = await request(app).post('/zone/unknown/actuator').send({ type: 'fan' });
    expect(res.status).toBe(404);
  });

  it('returns 400 on DB create error', async () => {
    db.zone.findUnique.mockResolvedValue(ZONE);
    db.actuator.create.mockRejectedValue(new Error('constraint'));
    const res = await request(app).post('/zone/z1/actuator').send({});
    expect(res.status).toBe(400);
  });
});

describe('PATCH /actuator/:id', () => {
  it('returns 200 with updated actuator', async () => {
    const updated = { ...ACTUATOR, status: 'on' };
    db.actuator.findUnique.mockResolvedValue(ACTUATOR);
    db.actuator.update.mockResolvedValue(updated);
    const res = await request(app).patch('/actuator/a1').send({ status: 'on' });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('on');
  });

  it('returns 404 when actuator not found', async () => {
    db.actuator.findUnique.mockResolvedValue(null);
    const res = await request(app).patch('/actuator/unknown').send({ status: 'on' });
    expect(res.status).toBe(404);
  });
});

describe('POST /actuators/:id/commands (delegates to update)', () => {
  it('returns 200 when actuator found', async () => {
    const updated = { ...ACTUATOR, status: 'on' };
    db.actuator.findUnique.mockResolvedValue(ACTUATOR);
    db.actuator.update.mockResolvedValue(updated);
    const res = await request(app).post('/actuators/a1/commands').send({ status: 'on' });
    expect(res.status).toBe(200);
  });
});

describe('DELETE /actuator/:id', () => {
  it('returns 204 on success', async () => {
    db.actuator.findUnique.mockResolvedValue(ACTUATOR);
    db.actuator.delete.mockResolvedValue(ACTUATOR);
    const res = await request(app).delete('/actuator/a1');
    expect(res.status).toBe(204);
  });

  it('returns 404 when not found', async () => {
    db.actuator.findUnique.mockResolvedValue(null);
    const res = await request(app).delete('/actuator/unknown');
    expect(res.status).toBe(404);
  });

  it('returns 500 on DB delete error', async () => {
    db.actuator.findUnique.mockResolvedValue(ACTUATOR);
    db.actuator.delete.mockRejectedValue(new Error('DB error'));
    const res = await request(app).delete('/actuator/a1');
    expect(res.status).toBe(500);
  });
});

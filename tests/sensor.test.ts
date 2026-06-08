jest.mock('@prisma/adapter-better-sqlite3', () => ({
  PrismaBetterSqlite3: jest.fn().mockImplementation(() => ({})),
}));
jest.mock('dotenv/config', () => ({}));
jest.mock('better-sqlite3', () => jest.fn().mockImplementation(() => ({})));
jest.mock('@prisma/client', () => ({
  PrismaClient: jest.fn().mockImplementation(() => ({
    zone: { findUnique: jest.fn() },
    sensor: {
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
import * as sensorController from '../controllers/sensor.controller';

function createApp() {
  const app = express();
  app.use(express.json());
  app.get('/sensor', sensorController.getAll);
  app.get('/sensors', sensorController.getAll);
  app.post('/sensors', sensorController.createFromBody);
  app.post('/zone/:id/sensor', sensorController.create);
  app.get('/sensor/:id', sensorController.getById);
  app.get('/sensors/:id', sensorController.getById);
  app.get('/sensors/:id/config', sensorController.getConfig);
  app.patch('/sensors/:id/config', sensorController.updateConfig);
  app.patch('/sensor/:id', sensorController.update);
  app.delete('/sensor/:id', sensorController.remove);
  app.delete('/sensors/:id', sensorController.remove);
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
const SENSOR = { id: 's1', type: 'temperature', status: 'active', zoneId: 'z1' };

describe('GET /sensor', () => {
  it('returns 200 with all sensors', async () => {
    db.sensor.findMany.mockResolvedValue([SENSOR]);
    const res = await request(app).get('/sensor');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([SENSOR]);
  });

  it('filters by zone query param', async () => {
    db.sensor.findMany.mockResolvedValue([SENSOR]);
    await request(app).get('/sensor?zone=z1');
    expect(db.sensor.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ zoneId: 'z1' }) }),
    );
  });

  it('returns 500 on DB error', async () => {
    db.sensor.findMany.mockRejectedValue(new Error('DB down'));
    const res = await request(app).get('/sensor');
    expect(res.status).toBe(500);
  });
});

describe('GET /sensor/:id', () => {
  it('returns 200 when found', async () => {
    db.sensor.findUnique.mockResolvedValue(SENSOR);
    const res = await request(app).get('/sensor/s1');
    expect(res.status).toBe(200);
    expect(res.body).toEqual(SENSOR);
  });

  it('returns 404 when not found', async () => {
    db.sensor.findUnique.mockResolvedValue(null);
    const res = await request(app).get('/sensor/unknown');
    expect(res.status).toBe(404);
  });
});

describe('GET /sensors/:id/config', () => {
  it('returns 200 with sensor config (delegates to getById)', async () => {
    db.sensor.findUnique.mockResolvedValue(SENSOR);
    const res = await request(app).get('/sensors/s1/config');
    expect(res.status).toBe(200);
    expect(res.body).toEqual(SENSOR);
  });
});

describe('POST /zone/:id/sensor', () => {
  it('returns 201 when zone exists', async () => {
    db.zone.findUnique.mockResolvedValue(ZONE);
    db.sensor.create.mockResolvedValue(SENSOR);
    const res = await request(app).post('/zone/z1/sensor').send({ type: 'temperature', status: 'active' });
    expect(res.status).toBe(201);
    expect(res.body).toEqual(SENSOR);
  });

  it('returns 404 when zone not found', async () => {
    db.zone.findUnique.mockResolvedValue(null);
    const res = await request(app).post('/zone/unknown/sensor').send({ type: 'temperature' });
    expect(res.status).toBe(404);
  });

  it('returns 400 on DB create error', async () => {
    db.zone.findUnique.mockResolvedValue(ZONE);
    db.sensor.create.mockRejectedValue(new Error('constraint'));
    const res = await request(app).post('/zone/z1/sensor').send({});
    expect(res.status).toBe(400);
  });
});

describe('POST /sensors (createFromBody)', () => {
  it('returns 201 with valid body', async () => {
    db.zone.findUnique.mockResolvedValue(ZONE);
    db.sensor.create.mockResolvedValue(SENSOR);
    const res = await request(app)
      .post('/sensors')
      .send({ zoneId: 'z1', type: 'temperature', status: 'active' });
    expect(res.status).toBe(201);
  });

  it('returns 400 when required fields are missing', async () => {
    const res = await request(app).post('/sensors').send({ zoneId: 'z1' });
    expect(res.status).toBe(400);
  });

  it('returns 404 when zone not found', async () => {
    db.zone.findUnique.mockResolvedValue(null);
    const res = await request(app)
      .post('/sensors')
      .send({ zoneId: 'unknown', type: 'temperature', status: 'active' });
    expect(res.status).toBe(404);
  });
});

describe('PATCH /sensor/:id', () => {
  it('returns 200 with updated sensor', async () => {
    const updated = { ...SENSOR, status: 'inactive' };
    db.sensor.findUnique.mockResolvedValue(SENSOR);
    db.sensor.update.mockResolvedValue(updated);
    const res = await request(app).patch('/sensor/s1').send({ status: 'inactive' });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('inactive');
  });

  it('returns 404 when sensor not found', async () => {
    db.sensor.findUnique.mockResolvedValue(null);
    const res = await request(app).patch('/sensor/unknown').send({ status: 'inactive' });
    expect(res.status).toBe(404);
  });
});

describe('PATCH /sensors/:id/config', () => {
  it('returns 200 (delegates to update)', async () => {
    const updated = { ...SENSOR, type: 'humidity' };
    db.sensor.findUnique.mockResolvedValue(SENSOR);
    db.sensor.update.mockResolvedValue(updated);
    const res = await request(app).patch('/sensors/s1/config').send({ type: 'humidity' });
    expect(res.status).toBe(200);
  });
});

describe('DELETE /sensor/:id', () => {
  it('returns 204 on success', async () => {
    db.sensor.findUnique.mockResolvedValue(SENSOR);
    db.sensor.delete.mockResolvedValue(SENSOR);
    const res = await request(app).delete('/sensor/s1');
    expect(res.status).toBe(204);
  });

  it('returns 404 when sensor not found', async () => {
    db.sensor.findUnique.mockResolvedValue(null);
    const res = await request(app).delete('/sensor/unknown');
    expect(res.status).toBe(404);
  });

  it('returns 500 on DB delete error', async () => {
    db.sensor.findUnique.mockResolvedValue(SENSOR);
    db.sensor.delete.mockRejectedValue(new Error('DB error'));
    const res = await request(app).delete('/sensor/s1');
    expect(res.status).toBe(500);
  });
});

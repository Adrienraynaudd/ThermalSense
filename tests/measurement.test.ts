jest.mock('@prisma/adapter-better-sqlite3', () => ({
  PrismaBetterSqlite3: jest.fn().mockImplementation(() => ({})),
}));
jest.mock('dotenv/config', () => ({}));
jest.mock('better-sqlite3', () => jest.fn().mockImplementation(() => ({})));
jest.mock('@prisma/client', () => ({
  PrismaClient: jest.fn().mockImplementation(() => ({
    sensor: { findUnique: jest.fn() },
    measurement: {
      findMany: jest.fn(),
      create: jest.fn(),
    },
  })),
}));
jest.mock('../utils/idempotencyStore', () => ({
  getIdempotentResponse: jest.fn().mockReturnValue(null),
  saveIdempotentResponse: jest.fn(),
}));
jest.mock('../utils/measurementQueue', () => ({
  enqueueMeasurement: jest.fn().mockReturnValue({ id: 'q1' }),
  startQueueFlusher: jest.fn(),
}));

import request from 'supertest';
import express from 'express';
import { PrismaClient } from '@prisma/client';
import { getIdempotentResponse, saveIdempotentResponse } from '../utils/idempotencyStore';
import { enqueueMeasurement } from '../utils/measurementQueue';
import * as measurementController from '../controllers/measurement.controller';

function createApp() {
  const app = express();
  app.use(express.json());
  app.get('/measurement', measurementController.getAll);
  app.post('/sensor/:id/measurement', measurementController.create);
  app.post('/sensors/:id/measurement', measurementController.create);
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
  (getIdempotentResponse as jest.Mock).mockReturnValue(null);
  delete process.env.SIMULATE_DB_DOWN;
});

const SENSOR = { id: 's1', type: 'temperature', status: 'active', zoneId: 'z1' };
const MEASUREMENT = { id: 'm1', value: 22.5, sensorId: 's1', timestamp: new Date().toISOString() };

describe('GET /measurement', () => {
  it('returns 200 with measurements', async () => {
    db.measurement.findMany.mockResolvedValue([MEASUREMENT]);
    const res = await request(app).get('/measurement');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([MEASUREMENT]);
  });

  it('applies pagination (limit/offset)', async () => {
    db.measurement.findMany.mockResolvedValue([]);
    await request(app).get('/measurement?limit=5&offset=10');
    expect(db.measurement.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 5, skip: 10 }),
    );
  });

  it('filters by sensorId', async () => {
    db.measurement.findMany.mockResolvedValue([MEASUREMENT]);
    await request(app).get('/measurement?sensorId=s1');
    expect(db.measurement.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ sensorId: 's1' }) }),
    );
  });

  it('returns 500 on DB error', async () => {
    db.measurement.findMany.mockRejectedValue(new Error('DB down'));
    const res = await request(app).get('/measurement');
    expect(res.status).toBe(500);
  });
});

describe('POST /sensor/:id/measurement', () => {
  it('returns 201 with created measurement', async () => {
    db.sensor.findUnique.mockResolvedValue(SENSOR);
    db.measurement.create.mockResolvedValue(MEASUREMENT);
    const res = await request(app).post('/sensor/s1/measurement').send({ value: 22.5 });
    expect(res.status).toBe(201);
    expect(res.body).toEqual(MEASUREMENT);
  });

  it('returns 400 when value is not a number', async () => {
    const res = await request(app).post('/sensor/s1/measurement').send({ value: 'hot' });
    expect(res.status).toBe(400);
  });

  it('returns 400 when value is missing', async () => {
    const res = await request(app).post('/sensor/s1/measurement').send({});
    expect(res.status).toBe(400);
  });

  it('returns 404 when sensor not found', async () => {
    db.sensor.findUnique.mockResolvedValue(null);
    const res = await request(app).post('/sensor/unknown/measurement').send({ value: 22.5 });
    expect(res.status).toBe(404);
  });

  it('returns 202 in degraded mode when DB fails', async () => {
    process.env.SIMULATE_DB_DOWN = 'true';
    const res = await request(app).post('/sensor/s1/measurement').send({ value: 22.5 });
    expect(res.status).toBe(202);
    expect(res.body.queued).toBe(true);
    expect(enqueueMeasurement).toHaveBeenCalledWith({ sensorId: 's1', value: 22.5 });
  });

  it('replays idempotent response when key already used', async () => {
    (getIdempotentResponse as jest.Mock).mockReturnValue({
      statusCode: 201,
      body: MEASUREMENT,
    });
    const res = await request(app)
      .post('/sensor/s1/measurement')
      .set('Idempotency-Key', 'key-abc')
      .send({ value: 22.5 });
    expect(res.status).toBe(201);
    expect(res.headers['idempotent-replayed']).toBe('true');
    expect(db.sensor.findUnique).not.toHaveBeenCalled();
  });

  it('saves idempotency response on first call', async () => {
    db.sensor.findUnique.mockResolvedValue(SENSOR);
    db.measurement.create.mockResolvedValue(MEASUREMENT);
    await request(app)
      .post('/sensor/s1/measurement')
      .set('Idempotency-Key', 'key-new')
      .send({ value: 22.5 });
    expect(saveIdempotentResponse).toHaveBeenCalledWith('key-new', 201, MEASUREMENT);
  });
});

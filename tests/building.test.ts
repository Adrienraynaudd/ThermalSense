jest.mock('@prisma/adapter-better-sqlite3', () => ({
  PrismaBetterSqlite3: jest.fn().mockImplementation(() => ({})),
}));
jest.mock('dotenv/config', () => ({}));
jest.mock('better-sqlite3', () => jest.fn().mockImplementation(() => ({})));
jest.mock('@prisma/client', () => ({
  PrismaClient: jest.fn().mockImplementation(() => ({
    building: {
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
import * as buildingController from '../controllers/building.controller';

function createApp() {
  const app = express();
  app.use(express.json());
  app.get('/building', buildingController.getAll);
  app.post('/building', buildingController.create);
  app.get('/building/:id', buildingController.getById);
  app.patch('/building/:id', buildingController.update);
  app.delete('/building/:id', buildingController.remove);
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

const BUILDING = { id: 'b1', name: 'Bat A', address: '1 rue X' };

describe('GET /building', () => {
  it('returns 200 with an array', async () => {
    db.building.findMany.mockResolvedValue([BUILDING]);
    const res = await request(app).get('/building');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([BUILDING]);
  });

  it('returns 500 on DB error', async () => {
    db.building.findMany.mockRejectedValue(new Error('DB down'));
    const res = await request(app).get('/building');
    expect(res.status).toBe(500);
  });
});

describe('GET /building/:id', () => {
  it('returns 200 when found', async () => {
    db.building.findUnique.mockResolvedValue(BUILDING);
    const res = await request(app).get('/building/b1');
    expect(res.status).toBe(200);
    expect(res.body).toEqual(BUILDING);
  });

  it('returns 404 when not found', async () => {
    db.building.findUnique.mockResolvedValue(null);
    const res = await request(app).get('/building/unknown');
    expect(res.status).toBe(404);
  });
});

describe('POST /building', () => {
  it('returns 201 with created resource', async () => {
    db.building.create.mockResolvedValue(BUILDING);
    const res = await request(app).post('/building').send({ name: 'Bat A', address: '1 rue X' });
    expect(res.status).toBe(201);
    expect(res.body).toEqual(BUILDING);
  });

  it('returns 400 on invalid data', async () => {
    db.building.create.mockRejectedValue(new Error('invalid'));
    const res = await request(app).post('/building').send({});
    expect(res.status).toBe(400);
  });
});

describe('PATCH /building/:id', () => {
  it('returns 200 with updated resource', async () => {
    const updated = { ...BUILDING, name: 'Bat B' };
    db.building.update.mockResolvedValue(updated);
    const res = await request(app).patch('/building/b1').send({ name: 'Bat B' });
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Bat B');
  });

  it('returns 404 when resource does not exist', async () => {
    db.building.update.mockRejectedValue(new Error('Not found'));
    const res = await request(app).patch('/building/unknown').send({ name: 'X' });
    expect(res.status).toBe(404);
  });
});

describe('DELETE /building/:id', () => {
  it('returns 204 on success', async () => {
    db.building.delete.mockResolvedValue(BUILDING);
    const res = await request(app).delete('/building/b1');
    expect(res.status).toBe(204);
  });

  it('returns 404 when not found', async () => {
    db.building.delete.mockRejectedValue(new Error('Not found'));
    const res = await request(app).delete('/building/unknown');
    expect(res.status).toBe(404);
  });
});

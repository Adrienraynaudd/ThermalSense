jest.mock('@prisma/adapter-better-sqlite3', () => ({
  PrismaBetterSqlite3: jest.fn().mockImplementation(() => ({})),
}));
jest.mock('dotenv/config', () => ({}));
jest.mock('better-sqlite3', () => jest.fn().mockImplementation(() => ({})));
jest.mock('@prisma/client', () => ({
  PrismaClient: jest.fn().mockImplementation(() => ({
    actuator: { findUnique: jest.fn() },
    actuatorCommand: {
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
import * as actuatorCommandController from '../controllers/actuatorCommand.controller';

function createApp() {
  const app = express();
  app.use(express.json());
  app.get('/actuator/:id/commands', actuatorCommandController.getAll);
  app.post('/actuator/:id/command', actuatorCommandController.create);
  app.post('/actuator/:id/commands', actuatorCommandController.send);
  app.get('/actuator-command/:id', actuatorCommandController.getById);
  app.patch('/actuator-command/:id', actuatorCommandController.update);
  app.delete('/actuator-command/:id', actuatorCommandController.remove);
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

const ACTUATOR = { id: 'a1', type: 'fan', status: 'off', zoneId: 'z1' };
const CMD = { id: 'c1', command: 'ON', status: 'PENDING', actuatorId: 'a1' };

describe('GET /actuator/:id/commands', () => {
  it('returns 200 with commands when actuator exists', async () => {
    db.actuator.findUnique.mockResolvedValue(ACTUATOR);
    db.actuatorCommand.findMany.mockResolvedValue([CMD]);
    const res = await request(app).get('/actuator/a1/commands');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([CMD]);
  });

  it('returns 404 when actuator not found', async () => {
    db.actuator.findUnique.mockResolvedValue(null);
    const res = await request(app).get('/actuator/unknown/commands');
    expect(res.status).toBe(404);
  });

  it('returns 500 on DB error', async () => {
    db.actuator.findUnique.mockRejectedValue(new Error('DB down'));
    const res = await request(app).get('/actuator/a1/commands');
    expect(res.status).toBe(500);
  });
});

describe('GET /actuator-command/:id', () => {
  it('returns 200 when command found', async () => {
    db.actuatorCommand.findUnique.mockResolvedValue(CMD);
    const res = await request(app).get('/actuator-command/c1');
    expect(res.status).toBe(200);
    expect(res.body).toEqual(CMD);
  });

  it('returns 404 when not found', async () => {
    db.actuatorCommand.findUnique.mockResolvedValue(null);
    const res = await request(app).get('/actuator-command/unknown');
    expect(res.status).toBe(404);
  });
});

describe('POST /actuator/:id/command (create pending)', () => {
  it('returns 201 with created command', async () => {
    db.actuator.findUnique.mockResolvedValue(ACTUATOR);
    db.actuatorCommand.create.mockResolvedValue(CMD);
    const res = await request(app).post('/actuator/a1/command').send({ command: 'ON' });
    expect(res.status).toBe(201);
    expect(res.body).toEqual(CMD);
  });

  it('returns 400 when command field is missing', async () => {
    const res = await request(app).post('/actuator/a1/command').send({});
    expect(res.status).toBe(400);
  });

  it('returns 400 when command is not a string', async () => {
    const res = await request(app).post('/actuator/a1/command').send({ command: 42 });
    expect(res.status).toBe(400);
  });

  it('returns 404 when actuator not found', async () => {
    db.actuator.findUnique.mockResolvedValue(null);
    const res = await request(app).post('/actuator/unknown/command').send({ command: 'ON' });
    expect(res.status).toBe(404);
  });
});

describe('POST /actuator/:id/commands (send — status SENT)', () => {
  it('returns 201 with SENT status', async () => {
    const sentCmd = { ...CMD, status: 'SENT' };
    db.actuator.findUnique.mockResolvedValue(ACTUATOR);
    db.actuatorCommand.create.mockResolvedValue(sentCmd);
    const res = await request(app).post('/actuator/a1/commands').send({ command: 'ON' });
    expect(res.status).toBe(201);
    expect(db.actuatorCommand.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'SENT' }) }),
    );
  });

  it('returns 400 when command is missing', async () => {
    const res = await request(app).post('/actuator/a1/commands').send({});
    expect(res.status).toBe(400);
  });

  it('returns 404 when actuator not found', async () => {
    db.actuator.findUnique.mockResolvedValue(null);
    const res = await request(app).post('/actuator/unknown/commands').send({ command: 'ON' });
    expect(res.status).toBe(404);
  });
});

describe('PATCH /actuator-command/:id', () => {
  it('returns 200 with updated command', async () => {
    const updated = { ...CMD, status: 'DONE' };
    db.actuatorCommand.findUnique.mockResolvedValue(CMD);
    db.actuatorCommand.update.mockResolvedValue(updated);
    const res = await request(app).patch('/actuator-command/c1').send({ status: 'DONE' });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('DONE');
  });

  it('returns 404 when command not found', async () => {
    db.actuatorCommand.findUnique.mockResolvedValue(null);
    const res = await request(app).patch('/actuator-command/unknown').send({ status: 'DONE' });
    expect(res.status).toBe(404);
  });
});

describe('DELETE /actuator-command/:id', () => {
  it('returns 204 on success', async () => {
    db.actuatorCommand.findUnique.mockResolvedValue(CMD);
    db.actuatorCommand.delete.mockResolvedValue(CMD);
    const res = await request(app).delete('/actuator-command/c1');
    expect(res.status).toBe(204);
  });

  it('returns 404 when not found', async () => {
    db.actuatorCommand.findUnique.mockResolvedValue(null);
    const res = await request(app).delete('/actuator-command/unknown');
    expect(res.status).toBe(404);
  });

  it('returns 500 on DB delete error', async () => {
    db.actuatorCommand.findUnique.mockResolvedValue(CMD);
    db.actuatorCommand.delete.mockRejectedValue(new Error('DB error'));
    const res = await request(app).delete('/actuator-command/c1');
    expect(res.status).toBe(500);
  });
});

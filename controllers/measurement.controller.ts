import "dotenv/config";
import type { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';
import { getIdempotentResponse, saveIdempotentResponse,} from '../utils/idempotencyStore';
import { enqueueMeasurement } from '../utils/measurementQueue';

const adapter = new PrismaBetterSqlite3({ url: './dev.db' });
const prisma = new PrismaClient({ adapter });

const readIdempotencyKey = (req: Request): string | null => {
  const header = req.header('Idempotency-Key');
  if (typeof header === 'string' && header.trim()) return header.trim();
  const fromBody = (req.body as { idempotencyKey?: unknown })?.idempotencyKey;
  if (typeof fromBody === 'string' && fromBody.trim()) return fromBody.trim();
  return null;
};

export const getAll = async (req: Request, res: Response): Promise<void> => {
  try {
    const { zoneId, sensorId, type, startDate, endDate, limit = 20, offset = 0 } = req.query;
    
    const measurements = await prisma.measurement.findMany({
      where: {
        ...(sensorId && { sensorId: String(sensorId) }),
        ...(zoneId && { sensor: { zoneId: String(zoneId) } }),
        ...(type && { sensor: { type: String(type) } }),
        ...(startDate || endDate ? {
          timestamp: {
            ...(startDate && { gte: new Date(String(startDate)) }),
            ...(endDate && { lte: new Date(String(endDate)) }),
          }
        } : {})
      },
      take: Number(limit),
      skip: Number(offset),
      orderBy: { timestamp: 'desc' }
    });
    res.status(200).json(measurements);
  } catch (error) {
    res.status(500).json({ message: "Internal server error" });
  }
};

export const create = async (req: Request, res: Response): Promise<void> => {
  const sensorId = req.params.id as string;
  const idempotencyKey = readIdempotencyKey(req);


  if (idempotencyKey) {
    const replay = getIdempotentResponse(idempotencyKey);
    if (replay) {
      res.setHeader('Idempotent-Replayed', 'true');
      res.status(replay.statusCode).json(replay.body);
      return;
    }
  }

  const value = (req.body as { value?: unknown })?.value;
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    res.status(400).json({ message: "Bad request: 'value' must be a finite number" });
    return;
  }

  const simulateDbDown = process.env.SIMULATE_DB_DOWN === 'true';

  try {
    if (simulateDbDown) throw new Error('Simulated database outage');

    const sensor = await prisma.sensor.findUnique({ where: { id: sensorId } });
    if (!sensor) {
      res.status(404).json({ message: "Not found" });
      return;
    }
    const measurement = await prisma.measurement.create({
      data: { value, sensorId },
    });
    if (idempotencyKey) saveIdempotentResponse(idempotencyKey, 201, measurement);
    res.status(201).json(measurement);
  } catch (error) {
    const queued = enqueueMeasurement({ sensorId, value });
    const body = {
      message: 'Measurement accepted in degraded mode; it will be persisted once the database recovers.',
      queued: true,
      queueId: queued.id,
      sensorId,
      value,
    };
    if (idempotencyKey) saveIdempotentResponse(idempotencyKey, 202, body);
    res.status(202).json(body);
  }
};
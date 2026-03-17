import "dotenv/config";
import type { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import Database from 'better-sqlite3';
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';

const adapter = new PrismaBetterSqlite3({ url: './dev.db' });
const prisma = new PrismaClient({ adapter });

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
  try {
    const id = req.params.id as string;
    const sensor = await prisma.sensor.findUnique({ where: { id } });
    if (!sensor) {
      res.status(404).json({ message: "Not found" });
      return;
    }
    const measurement = await prisma.measurement.create({ 
      data: { ...req.body, sensorId: req.params.id } 
    });
    res.status(201).json(measurement);
  } catch (error) {
    res.status(400).json({ message: "Bad request" });
  }
};
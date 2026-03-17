import "dotenv/config";
import type { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import Database from 'better-sqlite3';
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';

const adapter = new PrismaBetterSqlite3({ url: './dev.db' });
const prisma = new PrismaClient({ adapter });

export const getAll = async (req: Request, res: Response): Promise<void> => {
  try {
    const { building, zone } = req.query;
    const actuators = await prisma.actuator.findMany({
      where: {
        ...(zone && { zoneId: String(zone) }),
        ...(building && { zone: { buildingId: String(building) } })
      }
    });
    res.status(200).json(actuators);
  } catch (error) {
    res.status(500).json({ message: "Internal server error" });
  }
};

export const getById = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string;
    if (!id) {
      res.status(400).json({ message: "Bad request" });
      return;
    }
    const actuator = await prisma.actuator.findUnique({ where: { id } });
    if (!actuator) {
      res.status(404).json({ message: "Not found" });
      return;
    }
    res.status(200).json(actuator);
  } catch (error) {
    res.status(500).json({ message: "Internal server error" });
  }
};

export const create = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string;
    if (!id) {
      res.status(400).json({ message: "Bad request" });
      return;
    }
    const zone = await prisma.zone.findUnique({ where: { id } });
    if (!zone) {
      res.status(404).json({ message: "Not found" });
      return;
    }
    const actuator = await prisma.actuator.create({ 
      data: { ...req.body, zoneId: id } 
    });
    res.status(201).json(actuator);
  } catch (error) {
    res.status(400).json({ message: "Bad request" });
  }
};

export const update = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string;
    if (!id) {
      res.status(400).json({ message: "Bad request" });
      return;
    }
    const actuator = await prisma.actuator.findUnique({ where: { id } });
    if (!actuator) {
      res.status(404).json({ message: "Not found" });
      return;
    }
    const updatedActuator = await prisma.actuator.update({ 
      where: { id }, 
      data: req.body 
    });
    res.status(200).json(updatedActuator);
  } catch (error) {
    res.status(400).json({ message: "Bad request" });
  }
};

export const remove = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string;
    if (!id) {
      res.status(400).json({ message: "Bad request" });
      return;
    }
    const actuator = await prisma.actuator.findUnique({ where: { id } });
    if (!actuator) {
      res.status(404).json({ message: "Not found" });
      return;
    }
    await prisma.actuator.delete({ where: { id } });
    res.status(204).send();
  } catch (error) {
    res.status(500).json({ message: "Internal server error" });
  }
};
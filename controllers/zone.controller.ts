import "dotenv/config";
import type { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import Database from 'better-sqlite3';
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';

const adapter = new PrismaBetterSqlite3({ url: './dev.db' });
const prisma = new PrismaClient({ adapter });

export const getAll = async (req: Request, res: Response): Promise<void> => {
  try {
    const { building } = req.query;
    const zones = await prisma.zone.findMany({
      where: building ? { buildingId: String(building) } : {}
    });
    res.status(200).json(zones);
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
    const zone = await prisma.zone.findUnique({ where: { id } });
    if (!zone) {
      res.status(404).json({ message: "Not found" });
      return;
    }
    res.status(200).json(zone);
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
    const building = await prisma.building.findUnique({ where: { id } });
    if (!building) {
      res.status(404).json({ message: "Not found" });
      return;
    }
    const zone = await prisma.zone.create({ 
      data: { ...req.body, buildingId: id } 
    });
    res.status(201).json(zone);
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
    const zone = await prisma.zone.findUnique({ where: { id } });
    if (!zone) {
      res.status(404).json({ message: "Not found" });
      return;
    }
    const updatedZone = await prisma.zone.update({ 
      where: { id }, 
      data: req.body 
    });
    res.status(200).json(updatedZone);
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
    const zone = await prisma.zone.findUnique({ where: { id } });
    if (!zone) {
      res.status(404).json({ message: "Not found" });
      return;
    }
    await prisma.zone.delete({ where: { id } });
    res.status(204).send();
  } catch (error) {
    res.status(500).json({ message: "Internal server error" });
  }
};
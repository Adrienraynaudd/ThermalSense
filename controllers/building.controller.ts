import "dotenv/config";
import type { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import Database from 'better-sqlite3';
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';

const adapter = new PrismaBetterSqlite3({ url: './dev.db' });
const prisma = new PrismaClient({ adapter });

export const getAll = async (req: Request, res: Response): Promise<void> => {
  try {
    const buildings = await prisma.building.findMany();
    res.status(200).json(buildings);
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
    const building = await prisma.building.findUnique({ where: { id } });
    if (!building) {
      res.status(404).json({ message: "Not found" });
      return;
    }
    res.status(200).json(building);
  } catch (error) {
    res.status(500).json({ message: "Internal server error" });
  }
};

export const create = async (req: Request, res: Response): Promise<void> => {
  try {
    const building = await prisma.building.create({ data: req.body });
    res.status(201).json(building);
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
    const building = await prisma.building.update({ 
      where: { id }, 
      data: req.body 
    });
    res.status(200).json(building);
  } catch (error) {
    res.status(404).json({ message: "Not found or Bad request" });
  }
};

export const remove = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string;
    if (!id) {
      res.status(400).json({ message: "Bad request" });
      return;
    }
    await prisma.building.delete({ where: { id } });
    res.status(204).send();
  } catch (error) {
    res.status(404).json({ message: "Not found" });
  }
};
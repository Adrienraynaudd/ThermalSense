import "dotenv/config";
import type { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import Database from 'better-sqlite3';
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';

const adapter = new PrismaBetterSqlite3({ url: './dev.db' });
const prisma = new PrismaClient({ adapter });

export const getAll = async (req: Request, res: Response): Promise<void> => {
  try {
    const actuatorId = req.params.id;
    const actuator = await prisma.actuator.findUnique({ where: { id: actuatorId } });
    if (!actuator) {
      res.status(404).json({ message: "Not found" });
      return;
    }
    const commands = await prisma.actuatorCommand.findMany({ where: { actuatorId } });
    res.status(200).json(commands);
  } catch (error) {
    res.status(500).json({ message: "Internal server error" });
  }
};

export const getById = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id;
    const command = await prisma.actuatorCommand.findUnique({ where: { id } });
    if (!command) {
      res.status(404).json({ message: "Not found" });
      return;
    }
    res.status(200).json(command);
  } catch (error) {
    res.status(500).json({ message: "Internal server error" });
  }
};

export const create = async (req: Request, res: Response): Promise<void> => {
  try {
    const actuatorId = req.params.id;
    const { command } = req.body;
    if (!command || typeof command !== 'string') {
      res.status(400).json({ message: "Bad request: 'command' must be a non-empty string" });
      return;
    }
    const actuator = await prisma.actuator.findUnique({ where: { id: actuatorId } });
    if (!actuator) {
      res.status(404).json({ message: "Not found" });
      return;
    }
    const created = await prisma.actuatorCommand.create({
      data: { command, actuatorId }
    });
    res.status(201).json(created);
  } catch (error) {
    res.status(400).json({ message: "Bad request" });
  }
};

export const send = async (req: Request, res: Response): Promise<void> => {
  try {
    const actuatorId = req.params.id;
    const { command } = req.body;
    if (!command || typeof command !== 'string') {
      res.status(400).json({ message: "Bad request: 'command' must be a non-empty string" });
      return;
    }
    const actuator = await prisma.actuator.findUnique({ where: { id: actuatorId } });
    if (!actuator) {
      res.status(404).json({ message: "Not found" });
      return;
    }
    const created = await prisma.actuatorCommand.create({
      data: { command, actuatorId, status: "SENT" }
    });
    res.status(201).json(created);
  } catch (error) {
    res.status(400).json({ message: "Bad request" });
  }
};

export const update = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id;
    const command = await prisma.actuatorCommand.findUnique({ where: { id } });
    if (!command) {
      res.status(404).json({ message: "Not found" });
      return;
    }
    const updated = await prisma.actuatorCommand.update({ where: { id }, data: req.body });
    res.status(200).json(updated);
  } catch (error) {
    res.status(400).json({ message: "Bad request" });
  }
};

export const remove = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id;
    const command = await prisma.actuatorCommand.findUnique({ where: { id } });
    if (!command) {
      res.status(404).json({ message: "Not found" });
      return;
    }
    await prisma.actuatorCommand.delete({ where: { id } });
    res.status(204).send();
  } catch (error) {
    res.status(500).json({ message: "Internal server error" });
  }
};

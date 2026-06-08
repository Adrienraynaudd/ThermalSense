
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';

const adapter = new PrismaBetterSqlite3({ url: './dev.db' });
const prisma = new PrismaClient({ adapter });

const MAX_ATTEMPTS = 5;
const FLUSH_INTERVAL_MS = 5000;

export interface QueuedMeasurement {
  id: string;
  sensorId: string;
  value: number;
  queuedAt: string;
  attempts: number;
}

const queue: QueuedMeasurement[] = [];

export const enqueueMeasurement = (item: {
  sensorId: string;
  value: number;
}): QueuedMeasurement => {
  const entry: QueuedMeasurement = {
    id: randomUUID(),
    sensorId: item.sensorId,
    value: item.value,
    queuedAt: new Date().toISOString(),
    attempts: 0,
  };
  queue.push(entry);
  return entry;
};

export const queueSize = (): number => queue.length;

export const flushQueue = async (): Promise<void> => {
  const pending = [...queue];
  for (const entry of pending) {
    try {
      await prisma.measurement.create({
        data: { value: entry.value, sensorId: entry.sensorId },
      });
      const idx = queue.indexOf(entry);
      if (idx !== -1) queue.splice(idx, 1);
    } catch {
      entry.attempts += 1;
      if (entry.attempts >= MAX_ATTEMPTS) {
        const idx = queue.indexOf(entry);
        if (idx !== -1) queue.splice(idx, 1);
        console.error(
          `[measurementQueue] dropping measurement ${entry.id} (sensor ${entry.sensorId}) after ${MAX_ATTEMPTS} failed attempts`,
        );
      }
     }
  }
};

let timer: NodeJS.Timeout | null = null;

export const startQueueFlusher = (): void => {
  if (timer) return;
  timer = setInterval(() => {
    if (queue.length === 0) return;
    void flushQueue();
  }, FLUSH_INTERVAL_MS);
  timer.unref();
};

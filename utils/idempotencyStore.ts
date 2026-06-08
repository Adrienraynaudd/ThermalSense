
export interface StoredResponse {
  statusCode: number;
  body: unknown;
  expiresAt: number;
}

const TTL_MS = 24 * 60 * 60 * 1000; // 24h
const store = new Map<string, StoredResponse>();


export const getIdempotentResponse = (key: string): StoredResponse | null => {
  const entry = store.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    store.delete(key);
    return null;
  }
  return entry;
};

export const saveIdempotentResponse = (
  key: string,
  statusCode: number,
  body: unknown,
): void => {
  store.set(key, { statusCode, body, expiresAt: Date.now() + TTL_MS });
};

export const cleanupExpired = (): void => {
  const now = Date.now();
  for (const [key, entry] of store) {
    if (entry.expiresAt <= now) store.delete(key);
  }
};

setInterval(cleanupExpired, 60 * 60 * 1000).unref();

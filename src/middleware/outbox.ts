import { Request, Response, NextFunction } from 'express';
import { processOutboxBatch } from '../lib/outbox-processor';

const DEFAULT_INTERVAL_MS = 30_000;
const DEFAULT_BATCH_SIZE = 5;
const SKIP_PATH_PREFIXES = ['/api/internal/outbox'];

let lastFlushAt = 0;
let inFlight = false;

function shouldSkip(path: string): boolean {
  return SKIP_PATH_PREFIXES.some((prefix) => path.startsWith(prefix));
}

export function outboxFlushMiddleware(req: Request, _res: Response, next: NextFunction): void {
  if (shouldSkip(req.path)) {
    next();
    return;
  }

  const interval = Number(process.env.OUTBOX_FLUSH_INTERVAL_MS || DEFAULT_INTERVAL_MS);
  const batchSize = Number(process.env.OUTBOX_FLUSH_BATCH || DEFAULT_BATCH_SIZE);
  const now = Date.now();

  if (!inFlight && now - lastFlushAt >= interval) {
    inFlight = true;
    lastFlushAt = now;
    processOutboxBatch(batchSize)
      .catch((error) => {
        console.error('Outbox flush error', error);
      })
      .finally(() => {
        inFlight = false;
      });
  }

  next();
}

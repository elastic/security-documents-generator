import { createHash } from 'crypto';
import { getEsClient } from '../utils/indices.ts';
import { log } from '../../utils/logger.ts';

export const DAY_MS = 24 * 60 * 60 * 1000;
export const SCENARIO_TAG = 'exec-brief-scenario';

const UUID_NAMESPACE = '6f1c3b0e-4e2a-5d1b-9c7a-3f0e2a9b7c11';

const uuidToBytes = (uuid: string): Buffer => Buffer.from(uuid.replace(/-/g, ''), 'hex');

/** RFC 4122 version 5 UUID, so host ids are deterministic and realistic for Defend. */
export const uuidv5 = (name: string, namespace: string = UUID_NAMESPACE): string => {
  const hash = createHash('sha1')
    .update(uuidToBytes(namespace))
    .update(Buffer.from(name, 'utf8'))
    .digest();
  const bytes = Buffer.from(hash.subarray(0, 16));
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
};

export const sha256 = (value: string): string => createHash('sha256').update(value).digest('hex');

/** Timestamp `daysAgo` days before the anchor at the given UTC hour/minute. */
export const timeAt = (anchor: Date, daysAgo: number, hour: number, minute: number = 0): Date => {
  const base = new Date(anchor.getTime() - daysAgo * DAY_MS);
  base.setUTCHours(hour, minute, 0, 0);
  return base;
};

/** Latest sensible timestamp for a scenario day, never in the future. */
export const endOfDay = (anchor: Date, daysAgo: number): Date => {
  const t = timeAt(anchor, daysAgo, 23, 0);
  return t.getTime() > anchor.getTime() ? new Date(anchor.getTime() - 60_000) : t;
};

export const getStatusCode = (error: unknown): number | undefined =>
  (error as { meta?: { statusCode?: number } }).meta?.statusCode ??
  (error as { statusCode?: number }).statusCode;

export const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/** Bulk body helper that fails loudly on item errors (unlike the shared helper which only logs). */
export const bulkCreate = async ({
  operations,
  label,
  pipeline,
}: {
  operations: object[];
  label: string;
  pipeline?: string;
}): Promise<number> => {
  if (operations.length === 0) return 0;
  const client = getEsClient();
  const result = await client.bulk({ operations, refresh: 'wait_for', pipeline });
  let failed = 0;
  if (result.errors) {
    for (const item of result.items) {
      const op = item.create ?? item.index ?? item.update;
      if (op?.error) {
        failed++;
        if (failed <= 3) log.error(`${label}: bulk item failed: ${JSON.stringify(op.error)}`);
      }
    }
  }
  if (failed > 0) throw new Error(`${label}: ${failed} bulk item(s) failed`);
  return result.items.length;
};

export const isoOf = (date: Date): string => date.toISOString();

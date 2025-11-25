import { readFileSafely } from '../utils';

/**
 * Parse cluster health log
 */
export const parseClusterHealth = (
  logPath: string
): {
  statuses: string[];
  activeShards: number[];
  unassignedShards: number[];
} => {
  const content = readFileSafely(logPath, 'Cluster health log file');
  const lines = content.split('\n').filter((line) => line.trim());

  const statuses: string[] = [];
  const activeShards: number[] = [];
  const unassignedShards: number[] = [];

  for (const line of lines) {
    try {
      const match = line.match(/^(\d{4}-\d{2}-\d{2}T[\d:.-]+Z)\s+-\s+(.+)$/);
      if (!match) continue;

      const data = JSON.parse(match[2]);

      if (data.status) {
        statuses.push(data.status);
      }
      if (data.active_shards !== undefined) {
        activeShards.push(data.active_shards);
      }
      if (data.unassigned_shards !== undefined) {
        unassignedShards.push(data.unassigned_shards);
      }
    } catch {
      // Skip malformed lines
      continue;
    }
  }

  return { statuses, activeShards, unassignedShards };
};


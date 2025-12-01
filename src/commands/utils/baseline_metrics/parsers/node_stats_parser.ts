import { readFileSafely } from '../utils';

/**
 * Parse node stats log and extract CPU and memory metrics
 */
export const parseNodeStats = (
  logPath: string
): {
  cpuPercentages: number[];
  heapPercentages: number[];
  heapBytes: number[];
  cpuPerNode: Record<string, number[]>;
  timestamps: number[];
} => {
  const content = readFileSafely(logPath, 'Node stats log file');
  const lines = content.split('\n').filter((line) => line.trim());

  const cpuPercentages: number[] = [];
  const heapPercentages: number[] = [];
  const heapBytes: number[] = [];
  const cpuPerNode: Record<string, number[]> = {};
  const timestamps: number[] = [];

  for (const line of lines) {
    try {
      const match = line.match(/^(\d{4}-\d{2}-\d{2}T[\d:.-]+Z)\s+-\s+(.+)$/);
      if (!match) continue;

      const timestamp = new Date(match[1]).getTime();
      timestamps.push(timestamp);

      const data = JSON.parse(match[2]);
      if (!data.nodes || !Array.isArray(data.nodes)) continue;

      for (const node of data.nodes) {
        const nodeName = node.node_name || node.node_id || 'unknown';

        if (node.cpu?.percent !== undefined) {
          cpuPercentages.push(node.cpu.percent);
          if (!cpuPerNode[nodeName]) {
            cpuPerNode[nodeName] = [];
          }
          cpuPerNode[nodeName].push(node.cpu.percent);
        }

        if (node.jvm?.mem?.heap_used_percent !== undefined) {
          heapPercentages.push(node.jvm.mem.heap_used_percent);
        }

        if (node.jvm?.mem?.heap_used_in_bytes !== undefined) {
          heapBytes.push(node.jvm.mem.heap_used_in_bytes);
        }
      }
    } catch {
      // Skip malformed lines
      continue;
    }
  }

  return {
    cpuPercentages,
    heapPercentages,
    heapBytes,
    cpuPerNode,
    timestamps,
  };
};

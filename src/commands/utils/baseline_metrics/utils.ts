import fs from 'fs';
import { getBaselinesDir } from '../../../utils/data_paths';

export const BASELINES_DIR = getBaselinesDir();

// Maximum reasonable sampling interval (5 minutes in milliseconds)
// Used to filter out invalid intervals when detecting sampling frequency
export const MAX_REASONABLE_SAMPLING_INTERVAL_MS = 300000;

/**
 * Helper function to safely read a file with error handling
 * @param filePath - Path to the file to read
 * @param fileDescription - Description of the file for error messages (e.g., "transform stats log file")
 * @returns The file content as a string
 * @throws Error if file doesn't exist or can't be read
 */
export const readFileSafely = (filePath: string, fileDescription: string): string => {
  if (!fs.existsSync(filePath)) {
    throw new Error(`${fileDescription} does not exist: ${filePath}`);
  }
  try {
    return fs.readFileSync(filePath, 'utf-8');
  } catch (error) {
    return throwWithContext(`read ${fileDescription}`, filePath, error);
  }
};

// Ensure baselines directory exists
if (!fs.existsSync(BASELINES_DIR)) {
  fs.mkdirSync(BASELINES_DIR, { recursive: true });
}

/**
 * Calculate percentile from sorted array
 */
export const percentile = (sortedArray: number[], percentile: number): number => {
  if (sortedArray.length === 0) return 0;
  const index = Math.ceil((percentile / 100) * sortedArray.length) - 1;
  return sortedArray[Math.max(0, index)];
};

/**
 * Calculate average from array of numbers
 */
export const avg = (array: number[]): number => {
  if (array.length === 0) return 0;
  return array.reduce((a, b) => a + b, 0) / array.length;
};

/**
 * Calculate maximum from array of numbers
 */
export const max = (array: number[]): number => {
  if (array.length === 0) return 0;
  return Math.max(...array);
};

export interface PercentileMetrics {
  avg: number;
  p50: number;
  p95: number;
  p99: number;
  max: number;
}

export const computePercentileMetrics = (values: number[]): PercentileMetrics => {
  const sorted = [...values].sort((a, b) => a - b);
  return {
    avg: avg(values),
    p50: percentile(sorted, 50),
    p95: percentile(sorted, 95),
    p99: percentile(sorted, 99),
    max: max(values),
  };
};

export const formatError = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

export const throwWithContext = (context: string, path: string, error: unknown): never => {
  throw new Error(`Failed to ${context} ${path}: ${formatError(error)}`);
};

/**
 * Safe division - returns 0 if denominator is 0
 */
export const safeDivide = (numerator: number, denominator: number): number => {
  return denominator > 0 ? numerator / denominator : 0;
};

/**
 * Get last element from array, or 0 if empty
 */
export const last = (array: number[]): number => {
  return array.length > 0 ? array[array.length - 1] : 0;
};

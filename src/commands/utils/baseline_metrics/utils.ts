import fs from 'fs';
import path from 'path';

export const BASELINES_DIR = path.join(process.cwd(), 'baselines');

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
    throw new Error(
      `Failed to read ${fileDescription} ${filePath}: ${error instanceof Error ? error.message : String(error)}`
    );
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

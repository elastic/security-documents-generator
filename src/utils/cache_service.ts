import { CacheValue } from './ai_service_types';
import { getConfig } from '../get_config';

export class AIResponseCache {
  private cache = new Map<string, CacheValue>();
  private maxSize: number;
  private defaultTTL: number;

  constructor(maxSize = 100, defaultTTL = 1000 * 60 * 60) {
    // 1 hour default TTL
    this.maxSize = maxSize;
    this.defaultTTL = defaultTTL;
  }

  // Get cached value if it exists and is not expired
  get(key: string): CacheValue | null {
    const cached = this.cache.get(key);
    if (!cached) {
      return null;
    }

    // Check if expired
    if (Date.now() - cached.timestamp > this.defaultTTL) {
      this.cache.delete(key);
      return null;
    }

    return cached;
  }

  // Set cache value with LRU eviction
  set(key: string, value: CacheValue): void {
    // Remove oldest entry if cache is full
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey) {
        this.cache.delete(firstKey);
      }
    }

    this.cache.set(key, value);
  }

  // Check if key exists and is not expired
  has(key: string): boolean {
    return this.get(key) !== null;
  }

  // Clear all cached entries
  clear(): void {
    this.cache.clear();
  }

  // Clear expired entries
  clearExpired(): void {
    const now = Date.now();
    const expiredKeys: string[] = [];

    for (const [key, value] of this.cache.entries()) {
      if (now - value.timestamp > this.defaultTTL) {
        expiredKeys.push(key);
      }
    }

    expiredKeys.forEach((key) => this.cache.delete(key));
  }

  // Get cache statistics
  getStats(): { size: number; maxSize: number; hitRate?: number } {
    return {
      size: this.cache.size,
      maxSize: this.maxSize,
    };
  }

  // Update configuration
  updateConfig(): void {
    const config = getConfig();
    this.maxSize = config.generation?.performance?.maxCacheSize || 100;
  }
}

// Singleton instance
export const aiResponseCache = new AIResponseCache();

// Cache key generators for different types of requests
export const generateAlertCacheKey = (
  hostName: string,
  userName: string,
  space: string,
  alertType: string,
): string => {
  return `alert:${hostName}:${userName}:${space}:${alertType}`;
};

export const generateEventCacheKey = (
  idField?: string,
  idValue?: string,
): string => {
  return `event:${idField || ''}:${idValue || ''}`;
};

export const generateMitreCacheKey = (
  hostName: string,
  userName: string,
  space: string,
  techniqueIds: string,
  chainId: string,
): string => {
  return `mitre-alert:${hostName}:${userName}:${space}:${techniqueIds}:${chainId}`;
};

// Cache management utilities
export const performCacheMaintenance = (): void => {
  aiResponseCache.clearExpired();
  aiResponseCache.updateConfig();
};

// Initialize cache maintenance interval
let maintenanceInterval: ReturnType<typeof setInterval> | null = null;

export const startCacheMaintenance = (intervalMs = 1000 * 60 * 15): void => {
  // 15 minutes
  if (maintenanceInterval) {
    clearInterval(maintenanceInterval);
  }

  maintenanceInterval = setInterval(performCacheMaintenance, intervalMs);
};

export const stopCacheMaintenance = (): void => {
  if (maintenanceInterval) {
    clearInterval(maintenanceInterval);
    maintenanceInterval = null;
  }
};

import { getConfig } from '../get_config';
export class AIResponseCache {
    constructor(maxSize = 100, defaultTTL = 1000 * 60 * 60) {
        this.cache = new Map();
        // 1 hour default TTL
        this.maxSize = maxSize;
        this.defaultTTL = defaultTTL;
    }
    // Get cached value if it exists and is not expired
    get(key) {
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
    set(key, value) {
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
    has(key) {
        return this.get(key) !== null;
    }
    // Clear all cached entries
    clear() {
        this.cache.clear();
    }
    // Clear expired entries
    clearExpired() {
        const now = Date.now();
        const expiredKeys = [];
        for (const [key, value] of this.cache.entries()) {
            if (now - value.timestamp > this.defaultTTL) {
                expiredKeys.push(key);
            }
        }
        expiredKeys.forEach((key) => this.cache.delete(key));
    }
    // Get cache statistics
    getStats() {
        return {
            size: this.cache.size,
            maxSize: this.maxSize,
        };
    }
    // Update configuration
    updateConfig() {
        const config = getConfig();
        this.maxSize = config.generation?.performance?.maxCacheSize || 100;
    }
}
// Singleton instance
export const aiResponseCache = new AIResponseCache();
// Cache key generators for different types of requests
export const generateAlertCacheKey = (hostName, userName, space, alertType) => {
    return `alert:${hostName}:${userName}:${space}:${alertType}`;
};
export const generateEventCacheKey = (idField, idValue) => {
    return `event:${idField || ''}:${idValue || ''}`;
};
export const generateMitreCacheKey = (hostName, userName, space, techniqueIds, chainId) => {
    return `mitre-alert:${hostName}:${userName}:${space}:${techniqueIds}:${chainId}`;
};
// Cache management utilities
export const performCacheMaintenance = () => {
    aiResponseCache.clearExpired();
    aiResponseCache.updateConfig();
};
// Initialize cache maintenance interval
let maintenanceInterval = null;
export const startCacheMaintenance = (intervalMs = 1000 * 60 * 15) => {
    // 15 minutes
    if (maintenanceInterval) {
        clearInterval(maintenanceInterval);
    }
    maintenanceInterval = setInterval(performCacheMaintenance, intervalMs);
};
export const stopCacheMaintenance = () => {
    if (maintenanceInterval) {
        clearInterval(maintenanceInterval);
        maintenanceInterval = null;
    }
};

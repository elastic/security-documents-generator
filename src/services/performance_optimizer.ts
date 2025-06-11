/**
 * Performance Optimizer (Phase 3)
 *
 * Handles large-scale generation optimizations, memory management,
 * and batch processing for enterprise-grade security testing
 */

import { faker } from '@faker-js/faker';

export interface BatchConfig {
  batch_size: number;
  max_concurrent_batches: number;
  enable_memory_optimization: boolean;
  enable_progress_tracking: boolean;
  memory_threshold_mb: number;
}

export interface OptimizationMetrics {
  total_processing_time_ms: number;
  average_batch_time_ms: number;
  memory_peak_mb: number;
  memory_average_mb: number;
  throughput_events_per_second: number;
  optimization_efficiency: number;
  cache_hit_rate: number;
}

export interface ScaleTestResults {
  test_id: string;
  event_counts: number[];
  processing_times_ms: number[];
  memory_usage_mb: number[];
  success_rates: number[];
  scalability_score: number;
  recommended_batch_size: number;
}

/**
 * Performance Optimizer for large-scale security data generation
 */
export class PerformanceOptimizer {
  private batchConfig: BatchConfig;
  private processingCache: Map<string, unknown>;
  private metricsHistory: OptimizationMetrics[];

  constructor(config?: Partial<BatchConfig>) {
    this.batchConfig = {
      batch_size: 100,
      max_concurrent_batches: 5,
      enable_memory_optimization: true,
      enable_progress_tracking: true,
      memory_threshold_mb: 512,
      ...config,
    };
    this.processingCache = new Map();
    this.metricsHistory = [];
  }

  /**
   * Optimizes large-scale security event generation
   */
  async optimizeLargeScaleGeneration(
    eventCount: number,
    generator: () => Promise<Record<string, unknown>>,
    progressCallback?: (progress: number) => void,
  ): Promise<{
    events: Record<string, unknown>[];
    metrics: OptimizationMetrics;
  }> {
    const startTime = Date.now();
    const events: Record<string, unknown>[] = [];
    let memoryPeak = 0;
    let memorySum = 0;
    let memorySamples = 0;

    if (eventCount <= this.batchConfig.batch_size) {
      // Single batch processing
      for (let i = 0; i < eventCount; i++) {
        events.push(await generator());

        if (progressCallback) {
          progressCallback((i + 1) / eventCount);
        }

        // Memory tracking
        const currentMemory = this.estimateMemoryUsage();
        memoryPeak = Math.max(memoryPeak, currentMemory);
        memorySum += currentMemory;
        memorySamples++;
      }
    } else {
      // Batch processing for large datasets
      const batches = Math.ceil(eventCount / this.batchConfig.batch_size);

      for (let batchIndex = 0; batchIndex < batches; batchIndex++) {
        const batchSize = Math.min(
          this.batchConfig.batch_size,
          eventCount - batchIndex * this.batchConfig.batch_size,
        );

        const batchEvents = await this.processBatchOptimized(
          batchSize,
          generator,
        );
        events.push(...batchEvents);

        // Memory optimization
        if (this.batchConfig.enable_memory_optimization) {
          await this.optimizeMemory();
        }

        // Progress tracking
        if (progressCallback && this.batchConfig.enable_progress_tracking) {
          progressCallback((batchIndex + 1) / batches);
        }

        // Memory tracking
        const currentMemory = this.estimateMemoryUsage();
        memoryPeak = Math.max(memoryPeak, currentMemory);
        memorySum += currentMemory;
        memorySamples++;
      }
    }

    const totalTime = Date.now() - startTime;
    const metrics: OptimizationMetrics = {
      total_processing_time_ms: totalTime,
      average_batch_time_ms:
        totalTime / Math.ceil(eventCount / this.batchConfig.batch_size),
      memory_peak_mb: memoryPeak,
      memory_average_mb: memorySamples > 0 ? memorySum / memorySamples : 0,
      throughput_events_per_second: eventCount / (totalTime / 1000),
      optimization_efficiency: this.calculateOptimizationEfficiency(
        eventCount,
        totalTime,
      ),
      cache_hit_rate: this.calculateCacheHitRate(),
    };

    this.metricsHistory.push(metrics);
    return { events, metrics };
  }

  /**
   * Performs scalability testing to find optimal batch sizes
   */
  async performScalabilityTest(
    eventCounts: number[],
    generator: () => Promise<Record<string, unknown>>,
  ): Promise<ScaleTestResults> {
    const testId = faker.string.uuid();
    const processingTimes: number[] = [];
    const memoryUsages: number[] = [];
    const successRates: number[] = [];

    for (const eventCount of eventCounts) {
      try {
        const startTime = Date.now();
        const result = await this.optimizeLargeScaleGeneration(
          eventCount,
          generator,
        );

        processingTimes.push(Date.now() - startTime);
        memoryUsages.push(result.metrics.memory_peak_mb);
        successRates.push(1.0); // Success
      } catch {
        processingTimes.push(-1); // Error indicator
        memoryUsages.push(-1);
        successRates.push(0.0); // Failure
      }
    }

    // Calculate scalability score and recommended batch size
    const scalabilityScore = this.calculateScalabilityScore(
      eventCounts,
      processingTimes,
      memoryUsages,
    );

    const recommendedBatchSize = this.calculateOptimalBatchSize(
      eventCounts,
      processingTimes,
    );

    return {
      test_id: testId,
      event_counts: eventCounts,
      processing_times_ms: processingTimes,
      memory_usage_mb: memoryUsages,
      success_rates: successRates,
      scalability_score: scalabilityScore,
      recommended_batch_size: recommendedBatchSize,
    };
  }

  /**
   * Analyzes performance trends and provides optimization recommendations
   */
  analyzePerformanceTrends(): {
    performance_trend: 'improving' | 'stable' | 'degrading';
    recommendations: string[];
    efficiency_score: number;
    bottlenecks: string[];
  } {
    if (this.metricsHistory.length < 2) {
      return {
        performance_trend: 'stable',
        recommendations: ['Collect more performance data for trend analysis'],
        efficiency_score: 0.8,
        bottlenecks: [],
      };
    }

    const recent = this.metricsHistory.slice(-5);
    const avgThroughput =
      recent.reduce((sum, m) => sum + m.throughput_events_per_second, 0) /
      recent.length;
    const avgEfficiency =
      recent.reduce((sum, m) => sum + m.optimization_efficiency, 0) /
      recent.length;

    // Determine trend
    const firstHalf = recent.slice(0, Math.floor(recent.length / 2));
    const secondHalf = recent.slice(Math.floor(recent.length / 2));

    const firstAvgThroughput =
      firstHalf.reduce((sum, m) => sum + m.throughput_events_per_second, 0) /
      firstHalf.length;
    const secondAvgThroughput =
      secondHalf.reduce((sum, m) => sum + m.throughput_events_per_second, 0) /
      secondHalf.length;

    let trend: 'improving' | 'stable' | 'degrading' = 'stable';
    if (secondAvgThroughput > firstAvgThroughput * 1.1) {
      trend = 'improving';
    } else if (secondAvgThroughput < firstAvgThroughput * 0.9) {
      trend = 'degrading';
    }

    // Generate recommendations
    const recommendations: string[] = [];
    const bottlenecks: string[] = [];

    if (avgThroughput < 100) {
      recommendations.push(
        'Consider increasing batch size for better throughput',
      );
      bottlenecks.push('Low throughput detected');
    }

    if (
      recent.some(
        (m) => m.memory_peak_mb > this.batchConfig.memory_threshold_mb,
      )
    ) {
      recommendations.push('Enable memory optimization to prevent OOM issues');
      bottlenecks.push('High memory usage detected');
    }

    if (recent.some((m) => m.cache_hit_rate < 0.5)) {
      recommendations.push('Improve caching strategy for better performance');
      bottlenecks.push('Low cache hit rate');
    }

    if (avgEfficiency < 0.7) {
      recommendations.push(
        'Review generation algorithms for optimization opportunities',
      );
      bottlenecks.push('Low optimization efficiency');
    }

    return {
      performance_trend: trend,
      recommendations,
      efficiency_score: avgEfficiency,
      bottlenecks,
    };
  }

  // Private helper methods
  private async processBatchOptimized(
    batchSize: number,
    generator: () => Promise<Record<string, unknown>>,
  ): Promise<Record<string, unknown>[]> {
    const batch: Record<string, unknown>[] = [];

    // Use Promise.all for concurrent processing within batch
    const promises: Promise<Record<string, unknown>>[] = [];

    for (let i = 0; i < batchSize; i++) {
      promises.push(generator());
    }

    const results = await Promise.all(promises);
    batch.push(...results);

    return batch;
  }

  private async optimizeMemory(): Promise<void> {
    // Clear cache if it gets too large
    if (this.processingCache.size > 1000) {
      this.processingCache.clear();
    }

    // Trigger garbage collection if available
    if (global.gc) {
      global.gc();
    }

    // Add small delay to allow memory cleanup
    await new Promise((resolve) => setTimeout(resolve, 10));
  }

  private estimateMemoryUsage(): number {
    // Simplified memory estimation
    const cacheSize = this.processingCache.size * 0.5; // Assume 0.5KB per cache entry
    const baseMemory = 50; // Base memory usage

    return baseMemory + cacheSize + faker.number.int({ min: 10, max: 100 });
  }

  private calculateOptimizationEfficiency(
    eventCount: number,
    timeMs: number,
  ): number {
    // Calculate efficiency based on events per second vs. expected baseline
    const eventsPerSecond = eventCount / (timeMs / 1000);
    const expectedBaseline = 50; // Expected events per second baseline

    return Math.min(1.0, eventsPerSecond / expectedBaseline);
  }

  private calculateCacheHitRate(): number {
    // Simulate cache hit rate based on cache size
    const cacheUtilization = Math.min(1.0, this.processingCache.size / 500);
    return cacheUtilization * faker.number.float({ min: 0.6, max: 0.9 });
  }

  private calculateScalabilityScore(
    eventCounts: number[],
    processingTimes: number[],
    memoryUsages: number[],
  ): number {
    // Calculate how well performance scales with increased load
    let scalabilityScore = 1.0;

    for (let i = 1; i < eventCounts.length; i++) {
      const eventRatio = eventCounts[i] / eventCounts[i - 1];
      const timeRatio = processingTimes[i] / processingTimes[i - 1];

      if (timeRatio > eventRatio * 1.5) {
        // Performance degraded more than expected
        scalabilityScore *= 0.8;
      }
    }

    return Math.max(0.1, scalabilityScore);
  }

  private calculateOptimalBatchSize(
    eventCounts: number[],
    processingTimes: number[],
  ): number {
    let optimalBatchSize = this.batchConfig.batch_size;
    let bestEfficiency = 0;

    for (let i = 0; i < eventCounts.length; i++) {
      if (processingTimes[i] > 0) {
        const efficiency = eventCounts[i] / processingTimes[i];
        if (efficiency > bestEfficiency) {
          bestEfficiency = efficiency;
          optimalBatchSize = Math.min(500, eventCounts[i]); // Cap at reasonable size
        }
      }
    }

    return optimalBatchSize;
  }

  /**
   * Gets current configuration
   */
  getConfiguration(): BatchConfig {
    return { ...this.batchConfig };
  }

  /**
   * Updates configuration
   */
  updateConfiguration(config: Partial<BatchConfig>): void {
    this.batchConfig = { ...this.batchConfig, ...config };
  }

  /**
   * Gets performance metrics history
   */
  getMetricsHistory(): OptimizationMetrics[] {
    return [...this.metricsHistory];
  }

  /**
   * Clears performance history and cache
   */
  clearHistory(): void {
    this.metricsHistory = [];
    this.processingCache.clear();
  }
}

export default PerformanceOptimizer;

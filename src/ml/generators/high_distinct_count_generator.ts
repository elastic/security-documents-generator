/**
 * High Distinct Count Generator
 * Migrated from Python HighDistinctCountGenerator class
 * 
 * Generates data for high cardinality detection ML jobs
 * - Normal data: Single distinct value per time period
 * - Anomalous data: 0.02% probability with 100+ distinct values rapidly
 */

import { BaseMLGenerator } from './base_generator';
import { MLGeneratorConfig, MLDataDocument, GeneratorOptions } from '../types/ml_types';

export class HighDistinctCountGenerator extends BaseMLGenerator {
  constructor(config: MLGeneratorConfig, options: GeneratorOptions = {}) {
    super(config, {
      anomalyRate: 0.0002, // 0.02% anomaly rate
      burstSize: 100, // 100+ distinct values
      ...options
    });
  }

  public *generate(): IterableIterator<MLDataDocument> {
    while (this.currentTime <= this.endTime) {
      // Deep copy document template
      const baseDoc = JSON.parse(JSON.stringify(this.documentTemplate));
      
      // Add standard fields (timestamp, index, over/partition fields, influencers)
      const document = this.addFields(baseDoc, this.currentTime);

      // Check for anomalous burst of distinct values
      if (this.isAnomalousEvent()) {
        // Generate burst of events with different values within a 10-second window
        let count = 0;
        const burstStartTime = this.currentTime;
        const burstSize = this.options.burstSize || 100;

        while (count <= burstSize) {
          // Create document for burst event with different analysis field value
          const burstDoc = JSON.parse(JSON.stringify(baseDoc));
          const burstDocument = this.addFields(burstDoc, this.getRandomInteger(burstStartTime, burstStartTime + 10));

          // Add different analysis field value for each event (high cardinality)
          if (this.analysisField) {
            const distinctIndex = this.getRandomInteger(2, 22);
            burstDocument[this.analysisField] = this.getFieldValue(this.analysisField, distinctIndex);
          }

          yield burstDocument;
          count++;
        }
      } else {
        // Normal: single distinct value (same value for normal behavior)
        if (this.analysisField) {
          document[this.analysisField] = this.getFieldValue(this.analysisField, 1);
        }
        yield document;
      }

      // Advance time for next event
      this.advanceTime();
    }
  }
}
/**
 * High Count Generator
 * Migrated from Python HighCountGenerator class
 * 
 * Generates data for high count/volume detection ML jobs
 * - Normal data: Single document per time period
 * - Anomalous data: 0.02% probability with 100+ documents in rapid succession
 */

import { BaseMLGenerator } from './base_generator';
import { MLGeneratorConfig, MLDataDocument, GeneratorOptions } from '../types/ml_types';

export class HighCountGenerator extends BaseMLGenerator {
  constructor(config: MLGeneratorConfig, options: GeneratorOptions = {}) {
    super(config, {
      anomalyRate: 0.0002, // 0.02% anomaly rate
      burstSize: 100, // 100+ events in burst
      ...options
    });
  }

  public *generate(): IterableIterator<MLDataDocument> {
    while (this.currentTime <= this.endTime) {
      // Deep copy document template
      const baseDoc = JSON.parse(JSON.stringify(this.documentTemplate));
      
      // Add standard fields (timestamp, index, over/partition fields, influencers)
      const document = this.addFields(baseDoc, this.currentTime);

      // Add analysis field value if specified
      if (this.analysisField) {
        const fieldIndex = this.getRandomInteger(2, 22);
        document[this.analysisField] = this.getFieldValue(this.analysisField, fieldIndex);
      }

      // Check for anomalous burst
      if (this.isAnomalousEvent()) {
        // Generate burst of events within a 10-second window
        let count = 0;
        const burstStartTime = this.currentTime;
        const burstSize = this.options.burstSize || 100;

        while (count <= burstSize) {
          // Create document for burst event
          const burstDoc = JSON.parse(JSON.stringify(baseDoc));
          const burstDocument = this.addFields(burstDoc, this.getRandomInteger(burstStartTime, burstStartTime + 10));

          // Add same analysis field value for consistency
          if (this.analysisField) {
            burstDocument[this.analysisField] = document[this.analysisField];
          }

          yield burstDocument;
          count++;
        }
      } else {
        // Normal single event
        yield document;
      }

      // Advance time for next event
      this.advanceTime();
    }
  }
}
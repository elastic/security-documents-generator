/**
 * Rare Event Generator
 * Migrated from Python RareGenerator class
 *
 * Generates data for rare value detection ML jobs
 * - Normal data: 99.98% probability with common values (indices 2-22)
 * - Anomalous data: 0.02% probability with rare values (index 1)
 */

import { BaseMLGenerator } from './base_generator';
import {
  MLGeneratorConfig,
  MLDataDocument,
  GeneratorOptions,
} from '../types/ml_types';

export class RareGenerator extends BaseMLGenerator {
  constructor(config: MLGeneratorConfig, options: GeneratorOptions = {}) {
    super(config, {
      anomalyRate: 0.0002, // 0.02% anomaly rate
      ...options,
    });
  }

  public *generate(): IterableIterator<MLDataDocument> {
    while (this.currentTime <= this.endTime) {
      // Deep copy document template
      const baseDoc = JSON.parse(JSON.stringify(this.documentTemplate));

      // Add standard fields (timestamp, index, over/partition fields, influencers)
      const document = this.addFields(baseDoc, this.currentTime);

      // Generate analysis field value based on anomaly probability
      if (this.analysisField) {
        if (this.isAnomalousEvent()) {
          // Anomalous: rare value (index 1)
          document[this.analysisField] = this.getFieldValue(
            this.analysisField,
            1,
          );
        } else {
          // Normal: common values (indices 2-22)
          const commonIndex = this.getRandomInteger(2, 22);
          document[this.analysisField] = this.getFieldValue(
            this.analysisField,
            commonIndex,
          );
        }
      }

      // Advance time for next event
      this.advanceTime();

      yield document;
    }
  }
}

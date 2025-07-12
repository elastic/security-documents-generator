/**
 * Time of Day Generator
 * Migrated from Python TimeOfDayGenerator class
 * 
 * Generates data for time-based pattern detection ML jobs
 * - Normal data: Activity during business hours (9 AM - 5 PM)
 * - Anomalous data: Activity at midnight (hour 0) with burst pattern
 */

import { BaseMLGenerator } from './base_generator';
import { MLGeneratorConfig, MLDataDocument, GeneratorOptions } from '../types/ml_types';

export class TimeOfDayGenerator extends BaseMLGenerator {
  constructor(config: MLGeneratorConfig, options: GeneratorOptions = {}) {
    super(config, {
      burstSize: 30, // 30 events at midnight
      ...options
    });
  }

  public *generate(): IterableIterator<MLDataDocument> {
    while (this.currentTime <= this.endTime) {
      // Deep copy document template
      const baseDoc = JSON.parse(JSON.stringify(this.documentTemplate));
      
      // Get current hour of day
      const hourOfDay = this.getHour(this.currentTime);

      if (hourOfDay === 0) {
        // Midnight anomaly: generate burst of events
        let count = 0;
        const burstStartTime = this.currentTime;
        const burstSize = this.options.burstSize || 30;

        while (count <= burstSize) {
          // Create document for midnight burst event
          const burstDoc = JSON.parse(JSON.stringify(baseDoc));
          const burstDocument = this.addFields(burstDoc, this.getRandomInteger(burstStartTime, burstStartTime + 10));

          // Add analysis field if specified
          if (this.analysisField) {
            const fieldIndex = this.getRandomInteger(2, 22);
            burstDocument[this.analysisField] = this.getFieldValue(this.analysisField, fieldIndex);
          }

          yield burstDocument;
          count++;
        }

        // Skip to 9 AM (jump 9 hours)
        this.currentTime += 9 * 3600;

      } else if (hourOfDay >= 1 && hourOfDay <= 8) {
        // Skip overnight hours (1 AM - 8 AM) - jump to 9 AM
        this.currentTime += (9 - hourOfDay) * 3600;

      } else if (hourOfDay >= 9 && hourOfDay <= 17) {
        // Business hours (9 AM - 5 PM): normal activity
        const document = this.addFields(baseDoc, this.currentTime);

        // Add analysis field if specified
        if (this.analysisField) {
          const fieldIndex = this.getRandomInteger(2, 22);
          document[this.analysisField] = this.getFieldValue(this.analysisField, fieldIndex);
        }

        yield document;

        // Advance time normally during business hours
        this.advanceTime();

      } else {
        // Evening hours (6 PM - 11 PM): skip to midnight
        this.currentTime += (24 - hourOfDay) * 3600;
      }
    }
  }
}
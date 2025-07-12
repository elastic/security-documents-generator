/**
 * High Information Content Generator
 * Migrated from Python HighInfoContentGenerator class
 * 
 * Generates data for information content analysis (entropy detection) ML jobs
 * - Normal data: Low entropy strings (repeated characters)
 * - Anomalous data: 0.08% probability with high entropy random strings
 */

import { BaseMLGenerator } from './base_generator';
import { MLGeneratorConfig, MLDataDocument, GeneratorOptions } from '../types/ml_types';

export class HighInfoContentGenerator extends BaseMLGenerator {
  constructor(config: MLGeneratorConfig, options: GeneratorOptions = {}) {
    super(config, {
      anomalyRate: 0.0008, // 0.08% anomaly rate (higher than other generators)
      burstSize: 100,
      stringLength: [5, 10],
      ...options
    });
  }

  public *generate(): IterableIterator<MLDataDocument> {
    while (this.currentTime <= this.endTime) {
      // Deep copy document template
      const baseDoc = JSON.parse(JSON.stringify(this.documentTemplate));
      
      // Add standard fields (timestamp, index, over/partition fields, influencers)
      const document = this.addFields(baseDoc, this.currentTime);

      // Check for anomalous burst of high entropy strings
      if (this.isAnomalousEvent()) {
        // Generate burst of events with high entropy strings within a 10-second window
        let count = 0;
        const burstStartTime = this.currentTime;
        const burstSize = this.options.burstSize || 100;
        const [minLength, maxLength] = this.options.stringLength || [5, 10];

        while (count <= burstSize) {
          // Create document for burst event with high entropy string
          const burstDoc = JSON.parse(JSON.stringify(baseDoc));
          const burstDocument = this.addFields(burstDoc, this.getRandomInteger(burstStartTime, burstStartTime + 10));

          // Add high entropy random string (anomalous)
          if (this.analysisField) {
            const stringLength = this.getRandomInteger(minLength, maxLength);
            burstDocument[this.analysisField] = this.getRandomString(stringLength);
          }

          yield burstDocument;
          count++;
        }
      } else {
        // Normal: low entropy string (repeated character)
        if (this.analysisField) {
          const repeatedChar = this.getRandomString(1);
          document[this.analysisField] = repeatedChar.repeat(10); // Low entropy: same character repeated
        }
        yield document;
      }

      // Advance time for next event
      this.advanceTime();
    }
  }
}
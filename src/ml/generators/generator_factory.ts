/**
 * ML Generator Factory
 * Creates appropriate generator instances based on ML function type
 * Migrated from Python function mapping logic
 */

import {
  MLFunction,
  MLGeneratorConfig,
  GeneratorOptions,
} from '../types/ml_types';
import { BaseMLGenerator } from './base_generator';
import { RareGenerator } from './rare_generator';
import { HighCountGenerator } from './high_count_generator';
import { HighDistinctCountGenerator } from './high_distinct_count_generator';
import { HighInfoContentGenerator } from './high_info_content_generator';
import { TimeOfDayGenerator } from './time_of_day_generator';

export class MLGeneratorFactory {
  /**
   * Create generator instance based on ML function type
   * Maintains Python function mapping exactly
   */
  public static createGenerator(
    config: MLGeneratorConfig,
    options: GeneratorOptions = {},
  ): BaseMLGenerator {
    switch (config.function) {
      case 'rare':
        return new RareGenerator(config, options);

      case 'high_count':
      case 'high_non_zero_count': // Same as high_count in Python
        return new HighCountGenerator(config, options);

      case 'high_distinct_count':
        return new HighDistinctCountGenerator(config, options);

      case 'high_info_content':
        return new HighInfoContentGenerator(config, options);

      case 'time_of_day':
        return new TimeOfDayGenerator(config, options);

      default:
        throw new Error(`Unsupported ML function: ${config.function}`);
    }
  }

  /**
   * Get all supported ML functions
   */
  public static getSupportedFunctions(): MLFunction[] {
    return [
      'rare',
      'high_count',
      'high_non_zero_count',
      'high_distinct_count',
      'high_info_content',
      'time_of_day',
    ];
  }

  /**
   * Validate ML function is supported
   */
  public static isValidFunction(func: string): func is MLFunction {
    return this.getSupportedFunctions().includes(func as MLFunction);
  }
}

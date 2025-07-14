/**
 * ML Job Configuration Parser
 * Migrated from Python ParseConfig class
 *
 * Extracts ML job parameters from Kibana ML job configurations
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { MLJobConfig, MLGeneratorConfig, MLFunction } from '../types/ml_types';

// ES module equivalent of __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class MLJobParser {
  private jobId: string;
  private jobConfig?: MLJobConfig;
  private documentTemplate?: Record<string, any>;

  constructor(jobId: string) {
    this.jobId = jobId;
  }

  /**
   * Parse ML job configuration from JSON file
   * Maintains Python ParseConfig logic exactly
   */
  public async parseJobConfig(): Promise<MLGeneratorConfig> {
    try {
      // Load ML job configuration
      await this.loadJobConfig();

      // Load document template
      await this.loadDocumentTemplate();

      if (!this.jobConfig) {
        throw new Error(`Failed to load job config for ${this.jobId}`);
      }

      // Extract detector configuration (Python supports only single detector)
      const detectors = this.jobConfig.analysis_config.detectors;
      if (!detectors || detectors.length === 0) {
        throw new Error(`No detectors found in job config for ${this.jobId}`);
      }

      if (detectors.length > 1) {
        console.warn(
          `Job ${this.jobId} has multiple detectors. Using first detector only.`,
        );
      }

      const detector = detectors[0];
      const mlFunction = detector.function as MLFunction;

      // Extract analysis field (Python checks two possible locations)
      let analysisField: string | undefined;
      if (detector.by_field_name) {
        analysisField = detector.by_field_name;
      } else if (detector.field_name) {
        analysisField = detector.field_name;
      }

      // Extract other fields
      const overField = detector.over_field_name;
      const partitionField = detector.partition_field_name;
      const influencers = this.jobConfig.analysis_config.influencers;

      // Get time range (12 days ago to midnight today)
      const { start, end } = this.getTimeRange();

      const config: MLGeneratorConfig = {
        jobId: this.jobId,
        analysisField,
        overField,
        partitionField,
        influencers,
        function: mlFunction,
        startTime: start,
        endTime: end,
        documentTemplate: this.documentTemplate || {},
      };

      return config;
    } catch (error) {
      throw new Error(
        `Failed to parse ML job config for ${this.jobId}: ${error}`,
      );
    }
  }

  /**
   * Load ML job configuration from JSON file
   */
  private async loadJobConfig(): Promise<void> {
    const jobConfigPath = this.getJobConfigPath();

    if (!fs.existsSync(jobConfigPath)) {
      throw new Error(`ML job config file not found: ${jobConfigPath}`);
    }

    try {
      const configData = fs.readFileSync(jobConfigPath, 'utf8');
      this.jobConfig = JSON.parse(configData) as MLJobConfig;
    } catch (error) {
      throw new Error(`Failed to parse ML job config JSON: ${error}`);
    }
  }

  /**
   * Load document template from JSON file
   */
  private async loadDocumentTemplate(): Promise<void> {
    const templatePath = this.getDocumentTemplatePath();

    if (!fs.existsSync(templatePath)) {
      console.warn(
        `Document template not found for ${this.jobId}: ${templatePath}. Using empty template.`,
      );
      this.documentTemplate = {};
      return;
    }

    try {
      const templateData = fs.readFileSync(templatePath, 'utf8');
      this.documentTemplate = JSON.parse(templateData);
    } catch (error) {
      console.warn(
        `Failed to parse document template for ${this.jobId}: ${error}. Using empty template.`,
      );
      this.documentTemplate = {};
    }
  }

  /**
   * Get path to ML job configuration file
   * Should match Python job path logic
   */
  private getJobConfigPath(): string {
    // Try multiple possible locations for job configs
    const possiblePaths = [
      path.join(__dirname, '../data/configs', `${this.jobId}_job.json`),
      path.join(__dirname, '../data/configs', `${this.jobId}.json`),
      path.join(process.cwd(), 'ml_configs', `${this.jobId}.json`),
      path.join(process.cwd(), 'data', 'configs', `${this.jobId}.json`),
    ];

    for (const configPath of possiblePaths) {
      if (fs.existsSync(configPath)) {
        return configPath;
      }
    }

    throw new Error(
      `ML job config not found for ${this.jobId} in any of: ${possiblePaths.join(', ')}`,
    );
  }

  /**
   * Get path to document template file
   */
  private getDocumentTemplatePath(): string {
    return path.join(__dirname, '../data/configs', `${this.jobId}.json`);
  }

  /**
   * Calculate time range (12 days ago to midnight today)
   * Maintains Python get_timestamps logic exactly
   */
  private getTimeRange(): { start: number; end: number } {
    const now = new Date();
    const endTime = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      0,
      0,
      0,
      0,
    );
    const startTime = new Date(endTime.getTime() - 12 * 24 * 60 * 60 * 1000);

    return {
      start: Math.floor(startTime.getTime() / 1000),
      end: Math.floor(endTime.getTime() / 1000),
    };
  }

  /**
   * Get all available ML job IDs
   */
  public static getAvailableJobIds(): string[] {
    const configDir = path.join(__dirname, '../data/configs');

    if (!fs.existsSync(configDir)) {
      return [];
    }

    try {
      return fs
        .readdirSync(configDir)
        .filter((file) => file.endsWith('_job.json'))
        .map((file) => file.replace('_job.json', ''));
    } catch (error) {
      console.warn(`Failed to read ML job configs directory: ${error}`);
      return [];
    }
  }

  /**
   * Validate ML function is supported
   */
  public static isValidFunction(func: string): boolean {
    const validFunctions: MLFunction[] = [
      'rare',
      'high_count',
      'high_non_zero_count',
      'high_distinct_count',
      'high_info_content',
      'time_of_day',
    ];
    return validFunctions.includes(func as MLFunction);
  }
}

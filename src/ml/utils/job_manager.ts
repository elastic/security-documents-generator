/**
 * ML Job Lifecycle Manager
 * Migrated from Python ML job and datafeed management
 * 
 * Handles ML job creation, datafeed setup, and lifecycle operations
 */

import { Client } from '@elastic/elasticsearch';
import { MLJobConfig, MLGenerationResult, MLBulkIndexOptions } from '../types/ml_types';
import { getEsClient } from '../../commands/utils/indices';

export interface MLJobOptions {
  enableJob?: boolean;
  startDatafeed?: boolean;
  deleteExisting?: boolean;
}

export interface DatafeedConfig {
  datafeed_id: string;
  job_id: string;
  indices: string[];
  query: {
    match_all: object;
  };
}

export class MLJobManager {
  private client: Client;

  constructor() {
    this.client = getEsClient();
  }

  /**
   * Create ML job in Elasticsearch
   * Maintains Python ML job creation logic
   */
  public async createMLJob(
    jobId: string,
    jobConfig: MLJobConfig,
    options: MLJobOptions = {}
  ): Promise<boolean> {
    try {
      // Delete existing job if requested
      if (options.deleteExisting) {
        await this.deleteMLJob(jobId);
      }

      // Check if job already exists
      const jobExists = await this.jobExists(jobId);
      if (jobExists) {
        console.log(`ML job ${jobId} already exists. Skipping creation.`);
        return true;
      }

      // Create ML job
      console.log(`Creating ML job: ${jobId}`);
      await this.client.ml.putJob({
        job_id: jobId,
        body: jobConfig
      });

      console.log(`✅ ML job ${jobId} created successfully`);

      // Enable job if requested
      if (options.enableJob) {
        await this.openMLJob(jobId);
      }

      return true;

    } catch (error) {
      console.error(`❌ Failed to create ML job ${jobId}:`, error);
      return false;
    }
  }

  /**
   * Create datafeed for ML job
   * Maintains Python datafeed creation logic
   */
  public async createDatafeed(
    jobId: string,
    indexName: string,
    options: MLJobOptions = {}
  ): Promise<boolean> {
    try {
      const datafeedId = `datafeed-${jobId}`;

      // Check if datafeed already exists
      const datafeedExists = await this.datafeedExists(datafeedId);
      if (datafeedExists) {
        console.log(`Datafeed ${datafeedId} already exists. Skipping creation.`);
        return true;
      }

      // Create datafeed configuration
      const datafeedConfig: DatafeedConfig = {
        datafeed_id: datafeedId,
        job_id: jobId,
        indices: [indexName],
        query: {
          match_all: {}
        }
      };

      // Create datafeed
      console.log(`Creating datafeed: ${datafeedId}`);
      await this.client.ml.putDatafeed({
        datafeed_id: datafeedId,
        body: datafeedConfig
      });

      console.log(`✅ Datafeed ${datafeedId} created successfully`);

      // Start datafeed if requested
      if (options.startDatafeed) {
        await this.startDatafeed(datafeedId);
      }

      return true;

    } catch (error) {
      console.error(`❌ Failed to create datafeed for job ${jobId}:`, error);
      return false;
    }
  }

  /**
   * Open (enable) ML job
   */
  public async openMLJob(jobId: string): Promise<boolean> {
    try {
      console.log(`Opening ML job: ${jobId}`);
      await this.client.ml.openJob({
        job_id: jobId
      });

      console.log(`✅ ML job ${jobId} opened successfully`);
      return true;

    } catch (error) {
      console.error(`❌ Failed to open ML job ${jobId}:`, error);
      return false;
    }
  }

  /**
   * Close ML job
   */
  public async closeMLJob(jobId: string): Promise<boolean> {
    try {
      console.log(`Closing ML job: ${jobId}`);
      await this.client.ml.closeJob({
        job_id: jobId
      });

      console.log(`✅ ML job ${jobId} closed successfully`);
      return true;

    } catch (error) {
      console.error(`❌ Failed to close ML job ${jobId}:`, error);
      return false;
    }
  }

  /**
   * Start datafeed
   */
  public async startDatafeed(datafeedId: string): Promise<boolean> {
    try {
      console.log(`Starting datafeed: ${datafeedId}`);
      await this.client.ml.startDatafeed({
        datafeed_id: datafeedId
      });

      console.log(`✅ Datafeed ${datafeedId} started successfully`);
      return true;

    } catch (error) {
      console.error(`❌ Failed to start datafeed ${datafeedId}:`, error);
      return false;
    }
  }

  /**
   * Stop datafeed
   */
  public async stopDatafeed(datafeedId: string): Promise<boolean> {
    try {
      console.log(`Stopping datafeed: ${datafeedId}`);
      await this.client.ml.stopDatafeed({
        datafeed_id: datafeedId
      });

      console.log(`✅ Datafeed ${datafeedId} stopped successfully`);
      return true;

    } catch (error) {
      console.error(`❌ Failed to stop datafeed ${datafeedId}:`, error);
      return false;
    }
  }

  /**
   * Delete ML job and associated datafeed
   */
  public async deleteMLJob(jobId: string): Promise<boolean> {
    try {
      const datafeedId = `datafeed-${jobId}`;

      // Stop and delete datafeed first
      const datafeedExists = await this.datafeedExists(datafeedId);
      if (datafeedExists) {
        await this.stopDatafeed(datafeedId);
        await this.client.ml.deleteDatafeed({
          datafeed_id: datafeedId
        });
      }

      // Close and delete job
      const jobExists = await this.jobExists(jobId);
      if (jobExists) {
        await this.closeMLJob(jobId);
        await this.client.ml.deleteJob({
          job_id: jobId
        });
      }

      console.log(`✅ ML job ${jobId} and datafeed deleted successfully`);
      return true;

    } catch (error) {
      console.error(`❌ Failed to delete ML job ${jobId}:`, error);
      return false;
    }
  }

  /**
   * Check if ML job exists
   */
  public async jobExists(jobId: string): Promise<boolean> {
    try {
      await this.client.ml.getJobs({
        job_id: jobId
      });
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Check if datafeed exists
   */
  public async datafeedExists(datafeedId: string): Promise<boolean> {
    try {
      await this.client.ml.getDatafeeds({
        datafeed_id: datafeedId
      });
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get ML job status
   */
  public async getJobStatus(jobId: string): Promise<any> {
    try {
      const response = await this.client.ml.getJobStats({
        job_id: jobId
      });
      return response.jobs[0];
    } catch (error) {
      console.error(`Failed to get ML job status for ${jobId}:`, error);
      return null;
    }
  }

  /**
   * Get datafeed status
   */
  public async getDatafeedStatus(datafeedId: string): Promise<any> {
    try {
      const response = await this.client.ml.getDatafeedStats({
        datafeed_id: datafeedId
      });
      return response.datafeeds[0];
    } catch (error) {
      console.error(`Failed to get datafeed status for ${datafeedId}:`, error);
      return null;
    }
  }

  /**
   * List all ML jobs
   */
  public async listJobs(): Promise<string[]> {
    try {
      const response = await this.client.ml.getJobs();
      return response.jobs.map(job => job.job_id);
    } catch (error) {
      console.error('Failed to list ML jobs:', error);
      return [];
    }
  }

  /**
   * Complete ML job setup with data generation
   * Maintains Python workflow: index -> job -> datafeed -> enable
   */
  public async setupCompleteMLJob(
    jobId: string,
    jobConfig: MLJobConfig,
    indexName: string,
    options: MLJobOptions = {}
  ): Promise<MLGenerationResult> {
    const result: MLGenerationResult = {
      jobId,
      indexName,
      documentsGenerated: 0,
      anomaliesGenerated: 0,
      timeRange: { start: 0, end: 0 },
      success: false
    };

    try {
      // 1. Create ML job
      const jobCreated = await this.createMLJob(jobId, jobConfig, options);
      if (!jobCreated) {
        result.error = 'Failed to create ML job';
        return result;
      }

      // 2. Create datafeed
      const datafeedCreated = await this.createDatafeed(jobId, indexName, options);
      if (!datafeedCreated) {
        result.error = 'Failed to create datafeed';
        return result;
      }

      result.success = true;
      console.log(`✅ Complete ML job setup finished for ${jobId}`);

    } catch (error) {
      result.error = `ML job setup failed: ${error}`;
      console.error(`❌ Complete ML job setup failed for ${jobId}:`, error);
    }

    return result;
  }
}
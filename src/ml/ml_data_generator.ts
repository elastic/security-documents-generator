/**
 * Main ML Data Generator Service
 * Orchestrates ML data generation, indexing, and job management
 * Migrated from Python main generation workflow
 */

import { Client } from '@elastic/elasticsearch';
import { MLJobParser } from './utils/job_parser';
import { MLJobManager, MLJobOptions } from './utils/job_manager';
import { MLGeneratorFactory } from './generators/generator_factory';
import { 
  MLGenerationResult, 
  MLBulkIndexOptions, 
  ML_SECURITY_MODULES,
  MLJobModule 
} from './types/ml_types';
import { getEsClient, indexCheck } from '../commands/utils/indices';
import { parseThemeConfig, getThemedData, type ParsedThemeConfig } from '../utils/theme_service';

export interface MLDataGenerationOptions {
  enableJobs?: boolean;
  startDatafeeds?: boolean;
  deleteExistingJobs?: boolean;
  bulkOptions?: MLBulkIndexOptions;
  namespace?: string;
  theme?: string;
  environment?: string;
}

export class MLDataGenerator {
  private client: Client;
  private jobManager: MLJobManager;

  constructor() {
    this.client = getEsClient();
    this.jobManager = new MLJobManager();
  }

  /**
   * Generate themed data for ML generators
   */
  private async getThemedDataForML(theme: string): Promise<any> {
    try {
      console.log(`🎨 Fetching themed data for theme: ${theme}`);
      
      const [usernames, hostnames, processNames, domains] = await Promise.all([
        getThemedData(theme as any, 'usernames', 50),
        getThemedData(theme as any, 'hostnames', 30),
        getThemedData(theme as any, 'processNames', 20),
        getThemedData(theme as any, 'domains', 15),
      ]);

      return {
        usernames,
        hostnames,
        processNames,
        domains,
      };
    } catch (error) {
      console.warn(`⚠️  Failed to fetch themed data for ${theme}, using default patterns:`, error instanceof Error ? error.message : error);
      return null;
    }
  }

  /**
   * Generate ML data for specific job IDs
   * Enhanced with theme support and multi-environment capabilities
   */
  public async generateMLData(
    jobIds: string[],
    options: MLDataGenerationOptions = {}
  ): Promise<MLGenerationResult[]> {
    const results: MLGenerationResult[] = [];
    
    // Get themed data if theme is specified
    let themedData = null;
    if (options.theme) {
      const themeConfig = parseThemeConfig(options.theme);
      if (themeConfig.usernames || themeConfig.hostnames) {
        themedData = await this.getThemedDataForML(options.theme);
      }
    }
    
    console.log(`🤖 Generating ML data for ${jobIds.length} jobs...`);
    
    for (const jobId of jobIds) {
      console.log(`\n📊 Processing ML job: ${jobId}`);
      
      try {
        const result = await this.generateSingleJobData(jobId, options, themedData);
        results.push(result);
        
        if (result.success) {
          console.log(`✅ Generated ${result.documentsGenerated} documents for ${jobId}`);
        } else {
          console.error(`❌ Failed to generate data for ${jobId}: ${result.error}`);
        }
        
      } catch (error) {
        console.error(`❌ Error processing job ${jobId}:`, error);
        results.push({
          jobId,
          indexName: `test_${jobId}`,
          documentsGenerated: 0,
          anomaliesGenerated: 0,
          timeRange: { start: 0, end: 0 },
          success: false,
          error: String(error)
        });
      }
    }
    
    return results;
  }

  /**
   * Generate ML data for entire security modules
   */
  public async generateMLDataForModules(
    moduleNames: string[],
    options: MLDataGenerationOptions = {}
  ): Promise<MLGenerationResult[]> {
    const allJobIds: string[] = [];
    
    for (const moduleName of moduleNames) {
      const module = ML_SECURITY_MODULES.find(m => m.name === moduleName);
      if (module) {
        allJobIds.push(...module.jobs);
        console.log(`📦 Added ${module.jobs.length} jobs from module: ${moduleName}`);
      } else {
        console.warn(`⚠️ Unknown security module: ${moduleName}`);
      }
    }
    
    if (allJobIds.length === 0) {
      console.error('❌ No valid jobs found in specified modules');
      return [];
    }
    
    console.log(`🎯 Total jobs to process: ${allJobIds.length}`);
    return this.generateMLData(allJobIds, options);
  }

  /**
   * Generate data for a single ML job
   * Maintains Python single job generation workflow
   */
  private async generateSingleJobData(
    jobId: string,
    options: MLDataGenerationOptions = {},
    themedData?: any
  ): Promise<MLGenerationResult> {
    const result: MLGenerationResult = {
      jobId,
      indexName: `test_${jobId}`,
      documentsGenerated: 0,
      anomaliesGenerated: 0,
      timeRange: { start: 0, end: 0 },
      success: false
    };

    try {
      // 1. Parse ML job configuration
      console.log(`🔍 Parsing job configuration for ${jobId}...`);
      const parser = new MLJobParser(jobId);
      const config = await parser.parseJobConfig();
      
      result.timeRange = {
        start: config.startTime,
        end: config.endTime
      };

      // 2. Create index with proper mapping
      const indexName = this.getIndexName(jobId, options.namespace);
      result.indexName = indexName;
      
      console.log(`📁 Creating index: ${indexName}`);
      await this.createMLIndex(indexName);

      // 3. Generate ML data with theme support
      console.log(`⚙️ Generating data with ${config.function} function...`);
      const generatorOptions: any = {
        anomalyRate: 0.0002,
        timeIncrement: [1, 10],
        burstSize: 100,
        stringLength: [5, 10],
      };
      
      // Add themed data if available
      if (themedData) {
        generatorOptions.themedData = themedData;
        console.log(`🎨 Using themed data: ${Object.keys(themedData).join(', ')}`);
      }
      
      const generator = MLGeneratorFactory.createGenerator(config, generatorOptions);
      const documents = await generator.generateAll();
      
      result.documentsGenerated = documents.length;

      // Count anomalies (approximate based on generator type)
      result.anomaliesGenerated = this.estimateAnomalies(documents.length, config.function);

      // 4. Bulk index data to Elasticsearch
      if (documents.length > 0) {
        console.log(`📤 Indexing ${documents.length} documents to ${indexName}...`);
        await this.bulkIndexDocuments(indexName, documents, options.bulkOptions);
      }

      // 5. Create ML job and datafeed if enabled
      if (options.enableJobs) {
        console.log(`🚀 Setting up ML job and datafeed...`);
        const jobOptions: MLJobOptions = {
          enableJob: true,
          startDatafeed: options.startDatafeeds,
          deleteExisting: options.deleteExistingJobs
        };
        
        // Note: This would require the actual ML job configuration
        // For now, we'll log that this step would happen
        console.log(`📋 ML job setup would be performed here with configuration from ${jobId}.json`);
      }

      result.success = true;
      console.log(`✅ Successfully generated ML data for ${jobId}`);

    } catch (error) {
      result.error = String(error);
      console.error(`❌ Failed to generate ML data for ${jobId}:`, error);
    }

    return result;
  }

  /**
   * Create ML index with proper mapping
   * Maintains Python mapping logic
   */
  private async createMLIndex(indexName: string): Promise<void> {
    const mapping: any = {
      properties: {
        '@timestamp': {
          type: 'date',
          format: 'epoch_second'
        }
      },
      dynamic_templates: [
        {
          string_as_ip: {
            path_match: '*.ip',
            mapping: {
              type: 'ip'
            }
          }
        },
        {
          string_as_keyword_error_code: {
            path_match: '*.error_code',
            mapping: {
              type: 'keyword'
            }
          }
        },
        {
          port_as_long: {
            path_match: '*.port',
            mapping: {
              type: 'long'
            }
          }
        },
        {
          default: {
            match_mapping_type: 'string',
            mapping: {
              type: 'keyword'
            }
          }
        }
      ]
    };

    await indexCheck(indexName, { mappings: mapping }, true);
  }

  /**
   * Bulk index documents to Elasticsearch
   * Maintains Python streaming bulk logic
   */
  private async bulkIndexDocuments(
    indexName: string,
    documents: any[],
    options: MLBulkIndexOptions = {}
  ): Promise<void> {
    const chunkSize = options.chunkSize || 1000;
    const operations: any[] = [];

    // Prepare bulk operations
    for (const doc of documents) {
      // Remove _index field from document as it should be in operation metadata
      const cleanDoc = { ...doc };
      delete cleanDoc._index;
      
      operations.push({
        create: {
          _index: indexName,
          _id: `${doc['@timestamp']}_${Math.random().toString(36).substr(2, 9)}`
        }
      });
      operations.push(cleanDoc);
    }

    // Execute bulk indexing in chunks
    for (let i = 0; i < operations.length; i += chunkSize * 2) {
      const chunk = operations.slice(i, i + chunkSize * 2);
      
      try {
        const response = await this.client.bulk({
          operations: chunk,
          refresh: options.refreshPolicy || 'true', // Force refresh for immediate visibility
          timeout: options.timeout || '60s'
        });
        
        // Check for bulk indexing errors
        if (response.errors) {
          const errors = response.items.filter((item: any) => {
            const operation = item.create || item.index;
            return operation && operation.error;
          });
          
          if (errors.length > 0) {
            console.error(`❌ Bulk indexing errors:`, errors.slice(0, 3)); // Show first 3 errors
            throw new Error(`Bulk indexing failed with ${errors.length} errors`);
          }
        }
        
        const docsInChunk = chunk.length / 2;
        process.stdout.write(`📤 Indexed ${docsInChunk} documents... `);
        
      } catch (error) {
        console.error(`❌ Bulk indexing error:`, error);
        throw error;
      }
    }
    
    console.log(`\n✅ Bulk indexing completed for ${indexName}`);
  }

  /**
   * Get index name with optional namespace
   */
  private getIndexName(jobId: string, namespace?: string): string {
    if (namespace && namespace !== 'default') {
      return `test_${jobId}_${namespace}`;
    }
    return `test_${jobId}`;
  }

  /**
   * Estimate number of anomalies based on document count and function type
   */
  private estimateAnomalies(documentCount: number, mlFunction: string): number {
    const rates: Record<string, number> = {
      'rare': 0.0002,
      'high_count': 0.0002,
      'high_non_zero_count': 0.0002,
      'high_distinct_count': 0.0002,
      'high_info_content': 0.0008,
      'time_of_day': 0.001 // Approximate based on midnight pattern
    };
    
    const rate = rates[mlFunction] || 0.0002;
    return Math.round(documentCount * rate);
  }

  /**
   * Delete ML data and jobs
   */
  public async deleteMLData(jobIds: string[], options: MLDataGenerationOptions = {}): Promise<void> {
    console.log(`🗑️ Deleting ML data for ${jobIds.length} jobs...`);
    
    for (const jobId of jobIds) {
      try {
        // Delete ML job and datafeed
        await this.jobManager.deleteMLJob(jobId);
        
        // Delete index
        const indexName = this.getIndexName(jobId, options.namespace);
        const indexExists = await this.client.indices.exists({ index: indexName });
        
        if (indexExists) {
          await this.client.indices.delete({ index: indexName });
          console.log(`✅ Deleted index: ${indexName}`);
        }
        
      } catch (error) {
        console.error(`❌ Failed to delete ML data for ${jobId}:`, error);
      }
    }
  }

  /**
   * Get available ML job IDs
   */
  public getAvailableJobIds(): string[] {
    return MLJobParser.getAvailableJobIds();
  }

  /**
   * Get available security modules
   */
  public getAvailableModules(): MLJobModule[] {
    return ML_SECURITY_MODULES;
  }
}
/**
 * Unified Alert Generation Service
 *
 * Main service that orchestrates the unified data pool generation and alert assembly
 * to replace the existing complex AI batch generation approach.
 */

import { unifiedDataPoolGenerator } from './unified_data_pool_generator';
import { unifiedAlertAssembler } from './unified_alert_assembler';
import {
  DataPoolGenerationConfig,
  AssemblyOptions,
  UnifiedSystemMetrics,
} from './unified_data_pool_types';
import { generateAIThemedEntities } from './ai_data_pool_service';
import { TimestampConfig } from '../utils/timestamp_utils';
import { getEsClient } from '../commands/utils/indices';
import { getAlertIndex } from '../utils';
import {
  displayGeneratedEntities,
  GeneratedEntities,
} from '../utils/entity_display';
import cliProgress from 'cli-progress';

/**
 * Configuration for unified alert generation
 */
export interface UnifiedGenerationConfig {
  alertCount: number;
  hostCount: number;
  userCount: number;
  space: string;
  namespace: string;
  useAI: boolean;
  useMitre: boolean;
  timestampConfig?: TimestampConfig;
  falsePositiveRate: number;
  multiFieldConfig?: {
    fieldCount: number;
    categories?: string[];
    performanceMode?: boolean;
    contextWeightEnabled?: boolean;
    correlationEnabled?: boolean;
  };
  theme?: string;
  caseOptions?: {
    createCases?: boolean;
    alertsPerCase?: number;
    caseGroupingStrategy?: 'by-time' | 'by-host' | 'by-rule' | 'by-severity';
  };
}

/**
 * Result of unified alert generation
 */
export interface UnifiedGenerationResult {
  alertsGenerated: number;
  indexName: string;
  performance: UnifiedSystemMetrics;
  generatedEntities: GeneratedEntities;
  errors: string[];
  warnings: string[];
}

/**
 * Main unified alert generation service
 */
export class UnifiedAlertGenerationService {
  /**
   * Generate alerts using the unified approach
   */
  async generateAlerts(
    config: UnifiedGenerationConfig,
  ): Promise<UnifiedGenerationResult> {
    const overallStartTime = Date.now();
    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      // Validate configuration
      this.validateConfig(config);

      // Show configuration summary
      this.showConfigurationSummary(config);

      // Step 1: Generate unified data pool
      console.log('🔄 Generating unified data pool...');
      const dataPoolConfig: DataPoolGenerationConfig = {
        alertCount: config.alertCount,
        fieldCount: config.multiFieldConfig?.fieldCount,
        categories: config.multiFieldConfig?.categories,
        theme: config.theme,
        mitreEnabled: config.useMitre,
        performanceMode: config.multiFieldConfig?.performanceMode || false,
        cacheEnabled: true,
      };

      const dataPoolResult =
        await unifiedDataPoolGenerator.generateDataPool(dataPoolConfig);

      if (dataPoolResult.errors.length > 0) {
        errors.push(...dataPoolResult.errors);
      }
      if (dataPoolResult.warnings.length > 0) {
        warnings.push(...dataPoolResult.warnings);
      }

      console.log(
        `✅ Data pool generated in ${dataPoolResult.performance.totalTimeMs}ms`,
      );
      console.log(
        `📊 AI calls: ${dataPoolResult.performance.aiCallsUsed}, Tokens: ${dataPoolResult.performance.tokensUsed}`,
      );

      // Step 2: Generate entity names for hosts and users
      console.log('🏗️ Generating entity names...');
      let userNames: string[];
      let hostNames: string[];
      let entityAICalls = 0;
      let entityTokens = 0;

      if (config.theme) {
        try {
          const entityResult = await generateAIThemedEntities(
            config.userCount,
            config.hostCount,
            config.theme,
          );
          userNames = entityResult.userNames;
          hostNames = entityResult.hostNames;
          entityAICalls = entityResult.aiCalls;
          entityTokens = entityResult.tokens;

          console.log(
            `✅ Generated ${userNames.length} themed usernames and ${hostNames.length} themed hostnames`,
          );
        } catch (_error) {
          console.warn('AI entity generation failed, using fallback');
          const fallbackResult = await this.generateEntityNames(
            config.userCount,
            config.hostCount,
            config.theme,
          );
          userNames = fallbackResult.userNames;
          hostNames = fallbackResult.hostNames;
        }
      } else {
        const result = await this.generateEntityNames(
          config.userCount,
          config.hostCount,
        );
        userNames = result.userNames;
        hostNames = result.hostNames;
      }

      // Step 3: Assemble alerts from data pool
      console.log('⚡ Assembling alerts...');
      const assemblyStartTime = Date.now();

      const assemblyOptions: AssemblyOptions = {
        space: config.space,
        namespace: config.namespace,
        timestampConfig: config.timestampConfig,
        falsePositiveRate: config.falsePositiveRate,
        correlationEnabled: config.multiFieldConfig?.correlationEnabled || true,
        variationEnabled: true,
      };

      const assemblyResults = unifiedAlertAssembler.assembleAlerts(
        dataPoolResult.pool,
        config.alertCount,
        assemblyOptions,
      );

      const assemblyTimeMs = Date.now() - assemblyStartTime;
      console.log(`✅ Alerts assembled in ${assemblyTimeMs}ms`);

      // Step 4: Assign entity names to alerts
      console.log('📋 Assigning entity names...');
      const finalAlerts = assemblyResults.map((result, index) => {
        const alert = result.alert;

        // Assign user and host names if not already themed
        if (!alert['user.name']) {
          alert['user.name'] = userNames[index % userNames.length];
        }
        if (!alert['host.name']) {
          alert['host.name'] = hostNames[index % hostNames.length];
        }

        // Update alert reason with entity names
        if (alert['kibana.alert.reason']) {
          alert['kibana.alert.reason'] =
            `${alert['kibana.alert.reason']} on ${alert['host.name']} by ${alert['user.name']}`;
        }

        return alert;
      });

      // Step 5: Bulk insert to Elasticsearch
      console.log('💾 Indexing alerts...');
      await this.bulkInsertAlerts(finalAlerts, config.space);

      // Step 6: Display generated entities
      const generatedEntities: GeneratedEntities = {
        userNames,
        hostNames,
      };

      displayGeneratedEntities(generatedEntities, {
        namespace: config.namespace,
        space: config.space,
        showKQLQueries: true,
        showSampleQueries: true,
      });

      // Calculate performance metrics
      const overallTimeMs = Date.now() - overallStartTime;
      const totalAICalls =
        dataPoolResult.performance.aiCallsUsed + entityAICalls;
      const totalTokens = dataPoolResult.performance.tokensUsed + entityTokens;

      const performance: UnifiedSystemMetrics = {
        dataPoolGeneration: {
          timeMs: dataPoolResult.performance.totalTimeMs,
          aiCalls: dataPoolResult.performance.aiCallsUsed,
          tokensUsed: dataPoolResult.performance.tokensUsed,
          cacheHitRate:
            dataPoolResult.performance.cacheHits /
            Math.max(1, dataPoolResult.performance.aiCallsUsed),
        },
        alertAssembly: {
          timeMs: assemblyTimeMs,
          alertsPerSecond: config.alertCount / (assemblyTimeMs / 1000),
          memoryUsageMB: process.memoryUsage().heapUsed / 1024 / 1024,
          correlationsApplied: assemblyResults.reduce(
            (sum, r) => sum + r.correlationsApplied,
            0,
          ),
        },
        overall: {
          totalTimeMs: overallTimeMs,
          speedImprovement: 0, // Will be calculated vs old approach
          tokenReduction: 0, // Will be calculated vs old approach
          reliabilityScore: errors.length === 0 ? 1.0 : 0.5,
        },
      };

      console.log(`\n🎉 Generation completed successfully!`);
      console.log(`📊 Total time: ${overallTimeMs}ms`);
      console.log(
        `⚡ Speed: ${(config.alertCount / (overallTimeMs / 1000)).toFixed(1)} alerts/sec`,
      );
      console.log(
        `🤖 AI efficiency: ${totalAICalls} calls for ${config.alertCount} alerts (${totalTokens} tokens)`,
      );

      return {
        alertsGenerated: config.alertCount,
        indexName: getAlertIndex(config.space),
        performance,
        generatedEntities,
        errors,
        warnings,
      };
    } catch (error) {
      errors.push(`Unified generation failed: ${(error as any).message}`);
      console.error('❌ Unified generation failed:', error);
      throw error;
    }
  }

  /**
   * Validate configuration
   */
  private validateConfig(config: UnifiedGenerationConfig): void {
    if (config.userCount > config.alertCount) {
      throw new Error('User count should be less than or equal to alert count');
    }

    if (config.hostCount > config.alertCount) {
      throw new Error('Host count should be less than or equal to alert count');
    }

    if (config.falsePositiveRate < 0 || config.falsePositiveRate > 1) {
      throw new Error('False positive rate must be between 0 and 1');
    }

    if (
      config.multiFieldConfig?.fieldCount &&
      config.multiFieldConfig.fieldCount < 1
    ) {
      throw new Error('Field count must be at least 1');
    }
  }

  /**
   * Show configuration summary
   */
  private showConfigurationSummary(config: UnifiedGenerationConfig): void {
    console.log(`\n🎯 Unified Alert Generation Configuration:`);
    console.log(`  📊 Alerts: ${config.alertCount}`);
    console.log(`  👥 Users: ${config.userCount}, Hosts: ${config.hostCount}`);
    console.log(`  🏠 Space: ${config.space}, Namespace: ${config.namespace}`);
    console.log(`  🤖 AI: ${config.useAI ? 'Enabled' : 'Disabled'}`);
    console.log(`  ⚔️ MITRE: ${config.useMitre ? 'Enabled' : 'Disabled'}`);

    if (config.multiFieldConfig) {
      console.log(
        `  🔬 Multi-Field: ${config.multiFieldConfig.fieldCount} fields`,
      );
      if (config.multiFieldConfig.categories) {
        console.log(
          `  📁 Categories: ${config.multiFieldConfig.categories.join(', ')}`,
        );
      }
    }

    if (config.theme) {
      console.log(`  🎨 Theme: ${config.theme}`);
    }

    if (config.falsePositiveRate > 0) {
      console.log(
        `  🚫 False Positives: ${(config.falsePositiveRate * 100).toFixed(1)}%`,
      );
    }

    console.log();
  }

  /**
   * Generate entity names (users and hosts)
   */
  private async generateEntityNames(
    userCount: number,
    hostCount: number,
    _theme?: string,
  ): Promise<{ userNames: string[]; hostNames: string[] }> {
    const { faker } = await import('@faker-js/faker');

    // Generate user names
    const userNames = Array.from({ length: userCount }, () => {
      const firstName = faker.person.firstName();
      const lastName = faker.person.lastName();
      return `${firstName.toLowerCase()}.${lastName.toLowerCase()}`;
    });

    // Generate host names
    const hostNames = Array.from({ length: hostCount }, () => {
      const departments = [
        'web',
        'db',
        'app',
        'mail',
        'dc',
        'file',
        'print',
        'backup',
      ];
      const environments = ['prod', 'dev', 'test', 'stage'];
      const department = faker.helpers.arrayElement(departments);
      const environment = faker.helpers.arrayElement(environments);
      const number = faker.number.int({ min: 1, max: 99 });

      return `${department}-${environment}-${number.toString().padStart(2, '0')}`;
    });

    return { userNames, hostNames };
  }

  /**
   * Bulk insert alerts to Elasticsearch
   */
  private async bulkInsertAlerts(
    alerts: Record<string, any>[],
    space: string,
  ): Promise<void> {
    const client = getEsClient();
    const indexName = getAlertIndex(space);

    // Create operations array for bulk insert
    const operations: any[] = [];

    alerts.forEach((alert) => {
      operations.push({
        index: {
          _index: indexName,
          _id: alert['kibana.alert.uuid'],
        },
      });
      operations.push(alert);
    });

    // Progress bar for bulk insert
    const progress = new cliProgress.SingleBar(
      {},
      cliProgress.Presets.shades_classic,
    );
    progress.start(alerts.length, 0);

    try {
      // Bulk insert with progress tracking
      const batchSize = 1000;
      for (let i = 0; i < operations.length; i += batchSize * 2) {
        const batch = operations.slice(i, i + batchSize * 2);
        await client.bulk({ operations: batch, refresh: false });
        progress.increment(batchSize / 2);
      }

      // Final refresh
      await client.indices.refresh({ index: indexName });
      progress.stop();

      console.log(
        `✅ Successfully indexed ${alerts.length} alerts to ${indexName}`,
      );
    } catch (error) {
      progress.stop();
      console.error('❌ Bulk insert failed:', error);
      throw error;
    }
  }
}

// Export singleton instance
export const unifiedAlertGenerationService =
  new UnifiedAlertGenerationService();

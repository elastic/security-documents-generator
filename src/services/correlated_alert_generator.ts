import {
  LogCorrelationEngine,
  CorrelatedLogSet,
} from './log_correlation_engine';
import createAlerts, { BaseCreateAlertsReturnType } from '../create_alerts';
import { generateMITREAlert } from '../utils/ai_service';
import { faker } from '@faker-js/faker';
import type { TimestampConfig } from '../utils/timestamp_utils';

export interface CorrelatedGenerationConfig {
  hostName?: string;
  userName?: string;
  space?: string;
  timestampConfig?: TimestampConfig;
  logVolumeMultiplier?: number; // How many supporting logs per alert (default: 6)
  useAI?: boolean;
  useMitre?: boolean;
}

/**
 * Correlated Alert Generator
 *
 * Generates security alerts along with their supporting source logs
 * to create realistic attack scenarios that would actually trigger
 * the generated alerts.
 */
export class CorrelatedAlertGenerator {
  private correlationEngine: LogCorrelationEngine;

  constructor() {
    this.correlationEngine = new LogCorrelationEngine();
  }

  /**
   * Generate a single correlated alert with supporting logs
   */
  async generateCorrelatedAlert(
    config: CorrelatedGenerationConfig = {},
  ): Promise<CorrelatedLogSet> {
    const {
      hostName = faker.internet.domainName(),
      userName = faker.internet.username(),
      space = 'default',
      timestampConfig,
      logVolumeMultiplier = 6,
      useAI = false,
      useMitre = false,
    } = config;

    let alert: BaseCreateAlertsReturnType;

    // Generate alert using AI/MITRE if enabled, otherwise use standard generation
    if (useAI && useMitre) {
      alert = await generateMITREAlert({
        hostName,
        userName,
        space,
        examples: [
          createAlerts({}, { hostName, userName, space, timestampConfig }),
        ],
        timestampConfig,
      });
    } else {
      alert = createAlerts(
        {},
        {
          hostName,
          userName,
          space,
          timestampConfig,
        },
      );
    }

    // Generate correlated logs for this alert
    const correlatedScenario =
      await this.correlationEngine.generateAttackScenario(alert, {
        hostName,
        userName,
        timestampConfig,
        logCount: logVolumeMultiplier,
        alertTimestamp: alert['@timestamp'],
      });

    return correlatedScenario;
  }

  /**
   * Generate multiple correlated alerts with their supporting logs
   */
  async generateCorrelatedAlertBatch(
    alertCount: number,
    config: CorrelatedGenerationConfig = {},
  ): Promise<CorrelatedLogSet[]> {
    const {
      hostName = faker.internet.domainName(),
      userName = faker.internet.username(),
      logVolumeMultiplier = 6,
    } = config;

    const scenarios: CorrelatedLogSet[] = [];

    for (let i = 0; i < alertCount; i++) {
      try {
        const scenario = await this.generateCorrelatedAlert({
          ...config,
          hostName: hostName,
          userName: userName,
        });
        scenarios.push(scenario);

        // Add small delay to avoid overwhelming APIs
        if (config.useAI && i < alertCount - 1) {
          await new Promise((resolve) => setTimeout(resolve, 200));
        }
      } catch (error) {
        console.error(`Error generating correlated alert ${i + 1}:`, error);

        // Fallback to standard alert generation
        const fallbackAlert = createAlerts(
          {},
          {
            hostName,
            userName,
            space: config.space,
            timestampConfig: config.timestampConfig,
          },
        );

        const fallbackLogs =
          await this.correlationEngine.generateCorrelatedLogs(fallbackAlert, {
            hostName,
            userName,
            logCount: logVolumeMultiplier,
          });

        scenarios.push({
          alert: fallbackAlert,
          supportingLogs: fallbackLogs,
          attackNarrative:
            'Fallback attack scenario: Basic detection with supporting evidence',
        });
      }
    }

    return scenarios;
  }

  /**
   * Generate a realistic attack campaign with correlated logs
   */
  async generateAttackCampaign(
    alertCount: number,
    targetHosts: string[],
    targetUsers: string[],
    config: CorrelatedGenerationConfig = {},
  ): Promise<{
    scenarios: CorrelatedLogSet[];
    campaignSummary: {
      totalAlerts: number;
      totalLogs: number;
      attackTypes: string[];
      affectedHosts: string[];
      affectedUsers: string[];
      timeSpan: {
        start: string;
        end: string;
      };
    };
  }> {
    const scenarios: CorrelatedLogSet[] = [];
    const attackTypes = new Set<string>();
    const affectedHosts = new Set<string>();
    const affectedUsers = new Set<string>();
    let totalLogs = 0;
    let earliestTime = new Date();
    let latestTime = new Date(0);

    console.log(
      `Generating correlated attack campaign with ${alertCount} alerts...`,
    );

    for (let i = 0; i < alertCount; i++) {
      const hostName = targetHosts[i % targetHosts.length];
      const userName = targetUsers[i % targetUsers.length];

      try {
        const scenario = await this.generateCorrelatedAlert({
          ...config,
          hostName,
          userName,
        });

        scenarios.push(scenario);
        totalLogs += scenario.supportingLogs.length;

        // Track attack metadata
        const alertAny = scenario.alert as any;
        const technique =
          alertAny['threat.technique.id'] ||
          alertAny['threat.technique.name'] ||
          'Unknown';
        attackTypes.add(Array.isArray(technique) ? technique[0] : technique);
        affectedHosts.add(hostName);
        affectedUsers.add(userName);

        // Track time span
        const alertTime = new Date(scenario.alert['@timestamp']);
        if (alertTime < earliestTime) earliestTime = alertTime;
        if (alertTime > latestTime) latestTime = alertTime;

        // Progress indicator
        if ((i + 1) % 10 === 0) {
          console.log(
            `Generated ${i + 1}/${alertCount} correlated scenarios...`,
          );
        }

        // Throttle API calls
        if (config.useAI && i < alertCount - 1) {
          await new Promise((resolve) => setTimeout(resolve, 300));
        }
      } catch (error) {
        console.error(`Error generating campaign scenario ${i + 1}:`, error);
      }
    }

    const campaignSummary = {
      totalAlerts: scenarios.length,
      totalLogs,
      attackTypes: Array.from(attackTypes),
      affectedHosts: Array.from(affectedHosts),
      affectedUsers: Array.from(affectedUsers),
      timeSpan: {
        start: earliestTime.toISOString(),
        end: latestTime.toISOString(),
      },
    };

    return {
      scenarios,
      campaignSummary,
    };
  }

  /**
   * Extract all logs from correlated scenarios for bulk indexing
   */
  extractLogsForIndexing(scenarios: CorrelatedLogSet[]): {
    alerts: BaseCreateAlertsReturnType[];
    logs: any[];
    indexOperations: unknown[];
  } {
    const alerts: BaseCreateAlertsReturnType[] = [];
    const logs: any[] = [];
    const indexOperations: unknown[] = [];

    for (const scenario of scenarios) {
      // Add alert
      alerts.push(scenario.alert);

      // Add supporting logs
      logs.push(...scenario.supportingLogs);

      // Prepare alert for indexing
      indexOperations.push({
        create: {
          _index: '.alerts-security.alerts-default', // or determine from space
          _id: scenario.alert['kibana.alert.uuid'],
        },
      });
      indexOperations.push(scenario.alert);

      // Prepare logs for indexing
      for (const log of scenario.supportingLogs) {
        const dataset = log['data_stream.dataset'] || 'generic.log';
        const namespace = log['data_stream.namespace'] || 'default';
        const indexName = `logs-${dataset}-${namespace}`;

        indexOperations.push({
          create: {
            _index: indexName,
            _id: faker.string.uuid(),
          },
        });
        indexOperations.push(log);
      }
    }

    return {
      alerts,
      logs,
      indexOperations,
    };
  }
}

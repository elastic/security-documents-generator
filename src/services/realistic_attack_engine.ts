import {
  AttackSimulationEngine,
  AttackSimulation,
} from './attack_simulation_engine';
import { LogCorrelationEngine } from './log_correlation_engine';
import { CorrelatedAlertGenerator } from './correlated_alert_generator';
import { faker } from '@faker-js/faker';
import type { TimestampConfig } from '../utils/timestamp_utils';

export interface RealisticCampaignConfig {
  // Campaign settings
  campaignType: 'apt' | 'ransomware' | 'insider' | 'supply_chain';
  complexity: 'low' | 'medium' | 'high' | 'expert';

  // Realism settings
  enableRealisticLogs: boolean;
  logsPerStage: number;
  detectionRate: number; // 0.0 - 1.0 (what % of suspicious activity gets detected)

  // Scale settings
  eventCount: number;
  targetCount: number;
  space: string;

  // AI settings
  useAI: boolean;
  useMitre: boolean;
  timestampConfig?: TimestampConfig;
}

export interface RealisticCampaignResult {
  campaign: AttackSimulation;
  stageLogs: CampaignStageLogs[];
  detectedAlerts: any[];
  missedActivities: any[];
  timeline: CampaignTimeline;
  investigationGuide: InvestigationStep[];
}

export interface CampaignStageLogs {
  stageId: string;
  stageName: string;
  technique: string;
  logs: any[];
  detected: boolean;
  detectionDelay?: number; // minutes after logs before alert
}

export interface CampaignTimeline {
  start: string;
  end: string;
  stages: TimelineStage[];
}

export interface TimelineStage {
  timestamp: string;
  type: 'log' | 'alert' | 'stage_start' | 'stage_end';
  description: string;
  technique?: string;
  severity?: string;
}

export interface InvestigationStep {
  step: number;
  action: string;
  expectedFindings: string[];
  kibanaQuery: string;
  timeframe: string;
}

/**
 * Realistic Attack Engine
 *
 * Enhances the AttackSimulationEngine to generate complete realistic scenarios
 * with proper log-to-alert progression that mimics real-world detection.
 */
export class RealisticAttackEngine {
  private attackEngine: AttackSimulationEngine;
  private correlationEngine: LogCorrelationEngine;
  private alertGenerator: CorrelatedAlertGenerator;

  constructor() {
    this.attackEngine = new AttackSimulationEngine({
      networkComplexity: 'high',
      enableCorrelation: true,
      enablePerformanceOptimization: true,
    });
    this.correlationEngine = new LogCorrelationEngine();
    this.alertGenerator = new CorrelatedAlertGenerator();
  }

  /**
   * Generate a complete realistic attack campaign with logs and alerts
   */
  async generateRealisticCampaign(
    config: RealisticCampaignConfig,
  ): Promise<RealisticCampaignResult> {
    console.log(`🎭 Generating realistic ${config.campaignType} campaign...`);

    // 1. Generate the base attack simulation
    const campaign = await this.attackEngine.generateAttackSimulation(
      config.campaignType,
      config.complexity,
    );

    console.log(`📋 Campaign generated: ${campaign.stages.length} stages`);

    // 2. Generate realistic logs for each stage
    const stageLogs = await this.generateStageBasedLogs(campaign, config);

    console.log(
      `📊 Generated ${stageLogs.reduce((sum, stage) => sum + stage.logs.length, 0)} stage-based logs`,
    );

    // 3. Simulate detection and generate alerts
    const { detectedAlerts, missedActivities } = await this.simulateDetection(
      stageLogs,
      config,
    );

    console.log(
      `🚨 Simulated detection: ${detectedAlerts.length} alerts, ${missedActivities.length} missed activities`,
    );

    // 4. Create complete timeline
    const timeline = this.buildCampaignTimeline(
      campaign,
      stageLogs,
      detectedAlerts,
    );

    // 5. Generate investigation guide
    const investigationGuide = this.generateInvestigationGuide(
      campaign,
      stageLogs,
      detectedAlerts,
    );

    return {
      campaign,
      stageLogs,
      detectedAlerts,
      missedActivities,
      timeline,
      investigationGuide,
    };
  }

  /**
   * Generate logs for each campaign stage based on MITRE techniques
   */
  private async generateStageBasedLogs(
    campaign: AttackSimulation,
    config: RealisticCampaignConfig,
  ): Promise<CampaignStageLogs[]> {
    const stageLogs: CampaignStageLogs[] = [];

    for (const stage of campaign.stages) {
      console.log(
        `  📝 Generating logs for stage: ${stage.name} (${stage.techniques.join(', ')})`,
      );

      const logs: any[] = [];

      // Generate logs for each technique in the stage
      for (const technique of stage.techniques) {
        try {
          // Create a mock alert to use correlation engine
          const mockAlert = {
            '@timestamp': stage.start_time.toISOString(),
            'host.name': faker.internet.domainName(), // Generate hostname since targets structure is unknown
            'user.name': faker.internet.username(),
            'threat.technique.id': technique,
            'kibana.alert.uuid': faker.string.uuid(),
          } as any;

          // Generate correlated logs for this technique
          const techniqueeLogs =
            await this.correlationEngine.generateCorrelatedLogs(mockAlert, {
              hostName: mockAlert['host.name'],
              userName: mockAlert['user.name'],
              timestampConfig: {
                startDate: stage.start_time.toISOString(),
                endDate: stage.end_time.toISOString(),
                pattern: 'attack_simulation',
              },
              logCount: config.logsPerStage,
            });

          logs.push(...techniqueeLogs);
        } catch (error: any) {
          console.warn(
            `Warning: Could not generate logs for technique ${technique}:`,
            error?.message || 'Unknown error',
          );
        }
      }

      stageLogs.push({
        stageId: stage.id,
        stageName: stage.name,
        technique: stage.techniques.join(', '),
        logs,
        detected: false, // Will be determined in detection simulation
      });
    }

    return stageLogs;
  }

  /**
   * Simulate realistic detection based on logs
   */
  private async simulateDetection(
    stageLogs: CampaignStageLogs[],
    config: RealisticCampaignConfig,
  ): Promise<{ detectedAlerts: any[]; missedActivities: any[] }> {
    const detectedAlerts: any[] = [];
    const missedActivities: any[] = [];

    for (const stage of stageLogs) {
      // Determine if this stage gets detected based on detection rate
      const shouldDetect = Math.random() < config.detectionRate;

      if (shouldDetect && stage.logs.length > 0) {
        // This stage will be detected - generate alerts
        try {
          console.log(
            `  🚨 Simulating detection for stage: ${stage.stageName}`,
          );

          // Select trigger logs (typically the most suspicious ones)
          const triggerLogs = stage.logs.slice(-2); // Last 2 logs in the sequence

          for (const triggerLog of triggerLogs) {
            // Generate an alert that would be triggered by this log
            const alert = await this.generateTriggeredAlert(
              triggerLog,
              stage,
              config,
            );
            detectedAlerts.push(alert);
          }

          // Mark stage as detected
          stage.detected = true;
          stage.detectionDelay = faker.number.int({ min: 2, max: 30 }); // 2-30 minutes delay
        } catch (error: any) {
          console.warn(
            `Warning: Could not generate alert for stage ${stage.stageName}:`,
            error?.message || 'Unknown error',
          );
          missedActivities.push({
            stage: stage.stageName,
            reason: 'alert_generation_failed',
            logs: stage.logs.length,
          });
        }
      } else {
        // This stage was not detected
        console.log(
          `  ⚪ Stage ${stage.stageName} not detected (below detection threshold)`,
        );
        missedActivities.push({
          stage: stage.stageName,
          reason: shouldDetect ? 'no_logs' : 'below_detection_threshold',
          logs: stage.logs.length,
        });
      }
    }

    return { detectedAlerts, missedActivities };
  }

  /**
   * Generate an alert that would be triggered by a specific log
   */
  private async generateTriggeredAlert(
    triggerLog: any,
    stage: CampaignStageLogs,
    config: RealisticCampaignConfig,
  ): Promise<any> {
    // Extract relevant information from the trigger log
    const hostName = triggerLog['host.name'] || faker.internet.domainName();
    const userName = triggerLog['user.name'] || faker.internet.username();
    const technique =
      triggerLog['threat.technique.id'] ||
      stage.technique.split(',')[0]?.trim();

    // Generate timestamp slightly after the log (detection delay)
    const logTime = new Date(triggerLog['@timestamp']);
    const alertTime = new Date(
      logTime.getTime() + (stage.detectionDelay || 5) * 60 * 1000,
    );

    // Create a realistic alert based on the log
    const alert = {
      '@timestamp': alertTime.toISOString(),
      'host.name': hostName,
      'user.name': userName,
      'kibana.alert.uuid': faker.string.uuid(),
      'kibana.alert.rule.name': this.generateRuleName(triggerLog, technique),
      'kibana.alert.reason': `Suspicious activity detected on ${hostName}`,
      'kibana.alert.severity': this.determineSeverity(triggerLog, technique),
      'kibana.alert.risk_score': faker.number.int({ min: 40, max: 100 }),
      'event.kind': 'signal',
      'event.category': ['intrusion_detection'],
      'threat.technique.id': technique,
      'threat.technique.name': this.getTechniqueName(technique),
      'kibana.space_ids': [config.space],
      // Link back to the source log
      _source_log: {
        index: triggerLog._index || 'logs-unknown',
        dataset: triggerLog['data_stream.dataset'],
        timestamp: triggerLog['@timestamp'],
      },
    };

    return alert;
  }

  /**
   * Generate realistic detection rule names based on log patterns
   */
  private generateRuleName(log: any, technique: string): string {
    const dataset = log['data_stream.dataset'] || 'unknown';
    const action = log['event.action'] || 'activity';

    const ruleTemplates: Record<string, string> = {
      T1566: 'Email Security: Malicious Attachment Detection',
      T1059: 'Command Line: Suspicious PowerShell Execution',
      T1055: 'Process Security: Code Injection Detected',
      T1003: 'Credential Access: Dumping Attempt',
      default: `${dataset.charAt(0).toUpperCase() + dataset.slice(1)}: Suspicious ${action}`,
    };

    return ruleTemplates[technique] || ruleTemplates['default'];
  }

  /**
   * Determine alert severity based on technique and log content
   */
  private determineSeverity(
    log: any,
    technique: string,
  ): 'low' | 'medium' | 'high' | 'critical' {
    const severityMap: Record<string, 'low' | 'medium' | 'high' | 'critical'> =
      {
        T1566: 'high', // Phishing
        T1059: 'medium', // Command execution
        T1055: 'high', // Process injection
        T1003: 'critical', // Credential dumping
        T1070: 'medium', // Indicator removal
        T1083: 'low', // File discovery
      };

    return severityMap[technique] || 'medium';
  }

  private getTechniqueName(techniqueId: string): string {
    const nameMap: Record<string, string> = {
      T1566: 'Phishing',
      T1059: 'Command and Scripting Interpreter',
      T1055: 'Process Injection',
      T1003: 'OS Credential Dumping',
    };
    return nameMap[techniqueId] || techniqueId;
  }

  /**
   * Build a complete timeline of the campaign
   */
  private buildCampaignTimeline(
    campaign: AttackSimulation,
    stageLogs: CampaignStageLogs[],
    alerts: any[],
  ): CampaignTimeline {
    const events: TimelineStage[] = [];

    // Add campaign start
    events.push({
      timestamp: campaign.campaign.duration.start.toISOString(),
      type: 'stage_start',
      description: `${campaign.campaign.type.toUpperCase()} campaign initiated by ${campaign.campaign.threat_actor}`,
    });

    // Add stage events
    for (const stage of campaign.stages) {
      events.push({
        timestamp: stage.start_time.toISOString(),
        type: 'stage_start',
        description: `Stage: ${stage.name}`,
        technique: stage.techniques.join(', '),
      });

      // Add logs for this stage
      const stageLogsData = stageLogs.find((sl) => sl.stageId === stage.id);
      if (stageLogsData) {
        for (const log of stageLogsData.logs.slice(0, 3)) {
          // Show first 3 logs
          events.push({
            timestamp: log['@timestamp'],
            type: 'log',
            description: `${log['data_stream.dataset']}: ${log['event.action'] || 'activity'}`,
            technique: log['threat.technique.id'],
          });
        }
      }
    }

    // Add alerts
    for (const alert of alerts) {
      events.push({
        timestamp: alert['@timestamp'],
        type: 'alert',
        description: alert['kibana.alert.rule.name'],
        technique: alert['threat.technique.id'],
        severity: alert['kibana.alert.severity'],
      });
    }

    // Sort by timestamp
    events.sort(
      (a, b) =>
        new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
    );

    return {
      start: campaign.campaign.duration.start.toISOString(),
      end: campaign.campaign.duration.end.toISOString(),
      stages: events,
    };
  }

  /**
   * Generate an investigation guide for the scenario
   */
  private generateInvestigationGuide(
    campaign: AttackSimulation,
    stageLogs: CampaignStageLogs[],
    alerts: any[],
  ): InvestigationStep[] {
    const steps: InvestigationStep[] = [];

    steps.push({
      step: 1,
      action: 'Review initial alerts and identify affected systems',
      expectedFindings: [
        `${alerts.length} security alerts`,
        `Affected hosts: ${[...new Set(alerts.map((a) => a['host.name']))].join(', ')}`,
        `Attack techniques: ${[...new Set(alerts.map((a) => a['threat.technique.id']))].join(', ')}`,
      ],
      kibanaQuery: 'kibana.alert.rule.name:* AND @timestamp:[now-24h TO now]',
      timeframe: 'Last 24 hours',
    });

    steps.push({
      step: 2,
      action: 'Investigate supporting logs around alert times',
      expectedFindings: [
        `${stageLogs.reduce((sum, stage) => sum + stage.logs.length, 0)} related log events`,
        'Process execution chains',
        'Network connections to suspicious IPs',
      ],
      kibanaQuery: `host.name:(${[...new Set(alerts.map((a) => a['host.name']))].join(' OR ')}) AND @timestamp:[now-24h TO now]`,
      timeframe: '24 hours around alert times',
    });

    if (campaign.campaign.type === 'apt') {
      steps.push({
        step: 3,
        action: 'Look for lateral movement and persistence',
        expectedFindings: [
          'Registry modifications for persistence',
          'Credential dumping attempts',
          'Cross-host authentication events',
        ],
        kibanaQuery:
          'event.category:(registry OR authentication) AND event.outcome:success',
        timeframe: 'Full campaign duration',
      });
    }

    return steps;
  }
}

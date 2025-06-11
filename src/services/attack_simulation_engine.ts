/**
 * Attack Simulation Engine
 *
 * This service orchestrates complex, multi-stage attack scenarios with
 * sophisticated temporal correlation, realistic field generation, and
 * comprehensive artifact creation for testing Kibana's AI security capabilities.
 */

import { faker } from '@faker-js/faker';
import { TimestampConfig } from '../utils/timestamp_utils';
import { generateAIAlert } from '../utils/ai_service';
import { BaseCreateAlertsReturnType } from '../create_alerts';

// Import attack scenarios
import { getAllAPTCampaigns } from '../attack_scenarios/apt_campaigns';
import { getAllRansomwareChains } from '../attack_scenarios/ransomware_chains';
import { getAllInsiderThreatScenarios } from '../attack_scenarios/insider_threats';
import { getAllSupplyChainAttacks } from '../attack_scenarios/supply_chain';

export interface NetworkTopology {
  subnets: NetworkSubnet[];
  critical_assets: CriticalAsset[];
  trust_relationships: TrustRelationship[];
  security_controls: SecurityControl[];
}

export interface NetworkSubnet {
  id: string;
  cidr: string;
  name: string;
  security_zone: 'dmz' | 'internal' | 'management' | 'critical';
  host_count: number;
  services: string[];
}

export interface CriticalAsset {
  id: string;
  hostname: string;
  ip_address: string;
  subnet_id: string;
  asset_type:
    | 'domain_controller'
    | 'file_server'
    | 'database'
    | 'web_server'
    | 'workstation';
  criticality: 'low' | 'medium' | 'high' | 'critical';
  os_family: 'windows' | 'linux' | 'macos';
  services: string[];
}

export interface TrustRelationship {
  source_id: string;
  target_id: string;
  relationship_type:
    | 'domain_trust'
    | 'service_account'
    | 'admin_access'
    | 'network_share';
  privilege_level: 'read' | 'write' | 'admin' | 'system';
}

export interface SecurityControl {
  id: string;
  type: 'antivirus' | 'edr' | 'firewall' | 'dlp' | 'siem' | 'proxy';
  coverage: string[]; // asset IDs
  effectiveness: number; // 0-1
  detection_rules: string[];
}

export interface LateralMovementPath {
  id: string;
  source_asset: string;
  target_asset: string;
  techniques: string[];
  prerequisites: string[];
  success_probability: number;
  detection_likelihood: number;
}

export interface CorrelationContext {
  campaign_id: string;
  stage_name: string;
  parent_events: string[];
  temporal_window: {
    start: Date;
    end: Date;
  };
  affected_assets: string[];
  threat_actor: string;
}

export interface AttackSimulation {
  campaign: {
    id: string;
    name: string;
    type: 'apt' | 'ransomware' | 'insider' | 'supply_chain';
    threat_actor: any;
    duration: TimeRange;
    objectives: string[];
  };
  stages: SimulationStage[];
  artifacts: SecurityArtifact[];
  network_topology: NetworkTopology;
  lateral_movement_paths: LateralMovementPath[];
  correlation_timeline: CorrelationEvent[];
}

export interface TimeRange {
  start: Date;
  end: Date;
}

export interface SimulationStage {
  id: string;
  name: string;
  tactic: string;
  techniques: string[];
  start_time: Date;
  end_time: Date;
  objectives: string[];
  generated_events: GeneratedEvent[];
  correlation_keys: string[];
}

export interface GeneratedEvent {
  id: string;
  timestamp: Date;
  event_type: 'alert' | 'log' | 'network' | 'process' | 'file';
  source_asset: string;
  technique: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  correlation_id: string;
  raw_data: any;
}

export interface SecurityArtifact {
  type: 'process' | 'file' | 'network' | 'registry' | 'event';
  name: string;
  description: string;
  detectability: 'low' | 'medium' | 'high';
  iocs: string[];
}

export interface CorrelationEvent {
  timestamp: Date;
  stage: string;
  technique: string;
  assets: string[];
  correlation_score: number;
}

export interface UserBehaviorProfile {
  user_id: string;
  role: string;
  department: string;
  access_level: 'standard' | 'privileged' | 'admin';
  normal_hours: {
    start: number; // hour of day
    end: number;
  };
  typical_activities: string[];
  baseline_metrics: {
    files_accessed_per_day: number;
    network_connections_per_hour: number;
    failed_login_rate: number;
  };
}

export interface AttackSimulationConfig {
  networkComplexity?: 'low' | 'medium' | 'high' | 'expert';
  enableCorrelation?: boolean;
  enablePerformanceOptimization?: boolean;
}

/**
 * Main Attack Simulation Engine Class
 */
export class AttackSimulationEngine {
  private networkTopology: NetworkTopology;
  private userProfiles: Map<string, UserBehaviorProfile>;
  private correlationEngine: CorrelationEngine;
  private config: AttackSimulationConfig;

  constructor(config: AttackSimulationConfig = {}) {
    this.config = {
      networkComplexity: 'high',
      enableCorrelation: true,
      enablePerformanceOptimization: false,
      ...config,
    };
    this.networkTopology = this.generateNetworkTopology();
    this.userProfiles = new Map();
    this.correlationEngine = new CorrelationEngine();
  }

  /**
   * Generates a complete attack simulation with correlated events
   */
  async generateAttackSimulation(
    scenarioType: 'apt' | 'ransomware' | 'insider' | 'supply_chain' = 'apt',
    complexity: 'low' | 'medium' | 'high' | 'expert' = 'high',
  ): Promise<AttackSimulation> {
    // Select appropriate scenario
    const scenario = this.selectScenario(scenarioType, complexity);

    // Generate temporal framework
    const timeRange = this.generateTimeRange(scenario);

    // Create simulation structure
    const simulation: AttackSimulation = {
      campaign: {
        id: faker.string.uuid(),
        name: scenario.name,
        type: scenarioType,
        threat_actor:
          (scenario as any).threatActor?.name ||
          (scenario as any).group?.name ||
          (scenario as any).insider?.name ||
          'Unknown Threat Actor',
        duration: timeRange,
        objectives: this.extractObjectives(scenario),
      },
      stages: [],
      artifacts: [],
      network_topology: this.networkTopology,
      lateral_movement_paths: this.generateLateralMovementPaths(),
      correlation_timeline: [],
    };

    // Generate stages with temporal correlation
    simulation.stages = await this.generateCorrelatedStages(
      scenario,
      timeRange,
    );

    // Generate artifacts for each stage
    simulation.artifacts = this.generateStageArtifacts(simulation.stages);

    // Build correlation timeline
    simulation.correlation_timeline = this.buildCorrelationTimeline(
      simulation.stages,
    );

    return simulation;
  }

  /**
   * Generates correlated security events for a complete campaign
   */
  async generateCampaignEvents(
    simulation: AttackSimulation,
    targetCount: number,
    eventCount: number,
    space: string = 'default',
    useMitre: boolean = true,
    timestampConfig?: TimestampConfig,
  ): Promise<BaseCreateAlertsReturnType[]> {
    const allEvents: BaseCreateAlertsReturnType[] = [];

    // Generate realistic host list
    const targetHosts = this.generateTargetHosts(targetCount);

    const correlationContext: CorrelationContext = {
      campaign_id: simulation.campaign.id,
      stage_name: '',
      parent_events: [],
      temporal_window: simulation.campaign.duration,
      affected_assets: targetHosts,
      threat_actor: simulation.campaign.threat_actor,
    };

    // Calculate events per stage based on total event count
    const eventsPerStage = Math.ceil(eventCount / simulation.stages.length);

    console.log(`🎯 Generating sophisticated attack campaign:`);
    console.log(`  📊 Total Events: ${eventCount}`);
    console.log(`  🏢 Target Hosts: ${targetHosts.length}`);
    console.log(`  📈 Stages: ${simulation.stages.length}`);
    console.log(`  ⚡ Events per Stage: ${eventsPerStage}`);

    // Generate events for each stage with proper correlation
    for (const [stageIndex, stage] of simulation.stages.entries()) {
      correlationContext.stage_name = stage.name;
      correlationContext.parent_events = allEvents.map(
        (e) => e['kibana.alert.uuid'] as string,
      );

      console.log(
        `\n🔄 Stage ${stageIndex + 1}/${simulation.stages.length}: ${stage.name}`,
      );
      console.log(
        `  ⏰ Duration: ${stage.start_time.toISOString()} → ${stage.end_time.toISOString()}`,
      );
      console.log(`  🎯 Techniques: ${stage.techniques.join(', ')}`);

      const stageEvents = await this.generateStageEvents(
        stage,
        targetHosts,
        eventsPerStage,
        space,
        correlationContext,
        useMitre,
      );

      // Add sophisticated correlation metadata
      const correlatedEvents = this.addCorrelationMetadata(
        stageEvents,
        simulation,
        stage,
        stageIndex,
        allEvents.length,
      );

      allEvents.push(...correlatedEvents);
      console.log(
        `  ✅ Generated ${correlatedEvents.length} correlated events`,
      );
    }

    // Apply cross-stage correlation analysis
    const finalEvents = this.applyAdvancedCorrelation(allEvents, simulation);

    console.log(`\n🧠 Advanced Correlation Applied:`);
    console.log(`  🔗 Total Correlated Events: ${finalEvents.length}`);
    console.log(
      `  📊 Campaign Success Rate: ${this.calculateCampaignSuccess(finalEvents)}%`,
    );

    return finalEvents;
  }

  private selectScenario(
    type: 'apt' | 'ransomware' | 'insider' | 'supply_chain',
    complexity: string,
  ): any {
    switch (type) {
      case 'apt':
        const aptCampaigns = getAllAPTCampaigns();
        return aptCampaigns[Math.floor(Math.random() * aptCampaigns.length)];
      case 'ransomware':
        const ransomwareChains = getAllRansomwareChains();
        return ransomwareChains[
          Math.floor(Math.random() * ransomwareChains.length)
        ];
      case 'insider':
        const insiderScenarios = getAllInsiderThreatScenarios();
        return insiderScenarios[
          Math.floor(Math.random() * insiderScenarios.length)
        ];
      case 'supply_chain':
        const supplyChainAttacks = getAllSupplyChainAttacks();
        return supplyChainAttacks[
          Math.floor(Math.random() * supplyChainAttacks.length)
        ];
      default:
        throw new Error(`Unknown scenario type: ${type}`);
    }
  }

  private generateTimeRange(scenario: any): TimeRange {
    const now = new Date();
    const startDaysAgo = faker.number.int({ min: 30, max: 90 });
    const start = new Date(now.getTime() - startDaysAgo * 24 * 60 * 60 * 1000);

    let durationDays: number;
    if (scenario.duration) {
      durationDays = faker.number.int({
        min: scenario.duration.min || 1,
        max: scenario.duration.max || 30,
      });
    } else if (scenario.estimated_timeline) {
      durationDays = scenario.estimated_timeline.execution_days || 30;
    } else {
      durationDays = faker.number.int({ min: 7, max: 60 });
    }

    const end = new Date(start.getTime() + durationDays * 24 * 60 * 60 * 1000);

    return { start, end };
  }

  private extractObjectives(scenario: any): string[] {
    if (scenario.stages && scenario.stages[0]?.objectives) {
      return scenario.stages.flatMap((stage: any) => stage.objectives || []);
    }
    if (scenario.activities) {
      return scenario.activities.flatMap(
        (activity: any) => activity.indicators || [],
      );
    }
    return ['Establish persistence', 'Collect intelligence', 'Maintain access'];
  }

  private async generateCorrelatedStages(
    scenario: any,
    timeRange: TimeRange,
  ): Promise<SimulationStage[]> {
    const stages: SimulationStage[] = [];
    const scenarioStages = scenario.stages || [];

    let currentTime = new Date(timeRange.start);

    for (const [index, stageData] of scenarioStages.entries()) {
      const stageDuration = this.calculateStageDuration(stageData);
      const stageEnd = new Date(currentTime.getTime() + stageDuration);

      const stage: SimulationStage = {
        id: faker.string.uuid(),
        name: stageData.name,
        tactic: stageData.tactic,
        techniques: stageData.techniques || [],
        start_time: new Date(currentTime),
        end_time: stageEnd,
        objectives: stageData.objectives || [],
        generated_events: [],
        correlation_keys: [`stage_${index}`, stageData.name, stageData.tactic],
      };

      stages.push(stage);
      currentTime = new Date(
        stageEnd.getTime() +
          faker.number.int({ min: 1, max: 24 }) * 60 * 60 * 1000,
      ); // Gap between stages
    }

    return stages;
  }

  private calculateStageDuration(stageData: any): number {
    if (stageData.duration) {
      const minHours = stageData.duration.min || 1;
      const maxHours = stageData.duration.max || 24;
      return (
        faker.number.int({ min: minHours, max: maxHours }) * 60 * 60 * 1000
      );
    }
    return faker.number.int({ min: 2, max: 48 }) * 60 * 60 * 1000; // Default 2-48 hours
  }

  private async generateStageEvents(
    stage: SimulationStage,
    targetHosts: string[],
    targetEventCount: number,
    space: string,
    context: CorrelationContext,
    useMitre: boolean = true,
  ): Promise<BaseCreateAlertsReturnType[]> {
    const events: BaseCreateAlertsReturnType[] = [];

    // Distribute events across techniques in this stage
    const techniques =
      stage.techniques.length > 0 ? stage.techniques : ['T1001']; // Fallback technique
    const eventsPerTechnique = Math.ceil(targetEventCount / techniques.length);

    for (const technique of techniques) {
      const techniqueEvents = Math.min(
        eventsPerTechnique,
        targetEventCount - events.length,
      );

      for (let i = 0; i < techniqueEvents; i++) {
        const hostname = faker.helpers.arrayElement(targetHosts);
        const username = this.generateContextualUsername(stage.name);

        const timestampConfig: TimestampConfig = {
          startDate: stage.start_time.toISOString(),
          endDate: stage.end_time.toISOString(),
          pattern: 'attack_simulation',
        };

        try {
          const alert = await generateAIAlert({
            userName: username,
            hostName: hostname,
            space,
            alertType: `${stage.tactic}_${technique}`,
            timestampConfig,
            mitreEnabled: useMitre,
            attackChain: {
              campaignId: context.campaign_id,
              stageId: stage.id,
              stageName: stage.name,
              stageIndex: techniques.indexOf(technique) + 1,
              totalStages: techniques.length,
              threatActor: context.threat_actor,
              parentEvents: context.parent_events,
            },
          });

          events.push(alert);

          // Brief delay to avoid overwhelming the API
          if (i < techniqueEvents - 1) {
            await new Promise((resolve) => setTimeout(resolve, 100));
          }
        } catch (error) {
          console.warn(
            `⚠️  Alert generation failed for ${technique} (${i + 1}/${techniqueEvents}):`,
            error instanceof Error ? error.message : 'Unknown error',
          );
          // Continue with other events instead of stopping - resilient generation
        }
      }

      // Stop if we've reached the target event count
      if (events.length >= targetEventCount) {
        break;
      }
    }

    return events;
  }

  private generateTargetHosts(count: number): string[] {
    const hosts: string[] = [];
    const prefixes = ['ws', 'srv', 'dc', 'db', 'web', 'app', 'mail'];

    for (let i = 0; i < count; i++) {
      const prefix = faker.helpers.arrayElement(prefixes);
      const id = faker.string.numeric(3);
      hosts.push(`${prefix}-${id}`);
    }

    return hosts;
  }

  private addCorrelationMetadata(
    events: BaseCreateAlertsReturnType[],
    simulation: AttackSimulation,
    stage: SimulationStage,
    stageIndex: number,
    totalPreviousEvents: number,
  ): BaseCreateAlertsReturnType[] {
    return events.map((event, eventIndex) => {
      // Add campaign correlation fields using type-safe approach
      const correlatedEvent: Record<string, any> = {
        ...event,
        'campaign.id': simulation.campaign.id,
        'campaign.name': simulation.campaign.name,
        'campaign.type': simulation.campaign.type,
        'campaign.threat_actor': simulation.campaign.threat_actor,
        'campaign.stage.id': stage.id,
        'campaign.stage.name': stage.name,
        'campaign.stage.index': stageIndex + 1,
        'campaign.stage.tactic': stage.tactic,
        'campaign.event.sequence': totalPreviousEvents + eventIndex + 1,
        'campaign.correlation.id': `${simulation.campaign.id}-${stage.id}-${eventIndex}`,
        'campaign.correlation.score': faker.number.float({
          min: 0.7,
          max: 0.95,
        }),
        'campaign.progression.phase': this.getProgressionPhase(
          stageIndex,
          simulation.stages.length,
        ),
      };

      // Add attack chain correlation if multiple techniques
      if (stage.techniques.length > 1) {
        correlatedEvent['attack_chain.id'] = `chain-${stage.id}`;
        correlatedEvent['attack_chain.sequence'] = eventIndex + 1;
        correlatedEvent['attack_chain.total_events'] = events.length;
      }

      return correlatedEvent as BaseCreateAlertsReturnType;
    });
  }

  private applyAdvancedCorrelation(
    events: BaseCreateAlertsReturnType[],
    simulation: AttackSimulation,
  ): BaseCreateAlertsReturnType[] {
    // Apply sophisticated correlation rules
    const correlationRules = this.correlationEngine.correlateEvents(
      events.map((event, index) => this.convertToGeneratedEvent(event, index)),
    );

    // Enhance events with correlation insights
    return events.map((event, index) => {
      const correlationData = correlationRules.find((rule) =>
        rule.matched_events.some((e) => e.id === `event-${index}`),
      );

      if (correlationData) {
        const enhancedEvent: Record<string, any> = {
          ...event,
          'correlation.rule_id': correlationData.rule_id,
          'correlation.rule_name': correlationData.rule_name,
          'correlation.confidence': correlationData.confidence_score,
          'correlation.matched_techniques': correlationData.matched_events.map(
            (e) => e.technique,
          ),
        };
        return enhancedEvent as BaseCreateAlertsReturnType;
      }

      return event;
    });
  }

  private calculateCampaignSuccess(
    events: BaseCreateAlertsReturnType[],
  ): number {
    // Calculate based on event distribution and correlation
    const stagesCovered = new Set(
      events.map((e) => (e as any)['campaign.stage.name']).filter(Boolean),
    ).size;

    const hasCorrelation = events.some(
      (e) => (e as any)['correlation.rule_id'],
    );
    const correlationEvents = events.filter(
      (e) => (e as any)['correlation.confidence'],
    );
    const avgCorrelationScore =
      correlationEvents.length > 0
        ? correlationEvents.reduce(
            (sum, e) => sum + ((e as any)['correlation.confidence'] as number),
            0,
          ) / correlationEvents.length
        : 0;

    return Math.round(
      (stagesCovered / 5) * 40 + // Stage coverage (40%)
        (hasCorrelation ? 30 : 0) + // Correlation presence (30%)
        (avgCorrelationScore || 0) * 30, // Correlation quality (30%)
    );
  }

  private getProgressionPhase(stageIndex: number, totalStages: number): string {
    const progress = (stageIndex + 1) / totalStages;
    if (progress <= 0.33) return 'initial';
    if (progress <= 0.66) return 'escalation';
    return 'objectives';
  }

  private convertToGeneratedEvent(
    event: BaseCreateAlertsReturnType,
    index: number,
  ): GeneratedEvent {
    const eventData = event as any;
    return {
      id: `event-${index}`,
      timestamp: new Date(eventData['@timestamp'] as string),
      event_type: 'alert',
      source_asset: (eventData['host.name'] as string) || 'unknown',
      technique: eventData['threat.technique.id']?.[0] || 'T1001',
      severity:
        (eventData['kibana.alert.severity'] as
          | 'low'
          | 'medium'
          | 'high'
          | 'critical') || 'medium',
      correlation_id:
        (eventData['campaign.correlation.id'] as string) || faker.string.uuid(),
      raw_data: event,
    };
  }

  private generateContextualUsername(stageName: string): string {
    const stageUserMap: Record<string, string[]> = {
      reconnaissance: ['analyst', 'researcher', 'intern'],
      initial_access: ['user', 'employee', 'contractor'],
      persistence: ['admin', 'sysadmin', 'service'],
      privilege_escalation: ['admin', 'root', 'system'],
      credential_access: ['admin', 'backup', 'service'],
      lateral_movement: ['admin', 'domain_admin', 'service'],
      collection: ['user', 'analyst', 'manager'],
      exfiltration: ['admin', 'backup', 'transfer'],
    };

    const candidateUsers = stageUserMap[stageName] || ['user', 'admin'];
    const baseUser = faker.helpers.arrayElement(candidateUsers);
    return `${baseUser}_${faker.number.int({ min: 1, max: 999 })}`;
  }

  private generateNetworkTopology(): NetworkTopology {
    const subnets: NetworkSubnet[] = [
      {
        id: 'dmz',
        cidr: '10.1.0.0/24',
        name: 'DMZ',
        security_zone: 'dmz',
        host_count: 50,
        services: ['web', 'dns', 'email'],
      },
      {
        id: 'internal',
        cidr: '10.2.0.0/16',
        name: 'Internal Network',
        security_zone: 'internal',
        host_count: 1000,
        services: ['file_share', 'print', 'application'],
      },
      {
        id: 'critical',
        cidr: '10.3.0.0/24',
        name: 'Critical Infrastructure',
        security_zone: 'critical',
        host_count: 20,
        services: ['domain_controller', 'database', 'backup'],
      },
    ];

    const critical_assets: CriticalAsset[] = [
      {
        id: 'dc01',
        hostname: 'dc01.corp.local',
        ip_address: '10.3.0.10',
        subnet_id: 'critical',
        asset_type: 'domain_controller',
        criticality: 'critical',
        os_family: 'windows',
        services: ['ldap', 'kerberos', 'dns'],
      },
      {
        id: 'db01',
        hostname: 'db01.corp.local',
        ip_address: '10.3.0.20',
        subnet_id: 'critical',
        asset_type: 'database',
        criticality: 'critical',
        os_family: 'linux',
        services: ['mysql', 'backup'],
      },
    ];

    return {
      subnets,
      critical_assets,
      trust_relationships: [],
      security_controls: [],
    };
  }

  private generateLateralMovementPaths(): LateralMovementPath[] {
    return [
      {
        id: 'workstation_to_dc',
        source_asset: 'workstation',
        target_asset: 'domain_controller',
        techniques: ['T1021.001', 'T1078.002'],
        prerequisites: ['valid_credentials', 'network_access'],
        success_probability: 0.7,
        detection_likelihood: 0.6,
      },
    ];
  }

  private generateStageArtifacts(
    stages: SimulationStage[],
  ): SecurityArtifact[] {
    return stages.flatMap((stage) =>
      stage.techniques.map((technique) => ({
        type: 'process' as const,
        name: `${technique}_artifact`,
        description: `Artifact generated by ${technique} in ${stage.name}`,
        detectability: 'medium' as const,
        iocs: [`${technique.toLowerCase()}_indicator`],
      })),
    );
  }

  private buildCorrelationTimeline(
    stages: SimulationStage[],
  ): CorrelationEvent[] {
    return stages.map((stage) => ({
      timestamp: stage.start_time,
      stage: stage.name,
      technique: stage.techniques[0] || 'unknown',
      assets: ['multiple'],
      correlation_score: faker.number.float({ min: 0.6, max: 1.0 }),
    }));
  }
}

/**
 * Correlation Engine for linking related security events
 */
export class CorrelationEngine {
  private correlationRules: Map<string, CorrelationRule>;

  constructor() {
    this.correlationRules = new Map();
    this.initializeCorrelationRules();
  }

  correlateEvents(events: GeneratedEvent[]): CorrelationResult[] {
    const results: CorrelationResult[] = [];

    for (const rule of this.correlationRules.values()) {
      const matches = this.findRuleMatches(events, rule);
      if (matches.length >= rule.minimumEvents) {
        results.push({
          rule_id: rule.id,
          rule_name: rule.name,
          matched_events: matches,
          confidence_score: this.calculateConfidence(matches, rule),
          timeline: this.buildEventTimeline(matches),
        });
      }
    }

    return results;
  }

  private initializeCorrelationRules(): void {
    // Example correlation rule for lateral movement
    this.correlationRules.set('lateral_movement_sequence', {
      id: 'lateral_movement_sequence',
      name: 'Lateral Movement Attack Chain',
      techniques: ['T1078', 'T1021.001', 'T1057'],
      timeWindow: 24 * 60 * 60 * 1000, // 24 hours
      minimumEvents: 3,
      confidenceWeights: { temporal: 0.4, asset: 0.3, technique: 0.3 },
    });
  }

  private findRuleMatches(
    events: GeneratedEvent[],
    rule: CorrelationRule,
  ): GeneratedEvent[] {
    return events.filter(
      (event) =>
        rule.techniques.includes(event.technique) &&
        this.isWithinTimeWindow(event, rule.timeWindow),
    );
  }

  private isWithinTimeWindow(event: GeneratedEvent, windowMs: number): boolean {
    const now = new Date().getTime();
    const eventTime = event.timestamp.getTime();
    return now - eventTime <= windowMs;
  }

  private calculateConfidence(
    events: GeneratedEvent[],
    rule: CorrelationRule,
  ): number {
    // Simplified confidence calculation
    return Math.min((events.length / rule.minimumEvents) * 0.8, 1.0);
  }

  private buildEventTimeline(events: GeneratedEvent[]): EventTimelineEntry[] {
    return events.map((event) => ({
      timestamp: event.timestamp,
      event_id: event.id,
      technique: event.technique,
      asset: event.source_asset,
    }));
  }
}

// Supporting interfaces for correlation
interface CorrelationRule {
  id: string;
  name: string;
  techniques: string[];
  timeWindow: number; // milliseconds
  minimumEvents: number;
  confidenceWeights: {
    temporal: number;
    asset: number;
    technique: number;
  };
}

interface CorrelationResult {
  rule_id: string;
  rule_name: string;
  matched_events: GeneratedEvent[];
  confidence_score: number;
  timeline: EventTimelineEntry[];
}

interface EventTimelineEntry {
  timestamp: Date;
  event_id: string;
  technique: string;
  asset: string;
}

export default AttackSimulationEngine;

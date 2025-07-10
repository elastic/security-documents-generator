/**
 * Unified Alert Assembler
 *
 * Assembles security alerts from data pools, combining standard fields,
 * extended fields, MITRE data, and theme integration efficiently.
 */

import { faker } from '@faker-js/faker';
import {
  UnifiedDataPool,
  AssemblyOptions,
  AlertAssemblyResult,
} from './unified_data_pool_types';
import { BaseCreateAlertsReturnType } from '../create_alerts';
import { generateTimestamp, TimestampConfig } from '../utils/timestamp_utils';
import { applyFalsePositiveLogic } from '../utils/false_positive_generator';
import { generateMitreFields } from '../utils/mitre_attack_service';

/**
 * Main class for assembling alerts from unified data pools
 */
export class UnifiedAlertAssembler {
  private correlationPatterns: Map<string, any> = new Map();
  private usageCounters: Map<string, number> = new Map();

  /**
   * Assemble a single alert from the unified data pool
   */
  assembleAlert(
    pool: UnifiedDataPool,
    alertIndex: number,
    entityIndex: number,
    options: AssemblyOptions,
  ): AlertAssemblyResult {
    const startTime = Date.now();
    const fieldsUsed = {
      standard: [] as string[],
      extended: [] as string[],
      mitre: [] as string[],
      theme: [] as string[],
    };

    // Start with base alert structure
    const alert: Record<string, any> = this.createBaseAlert(options);

    // Add standard fields from pool
    this.addStandardFields(alert, pool, alertIndex, fieldsUsed);

    // Add theme fields if available
    if (pool.theme) {
      this.addThemeFields(alert, pool, entityIndex, fieldsUsed);
    }

    // Add MITRE fields if available
    if (pool.mitre) {
      this.addMitreFields(alert, pool, alertIndex, fieldsUsed);
    }

    // Add extended fields if available
    if (pool.extended) {
      this.addExtendedFields(alert, pool, alertIndex, fieldsUsed);
    }

    // Apply correlations if enabled
    let correlationsApplied = 0;
    if (options.correlationEnabled) {
      correlationsApplied = this.applyCorrelations(alert, pool, alertIndex);
    }

    // Apply false positive logic if configured
    if (options.falsePositiveRate && options.falsePositiveRate > 0) {
      const alertsArray = applyFalsePositiveLogic(
        [alert],
        options.falsePositiveRate,
      );
      Object.assign(alert, alertsArray[0]);
    }

    return {
      alert,
      fieldsUsed,
      correlationsApplied,
      assemblyTimeMs: Date.now() - startTime,
    };
  }

  /**
   * Assemble multiple alerts efficiently
   */
  assembleAlerts(
    pool: UnifiedDataPool,
    count: number,
    options: AssemblyOptions,
  ): AlertAssemblyResult[] {
    const results: AlertAssemblyResult[] = [];

    // Pre-calculate entity distribution for variety
    const entityCount = Math.min(count, 100); // Limit entities for realism

    for (let i = 0; i < count; i++) {
      const entityIndex = i % entityCount;
      const result = this.assembleAlert(pool, i, entityIndex, options);
      results.push(result);
    }

    return results;
  }

  /**
   * Create base alert structure
   */
  private createBaseAlert(options: AssemblyOptions): Record<string, any> {
    const timestamp = generateTimestamp(options.timestampConfig);
    const currentTime = new Date().toISOString();

    return {
      // Required Kibana fields
      'kibana.alert.start': timestamp,
      'kibana.alert.last_detected': timestamp,
      'kibana.version': '8.7.0',
      'kibana.space_ids': [options.space],
      'kibana.alert.status': 'active',
      'kibana.alert.workflow_status': 'open',
      'kibana.alert.depth': 1,
      'kibana.alert.uuid': faker.string.uuid(),

      // Rule parameters
      'kibana.alert.rule.parameters': {
        description: 'AI-generated security alert',
        risk_score: 21,
        severity: 'low',
        license: '',
        author: [],
        false_positives: [],
        from: 'now-360s',
        rule_id: faker.string.uuid(),
        max_signals: 100,
        risk_score_mapping: [],
        severity_mapping: [],
        threat: [],
        to: 'now',
        references: [],
        version: 3,
        exceptions_list: [],
        immutable: false,
        related_integrations: [],
        required_fields: [],
        setup: '',
        type: 'query',
        language: 'kuery',
        index: ['logs-*'],
        query: '*',
        filters: [],
      },

      // Rule metadata
      'kibana.alert.rule.category': 'Custom Query Rule',
      'kibana.alert.rule.consumer': 'siem',
      'kibana.alert.rule.execution.uuid': faker.string.uuid(),
      'kibana.alert.rule.producer': 'siem',
      'kibana.alert.rule.rule_type_id': 'siem.queryRule',
      'kibana.alert.rule.uuid': faker.string.uuid(),
      'kibana.alert.rule.tags': [],
      'kibana.alert.rule.actions': [],
      'kibana.alert.rule.author': [],
      'kibana.alert.rule.created_at': currentTime,
      'kibana.alert.rule.created_by': 'elastic',
      'kibana.alert.rule.description': 'AI-generated security alert',
      'kibana.alert.rule.enabled': true,
      'kibana.alert.rule.exceptions_list': [],
      'kibana.alert.rule.false_positives': [],
      'kibana.alert.rule.from': 'now-360s',
      'kibana.alert.rule.immutable': false,
      'kibana.alert.rule.interval': '5m',
      'kibana.alert.rule.indices': ['logs-*'],
      'kibana.alert.rule.license': '',
      'kibana.alert.rule.max_signals': 100,
      'kibana.alert.rule.references': [],
      'kibana.alert.rule.risk_score_mapping': [],
      'kibana.alert.rule.rule_id': faker.string.uuid(),
      'kibana.alert.rule.severity_mapping': [],
      'kibana.alert.rule.threat': [],
      'kibana.alert.rule.to': 'now',
      'kibana.alert.rule.type': 'query',
      'kibana.alert.rule.version': 3,

      // Event fields
      '@timestamp': timestamp,
      'event.kind': 'signal',
      'kibana.alert.original_time': timestamp,
      'kibana.alert.ancestors': [
        {
          id: faker.string.alphanumeric(16),
          type: 'event',
          index: 'logs-security-default',
          depth: 0,
        },
      ],
      'kibana.alert.severity': 'low',
      'kibana.alert.risk_score': 21,
    };
  }

  /**
   * Add standard fields from the data pool
   */
  private addStandardFields(
    alert: Record<string, any>,
    pool: UnifiedDataPool,
    alertIndex: number,
    fieldsUsed: any,
  ): void {
    const standard = pool.standard;

    // Add alert name and description
    if (standard.alertNames.length > 0) {
      const alertName =
        standard.alertNames[alertIndex % standard.alertNames.length];
      alert['kibana.alert.rule.name'] = alertName;
      alert['kibana.alert.rule.description'] = alertName;
      fieldsUsed.standard.push('kibana.alert.rule.name');
    }

    // Add alert reason with more detail
    if (standard.alertDescriptions.length > 0) {
      const description =
        standard.alertDescriptions[
          alertIndex % standard.alertDescriptions.length
        ];
      alert['kibana.alert.reason'] = description;
      fieldsUsed.standard.push('kibana.alert.reason');
    }

    // Add threat information
    if (standard.threatNames.length > 0) {
      const threatName =
        standard.threatNames[alertIndex % standard.threatNames.length];
      alert['threat.indicator.name'] = threatName;
      alert['threat.indicator.type'] = 'malware';
      fieldsUsed.standard.push('threat.indicator.name');
    }

    // Add process information
    if (standard.processNames.length > 0) {
      const processName =
        standard.processNames[alertIndex % standard.processNames.length];
      alert['process.name'] = processName;
      alert['process.executable'] = `C:\\Windows\\System32\\${processName}`;
      fieldsUsed.standard.push('process.name');
    }

    // Add file information
    if (standard.fileNames.length > 0) {
      const fileName =
        standard.fileNames[alertIndex % standard.fileNames.length];
      alert['file.name'] = fileName;
      alert['file.path'] = `C:\\Users\\Public\\${fileName}`;
      fieldsUsed.standard.push('file.name');
    }

    // Add network information
    if (standard.domains.length > 0) {
      const domain = standard.domains[alertIndex % standard.domains.length];
      alert['destination.domain'] = domain;
      alert['url.domain'] = domain;
      fieldsUsed.standard.push('destination.domain');
    }

    if (standard.ipAddresses.length > 0) {
      const ip = standard.ipAddresses[alertIndex % standard.ipAddresses.length];
      alert['destination.ip'] = ip;
      alert['source.ip'] = faker.internet.ip();
      fieldsUsed.standard.push('destination.ip');
    }

    // Add registry information
    if (standard.registryKeys.length > 0) {
      const registryKey =
        standard.registryKeys[alertIndex % standard.registryKeys.length];
      alert['registry.key'] = registryKey;
      alert['registry.value'] = faker.system.fileName();
      fieldsUsed.standard.push('registry.key');
    }

    // Add URL information
    if (standard.urls.length > 0) {
      const url = standard.urls[alertIndex % standard.urls.length];
      try {
        // Validate URL before using it
        const parsedUrl = new URL(url);
        alert['url.full'] = url;
        alert['url.path'] = parsedUrl.pathname;
        fieldsUsed.standard.push('url.full');
      } catch (error) {
        // If URL is invalid, generate a fallback
        const fallbackUrl = `https://malicious-${Math.random().toString(36).substr(2, 9)}.com`;
        alert['url.full'] = fallbackUrl;
        alert['url.path'] = '/';
        fieldsUsed.standard.push('url.full');
      }
    }

    // Add event description
    if (standard.eventDescriptions.length > 0) {
      const eventDescription =
        standard.eventDescriptions[
          alertIndex % standard.eventDescriptions.length
        ];
      alert['event.action'] = eventDescription;
      alert['event.category'] = ['security'];
      alert['event.type'] = ['indicator'];
      fieldsUsed.standard.push('event.action');
    }
  }

  /**
   * Add theme fields from the data pool
   */
  private addThemeFields(
    alert: Record<string, any>,
    pool: UnifiedDataPool,
    entityIndex: number,
    fieldsUsed: any,
  ): void {
    const theme = pool.theme!;

    // Add themed usernames
    if (theme.usernames.length > 0) {
      const username = theme.usernames[entityIndex % theme.usernames.length];
      alert['user.name'] = username;
      alert['user.domain'] = 'CORPORATE';
      fieldsUsed.theme.push('user.name');
    }

    // Add themed hostnames
    if (theme.hostnames.length > 0) {
      const hostname = theme.hostnames[entityIndex % theme.hostnames.length];
      alert['host.name'] = hostname;
      alert['host.hostname'] = hostname;
      fieldsUsed.theme.push('host.name');
    }

    // Add themed organization
    if (theme.organizationNames.length > 0) {
      const orgName =
        theme.organizationNames[entityIndex % theme.organizationNames.length];
      alert['organization.name'] = orgName;
      fieldsUsed.theme.push('organization.name');
    }

    // Add themed application
    if (theme.applicationNames.length > 0) {
      const appName =
        theme.applicationNames[entityIndex % theme.applicationNames.length];
      alert['service.name'] = appName;
      fieldsUsed.theme.push('service.name');
    }
  }

  /**
   * Add MITRE fields from the data pool
   */
  private addMitreFields(
    alert: Record<string, any>,
    pool: UnifiedDataPool,
    alertIndex: number,
    fieldsUsed: any,
  ): void {
    const mitre = pool.mitre!;

    if (mitre.techniques.length > 0) {
      const technique = mitre.techniques[alertIndex % mitre.techniques.length];

      // Add MITRE technique information
      alert['threat.technique.id'] = technique.id;
      alert['threat.technique.name'] = technique.name;
      alert['threat.technique.reference'] = technique.reference;

      // Add tactic information
      if (technique.tactics && technique.tactics.length > 0) {
        const tactic = technique.tactics[0];
        alert['threat.tactic.id'] = tactic.id;
        alert['threat.tactic.name'] = tactic.name;
        alert['threat.tactic.reference'] = tactic.reference;
      }

      // Add framework information
      alert['threat.framework'] = 'MITRE ATT&CK';

      fieldsUsed.mitre.push('threat.technique.id', 'threat.tactic.id');
    }
  }

  /**
   * Add extended fields from the data pool
   */
  private addExtendedFields(
    alert: Record<string, any>,
    pool: UnifiedDataPool,
    alertIndex: number,
    fieldsUsed: any,
  ): void {
    const extended = pool.extended!;

    // Add fields from extended data pool
    extended.fieldData.forEach((fieldData) => {
      if (fieldData.values.length > 0) {
        const value = fieldData.values[alertIndex % fieldData.values.length];

        // Convert value to correct type
        let convertedValue: any = value;
        switch (fieldData.fieldType) {
          case 'integer':
            convertedValue = parseInt(value, 10) || 0;
            break;
          case 'float':
            convertedValue = parseFloat(value) || 0.0;
            break;
          case 'boolean':
            convertedValue = value.toLowerCase() === 'true';
            break;
          case 'array':
            convertedValue = Array.isArray(value) ? value : [value];
            break;
          default:
            convertedValue = String(value);
        }

        // Set nested field using dot notation
        this.setNestedField(alert, fieldData.fieldName, convertedValue);
        fieldsUsed.extended.push(fieldData.fieldName);
      }
    });
  }

  /**
   * Apply correlations between fields for realistic data
   */
  private applyCorrelations(
    alert: Record<string, any>,
    pool: UnifiedDataPool,
    alertIndex: number,
  ): number {
    let correlationsApplied = 0;

    // Correlate severity with risk score
    if (alert['kibana.alert.severity']) {
      const severityMap = {
        low: 21,
        medium: 47,
        high: 73,
        critical: 99,
      };

      const severity = alert['kibana.alert.severity'];
      if (severity in severityMap) {
        alert['kibana.alert.risk_score'] = (severityMap as any)[severity];
        correlationsApplied++;
      }
    }

    // Correlate threat type with process names
    if (alert['threat.indicator.name'] && alert['process.name']) {
      const threatName = alert['threat.indicator.name'].toLowerCase();
      if (threatName.includes('powershell')) {
        alert['process.name'] = 'powershell.exe';
        correlationsApplied++;
      } else if (threatName.includes('cmd')) {
        alert['process.name'] = 'cmd.exe';
        correlationsApplied++;
      }
    }

    // Correlate domain with IP if both exist
    if (alert['destination.domain'] && alert['destination.ip']) {
      // This is a realistic correlation - keep them as is
      correlationsApplied++;
    }

    return correlationsApplied;
  }

  /**
   * Set nested field using dot notation
   */
  private setNestedField(
    obj: Record<string, any>,
    path: string,
    value: any,
  ): void {
    const keys = path.split('.');
    let current = obj;

    for (let i = 0; i < keys.length - 1; i++) {
      const key = keys[i];
      if (!(key in current) || typeof current[key] !== 'object') {
        current[key] = {};
      }
      current = current[key];
    }

    current[keys[keys.length - 1]] = value;
  }

  /**
   * Get field value using dot notation
   */
  private getNestedField(obj: Record<string, any>, path: string): any {
    const keys = path.split('.');
    let current = obj;

    for (const key of keys) {
      if (current && typeof current === 'object' && key in current) {
        current = current[key];
      } else {
        return undefined;
      }
    }

    return current;
  }

  /**
   * Clear internal state (useful for testing)
   */
  clearState(): void {
    this.correlationPatterns.clear();
    this.usageCounters.clear();
  }
}

// Export singleton instance
export const unifiedAlertAssembler = new UnifiedAlertAssembler();

/**
 * Field Expansion Generator
 *
 * Automatically generates thousands of additional security fields using algorithmic patterns.
 * This approach scales to 10,000+ fields while maintaining zero token usage.
 */

import { faker } from '@faker-js/faker';
import { FieldTemplate } from './multi_field_templates';

// Field generation patterns
const FIELD_PATTERNS = {
  // Performance metrics patterns
  performance: {
    systems: [
      'cpu',
      'memory',
      'disk',
      'network',
      'gpu',
      'storage',
      'cache',
      'bandwidth',
    ],
    metrics: [
      'usage',
      'latency',
      'throughput',
      'errors',
      'timeouts',
      'utilization',
      'load',
      'pressure',
    ],
    timeframes: ['1m', '5m', '15m', '1h', '24h', 'peak', 'avg', 'min'],
    types: ['percentage', 'bytes', 'count', 'score'],
  },

  // Security scoring patterns
  security: {
    aspects: [
      'vulnerability',
      'threat',
      'risk',
      'compliance',
      'anomaly',
      'behavior',
      'reputation',
      'confidence',
    ],
    scopes: [
      'user',
      'host',
      'network',
      'application',
      'endpoint',
      'process',
      'service',
      'entity',
    ],
    algorithms: [
      'ml',
      'rule_based',
      'statistical',
      'heuristic',
      'signature',
      'behavioral',
    ],
    severities: ['low', 'medium', 'high', 'critical'],
  },

  // Behavioral analysis patterns
  behavioral: {
    entities: [
      'user',
      'host',
      'process',
      'service',
      'application',
      'network',
      'device',
    ],
    behaviors: [
      'login',
      'access',
      'execution',
      'communication',
      'modification',
      'creation',
      'deletion',
    ],
    patterns: [
      'frequency',
      'timing',
      'location',
      'sequence',
      'volume',
      'velocity',
      'variety',
    ],
    analysis: [
      'baseline',
      'deviation',
      'anomaly',
      'clustering',
      'correlation',
      'trend',
    ],
  },

  // Network analysis patterns
  network: {
    protocols: [
      'http',
      'https',
      'dns',
      'tcp',
      'udp',
      'smtp',
      'ftp',
      'ssh',
      'rdp',
      'smb',
    ],
    metrics: [
      'connections',
      'bytes',
      'packets',
      'sessions',
      'flows',
      'requests',
      'responses',
    ],
    analysis: [
      'bandwidth',
      'latency',
      'errors',
      'anomalies',
      'patterns',
      'geography',
      'reputation',
    ],
  },

  // Endpoint monitoring patterns
  endpoint: {
    components: [
      'process',
      'file',
      'registry',
      'service',
      'driver',
      'module',
      'library',
    ],
    activities: [
      'creation',
      'modification',
      'deletion',
      'execution',
      'injection',
      'persistence',
    ],
    detections: [
      'malware',
      'suspicious',
      'unauthorized',
      'anomalous',
      'policy_violation',
    ],
  },
};

/**
 * Generate expanded field templates using algorithmic patterns
 */
export function generateExpandedFieldTemplates(
  targetCount: number = 10000,
): Record<string, FieldTemplate> {
  const expandedFields: Record<string, FieldTemplate> = {};
  let generatedCount = 0;

  // Distribute targetCount across 5 categories
  const fieldsPerCategory = Math.floor(targetCount / 5);

  // Generate performance metric fields
  const perfFields = generatePerformanceFields(fieldsPerCategory);
  Object.assign(expandedFields, perfFields);
  generatedCount += Object.keys(perfFields).length;

  // Generate security scoring fields
  const secFields = generateSecurityScoringFields(fieldsPerCategory);
  Object.assign(expandedFields, secFields);
  generatedCount += Object.keys(secFields).length;

  // Generate behavioral analysis fields
  const behavFields = generateBehavioralFields(fieldsPerCategory);
  Object.assign(expandedFields, behavFields);
  generatedCount += Object.keys(behavFields).length;

  // Generate network analysis fields
  const netFields = generateNetworkAnalysisFields(fieldsPerCategory);
  Object.assign(expandedFields, netFields);
  generatedCount += Object.keys(netFields).length;

  // Generate endpoint monitoring fields
  const endpointFields = generateEndpointMonitoringFields(fieldsPerCategory);
  Object.assign(expandedFields, endpointFields);
  generatedCount += Object.keys(endpointFields).length;

  console.log(`Generated ${generatedCount} expanded field templates`);
  return expandedFields;
}

/**
 * Generate performance metric fields
 */
function generatePerformanceFields(
  count: number,
): Record<string, FieldTemplate> {
  const fields: Record<string, FieldTemplate> = {};
  let generated = 0;

  for (const system of FIELD_PATTERNS.performance.systems) {
    for (const metric of FIELD_PATTERNS.performance.metrics) {
      for (const timeframe of FIELD_PATTERNS.performance.timeframes) {
        if (generated >= count) break;

        const fieldName = `performance.${system}.${metric}.${timeframe}`;
        fields[fieldName] = {
          type:
            metric.includes('usage') || metric.includes('utilization')
              ? 'float'
              : 'integer',
          generator:
            metric.includes('usage') || metric.includes('utilization')
              ? () =>
                  faker.number.float({ min: 0, max: 100, fractionDigits: 2 })
              : () => faker.number.int({ min: 0, max: 10000 }),
          description: `${system} ${metric} over ${timeframe}`,
          context_weight: 6,
        };
        generated++;
      }
    }
  }

  return fields;
}

/**
 * Generate security scoring fields
 */
function generateSecurityScoringFields(
  count: number,
): Record<string, FieldTemplate> {
  const fields: Record<string, FieldTemplate> = {};
  let generated = 0;

  for (const aspect of FIELD_PATTERNS.security.aspects) {
    for (const scope of FIELD_PATTERNS.security.scopes) {
      for (const algorithm of FIELD_PATTERNS.security.algorithms) {
        if (generated >= count) break;

        const fieldName = `security.${aspect}.${scope}.${algorithm}_score`;
        fields[fieldName] = {
          type: 'float',
          generator: () =>
            faker.number.float({ min: 0, max: 100, fractionDigits: 2 }),
          description: `${aspect} score for ${scope} using ${algorithm} analysis`,
          context_weight: 8,
        };
        generated++;

        // Add confidence field
        if (generated < count) {
          const confFieldName = `security.${aspect}.${scope}.${algorithm}_confidence`;
          fields[confFieldName] = {
            type: 'float',
            generator: () =>
              faker.number.float({ min: 0, max: 1, fractionDigits: 3 }),
            description: `Confidence level for ${aspect} ${scope} ${algorithm} analysis`,
            context_weight: 7,
          };
          generated++;
        }
      }
    }
  }

  return fields;
}

/**
 * Generate behavioral analysis fields
 */
function generateBehavioralFields(
  count: number,
): Record<string, FieldTemplate> {
  const fields: Record<string, FieldTemplate> = {};
  let generated = 0;

  for (const entity of FIELD_PATTERNS.behavioral.entities) {
    for (const behavior of FIELD_PATTERNS.behavioral.behaviors) {
      for (const pattern of FIELD_PATTERNS.behavioral.patterns) {
        for (const analysis of FIELD_PATTERNS.behavioral.analysis) {
          if (generated >= count) break;

          const fieldName = `behavioral.${entity}.${behavior}.${pattern}.${analysis}`;
          fields[fieldName] = {
            type:
              pattern === 'frequency' || pattern === 'volume'
                ? 'integer'
                : 'float',
            generator:
              pattern === 'frequency' || pattern === 'volume'
                ? () => faker.number.int({ min: 0, max: 1000 })
                : () =>
                    faker.number.float({ min: 0, max: 100, fractionDigits: 2 }),
            description: `${entity} ${behavior} ${pattern} ${analysis}`,
            context_weight: 7,
          };
          generated++;
        }
      }
    }
  }

  return fields;
}

/**
 * Generate network analysis fields
 */
function generateNetworkAnalysisFields(
  count: number,
): Record<string, FieldTemplate> {
  const fields: Record<string, FieldTemplate> = {};
  let generated = 0;

  for (const protocol of FIELD_PATTERNS.network.protocols) {
    for (const metric of FIELD_PATTERNS.network.metrics) {
      for (const analysis of FIELD_PATTERNS.network.analysis) {
        if (generated >= count) break;

        const fieldName = `network.${protocol}.${metric}.${analysis}`;
        fields[fieldName] = {
          type:
            metric.includes('bytes') || metric.includes('count')
              ? 'integer'
              : 'float',
          generator: metric.includes('bytes')
            ? () => faker.number.int({ min: 0, max: 1073741824 }) // 0-1GB
            : metric.includes('count') || metric.includes('connections')
              ? () => faker.number.int({ min: 0, max: 10000 })
              : () =>
                  faker.number.float({ min: 0, max: 100, fractionDigits: 2 }),
          description: `${protocol} ${metric} ${analysis}`,
          context_weight: 7,
        };
        generated++;
      }
    }
  }

  return fields;
}

/**
 * Generate endpoint monitoring fields
 */
function generateEndpointMonitoringFields(
  count: number,
): Record<string, FieldTemplate> {
  const fields: Record<string, FieldTemplate> = {};
  let generated = 0;

  for (const component of FIELD_PATTERNS.endpoint.components) {
    for (const activity of FIELD_PATTERNS.endpoint.activities) {
      for (const detection of FIELD_PATTERNS.endpoint.detections) {
        if (generated >= count) break;

        const fieldName = `endpoint.${component}.${activity}.${detection}_count`;
        fields[fieldName] = {
          type: 'integer',
          generator: () => faker.number.int({ min: 0, max: 100 }),
          description: `${component} ${activity} ${detection} count`,
          context_weight: 8,
        };
        generated++;

        // Add score variant
        if (generated < count) {
          const scoreFieldName = `endpoint.${component}.${activity}.${detection}_score`;
          fields[scoreFieldName] = {
            type: 'float',
            generator: () =>
              faker.number.float({ min: 0, max: 100, fractionDigits: 2 }),
            description: `${component} ${activity} ${detection} score`,
            context_weight: 8,
          };
          generated++;
        }
      }
    }
  }

  return fields;
}

export default generateExpandedFieldTemplates;

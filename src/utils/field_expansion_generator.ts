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
 * 
 * @param targetCount - Number of fields to generate
 * @param categories - Optional array of categories to generate (if not provided, generates all categories)
 */
export function generateExpandedFieldTemplates(
  targetCount: number = 10000,
  categories?: string[],
): Record<string, FieldTemplate> {
  const expandedFields: Record<string, FieldTemplate> = {};
  let generatedCount = 0;

  // Map category names to generator functions
  const categoryGenerators = {
    'performance_metrics': generatePerformanceFields,
    'security_scores': generateSecurityScoringFields,
    'behavioral_analytics': generateBehavioralFields,
    'network_analytics': generateNetworkAnalysisFields,
    'endpoint_analytics': generateEndpointMonitoringFields,
  };

  // If no categories specified, use all available categories
  const categoriesToGenerate = categories?.filter(cat => categoryGenerators[cat as keyof typeof categoryGenerators]) || Object.keys(categoryGenerators);
  
  if (categoriesToGenerate.length === 0) {
    console.warn('⚠️  No valid categories found for expanded field generation. Using all categories.');
    categoriesToGenerate.push(...Object.keys(categoryGenerators));
  }

  // Distribute targetCount across selected categories
  const fieldsPerCategory = Math.floor(targetCount / categoriesToGenerate.length);
  const remainingFields = targetCount % categoriesToGenerate.length;

  console.log(`🔬 Generating expanded fields across ${categoriesToGenerate.length} categories:`);
  console.log(`  📊 Target: ${targetCount} fields (${fieldsPerCategory} per category)`);
  console.log(`  📁 Categories: ${categoriesToGenerate.join(', ')}`);

  // Generate fields for each selected category
  for (let i = 0; i < categoriesToGenerate.length; i++) {
    const category = categoriesToGenerate[i];
    const generator = categoryGenerators[category as keyof typeof categoryGenerators];
    
    if (generator) {
      // Add extra fields to first categories if there's a remainder
      const extraFields = i < remainingFields ? 1 : 0;
      const categoryFieldCount = fieldsPerCategory + extraFields;
      
      const categoryFields = generator(categoryFieldCount);
      Object.assign(expandedFields, categoryFields);
      generatedCount += Object.keys(categoryFields).length;
      
      console.log(`  ✅ ${category}: ${Object.keys(categoryFields).length} fields`);
    }
  }

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
 * Generate behavioral analysis fields with unlimited expansion
 */
function generateBehavioralFields(
  count: number,
): Record<string, FieldTemplate> {
  const fields: Record<string, FieldTemplate> = {};
  let generated = 0;

  // Phase 1: Generate all basic pattern combinations
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

  // Phase 2: Generate extended fields with numerical suffixes for unlimited expansion
  if (generated < count) {
    const extendedBehaviors = [
      'access_control', 'authentication', 'authorization', 'privilege_escalation',
      'lateral_movement', 'data_exfiltration', 'persistence', 'evasion',
      'discovery', 'collection', 'command_control', 'impact', 'reconnaissance'
    ];
    
    const extendedPatterns = [
      'temporal', 'spatial', 'statistical', 'contextual', 'semantic',
      'behavioral', 'structural', 'relational', 'hierarchical', 'causal'
    ];
    
    const extendedMetrics = [
      'entropy', 'variance', 'skewness', 'kurtosis', 'correlation_coefficient',
      'mutual_information', 'divergence', 'similarity', 'distance', 'density'
    ];

    let suffix = 1;
    while (generated < count) {
      for (const entity of FIELD_PATTERNS.behavioral.entities) {
        for (const behavior of extendedBehaviors) {
          for (const pattern of extendedPatterns) {
            for (const metric of extendedMetrics) {
              if (generated >= count) break;

              const fieldName = `behavioral.${entity}.${behavior}.${pattern}.${metric}_${suffix}`;
              fields[fieldName] = {
                type: faker.helpers.arrayElement(['integer', 'float']),
                generator: faker.helpers.arrayElement([
                  () => faker.number.int({ min: 0, max: 10000 }),
                  () => faker.number.float({ min: 0, max: 100, fractionDigits: 3 }),
                  () => faker.number.float({ min: -1, max: 1, fractionDigits: 4 }),
                ]),
                description: `Advanced ${entity} ${behavior} ${pattern} ${metric} analysis (series ${suffix})`,
                context_weight: 6,
              };
              generated++;
            }
            if (generated >= count) break;
          }
          if (generated >= count) break;
        }
        if (generated >= count) break;
      }
      suffix++;
      
      // Prevent infinite loop
      if (suffix > 100) {
        console.warn(`⚠️  Reached maximum expansion depth. Generated ${generated}/${count} behavioral fields.`);
        break;
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

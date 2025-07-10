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
  // Performance metrics patterns (expanded for higher field counts)
  performance: {
    systems: [
      'cpu', 'memory', 'disk', 'network', 'gpu', 'storage', 'cache', 'bandwidth',
      'virtualization', 'container', 'database', 'application', 'os', 'firmware',
      'kernel', 'scheduler', 'filesystem', 'swap', 'buffer', 'interrupt',
      'dma', 'pcie', 'usb', 'thermal', 'power', 'clock', 'timer', 'watchdog'
    ],
    metrics: [
      'usage', 'latency', 'throughput', 'errors', 'timeouts', 'utilization', 'load', 'pressure',
      'bandwidth', 'iops', 'queue_depth', 'wait_time', 'response_time', 'availability',
      'saturation', 'contention', 'fragmentation', 'overhead', 'efficiency', 'jitter',
      'packets', 'connections', 'sessions', 'transactions', 'operations', 'requests'
    ],
    timeframes: [
      '1s', '5s', '10s', '30s', '1m', '5m', '15m', '30m', '1h', '2h', '4h', '8h', '12h', '24h',
      'peak', 'avg', 'min', 'max', 'p50', 'p90', 'p95', 'p99', 'rolling', 'window'
    ],
    types: ['percentage', 'bytes', 'count', 'score', 'ratio', 'rate', 'delta', 'absolute'],
  },

  // Security scoring patterns (expanded)
  security: {
    aspects: [
      'vulnerability', 'threat', 'risk', 'compliance', 'anomaly', 'behavior', 'reputation', 'confidence',
      'malware', 'phishing', 'ransomware', 'trojan', 'backdoor', 'rootkit', 'exploit', 'injection',
      'privilege_escalation', 'lateral_movement', 'persistence', 'command_control', 'exfiltration',
      'impact', 'reconnaissance', 'weaponization', 'delivery', 'installation', 'actions'
    ],
    scopes: [
      'user', 'host', 'network', 'application', 'endpoint', 'process', 'service', 'entity',
      'file', 'registry', 'memory', 'connection', 'session', 'account', 'group', 'domain',
      'certificate', 'policy', 'rule', 'signature', 'hash', 'url', 'email', 'device',
      'container', 'vm', 'cloud', 'database', 'api', 'webhook', 'token', 'credential'
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

  // Calculate realistic limits
  const maxCombinatorial = calculateMaxCombinatoralFields();
  
  // Warn about document size if too many fields requested
  if (targetCount > 5000) {
    console.warn(`⚠️  WARNING: ${targetCount} fields may exceed Elasticsearch document size limits (~${Math.round(targetCount * 0.5 / 1000)}MB)`);
    console.warn('   Consider using --field-count 1000-5000 for optimal performance');
  }

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

  // First, generate combinatorial fields
  const fieldsPerCategory = Math.floor(Math.min(targetCount, maxCombinatorial) / categoriesToGenerate.length);
  const remainingFields = Math.min(targetCount, maxCombinatorial) % categoriesToGenerate.length;

  console.log(`🔬 Generating expanded fields across ${categoriesToGenerate.length} categories:`);
  console.log(`  📊 Target: ${targetCount} fields (max combinatorial: ${maxCombinatorial})`);
  console.log(`  📁 Categories: ${categoriesToGenerate.join(', ')}`);

  // Generate combinatorial fields for each selected category
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

  // If we need more fields than combinatorial limits allow, generate dynamic fields
  if (targetCount > generatedCount) {
    const remainingToGenerate = targetCount - generatedCount;
    console.log(`  🔄 Generating ${remainingToGenerate} additional dynamic fields...`);
    
    const dynamicFields = generateDynamicFields(remainingToGenerate, categoriesToGenerate);
    Object.assign(expandedFields, dynamicFields);
    generatedCount += Object.keys(dynamicFields).length;
    
    console.log(`  ✅ Dynamic fields: ${Object.keys(dynamicFields).length} fields`);
  }

  console.log(`📊 Generated ${generatedCount}/${targetCount} expanded field templates`);
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
              const fieldType = faker.helpers.arrayElement(['integer', 'float']);
              const generator = fieldType === 'integer' 
                ? () => faker.number.int({ min: 0, max: 10000 })
                : faker.helpers.arrayElement([
                    () => faker.number.float({ min: 0, max: 100, fractionDigits: 3 }),
                    () => faker.number.float({ min: -1, max: 1, fractionDigits: 4 }),
                  ]);
              fields[fieldName] = {
                type: fieldType,
                generator: generator,
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

/**
 * Calculate maximum combinatorial fields possible
 */
function calculateMaxCombinatoralFields(): number {
  let total = 0;
  
  try {
    const performance = FIELD_PATTERNS.performance.systems.length * 
                       FIELD_PATTERNS.performance.metrics.length * 
                       FIELD_PATTERNS.performance.timeframes.length;
    total += performance;
    
    const security = FIELD_PATTERNS.security.aspects.length * 
                     FIELD_PATTERNS.security.scopes.length * 
                     FIELD_PATTERNS.security.algorithms.length * 2; // score + confidence
    total += security;
    
    const behavioral = FIELD_PATTERNS.behavioral.entities.length * 
                       FIELD_PATTERNS.behavioral.behaviors.length * 
                       FIELD_PATTERNS.behavioral.patterns.length * 
                       FIELD_PATTERNS.behavioral.analysis.length;
    total += behavioral;
    
    const network = FIELD_PATTERNS.network.protocols.length * 
                    FIELD_PATTERNS.network.metrics.length * 
                    FIELD_PATTERNS.network.analysis.length;
    total += network;
    
    const endpoint = FIELD_PATTERNS.endpoint.components.length * 
                     FIELD_PATTERNS.endpoint.activities.length * 
                     FIELD_PATTERNS.endpoint.detections.length;
    total += endpoint;
    
    console.log(`🔢 Calculated max combinatorial fields: ${total}`);
    console.log(`  Performance: ${performance}, Security: ${security}, Behavioral: ${behavioral}`);
    console.log(`  Network: ${network}, Endpoint: ${endpoint}`);
    
  } catch (error) {
    console.warn('Error calculating max fields, using default:', (error as Error).message || 'Unknown error');
    return 20000; // Safe default
  }
  
  return total;
}

/**
 * Generate unlimited dynamic fields using algorithmic patterns
 */
function generateDynamicFields(
  count: number,
  categories: string[]
): Record<string, FieldTemplate> {
  const fields: Record<string, FieldTemplate> = {};
  
  // Base field patterns for dynamic generation
  const dynamicPatterns = {
    metrics: ['count', 'rate', 'ratio', 'percentage', 'score', 'index', 'factor', 'coefficient'],
    entities: ['user', 'host', 'process', 'file', 'network', 'service', 'application', 'session'],
    analysis: ['ml', 'statistical', 'heuristic', 'rule', 'pattern', 'anomaly', 'baseline', 'trend'],
    timeframes: ['instant', 'short', 'medium', 'long', 'historical', 'realtime', 'batch', 'streaming'],
    contexts: ['security', 'performance', 'compliance', 'operations', 'business', 'technical', 'behavioral'],
    operations: ['create', 'read', 'update', 'delete', 'execute', 'monitor', 'analyze', 'report']
  };
  
  for (let i = 0; i < count; i++) {
    // Generate unique field names using combinations and counters
    const category = faker.helpers.arrayElement(categories);
    const metric = faker.helpers.arrayElement(dynamicPatterns.metrics);
    const entity = faker.helpers.arrayElement(dynamicPatterns.entities);
    const analysis = faker.helpers.arrayElement(dynamicPatterns.analysis);
    const context = faker.helpers.arrayElement(dynamicPatterns.contexts);
    const operation = faker.helpers.arrayElement(dynamicPatterns.operations);
    
    // Create varied field name patterns
    const patterns = [
      `${context}.${entity}.${metric}_${analysis}_${i}`,
      `${category}.${operation}.${entity}_${metric}_${i}`,
      `dynamic.${context}_${entity}_${analysis}_${metric}_${i}`,
      `extended.${entity}_${operation}_${context}_${i}`,
      `computed.${analysis}_${metric}_${entity}_${i}`,
      `enriched.${context}_${operation}_${analysis}_${i}`
    ];
    
    const fieldName = faker.helpers.arrayElement(patterns);
    
    // Ensure uniqueness
    if (!fields[fieldName]) {
      const fieldType = faker.helpers.arrayElement(['integer', 'float', 'string', 'boolean']);
      fields[fieldName] = {
        type: fieldType,
        generator: () => {
          switch (fieldType) {
            case 'integer':
              return faker.number.int({ min: 0, max: 1000000 });
            case 'float':
              return faker.number.float({ min: 0, max: 100, fractionDigits: 3 });
            case 'boolean':
              return faker.datatype.boolean();
            default:
              return faker.helpers.arrayElement([
                faker.lorem.word(),
                faker.system.fileName(),
                faker.internet.domainName(),
                faker.company.name()
              ]);
          }
        },
        description: `Dynamic ${context} ${metric} for ${entity} using ${analysis} analysis`,
        context_weight: faker.number.int({ min: 1, max: 10 }),
      };
    }
  }
  
  return fields;
}

export default generateExpandedFieldTemplates;

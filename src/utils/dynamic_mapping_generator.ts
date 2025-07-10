/**
 * Dynamic Elasticsearch Mapping Generator
 *
 * Generates proper Elasticsearch mappings for dynamically created fields
 * to ensure they appear correctly in Kibana instead of as unmapped fields.
 */

export interface ElasticsearchFieldMapping {
  type: string;
  properties?: Record<string, ElasticsearchFieldMapping>;
  fields?: Record<string, ElasticsearchFieldMapping>;
  index?: boolean;
  doc_values?: boolean;
  format?: string;
}

export interface ElasticsearchMapping {
  mappings: {
    properties: Record<string, ElasticsearchFieldMapping>;
  };
}

/**
 * Convert field type to Elasticsearch mapping type
 */
function getElasticsearchType(fieldType: string): ElasticsearchFieldMapping {
  switch (fieldType) {
    case 'integer':
      return {
        type: 'long',
        index: true,
        doc_values: true,
      };
    case 'float':
      return {
        type: 'double',
        index: true,
        doc_values: true,
      };
    case 'boolean':
      return {
        type: 'boolean',
        index: true,
        doc_values: true,
      };
    case 'string':
      return {
        type: 'keyword',
        index: true,
        doc_values: true,
        fields: {
          text: {
            type: 'text',
            index: true,
          },
        },
      };
    case 'ip':
      return {
        type: 'ip',
        index: true,
        doc_values: true,
      };
    case 'timestamp':
      return {
        type: 'date',
        index: true,
        doc_values: true,
        format: 'strict_date_optional_time||epoch_millis',
      };
    case 'array':
      return {
        type: 'keyword',
        index: true,
        doc_values: true,
      };
    default:
      return {
        type: 'keyword',
        index: true,
        doc_values: true,
      };
  }
}

/**
 * Generate nested mapping structure for dot-notation field names
 */
function createNestedMapping(
  fieldPath: string,
  fieldType: string,
): Record<string, any> {
  const parts = fieldPath.split('.');
  const mapping: Record<string, any> = {};

  let current = mapping;
  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    current[part] = {
      type: 'object',
      properties: {},
    };
    current = current[part].properties;
  }

  // Set the final field mapping
  const finalPart = parts[parts.length - 1];
  current[finalPart] = getElasticsearchType(fieldType);

  return mapping;
}

/**
 * Merge nested mapping structures
 */
function mergeNestedMappings(
  target: Record<string, any>,
  source: Record<string, any>,
): void {
  for (const key in source) {
    if (target[key]) {
      if (target[key].type === 'object' && source[key].type === 'object') {
        // Merge nested object properties
        if (!target[key].properties) target[key].properties = {};
        if (!source[key].properties) source[key].properties = {};
        mergeNestedMappings(target[key].properties, source[key].properties);
      } else if (target[key].type !== source[key].type) {
        // Type conflict - log warning and keep target
        console.warn(
          `⚠️  Mapping conflict for field '${key}': ${target[key].type} vs ${source[key].type}. Keeping ${target[key].type}.`,
        );
      }
    } else {
      target[key] = source[key];
    }
  }
}

/**
 * Generate Elasticsearch mapping from field templates
 */
export function generateElasticsearchMapping(
  fields: Record<string, { type: string; description?: string }>,
  indexName: string,
): ElasticsearchMapping {
  console.log(
    `🗺️  Generating Elasticsearch mapping for ${Object.keys(fields).length} fields...`,
  );

  const properties: Record<string, any> = {};

  // Add standard ECS fields that should always be present
  const standardFields = {
    '@timestamp': 'timestamp',
    'event.action': 'string',
    'event.category': 'array',
    'event.type': 'array',
    'event.kind': 'string',
    'event.severity': 'string',
    'host.name': 'string',
    'user.name': 'string',
    'log.level': 'string',
    message: 'string',
  };

  // Add standard fields first
  for (const [fieldName, fieldType] of Object.entries(standardFields)) {
    const nestedMapping = createNestedMapping(fieldName, fieldType);
    mergeNestedMappings(properties, nestedMapping);
  }

  // Add dynamic fields
  for (const [fieldName, fieldInfo] of Object.entries(fields)) {
    const nestedMapping = createNestedMapping(fieldName, fieldInfo.type);
    mergeNestedMappings(properties, nestedMapping);
  }

  console.log(
    `✅ Generated mapping with ${Object.keys(properties).length} top-level properties`,
  );

  return {
    mappings: {
      properties,
    },
  };
}

/**
 * Generate index template for dynamic fields
 */
export function generateIndexTemplate(
  templateName: string,
  indexPattern: string,
  fields: Record<string, { type: string; description?: string }>,
  isDataStream = false,
): any {
  const mapping = generateElasticsearchMapping(fields, indexPattern);

  const template: any = {
    index_patterns: [indexPattern],
    template: {
      settings: {
        number_of_shards: 1,
        number_of_replicas: 1,
        'index.mapping.total_fields.limit': 200000, // Support massive field counts
        'index.mapping.depth.limit': 100, // Support deeply nested structures
        'index.mapping.nested_fields.limit': 10000, // Support many nested fields
        'index.mapping.nested_objects.limit': 50000, // Support nested objects
        'index.max_docvalue_fields_search': 1000, // Support large doc_value searches
      },
      mappings: mapping.mappings,
    },
    priority: 500, // Higher priority to override default data stream templates
    version: 1,
    _meta: {
      description: `Dynamic mapping template for ${templateName}`,
      created_by: 'security-documents-generator',
      field_count: Object.keys(fields).length,
      categories: Array.from(
        new Set(Object.keys(fields).map((f) => f.split('.')[0])),
      ),
    },
  };

  // Add data stream configuration if needed
  if (isDataStream) {
    template.data_stream = {
      hidden: false,
      allow_custom_routing: false,
    };
  }

  return template;
}

/**
 * Delete conflicting indices to avoid mapping conflicts
 */
export async function deleteConflictingIndices(
  esClient: any,
  indexPattern: string,
): Promise<void> {
  try {
    console.log(`🗑️  Checking for conflicting indices: ${indexPattern}`);

    const { body: indices } = await esClient.cat.indices({
      index: indexPattern,
      format: 'json',
      h: 'index',
    });

    if (indices && indices.length > 0) {
      for (const index of indices) {
        console.log(`🗑️  Deleting conflicting index: ${index.index}`);
        await esClient.indices.delete({ index: index.index });
      }
      console.log(`✅ Cleaned up ${indices.length} conflicting indices`);
    }
  } catch (error) {
    // Index doesn't exist or other error - this is fine for new generation
    console.log(`ℹ️  No conflicting indices found for ${indexPattern}`);
  }
}

/**
 * Apply mapping to Elasticsearch index
 */
export async function applyMappingToIndex(
  esClient: any,
  indexName: string,
  mapping: ElasticsearchMapping,
  forceRecreate: boolean = false,
): Promise<void> {
  try {
    console.log(`🔧 Applying mapping to index: ${indexName}`);

    // Check if index exists
    const indexExists = await esClient.indices.exists({ index: indexName });

    if (indexExists && forceRecreate) {
      console.log(`🗑️  Deleting existing index for recreation: ${indexName}`);
      await esClient.indices.delete({ index: indexName });
    }

    if (!indexExists || forceRecreate) {
      // Create index with mapping
      await esClient.indices.create({
        index: indexName,
        body: {
          settings: {
            number_of_shards: 1,
            number_of_replicas: 1,
            'index.mapping.total_fields.limit': 200000,
            'index.mapping.depth.limit': 100,
            'index.mapping.nested_fields.limit': 10000,
            'index.mapping.nested_objects.limit': 50000,
            'index.max_docvalue_fields_search': 1000,
          },
          ...mapping,
        },
      });
      console.log(`✅ Created index ${indexName} with mapping`);
    } else {
      // Update mapping for existing index
      await esClient.indices.putMapping({
        index: indexName,
        body: mapping.mappings,
      });
      console.log(`✅ Updated mapping for existing index ${indexName}`);
    }
  } catch (error) {
    console.error(`❌ Failed to apply mapping to ${indexName}:`, error);
    throw error;
  }
}

/**
 * Create or update index template
 */
export async function applyIndexTemplate(
  esClient: any,
  templateName: string,
  template: any,
): Promise<void> {
  try {
    console.log(`📋 Applying index template: ${templateName}`);

    await esClient.indices.putIndexTemplate({
      name: templateName,
      body: template,
    });

    console.log(
      `✅ Applied index template ${templateName} for pattern ${template.index_patterns.join(', ')}`,
    );
  } catch (error) {
    console.error(`❌ Failed to apply index template ${templateName}:`, error);
    throw error;
  }
}

/**
 * Generate mapping for common security field categories
 */
export function generateSecurityFieldMapping(): Record<
  string,
  { type: string; description: string }
> {
  return {
    // Behavioral Analytics
    'user_behavior.anomaly_score': {
      type: 'float',
      description: 'User behavior anomaly score',
    },
    'user_behavior.risk_score': {
      type: 'float',
      description: 'User risk assessment score',
    },
    'user_behavior.login_frequency_score': {
      type: 'float',
      description: 'Login frequency anomaly score',
    },
    'user_behavior.baseline_deviation': {
      type: 'float',
      description: 'Deviation from baseline behavior',
    },
    'user_behavior.failed_login_count_24h': {
      type: 'integer',
      description: 'Failed login attempts in 24 hours',
    },
    'user_behavior.session_duration_avg': {
      type: 'integer',
      description: 'Average session duration in seconds',
    },
    'user_behavior.off_hours_activity_score': {
      type: 'float',
      description: 'Off-hours activity anomaly score',
    },
    'user_behavior.unique_hosts_accessed_24h': {
      type: 'integer',
      description: 'Unique hosts accessed in 24 hours',
    },

    'host_behavior.anomaly_score': {
      type: 'float',
      description: 'Host behavior anomaly score',
    },
    'host_behavior.cpu_usage_baseline': {
      type: 'float',
      description: 'Baseline CPU usage percentage',
    },
    'host_behavior.memory_usage_baseline': {
      type: 'float',
      description: 'Baseline memory usage percentage',
    },
    'host_behavior.network_traffic_baseline': {
      type: 'integer',
      description: 'Baseline network traffic in bytes',
    },
    'host_behavior.process_creation_rate': {
      type: 'float',
      description: 'Process creation rate per minute',
    },

    'entity_behavior.communication_pattern_score': {
      type: 'float',
      description: 'Communication pattern anomaly score',
    },
    'entity_behavior.access_pattern_score': {
      type: 'float',
      description: 'Access pattern anomaly score',
    },

    // Threat Intelligence
    'threat.intelligence.confidence': {
      type: 'float',
      description: 'Threat intelligence confidence score',
    },
    'threat.intelligence.severity': {
      type: 'string',
      description: 'Threat severity level',
    },
    'threat.enrichment.reputation_score': {
      type: 'float',
      description: 'IP/domain reputation score',
    },
    'threat.enrichment.malware_family': {
      type: 'string',
      description: 'Identified malware family',
    },
    'threat.enrichment.ioc_matches': {
      type: 'integer',
      description: 'Number of IoC matches',
    },
    'threat.enrichment.first_seen': {
      type: 'timestamp',
      description: 'First time threat was observed',
    },
    'threat.enrichment.last_seen': {
      type: 'timestamp',
      description: 'Last time threat was observed',
    },

    // Security Scores
    'security.score.overall_risk': {
      type: 'float',
      description: 'Overall security risk score',
    },
    'security.score.vulnerability_score': {
      type: 'float',
      description: 'Vulnerability assessment score',
    },
    'security.score.compliance_score': {
      type: 'float',
      description: 'Compliance assessment score',
    },
    'security.score.threat_score': {
      type: 'float',
      description: 'Threat assessment score',
    },

    // Performance Metrics
    'performance.cpu.usage.current': {
      type: 'float',
      description: 'Current CPU usage percentage',
    },
    'performance.memory.usage.current': {
      type: 'float',
      description: 'Current memory usage percentage',
    },
    'performance.disk.usage.current': {
      type: 'float',
      description: 'Current disk usage percentage',
    },
    'performance.network.bandwidth.utilization': {
      type: 'float',
      description: 'Network bandwidth utilization',
    },
  };
}

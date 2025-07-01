/**
 * Standalone Field Generation Command
 * 
 * Simple, focused command for generating security fields on demand.
 * Supports unlimited field counts with proper category filtering.
 */

import { faker } from '@faker-js/faker';
import { getEsClient } from './utils/indices';
import { MultiFieldGenerator } from '../utils/multi_field_generator';
import { 
  generateElasticsearchMapping, 
  generateIndexTemplate,
  applyMappingToIndex,
  applyIndexTemplate 
} from '../utils/dynamic_mapping_generator';

export interface FieldGenerationConfig {
  fieldCount: number;
  categories?: string[];
  outputFormat?: 'json' | 'elasticsearch';
  indexName?: string;
  sampleDocument?: Record<string, any>;
  includeMetadata?: boolean;
  createMapping?: boolean; // Whether to create Elasticsearch mapping
  updateTemplate?: boolean; // Whether to update index template
}

export interface FieldGenerationResult {
  fields: Record<string, any>;
  metadata: {
    totalFieldsGenerated: number;
    categoriesUsed: string[];
    generationTimeMs: number;
    requestedCount: number;
    actualCount: number;
  };
}

/**
 * Generate fields on demand with specified configuration
 */
export async function generateFields(config: FieldGenerationConfig): Promise<FieldGenerationResult> {
  const startTime = Date.now();
  
  // Initialize field generator with clean configuration
  const generator = new MultiFieldGenerator({
    fieldCount: config.fieldCount,
    categories: config.categories,
    performanceMode: false, // Always prioritize variety over speed
    contextWeightEnabled: true,
    correlationEnabled: true,
    useExpandedFields: config.fieldCount > 1000,
    expandedFieldCount: Math.max(config.fieldCount * 1.5, 10000),
  });

  // Generate base document context if not provided
  const baseDocument = config.sampleDocument || {
    '@timestamp': new Date().toISOString(),
    'event.category': ['security'],
    'event.type': ['info'],
    'event.action': 'field_generation',
  };

  // Generate fields with security context
  const result = generator.generateFields(baseDocument, {
    logType: 'security',
    isAttack: false,
    severity: 'medium',
  });

  const generationTime = Date.now() - startTime;

  // Prepare result
  const fieldResult: FieldGenerationResult = {
    fields: result.fields,
    metadata: {
      totalFieldsGenerated: Object.keys(result.fields).length,
      categoriesUsed: config.categories || [],
      generationTimeMs: generationTime,
      requestedCount: config.fieldCount,
      actualCount: Object.keys(result.fields).length,
    },
  };

  // Handle output format
  switch (config.outputFormat) {
    case 'elasticsearch':
      if (config.indexName) {
        await indexToElasticsearch(fieldResult, config.indexName, config);
      }
      break;
    case 'json':
    default:
      // Return JSON result (default)
      break;
  }

  return fieldResult;
}

/**
 * Index generated fields to Elasticsearch with proper mapping
 */
async function indexToElasticsearch(
  result: FieldGenerationResult, 
  indexName: string,
  config: FieldGenerationConfig
): Promise<void> {
  const client = getEsClient();
  
  // Create field type information for mapping generation
  const fieldTypes: Record<string, { type: string; description: string }> = {};
  
  // Get field type information from the MultiFieldGenerator
  const generator = new MultiFieldGenerator({
    fieldCount: config.fieldCount,
    categories: config.categories,
    useExpandedFields: config.fieldCount > 1000,
  });
  
  // We need to get the field templates to know the types
  // For now, infer types from the generated values
  for (const [fieldName, value] of Object.entries(result.fields)) {
    let type = 'string';
    if (typeof value === 'number') {
      type = Number.isInteger(value) ? 'integer' : 'float';
    } else if (typeof value === 'boolean') {
      type = 'boolean';
    } else if (typeof value === 'object' && Array.isArray(value)) {
      type = 'array';
    }
    
    fieldTypes[fieldName] = {
      type,
      description: `Generated ${fieldName.split('.')[0]} field`,
    };
  }
  
  // Create mapping if requested
  if (config.createMapping) {
    try {
      const mapping = generateElasticsearchMapping(fieldTypes, indexName);
      await applyMappingToIndex(client, indexName, mapping);
    } catch (error) {
      console.warn(`⚠️  Could not create mapping for ${indexName}:`, error.message);
    }
  }
  
  // Create index template if requested
  if (config.updateTemplate) {
    try {
      const templateName = `security-fields-${config.categories?.join('-') || 'all'}`;
      const indexPattern = `${indexName}*`;
      const template = generateIndexTemplate(templateName, indexPattern, fieldTypes);
      await applyIndexTemplate(client, templateName, template);
    } catch (error) {
      console.warn(`⚠️  Could not create index template:`, error.message);
    }
  }
  
  const document = {
    '@timestamp': new Date().toISOString(),
    'event.category': ['field_generation'],
    'event.type': ['info'],
    'event.action': 'field_generation_sample',
    ...result.fields,
    '_metadata': result.metadata,
  };

  try {
    await client.index({
      index: indexName,
      body: document,
      refresh: true,
    });
    console.log(`✅ Indexed sample document with ${result.metadata.totalFieldsGenerated} fields to ${indexName}`);
  } catch (error) {
    console.error('❌ Failed to index to Elasticsearch:', error);
    throw error;
  }
}

/**
 * CLI-friendly field generation function
 */
export async function generateFieldsCLI(
  fieldCount: number,
  categories?: string[],
  options: {
    output?: 'console' | 'file' | 'elasticsearch';
    filename?: string;
    indexName?: string;
    includeMetadata?: boolean;
    sampleDocument?: Record<string, any>;
    createMapping?: boolean;
    updateTemplate?: boolean;
  } = {}
): Promise<void> {
  console.log(`🔬 Generating ${fieldCount} fields...`);
  if (categories) {
    console.log(`📁 Categories: ${categories.join(', ')}`);
  }

  const config: FieldGenerationConfig = {
    fieldCount,
    categories,
    outputFormat: options.output === 'elasticsearch' ? 'elasticsearch' : 'json',
    indexName: options.indexName || 'generated-fields-sample',
    sampleDocument: options.sampleDocument,
    includeMetadata: options.includeMetadata ?? true,
    createMapping: options.createMapping ?? true, // Default to creating mappings
    updateTemplate: options.updateTemplate ?? true, // Default to updating templates
  };

  try {
    const result = await generateFields(config);
    
    // Display results
    console.log(`✅ Generated ${result.metadata.actualCount}/${result.metadata.requestedCount} fields in ${result.metadata.generationTimeMs}ms`);
    
    if (result.metadata.actualCount < result.metadata.requestedCount) {
      console.log(`⚠️  Generated fewer fields than requested due to category limitations`);
    }

    // Handle output
    switch (options.output) {
      case 'elasticsearch':
        // Already handled in generateFields
        break;
      case 'file':
        if (options.filename) {
          const fs = await import('fs/promises');
          await fs.writeFile(options.filename, JSON.stringify(result, null, 2));
          console.log(`📄 Saved to ${options.filename}`);
        }
        break;
      case 'console':
      default:
        // Show sample fields
        const sampleFields = Object.entries(result.fields).slice(0, 10);
        console.log('\n📊 Sample Fields:');
        sampleFields.forEach(([key, value]) => {
          console.log(`  ${key}: ${JSON.stringify(value)}`);
        });
        if (Object.keys(result.fields).length > 10) {
          console.log(`  ... and ${Object.keys(result.fields).length - 10} more fields`);
        }
        break;
    }

    if (options.includeMetadata) {
      console.log('\n📈 Generation Metadata:');
      console.log(`  Requested: ${result.metadata.requestedCount} fields`);
      console.log(`  Generated: ${result.metadata.actualCount} fields`);
      console.log(`  Generation time: ${result.metadata.generationTimeMs}ms`);
      console.log(`  Categories: ${result.metadata.categoriesUsed.join(', ') || 'all'}`);
    }

  } catch (error) {
    console.error('❌ Field generation failed:', error);
    throw error;
  }
}

/**
 * Get available field categories
 */
export function getAvailableCategories(): string[] {
  return [
    'behavioral_analytics',
    'threat_intelligence', 
    'performance_metrics',
    'security_scores',
    'audit_compliance',
    'network_analytics',
    'endpoint_analytics',
    'forensics_analysis',
    'cloud_security',
    'malware_analysis',
    'geolocation_intelligence',
    'incident_response',
  ];
}

/**
 * Validate field generation configuration
 */
export function validateFieldConfig(config: FieldGenerationConfig): string[] {
  const errors: string[] = [];

  if (config.fieldCount < 1 || config.fieldCount > 50000) {
    errors.push('Field count must be between 1 and 50,000');
  }

  if (config.categories) {
    const validCategories = getAvailableCategories();
    const invalidCategories = config.categories.filter(cat => !validCategories.includes(cat));
    if (invalidCategories.length > 0) {
      errors.push(`Invalid categories: ${invalidCategories.join(', ')}. Valid: ${validCategories.join(', ')}`);
    }
  }

  return errors;
}
/**
 * Update mapping for specific index with all behavioral analytics fields
 * 
 * This handles the specific case where we need to map thousands of 
 * dynamically generated fields to an existing index.
 */

import { getEsClient } from './utils/indices';
import { generateFields } from './generate_fields';

/**
 * Generate comprehensive mapping for behavioral analytics fields
 */
async function generateComprehensiveBehavioralMapping(): Promise<Record<string, { type: string; description: string }>> {
  // Generate a large sample of behavioral analytics fields to get their types
  const result = await generateFields({
    fieldCount: 10000,
    categories: ['behavioral_analytics'],
    outputFormat: 'json',
    includeMetadata: false,
    createMapping: false,
    updateTemplate: false,
  });
  
  const fieldTypes: Record<string, { type: string; description: string }> = {};
  
  // Infer types from generated values
  for (const [fieldName, value] of Object.entries(result.fields)) {
    let type = 'keyword';
    if (typeof value === 'number') {
      type = Number.isInteger(value) ? 'long' : 'double';
    } else if (typeof value === 'boolean') {
      type = 'boolean';
    } else if (Array.isArray(value)) {
      type = 'keyword';
    }
    
    fieldTypes[fieldName] = {
      type,
      description: `Generated behavioral analytics field: ${fieldName}`,
    };
  }
  
  console.log(`📊 Generated type mappings for ${Object.keys(fieldTypes).length} behavioral analytics fields`);
  return fieldTypes;
}

/**
 * Create nested mapping structure for dot-notation field names
 */
function createNestedMapping(fieldPath: string, fieldType: string): Record<string, any> {
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
  current[finalPart] = getElasticsearchMapping(fieldType);
  
  return mapping;
}

/**
 * Convert our field types to Elasticsearch mapping types
 */
function getElasticsearchMapping(fieldType: string): any {
  switch (fieldType) {
    case 'long':
      return { type: 'long', index: true, doc_values: true };
    case 'double':
      return { type: 'double', index: true, doc_values: true };
    case 'boolean':
      return { type: 'boolean', index: true, doc_values: true };
    case 'keyword':
    default:
      return { 
        type: 'keyword', 
        index: true, 
        doc_values: true,
        fields: {
          text: {
            type: 'text',
            index: true,
          }
        }
      };
  }
}

/**
 * Merge nested mapping structures
 */
function mergeNestedMappings(target: Record<string, any>, source: Record<string, any>): void {
  for (const key in source) {
    if (target[key]) {
      if (target[key].type === 'object' && source[key].type === 'object') {
        if (!target[key].properties) target[key].properties = {};
        if (!source[key].properties) source[key].properties = {};
        mergeNestedMappings(target[key].properties, source[key].properties);
      }
    } else {
      target[key] = source[key];
    }
  }
}

/**
 * Update mapping for the security alerts index specifically
 */
export async function updateSecurityAlertsMapping(indexName?: string): Promise<void> {
  const client = getEsClient();
  
  console.log('🔧 Updating security alerts index mapping with comprehensive behavioral analytics fields...');
  
  // Find the security alerts index if not specified
  let targetIndex = indexName;
  if (!targetIndex) {
    const indices = await client.cat.indices({ format: 'json' });
    const securityIndex = indices.find((idx: any) => 
      idx.index && idx.index.includes('alerts-security.alerts-')
    );
    
    if (!securityIndex) {
      console.error('❌ Could not find security alerts index');
      return;
    }
    targetIndex = securityIndex.index;
  }
  
  console.log(`🎯 Target index: ${targetIndex}`);
  
  // Generate comprehensive behavioral analytics field mappings
  const behavioralFields = await generateComprehensiveBehavioralMapping();
  
  // Create nested mapping structure
  const properties: Record<string, any> = {};
  for (const [fieldName, fieldInfo] of Object.entries(behavioralFields)) {
    const nestedMapping = createNestedMapping(fieldName, fieldInfo.type);
    mergeNestedMappings(properties, nestedMapping);
  }
  
  console.log(`🗺️  Generated mapping structure with ${Object.keys(properties).length} top-level properties`);
  
  try {
    // Apply the mapping update
    await client.indices.putMapping({
      index: targetIndex,
      body: {
        properties,
      },
    });
    
    console.log(`✅ Successfully updated mapping for ${targetIndex}`);
    console.log(`📊 Added mappings for ${Object.keys(behavioralFields).length} behavioral analytics fields`);
    console.log('');
    console.log('🎯 Next steps:');
    console.log('  1. Refresh field list in Kibana (Stack Management → Index Patterns → Refresh)');
    console.log('  2. The fields should now appear as mapped instead of unmapped');
    console.log('  3. For best visualization, consider reindexing existing data');
    
  } catch (error: any) {
    if (error.meta?.body?.error?.type === 'illegal_argument_exception') {
      console.log('⚠️  Some field mappings could not be updated (this is normal for existing data)');
      console.log('   The new field mappings will apply to future data');
    } else {
      console.error('❌ Failed to update mapping:', error.message);
      throw error;
    }
  }
}

/**
 * CLI command to update security alerts mapping
 */
export async function updateMappingCLI(indexName?: string): Promise<void> {
  try {
    await updateSecurityAlertsMapping(indexName);
  } catch (error) {
    console.error('Update failed:', error);
    process.exit(1);
  }
}
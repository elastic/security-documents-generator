/**
 * Setup Elasticsearch mappings for security indices
 * 
 * Creates index templates to ensure all dynamically generated fields
 * are properly mapped in Kibana instead of appearing as unmapped.
 */

import { getEsClient } from './utils/indices';
import { 
  generateElasticsearchMapping, 
  generateIndexTemplate,
  applyIndexTemplate,
  generateSecurityFieldMapping
} from '../utils/dynamic_mapping_generator';

/**
 * Setup index templates for security data
 */
export async function setupSecurityMappings(): Promise<void> {
  const client = getEsClient();
  
  console.log('🔧 Setting up Elasticsearch mappings for security fields...');
  console.log('🔍 Note: For existing indices, you may need to reindex data to see new field mappings');
  
  // Get common security field mappings
  const securityFields = generateSecurityFieldMapping();
  
  // Use direct mapping updates for existing indices instead of competing templates
  try {
    // Get list of indices that match our patterns
    const indices = await client.cat.indices({ format: 'json' });
    const securityIndices = indices.filter((idx: any) => 
      idx.index && (
        idx.index.includes('alerts-security.alerts-') ||
        idx.index.startsWith('logs-security.') ||
        idx.index.startsWith('logs-endpoint.') ||
        idx.index.startsWith('logs-network.') ||
        idx.index.startsWith('logs-apache.') ||
        idx.index.startsWith('logs-system.')
      )
    );
    
    console.log(`📊 Found ${securityIndices.length} security-related indices to update`);
    
    // Create the mapping once
    const mapping = generateElasticsearchMapping(securityFields, 'security-fields');
    
    // Apply mapping to each existing index
    let updatedCount = 0;
    for (const idx of securityIndices) {
      try {
        await client.indices.putMapping({
          index: idx.index,
          body: mapping.mappings,
        });
        console.log(`  ✅ Updated mapping for ${idx.index}`);
        updatedCount++;
      } catch (error: any) {
        if (error.meta?.body?.error?.type === 'illegal_argument_exception') {
          console.log(`  ⚠️  Skipped ${idx.index} (mapping conflict - this is normal)`);
        } else {
          console.log(`  ⚠️  Could not update ${idx.index}: ${error.message}`);
        }
      }
    }
    
    // Create a simple component template for future indices
    const componentTemplate = {
      template: {
        mappings: mapping.mappings,
        settings: {
          'index.mapping.total_fields.limit': 50000,
          'index.mapping.depth.limit': 20,
        },
      },
      _meta: {
        description: 'Security multi-field mappings component',
        created_by: 'security-documents-generator',
        field_count: Object.keys(securityFields).length,
      },
    };
    
    await client.cluster.putComponentTemplate({
      name: 'security-multi-fields-component',
      body: componentTemplate,
    });
    
    console.log('✅ Security field mappings setup completed!');
    console.log(`📊 Updated ${updatedCount} existing indices`);
    console.log('📋 Created component template: security-multi-fields-component');
    console.log('');
    console.log('🎯 Benefits:');
    console.log('  ✅ Multi-field data will be properly typed in Kibana');
    console.log('  ✅ Fields will appear in field browser instead of unmapped');
    console.log('  ✅ Proper visualization and aggregation support');
    console.log('  ✅ Better query performance with correct field types');
    console.log('');
    console.log('💡 To apply mappings to new data, you may need to:');
    console.log('  1. Refresh the field list in Kibana (Stack Management → Index Patterns)');
    console.log('  2. For best results, reindex existing data or wait for new data');
    
  } catch (error) {
    console.error('❌ Failed to setup security mappings:', error);
    throw error;
  }
}

/**
 * CLI command to setup mappings
 */
export async function setupMappingsCLI(): Promise<void> {
  try {
    await setupSecurityMappings();
  } catch (error) {
    console.error('Setup failed:', error);
    process.exit(1);
  }
}
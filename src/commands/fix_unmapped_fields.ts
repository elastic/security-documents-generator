/**
 * Fix Unmapped Fields - Complete Solution
 *
 * This command handles the unmapped fields issue by:
 * 1. Analyzing current data structure
 * 2. Creating proper mappings for actual field patterns
 * 3. Providing options to fix existing indices
 */

import { getEsClient } from './utils/indices';

interface FixOptions {
  reindex?: boolean;
  createNew?: boolean;
  indexSuffix?: string;
}

/**
 * Analyze current field patterns in the index
 */
async function analyzeCurrentFields(indexName: string): Promise<{
  totalFields: number;
  fieldPatterns: Record<string, number>;
  sampleFields: string[];
}> {
  const client = getEsClient();

  console.log(`🔍 Analyzing field patterns in ${indexName}...`);

  // Get a sample document to analyze field patterns
  const response = await client.search({
    index: indexName,
    size: 1,
    sort: [{ '@timestamp': { order: 'desc' } }],
  });

  if (response.hits.hits.length === 0) {
    return { totalFields: 0, fieldPatterns: {}, sampleFields: [] };
  }

  const source = response.hits.hits[0]._source as Record<string, any>;
  const allFields = flattenObject(source);
  const fieldNames = Object.keys(allFields);

  // Analyze patterns
  const patterns: Record<string, number> = {};
  for (const field of fieldNames) {
    const parts = field.split('.');
    if (parts.length > 1) {
      const pattern = `${parts[0]}.${parts[1]}.*`;
      patterns[pattern] = (patterns[pattern] || 0) + 1;
    }
  }

  // Get sample behavioral fields
  const behavioralFields = fieldNames
    .filter((f) => f.startsWith('behavioral.'))
    .slice(0, 10);

  return {
    totalFields: fieldNames.length,
    fieldPatterns: patterns,
    sampleFields: behavioralFields,
  };
}

/**
 * Flatten nested object to dot notation
 */
function flattenObject(obj: any, prefix = ''): Record<string, any> {
  const flattened: Record<string, any> = {};

  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      const newKey = prefix ? `${prefix}.${key}` : key;

      if (
        typeof obj[key] === 'object' &&
        obj[key] !== null &&
        !Array.isArray(obj[key])
      ) {
        Object.assign(flattened, flattenObject(obj[key], newKey));
      } else {
        flattened[newKey] = obj[key];
      }
    }
  }

  return flattened;
}

/**
 * Create dynamic mapping for actual field patterns
 */
function createDynamicMapping(): any {
  return {
    properties: {
      // Standard ECS fields
      '@timestamp': { type: 'date' },
      event: {
        properties: {
          action: { type: 'keyword' },
          category: { type: 'keyword' },
          type: { type: 'keyword' },
          severity: { type: 'keyword' },
        },
      },
      host: {
        properties: {
          name: { type: 'keyword' },
        },
      },
      user: {
        properties: {
          name: { type: 'keyword' },
        },
      },
      // Dynamic behavioral fields
      behavioral: {
        type: 'object',
        dynamic: true,
        properties: {}, // Will be populated dynamically
      },
      user_behavior: {
        type: 'object',
        dynamic: true,
        properties: {},
      },
      host_behavior: {
        type: 'object',
        dynamic: true,
        properties: {},
      },
      entity_behavior: {
        type: 'object',
        dynamic: true,
        properties: {},
      },
    },
    // Enable dynamic mapping for new field patterns
    dynamic_templates: [
      {
        behavioral_numbers: {
          path_match: 'behavioral.*',
          match_mapping_type: 'long',
          mapping: {
            type: 'long',
            index: true,
            doc_values: true,
          },
        },
      },
      {
        behavioral_floats: {
          path_match: 'behavioral.*',
          match_mapping_type: 'double',
          mapping: {
            type: 'double',
            index: true,
            doc_values: true,
          },
        },
      },
      {
        behavioral_keywords: {
          path_match: 'behavioral.*',
          match_mapping_type: 'string',
          mapping: {
            type: 'keyword',
            index: true,
            doc_values: true,
          },
        },
      },
      {
        user_behavior_numbers: {
          path_match: 'user_behavior.*',
          match_mapping_type: 'long',
          mapping: {
            type: 'long',
            index: true,
            doc_values: true,
          },
        },
      },
      {
        user_behavior_floats: {
          path_match: 'user_behavior.*',
          match_mapping_type: 'double',
          mapping: {
            type: 'double',
            index: true,
            doc_values: true,
          },
        },
      },
      {
        all_numbers: {
          match_mapping_type: 'long',
          mapping: {
            type: 'long',
            index: true,
            doc_values: true,
          },
        },
      },
      {
        all_floats: {
          match_mapping_type: 'double',
          mapping: {
            type: 'double',
            index: true,
            doc_values: true,
          },
        },
      },
    ],
  };
}

/**
 * Fix unmapped fields in security alerts index
 */
export async function fixUnmappedFields(
  options: FixOptions = {},
): Promise<void> {
  const client = getEsClient();

  console.log('🔧 Fixing unmapped fields in security alerts index...');

  // Find the security alerts index
  const indices = await client.cat.indices({ format: 'json' });
  const securityIndex = indices.find(
    (idx: any) => idx.index && idx.index.includes('alerts-security.alerts-'),
  );

  if (!securityIndex) {
    console.error('❌ Could not find security alerts index');
    return;
  }

  const currentIndex = securityIndex.index;

  if (!currentIndex) {
    console.error('❌ Security index has no name');
    return;
  }

  console.log(`🎯 Found index: ${currentIndex}`);

  // Analyze current data
  const analysis = await analyzeCurrentFields(currentIndex);
  console.log(`📊 Analysis results:`);
  console.log(`  Total fields: ${analysis.totalFields}`);
  console.log(
    `  Field patterns:`,
    Object.keys(analysis.fieldPatterns).slice(0, 5),
  );
  console.log(`  Sample behavioral fields:`, analysis.sampleFields.slice(0, 3));

  if (options.reindex) {
    console.log('🔄 Reindexing with proper mappings...');
    await reindexWithProperMappings(currentIndex, options.indexSuffix);
  } else if (options.createNew) {
    console.log('🆕 Creating new index with proper mappings...');
    await createNewIndexWithMappings(currentIndex, options.indexSuffix);
  } else {
    // Default: show options
    console.log('');
    console.log('🎯 Recommended solutions:');
    console.log('');
    console.log('1️⃣  **Reindex (Recommended)**:');
    console.log('   yarn start fix-unmapped-fields --reindex');
    console.log('   • Deletes current index');
    console.log('   • Creates new index with proper mappings');
    console.log('   • Regenerates all data with correct field types');
    console.log('');
    console.log('2️⃣  **Create New Index**:');
    console.log(
      '   yarn start fix-unmapped-fields --create-new --suffix "-v2"',
    );
    console.log('   • Keeps existing data');
    console.log('   • Creates new index with proper mappings');
    console.log('   • Future data goes to new index');
    console.log('');
    console.log('3️⃣  **Just Fix Future Data**:');
    console.log('   yarn start setup-mappings');
    console.log('   • Existing data stays unmapped');
    console.log('   • New indices get proper mappings');
  }
}

/**
 * Reindex with proper mappings
 */
async function reindexWithProperMappings(
  currentIndex: string,
  suffix?: string,
): Promise<void> {
  const client = getEsClient();

  const newIndex = suffix ? `${currentIndex}${suffix}` : currentIndex;
  const tempIndex = `${currentIndex}-backup-${Date.now()}`;

  try {
    console.log(`📋 Step 1: Creating backup as ${tempIndex}`);

    // Create backup index with current mapping
    const currentMapping = await client.indices.getMapping({
      index: currentIndex,
    });
    const mapping = currentMapping[currentIndex];

    await client.indices.create({
      index: tempIndex,
      body: {
        settings: {
          number_of_shards: 1,
          number_of_replicas: 0, // No replicas for temp index
        },
        mappings: mapping.mappings,
      },
    });

    // Copy data to backup
    await client.reindex({
      body: {
        source: { index: currentIndex },
        dest: { index: tempIndex },
      },
      wait_for_completion: true,
    });

    console.log(`✅ Backup created: ${tempIndex}`);

    console.log(`🗑️  Step 2: Deleting current index ${currentIndex}`);
    await client.indices.delete({ index: currentIndex });

    console.log(`🏗️  Step 3: Creating new index with proper mappings`);
    const dynamicMapping = createDynamicMapping();

    await client.indices.create({
      index: newIndex,
      body: {
        settings: {
          number_of_shards: 1,
          number_of_replicas: 1,
          'index.mapping.total_fields.limit': 50000,
          'index.mapping.depth.limit': 20,
        },
        mappings: dynamicMapping,
      },
    });

    console.log(`✅ New index created: ${newIndex}`);
    console.log(`📋 Backup available at: ${tempIndex}`);
    console.log('');
    console.log('🎯 Next steps:');
    console.log(
      '1. Generate new data with: yarn start generate-alerts -n 10 --multi-field --field-count 4000 --field-categories behavioral_analytics',
    );
    console.log('2. Check Kibana - fields should now be properly mapped');
    console.log(
      `3. If everything works, delete backup: curl -X DELETE "${client.connectionPool.connections[0].url}/${tempIndex}"`,
    );
  } catch (error) {
    console.error('❌ Reindex failed:', error);
    console.log(`🔄 Attempting to restore from backup if it exists...`);

    try {
      const backupExists = await client.indices.exists({ index: tempIndex });
      if (backupExists) {
        // Try to restore
        await client.indices.delete({ index: currentIndex }).catch(() => {});
        await client.reindex({
          body: {
            source: { index: tempIndex },
            dest: { index: currentIndex },
          },
          wait_for_completion: true,
        });
        console.log(`✅ Restored from backup`);
      }
    } catch (restoreError) {
      console.error('❌ Restore also failed:', restoreError);
    }

    throw error;
  }
}

/**
 * Create new index with proper mappings
 */
async function createNewIndexWithMappings(
  currentIndex: string,
  suffix: string = '-v2',
): Promise<void> {
  const client = getEsClient();

  const newIndex = `${currentIndex}${suffix}`;

  console.log(`🏗️  Creating new index: ${newIndex}`);

  const dynamicMapping = createDynamicMapping();

  await client.indices.create({
    index: newIndex,
    body: {
      settings: {
        number_of_shards: 1,
        number_of_replicas: 1,
        'index.mapping.total_fields.limit': 50000,
        'index.mapping.depth.limit': 20,
      },
      mappings: dynamicMapping,
    },
  });

  console.log(`✅ New index created: ${newIndex}`);
  console.log('');
  console.log('🎯 Next steps:');
  console.log(`1. Generate new data to the new index`);
  console.log(`2. Update your Kibana index patterns to include ${newIndex}`);
  console.log(`3. Compare field mapping between old and new indices`);
}

/**
 * CLI command
 */
export async function fixUnmappedFieldsCLI(
  options: FixOptions = {},
): Promise<void> {
  try {
    await fixUnmappedFields(options);
  } catch (error) {
    console.error('Fix failed:', error);
    process.exit(1);
  }
}

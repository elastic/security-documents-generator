/**
 * Fix Logs Mapping - Data Stream Edition
 *
 * Handles the specific case where logs go to data streams (e.g., .ds-logs-security.security-default-*)
 * and hit field limits due to 'ignore_dynamic_beyond_limit' setting.
 */

import { getEsClient } from './utils/indices';

/**
 * Create index template for logs data streams with high field limits
 */
async function createLogsIndexTemplate(): Promise<void> {
  const client = getEsClient();

  console.log('🔧 Creating logs index template with unlimited fields...');

  // Create index template for logs-* pattern with specific security patterns
  const indexTemplate = {
    index_patterns: ['logs-*', '.ds-logs-*'],
    priority: 200, // Higher than default logs template
    data_stream: {},
    template: {
      settings: {
        'index.mapping.total_fields.limit': 50000,
        'index.mapping.depth.limit': 20,
        'index.mapping.total_fields.ignore_dynamic_beyond_limit': false,
      },
      mappings: {
        dynamic_templates: [
          {
            behavioral_numbers: {
              path_match: 'behavioral.*',
              match_mapping_type: 'long',
              mapping: {
                type: 'long' as const,
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
                type: 'double' as const,
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
                type: 'keyword' as const,
                index: true,
                doc_values: true,
              },
            },
          },
          {
            threat_intelligence: {
              path_match: 'threat.*',
              match_mapping_type: 'long',
              mapping: {
                type: 'long' as const,
                index: true,
                doc_values: true,
              },
            },
          },
          {
            all_numbers: {
              match_mapping_type: 'long',
              mapping: {
                type: 'long' as const,
                index: true,
                doc_values: true,
              },
            },
          },
          {
            all_floats: {
              match_mapping_type: 'double',
              mapping: {
                type: 'double' as const,
                index: true,
                doc_values: true,
              },
            },
          },
        ],
      },
    },
    _meta: {
      description:
        'High field limit template for security logs with behavioral analytics',
      created_by: 'security-documents-generator',
      version: '1.0.0',
    },
  };

  await client.indices.putIndexTemplate({
    name: 'security-logs-unlimited-fields',
    body: indexTemplate as any, // Type assertion to work around strict typing
  });

  console.log('✅ Created index template: security-logs-unlimited-fields');
  console.log('   Priority: 200 (overrides default logs template)');
  console.log('   Field limit: 50,000');
  console.log('   Dynamic beyond limit: false (maps all fields)');
}

/**
 * Check current logs indices and their field limits
 */
async function analyzeLogsIndices(): Promise<void> {
  const client = getEsClient();

  console.log('🔍 Analyzing current logs indices...');

  // Find logs indices
  const indices = await client.cat.indices({ format: 'json' });
  const logsIndices = indices.filter(
    (idx: any) =>
      idx.index &&
      (idx.index.startsWith('.ds-logs-') || idx.index.startsWith('logs-')),
  );

  console.log(`📊 Found ${logsIndices.length} logs indices:`);

  for (const idx of logsIndices.slice(0, 3)) {
    // Show first 3
    try {
      // Check if index name exists
      if (!idx.index) {
        console.log(`  ⚠️  Skipping index with undefined name`);
        continue;
      }

      // Get index settings
      const settings = await client.indices.getSettings({ index: idx.index });
      const indexData = settings[idx.index];

      if (!indexData?.settings?.index) {
        console.log(`  ⚠️  Could not get settings for ${idx.index}`);
        continue;
      }

      const indexSettings = indexData.settings.index;

      const fieldLimit = indexSettings.mapping?.total_fields?.limit || 1000;
      const ignoreBeyondLimit = (indexSettings.mapping as any)?.[
        'ignore_dynamic_beyond_limit'
      ];

      console.log(`  📄 ${idx.index}:`);
      console.log(`    Field limit: ${fieldLimit}`);
      console.log(`    Ignore beyond limit: ${ignoreBeyondLimit}`);

      // Get field count
      const mapping = await client.indices.getMapping({ index: idx.index });
      const indexMapping = mapping[idx.index];

      if (!indexMapping?.mappings?.properties) {
        console.log(`    Current fields: unknown (no mapping found)`);
        continue;
      }

      const properties = indexMapping.mappings.properties;
      const fieldCount = Object.keys(flattenMapping(properties)).length;

      console.log(`    Current fields: ${fieldCount}`);
    } catch (error) {
      console.log(
        `  ⚠️  Could not analyze ${idx.index}:`,
        error instanceof Error ? error.message : 'Unknown error',
      );
    }
  }
}

/**
 * Flatten mapping to count fields
 */
function flattenMapping(obj: any, prefix = ''): Record<string, any> {
  const flattened: Record<string, any> = {};

  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      const newKey = prefix ? `${prefix}.${key}` : key;

      if (obj[key].properties) {
        Object.assign(flattened, flattenMapping(obj[key].properties, newKey));
      } else if (obj[key].type) {
        flattened[newKey] = obj[key].type;
      }
    }
  }

  return flattened;
}

/**
 * Rollover current logs index to apply new template
 */
async function rolloverLogsIndex(): Promise<void> {
  const client = getEsClient();

  console.log('🔄 Rolling over logs data stream to apply new template...');

  try {
    // Find the data stream
    const dataStreams = await client.indices.getDataStream({ name: '*logs-*' });

    if (dataStreams.data_streams && dataStreams.data_streams.length > 0) {
      for (const ds of dataStreams.data_streams) {
        console.log(`📋 Rolling over data stream: ${ds.name}`);

        await client.indices.rollover({
          alias: ds.name,
        });

        console.log(`✅ Rolled over: ${ds.name}`);
      }
    } else {
      console.log('⚠️  No data streams found to rollover');
    }
  } catch (error: any) {
    console.log('⚠️  Rollover not needed or not possible:', error.message);
  }
}

/**
 * Main function to fix logs mapping
 */
export async function fixLogsMapping(
  options: { rollover?: boolean } = {},
): Promise<void> {
  console.log(
    '🔧 Fixing logs mapping for unlimited behavioral analytics fields...',
  );
  console.log('');

  // Analyze current state
  await analyzeLogsIndices();
  console.log('');

  // Create new template
  await createLogsIndexTemplate();
  console.log('');

  if (options.rollover) {
    await rolloverLogsIndex();
    console.log('');
  }

  console.log('🎯 Next steps:');
  console.log('1. Delete existing logs: yarn start delete-logs');
  console.log(
    '2. Generate new logs: yarn start generate-logs -n 10 --multi-field --field-count 4000 --field-categories behavioral_analytics',
  );
  console.log('3. Check Kibana - all 4000 fields should now be mapped');
  console.log('');
  console.log('✅ New logs will use the unlimited fields template');
}

/**
 * CLI command
 */
export async function fixLogsMappingCLI(): Promise<void> {
  try {
    await fixLogsMapping({ rollover: true });
  } catch (error) {
    console.error('Fix failed:', error);
    process.exit(1);
  }
}

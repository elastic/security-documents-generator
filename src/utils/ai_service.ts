import { OpenAI } from 'openai';
import { readFileSync } from 'fs';
import path from 'path';
import { getConfig } from '../get_config';
import { BaseCreateAlertsReturnType } from '../create_alerts';
import { faker } from '@faker-js/faker';

// Initialize OpenAI client
let openai: OpenAI | null = null;

// Simple cache for AI responses to reduce duplicate API calls
const aiResponseCache = new Map<string, any>();
const MAX_CACHE_SIZE = 100;

// Function to initialize OpenAI client
const initializeOpenAI = () => {
  const config = getConfig();

  // Check if using Azure OpenAI
  if (config.useAzureOpenAI) {
    if (!config.azureOpenAIApiKey) {
      throw new Error('Azure OpenAI API key not defined in config');
    }
    if (!config.azureOpenAIEndpoint) {
      throw new Error('Azure OpenAI endpoint not defined in config');
    }
    if (!config.azureOpenAIDeployment) {
      throw new Error('Azure OpenAI deployment name not defined in config');
    }

    openai = new OpenAI({
      apiKey: config.azureOpenAIApiKey,
      baseURL: `${config.azureOpenAIEndpoint}/openai/deployments/${config.azureOpenAIDeployment}`,
      defaultQuery: {
        'api-version': config.azureOpenAIApiVersion || '2023-05-15',
      },
      defaultHeaders: { 'api-key': config.azureOpenAIApiKey },
    });
  } else {
    // Standard OpenAI
    if (!config.openaiApiKey) {
      throw new Error('OpenAI API key not defined in config');
    }

    openai = new OpenAI({
      apiKey: config.openaiApiKey,
    });
  }
};

// Load mapping schemas for context - optimized to extract only essential fields
const loadMappingSchema = (mappingFile: string, maxSize = 1000): string => {
  try {
    const filePath = path.resolve(process.cwd(), 'src/mappings', mappingFile);
    const content = readFileSync(filePath, 'utf8');

    // Try to parse and extract essential schema information
    try {
      const parsed = JSON.parse(content);
      const essentialFields = extractEssentialFields(parsed);
      return JSON.stringify(essentialFields, null, 2);
    } catch (e) {
      // Fallback to truncation if parsing fails
      return content.substring(0, maxSize);
    }
  } catch (error) {
    console.error(`Failed to load mapping schema: ${mappingFile}`, error);
    return '{}';
  }
};

// Extract only the essential fields from the schema to reduce token usage
const extractEssentialFields = (schema: any): any => {
  if (!schema.properties) return schema;

  const essentialFields: Record<string, any> = {};
  const properties = schema.properties;

  // Select only the most important top-level properties
  const importantKeys = [
    'host',
    'user',
    'event',
    'kibana',
    'agent',
    'source',
    'destination',
    'network',
    'process',
    'file',
    'alert',
    '@timestamp',
  ];

  importantKeys.forEach((key) => {
    if (properties[key]) {
      essentialFields[key] = properties[key];
    }
  });

  return { properties: essentialFields };
};

// Default alert template with required fields
const createDefaultAlertTemplate = (
  hostName: string,
  userName: string,
  space: string,
): Partial<BaseCreateAlertsReturnType> => {
  return {
    'host.name': hostName,
    'user.name': userName,
    'kibana.alert.uuid': faker.string.uuid(),
    'kibana.alert.start': new Date().toISOString(),
    'kibana.alert.last_detected': new Date().toISOString(),
    'kibana.version': '8.7.0',
    'kibana.space_ids': [space],
    '@timestamp': Date.now(),
    'event.kind': 'signal',
    'kibana.alert.status': 'active',
    'kibana.alert.workflow_status': 'open',
    'kibana.alert.depth': 1,
    'kibana.alert.severity': 'low',
    'kibana.alert.risk_score': 21,
  };
};

// Validate generated alert for quality and correctness
const validateAlert = (
  alert: Record<string, any>,
  hostName: string,
  userName: string,
  space: string,
): Record<string, any> => {
  // Create a copy to avoid modifying the original
  const validatedAlert = { ...alert };

  // Ensure critical fields are present and correctly formatted
  validatedAlert['host.name'] = hostName;
  validatedAlert['user.name'] = userName;
  validatedAlert['kibana.space_ids'] = Array.isArray(
    validatedAlert['kibana.space_ids'],
  )
    ? validatedAlert['kibana.space_ids']
    : [space];

  // Ensure timestamps are valid ISO strings
  if (
    validatedAlert['kibana.alert.start'] &&
    !isValidISODate(validatedAlert['kibana.alert.start'])
  ) {
    validatedAlert['kibana.alert.start'] = new Date().toISOString();
  }

  if (
    validatedAlert['kibana.alert.last_detected'] &&
    !isValidISODate(validatedAlert['kibana.alert.last_detected'])
  ) {
    validatedAlert['kibana.alert.last_detected'] = new Date().toISOString();
  }

  // Ensure UUID is valid
  if (
    !validatedAlert['kibana.alert.uuid'] ||
    typeof validatedAlert['kibana.alert.uuid'] !== 'string'
  ) {
    validatedAlert['kibana.alert.uuid'] = faker.string.uuid();
  }

  // Ensure @timestamp is present
  if (!validatedAlert['@timestamp']) {
    validatedAlert['@timestamp'] = Date.now();
  }

  return validatedAlert;
};

// Helper to check if a string is a valid ISO date
const isValidISODate = (str: string): boolean => {
  if (!/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z/.test(str)) return false;
  const d = new Date(str);
  return d.toISOString() === str;
};

// Process examples to extract the most relevant fields for context
const processExamples = (
  examples: BaseCreateAlertsReturnType[] = [],
): string => {
  if (examples.length === 0) return '[]';

  // Select a subset of the most informative examples
  const processedExamples = examples.slice(0, 2).map((example) => {
    // Extract only the most relevant fields to reduce tokens
    const relevantFields: Record<string, any> = {};

    [
      'host.name',
      'user.name',
      'event.kind',
      'event.category',
      'kibana.alert.severity',
      'kibana.alert.risk_score',
      'source.ip',
      'destination.ip',
      'process.name',
    ].forEach((field) => {
      const keys = field.split('.');
      let current = example;
      let currentTarget = relevantFields;

      for (let i = 0; i < keys.length; i++) {
        const key = keys[i];
        if (i === keys.length - 1) {
          if (current && current[key] !== undefined) {
            currentTarget[key] = current[key];
          }
        } else {
          if (current && current[key] !== undefined) {
            current = current[key];
            if (!currentTarget[key]) currentTarget[key] = {};
            currentTarget = currentTarget[key];
          } else {
            break;
          }
        }
      }
    });

    return relevantFields;
  });

  return JSON.stringify(processedExamples);
};

// Generate an alert using AI based on examples and mapping schema
export const generateAIAlert = async ({
  userName = 'user-1',
  hostName = 'host-1',
  space = 'default',
  examples = [],
  alertType = 'general',
}: {
  userName?: string;
  hostName?: string;
  space?: string;
  examples?: BaseCreateAlertsReturnType[];
  alertType?: string;
}): Promise<BaseCreateAlertsReturnType> => {
  if (!openai) {
    initializeOpenAI();
  }

  if (!openai) {
    throw new Error('Failed to initialize OpenAI client');
  }

  // Check cache first
  const cacheKey = `alert:${hostName}:${userName}:${space}:${alertType}`;
  if (aiResponseCache.has(cacheKey)) {
    return aiResponseCache.get(cacheKey);
  }

  // Load alert mapping schema - optimized
  const alertMappingSchema = loadMappingSchema('alertMappings.json');

  // Process examples for context - optimized
  const examplesContext = processExamples(examples);

  // Create a concise system prompt with essential instructions
  const systemPrompt = `Security alert generator. Create JSON alert with:
- host.name: "${hostName}"
- user.name: "${userName}"
- kibana.space_ids: ["${space}"]
- kibana.alert.uuid: UUID
- kibana.alert.start & last_detected: ISO timestamps
- kibana.version: "8.7.0"
- @timestamp: current milliseconds
- event.kind: "signal"
- kibana.alert.status: "active"
- kibana.alert.workflow_status: "open"
- kibana.alert.depth: 1
- kibana.alert.severity: "low"
- kibana.alert.risk_score: 21
${alertType !== 'general' ? `This is a ${alertType} type alert.` : ''}
Schema excerpt: ${alertMappingSchema.substring(0, 800)}`;

  try {
    const config = getConfig();
    const modelName =
      config.useAzureOpenAI && config.azureOpenAIDeployment
        ? config.azureOpenAIDeployment
        : 'gpt-4o';

    const response = await openai.chat.completions.create({
      model: modelName,
      messages: [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content: `Generate a realistic security alert for host "${hostName}" and user "${userName}".${examples.length > 0 ? ' Reference examples: ' + examplesContext : ''}`,
        },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.7,
    });

    const generatedAlert = JSON.parse(
      response.choices[0].message.content || '{}',
    );

    // Create a default template with required fields
    const defaultTemplate = createDefaultAlertTemplate(
      hostName,
      userName,
      space,
    );

    // Merge the generated alert with the default template to ensure required fields
    const mergedAlert = {
      ...defaultTemplate,
      ...generatedAlert,
      // Always ensure these specific fields
      'host.name': hostName,
      'user.name': userName,
      'kibana.space_ids': [space],
      'kibana.alert.uuid':
        generatedAlert['kibana.alert.uuid'] ||
        defaultTemplate['kibana.alert.uuid'],
    };

    // Validate the alert for quality and correctness
    const validatedAlert = validateAlert(
      mergedAlert,
      hostName,
      userName,
      space,
    );

    // Store in cache
    if (aiResponseCache.size >= MAX_CACHE_SIZE) {
      // Remove oldest entry if cache is full
      const firstKey = aiResponseCache.keys().next().value;
      aiResponseCache.delete(firstKey);
    }
    aiResponseCache.set(cacheKey, validatedAlert);

    return validatedAlert as BaseCreateAlertsReturnType;
  } catch (error) {
    console.error('Error generating AI alert:', error);
    throw new Error('Failed to generate alert using AI');
  }
};

// Generate an event using AI based on mapping schema
export const generateAIEvent = async (
  override: { id_field?: string; id_value?: string } = {},
): Promise<Record<string, unknown>> => {
  if (!openai) {
    initializeOpenAI();
  }

  if (!openai) {
    throw new Error('Failed to initialize OpenAI client');
  }

  // Check cache first
  const cacheKey = `event:${override.id_field || ''}:${override.id_value || ''}`;
  if (aiResponseCache.has(cacheKey)) {
    return aiResponseCache.get(cacheKey);
  }

  // Load event mapping schema - optimized
  const eventMappingSchema = loadMappingSchema('eventMappings.json', 800);

  // Create concise system prompt for event generation
  const systemPrompt = `Security event generator. Create JSON with:
- @timestamp: ISO format timestamp
- criticality: one of ["low_impact", "medium_impact", "high_impact", "extreme_impact"]
${override.id_field ? `- ${override.id_field}: "${override.id_value}"` : ''}
Schema: ${eventMappingSchema}`;

  try {
    const config = getConfig();
    const modelName =
      config.useAzureOpenAI && config.azureOpenAIDeployment
        ? config.azureOpenAIDeployment
        : 'gpt-4o';

    const response = await openai.chat.completions.create({
      model: modelName,
      messages: [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content: 'Generate a realistic security event document.',
        },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.7,
    });

    const generatedEvent = JSON.parse(
      response.choices[0].message.content || '{}',
    );

    // Ensure timestamp is present
    if (!generatedEvent['@timestamp']) {
      generatedEvent['@timestamp'] = new Date().toISOString();
    }

    // Add any override values
    const finalEvent = { ...generatedEvent, ...override };

    // Store in cache
    if (aiResponseCache.size >= MAX_CACHE_SIZE) {
      // Remove oldest entry if cache is full
      const firstKey = aiResponseCache.keys().next().value;
      aiResponseCache.delete(firstKey);
    }
    aiResponseCache.set(cacheKey, finalEvent);

    return finalEvent;
  } catch (error) {
    console.error('Error generating AI event:', error);
    throw new Error('Failed to generate event using AI');
  }
};

// Generate multiple alerts in a batch to reduce API calls
export const generateAIAlertBatch = async ({
  entities = [],
  space = 'default',
  examples = [],
  batchSize = 5,
}: {
  entities: Array<{ userName: string; hostName: string }>;
  space?: string;
  examples?: BaseCreateAlertsReturnType[];
  batchSize?: number;
}): Promise<BaseCreateAlertsReturnType[]> => {
  if (!openai) {
    initializeOpenAI();
  }

  if (!openai) {
    throw new Error('Failed to initialize OpenAI client');
  }

  if (entities.length === 0) {
    return [];
  }

  // Process examples for context
  const examplesContext = processExamples(examples);

  // Load alert mapping schema - optimized
  const alertMappingSchema = loadMappingSchema('alertMappings.json', 800);

  // Process in batches of the specified size
  const results: BaseCreateAlertsReturnType[] = [];
  const batches = [];

  // Split entities into batches
  for (let i = 0; i < entities.length; i += batchSize) {
    batches.push(entities.slice(i, i + batchSize));
  }

  // Process each batch
  for (const batch of batches) {
    try {
      // Create system prompt for batch generation
      const systemPrompt = `Security alert generator. Create ${batch.length} separate JSON alerts, each with these required fields:
- host.name: (provided per entity)
- user.name: (provided per entity)
- kibana.space_ids: ["${space}"]
- kibana.alert.uuid: unique UUID for each
- kibana.alert.start & last_detected: ISO timestamps
- kibana.version: "8.7.0"
- @timestamp: current milliseconds
- event.kind: "signal"
- kibana.alert.status: "active"
- kibana.alert.workflow_status: "open"
- kibana.alert.depth: 1
- kibana.alert.severity: "low"
- kibana.alert.risk_score: 21
Return array of ${batch.length} complete alert objects.
Schema excerpt: ${alertMappingSchema}`;

      const config = getConfig();
      const modelName =
        config.useAzureOpenAI && config.azureOpenAIDeployment
          ? config.azureOpenAIDeployment
          : 'gpt-4o';

      const response = await openai.chat.completions.create({
        model: modelName,
        messages: [
          { role: 'system', content: systemPrompt },
          {
            role: 'user',
            content: `Generate ${batch.length} realistic security alerts for these entities: ${JSON.stringify(batch)}. ${examples.length > 0 ? 'Reference examples: ' + examplesContext : ''}`,
          },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.7,
      });

      let generatedAlerts = [];
      try {
        const content = JSON.parse(response.choices[0].message.content || '[]');
        generatedAlerts = Array.isArray(content) ? content : [content];
      } catch (e) {
        console.error('Error parsing batch response:', e);
        generatedAlerts = [];
      }

      // Process each alert in the batch
      for (let i = 0; i < batch.length; i++) {
        const entity = batch[i];
        const generatedAlert =
          i < generatedAlerts.length ? generatedAlerts[i] : {};

        // Create a default template
        const defaultTemplate = createDefaultAlertTemplate(
          entity.hostName,
          entity.userName,
          space,
        );

        // Merge and validate
        const mergedAlert = {
          ...defaultTemplate,
          ...generatedAlert,
          'host.name': entity.hostName,
          'user.name': entity.userName,
          'kibana.space_ids': [space],
          'kibana.alert.uuid':
            generatedAlert['kibana.alert.uuid'] ||
            defaultTemplate['kibana.alert.uuid'],
        };

        const validatedAlert = validateAlert(
          mergedAlert,
          entity.hostName,
          entity.userName,
          space,
        );

        results.push(validatedAlert as BaseCreateAlertsReturnType);

        // Store in cache
        const cacheKey = `alert:${entity.hostName}:${entity.userName}:${space}:general`;
        if (aiResponseCache.size >= MAX_CACHE_SIZE) {
          const firstKey = aiResponseCache.keys().next().value;
          aiResponseCache.delete(firstKey);
        }
        aiResponseCache.set(cacheKey, validatedAlert);
      }
    } catch (error) {
      console.error('Error generating AI alert batch:', error);
      // Fallback to individual generation for this batch
      for (const entity of batch) {
        try {
          const alert = await generateAIAlert({
            userName: entity.userName,
            hostName: entity.hostName,
            space,
            examples,
          });
          results.push(alert);
        } catch (e) {
          console.error('Error in fallback generation:', e);
          // Use default template as last resort
          const defaultAlert = createDefaultAlertTemplate(
            entity.hostName,
            entity.userName,
            space,
          );
          results.push(defaultAlert as BaseCreateAlertsReturnType);
        }
      }
    }
  }

  return results;
};

// Function to extract schema structure from mapping
export const extractSchemaFromMapping = (
  mappingJson: string,
): Record<string, unknown> => {
  try {
    const mapping = JSON.parse(mappingJson);
    const schemaStructure: Record<string, unknown> = {};

    const extractProperties = (
      properties: Record<string, Record<string, unknown>>,
      parentPath = '',
    ): void => {
      Object.entries(properties).forEach(([key, value]) => {
        const currentPath = parentPath ? `${parentPath}.${key}` : key;

        if (value.type) {
          schemaStructure[currentPath] = value.type;
        }

        if (value.properties) {
          extractProperties(
            value.properties as Record<string, Record<string, unknown>>,
            currentPath,
          );
        }
      });
    };

    if (mapping.properties) {
      extractProperties(
        mapping.properties as Record<string, Record<string, unknown>>,
      );
    }

    return schemaStructure;
  } catch (error) {
    console.error('Error extracting schema from mapping:', error);
    return {};
  }
};

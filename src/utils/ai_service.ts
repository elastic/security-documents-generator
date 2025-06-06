import { OpenAI } from 'openai';
import { readFileSync } from 'fs';
import path from 'path';
import { getConfig } from '../get_config';
import { BaseCreateAlertsReturnType } from '../create_alerts';
import { faker } from '@faker-js/faker';
// Note: timestamp utilities available but not used in this service currently

/**
 * AI Service for Security Documents Generation
 *
 * CURRENT IMPLEMENTATION STATUS:
 *
 * ✅ IMPLEMENTED:
 * - OpenAI/Azure OpenAI client initialization and configuration
 * - Response caching system to reduce API costs
 * - Alert generation (single and batch) with validation
 * - Event generation with schema-based context
 * - Mapping schema loading and essential field extraction
 * - Default template creation with required Kibana fields
 * - Input validation and data sanitization
 * - Batch processing for performance optimization
 *
 * 🚧 PENDING/TODO:
 * - MITRE ATT&CK framework integration (tactics, techniques, sub-techniques)
 * - Configurable field generation (min/max fields, custom patterns)
 * - Large-scale dataset generation (>1000 alerts efficiently)
 * - Advanced prompt engineering for realistic attack scenarios
 * - MITRE-specific alert templates and validation
 * - Attack chain/sequence generation
 * - Performance metrics and monitoring
 * - Error recovery and retry mechanisms
 *
 * ARCHITECTURE NOTES:
 * - Uses singleton pattern for OpenAI client
 * - Implements LRU-style cache with max size limit
 * - Schema processing optimized for token usage
 * - Validation ensures ECS compliance
 */

// Type definitions for better TypeScript support
interface CacheValue {
  data: BaseCreateAlertsReturnType | Record<string, unknown>;
  timestamp: number;
}

interface SchemaProperty {
  type?: string;
  properties?: Record<string, SchemaProperty>;
  [key: string]: unknown;
}

interface ParsedSchema {
  properties?: Record<string, SchemaProperty>;
  [key: string]: unknown;
}

// Initialize OpenAI client
let openai: OpenAI | null = null;

// Simple cache for AI responses to reduce duplicate API calls
const aiResponseCache = new Map<string, CacheValue>();
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
      const parsed = JSON.parse(content) as ParsedSchema;
      const essentialFields = extractEssentialFields(parsed);
      return JSON.stringify(essentialFields, null, 2);
    } catch {
      // Fallback to truncation if parsing fails
      return content.substring(0, maxSize);
    }
  } catch (error) {
    console.error(`Failed to load mapping schema: ${mappingFile}`, error);
    return '{}';
  }
};

// Extract only the essential fields from the schema to reduce token usage
const extractEssentialFields = (schema: ParsedSchema): ParsedSchema => {
  if (!schema.properties) return schema;

  const essentialFields: Record<string, SchemaProperty> = {};
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
  alert: Record<string, unknown>,
  hostName: string,
  userName: string,
  space: string,
): Record<string, unknown> => {
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

  // Ensure timestamps are valid ISO strings with proper type checking
  if (
    validatedAlert['kibana.alert.start'] &&
    typeof validatedAlert['kibana.alert.start'] === 'string' &&
    !isValidISODate(validatedAlert['kibana.alert.start'])
  ) {
    validatedAlert['kibana.alert.start'] = new Date().toISOString();
  }

  if (
    validatedAlert['kibana.alert.last_detected'] &&
    typeof validatedAlert['kibana.alert.last_detected'] === 'string' &&
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
    const relevantFields: Record<string, unknown> = {};

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
      let current: Record<string, unknown> = example as Record<string, unknown>;
      let currentTarget: Record<string, unknown> = relevantFields;

      for (let i = 0; i < keys.length; i++) {
        const key = keys[i];
        if (i === keys.length - 1) {
          if (current && current[key] !== undefined) {
            currentTarget[key] = current[key];
          }
        } else {
          if (
            current &&
            current[key] !== undefined &&
            typeof current[key] === 'object'
          ) {
            current = current[key] as Record<string, unknown>;
            if (!currentTarget[key]) currentTarget[key] = {};
            currentTarget = currentTarget[key] as Record<string, unknown>;
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
    const cached = aiResponseCache.get(cacheKey);
    return cached?.data as BaseCreateAlertsReturnType;
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
      if (firstKey) {
        aiResponseCache.delete(firstKey);
      }
    }
    aiResponseCache.set(cacheKey, {
      data: validatedAlert,
      timestamp: Date.now(),
    });

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
    const cached = aiResponseCache.get(cacheKey);
    return cached?.data || {};
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
      if (firstKey) {
        aiResponseCache.delete(firstKey);
      }
    }
    aiResponseCache.set(cacheKey, { data: finalEvent, timestamp: Date.now() });

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
            content: `Generate exactly ${batch.length} realistic security alerts for these entities: ${JSON.stringify(batch)}.

IMPORTANT: Return a JSON array with exactly ${batch.length} alert objects. Each alert should be a complete JSON object with Kibana/ECS fields.

Format: [{"host.name": "...", "user.name": "...", "kibana.alert.rule.name": "...", ...}, {...}, ...]

${examples.length > 0 ? 'Reference examples: ' + examplesContext : ''}`,
          },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.7,
      });

      let generatedAlerts = [];
      try {
        const rawContent = response.choices[0].message.content || '[]';

        // Debug: Log the raw response (remove in production)
        if (process.env.DEBUG_AI_RESPONSES) {
          console.log('DEBUG - Raw AI response length:', rawContent.length);
          console.log('DEBUG - First 1000 chars:', rawContent.substring(0, 1000));
        }

        // Clean and validate the JSON content
        const cleanedContent = sanitizeJSONResponse(rawContent);
        if (process.env.DEBUG_AI_RESPONSES) {
          console.log('DEBUG - Cleaned content length:', cleanedContent.length);
          console.log('DEBUG - Cleaned content preview:', cleanedContent.substring(0, 500));
        }

        const content = JSON.parse(cleanedContent);

        // Handle different response formats
        if (Array.isArray(content)) {
          generatedAlerts = content;
        } else if (content && typeof content === 'object') {
          // Check if the object has an 'alerts' property or similar
          if (content.alerts && Array.isArray(content.alerts)) {
            generatedAlerts = content.alerts;
          } else if (content.data && Array.isArray(content.data)) {
            generatedAlerts = content.data;
          } else {
            // Single object response, wrap in array
            generatedAlerts = [content];
          }
        } else {
          generatedAlerts = [];
        }

        // Validate that we have the expected number of alerts
        if (generatedAlerts.length !== batch.length) {
          console.warn(`Expected ${batch.length} alerts, got ${generatedAlerts.length}. Padding with defaults.`);

          // Pad with empty objects if we have fewer alerts than expected
          while (generatedAlerts.length < batch.length) {
            generatedAlerts.push({});
          }
        }
      } catch (e) {
        console.error('Error parsing batch response:', e);
        const contentLength = response.choices[0].message.content?.length || 0;
        console.error('Raw response length:', contentLength);

        if (response.choices[0].message.content) {
          console.error('First 500 chars:', response.choices[0].message.content.substring(0, 500));
          if (contentLength > 500) {
            console.error('Last 500 chars:', response.choices[0].message.content.substring(contentLength - 500));
          }
        }

        // Fallback: create empty objects for each entity
        generatedAlerts = batch.map(() => ({}));
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
          if (firstKey) {
            aiResponseCache.delete(firstKey);
          }
        }
        aiResponseCache.set(cacheKey, {
          data: validatedAlert,
          timestamp: Date.now(),
        });
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

// Function to sanitize and clean JSON responses from AI
const sanitizeJSONResponse = (rawContent: string): string => {
  try {
    // Remove common JSON formatting issues
    let cleaned = rawContent.trim();

    // Remove any markdown code block markers
    cleaned = cleaned.replace(/^```json\s*/i, '').replace(/\s*```$/, '');

    // Remove any leading/trailing non-JSON content
    const firstBrace = cleaned.indexOf('{');
    const lastBrace = cleaned.lastIndexOf('}');
    const firstBracket = cleaned.indexOf('[');
    const lastBracket = cleaned.lastIndexOf(']');

    // Determine if we have an object or array
    if (firstBrace !== -1 && (firstBracket === -1 || firstBrace < firstBracket)) {
      // Object format
      if (lastBrace !== -1) {
        cleaned = cleaned.substring(firstBrace, lastBrace + 1);
      }
    } else if (firstBracket !== -1) {
      // Array format
      if (lastBracket !== -1) {
        cleaned = cleaned.substring(firstBracket, lastBracket + 1);
      }
    }

    // Fix common JSON formatting issues
    cleaned = cleaned
      // Fix unescaped quotes in strings
      .replace(/([^\\])"([^"]*)"([^,}\]:])/g, '$1\\"$2\\"$3')
      // Fix trailing commas
      .replace(/,\s*([}\]])/g, '$1')
      // Fix multiple consecutive commas
      .replace(/,+/g, ',')
      // Fix missing commas between objects/arrays
      .replace(/}\s*{/g, '},{')
      .replace(/]\s*\[/g, '],[');

    // Validate basic JSON structure
    try {
      JSON.parse(cleaned);
      return cleaned;
    } catch {
      // If still invalid, try to extract valid JSON objects
      const objects = extractValidJSONObjects(cleaned);
      return objects.length > 0 ? JSON.stringify(objects) : '[]';
    }
  } catch (error) {
    console.warn('JSON sanitization failed, returning empty array:', error);
    return '[]';
  }
};

// Helper function to extract valid JSON objects from malformed text
const extractValidJSONObjects = (text: string): Record<string, unknown>[] => {
  const objects: Record<string, unknown>[] = [];
  const lines = text.split('\n');
  let currentObject = '';
  let braceCount = 0;

  for (const line of lines) {
    currentObject += line;

    // Count braces to find complete objects
    for (const char of line) {
      if (char === '{') braceCount++;
      if (char === '}') braceCount--;

      if (braceCount === 0 && currentObject.trim().startsWith('{')) {
        try {
          const parsed = JSON.parse(currentObject.trim());
          objects.push(parsed);
          currentObject = '';
        } catch {
          // Continue trying to build a valid object
        }
      }
    }
  }

  return objects;
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

// MITRE ATT&CK specific types and functions
interface MitreTactic {
  name: string;
  description: string;
  techniques: string[];
}

interface MitreTechnique {
  name: string;
  description: string;
  tactics: string[];
  subTechniques?: string[];
  chainNext?: string[];
}

interface MitreSubTechnique {
  name: string;
  parent: string;
}

interface MitreAttackData {
  tactics: Record<string, MitreTactic>;
  techniques: Record<string, MitreTechnique>;
  subTechniques?: Record<string, MitreSubTechnique>;
}

interface AttackChain {
  techniques: Array<{
    tactic: string;
    technique: string;
    subTechnique?: string;
  }>;
  chainId: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
}

// Performance and caching improvements
let mitreDataCache: MitreAttackData | null = null;
const CACHE_EXPIRY_MS = 1000 * 60 * 60; // 1 hour
let cacheTimestamp = 0;

// Load MITRE ATT&CK data with caching
const loadMitreData = (): MitreAttackData | null => {
  const now = Date.now();

  // Return cached data if still valid
  if (mitreDataCache && now - cacheTimestamp < CACHE_EXPIRY_MS) {
    return mitreDataCache;
  }

  try {
    const filePath = path.resolve(
      process.cwd(),
      'src/mappings',
      'mitre_attack.json',
    );
    const content = readFileSync(filePath, 'utf8');
    mitreDataCache = JSON.parse(content) as MitreAttackData;
    cacheTimestamp = now;
    return mitreDataCache;
  } catch (error) {
    console.error('Failed to load MITRE ATT&CK data:', error);
    return null;
  }
};

// Generate an attack chain based on technique relationships
const generateAttackChain = (
  mitreData: MitreAttackData,
  maxLength = 3,
): AttackChain | null => {
  const config = getConfig();
  const enabledTactics = config.mitre?.tactics || ['TA0001', 'TA0002'];

  // Start with an initial access technique
  const initialTactics = enabledTactics.filter((id) => id === 'TA0001');
  if (initialTactics.length === 0) {
    return null;
  }

  const chain: Array<{
    tactic: string;
    technique: string;
    subTechnique?: string;
  }> = [];
  const usedTechniques = new Set<string>();

  // Select initial technique
  const initialTactic = initialTactics[0];
  const availableInitialTechniques =
    mitreData.tactics[initialTactic]?.techniques || [];

  if (availableInitialTechniques.length === 0) {
    return null;
  }

  let currentTechnique =
    availableInitialTechniques[
      Math.floor(Math.random() * availableInitialTechniques.length)
    ];

  // Build the chain
  for (let i = 0; i < maxLength; i++) {
    if (usedTechniques.has(currentTechnique)) {
      break; // Avoid cycles
    }

    const techniqueData = mitreData.techniques[currentTechnique];
    if (!techniqueData) {
      break;
    }

    // Select sub-technique if enabled and available
    let subTechnique: string | undefined;
    if (
      config.mitre?.includeSubTechniques &&
      techniqueData.subTechniques &&
      techniqueData.subTechniques.length > 0
    ) {
      subTechnique =
        techniqueData.subTechniques[
          Math.floor(Math.random() * techniqueData.subTechniques.length)
        ];
    }

    // Find the tactic for this technique
    const tacticForTechnique = techniqueData.tactics[0];

    chain.push({
      tactic: tacticForTechnique,
      technique: currentTechnique,
      subTechnique,
    });

    usedTechniques.add(currentTechnique);

    // Select next technique from chainNext if available
    if (techniqueData.chainNext && techniqueData.chainNext.length > 0) {
      const nextOptions = techniqueData.chainNext.filter(
        (next) => !usedTechniques.has(next) && mitreData.techniques[next],
      );

      if (nextOptions.length > 0) {
        currentTechnique =
          nextOptions[Math.floor(Math.random() * nextOptions.length)];
      } else {
        break; // No more valid next techniques
      }
    } else {
      break; // No chain continuation
    }
  }

  // Determine severity based on chain length and techniques
  let severity: 'low' | 'medium' | 'high' | 'critical' = 'low';
  if (chain.length >= 3) severity = 'high';
  else if (chain.length >= 2) severity = 'medium';

  // Check for critical techniques
  const criticalTechniques = ['T1055', 'T1078', 'T1027'];
  const hasCritical = chain.some((item) =>
    criticalTechniques.includes(item.technique),
  );
  if (hasCritical && chain.length >= 2) {
    severity = 'critical';
  }

  return {
    techniques: chain,
    chainId: `chain-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    severity,
  };
};

// Select random MITRE techniques with sub-technique support
const selectMitreTechniques = (
  mitreData: MitreAttackData,
  maxTechniques = 2,
): Array<{ tactic: string; technique: string; subTechnique?: string }> => {
  const config = getConfig();
  const enabledTactics = config.mitre?.tactics || ['TA0001', 'TA0002'];

  const selectedTechniques: Array<{
    tactic: string;
    technique: string;
    subTechnique?: string;
  }> = [];
  const availableTactics = enabledTactics.filter(
    (tacticId) => mitreData.tactics[tacticId],
  );

  if (availableTactics.length === 0) {
    return selectedTechniques;
  }

  const numTechniques = Math.min(maxTechniques, availableTactics.length);
  const shuffledTactics = [...availableTactics].sort(() => Math.random() - 0.5);

  for (let i = 0; i < numTechniques; i++) {
    const tacticId = shuffledTactics[i];
    const tactic = mitreData.tactics[tacticId];

    if (tactic.techniques.length > 0) {
      const randomTechniqueId =
        tactic.techniques[Math.floor(Math.random() * tactic.techniques.length)];

      // Select sub-technique if enabled
      let subTechnique: string | undefined;
      if (config.mitre?.includeSubTechniques) {
        const techniqueData = mitreData.techniques[randomTechniqueId];
        if (
          techniqueData?.subTechniques &&
          techniqueData.subTechniques.length > 0
        ) {
          subTechnique =
            techniqueData.subTechniques[
              Math.floor(Math.random() * techniqueData.subTechniques.length)
            ];
        }
      }

      selectedTechniques.push({
        tactic: tacticId,
        technique: randomTechniqueId,
        subTechnique,
      });
    }
  }

  return selectedTechniques;
};

// Generate MITRE-specific alert context for AI prompts with attack chain support
const createMitreContext = (
  selectedTechniques: Array<{
    tactic: string;
    technique: string;
    subTechnique?: string;
  }>,
  mitreData: MitreAttackData,
  attackChain?: AttackChain,
): string => {
  if (selectedTechniques.length === 0 && !attackChain) {
    return '';
  }

  let context = '\nMITRE ATT&CK Context:\n';

  if (attackChain) {
    context += `Attack Chain (${attackChain.severity} severity):\n`;
    attackChain.techniques.forEach((item, index) => {
      const tacticData = mitreData.tactics[item.tactic];
      const techniqueData = mitreData.techniques[item.technique];
      const subTechniqueData = item.subTechnique
        ? mitreData.subTechniques?.[item.subTechnique]
        : null;

      context += `${index + 1}. ${item.tactic} (${tacticData.name}) -> ${item.technique} (${techniqueData.name})`;
      if (subTechniqueData) {
        context += ` -> ${item.subTechnique} (${subTechniqueData.name})`;
      }
      context += ` - ${techniqueData.description}\n`;
    });
  } else {
    context += selectedTechniques
      .map(({ tactic, technique, subTechnique }) => {
        const tacticData = mitreData.tactics[tactic];
        const techniqueData = mitreData.techniques[technique];
        const subTechniqueData = subTechnique
          ? mitreData.subTechniques?.[subTechnique]
          : null;

        let desc = `- ${tactic} (${tacticData.name}): ${technique} (${techniqueData.name})`;
        if (subTechniqueData) {
          desc += ` -> ${subTechnique} (${subTechniqueData.name})`;
        }
        desc += ` - ${techniqueData.description}`;
        return desc;
      })
      .join('\n');
  }

  return context;
};

// Generate AI alert with MITRE ATT&CK integration and Phase 3 features
export const generateMITREAlert = async ({
  userName = 'user-1',
  hostName = 'host-1',
  space = 'default',
  examples = [],
}: {
  userName?: string;
  hostName?: string;
  space?: string;
  examples?: BaseCreateAlertsReturnType[];
}): Promise<BaseCreateAlertsReturnType> => {
  if (!openai) {
    initializeOpenAI();
  }

  if (!openai) {
    throw new Error('Failed to initialize OpenAI client');
  }

  // Load MITRE data with improved caching
  const mitreData = loadMitreData();
  if (!mitreData) {
    console.warn(
      'MITRE data not available, falling back to standard alert generation',
    );
    return generateAIAlert({
      userName,
      hostName,
      space,
      examples,
      alertType: 'general',
    });
  }

  const config = getConfig();
  const maxTechniques = config.mitre?.maxTechniquesPerAlert || 2;

  // Phase 3: Decide between attack chain or individual techniques
  let selectedTechniques: Array<{
    tactic: string;
    technique: string;
    subTechnique?: string;
  }> = [];
  let attackChain: AttackChain | null = null;
  let mitreContext = '';

  if (
    config.mitre?.enableAttackChains &&
    Math.random() < (config.mitre?.chainProbability || 0.15)
  ) {
    // Generate attack chain
    attackChain = generateAttackChain(
      mitreData,
      config.mitre?.maxChainLength || 3,
    );
    if (attackChain) {
      mitreContext = createMitreContext([], mitreData, attackChain);
      selectedTechniques = attackChain.techniques;
    }
  }

  // Fallback to individual technique selection if no chain was generated
  if (!attackChain) {
    selectedTechniques = selectMitreTechniques(mitreData, maxTechniques);
    mitreContext = createMitreContext(selectedTechniques, mitreData);
  }

  // Check cache first (include techniques and sub-techniques in cache key)
  const techniqueIds = selectedTechniques
    .map((t) =>
      t.subTechnique ? `${t.technique}.${t.subTechnique}` : t.technique,
    )
    .join('-');
  const chainId = attackChain ? attackChain.chainId : '';
  const cacheKey = `mitre-alert:${hostName}:${userName}:${space}:${techniqueIds}:${chainId}`;

  if (aiResponseCache.has(cacheKey)) {
    const cached = aiResponseCache.get(cacheKey);
    return cached?.data as BaseCreateAlertsReturnType;
  }

  // Load alert mapping schema
  const alertMappingSchema = loadMappingSchema('alertMappings.json', 800);

  // Enhanced system prompt with Phase 3 features
  const systemPrompt = `Security alert generator with advanced MITRE ATT&CK framework integration. Create JSON alert with:
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

MITRE ATT&CK fields (Phase 3 enhanced):
- threat.technique.id: technique ID(s) ${selectedTechniques.some((t) => t.subTechnique) ? 'and sub-technique IDs' : ''}
- threat.technique.name: technique name(s) ${selectedTechniques.some((t) => t.subTechnique) ? 'and sub-technique names' : ''}
- threat.tactic.id: tactic ID(s)
- threat.tactic.name: tactic name(s)
${attackChain ? `- threat.attack_chain.id: "${attackChain.chainId}"` : ''}
${attackChain ? `- threat.attack_chain.severity: "${attackChain.severity}"` : ''}

${mitreContext}

${
  attackChain
    ? `Generate a realistic multi-stage attack alert following the attack chain progression. Show evidence of each stage in the chain. Adjust severity to "${attackChain.severity}".`
    : 'Generate a realistic security alert based on the specified MITRE techniques.'
}

Include relevant technical fields: process, file, network, registry, user activity based on techniques.
Schema excerpt: ${alertMappingSchema.substring(0, 600)}`;

  try {
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
          content: `Generate a realistic security alert for host "${hostName}" and user "${userName}" based on the MITRE ATT&CK ${attackChain ? 'attack chain' : 'techniques'} provided.`,
        },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.8, // Higher for more varied scenarios
    });

    const generatedAlert = JSON.parse(
      response.choices[0].message.content || '{}',
    );

    // Create default template
    const defaultTemplate = createDefaultAlertTemplate(
      hostName,
      userName,
      space,
    );

    // Add Phase 3 MITRE-specific fields
    const mitreFields: Record<string, unknown> = {};
    if (selectedTechniques.length > 0) {
      const techniqueIds = selectedTechniques.map((t) => t.technique);
      const tacticIds = selectedTechniques.map((t) => t.tactic);

      // Enhanced technique fields with sub-techniques
      if (selectedTechniques.some((t) => t.subTechnique)) {
        const allTechniqueIds = selectedTechniques.map((t) =>
          t.subTechnique ? t.subTechnique : t.technique,
        );
        const allTechniqueNames = selectedTechniques.map((t) => {
          if (t.subTechnique && mitreData.subTechniques?.[t.subTechnique]) {
            return mitreData.subTechniques[t.subTechnique].name;
          }
          return mitreData.techniques[t.technique]?.name || t.technique;
        });

        mitreFields['threat.technique.id'] = allTechniqueIds;
        mitreFields['threat.technique.name'] = allTechniqueNames;
      } else {
        mitreFields['threat.technique.id'] = techniqueIds;
        mitreFields['threat.technique.name'] = techniqueIds.map(
          (id) => mitreData.techniques[id]?.name || id,
        );
      }

      mitreFields['threat.tactic.id'] = tacticIds;
      mitreFields['threat.tactic.name'] = tacticIds.map(
        (id) => mitreData.tactics[id]?.name || id,
      );

      // Attack chain specific fields
      if (attackChain) {
        mitreFields['threat.attack_chain.id'] = attackChain.chainId;
        mitreFields['threat.attack_chain.severity'] = attackChain.severity;
        mitreFields['threat.attack_chain.length'] =
          attackChain.techniques.length;
      }

      // Dynamic severity based on techniques and chains
      let severity = 'medium';
      let riskScore = 55;

      if (attackChain) {
        switch (attackChain.severity) {
          case 'critical':
            severity = 'critical';
            riskScore = 90;
            break;
          case 'high':
            severity = 'high';
            riskScore = 75;
            break;
          case 'medium':
            severity = 'medium';
            riskScore = 55;
            break;
          default:
            severity = 'low';
            riskScore = 35;
        }
      } else {
        // Individual technique risk assessment
        const dangerousTechniques = [
          'T1055',
          'T1078',
          'T1027',
          'T1134',
          'T1548',
        ];
        const hasDangerousTechnique = techniqueIds.some((id) =>
          dangerousTechniques.includes(id),
        );

        if (hasDangerousTechnique) {
          severity = 'high';
          riskScore = 75;
        } else if (selectedTechniques.length >= 2) {
          severity = 'medium';
          riskScore = 55;
        }
      }

      mitreFields['kibana.alert.severity'] = severity;
      mitreFields['kibana.alert.risk_score'] = riskScore;
    }

    // Merge all parts
    const mergedAlert = {
      ...defaultTemplate,
      ...generatedAlert,
      ...mitreFields,
      // Always ensure these specific fields
      'host.name': hostName,
      'user.name': userName,
      'kibana.space_ids': [space],
    };

    // Validate the alert
    const validatedAlert = validateAlert(
      mergedAlert,
      hostName,
      userName,
      space,
    );

    // Store in cache with performance considerations
    if (
      aiResponseCache.size >=
      (config.generation?.performance?.maxCacheSize || MAX_CACHE_SIZE)
    ) {
      const firstKey = aiResponseCache.keys().next().value;
      if (firstKey) {
        aiResponseCache.delete(firstKey);
      }
    }
    aiResponseCache.set(cacheKey, {
      data: validatedAlert,
      timestamp: Date.now(),
    });

    return validatedAlert as BaseCreateAlertsReturnType;
  } catch (error) {
    console.error('Error generating MITRE alert:', error);
    // Fallback to standard alert generation
    return generateAIAlert({
      userName,
      hostName,
      space,
      examples,
      alertType: 'mitre-fallback',
    });
  }
};

import { OpenAI } from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import { readFileSync } from 'fs';
import path from 'path';
import { faker } from '@faker-js/faker';

// Local imports
import { getConfig } from '../get_config';
import { generateTimestamp, TimestampConfig } from './timestamp_utils';
import {
  GenerateAIAlertParams,
  GenerateAIAlertBatchParams,
  GenerateMITREAlertParams,
  GenerateAIEventParams,
  SchemaProperty,
  ParsedSchema,
  AttackChain,
} from './ai_service_types';
import {
  aiResponseCache,
  generateAlertCacheKey,
  generateEventCacheKey,
  generateMitreCacheKey,
  startCacheMaintenance,
  stopCacheMaintenance,
} from './cache_service';
import {
  validateAndSanitizeAlert,
  sanitizeJSONResponse,
  validateBatchResponse,
} from './validation_service';
import {
  loadMitreData,
  generateAttackChain,
  selectMitreTechniques,
  createMitreContext,
  generateMitreFields,
} from './mitre_attack_service';
import {
  AIInitializationError,
  validateConfiguration,
  withRetry,
  handleAIError,
  safeJsonParse,
} from './error_handling';
import createAlerts from '../create_alerts';
import {
  generateAlertSystemPrompt,
  generateMitreAlertSystemPrompt,
  generateEventSystemPrompt,
  generateBatchAlertSystemPrompt,
  generateAlertUserPrompt,
  generateMitreAlertUserPrompt,
  generateEventUserPrompt,
  generateBatchAlertUserPrompt,
  JSON_RESPONSE_INSTRUCTION,
  ESSENTIAL_ALERT_FIELDS,
} from './prompt_templates';
import { parseThemeConfig, getThemeContext } from './theme_service';
import { BaseCreateAlertsReturnType } from '../create_alerts';
import { ChatCompletion } from 'openai/resources/index';
import type { Message } from '@anthropic-ai/sdk/resources/messages';

/**
 * Refactored AI Service for Security Documents Generation
 *
 * This service has been modularized for better maintainability:
 * - Types and interfaces extracted to ai_service_types.ts
 * - MITRE ATT&CK functionality in mitre_attack_service.ts
 * - Validation and sanitization in validation_service.ts
 * - Caching logic in cache_service.ts
 * - Error handling in error_handling.ts
 * - Prompt templates in prompt_templates.ts
 */

// Initialize AI clients
let openai: OpenAI | null = null;
let claude: Anthropic | null = null;

// Track if cache maintenance has been started
let cacheMaintenanceStarted = false;

// Function to ensure cache maintenance is running
const ensureCacheMaintenanceStarted = (): void => {
  if (!cacheMaintenanceStarted) {
    startCacheMaintenance();
    cacheMaintenanceStarted = true;
  }
};

// Function to initialize AI clients with proper error handling
const initializeAI = (): void => {
  try {
    const config = getConfig();
    validateConfiguration(config);

    // Initialize Claude if enabled
    if (config.useClaudeAI) {
      claude = new Anthropic({
        apiKey: config.claudeApiKey,
      });
      return; // Use Claude as primary
    }

    // Initialize OpenAI clients
    if (config.useAzureOpenAI) {
      if (!config.azureOpenAIEndpoint) {
        throw new AIInitializationError(
          'Azure OpenAI endpoint is required when useAzureOpenAI is true',
        );
      }

      openai = new OpenAI({
        apiKey: config.azureOpenAIApiKey,
        baseURL: `${config.azureOpenAIEndpoint.replace(/\/$/, '')}/openai/deployments/${config.azureOpenAIDeployment}`,
        defaultQuery: {
          'api-version': config.azureOpenAIApiVersion || '2024-08-01-preview',
        },
        defaultHeaders: {
          'api-key': config.azureOpenAIApiKey,
          'Content-Type': 'application/json',
        },
      });
    } else {
      // Standard OpenAI
      openai = new OpenAI({
        apiKey: config.openaiApiKey,
      });
    }
  } catch (error) {
    throw new AIInitializationError('Failed to initialize AI client', {
      originalError: error instanceof Error ? error.message : String(error),
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
      const parsed = safeJsonParse<ParsedSchema>(content, 'Schema parsing');
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

  ESSENTIAL_ALERT_FIELDS.forEach((key) => {
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
  timestampConfig?: TimestampConfig,
): Record<string, unknown> => {
  const timestamp = generateTimestamp(timestampConfig);
  const ruleUuid = faker.string.uuid();

  return {
    'host.name': hostName,
    'user.name': userName,
    'kibana.alert.uuid': faker.string.uuid(),
    'kibana.alert.rule.name': 'Security Alert Detection',
    'kibana.alert.rule.description': 'Automated security alert detection',
    'kibana.alert.start': timestamp,
    'kibana.alert.last_detected': timestamp,
    'kibana.version': '8.7.0',
    'kibana.space_ids': [space],
    '@timestamp': timestamp,
    'event.kind': 'signal',
    'event.category': ['security'],
    'event.action': 'alert_generated',
    'kibana.alert.status': 'active',
    'kibana.alert.workflow_status': 'open',
    'kibana.alert.depth': 1,
    'kibana.alert.severity': 'medium',
    'kibana.alert.risk_score': 47,
    'rule.name': 'Security Alert Detection',
    // Essential Kibana Security fields for proper alert display
    'kibana.alert.rule.category': 'Custom Query Rule',
    'kibana.alert.rule.consumer': 'siem',
    'kibana.alert.rule.execution.uuid': faker.string.uuid(),
    'kibana.alert.rule.producer': 'siem',
    'kibana.alert.rule.rule_type_id': 'siem.queryRule',
    'kibana.alert.rule.uuid': ruleUuid,
    'kibana.alert.rule.tags': [],
    'kibana.alert.original_time': timestamp,
    'kibana.alert.ancestors': [
      {
        id: faker.string.alphanumeric(20),
        type: 'event',
        index: 'security-alerts',
        depth: 0,
      },
    ],
    'kibana.alert.reason': `event on ${hostName} created security alert`,
    'kibana.alert.rule.actions': [],
    'kibana.alert.rule.author': [],
    'kibana.alert.rule.created_at': timestamp,
    'kibana.alert.rule.created_by': 'elastic',
    'kibana.alert.rule.enabled': true,
    'kibana.alert.rule.exceptions_list': [],
    'kibana.alert.rule.false_positives': [],
    'kibana.alert.rule.from': 'now-360s',
    'kibana.alert.rule.immutable': false,
    'kibana.alert.rule.interval': '5m',
    'kibana.alert.rule.indices': ['security*'],
    'kibana.alert.rule.license': '',
    'kibana.alert.rule.max_signals': 100,
    'kibana.alert.rule.references': [],
    'kibana.alert.rule.risk_score_mapping': [],
    'kibana.alert.rule.rule_id': faker.string.uuid(),
    'kibana.alert.rule.severity_mapping': [],
    'kibana.alert.rule.threat': [],
    'kibana.alert.rule.to': 'now',
    'kibana.alert.rule.type': 'query',
    'kibana.alert.rule.updated_at': timestamp,
    'kibana.alert.rule.updated_by': 'elastic',
    'kibana.alert.rule.version': 1,
    'kibana.alert.rule.risk_score': 47,
    'kibana.alert.rule.severity': 'medium',
    'kibana.alert.rule.parameters': {
      description: 'Automated security alert detection',
      risk_score: 47,
      severity: 'medium',
      license: '',
      author: [],
      false_positives: [],
      from: 'now-360s',
      rule_id: faker.string.uuid(),
      max_signals: 100,
      risk_score_mapping: [],
      severity_mapping: [],
      threat: [],
      to: 'now',
      references: [],
      version: 1,
      exceptions_list: [],
      immutable: false,
      related_integrations: [],
      required_fields: [],
      setup: '',
      type: 'query',
      language: 'kuery',
      index: ['security*'],
      query: '*',
      filters: [],
    },
  };
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
export const generateAIAlert = async (
  params: GenerateAIAlertParams,
): Promise<BaseCreateAlertsReturnType> => {
  const {
    userName = 'user-1',
    hostName = 'host-1',
    space = 'default',
    examples = [],
    alertType = 'general',
    timestampConfig,
    mitreEnabled = false,
    attackChain,
    theme,
  } = params;

  return withRetry(
    async () => {
      if (!openai && !claude) {
        initializeAI();
      }

      if (!openai && !claude) {
        throw new AIInitializationError('Failed to initialize AI client');
      }

      // Ensure cache maintenance is running
      ensureCacheMaintenanceStarted();

      // Check cache first
      const cacheKey = generateAlertCacheKey(
        hostName,
        userName,
        space,
        alertType,
      );
      const cached = aiResponseCache.get(cacheKey);
      if (cached) {
        return cached.data as BaseCreateAlertsReturnType;
      }

      // Load alert mapping schema - optimized
      const alertMappingSchema = loadMappingSchema('alertMappings.json');

      // Process examples for context - optimized
      const examplesContext = processExamples(examples);

      // Parse theme configuration and generate theme context
      let themeContext = '';
      if (theme) {
        const themeConfig = parseThemeConfig(theme);
        themeContext = getThemeContext(themeConfig);
      }

      // Create system prompt with optional attack chain context
      let systemPrompt: string;

      if (mitreEnabled && attackChain) {
        // Generate sophisticated MITRE prompt with attack chain correlation
        const mitreContext = attackChain
          ? `
CAMPAIGN CORRELATION CONTEXT:
- Campaign ID: ${attackChain.campaignId}
- Stage: ${attackChain.stageName} (${attackChain.stageIndex}/${attackChain.totalStages})
- Threat Actor: ${attackChain.threatActor}
- Parent Events: ${attackChain.parentEvents.length} previous events in chain
- Stage ID: ${attackChain.stageId}

Generate an alert that shows CLEAR CORRELATION to this attack campaign stage. Include campaign correlation fields and ensure the alert fits the attack progression context.
        `
          : '';

        systemPrompt = generateMitreAlertSystemPrompt({
          hostName,
          userName,
          space,
          mitreContext,
          schemaExcerpt: alertMappingSchema.substring(0, 800),
          attackChain: true,
          chainSeverity: 'high',
          themeContext,
        });
      } else if (mitreEnabled) {
        systemPrompt = generateMitreAlertSystemPrompt({
          hostName,
          userName,
          space,
          schemaExcerpt: alertMappingSchema.substring(0, 800),
          themeContext,
        });
      } else {
        systemPrompt = generateAlertSystemPrompt({
          hostName,
          userName,
          space,
          alertType,
          schemaExcerpt: alertMappingSchema.substring(0, 800),
          themeContext,
        });
      }

      const userPrompt = generateAlertUserPrompt({
        hostName,
        userName,
        examples: examples.length > 0 ? examplesContext : undefined,
      });

      try {
        const config = getConfig();
        let generatedAlert: Record<string, unknown> = {};

        if (claude) {
          // Use Claude API
          const response = await claude.messages.create({
            model: config.claudeModel || 'claude-3-5-sonnet-20241022',
            max_tokens: 2000,
            messages: [
              {
                role: 'user',
                content: `${systemPrompt}\n\n${userPrompt}\n\n${JSON_RESPONSE_INSTRUCTION}`,
              },
            ],
            temperature: 0.7,
          });

          const content = response.content[0];
          if (content.type === 'text') {
            generatedAlert = safeJsonParse(
              content.text || '{}',
              'Claude response parsing',
            );
          }
        } else if (openai) {
          // Use OpenAI API
          const modelName =
            config.useAzureOpenAI && config.azureOpenAIDeployment
              ? config.azureOpenAIDeployment
              : 'gpt-4o';

          const response = await openai.chat.completions.create({
            model: modelName,
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: userPrompt },
            ],
            response_format: { type: 'json_object' },
            temperature: 0.7,
          });

          generatedAlert = safeJsonParse(
            response.choices[0].message.content || '{}',
            'OpenAI response parsing',
          );
        }

        // Create a default template with required fields
        const defaultTemplate = createDefaultAlertTemplate(
          hostName,
          userName,
          space,
          timestampConfig,
        );

        // Merge the generated alert with the default template to ensure required fields
        const mergedAlert = {
          ...defaultTemplate,
          ...generatedAlert,
          // Always ensure these specific fields (override AI if needed)
          'host.name': hostName,
          'user.name': userName,
          'kibana.space_ids': [space],
          'kibana.alert.uuid':
            generatedAlert['kibana.alert.uuid'] ||
            defaultTemplate['kibana.alert.uuid'],
          // Ensure template timestamps are preserved (don't let AI override)
          '@timestamp': defaultTemplate['@timestamp'],
          'kibana.alert.start': defaultTemplate['kibana.alert.start'],
          'kibana.alert.last_detected':
            defaultTemplate['kibana.alert.last_detected'],
          'kibana.alert.original_time':
            defaultTemplate['kibana.alert.original_time'],
          'kibana.alert.rule.created_at':
            defaultTemplate['kibana.alert.rule.created_at'],
          'kibana.alert.rule.updated_at':
            defaultTemplate['kibana.alert.rule.updated_at'],
        };

        // Validate and sanitize the alert
        const validatedAlert = validateAndSanitizeAlert(
          mergedAlert,
          hostName,
          userName,
          space,
          timestampConfig,
        );

        // Store in cache
        aiResponseCache.set(cacheKey, {
          data: validatedAlert,
          timestamp: Date.now(),
        });

        return validatedAlert;
      } catch (error) {
        handleAIError(error, 'Error generating AI alert');
        // Fallback to default template if AI generation fails
        return createDefaultAlertTemplate(
          hostName,
          userName,
          space,
          timestampConfig,
        ) as BaseCreateAlertsReturnType;
      }
    },
    3,
    1000,
    'generateAIAlert',
  );
};

// Generate an event using AI based on mapping schema
export const generateAIEvent = async (
  params: GenerateAIEventParams = {},
): Promise<Record<string, unknown>> => {
  const { id_field, id_value } = params;

  return withRetry(
    async () => {
      if (!openai && !claude) {
        initializeAI();
      }

      if (!openai && !claude) {
        throw new AIInitializationError('Failed to initialize AI client');
      }

      // Check cache first
      const cacheKey = generateEventCacheKey(id_field, id_value);
      const cached = aiResponseCache.get(cacheKey);
      if (cached) {
        return cached.data as Record<string, unknown>;
      }

      // Load event mapping schema - optimized
      const eventMappingSchema = loadMappingSchema('eventMappings.json', 800);

      // Create system prompt
      const systemPrompt = generateEventSystemPrompt({
        idField: id_field,
        idValue: id_value,
        schemaExcerpt: eventMappingSchema,
      });

      const userPrompt = generateEventUserPrompt();

      try {
        const config = getConfig();
        let generatedEvent: Record<string, unknown> = {};

        if (claude) {
          // Use Claude API
          const response = await claude.messages.create({
            model: config.claudeModel || 'claude-3-5-sonnet-20241022',
            max_tokens: 2000,
            messages: [
              {
                role: 'user',
                content: `${systemPrompt}\n\n${userPrompt}\n\n${JSON_RESPONSE_INSTRUCTION}`,
              },
            ],
            temperature: 0.7,
          });

          const content = response.content[0];
          if (content.type === 'text') {
            generatedEvent = safeJsonParse(
              content.text || '{}',
              'Claude event response parsing',
            );
          }
        } else if (openai) {
          // Use OpenAI API
          const modelName =
            config.useAzureOpenAI && config.azureOpenAIDeployment
              ? config.azureOpenAIDeployment
              : 'gpt-4o';

          const response = await openai.chat.completions.create({
            model: modelName,
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: userPrompt },
            ],
            response_format: { type: 'json_object' },
            temperature: 0.7,
          });

          generatedEvent = safeJsonParse(
            response.choices[0].message.content || '{}',
            'OpenAI event response parsing',
          );
        }

        // Ensure timestamp is present
        if (!generatedEvent['@timestamp']) {
          generatedEvent['@timestamp'] = new Date().toISOString();
        }

        // Add any override values
        const finalEvent = {
          ...generatedEvent,
          ...(id_field && id_value ? { [id_field]: id_value } : {}),
        };

        // Store in cache
        aiResponseCache.set(cacheKey, {
          data: finalEvent,
          timestamp: Date.now(),
        });

        return finalEvent;
      } catch (error) {
        handleAIError(error, 'Error generating AI event');
        // Fallback to basic event structure
        return {
          '@timestamp': new Date().toISOString(),
          ...(id_field && id_value ? { [id_field]: id_value } : {}),
        };
      }
    },
    3,
    1000,
    'generateAIEvent',
  );
};

// Generate multiple alerts in a batch to reduce API calls
export const generateAIAlertBatch = async (
  params: GenerateAIAlertBatchParams,
): Promise<BaseCreateAlertsReturnType[]> => {
  const {
    entities = [],
    space = 'default',
    examples = [],
    batchSize = 5,
    timestampConfig,
    theme,
  } = params;

  if (entities.length === 0) {
    return [];
  }

  return withRetry(
    async () => {
      if (!openai && !claude) {
        initializeAI();
      }

      if (!openai && !claude) {
        throw new AIInitializationError('Failed to initialize AI client');
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
          const systemPrompt = generateBatchAlertSystemPrompt({
            batchSize: batch.length,
            space,
            schemaExcerpt: alertMappingSchema,
          });

          const userPrompt = generateBatchAlertUserPrompt({
            batchSize: batch.length,
            entities: batch,
            examples: examples.length > 0 ? examplesContext : undefined,
          });

          const config = getConfig();
          let response: ChatCompletion | Message | undefined;

          if (claude) {
            // Use Claude API
            response = await claude.messages.create({
              model: config.claudeModel || 'claude-3-5-sonnet-20241022',
              max_tokens: 4000,
              messages: [
                {
                  role: 'user',
                  content: `${systemPrompt}\n\n${userPrompt}\n\n${JSON_RESPONSE_INSTRUCTION}`,
                },
              ],
              temperature: 0.7,
            });
          } else if (openai) {
            // Use OpenAI API
            const modelName =
              config.useAzureOpenAI && config.azureOpenAIDeployment
                ? config.azureOpenAIDeployment
                : 'gpt-4o';

            response = await openai.chat.completions.create({
              model: modelName,
              messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt },
              ],
              response_format: { type: 'json_object' },
              temperature: 0.7,
            });
          }

          let generatedAlerts = [];
          try {
            let rawContent = '[]';
            if (
              claude &&
              response &&
              'content' in response &&
              response.content &&
              response.content[0]
            ) {
              rawContent =
                response.content[0].type === 'text'
                  ? response.content[0].text || '[]'
                  : '[]';
            } else if (
              openai &&
              response &&
              'choices' in response &&
              response.choices &&
              response.choices[0]
            ) {
              rawContent = response.choices[0].message.content || '[]';
            }

            // Debug logging for AI responses (always enabled for debugging)
            console.log(
              `🔍 AI Raw Response (first 500 chars): ${rawContent.substring(0, 500)}...`,
            );

            // Clean and validate the JSON content
            const cleanedContent = sanitizeJSONResponse(rawContent);
            console.log(
              `🧹 Cleaned Content: ${cleanedContent.substring(0, 300)}...`,
            );

            const content = safeJsonParse(
              cleanedContent,
              'Batch response parsing',
            );

            // Debug logging for parsed content
            console.log(
              `📊 Parsed Content Type: ${typeof content}, Array: ${Array.isArray(content)}`,
            );
            console.log(
              `🔑 Content Keys: ${content && typeof content === 'object' ? Object.keys(content) : 'N/A'}`,
            );

            if (content && typeof content === 'object') {
              console.log(
                '🏗️ Content structure:',
                JSON.stringify(content, null, 2).substring(0, 1000),
              );
            }

            // Enhanced response format handling
            if (Array.isArray(content)) {
              console.log(
                `✅ Direct array response found with ${content.length} items`,
              );
              generatedAlerts = content;
            } else if (content && typeof content === 'object') {
              const contentObj = content as Record<string, unknown>;
              console.log(
                `🔍 Object response detected, checking for array properties...`,
              );

              // Priority order for common response patterns
              const possibleArrayKeys = [
                'alerts',
                'alert',
                'data',
                'kibana.alerts',
                'response',
                'results',
              ];
              let foundArray = false;

              for (const key of possibleArrayKeys) {
                if (contentObj[key] && Array.isArray(contentObj[key])) {
                  console.log(
                    `✅ Found array in property '${key}' with ${(contentObj[key] as unknown[]).length} items`,
                  );
                  generatedAlerts = contentObj[key] as unknown[];
                  foundArray = true;
                  break;
                }
              }

              if (!foundArray) {
                // Check for any array property in the object
                const arrayKeys = Object.keys(contentObj).filter((key) =>
                  Array.isArray(contentObj[key]),
                );

                if (arrayKeys.length > 0) {
                  console.log(
                    `✅ Found array in property '${arrayKeys[0]}' with ${(contentObj[arrayKeys[0]] as unknown[]).length} items`,
                  );
                  generatedAlerts = contentObj[arrayKeys[0]] as unknown[];
                } else {
                  console.log(
                    `⚠️ No array found, treating as single object response`,
                  );
                  // Single object response - replicate it for each entity if we need multiple
                  if (batch.length > 1) {
                    console.log(
                      `🔄 Replicating single object for ${batch.length} entities`,
                    );
                    generatedAlerts = batch.map(() => ({ ...content }));
                  } else {
                    generatedAlerts = [content];
                  }
                }
              }
            } else {
              console.warn(
                `❌ AI response format not recognized (type: ${typeof content}), falling back to individual generation`,
              );
              generatedAlerts = [];
            }

            console.log(
              `📊 Extracted ${generatedAlerts.length} alerts from AI response`,
            );

            // Validate batch response
            generatedAlerts = validateBatchResponse(
              generatedAlerts,
              batch.length,
            );

            // If we still have no valid alerts after validation, fall back to individual generation
            if (
              generatedAlerts.length === 0 ||
              generatedAlerts.every((alert) => Object.keys(alert).length === 0)
            ) {
              console.warn(
                'Batch generation failed, falling back to individual AI generation',
              );
              generatedAlerts = [];

              // Generate alerts individually as fallback
              for (const entity of batch) {
                try {
                  const individualAlert = await generateAIAlert({
                    hostName: entity.hostName,
                    userName: entity.userName,
                    space,
                    examples,
                    timestampConfig,
                    theme: theme,
                  });
                  generatedAlerts.push(individualAlert);
                  // eslint-disable-next-line @typescript-eslint/no-unused-vars
                } catch (individualError) {
                  console.warn(
                    `Individual alert generation failed for ${entity.hostName}:${entity.userName}, using template`,
                  );
                  // Use template as final fallback
                  const templateAlert = createAlerts(
                    {},
                    {
                      hostName: entity.hostName,
                      userName: entity.userName,
                      space,
                      timestampConfig,
                    },
                  );
                  generatedAlerts.push(templateAlert);
                }
              }
            }
          } catch (e) {
            console.error('Error parsing batch response:', e);
            console.warn(
              'Falling back to individual generation due to batch error',
            );

            // Fallback: Generate individually for each entity
            generatedAlerts = [];
            for (const entity of batch) {
              try {
                const individualAlert = await generateAIAlert({
                  hostName: entity.hostName,
                  userName: entity.userName,
                  space,
                  examples,
                  timestampConfig,
                  theme: theme,
                });
                generatedAlerts.push(individualAlert);
                // eslint-disable-next-line @typescript-eslint/no-unused-vars
              } catch (individualError) {
                console.warn(
                  `Individual alert generation failed for ${entity.hostName}:${entity.userName}, using template`,
                );
                // Use template as final fallback
                const templateAlert = createAlerts(
                  {},
                  {
                    hostName: entity.hostName,
                    userName: entity.userName,
                    space,
                    timestampConfig,
                  },
                );
                generatedAlerts.push(templateAlert);
              }
            }
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
              timestampConfig,
            );

            // Merge and validate
            const mergedAlert = {
              ...defaultTemplate,
              ...generatedAlert,
              'host.name': entity.hostName,
              'user.name': entity.userName,
              'kibana.space_ids': [space],
              'kibana.alert.uuid':
                (generatedAlert as Record<string, unknown>)[
                  'kibana.alert.uuid'
                ] || defaultTemplate['kibana.alert.uuid'],
              // Preserve template timestamps
              '@timestamp': defaultTemplate['@timestamp'],
              'kibana.alert.start': defaultTemplate['kibana.alert.start'],
              'kibana.alert.last_detected':
                defaultTemplate['kibana.alert.last_detected'],
              'kibana.alert.original_time':
                defaultTemplate['kibana.alert.original_time'],
              'kibana.alert.rule.created_at':
                defaultTemplate['kibana.alert.rule.created_at'],
              'kibana.alert.rule.updated_at':
                defaultTemplate['kibana.alert.rule.updated_at'],
            };

            const validatedAlert = validateAndSanitizeAlert(
              mergedAlert,
              entity.hostName,
              entity.userName,
              space,
              timestampConfig,
            );

            results.push(validatedAlert);

            // Store in cache
            const cacheKey = generateAlertCacheKey(
              entity.hostName,
              entity.userName,
              space,
              'general',
            );
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
                timestampConfig,
              });
              results.push(alert);
            } catch (e) {
              console.error('Error in fallback generation:', e);
              // Use default template as last resort
              const defaultAlert = createDefaultAlertTemplate(
                entity.hostName,
                entity.userName,
                space,
                timestampConfig,
              );
              results.push(defaultAlert as BaseCreateAlertsReturnType);
            }
          }
        }
      }

      return results;
    },
    2,
    2000,
    'generateAIAlertBatch',
  );
};

// Generate AI alert with MITRE ATT&CK integration
export const generateMITREAlert = async (
  params: GenerateMITREAlertParams,
): Promise<BaseCreateAlertsReturnType> => {
  const {
    userName = 'user-1',
    hostName = 'host-1',
    space = 'default',
    examples = [],
    timestampConfig,
    theme,
  } = params;

  return withRetry(
    async () => {
      if (!openai && !claude) {
        initializeAI();
      }

      if (!openai && !claude) {
        throw new AIInitializationError('Failed to initialize AI client');
      }

      // Load MITRE data
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
          timestampConfig,
          theme,
        });
      }

      const config = getConfig();
      const maxTechniques = config.mitre?.maxTechniquesPerAlert || 2;

      // Parse theme configuration and generate theme context
      let themeContext = '';
      if (theme) {
        const themeConfig = parseThemeConfig(theme);
        themeContext = getThemeContext(themeConfig);
      }

      // Decide between attack chain or individual techniques
      let selectedTechniques: Array<{
        tactic: string;
        technique: string;
        subTechnique?: string;
      }> = [];
      let attackChain: AttackChain | undefined = undefined;
      let mitreContext = '';

      if (
        config.mitre?.enableAttackChains &&
        Math.random() < (config.mitre?.chainProbability || 0.15)
      ) {
        // Generate attack chain
        attackChain =
          generateAttackChain(mitreData, config.mitre?.maxChainLength || 3) ||
          undefined;
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

      // Check cache first
      const techniqueIds = selectedTechniques
        .map((t) =>
          t.subTechnique ? `${t.technique}.${t.subTechnique}` : t.technique,
        )
        .join('-');
      const chainId = attackChain ? attackChain.chainId : '';
      const cacheKey = generateMitreCacheKey(
        hostName,
        userName,
        space,
        techniqueIds,
        chainId,
      );

      const cached = aiResponseCache.get(cacheKey);
      if (cached) {
        return cached.data as BaseCreateAlertsReturnType;
      }

      // Load alert mapping schema
      const alertMappingSchema = loadMappingSchema('alertMappings.json', 800);

      // Create system prompt
      const systemPrompt = generateMitreAlertSystemPrompt({
        hostName,
        userName,
        space,
        mitreContext,
        schemaExcerpt: alertMappingSchema.substring(0, 600),
        attackChain: !!attackChain,
        chainSeverity: attackChain?.severity,
        themeContext,
      });

      const userPrompt = generateMitreAlertUserPrompt({
        hostName,
        userName,
        attackChain: !!attackChain,
      });

      try {
        let generatedAlert: Record<string, unknown> = {};

        if (claude) {
          // Use Claude API
          const response = await claude.messages.create({
            model: config.claudeModel || 'claude-3-5-sonnet-20241022',
            max_tokens: 2000,
            messages: [
              {
                role: 'user',
                content: `${systemPrompt}\n\n${userPrompt}\n\n${JSON_RESPONSE_INSTRUCTION}`,
              },
            ],
            temperature: 0.8,
          });

          const content = response.content[0];
          if (content.type === 'text') {
            generatedAlert = safeJsonParse(
              content.text || '{}',
              'Claude MITRE response parsing',
            );
          }
        } else if (openai) {
          // Use OpenAI API
          const modelName =
            config.useAzureOpenAI && config.azureOpenAIDeployment
              ? config.azureOpenAIDeployment
              : 'gpt-4o';

          const response = await openai.chat.completions.create({
            model: modelName,
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: userPrompt },
            ],
            response_format: { type: 'json_object' },
            temperature: 0.8,
          });

          generatedAlert = safeJsonParse(
            response.choices[0].message.content || '{}',
            'OpenAI MITRE response parsing',
          );
        }

        // Create default template
        const defaultTemplate = createDefaultAlertTemplate(
          hostName,
          userName,
          space,
          timestampConfig,
        );

        // Generate MITRE-specific fields
        const mitreFields = generateMitreFields(
          selectedTechniques,
          mitreData,
          attackChain,
        );

        // Merge all parts
        const mergedAlert = {
          ...defaultTemplate,
          ...generatedAlert,
          ...mitreFields,
          // Always ensure these specific fields
          'host.name': hostName,
          'user.name': userName,
          'kibana.space_ids': [space],
          // Preserve template timestamps (don't let AI override)
          '@timestamp': defaultTemplate['@timestamp'],
          'kibana.alert.start': defaultTemplate['kibana.alert.start'],
          'kibana.alert.last_detected':
            defaultTemplate['kibana.alert.last_detected'],
          'kibana.alert.original_time':
            defaultTemplate['kibana.alert.original_time'],
          'kibana.alert.rule.created_at':
            defaultTemplate['kibana.alert.rule.created_at'],
          'kibana.alert.rule.updated_at':
            defaultTemplate['kibana.alert.rule.updated_at'],
        };

        // Validate the alert
        const validatedAlert = validateAndSanitizeAlert(
          mergedAlert,
          hostName,
          userName,
          space,
          timestampConfig,
        );

        // Store in cache
        aiResponseCache.set(cacheKey, {
          data: validatedAlert,
          timestamp: Date.now(),
        });

        return validatedAlert;
      } catch (error) {
        console.error('Error generating MITRE alert:', error);
        // Fallback to standard alert generation
        return generateAIAlert({
          userName,
          hostName,
          space,
          examples,
          alertType: 'mitre-fallback',
          timestampConfig,
          theme,
        });
      }
    },
    3,
    1000,
    'generateMITREAlert',
  );
};

// Function to extract schema structure from mapping (kept for compatibility)
export const extractSchemaFromMapping = (
  mappingJson: string,
): Record<string, unknown> => {
  try {
    const mapping = safeJsonParse(mappingJson, 'Schema mapping parsing');
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

    const mappingObj = mapping as Record<string, unknown>;
    if (mappingObj.properties) {
      extractProperties(
        mappingObj.properties as Record<string, Record<string, unknown>>,
      );
    }

    return schemaStructure;
  } catch (error) {
    console.error('Error extracting schema from mapping:', error);
    return {};
  }
};

// Generate multiple realistic detection rule names in a single AI call
export const generateRealisticRuleNamesBatch = async (
  rules: Array<{
    ruleType: string;
    ruleQuery: string;
    severity: string;
    category: string;
  }>,
): Promise<Array<{ name: string; description: string }>> => {
  const config = getConfig();

  // Create fallback function for when AI is not available
  const generateFallbackRuleNames = () => {
    const ruleTypeNames = {
      query: 'Suspicious Activity Detection',
      threshold: 'Multiple Failed Attempts',
      eql: 'Attack Sequence Detection',
      machine_learning: 'Anomaly Detection',
      threat_match: 'Threat Intelligence Match',
      new_terms: 'New Entity Detection',
      esql: 'Advanced Analytics Rule',
    };

    return rules.map((rule, _index) => {
      const baseName =
        ruleTypeNames[rule.ruleType as keyof typeof ruleTypeNames] ||
        'Security Detection';
      const identifier = faker.string.alphanumeric(6);

      return {
        name: `${baseName} - ${identifier}`,
        description: `${rule.ruleType} rule that detects ${faker.helpers.arrayElement(['suspicious', 'malicious', 'anomalous', 'unusual'])} activity`,
      };
    });
  };

  // If AI is not configured, return fallback
  if (!config.useAI) {
    return generateFallbackRuleNames();
  }

  try {
    const rulesContext = rules
      .map(
        (rule, index) =>
          `${index + 1}. Type: ${rule.ruleType}, Query: ${rule.ruleQuery}, Severity: ${rule.severity}, Category: ${rule.category}`,
      )
      .join('\n');

    const prompt = `Generate realistic detection rule names and descriptions for ${rules.length} cybersecurity SIEM rules.

Rules to generate:
${rulesContext}

Requirements:
1. Each rule name should be professional and descriptive (max 80 characters)
2. Each description should explain what the rule detects (max 200 characters)
3. Use standard cybersecurity terminology
4. Make them sound like real SOC detection rules
5. Include relevant technical details based on each query

Examples of good rule names:
- "Windows Command Shell Execution with Suspicious Arguments"
- "Multiple Authentication Failures from Single Source"
- "Lateral Movement via WMI Command Execution"
- "Suspicious PowerShell Script Block Logging"

Return ONLY a JSON array with objects containing 'name' and 'description' fields, in the same order as the input rules:`;

    if (config.useClaudeAI && config.claudeApiKey) {
      const anthropic = new Anthropic({ apiKey: config.claudeApiKey });

      const response = await anthropic.messages.create({
        model: config.claudeModel || 'claude-3-5-sonnet-20241022',
        max_tokens: Math.min(4000, rules.length * 150),
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
      });

      const content = response.content[0];
      if (content.type === 'text') {
        const rawText = content.text.trim();

        // Try to extract JSON array from the response
        let jsonStr = rawText;

        // Look for JSON array in the response
        const jsonMatch = rawText.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
          jsonStr = jsonMatch[0];
        }

        // Clean up common AI response issues
        jsonStr = jsonStr
          .replace(/```json\n?/, '')
          .replace(/\n?```/, '')
          .replace(/^\s*\[/, '[')
          .replace(/\]\s*$/, ']');

        const result = safeJsonParse(jsonStr, 'Batch rule name generation');
        if (Array.isArray(result) && result.length === rules.length) {
          return result.map((item) => ({
            name: (item.name || '').substring(0, 80),
            description: (item.description || '').substring(0, 200),
          }));
        }
      }
    } else if (
      config.openaiApiKey ||
      (config.useAzureOpenAI && config.azureOpenAIApiKey)
    ) {
      const openai = new OpenAI(
        config.useAzureOpenAI
          ? {
              apiKey: config.azureOpenAIApiKey,
              baseURL: `${config.azureOpenAIEndpoint}/openai/deployments/${config.azureOpenAIDeployment}`,
              defaultQuery: { 'api-version': config.azureOpenAIApiVersion },
              defaultHeaders: { 'api-key': config.azureOpenAIApiKey },
            }
          : { apiKey: config.openaiApiKey },
      );

      const response = await openai.chat.completions.create({
        model: config.useAzureOpenAI
          ? config.azureOpenAIDeployment || 'gpt-4'
          : 'gpt-4',
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
        max_tokens: Math.min(4000, rules.length * 150),
        temperature: 0.7,
      });

      const content = response.choices[0]?.message?.content;
      if (content) {
        const rawText = content.trim();

        // Try to extract JSON array from the response
        let jsonStr = rawText;

        // Look for JSON array in the response
        const jsonMatch = rawText.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
          jsonStr = jsonMatch[0];
        }

        // Clean up common AI response issues
        jsonStr = jsonStr
          .replace(/```json\n?/, '')
          .replace(/\n?```/, '')
          .replace(/^\s*\[/, '[')
          .replace(/\]\s*$/, ']');

        const result = safeJsonParse(jsonStr, 'Batch rule name generation');
        if (Array.isArray(result) && result.length === rules.length) {
          return result.map((item) => ({
            name: (item.name || '').substring(0, 80),
            description: (item.description || '').substring(0, 200),
          }));
        }
      }
    }
  } catch (error) {
    console.warn(
      'Failed to generate batch AI rule names, using fallbacks:',
      error instanceof Error ? error.message : 'Unknown error',
    );
  }

  // Fallback if AI fails
  return generateFallbackRuleNames();
};

// Generate realistic detection rule names and descriptions using AI
export const generateRealisticRuleName = async (
  ruleType: string,
  ruleQuery: string,
  options: {
    severity?: string;
    category?: string;
    technique?: string;
  } = {},
): Promise<{ name: string; description: string }> => {
  const config = getConfig();

  // Create a fallback function for when AI is not available
  const generateFallbackRuleName = () => {
    const ruleTypeNames = {
      query: 'Suspicious Activity Detection',
      threshold: 'Multiple Failed Attempts',
      eql: 'Attack Sequence Detection',
      machine_learning: 'Anomaly Detection',
      threat_match: 'Threat Intelligence Match',
      new_terms: 'New Entity Detection',
      esql: 'Advanced Analytics Rule',
    };

    const baseName =
      ruleTypeNames[ruleType as keyof typeof ruleTypeNames] ||
      'Security Detection';
    const identifier = faker.string.alphanumeric(6);

    return {
      name: `${baseName} - ${identifier}`,
      description: `${ruleType} rule that detects ${faker.helpers.arrayElement(['suspicious', 'malicious', 'anomalous', 'unusual'])} activity`,
    };
  };

  // If AI is not configured, return fallback
  if (!config.useAI) {
    return generateFallbackRuleName();
  }

  try {
    const prompt = `Generate a realistic detection rule name and description for a cybersecurity SIEM system.

Rule Details:
- Type: ${ruleType}
- Query: ${ruleQuery}
- Severity: ${options.severity || 'medium'}
${options.technique ? `- MITRE Technique: ${options.technique}` : ''}
${options.category ? `- Category: ${options.category}` : ''}

Requirements:
1. Rule name should be professional and descriptive (max 80 characters)
2. Description should explain what the rule detects (max 200 characters)
3. Use standard cybersecurity terminology
4. Make it sound like real SOC detection rules
5. Include relevant technical details based on the query

Examples of good rule names:
- "Windows Command Shell Execution with Suspicious Arguments"
- "Multiple Authentication Failures from Single Source"
- "Lateral Movement via WMI Command Execution"
- "Suspicious PowerShell Script Block Logging"
- "Potential Data Exfiltration via DNS Tunneling"

Return ONLY a JSON object with 'name' and 'description' fields:`;

    if (config.useClaudeAI && config.claudeApiKey) {
      const anthropic = new Anthropic({ apiKey: config.claudeApiKey });

      const response = await anthropic.messages.create({
        model: config.claudeModel || 'claude-3-5-sonnet-20241022',
        max_tokens: 300,
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
      });

      const content = response.content[0];
      if (content.type === 'text') {
        const rawText = content.text.trim();

        // Try to extract JSON from the response
        let jsonStr = rawText;

        // Look for JSON object in the response
        const jsonMatch = rawText.match(/\{[^{}]*"name"[^{}]*\}/);
        if (jsonMatch) {
          jsonStr = jsonMatch[0];
        }

        // Clean up common AI response issues
        jsonStr = jsonStr
          .replace(/```json\n?/, '')
          .replace(/\n?```/, '')
          .replace(/^\s*{/, '{')
          .replace(/}\s*$/, '}');

        const result = safeJsonParse(jsonStr, 'Rule name generation');
        if (
          result &&
          typeof result === 'object' &&
          'name' in result &&
          'description' in result
        ) {
          const typedResult = result as { name: string; description: string };
          return {
            name: typedResult.name.substring(0, 80),
            description: typedResult.description.substring(0, 200),
          };
        }
      }
    } else if (
      config.openaiApiKey ||
      (config.useAzureOpenAI && config.azureOpenAIApiKey)
    ) {
      if (config.useAzureOpenAI && !config.azureOpenAIEndpoint) {
        throw new Error(
          'Azure OpenAI endpoint is required when useAzureOpenAI is true',
        );
      }

      const openai = new OpenAI(
        config.useAzureOpenAI
          ? {
              apiKey: config.azureOpenAIApiKey,
              baseURL: `${config.azureOpenAIEndpoint!.replace(/\/$/, '')}/openai/deployments/${config.azureOpenAIDeployment}`,
              defaultQuery: { 'api-version': config.azureOpenAIApiVersion },
              defaultHeaders: { 'api-key': config.azureOpenAIApiKey },
            }
          : { apiKey: config.openaiApiKey },
      );

      const response = await openai.chat.completions.create({
        model: config.useAzureOpenAI
          ? config.azureOpenAIDeployment || 'gpt-4'
          : 'gpt-4',
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
        max_tokens: 300,
        temperature: 0.7,
      });

      const content = response.choices[0]?.message?.content;
      if (content) {
        const rawText = content.trim();

        // Try to extract JSON from the response
        let jsonStr = rawText;

        // Look for JSON object in the response
        const jsonMatch = rawText.match(/\{[^{}]*"name"[^{}]*\}/);
        if (jsonMatch) {
          jsonStr = jsonMatch[0];
        }

        // Clean up common AI response issues
        jsonStr = jsonStr
          .replace(/```json\n?/, '')
          .replace(/\n?```/, '')
          .replace(/^\s*{/, '{')
          .replace(/}\s*$/, '}');

        const result = safeJsonParse(jsonStr, 'Rule name generation');
        if (
          result &&
          typeof result === 'object' &&
          'name' in result &&
          'description' in result
        ) {
          const typedResult = result as { name: string; description: string };
          return {
            name: typedResult.name.substring(0, 80),
            description: typedResult.description.substring(0, 200),
          };
        }
      }
    }
  } catch (error) {
    console.warn(
      'Failed to generate AI rule name, using fallback:',
      error instanceof Error ? error.message : 'Unknown error',
    );
  }

  // Fallback if AI fails
  return generateFallbackRuleName();
};

// Cleanup function to stop cache maintenance and allow process to exit
export const cleanupAIService = (): void => {
  stopCacheMaintenance();
  cacheMaintenanceStarted = false;
};

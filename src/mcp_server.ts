#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
  InitializeRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

// Import existing functionality
import {
  generateAlerts,
  generateLogs,
  generateCorrelatedCampaign,
  generateEvents,
  generateGraph,
  deleteAllAlerts,
  deleteAllEvents,
  deleteAllLogs,
} from './commands/documents.js';
import { generateRulesAndAlerts, deleteAllRules } from './commands/rules.js';
import AttackSimulationEngine from './services/attack_simulation_engine.js';
import { initializeSpace } from './utils/index.js';
import { cleanupAIService } from './utils/ai_service.js';
import { generateFieldsCLI, getAvailableCategories, validateFieldConfig } from './commands/generate_fields.js';
import { createKnowledgeBaseDocuments } from './create_knowledge_base.js';
import { setupSecurityMappings } from './commands/setup_mappings.js';
import { updateSecurityAlertsMapping } from './commands/update_specific_mapping.js';

// Tool interface definitions
interface SecurityAlertParams {
  alertCount?: number;
  hostCount?: number;
  userCount?: number;
  space?: string;
  namespace?: string;
  environments?: number;
  useAI?: boolean;
  useMitre?: boolean;
  subTechniques?: boolean;
  attackChains?: boolean;
  largeScale?: boolean;
  _largeScale?: boolean;
  focusTactic?: string;
  startDate?: string;
  endDate?: string;
  timePattern?: string;
  falsePositiveRate?: number;
  multiField?: boolean;
  fieldCount?: number;
  fieldCategories?: string[];
  fieldPerformanceMode?: boolean;
}

interface AttackCampaignParams {
  campaignType: 'apt' | 'ransomware' | 'insider' | 'supply_chain';
  complexity?: 'low' | 'medium' | 'high' | 'expert';
  targets?: number;
  events?: number;
  space?: string;
  namespace?: string;
  _namespace?: string;
  environments?: number;
  _environments?: number;
  useAI?: boolean;
  useMitre?: boolean;
  subTechniques?: boolean;
  attackChains?: boolean;
  largeScale?: boolean;
  _largeScale?: boolean;
  realistic?: boolean;
  logsPerStage?: number;
  detectionRate?: number;
  startDate?: string;
  endDate?: string;
  timePattern?: string;
  multiField?: boolean;
  fieldCount?: number;
  fieldCategories?: string[];
  fieldPerformanceMode?: boolean;
}

interface RealisticLogsParams {
  logCount?: number;
  hostCount?: number;
  userCount?: number;
  namespace?: string;
  environments?: number;
  useAI?: boolean;
  logTypes?: string[];
  startDate?: string;
  endDate?: string;
  timePattern?: string;
  multiField?: boolean;
  fieldCount?: number;
  fieldCategories?: string[];
  fieldPerformanceMode?: boolean;
  sessionView?: boolean;
  visualAnalyzer?: boolean;
}

interface CorrelatedEventsParams {
  alertCount?: number;
  hostCount?: number;
  userCount?: number;
  space?: string;
  namespace?: string;
  environments?: number;
  useAI?: boolean;
  useMitre?: boolean;
  logVolume?: number;
  startDate?: string;
  endDate?: string;
  timePattern?: string;
}

interface CleanupParams {
  type: 'alerts' | 'events' | 'logs' | 'rules' | 'knowledge_base';
  space?: string;
  logTypes?: string[];
  namespace?: string;
}

interface MitreTechniquesParams {
  tactic?: string;
  includeSubTechniques?: boolean;
}

interface GenerateEventsParams {
  eventCount?: number;
  useAI?: boolean;
  useMitre?: boolean;
  subTechniques?: boolean;
  attackChains?: boolean;
  largeScale?: boolean;
  startDate?: string;
  _startDate?: string;
  endDate?: string;
  _endDate?: string;
  timePattern?: string;
  _timePattern?: string;
}

interface GenerateGraphParams {
  users?: number;
  maxHosts?: number;
  useAI?: boolean;
}

interface TestMitreParams {
  alertCount?: number;
  space?: string;
  useAI?: boolean;
}

interface GenerateDetectionRulesParams {
  ruleCount?: number;
  eventCount?: number;
  interval?: string;
  fromHours?: number;
  gaps?: number;
  clean?: boolean;
}

interface GenerateFieldsParams {
  fieldCount?: number;
  categories?: string[];
  outputFormat?: 'console' | 'file' | 'elasticsearch';
  filename?: string;
  indexName?: string;
  includeMetadata?: boolean;
  createMapping?: boolean;
  updateTemplate?: boolean;
}

interface GenerateKnowledgeBaseParams {
  count?: number;
  includeMitre?: boolean;
  namespace?: string;
  space?: string;
  categories?: string[];
  accessLevel?: 'public' | 'team' | 'organization' | 'restricted';
  confidenceThreshold?: number;
}

interface DeleteKnowledgeBaseParams {
  space?: string;
  namespace?: string;
}

interface SetupMappingsParams {
  // No parameters needed for setup mappings
}

interface UpdateMappingParams {
  indexName?: string;
}

class SecurityDataMCPServer {
  private server: Server;
  private originalConsoleLog: typeof console.log;
  private originalConsoleError: typeof console.error;

  constructor() {
    // Temporarily disable MCP mode to debug connection issues
    // enableMCPMode();

    this.originalConsoleLog = console.log;
    this.originalConsoleError = console.error;

    // Just redirect console.log to stderr for now
    console.log = (...args: any[]) => console.error('[LOG]', ...args);

    this.server = new Server(
      {
        name: 'security-data-generator',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      },
    );

    this.setupToolHandlers();
    this.setupErrorHandling();
  }

  private setupErrorHandling(): void {
    this.server.onerror = (error) => {
      console.error('[MCP Error]', error);
    };

    // MCP protocol diagnostic logging
    console.error('[MCP] Error handler setup complete');

    process.on('SIGINT', async () => {
      console.error('\nShutting down MCP server...');
      cleanupAIService();
      // Restore original console functions
      console.log = this.originalConsoleLog;
      console.error = this.originalConsoleError;
      await this.server.close();
      process.exit(0);
    });

    // Handle unhandled rejections
    process.on('unhandledRejection', (reason, promise) => {
      console.error(
        '[MCP] Unhandled Rejection at:',
        promise,
        'reason:',
        reason,
      );
    });

    process.on('uncaughtException', (error) => {
      console.error('[MCP] Uncaught Exception:', error);
      process.exit(1);
    });
  }

  private setupToolHandlers(): void {
    // Handle initialization
    this.server.setRequestHandler(InitializeRequestSchema, async (_request) => {
      console.error('[MCP] Initialize request received, preparing response...');
      const response = {
        protocolVersion: '2024-11-05',
        capabilities: {
          tools: {},
        },
        serverInfo: {
          name: 'security-data-generator',
          version: '1.0.0',
        },
      };
      console.error('[MCP] Sending initialize response');
      return response;
    });

    // List available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      console.error('[MCP] Tools list requested');
      return {
        tools: [
          {
            name: 'generate_security_alerts',
            description:
              'Generate AI-powered security alerts with optional MITRE ATT&CK integration, multi-environment support, and enhanced field generation',
            inputSchema: {
              type: 'object',
              properties: {
                alertCount: {
                  type: 'number',
                  description: 'Number of alerts to generate',
                  default: 10,
                },
                hostCount: {
                  type: 'number',
                  description: 'Number of unique hosts',
                  default: 3,
                },
                userCount: {
                  type: 'number',
                  description: 'Number of unique users',
                  default: 2,
                },
                space: {
                  type: 'string',
                  description: 'Kibana space name',
                  default: 'default',
                },
                namespace: {
                  type: 'string',
                  description: 'Custom namespace for alert indices',
                  default: 'default',
                },
                environments: {
                  type: 'number',
                  description:
                    'Generate alerts across multiple environment namespaces',
                  default: 1,
                },
                useAI: {
                  type: 'boolean',
                  description: 'Use AI for generation',
                  default: true,
                },
                useMitre: {
                  type: 'boolean',
                  description: 'Include MITRE ATT&CK techniques',
                  default: false,
                },
                subTechniques: {
                  type: 'boolean',
                  description:
                    'Include MITRE sub-techniques (requires useMitre)',
                  default: false,
                },
                attackChains: {
                  type: 'boolean',
                  description:
                    'Generate realistic attack chains (requires useMitre)',
                  default: false,
                },
                largeScale: {
                  type: 'boolean',
                  description:
                    'Enable performance optimizations for large datasets',
                  default: false,
                },
                focusTactic: {
                  type: 'string',
                  description: 'Focus on specific MITRE tactic (e.g., TA0001)',
                },
                startDate: {
                  type: 'string',
                  description: 'Start date (e.g., "7d", "2024-01-01")',
                },
                endDate: {
                  type: 'string',
                  description: 'End date (e.g., "now", "2024-01-10")',
                },
                timePattern: {
                  type: 'string',
                  description:
                    'Time pattern: uniform, business_hours, random, attack_simulation, weekend_heavy',
                },
                falsePositiveRate: {
                  type: 'number',
                  description:
                    'Percentage of alerts to mark as false positives (0.0-1.0)',
                  default: 0.0,
                },
                multiField: {
                  type: 'boolean',
                  description:
                    'Generate hundreds of additional contextual security fields',
                  default: false,
                },
                fieldCount: {
                  type: 'number',
                  description:
                    'Number of additional fields to generate (requires multiField)',
                  default: 200,
                },
                fieldCategories: {
                  type: 'array',
                  items: {
                    type: 'string',
                    enum: [
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
                    ],
                  },
                  description: 'Specific field categories to include',
                },
                fieldPerformanceMode: {
                  type: 'boolean',
                  description:
                    'Optimize multi-field generation for speed (requires multiField)',
                  default: false,
                },
              },
            },
          },
          {
            name: 'generate_attack_campaign',
            description:
              'Generate sophisticated multi-stage attack campaigns with realistic progression, multi-environment support, and enhanced analytics',
            inputSchema: {
              type: 'object',
              properties: {
                campaignType: {
                  type: 'string',
                  enum: ['apt', 'ransomware', 'insider', 'supply_chain'],
                  description: 'Type of attack campaign to generate',
                },
                complexity: {
                  type: 'string',
                  enum: ['low', 'medium', 'high', 'expert'],
                  default: 'high',
                  description: 'Campaign complexity level',
                },
                targets: {
                  type: 'number',
                  description: 'Number of target hosts',
                  default: 10,
                },
                events: {
                  type: 'number',
                  description: 'Number of events to generate',
                  default: 100,
                },
                space: {
                  type: 'string',
                  description: 'Kibana space name',
                  default: 'default',
                },
                namespace: {
                  type: 'string',
                  description: 'Custom namespace for campaign data indices',
                  default: 'default',
                },
                environments: {
                  type: 'number',
                  description:
                    'Generate campaigns across multiple environment namespaces',
                  default: 1,
                },
                useAI: {
                  type: 'boolean',
                  description: 'Use AI for generation',
                  default: true,
                },
                useMitre: {
                  type: 'boolean',
                  description: 'Include MITRE ATT&CK techniques',
                  default: true,
                },
                subTechniques: {
                  type: 'boolean',
                  description:
                    'Include MITRE sub-techniques (requires useMitre)',
                  default: false,
                },
                attackChains: {
                  type: 'boolean',
                  description:
                    'Generate realistic attack chains (requires useMitre)',
                  default: false,
                },
                largeScale: {
                  type: 'boolean',
                  description:
                    'Enable performance optimizations for large datasets',
                  default: false,
                },
                realistic: {
                  type: 'boolean',
                  description:
                    'Generate realistic source logs that trigger alerts',
                  default: false,
                },
                logsPerStage: {
                  type: 'number',
                  description: 'Logs per attack stage (realistic mode)',
                  default: 8,
                },
                detectionRate: {
                  type: 'number',
                  description: 'Detection rate (0.0-1.0)',
                  default: 0.4,
                },
                startDate: {
                  type: 'string',
                  description: 'Start date (e.g., "7d", "2024-01-01")',
                },
                endDate: {
                  type: 'string',
                  description: 'End date (e.g., "now", "2024-01-10")',
                },
                timePattern: {
                  type: 'string',
                  description:
                    'Time pattern: uniform, business_hours, random, attack_simulation, weekend_heavy',
                },
                multiField: {
                  type: 'boolean',
                  description:
                    'Generate hundreds of additional contextual security fields',
                  default: false,
                },
                fieldCount: {
                  type: 'number',
                  description:
                    'Number of additional fields to generate (requires multiField)',
                  default: 200,
                },
                fieldCategories: {
                  type: 'array',
                  items: {
                    type: 'string',
                    enum: [
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
                    ],
                  },
                  description: 'Specific field categories to include',
                },
                fieldPerformanceMode: {
                  type: 'boolean',
                  description:
                    'Optimize multi-field generation for speed (requires multiField)',
                  default: false,
                },
              },
              required: ['campaignType'],
            },
          },
          {
            name: 'generate_realistic_logs',
            description:
              'Generate realistic source logs for security analysis with multi-environment support, Session View compatibility, and enhanced field generation',
            inputSchema: {
              type: 'object',
              properties: {
                logCount: {
                  type: 'number',
                  description: 'Number of logs to generate',
                  default: 1000,
                },
                hostCount: {
                  type: 'number',
                  description: 'Number of unique hosts',
                  default: 10,
                },
                userCount: {
                  type: 'number',
                  description: 'Number of unique users',
                  default: 5,
                },
                namespace: {
                  type: 'string',
                  description: 'Custom namespace for log indices',
                  default: 'default',
                },
                environments: {
                  type: 'number',
                  description:
                    'Generate logs across multiple environment namespaces',
                  default: 1,
                },
                useAI: {
                  type: 'boolean',
                  description: 'Use AI for generation',
                  default: false,
                },
                logTypes: {
                  type: 'array',
                  items: {
                    type: 'string',
                    enum: ['system', 'auth', 'network', 'endpoint'],
                  },
                  description: 'Types of logs to generate',
                  default: ['system', 'auth', 'network', 'endpoint'],
                },
                startDate: {
                  type: 'string',
                  description: 'Start date (e.g., "7d", "2024-01-01")',
                },
                endDate: {
                  type: 'string',
                  description: 'End date (e.g., "now", "2024-01-10")',
                },
                timePattern: {
                  type: 'string',
                  description:
                    'Time pattern: uniform, business_hours, random, attack_simulation, weekend_heavy',
                },
                multiField: {
                  type: 'boolean',
                  description:
                    'Generate hundreds of additional contextual security fields',
                  default: false,
                },
                fieldCount: {
                  type: 'number',
                  description:
                    'Number of additional fields to generate (requires multiField)',
                  default: 200,
                },
                fieldCategories: {
                  type: 'array',
                  items: {
                    type: 'string',
                    enum: [
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
                    ],
                  },
                  description: 'Specific field categories to include',
                },
                fieldPerformanceMode: {
                  type: 'boolean',
                  description:
                    'Optimize multi-field generation for speed (requires multiField)',
                  default: false,
                },
                sessionView: {
                  type: 'boolean',
                  description:
                    'Generate Session View compatible data with process hierarchies',
                  default: false,
                },
                visualAnalyzer: {
                  type: 'boolean',
                  description: 'Generate Visual Event Analyzer compatible data',
                  default: false,
                },
              },
            },
          },
          {
            name: 'generate_correlated_events',
            description:
              'Generate security alerts with correlated supporting logs for investigation with multi-environment support',
            inputSchema: {
              type: 'object',
              properties: {
                alertCount: {
                  type: 'number',
                  description: 'Number of alerts to generate',
                  default: 10,
                },
                hostCount: {
                  type: 'number',
                  description: 'Number of unique hosts',
                  default: 3,
                },
                userCount: {
                  type: 'number',
                  description: 'Number of unique users',
                  default: 2,
                },
                space: {
                  type: 'string',
                  description: 'Kibana space name',
                  default: 'default',
                },
                namespace: {
                  type: 'string',
                  description: 'Custom namespace for correlated data indices',
                  default: 'default',
                },
                environments: {
                  type: 'number',
                  description:
                    'Generate correlated data across multiple environment namespaces',
                  default: 1,
                },
                useAI: {
                  type: 'boolean',
                  description: 'Use AI for generation',
                  default: true,
                },
                useMitre: {
                  type: 'boolean',
                  description: 'Include MITRE ATT&CK techniques',
                  default: false,
                },
                logVolume: {
                  type: 'number',
                  description: 'Supporting logs per alert',
                  default: 6,
                },
                startDate: {
                  type: 'string',
                  description: 'Start date (e.g., "7d", "2024-01-01")',
                },
                endDate: {
                  type: 'string',
                  description: 'End date (e.g., "now", "2024-01-10")',
                },
                timePattern: {
                  type: 'string',
                  description:
                    'Time pattern: uniform, business_hours, random, attack_simulation, weekend_heavy',
                },
              },
            },
          },
          {
            name: 'cleanup_security_data',
            description:
              'Clean up generated security data (alerts, events, logs, rules, knowledge_base)',
            inputSchema: {
              type: 'object',
              properties: {
                type: {
                  type: 'string',
                  enum: ['alerts', 'events', 'logs', 'rules', 'knowledge_base'],
                  description: 'Type of data to clean up',
                },
                space: {
                  type: 'string',
                  description: 'Kibana space (for alerts/events/rules/knowledge_base)',
                },
                namespace: {
                  type: 'string',
                  description: 'Namespace (for knowledge_base)',
                  default: 'default',
                },
                logTypes: {
                  type: 'array',
                  items: {
                    type: 'string',
                    enum: ['system', 'auth', 'network', 'endpoint'],
                  },
                  description: 'Types of logs to delete (for logs cleanup)',
                  default: ['system', 'auth', 'network', 'endpoint'],
                },
              },
              required: ['type'],
            },
          },
          {
            name: 'get_mitre_techniques',
            description:
              'Query and retrieve MITRE ATT&CK techniques and tactics',
            inputSchema: {
              type: 'object',
              properties: {
                tactic: {
                  type: 'string',
                  description: 'MITRE tactic ID (e.g., TA0001) or name',
                },
                includeSubTechniques: {
                  type: 'boolean',
                  description: 'Include sub-techniques',
                  default: false,
                },
              },
            },
          },
          {
            name: 'generate_events',
            description:
              'Generate AI-powered security events with optional MITRE ATT&CK scenarios',
            inputSchema: {
              type: 'object',
              properties: {
                eventCount: {
                  type: 'number',
                  description: 'Number of events to generate',
                  default: 50,
                },
                useAI: {
                  type: 'boolean',
                  description: 'Use AI for generation',
                  default: true,
                },
                useMitre: {
                  type: 'boolean',
                  description: 'Include MITRE ATT&CK techniques',
                  default: false,
                },
                subTechniques: {
                  type: 'boolean',
                  description:
                    'Include MITRE sub-techniques (requires useMitre)',
                  default: false,
                },
                attackChains: {
                  type: 'boolean',
                  description:
                    'Generate realistic attack chains (requires useMitre)',
                  default: false,
                },
                largeScale: {
                  type: 'boolean',
                  description:
                    'Enable performance optimizations for large datasets',
                  default: false,
                },
                startDate: {
                  type: 'string',
                  description: 'Start date (e.g., "7d", "2024-01-01")',
                },
                endDate: {
                  type: 'string',
                  description: 'End date (e.g., "now", "2024-01-10")',
                },
                timePattern: {
                  type: 'string',
                  description:
                    'Time pattern: uniform, business_hours, random, attack_simulation, weekend_heavy',
                },
              },
            },
          },
          {
            name: 'generate_graph',
            description:
              'Generate AI-powered entity relationship graph with realistic alerts',
            inputSchema: {
              type: 'object',
              properties: {
                users: {
                  type: 'number',
                  description: 'Number of users to generate',
                  default: 100,
                },
                maxHosts: {
                  type: 'number',
                  description: 'Maximum hosts per user',
                  default: 3,
                },
                useAI: {
                  type: 'boolean',
                  description: 'Use AI for generation',
                  default: true,
                },
              },
            },
          },
          {
            name: 'test_mitre_integration',
            description:
              'Test MITRE ATT&CK AI integration by generating sample alerts',
            inputSchema: {
              type: 'object',
              properties: {
                alertCount: {
                  type: 'number',
                  description: 'Number of test alerts to generate',
                  default: 5,
                },
                space: {
                  type: 'string',
                  description: 'Kibana space to use',
                  default: 'default',
                },
                useAI: {
                  type: 'boolean',
                  description: 'Use AI for generation',
                  default: true,
                },
              },
            },
          },
          {
            name: 'generate_detection_rules',
            description: 'Generate detection rules and test events',
            inputSchema: {
              type: 'object',
              properties: {
                ruleCount: {
                  type: 'number',
                  description: 'Number of rules to generate',
                  default: 10,
                },
                eventCount: {
                  type: 'number',
                  description: 'Number of events to generate',
                  default: 50,
                },
                interval: {
                  type: 'string',
                  description: 'Rule execution interval',
                  default: '5m',
                },
                fromHours: {
                  type: 'number',
                  description: 'Generate events from last N hours',
                  default: 24,
                },
                gaps: {
                  type: 'number',
                  description: 'Amount of gaps per rule',
                  default: 0,
                },
                clean: {
                  type: 'boolean',
                  description: 'Clean gap events before generating rules',
                  default: false,
                },
              },
            },
          },
          {
            name: 'generate_fields',
            description: 'Generate security fields on demand with unlimited field counts and category filtering',
            inputSchema: {
              type: 'object',
              properties: {
                fieldCount: {
                  type: 'number',
                  description: 'Number of fields to generate (1-50,000)',
                  default: 1000,
                },
                categories: {
                  type: 'array',
                  items: {
                    type: 'string',
                    enum: [
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
                    ],
                  },
                  description: 'Specific field categories to generate',
                },
                outputFormat: {
                  type: 'string',
                  enum: ['console', 'file', 'elasticsearch'],
                  description: 'Output format for generated fields',
                  default: 'console',
                },
                filename: {
                  type: 'string',
                  description: 'Filename for file output (requires outputFormat: file)',
                },
                indexName: {
                  type: 'string',
                  description: 'Index name for Elasticsearch output (requires outputFormat: elasticsearch)',
                  default: 'generated-fields-sample',
                },
                includeMetadata: {
                  type: 'boolean',
                  description: 'Include generation metadata in output',
                  default: true,
                },
                createMapping: {
                  type: 'boolean',
                  description: 'Create Elasticsearch mapping for generated fields',
                  default: true,
                },
                updateTemplate: {
                  type: 'boolean',
                  description: 'Update index template with field mappings',
                  default: true,
                },
              },
            },
          },
          {
            name: 'generate_knowledge_base',
            description: 'Generate AI Assistant Knowledge Base documents with ELSER v2 semantic search and suggested questions',
            inputSchema: {
              type: 'object',
              properties: {
                count: {
                  type: 'number',
                  description: 'Number of knowledge base documents to generate',
                  default: 20,
                },
                includeMitre: {
                  type: 'boolean',
                  description: 'Include MITRE ATT&CK framework mappings',
                  default: false,
                },
                namespace: {
                  type: 'string',
                  description: 'Custom namespace for knowledge base indices',
                  default: 'default',
                },
                space: {
                  type: 'string',
                  description: 'Kibana space name',
                  default: 'default',
                },
                categories: {
                  type: 'array',
                  items: {
                    type: 'string',
                    enum: [
                      'threat_intelligence',
                      'incident_response',
                      'vulnerability_management',
                      'network_security',
                      'endpoint_security',
                      'cloud_security',
                      'compliance',
                      'forensics',
                      'malware_analysis',
                      'behavioral_analytics',
                    ],
                  },
                  description: 'Specific knowledge base categories to include',
                },
                accessLevel: {
                  type: 'string',
                  enum: ['public', 'team', 'organization', 'restricted'],
                  description: 'Access level for generated documents',
                },
                confidenceThreshold: {
                  type: 'number',
                  description: 'Minimum confidence threshold (0.0-1.0)',
                  default: 0.0,
                },
              },
            },
          },
          {
            name: 'delete_knowledge_base',
            description: 'Delete knowledge base documents from specified space and namespace',
            inputSchema: {
              type: 'object',
              properties: {
                space: {
                  type: 'string',
                  description: 'Kibana space to delete from',
                  default: 'default',
                },
                namespace: {
                  type: 'string',
                  description: 'Namespace to delete from',
                  default: 'default',
                },
              },
            },
          },
          {
            name: 'setup_mappings',
            description: 'Setup Elasticsearch mappings for security indices to ensure proper field visualization in Kibana',
            inputSchema: {
              type: 'object',
              properties: {},
            },
          },
          {
            name: 'update_mapping',
            description: 'Update existing indices with comprehensive field mappings to fix unmapped fields in Kibana',
            inputSchema: {
              type: 'object',
              properties: {
                indexName: {
                  type: 'string',
                  description: 'Specific index name to update (optional - will auto-detect security indices if not provided)',
                },
              },
            },
          },
        ],
      };
    });

    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;
      console.error(`[MCP] Tool call requested: ${name}`);

      try {
        switch (name) {
          case 'generate_security_alerts':
            return await this.handleGenerateSecurityAlerts(
              args as SecurityAlertParams,
            );

          case 'generate_attack_campaign':
            return await this.handleGenerateAttackCampaign(
              args as unknown as AttackCampaignParams,
            );

          case 'generate_realistic_logs':
            return await this.handleGenerateRealisticLogs(
              args as RealisticLogsParams,
            );

          case 'generate_correlated_events':
            return await this.handleGenerateCorrelatedEvents(
              args as CorrelatedEventsParams,
            );

          case 'cleanup_security_data':
            return await this.handleCleanupSecurityData(
              args as unknown as CleanupParams,
            );

          case 'get_mitre_techniques':
            return await this.handleGetMitreTechniques(
              args as MitreTechniquesParams,
            );

          case 'generate_events':
            return await this.handleGenerateEvents(
              args as GenerateEventsParams,
            );

          case 'generate_graph':
            return await this.handleGenerateGraph(args as GenerateGraphParams);

          case 'test_mitre_integration':
            return await this.handleTestMitreIntegration(
              args as TestMitreParams,
            );

          case 'generate_detection_rules':
            return await this.handleGenerateDetectionRules(
              args as GenerateDetectionRulesParams,
            );

          case 'generate_fields':
            return await this.handleGenerateFields(
              args as GenerateFieldsParams,
            );

          case 'generate_knowledge_base':
            return await this.handleGenerateKnowledgeBase(
              args as GenerateKnowledgeBaseParams,
            );

          case 'delete_knowledge_base':
            return await this.handleDeleteKnowledgeBase(
              args as DeleteKnowledgeBaseParams,
            );

          case 'setup_mappings':
            return await this.handleSetupMappings(
              args as SetupMappingsParams,
            );

          case 'update_mapping':
            return await this.handleUpdateMapping(
              args as UpdateMappingParams,
            );

          default:
            throw new McpError(
              ErrorCode.MethodNotFound,
              `Unknown tool: ${name}`,
            );
        }
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        throw new McpError(
          ErrorCode.InternalError,
          `Tool execution failed: ${errorMessage}`,
        );
      }
    });
  }

  private async handleGenerateSecurityAlerts(params: SecurityAlertParams) {
    const {
      alertCount = 10,
      hostCount = 3,
      userCount = 2,
      space = 'default',
      namespace = 'default',
      environments = 1,
      useAI = true,
      useMitre = false,
      subTechniques = false,
      attackChains = false,
      _largeScale = false,
      focusTactic,
      startDate,
      endDate,
      timePattern,
      falsePositiveRate = 0.0,
      multiField = false,
      fieldCount = 200,
      fieldCategories,
      fieldPerformanceMode = false,
    } = params;

    // Validate parameters
    if (subTechniques && !useMitre) {
      throw new Error('subTechniques requires useMitre to be enabled');
    }
    if (attackChains && !useMitre) {
      throw new Error('attackChains requires useMitre to be enabled');
    }
    if (focusTactic && !useMitre) {
      throw new Error('focusTactic requires useMitre to be enabled');
    }
    if (fieldCount && !multiField) {
      throw new Error('fieldCount requires multiField to be enabled');
    }
    if (fieldCategories && !multiField) {
      throw new Error('fieldCategories requires multiField to be enabled');
    }
    if (fieldPerformanceMode && !multiField) {
      throw new Error('fieldPerformanceMode requires multiField to be enabled');
    }
    if (falsePositiveRate < 0.0 || falsePositiveRate > 1.0) {
      throw new Error('falsePositiveRate must be between 0.0 and 1.0');
    }
    if (fieldCount < 1 || fieldCount > 50000) {
      throw new Error('fieldCount must be between 1 and 50,000');
    }

    const timestampConfig =
      startDate || endDate || timePattern
        ? {
            startDate,
            endDate,
            pattern: timePattern as any,
          }
        : {
            startDate: '1h', // Default to last hour if no timestamps specified
            endDate: 'now',
            pattern: 'uniform' as const,
          };

    // Create multi-field configuration
    const multiFieldConfig = multiField
      ? {
          fieldCount,
          categories: fieldCategories,
          performanceMode: fieldPerformanceMode,
          contextWeightEnabled: true,
          correlationEnabled: true,
        }
      : undefined;

    // Handle multiple environments
    if (environments > 1) {
      console.error(
        `[MCP] Multi-Environment Generation: ${environments} environments`,
      );

      for (let i = 1; i <= environments; i++) {
        const envNamespace = `${namespace}-env-${i.toString().padStart(3, '0')}`;
        const envSpace = `${space}-${envNamespace}`;

        console.error(
          `[MCP] Generating environment ${i}/${environments}: ${envNamespace}`,
        );

        if (envSpace !== 'default') {
          await initializeSpace(envSpace);
        }

        await generateAlerts(
          alertCount,
          hostCount,
          userCount,
          envSpace,
          useAI,
          useMitre,
          timestampConfig,
          falsePositiveRate,
          multiFieldConfig,
          envNamespace,
        );
      }

      return {
        content: [
          {
            type: 'text',
            text: `🌍 Successfully generated ${alertCount * environments} security alerts across ${environments} environments!

📊 Total Alerts: ${alertCount * environments}
🌍 Environments: ${namespace}-env-001 through ${namespace}-env-${environments.toString().padStart(3, '0')}
📁 Base Namespace: ${namespace}
${useMitre ? '⚔️ MITRE ATT&CK techniques included' : ''}
${multiField ? `🔬 Multi-Field Generation: ${fieldCount} additional fields per alert` : ''}
${useAI ? '🤖 AI-powered generation used' : ''}`,
          },
        ],
      };
    } else {
      // Single environment generation
      if (space !== 'default') {
        await initializeSpace(space);
      }

      await generateAlerts(
        alertCount,
        hostCount,
        userCount,
        space,
        useAI,
        useMitre,
        timestampConfig,
        falsePositiveRate,
        multiFieldConfig,
        namespace,
      );

      return {
        content: [
          {
            type: 'text',
            text: `Successfully generated ${alertCount} security alerts in space '${space}' with ${hostCount} hosts and ${userCount} users.
${useMitre ? '⚔️ MITRE ATT&CK techniques included.' : ''}
${subTechniques ? '🔗 Sub-techniques enabled.' : ''}
${attackChains ? '⛓️ Attack chains enabled.' : ''}
${multiField ? `🔬 Multi-Field Generation: ${fieldCount} additional fields per alert.` : ''}
${useAI ? '🤖 AI-powered generation used.' : ''}`,
          },
        ],
      };
    }
  }

  private async handleGenerateAttackCampaign(params: AttackCampaignParams) {
    const {
      campaignType,
      complexity = 'high',
      targets = 10,
      events = 100,
      space = 'default',
      _namespace = 'default',
      _environments = 1,
      useAI = true,
      useMitre = true,
      subTechniques = false,
      attackChains = false,
      _largeScale = false,
      realistic = false,
      logsPerStage = 8,
      detectionRate = 0.4,
      startDate,
      endDate,
      timePattern,
      multiField = false,
      fieldCount = 200,
      fieldCategories,
      fieldPerformanceMode = false,
    } = params;

    // Validate parameters
    if (subTechniques && !useMitre) {
      throw new Error('subTechniques requires useMitre to be enabled');
    }
    if (attackChains && !useMitre) {
      throw new Error('attackChains requires useMitre to be enabled');
    }
    if (fieldCount && !multiField) {
      throw new Error('fieldCount requires multiField to be enabled');
    }
    if (fieldCategories && !multiField) {
      throw new Error('fieldCategories requires multiField to be enabled');
    }
    if (fieldPerformanceMode && !multiField) {
      throw new Error('fieldPerformanceMode requires multiField to be enabled');
    }
    if (fieldCount < 1 || fieldCount > 50000) {
      throw new Error('fieldCount must be between 1 and 50,000');
    }

    // Create timestamp configuration
    const timestampConfig =
      startDate || endDate || timePattern
        ? {
            startDate,
            endDate,
            pattern: timePattern as any,
          }
        : {
            startDate: '2h',
            endDate: 'now',
            pattern: 'attack_simulation' as const,
          };

    // Create multi-field configuration
    const multiFieldConfig = multiField
      ? {
          fieldCount,
          categories: fieldCategories,
          performanceMode: fieldPerformanceMode,
          contextWeightEnabled: true,
          correlationEnabled: true,
          useExpandedFields: fieldCount > 1000,
          expandedFieldCount: fieldCount,
        }
      : undefined;

    // Initialize space if not default
    if (space !== 'default') {
      await initializeSpace(space);
    }

    if (realistic) {
      // Use realistic attack engine
      const { RealisticAttackEngine } = await import(
        './services/realistic_attack_engine.js'
      );
      const realisticEngine = new RealisticAttackEngine();

      const realisticConfig = {
        campaignType,
        complexity,
        enableRealisticLogs: true,
        logsPerStage,
        detectionRate,
        eventCount: events,
        targetCount: targets,
        space,
        useAI,
        useMitre,
        timestampConfig,
        multiFieldConfig,
      };

      const result =
        await realisticEngine.generateRealisticCampaign(realisticConfig);

      // Index the data to Elasticsearch (this was missing!)
      console.error('[MCP] Indexing realistic campaign data...');

      const { getEsClient } = await import('./commands/utils/indices.js');
      const { indexCheck } = await import('./commands/utils/indices.js');
      const { faker } = await import('@faker-js/faker');
      const logMappings = await import('./mappings/log_mappings.json', {
        assert: { type: 'json' },
      });

      const client = getEsClient();
      const indexOperations: unknown[] = [];

      // Index all stage logs
      for (const stage of result.stageLogs) {
        for (const log of stage.logs) {
          const dataset = log['data_stream.dataset'] || 'generic.log';
          const namespace = log['data_stream.namespace'] || 'default';
          const indexName = `logs-${dataset}-${namespace}`;

          // Ensure index exists
          await indexCheck(
            indexName,
            {
              mappings: logMappings.default as any,
            },
            false,
          );

          indexOperations.push({
            create: {
              _index: indexName,
              _id: faker.string.uuid(),
            },
          });
          indexOperations.push(log);
        }
      }

      // Index detected alerts
      const alertIndex = `.internal.alerts-security.alerts-${space}-000001`;
      for (const alert of result.detectedAlerts) {
        indexOperations.push({
          create: {
            _index: alertIndex,
            _id: alert['kibana.alert.uuid'],
          },
        });
        indexOperations.push(alert);
      }

      // Bulk index everything
      if (indexOperations.length > 0) {
        const batchSize = 1000;
        for (let i = 0; i < indexOperations.length; i += batchSize) {
          const batch = indexOperations.slice(i, i + batchSize);
          await client.bulk({ operations: batch, refresh: true });

          if (i + batchSize < indexOperations.length) {
            console.error('[MCP] Indexing progress...');
          }
        }
      }

      console.error(
        `[MCP] Successfully indexed ${indexOperations.length / 2} documents`,
      );

      return {
        content: [
          {
            type: 'text',
            text: `🎊 Realistic ${campaignType.toUpperCase()} campaign generated successfully!

🎯 Campaign: ${result.campaign.campaign.name}
🎭 Threat Actor: ${result.campaign.campaign.threat_actor}
📋 Total Logs: ${result.stageLogs.reduce((sum, stage) => sum + stage.logs.length, 0)}
🚨 Detected Alerts: ${result.detectedAlerts.length}
⚪ Missed Activities: ${result.missedActivities.length}
📅 Attack Stages: ${result.campaign.stages.length}

Detection Rate: ${(detectionRate * 100).toFixed(1)}%
Investigation Guide available with ${result.investigationGuide.length} steps.

Data indexed to Elasticsearch in space '${space}'.`,
          },
        ],
      };
    } else {
      // Use sophisticated attack simulation engine
      const simulationEngine = new AttackSimulationEngine({
        networkComplexity: complexity,
        enableCorrelation: true,
        enablePerformanceOptimization: events >= 1000,
      });

      const simulation = await simulationEngine.generateAttackSimulation(
        campaignType,
        complexity,
      );

      const timestampConfig = {
        startDate: simulation.campaign.duration.start.toISOString(),
        endDate: simulation.campaign.duration.end.toISOString(),
        pattern: 'attack_simulation' as const,
      };

      const correlatedEvents = await simulationEngine.generateCampaignEvents(
        simulation,
        targets,
        events,
        space,
        useMitre,
        timestampConfig,
      );

      return {
        content: [
          {
            type: 'text',
            text: `🚀 Sophisticated ${campaignType.toUpperCase()} campaign generated successfully!

⚔️ Campaign: ${simulation.campaign.name}
🎭 Threat Actor: ${simulation.campaign.threat_actor}
🎯 Attack Stages: ${simulation.stages.length}
📊 Generated Events: ${correlatedEvents.length}
📅 Duration: ${simulation.campaign.duration.start.toISOString().split('T')[0]} → ${simulation.campaign.duration.end.toISOString().split('T')[0]}

Complexity: ${complexity}
${useMitre ? '⚔️ MITRE ATT&CK techniques included' : ''}
${useAI ? '🤖 AI-powered generation used' : ''}

Data indexed to Elasticsearch in space '${space}'.`,
          },
        ],
      };
    }
  }

  private async handleGenerateRealisticLogs(params: RealisticLogsParams) {
    const {
      logCount = 1000,
      hostCount = 10,
      userCount = 5,
      namespace = 'default',
      environments = 1,
      useAI = false,
      logTypes = ['system', 'auth', 'network', 'endpoint'],
      startDate,
      endDate,
      timePattern,
      multiField = false,
      fieldCount = 200,
      fieldCategories,
      fieldPerformanceMode = false,
      sessionView = false,
      visualAnalyzer = false,
    } = params;

    // Validate parameters
    if (fieldCount && !multiField) {
      throw new Error('fieldCount requires multiField to be enabled');
    }
    if (fieldCategories && !multiField) {
      throw new Error('fieldCategories requires multiField to be enabled');
    }
    if (fieldPerformanceMode && !multiField) {
      throw new Error('fieldPerformanceMode requires multiField to be enabled');
    }
    if (fieldCount < 1 || fieldCount > 50000) {
      throw new Error('fieldCount must be between 1 and 50,000');
    }

    const timestampConfig =
      startDate || endDate || timePattern
        ? {
            startDate,
            endDate,
            pattern: timePattern as any,
          }
        : {
            startDate: '1h', // Default to last hour if no timestamps specified
            endDate: 'now',
            pattern: 'uniform' as const,
          };

    // Create multi-field configuration
    const multiFieldConfig = multiField
      ? {
          fieldCount,
          categories: fieldCategories,
          performanceMode: fieldPerformanceMode,
          contextWeightEnabled: true,
          correlationEnabled: true,
        }
      : undefined;

    // Handle multiple environments
    if (environments > 1) {
      console.error(
        `[MCP] Multi-Environment Log Generation: ${environments} environments`,
      );

      for (let i = 1; i <= environments; i++) {
        const envNamespace = `${namespace}-env-${i.toString().padStart(3, '0')}`;

        console.error(
          `[MCP] Generating environment ${i}/${environments}: ${envNamespace}`,
        );

        await generateLogs(
          logCount,
          hostCount,
          userCount,
          useAI,
          logTypes,
          timestampConfig,
          multiFieldConfig,
          sessionView,
          visualAnalyzer,
          envNamespace,
        );
      }

      return {
        content: [
          {
            type: 'text',
            text: `🌍 Successfully generated ${logCount * environments} realistic logs across ${environments} environments!

📊 Total Logs: ${logCount * environments}
🌍 Environments: ${namespace}-env-001 through ${namespace}-env-${environments.toString().padStart(3, '0')}
📁 Log Types: ${logTypes.join(', ')}
${multiField ? `🔬 Multi-Field Generation: ${fieldCount} additional fields per log` : ''}
${sessionView ? '📱 Session View compatibility enabled' : ''}
${visualAnalyzer ? '👁️ Visual Event Analyzer compatibility enabled' : ''}
${useAI ? '🤖 AI-powered generation used' : ''}`,
          },
        ],
      };
    } else {
      // Single environment generation
      await generateLogs(
        logCount,
        hostCount,
        userCount,
        useAI,
        logTypes,
        timestampConfig,
        multiFieldConfig,
        sessionView,
        visualAnalyzer,
        namespace,
      );

      return {
        content: [
          {
            type: 'text',
            text: `Successfully generated ${logCount} realistic source logs across types: ${logTypes.join(', ')}.

Generated with ${hostCount} hosts and ${userCount} users.
${multiField ? `🔬 Multi-Field Generation: ${fieldCount} additional fields per log.` : ''}
${sessionView ? '📱 Session View compatibility enabled.' : ''}
${visualAnalyzer ? '👁️ Visual Event Analyzer compatibility enabled.' : ''}
${useAI ? '🤖 AI-powered generation used.' : ''}

Logs indexed to multiple data streams in Elasticsearch.`,
          },
        ],
      };
    }
  }

  private async handleGenerateCorrelatedEvents(params: CorrelatedEventsParams) {
    const {
      alertCount = 10,
      hostCount = 3,
      userCount = 2,
      space = 'default',
      namespace = 'default',
      environments = 1,
      useAI = true,
      useMitre = false,
      logVolume = 6,
      startDate,
      endDate,
      timePattern,
    } = params;

    const timestampConfig =
      startDate || endDate || timePattern
        ? {
            startDate,
            endDate,
            pattern: timePattern as any,
          }
        : {
            startDate: '1h', // Default to last hour if no timestamps specified
            endDate: 'now',
            pattern: 'uniform' as const,
          };

    // Handle multiple environments
    if (environments > 1) {
      console.error(
        `[MCP] Multi-Environment Correlated Generation: ${environments} environments`,
      );

      for (let i = 1; i <= environments; i++) {
        const envNamespace = `${namespace}-env-${i.toString().padStart(3, '0')}`;
        const envSpace = `${space}-${envNamespace}`;

        console.error(
          `[MCP] Generating environment ${i}/${environments}: ${envNamespace}`,
        );

        if (envSpace !== 'default') {
          await initializeSpace(envSpace);
        }

        await generateCorrelatedCampaign(
          alertCount,
          hostCount,
          userCount,
          envSpace,
          useAI,
          useMitre,
          logVolume,
          timestampConfig,
          envNamespace,
        );
      }

      return {
        content: [
          {
            type: 'text',
            text: `🌍 Successfully generated ${alertCount * environments} correlated security alerts across ${environments} environments!

📊 Total Alerts: ${alertCount * environments}
📊 Total Supporting Logs: ${alertCount * environments * logVolume}
🌍 Environments: ${namespace}-env-001 through ${namespace}-env-${environments.toString().padStart(3, '0')}
📁 Base Namespace: ${namespace}
${useMitre ? '⚔️ MITRE ATT&CK techniques included' : ''}
${useAI ? '🤖 AI-powered generation used' : ''}

Perfect for security analyst training and detection rule testing across multiple environments.`,
          },
        ],
      };
    } else {
      // Single environment generation
      if (space !== 'default') {
        await initializeSpace(space);
      }

      await generateCorrelatedCampaign(
        alertCount,
        hostCount,
        userCount,
        space,
        useAI,
        useMitre,
        logVolume,
        timestampConfig,
        namespace,
      );

      return {
        content: [
          {
            type: 'text',
            text: `Successfully generated ${alertCount} correlated security alerts with supporting evidence.

Each alert has ${logVolume} supporting log events for investigation.
Generated with ${hostCount} hosts and ${userCount} users in space '${space}'.
${useMitre ? '⚔️ MITRE ATT&CK techniques included.' : ''}
${useAI ? '🤖 AI-powered generation used.' : ''}

Perfect for security analyst training and detection rule testing.`,
          },
        ],
      };
    }
  }

  private async handleCleanupSecurityData(params: CleanupParams) {
    const {
      type,
      space,
      namespace = 'default',
      logTypes = ['system', 'auth', 'network', 'endpoint'],
    } = params;

    switch (type) {
      case 'alerts':
        await deleteAllAlerts(space);
        return {
          content: [
            {
              type: 'text',
              text: `Successfully deleted all alerts${space ? ` from space '${space}'` : ' from all spaces'}.`,
            },
          ],
        };

      case 'events':
        await deleteAllEvents(space);
        return {
          content: [
            {
              type: 'text',
              text: `Successfully deleted all events${space ? ` from space '${space}'` : ''}.`,
            },
          ],
        };

      case 'logs':
        await deleteAllLogs(logTypes);
        return {
          content: [
            {
              type: 'text',
              text: `Successfully deleted logs from types: ${logTypes.join(', ')}.`,
            },
          ],
        };

      case 'rules':
        await deleteAllRules(space);
        return {
          content: [
            {
              type: 'text',
              text: `Successfully deleted all detection rules${space ? ` from space '${space}'` : ''}.`,
            },
          ],
        };

      case 'knowledge_base':
        return await this.handleDeleteKnowledgeBase({ space, namespace });

      default:
        throw new Error(`Unknown cleanup type: ${type}`);
    }
  }

  private async handleGetMitreTechniques(params: MitreTechniquesParams) {
    const { tactic, includeSubTechniques = false } = params;

    // Import MITRE service functions
    const { loadMitreData, getTechniquesForTactic } = await import(
      './utils/mitre_attack_service.js'
    );
    const mitreData = loadMitreData();

    if (!mitreData) {
      throw new Error('Failed to load MITRE ATT&CK data');
    }

    if (tactic) {
      const techniques = getTechniquesForTactic(mitreData, tactic);
      const filteredTechniques = includeSubTechniques
        ? techniques
        : techniques.filter((t: string) => !t.includes('.'));

      return {
        content: [
          {
            type: 'text',
            text: `MITRE ATT&CK Techniques for tactic '${tactic}':

${filteredTechniques.map((t: string) => `• ${t}`).join('\n')}

Total: ${filteredTechniques.length} techniques${includeSubTechniques ? ' (including sub-techniques)' : ''}`,
          },
        ],
      };
    } else {
      // Return all tactics
      const tactics = Object.keys(mitreData.tactics);

      return {
        content: [
          {
            type: 'text',
            text: `MITRE ATT&CK Tactics:

${tactics.map((t: string) => `• ${t}: ${mitreData.tactics[t].name || t}`).join('\n')}

Total: ${tactics.length} tactics available.`,
          },
        ],
      };
    }
  }

  private async handleGenerateEvents(params: GenerateEventsParams) {
    const {
      eventCount = 50,
      useAI = true,
      useMitre = false,
      subTechniques = false,
      attackChains = false,
      largeScale = false,
      _startDate,
      _endDate,
      _timePattern,
    } = params;

    // Validate parameters
    if (subTechniques && !useMitre) {
      throw new Error('subTechniques requires useMitre to be enabled');
    }
    if (attackChains && !useMitre) {
      throw new Error('attackChains requires useMitre to be enabled');
    }

    await generateEvents(eventCount, useAI, useMitre);

    return {
      content: [
        {
          type: 'text',
          text: `Successfully generated ${eventCount} AI-powered security events.

${useMitre ? '⚔️ MITRE ATT&CK techniques included.' : ''}
${subTechniques ? '🔗 Sub-techniques enabled.' : ''}
${attackChains ? '⛓️ Attack chains enabled.' : ''}
${largeScale ? '⚡ Large-scale optimizations enabled.' : ''}
${useAI ? '🤖 AI-powered generation used.' : ''}

Events indexed to Elasticsearch.`,
        },
      ],
    };
  }

  private async handleGenerateGraph(params: GenerateGraphParams) {
    const { users = 100, maxHosts = 3, useAI = true } = params;

    await generateGraph({
      users,
      maxHosts,
      useAI,
    });

    return {
      content: [
        {
          type: 'text',
          text: `Successfully generated entity relationship graph with ${users} users and up to ${maxHosts} hosts per user.

${useAI ? '🤖 AI-powered generation used.' : ''}

Graph data indexed to Elasticsearch.`,
        },
      ],
    };
  }

  private async handleTestMitreIntegration(params: TestMitreParams) {
    const { alertCount = 5, space = 'default', useAI = true } = params;

    console.error(
      `[MCP] Testing MITRE AI integration with ${alertCount} alerts in space '${space}'...`,
    );

    // Initialize space if not default
    if (space !== 'default') {
      await initializeSpace(space);
    }

    await generateAlerts(alertCount, 3, 2, space, useAI, true);

    return {
      content: [
        {
          type: 'text',
          text: `🧪 MITRE ATT&CK integration test completed successfully!

📊 Generated ${alertCount} test alerts in space '${space}'
⚔️ MITRE ATT&CK techniques included
${useAI ? '🤖 AI-powered generation used' : ''}

Test alerts ready for analysis in Kibana Security app.`,
        },
      ],
    };
  }

  private async handleGenerateDetectionRules(
    params: GenerateDetectionRulesParams,
  ) {
    const {
      ruleCount = 10,
      eventCount = 50,
      interval = '5m',
      fromHours = 24,
      gaps = 0,
      clean = false,
    } = params;

    console.error(
      `[MCP] Generating ${ruleCount} rules and ${eventCount} events...`,
    );
    console.error(`[MCP] Using interval: ${interval}`);
    console.error(`[MCP] Generating events from last ${fromHours} hours`);
    console.error(`[MCP] Generating ${gaps} gaps per rule`);

    if (clean) {
      await deleteAllRules();
    }

    await generateRulesAndAlerts(ruleCount, eventCount, {
      interval,
      from: fromHours,
      gapsPerRule: gaps,
    });

    return {
      content: [
        {
          type: 'text',
          text: `🛡️ Successfully generated ${ruleCount} detection rules and ${eventCount} test events!

📋 Rules: ${ruleCount}
📊 Events: ${eventCount}
⏱️ Interval: ${interval}
📅 From: Last ${fromHours} hours
🕳️ Gaps per rule: ${gaps}
${clean ? '🧹 Previous rules cleaned before generation' : ''}

Rules and events are ready for testing in Kibana Security app.`,
        },
      ],
    };
  }

  private async handleGenerateFields(params: GenerateFieldsParams) {
    const {
      fieldCount = 1000,
      categories,
      outputFormat = 'console',
      filename,
      indexName = 'generated-fields-sample',
      includeMetadata = true,
      createMapping = true,
      updateTemplate = true,
    } = params;

    // Validate parameters
    if (fieldCount < 1 || fieldCount > 50000) {
      throw new Error('fieldCount must be between 1 and 50,000');
    }

    if (categories) {
      const validCategories = getAvailableCategories();
      const invalidCategories = categories.filter(cat => !validCategories.includes(cat));
      if (invalidCategories.length > 0) {
        throw new Error(`Invalid categories: ${invalidCategories.join(', ')}. Valid: ${validCategories.join(', ')}`);
      }
    }

    if (outputFormat === 'file' && !filename) {
      throw new Error('filename is required when outputFormat is "file"');
    }

    console.error(`[MCP] Generating ${fieldCount} fields...`);
    if (categories) {
      console.error(`[MCP] Categories: ${categories.join(', ')}`);
    }

    try {
      await generateFieldsCLI(fieldCount, categories, {
        output: outputFormat,
        filename,
        indexName,
        includeMetadata,
        createMapping,
        updateTemplate,
      });

      const categoryText = categories ? ` focused on ${categories.join(', ')}` : '';
      const outputText = outputFormat === 'elasticsearch'
        ? `indexed to ${indexName}`
        : outputFormat === 'file'
          ? `saved to ${filename}`
          : 'displayed in console';

      return {
        content: [
          {
            type: 'text',
            text: `🔬 Successfully generated ${fieldCount} security fields${categoryText}!

📊 Fields Generated: ${fieldCount}
📁 Categories: ${categories ? categories.join(', ') : 'all'}
📄 Output: ${outputText}
${outputFormat === 'elasticsearch' ? `🗺️ Mapping created: ${createMapping}` : ''}
${outputFormat === 'elasticsearch' ? `📋 Template updated: ${updateTemplate}` : ''}
⚡ Token Reduction: 99% (algorithmic generation)

Perfect for development, testing, and security analytics enhancement.`,
          },
        ],
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Field generation failed: ${errorMessage}`);
    }
  }

  private async handleGenerateKnowledgeBase(params: GenerateKnowledgeBaseParams) {
    const {
      count = 20,
      includeMitre = false,
      namespace = 'default',
      space = 'default',
      categories = [],
      accessLevel,
      confidenceThreshold = 0.0,
    } = params;

    // Validate parameters
    if (count < 1 || count > 1000) {
      throw new Error('count must be between 1 and 1,000');
    }

    if (confidenceThreshold < 0.0 || confidenceThreshold > 1.0) {
      throw new Error('confidenceThreshold must be between 0.0 and 1.0');
    }

    const validCategories = [
      'threat_intelligence',
      'incident_response',
      'vulnerability_management',
      'network_security',
      'endpoint_security',
      'cloud_security',
      'compliance',
      'forensics',
      'malware_analysis',
      'behavioral_analytics',
    ];

    if (categories.length > 0) {
      const invalidCategories = categories.filter(cat => !validCategories.includes(cat));
      if (invalidCategories.length > 0) {
        throw new Error(`Invalid categories: ${invalidCategories.join(', ')}. Valid: ${validCategories.join(', ')}`);
      }
    }

    console.error(`[MCP] Generating ${count} knowledge base documents...`);
    console.error(`[MCP] Categories: ${categories.length > 0 ? categories.join(', ') : 'all'}`);
    console.error(`[MCP] MITRE integration: ${includeMitre}`);

    try {
      await createKnowledgeBaseDocuments({
        count,
        includeMitre,
        namespace,
        space,
        categories,
        accessLevel,
        confidenceThreshold,
      });

      const indexName = space === 'default'
        ? `knowledge-base-security-${namespace}`
        : `knowledge-base-security-${space}-${namespace}`;

      return {
        content: [
          {
            type: 'text',
            text: `🧠 Successfully generated ${count} Knowledge Base documents!

📚 Documents: ${count}
📁 Categories: ${categories.length > 0 ? categories.join(', ') : 'all'}
🔐 Access Level: ${accessLevel || 'mixed'}
🎯 MITRE Integration: ${includeMitre ? 'enabled' : 'disabled'}
📊 Confidence Threshold: ${confidenceThreshold}
📍 Index: ${indexName}

Features:
✅ ELSER v2 semantic text fields for AI Assistant
✅ Suggested questions optimized for AI interactions
✅ Rich security content with proper categorization
✅ MITRE ATT&CK technique mappings (if enabled)

Ready for Elastic AI Assistant knowledge base integration!`,
          },
        ],
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Knowledge base generation failed: ${errorMessage}`);
    }
  }

  private async handleDeleteKnowledgeBase(params: DeleteKnowledgeBaseParams) {
    const { space = 'default', namespace = 'default' } = params;

    try {
      const { getEsClient } = await import('./commands/utils/indices.js');
      const client = getEsClient();

      const indexName = space === 'default'
        ? `knowledge-base-security-${namespace}`
        : `knowledge-base-security-${space}-${namespace}`;

      console.error(`[MCP] Deleting knowledge base documents from: ${indexName}`);

      const exists = await client.indices.exists({ index: indexName });
      if (!exists) {
        return {
          content: [
            {
              type: 'text',
              text: `⚠️ Knowledge base index does not exist: ${indexName}

No action needed - the knowledge base is already clean.`,
            },
          ],
        };
      }

      await client.indices.delete({ index: indexName });

      return {
        content: [
          {
            type: 'text',
            text: `✅ Successfully deleted knowledge base documents!

🗑️ Deleted Index: ${indexName}
📍 Space: ${space}
📁 Namespace: ${namespace}

All knowledge base documents have been removed from this environment.`,
          },
        ],
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Knowledge base deletion failed: ${errorMessage}`);
    }
  }

  private async handleSetupMappings(_params: SetupMappingsParams) {
    console.error('[MCP] Setting up Elasticsearch mappings for security fields...');

    try {
      await setupSecurityMappings();

      return {
        content: [
          {
            type: 'text',
            text: `🔧 Successfully setup Elasticsearch mappings for security fields!

✅ Updated existing security indices with proper field mappings
✅ Created component template: security-multi-fields-component
✅ Configured field limits for enterprise-scale generation

Benefits:
🎯 Multi-field data will be properly typed in Kibana
🔍 Fields will appear in field browser instead of unmapped
📊 Proper visualization and aggregation support
⚡ Better query performance with correct field types

Next steps:
1. Refresh field list in Kibana (Stack Management → Index Patterns → Refresh)
2. New multi-field data will automatically use proper mappings
3. Consider reindexing existing data for best results`,
          },
        ],
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Mapping setup failed: ${errorMessage}`);
    }
  }

  private async handleUpdateMapping(params: UpdateMappingParams) {
    const { indexName } = params;

    console.error('[MCP] Updating existing indices with comprehensive field mappings...');

    try {
      await updateSecurityAlertsMapping(indexName);

      const targetText = indexName ? `index ${indexName}` : 'auto-detected security indices';

      return {
        content: [
          {
            type: 'text',
            text: `🗺️ Successfully updated field mappings for ${targetText}!

✅ Applied comprehensive behavioral analytics field mappings
✅ Updated existing indices to recognize multi-field data
✅ Fixed unmapped field issues in Kibana

Benefits:
🔍 Previously unmapped fields now properly recognized
📊 Enhanced visualization and aggregation capabilities
⚡ Improved query performance with correct field types
🎯 Better compatibility with existing multi-field data

Next steps:
1. Refresh field list in Kibana (Stack Management → Index Patterns → Refresh)
2. Fields should now appear as mapped instead of unmapped
3. Consider reindexing for optimal visualization of existing data`,
          },
        ],
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Mapping update failed: ${errorMessage}`);
    }
  }

  async run(): Promise<void> {
    try {
      console.error('[MCP] Starting server...');

      // Check if config exists
      const fs = await import('fs');
      const { configPath } = await import('./get_config.js');

      if (!fs.existsSync(configPath)) {
        console.error(`
[MCP Server] Configuration file not found at: ${configPath}

Please create a config.json file with your Elasticsearch/Kibana settings:
{
  "elastic": { "node": "https://your-cluster.com", "apiKey": "..." },
  "kibana": { "node": "https://your-kibana.com", "apiKey": "..." },
  "useAI": true,
  "openaiApiKey": "sk-..."
}

See README-MCP.md for configuration details.
        `);
        process.exit(1);
      }

      const transport = new StdioServerTransport();
      await this.server.connect(transport);

      console.error('[MCP] Security Data Generator MCP Server ready');
    } catch (error) {
      console.error('[MCP] Server startup failed:', error);
      throw error;
    }
  }
}

// No duplicate error handlers - they're in the class now

// Start the server
const server = new SecurityDataMCPServer();
server.run().catch((error) => {
  console.error('Failed to start server:', error);
  process.exit(1);
});

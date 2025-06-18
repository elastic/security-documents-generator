#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ErrorCode, ListToolsRequestSchema, McpError, InitializeRequestSchema, } from '@modelcontextprotocol/sdk/types.js';
// Import existing functionality
import { generateAlerts, generateLogs, generateCorrelatedCampaign, deleteAllAlerts, deleteAllEvents, deleteAllLogs, } from './commands/documents.js';
import AttackSimulationEngine from './services/attack_simulation_engine.js';
import { initializeSpace } from './utils/index.js';
import { cleanupAIService } from './utils/ai_service.js';
class SecurityDataMCPServer {
    constructor() {
        // Temporarily disable MCP mode to debug connection issues
        // enableMCPMode();
        this.originalConsoleLog = console.log;
        this.originalConsoleError = console.error;
        // Just redirect console.log to stderr for now
        console.log = (...args) => console.error('[LOG]', ...args);
        this.server = new Server({
            name: 'security-data-generator',
            version: '1.0.0',
        }, {
            capabilities: {
                tools: {},
            },
        });
        this.setupToolHandlers();
        this.setupErrorHandling();
    }
    setupErrorHandling() {
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
            console.error('[MCP] Unhandled Rejection at:', promise, 'reason:', reason);
        });
        process.on('uncaughtException', (error) => {
            console.error('[MCP] Uncaught Exception:', error);
            process.exit(1);
        });
    }
    setupToolHandlers() {
        // Handle initialization
        this.server.setRequestHandler(InitializeRequestSchema, async (request) => {
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
                        description: 'Generate AI-powered security alerts with optional MITRE ATT&CK integration',
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
                                    description: 'Time pattern: uniform, business_hours, random, attack_simulation, weekend_heavy',
                                },
                            },
                        },
                    },
                    {
                        name: 'generate_attack_campaign',
                        description: 'Generate sophisticated multi-stage attack campaigns with realistic progression',
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
                                realistic: {
                                    type: 'boolean',
                                    description: 'Generate realistic source logs that trigger alerts',
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
                            },
                            required: ['campaignType'],
                        },
                    },
                    {
                        name: 'generate_realistic_logs',
                        description: 'Generate realistic source logs for security analysis (Windows, Linux, network, etc.)',
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
                                    description: 'Time pattern: uniform, business_hours, random, attack_simulation, weekend_heavy',
                                },
                            },
                        },
                    },
                    {
                        name: 'generate_correlated_events',
                        description: 'Generate security alerts with correlated supporting logs for investigation',
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
                                    description: 'Time pattern: uniform, business_hours, random, attack_simulation, weekend_heavy',
                                },
                            },
                        },
                    },
                    {
                        name: 'cleanup_security_data',
                        description: 'Clean up generated security data (alerts, events, logs)',
                        inputSchema: {
                            type: 'object',
                            properties: {
                                type: {
                                    type: 'string',
                                    enum: ['alerts', 'events', 'logs'],
                                    description: 'Type of data to clean up',
                                },
                                space: {
                                    type: 'string',
                                    description: 'Kibana space (for alerts/events)',
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
                        description: 'Query and retrieve MITRE ATT&CK techniques and tactics',
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
                        return await this.handleGenerateSecurityAlerts(args);
                    case 'generate_attack_campaign':
                        return await this.handleGenerateAttackCampaign(args);
                    case 'generate_realistic_logs':
                        return await this.handleGenerateRealisticLogs(args);
                    case 'generate_correlated_events':
                        return await this.handleGenerateCorrelatedEvents(args);
                    case 'cleanup_security_data':
                        return await this.handleCleanupSecurityData(args);
                    case 'get_mitre_techniques':
                        return await this.handleGetMitreTechniques(args);
                    default:
                        throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
                }
            }
            catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                throw new McpError(ErrorCode.InternalError, `Tool execution failed: ${errorMessage}`);
            }
        });
    }
    async handleGenerateSecurityAlerts(params) {
        const { alertCount = 10, hostCount = 3, userCount = 2, space = 'default', useAI = true, useMitre = false, startDate, endDate, timePattern, } = params;
        // Initialize space if not default
        if (space !== 'default') {
            await initializeSpace(space);
        }
        const timestampConfig = startDate || endDate || timePattern
            ? {
                startDate,
                endDate,
                pattern: timePattern,
            }
            : {
                startDate: '1h', // Default to last hour if no timestamps specified
                endDate: 'now',
                pattern: 'uniform',
            };
        await generateAlerts(alertCount, hostCount, userCount, space, useAI, useMitre, timestampConfig);
        return {
            content: [
                {
                    type: 'text',
                    text: `Successfully generated ${alertCount} security alerts in space '${space}' with ${hostCount} hosts and ${userCount} users.${useMitre ? ' MITRE ATT&CK techniques included.' : ''}${useAI ? ' AI-powered generation used.' : ''}`,
                },
            ],
        };
    }
    async handleGenerateAttackCampaign(params) {
        const { campaignType, complexity = 'high', targets = 10, events = 100, space = 'default', useAI = true, useMitre = true, realistic = false, logsPerStage = 8, detectionRate = 0.4, } = params;
        // Initialize space if not default
        if (space !== 'default') {
            await initializeSpace(space);
        }
        if (realistic) {
            // Use realistic attack engine
            const { RealisticAttackEngine } = await import('./services/realistic_attack_engine.js');
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
                timestampConfig: {
                    startDate: '2h', // Start 2 hours ago
                    endDate: 'now', // End now
                    pattern: 'attack_simulation',
                },
            };
            const result = await realisticEngine.generateRealisticCampaign(realisticConfig);
            // Index the data to Elasticsearch (this was missing!)
            console.error('[MCP] Indexing realistic campaign data...');
            const { getEsClient } = await import('./commands/utils/indices.js');
            const { indexCheck } = await import('./commands/utils/indices.js');
            const { faker } = await import('@faker-js/faker');
            const logMappings = await import('./mappings/log_mappings.json', {
                assert: { type: 'json' },
            });
            const client = getEsClient();
            const indexOperations = [];
            // Index all stage logs
            for (const stage of result.stageLogs) {
                for (const log of stage.logs) {
                    const dataset = log['data_stream.dataset'] || 'generic.log';
                    const namespace = log['data_stream.namespace'] || 'default';
                    const indexName = `logs-${dataset}-${namespace}`;
                    // Ensure index exists
                    await indexCheck(indexName, {
                        mappings: logMappings.default,
                    });
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
            console.error(`[MCP] Successfully indexed ${indexOperations.length / 2} documents`);
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
        }
        else {
            // Use sophisticated attack simulation engine
            const simulationEngine = new AttackSimulationEngine({
                networkComplexity: complexity,
                enableCorrelation: true,
                enablePerformanceOptimization: events >= 1000,
            });
            const simulation = await simulationEngine.generateAttackSimulation(campaignType, complexity);
            const timestampConfig = {
                startDate: simulation.campaign.duration.start.toISOString(),
                endDate: simulation.campaign.duration.end.toISOString(),
                pattern: 'attack_simulation',
            };
            const correlatedEvents = await simulationEngine.generateCampaignEvents(simulation, targets, events, space, useMitre, timestampConfig);
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
    async handleGenerateRealisticLogs(params) {
        const { logCount = 1000, hostCount = 10, userCount = 5, useAI = false, logTypes = ['system', 'auth', 'network', 'endpoint'], startDate, endDate, timePattern, } = params;
        const timestampConfig = startDate || endDate || timePattern
            ? {
                startDate,
                endDate,
                pattern: timePattern,
            }
            : {
                startDate: '1h', // Default to last hour if no timestamps specified
                endDate: 'now',
                pattern: 'uniform',
            };
        await generateLogs(logCount, hostCount, userCount, useAI, logTypes, timestampConfig);
        return {
            content: [
                {
                    type: 'text',
                    text: `Successfully generated ${logCount} realistic source logs across types: ${logTypes.join(', ')}.

Generated with ${hostCount} hosts and ${userCount} users.
${useAI ? 'AI-powered generation used.' : ''}

Logs indexed to multiple data streams in Elasticsearch.`,
                },
            ],
        };
    }
    async handleGenerateCorrelatedEvents(params) {
        const { alertCount = 10, hostCount = 3, userCount = 2, space = 'default', useAI = true, useMitre = false, logVolume = 6, startDate, endDate, timePattern, } = params;
        // Initialize space if not default
        if (space !== 'default') {
            await initializeSpace(space);
        }
        const timestampConfig = startDate || endDate || timePattern
            ? {
                startDate,
                endDate,
                pattern: timePattern,
            }
            : {
                startDate: '1h', // Default to last hour if no timestamps specified
                endDate: 'now',
                pattern: 'uniform',
            };
        await generateCorrelatedCampaign(alertCount, hostCount, userCount, space, useAI, useMitre, logVolume, timestampConfig);
        return {
            content: [
                {
                    type: 'text',
                    text: `Successfully generated ${alertCount} correlated security alerts with supporting evidence.

Each alert has ${logVolume} supporting log events for investigation.
Generated with ${hostCount} hosts and ${userCount} users in space '${space}'.
${useMitre ? 'MITRE ATT&CK techniques included.' : ''}
${useAI ? 'AI-powered generation used.' : ''}

Perfect for security analyst training and detection rule testing.`,
                },
            ],
        };
    }
    async handleCleanupSecurityData(params) {
        const { type, space, logTypes = ['system', 'auth', 'network', 'endpoint'], } = params;
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
            default:
                throw new Error(`Unknown cleanup type: ${type}`);
        }
    }
    async handleGetMitreTechniques(params) {
        const { tactic, includeSubTechniques = false } = params;
        // Import MITRE service functions
        const { loadMitreData, getTechniquesForTactic } = await import('./utils/mitre_attack_service.js');
        const mitreData = loadMitreData();
        if (!mitreData) {
            throw new Error('Failed to load MITRE ATT&CK data');
        }
        if (tactic) {
            const techniques = getTechniquesForTactic(mitreData, tactic);
            const filteredTechniques = includeSubTechniques
                ? techniques
                : techniques.filter((t) => !t.includes('.'));
            return {
                content: [
                    {
                        type: 'text',
                        text: `MITRE ATT&CK Techniques for tactic '${tactic}':

${filteredTechniques.map((t) => `• ${t}`).join('\n')}

Total: ${filteredTechniques.length} techniques${includeSubTechniques ? ' (including sub-techniques)' : ''}`,
                    },
                ],
            };
        }
        else {
            // Return all tactics
            const tactics = Object.keys(mitreData.tactics);
            return {
                content: [
                    {
                        type: 'text',
                        text: `MITRE ATT&CK Tactics:

${tactics.map((t) => `• ${t}: ${mitreData.tactics[t].name || t}`).join('\n')}

Total: ${tactics.length} tactics available.`,
                    },
                ],
            };
        }
    }
    async run() {
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
        }
        catch (error) {
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

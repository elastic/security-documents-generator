# Security Data Generator - MCP Server

Transform your existing AI-powered security data generator into a **Model Context Protocol (MCP) server** for seamless integration with Claude Desktop, Cursor, and other AI applications. Generate realistic security scenarios, attack campaigns, and supporting evidence for testing, training, and research.

## 🎯 What This Enables

- **Conversational Security Data Generation**: Ask Claude to create specific attack scenarios
- **Realistic Attack Campaigns**: Generate multi-stage attacks with proper log-to-alert progression  
- **MITRE ATT&CK Integration**: Create data mapped to real-world techniques and tactics
- **Investigation Training**: Generate correlated events perfect for SOC analyst training
- **SIEM Testing**: Create realistic data for testing detection rules and dashboards
- **Research & Development**: Generate controlled datasets for security research

## 🚀 Quick Start with MCP

### 1. Install Dependencies
```bash
npm install
# or
yarn install
```

### 2. Configure Your Security Stack
Create or update your `config.json` with Elasticsearch/Kibana credentials and AI providers:

```json
{
  "elastic": {
    "node": "http://localhost:9200",
    "username": "elastic", 
    "password": "changeme"
  },
  "kibana": {
    "node": "http://localhost:5601",
    "username": "elastic",
    "password": "changeme"
  },
  "useAI": true,
  "useAzureOpenAI": true,
  "azureOpenAIApiKey": "your-azure-key",
  "azureOpenAIEndpoint": "https://your-resource.openai.azure.com/",
  "azureOpenAIDeployment": "gpt-4o",
  "mitre": {
    "enabled": true,
    "includeSubTechniques": true,
    "enableAttackChains": true
  }
}
```

### 3. Connect to Claude Desktop

**macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
**Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "security-data-generator": {
      "command": "npx",
      "args": ["tsx", "src/mcp-server.ts"],
      "cwd": "/absolute/path/to/mcp-document-server"
    }
  }
}
```

### 4. Start Using in Claude Desktop

Restart Claude Desktop, then start generating security data conversationally:

**Basic Examples:**
- "Generate 50 realistic security alerts with MITRE ATT&CK techniques"
- "Create a ransomware attack campaign with 200 events across 10 hosts"  
- "Generate 1000 Windows authentication logs for the past week"

**Advanced Examples:**
- "Generate a realistic APT campaign with sophisticated multi-stage progression, including initial access via spear phishing, lateral movement, credential dumping, and data exfiltration. Include realistic source logs with a 70% detection rate."
- "Create a supply chain attack scenario with 500 events, focusing on software compromise and downstream effects across 20 targets"
- "Generate correlated security events perfect for SOC analyst training - 25 alerts with 8 supporting logs each, covering the full MITRE kill chain"

## 🛠️ Available MCP Tools

### `generate_security_alerts`
Generate AI-powered security alerts with optional MITRE ATT&CK integration.

**Parameters:**
- `alertCount` (number): Number of alerts to generate (default: 10)
- `hostCount` (number): Number of unique hosts (default: 3) 
- `userCount` (number): Number of unique users (default: 2)
- `space` (string): Kibana space name (default: "default")
- `useAI` (boolean): Use AI for generation (default: true)
- `useMitre` (boolean): Include MITRE ATT&CK techniques (default: false)
- `startDate` (string): Start date (e.g., "7d", "2024-01-01")
- `endDate` (string): End date (e.g., "now", "2024-01-10") 
- `timePattern` (string): Time pattern (uniform, business_hours, random, attack_simulation, weekend_heavy)

### `generate_attack_campaign`
Generate sophisticated multi-stage attack campaigns with realistic progression.

**Parameters:**
- `campaignType` (required): 'apt', 'ransomware', 'insider', or 'supply_chain'
- `complexity`: 'low', 'medium', 'high', or 'expert' (default: 'high')
- `targets` (number): Number of target hosts (default: 10)
- `events` (number): Number of events to generate (default: 100)
- `space` (string): Kibana space name (default: "default")
- `useAI` (boolean): Use AI for generation (default: true)
- `useMitre` (boolean): Include MITRE ATT&CK techniques (default: true)
- `realistic` (boolean): Generate realistic source logs that trigger alerts (default: false)
- `logsPerStage` (number): Logs per attack stage in realistic mode (default: 8)
- `detectionRate` (number): Detection rate 0.0-1.0 (default: 0.4)

### `generate_realistic_logs`
Generate realistic source logs for security analysis (Windows, Linux, network, etc.).

**Parameters:**
- `logCount` (number): Number of logs to generate (default: 1000)
- `hostCount` (number): Number of unique hosts (default: 10)
- `userCount` (number): Number of unique users (default: 5)
- `useAI` (boolean): Use AI for generation (default: false)
- `logTypes` (array): Types of logs ['system', 'auth', 'network', 'endpoint'] (default: all)
- `startDate` (string): Start date
- `endDate` (string): End date  
- `timePattern` (string): Time pattern

### `generate_correlated_events`
Generate security alerts with correlated supporting logs for investigation.

**Parameters:**
- `alertCount` (number): Number of alerts to generate (default: 10)
- `hostCount` (number): Number of unique hosts (default: 3)
- `userCount` (number): Number of unique users (default: 2)
- `space` (string): Kibana space name (default: "default")
- `useAI` (boolean): Use AI for generation (default: true)
- `useMitre` (boolean): Include MITRE ATT&CK techniques (default: false)
- `logVolume` (number): Supporting logs per alert (default: 6)
- `startDate` (string): Start date
- `endDate` (string): End date
- `timePattern` (string): Time pattern

### `cleanup_security_data`
Clean up generated security data (alerts, events, logs).

**Parameters:**
- `type` (required): 'alerts', 'events', or 'logs'
- `space` (string): Kibana space (for alerts/events)
- `logTypes` (array): Types of logs to delete ['system', 'auth', 'network', 'endpoint'] (default: all)

### `get_mitre_techniques`
Query and retrieve MITRE ATT&CK techniques and tactics.

**Parameters:**
- `tactic` (string): MITRE tactic ID (e.g., "TA0001") or name
- `includeSubTechniques` (boolean): Include sub-techniques (default: false)

## 💡 Comprehensive MCP Usage Examples

### 🎯 Basic Security Data Generation

**Generate Security Alerts**
```
"Create 25 AI-powered security alerts with MITRE ATT&CK techniques across 5 hosts and 3 users"
```
*Uses: `generate_security_alerts` with alertCount=25, hostCount=5, userCount=3, useMitre=true*

**Generate Source Logs**
```
"Generate 2000 realistic Windows and Linux logs for the past 3 days using business hours pattern"
```
*Uses: `generate_realistic_logs` with logCount=2000, startDate="3d", timePattern="business_hours"*

### ⚔️ Advanced Attack Campaign Generation

**APT Campaign with Realistic Detection**
```
"Generate a sophisticated APT campaign with high complexity, 300 events across 15 targets. Include realistic source logs that trigger security alerts with a 70% detection rate. I want to see the full attack progression from initial compromise to data exfiltration."
```
*Uses: `generate_attack_campaign` with campaignType="apt", complexity="high", events=300, targets=15, realistic=true, detectionRate=0.7*

**Ransomware Attack Scenario**
```
"Create a realistic ransomware campaign targeting 8 hosts with 150 security events. Generate the source logs that would trigger these alerts, and simulate what a SOC team would see during the attack progression."
```
*Uses: `generate_attack_campaign` with campaignType="ransomware", targets=8, events=150, realistic=true*

**Supply Chain Attack**
```
"Generate a supply chain attack scenario with medium complexity, affecting 20 downstream targets. Include 400 events and enable realistic log generation with detection patterns that security teams typically see."
```
*Uses: `generate_attack_campaign` with campaignType="supply_chain", complexity="medium", targets=20, events=400, realistic=true*

### 🔍 Investigation Training Scenarios

**Correlated Security Events**
```
"Create 15 security alerts with 8 supporting log events each for SOC analyst training. Include MITRE ATT&CK techniques and make sure each alert has enough context for a proper investigation."
```
*Uses: `generate_correlated_events` with alertCount=15, logVolume=8, useMitre=true*

**Complete Investigation Package**
```
"Generate a complete investigation scenario: Start with 10 high-severity alerts, include 12 supporting logs per alert, and add 500 background noise logs. Focus on credential theft and lateral movement techniques."
```
*Uses: Multiple tools - `generate_correlated_events` + `generate_realistic_logs` for background noise*

### 🧹 Data Management

**Targeted Cleanup**
```
"Clean up all alerts from the 'training' Kibana space and remove all network logs from the past week"
```
*Uses: `cleanup_security_data` with multiple calls for different data types*

**Complete Environment Reset**
```
"Clear all test data: remove alerts from default space, delete all events, and clean up system, auth, network, and endpoint logs"
```
*Uses: Multiple `cleanup_security_data` calls for comprehensive cleanup*

### 📋 MITRE ATT&CK Intelligence

**Technique Research**
```
"Show me all MITRE ATT&CK techniques for the Initial Access tactic, including sub-techniques"
```
*Uses: `get_mitre_techniques` with tactic="TA0001", includeSubTechniques=true*

**Attack Chain Analysis**
```
"List techniques for Persistence and Defense Evasion tactics so I can generate attacks that use these methods"
```
*Uses: Multiple `get_mitre_techniques` calls for different tactics*

### 🏢 Enterprise Testing Scenarios

**Large-Scale Environment Testing**
```
"Generate a realistic enterprise attack scenario: 1000 security events across 50 hosts and 25 users, spanning 7 days with business hours patterns. Include APT-style attack progression with 60% detection rate."
```
*Uses: `generate_attack_campaign` with large-scale parameters*

**Multi-Space Deployment Testing**
```
"Create security data for three different environments: 'production' space with 100 critical alerts, 'staging' with 200 medium alerts, and 'development' with 50 low-severity alerts"
```
*Uses: Multiple `generate_security_alerts` calls with different space parameters*

### 🔬 Research & Development

**Detection Rule Testing**
```
"Generate a dataset perfect for testing detection rules: 500 malicious events that should trigger alerts, plus 2000 benign background logs to test for false positives"
```
*Uses: Combination of `generate_attack_campaign` and `generate_realistic_logs`*

**Time-Series Analysis Data**
```
"Create security data spanning 30 days with varying attack intensities: light activity (10 events/day) for weeks 1-2, moderate activity (50 events/day) for week 3, and heavy attack simulation (200 events/day) for week 4"
```
*Uses: Multiple tool calls with different timestamp configurations*

## 🔧 Advanced Configuration

### AI Providers
The MCP server supports multiple AI providers:
- **OpenAI**: Set `openaiApiKey` in config.json
- **Claude (Anthropic)**: Set `claudeApiKey` and `useClaudeAI: true`
- **Azure OpenAI**: Configure Azure-specific settings

### MITRE ATT&CK Integration
Enable MITRE integration in your config:
```json
{
  "mitre": {
    "enabled": true,
    "includeSubTechniques": false,
    "enableAttackChains": true,
    "chainProbability": 0.3
  }
}
```

### Performance Tuning
For large-scale generation:
```json
{
  "generation": {
    "performance": {
      "enableLargeScale": true,
      "largeScaleThreshold": 1000,
      "requestDelayMs": 100
    }
  }
}
```

## 🏗️ Technical Architecture

### System Overview
The MCP server transforms the existing CLI-based security data generator into a conversational AI-driven system:

```
┌─────────────────────┐    MCP Protocol (JSON-RPC)    ┌──────────────────────┐
│  Claude Desktop     │◄──────────────────────────────►│   MCP Server         │
│  Cursor IDE         │         STDIO Transport        │   (TypeScript)       │
│  Other AI Clients   │                                │                      │
└─────────────────────┘                                └──────────┬───────────┘
                                                                  │
                                                                  │ Function Calls
                                                                  ▼
                                              ┌──────────────────────────────────────┐
                                              │     Existing Business Logic          │
                                              │ ┌──────────────────────────────────┐ │
                                              │ │  🤖 AI Integration Layer         │ │
                                              │ │  • AttackSimulationEngine        │ │
                                              │ │  • RealisticAttackEngine         │ │  
                                              │ │  • CorrelatedAlertGenerator      │ │
                                              │ │  • LogCorrelationEngine          │ │
                                              │ └──────────────────────────────────┘ │
                                              │ ┌──────────────────────────────────┐ │
                                              │ │  📊 Data Generation Services     │ │
                                              │ │  • Alert Generation              │ │
                                              │ │  • Log Generation                │ │
                                              │ │  • Campaign Generation           │ │
                                              │ │  • Correlated Events             │ │
                                              │ └──────────────────────────────────┘ │
                                              │ ┌──────────────────────────────────┐ │
                                              │ │  🛡️ MITRE ATT&CK Integration    │ │
                                              │ │  • Technique Mapping             │ │
                                              │ │  • Attack Chain Generation       │ │
                                              │ │  • Tactic-based Scenarios        │ │
                                              │ └──────────────────────────────────┘ │
                                              └─────────────────┬────────────────────┘
                                                                │
                                                                │ Elasticsearch API
                                                                ▼
                                              ┌──────────────────────────────────────┐
                                              │     Elasticsearch Cluster           │
                                              │ ┌──────────────────────────────────┐ │
                                              │ │  📚 Data Streams & Indices       │ │
                                              │ │  • logs-*-*                     │ │
                                              │ │  • .internal.alerts-*           │ │
                                              │ │  • .kibana-event-log-*          │ │
                                              │ └──────────────────────────────────┘ │
                                              │ ┌──────────────────────────────────┐ │
                                              │ │  🔍 Kibana Visualization         │ │
                                              │ │  • Security App                  │ │
                                              │ │  • Custom Dashboards             │ │
                                              │ │  • Investigation Workflows       │ │
                                              │ └──────────────────────────────────┘ │
                                              └──────────────────────────────────────┘
```

### Key Components

**MCP Server Layer** (`src/mcp-server.ts`)
- **Transport**: STDIO for seamless desktop integration
- **Protocol**: JSON-RPC 2.0 following MCP specification  
- **Tools**: 6 main tools exposing existing functionality
- **Error Handling**: Comprehensive error capture and user-friendly messages
- **Configuration**: Reuses existing `config.json` system

**Business Logic Layer** (Existing Codebase)
- **AI Engines**: Multiple AI service integrations (OpenAI, Claude, Azure)
- **Attack Simulation**: Sophisticated multi-stage attack modeling
- **Correlation**: Realistic log-to-alert progression simulation
- **MITRE Integration**: Full ATT&CK framework support with attack chains

**Data Storage Layer** (Elasticsearch/Kibana)
- **Flexible Indexing**: Automatic index creation and data stream management
- **Space Management**: Multi-tenant support via Kibana spaces
- **Real-time Visualization**: Integration with Kibana Security App

### MCP Tool Mapping

| MCP Tool | Core Function | Business Logic | AI Integration |
|----------|---------------|----------------|----------------|
| `generate_security_alerts` | `generateAlerts()` | Alert generation with entity correlation | ✅ |
| `generate_attack_campaign` | `AttackSimulationEngine` | Multi-stage attack modeling | ✅ |
| `generate_realistic_logs` | `generateLogs()` | Log synthesis across data streams | ✅ |
| `generate_correlated_events` | `generateCorrelatedCampaign()` | Alert-log correlation | ✅ |
| `cleanup_security_data` | `deleteAll*()` functions | Data lifecycle management | ❌ |
| `get_mitre_techniques` | `getMitreService()` | MITRE ATT&CK querying | ❌ |

### Data Flow Architecture

1. **Request Initiation**: AI client sends natural language request via MCP protocol
2. **Tool Resolution**: MCP server maps request to appropriate tool and parameters  
3. **Business Logic Execution**: Tool calls existing services with AI enhancement
4. **Data Generation**: Realistic security data created using AI and correlation engines
5. **Elasticsearch Indexing**: Generated data indexed to appropriate data streams
6. **Response**: Success confirmation with generated data summary returned to AI client

### Performance Characteristics

- **Concurrent Operations**: Supports parallel data generation across multiple tools
- **Batch Processing**: Efficient bulk indexing for large datasets (1000+ events)
- **Memory Management**: Streaming data processing for enterprise-scale generation
- **AI Rate Limiting**: Built-in rate limiting and retry logic for AI API calls
- **Index Optimization**: Automatic index lifecycle management and optimization

## 🚨 Security Considerations

- MCP server runs locally and connects to your Elasticsearch cluster
- AI API keys are stored in local config.json (not shared with Claude)
- Generated data is realistic but synthetic - safe for testing
- No data leaves your environment except for AI API calls

## 🐛 Troubleshooting & Debugging

### 🚫 Server Connection Issues

**Problem**: Claude Desktop can't connect to MCP server
```bash
# Check server can start manually
npx tsx src/mcp-server.ts

# Common fixes:
1. Ensure config.json exists with valid Elasticsearch credentials
2. Use absolute paths in Claude Desktop config (not relative paths)
3. Restart Claude Desktop after config changes
4. Check that npx and tsx are available in your PATH
```

**Problem**: "Configuration file not found" error
```bash
# Create config.json from template
cp config.example.json config.json
# Edit with your Elasticsearch/AI credentials
```

**Problem**: MCP protocol errors with emojis/formatting
```bash
# This is handled automatically - output is filtered to stderr
# If issues persist, check Claude Desktop logs for specific errors
```

### ⚠️ Data Generation Failures

**Problem**: "Failed to index data" errors
```bash
# Check Elasticsearch connectivity
curl -u elastic:changeme http://localhost:9200/_cluster/health

# Verify Kibana space exists (if not using 'default')
curl -u elastic:changeme http://localhost:5601/api/spaces/space/your-space-name
```

**Problem**: AI generation timeouts or quota errors
```bash
# Check AI provider status and quotas
# OpenAI: Check dashboard.openai.com usage
# Azure: Check Azure portal for rate limits
# Claude: Check console.anthropic.com usage

# Reduce batch sizes in config.json:
{
  "generation": {
    "alerts": { "batchSize": 5 },
    "performance": { "requestDelayMs": 500 }
  }
}
```

**Problem**: MITRE ATT&CK data not loading
```bash
# Ensure MITRE data files exist
ls -la src/data/mitre/
# If missing, check if git LFS files were downloaded properly
```

### 🔧 Performance Optimization

**Large Dataset Generation** (1000+ events)
```json
{
  "generation": {
    "performance": {
      "enableLargeScale": true,
      "largeScaleThreshold": 1000,
      "maxConcurrentRequests": 3,
      "requestDelayMs": 200
    }
  }
}
```

**Memory Usage** (Enterprise environments)
```json
{
  "generation": {
    "alerts": { "batchSize": 25 },
    "events": { "batchSize": 40 },
    "performance": { "maxCacheSize": 500 }
  }
}
```

### 📊 Monitoring & Logging

**Enable Debug Logging**
- MCP server logs appear in Claude Desktop's console/logs
- Set `NODE_ENV=development` for additional debugging
- Monitor Elasticsearch logs for indexing issues

**Common Log Messages**
```bash
[MCP] Security Data Generator MCP Server ready          # ✅ Server started
[MCP] Tool call requested: generate_attack_campaign     # 📞 Tool invocation
[MCP] Indexing realistic campaign data...               # 💾 Data being indexed
[MCP] Successfully indexed 245 documents                # ✅ Data indexed
```

## 📚 Repository Structure & Documentation

### 🗂️ Key Files & Directories

```
mcp-document-server/
├── src/
│   ├── mcp-server.ts                 # MCP server implementation
│   ├── commands/
│   │   ├── documents.ts              # Core data generation functions
│   │   └── utils/indices.js          # Elasticsearch utilities
│   ├── services/
│   │   ├── attack_simulation_engine.ts    # AI-powered attack modeling
│   │   ├── realistic_attack_engine.ts     # Realistic attack progression
│   │   ├── correlated_alert_generator.ts  # Alert-log correlation
│   │   └── log_correlation_engine.ts      # Log synthesis engine
│   ├── utils/
│   │   ├── mcp_wrapper.ts            # MCP protocol helpers
│   │   ├── ai_service.ts             # Multi-provider AI integration
│   │   └── mitre_attack_service.ts   # MITRE ATT&CK framework
│   └── mappings/                     # Elasticsearch mappings
├── config.json                      # Configuration (create from template)
├── package.json                     # Dependencies & scripts
├── README-MCP.md                    # This documentation
└── claude-desktop-config.json       # Example Claude Desktop config
```

### 📖 Additional Documentation

**Core Functionality**
- **Main README.md**: CLI usage and original functionality
- **src/services/**: AI-powered attack simulation and correlation engines
- **src/commands/**: Data generation and Elasticsearch integration

**Configuration & Setup**
- **get_config.ts**: Configuration loading and validation
- **utils/create_config_on_first_run.ts**: Interactive configuration setup
- **mappings/**: Elasticsearch index templates and mappings

**MITRE ATT&CK Integration**
- **utils/mitre_attack_service.ts**: Framework integration and technique mapping
- **data/mitre/**: MITRE ATT&CK data files (tactics, techniques, mappings)

### 🔗 Integration Patterns

**Multi-Tool Workflows**
```javascript
// Example: Generate complete investigation scenario
1. generate_attack_campaign (realistic=true, detectionRate=0.7)
2. generate_realistic_logs (background noise)
3. generate_correlated_events (additional alerts)
4. get_mitre_techniques (research phase)
```

**Configuration Inheritance**
- MCP tools inherit from `config.json` defaults
- Runtime parameters override configuration settings
- AI providers configured globally, used across all tools

**Data Stream Management**
- Automatic index creation with proper mappings
- Data stream lifecycle management
- Multi-space support for environment isolation

---

## 🚀 Ready to Start?

1. **Clone & Configure**: Set up your `config.json` with Elasticsearch and AI credentials
2. **Connect Claude**: Add MCP server to Claude Desktop configuration  
3. **Generate Data**: Start with simple requests and scale to complex scenarios
4. **Explore & Learn**: Use generated data for SIEM testing, SOC training, and security research

**Example First Request:**
```
"Generate a small APT attack campaign with 50 events across 3 hosts, include realistic source logs with 60% detection rate, and show me what a security analyst would see in Kibana"
```

Transform your security testing and training with conversational AI-powered data generation! 🎯
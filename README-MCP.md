# Security Data Generator - MCP Server (Enterprise Edition)

Transform your existing AI-powered security data generator into a **Model Context Protocol (MCP) server** with **100% feature parity** with the CLI. Generate realistic security scenarios, multi-environment attack campaigns, and enterprise-scale datasets for testing, training, and research.

## 🌟 **Features**

- **🌍 Multi-Environment Generation**: Scale across 100s-1000s of simulated environments
- **🔬 Multi-Field Generation**: Up to 50,000 additional security fields per document
- **⚔️ Advanced MITRE Integration**: Sub-techniques, attack chains, and tactic focusing
- **📱 Session View Compatibility**: Elastic Security process hierarchy support
- **🎯 False Positive Testing**: Generate realistic false positives for rule tuning
- **⚡ Enterprise Performance**: Optimizations for large-scale data generation

## 🎯 What This Enables

- **Conversational Security Data Generation**: Ask Claude to create specific attack scenarios
- **Enterprise-Scale Testing**: Generate data across hundreds of simulated environments
- **Advanced MITRE ATT&CK Integration**: Create data mapped to real-world techniques with attack chains
- **Investigation Training**: Generate correlated events perfect for SOC analyst training
- **SIEM Performance Testing**: Create realistic datasets for testing detection rules and dashboards
- **Research & Development**: Generate controlled datasets with extensive forensic context

## 🚀 Quick Start with Enhanced MCP

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
  "useClaudeAI": true,
  "claudeApiKey": "sk-ant-...",
  "mitre": {
    "enabled": true,
    "includeSubTechniques": true,
    "enableAttackChains": true,
    "chainProbability": 0.4
  },
  "generation": {
    "performance": {
      "enableLargeScale": true,
      "largeScaleThreshold": 1000
    }
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
      "args": ["tsx", "src/mcp_server.ts"],
      "cwd": "/absolute/path/to/security-documents-generator"
    }
  }
}
```

### 4. Start Using Enterprise Features in Claude Desktop

Restart Claude Desktop, then start generating security data with enterprise capabilities:

**🌍 Multi-Environment Examples:**
- "Generate 100 security alerts across 25 production environments using namespace 'datacenter'"
- "Create an APT campaign across 50 environments with 200 events each, including multi-field generation with 3000 additional fields"

**🔬 Multi-Field Examples:**
- "Generate 500 logs with 5000 additional behavioral analytics and threat intelligence fields per log"
- "Create security alerts with 10000 additional forensics fields optimized for performance mode"

**⚔️ Advanced MITRE Examples:**
- "Generate a ransomware campaign with MITRE sub-techniques and attack chains enabled, focusing on the Defense Evasion tactic"
- "Create an insider threat scenario using advanced MITRE features with realistic attack progression"

## 🛠️ Enhanced MCP Tools (100% CLI Parity)

### `generate_security_alerts`
Generate AI-powered security alerts with enterprise multi-environment and multi-field support.

**🆕 NEW Parameters:**
- `namespace` (string): Custom namespace for alert indices (default: "default")
- `environments` (number): Generate across multiple environment namespaces (default: 1)
- `subTechniques` (boolean): Include MITRE sub-techniques (requires useMitre)
- `attackChains` (boolean): Generate realistic attack chains (requires useMitre)
- `largeScale` (boolean): Enable performance optimizations for large datasets
- `focusTactic` (string): Focus on specific MITRE tactic (e.g., "TA0001")
- `falsePositiveRate` (number): Percentage of alerts to mark as false positives (0.0-1.0)
- `multiField` (boolean): Generate hundreds of additional contextual security fields
- `fieldCount` (number): Number of additional fields to generate (1-50,000)
- `fieldCategories` (array): Specific field categories to include
- `fieldPerformanceMode` (boolean): Optimize multi-field generation for speed

**Existing Parameters:**
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
Generate sophisticated multi-stage attack campaigns with enterprise-scale capabilities.

**🆕 NEW Parameters:**
- `namespace` (string): Custom namespace for campaign data indices
- `environments` (number): Generate campaigns across multiple environment namespaces
- `subTechniques` (boolean): Include MITRE sub-techniques
- `attackChains` (boolean): Generate realistic attack chains
- `largeScale` (boolean): Enable performance optimizations
- `startDate` (string): Start date for campaign timeline
- `endDate` (string): End date for campaign timeline
- `timePattern` (string): Time distribution pattern
- `multiField` (boolean): Generate additional contextual security fields
- `fieldCount` (number): Number of additional fields per event
- `fieldCategories` (array): Specific field categories
- `fieldPerformanceMode` (boolean): Optimize for speed

**Existing Parameters:**
- `campaignType` (required): 'apt', 'ransomware', 'insider', or 'supply_chain'
- `complexity`: 'low', 'medium', 'high', or 'expert' (default: 'high')
- `targets` (number): Number of target hosts (default: 10)
- `events` (number): Number of events to generate (default: 100)
- `space` (string): Kibana space name (default: "default")
- `useAI` (boolean): Use AI for generation (default: true)
- `useMitre` (boolean): Include MITRE ATT&CK techniques (default: true)
- `realistic` (boolean): Generate realistic source logs that trigger alerts
- `logsPerStage` (number): Logs per attack stage in realistic mode (default: 8)
- `detectionRate` (number): Detection rate 0.0-1.0 (default: 0.4)

### `generate_realistic_logs`
Generate realistic source logs with enterprise features and Elastic Security compatibility.

**🆕 NEW Parameters:**
- `namespace` (string): Custom namespace for log indices
- `environments` (number): Generate logs across multiple environment namespaces
- `multiField` (boolean): Generate additional contextual security fields
- `fieldCount` (number): Number of additional fields to generate
- `fieldCategories` (array): Specific field categories to include
- `fieldPerformanceMode` (boolean): Optimize multi-field generation for speed
- `sessionView` (boolean): Generate Session View compatible data with process hierarchies
- `visualAnalyzer` (boolean): Generate Visual Event Analyzer compatible data

**Existing Parameters:**
- `logCount` (number): Number of logs to generate (default: 1000)
- `hostCount` (number): Number of unique hosts (default: 10)
- `userCount` (number): Number of unique users (default: 5)
- `useAI` (boolean): Use AI for generation (default: false)
- `logTypes` (array): Types of logs ['system', 'auth', 'network', 'endpoint']
- `startDate` (string): Start date
- `endDate` (string): End date
- `timePattern` (string): Time pattern

### `generate_correlated_events`
Generate security alerts with correlated supporting logs with multi-environment support.

**🆕 NEW Parameters:**
- `namespace` (string): Custom namespace for correlated data indices
- `environments` (number): Generate correlated data across multiple environment namespaces

**Existing Parameters:**
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

### `generate_events`
Generate AI-powered security events with optional MITRE ATT&CK scenarios.

**Parameters:**
- `eventCount` (number): Number of events to generate (default: 50)
- `useAI` (boolean): Use AI for generation (default: true)
- `useMitre` (boolean): Include MITRE ATT&CK techniques (default: false)
- `subTechniques` (boolean): Include MITRE sub-techniques (requires useMitre)
- `attackChains` (boolean): Generate realistic attack chains (requires useMitre)
- `largeScale` (boolean): Enable performance optimizations for large datasets
- `startDate` (string): Start date
- `endDate` (string): End date
- `timePattern` (string): Time distribution pattern

### `generate_graph`
Generate AI-powered entity relationship graph with realistic alerts.

**Parameters:**
- `users` (number): Number of users to generate (default: 100)
- `maxHosts` (number): Maximum hosts per user (default: 3)
- `useAI` (boolean): Use AI for generation (default: true)

### `test_mitre_integration`
Test MITRE ATT&CK AI integration by generating sample alerts.

**Parameters:**
- `alertCount` (number): Number of test alerts to generate (default: 5)
- `space` (string): Kibana space to use (default: "default")
- `useAI` (boolean): Use AI for generation (default: true)

### `generate_detection_rules`
Generate detection rules and test events.

**Parameters:**
- `ruleCount` (number): Number of rules to generate (default: 10)
- `eventCount` (number): Number of events to generate (default: 50)
- `interval` (string): Rule execution interval (default: "5m")
- `fromHours` (number): Generate events from last N hours (default: 24)
- `gaps` (number): Amount of gaps per rule (default: 0)
- `clean` (boolean): Clean gap events before generating rules (default: false)

### `cleanup_security_data`
Clean up generated security data including detection rules.

**🆕 NEW Parameters:**
- `type` (required): 'alerts', 'events', 'logs', or **'rules'**

**Existing Parameters:**
- `space` (string): Kibana space (for alerts/events/rules)
- `logTypes` (array): Types of logs to delete

### `get_mitre_techniques`
Query and retrieve MITRE ATT&CK techniques and tactics.

**Parameters:**
- `tactic` (string): MITRE tactic ID (e.g., "TA0001") or name
- `includeSubTechniques` (boolean): Include sub-techniques (default: false)

## 💡 Enterprise Usage Examples

### 🌍 **Multi-Environment Enterprise Scenarios**

**Large-Scale Production Testing**
```
Generate security alerts across 100 production environments with 50 alerts each, using namespace "datacenter" and include multi-field generation with 2000 additional fields focused on behavioral analytics and forensics analysis
```
*Result: 5,000 alerts across datacenter-env-001 through datacenter-env-100*

**Multi-Region Campaign Simulation**
```
Create an APT attack campaign across 50 staging environments with 200 events per environment, include realistic mode with 8 logs per stage and 30% detection rate, add 3000 additional security fields in performance mode
```
*Result: Coordinated APT campaign across 50 environments with 10,000+ total events*

**Geographic Distribution Testing**
```
Generate realistic logs across 25 environments using different namespaces: 10 environments with "us-east", 10 with "eu-west", and 5 with "asia-pacific", each with 1000 logs including Session View compatibility
```

### 🔬 **Multi-Field Generation Scenarios**

**Ultra-High Density Forensics**
```
Generate 100 security alerts with 10000 additional fields per alert, focusing on forensics analysis, malware analysis, and cloud security categories, optimized for performance mode
```
*Result: 1 million+ additional forensic fields across 100 alerts*

**Behavioral Analytics Dataset**
```
Create 500 logs with 5000 additional fields focusing on behavioral analytics and threat intelligence, include user behavior anomaly scores and host behavior baselines
```

**Enterprise Scale Performance Testing**
```
Generate 1000 security alerts with 25000 additional fields each using algorithmic expansion for enterprise scale testing across 10 environments
```
*Result: 25 million+ additional fields with 99% token reduction*

### ⚔️ **Advanced MITRE ATT&CK Scenarios**

**Focused Tactic Analysis**
```
Generate a sophisticated ransomware campaign focusing on the Defense Evasion tactic (TA0005), include sub-techniques and attack chains, with 300 events across 15 targets
```

**Attack Chain Progression**
```
Create an insider threat scenario with MITRE attack chains enabled, include sub-techniques for Persistence and Privilege Escalation tactics, generate realistic progression across 5 stages
```

**Technique Coverage Testing**
```
Test MITRE ATT&CK integration with 25 alerts covering Initial Access techniques, include sub-techniques and validate attack chain generation
```

### 📱 **Elastic Security Integration**

**Session View Compatible Dataset**
```
Generate 2000 endpoint logs with Session View compatibility, include process hierarchies and terminal output, focus on process injection and lateral movement scenarios
```

**Visual Event Analyzer Data**
```
Create 1000 system and endpoint logs with Visual Event Analyzer compatibility, include process entity tracking and session leader relationships for threat hunting
```

**Complete Elastic Security Demo**
```
Generate a comprehensive dataset: 100 alerts with Session View data, 500 supporting logs with Visual Event Analyzer compatibility, include multi-field generation with 1000 additional fields per event
```

### 🎯 **False Positive Testing**

**Detection Rule Tuning**
```
Generate 200 security alerts with 25% false positive rate, include resolution metadata and SOC analyst information for testing detection rule accuracy
```

**Baseline Establishment**
```
Create 1000 alerts with 15% false positive rate across different categories: maintenance, authorized tools, normal business operations, and configuration changes
```

### 🏗️ **Detection Rules & Testing**

**Complete Rule Development Cycle**
```
Generate 10 detection rules with 100 test events each, use 2-hour lookback window and include 3 gaps per rule for testing rule effectiveness
```

**Performance Testing Framework**
```
Create 25 detection rules with 200 events each, clean existing rules first, use 1-day lookback for comprehensive performance testing
```

### 🧹 **Enterprise Data Management**

**Multi-Environment Cleanup**
```
Clean up all security alerts from environments datacenter-env-001 through datacenter-env-050, then remove all detection rules from the production space
```

**Comprehensive Reset**
```
Delete all security data: remove alerts from all spaces, clean up detection rules, remove all log types (system, auth, network, endpoint)
```

## 🚀 **Enterprise Architecture & Performance**

### Multi-Environment Index Architecture
```
📁 Production Environments (100 environments)
├── logs-system.system-prod-env-001
├── logs-system.system-prod-env-002
├── ...
├── logs-system.system-prod-env-100
├── .alerts-security.alerts-prod-env-001
├── .alerts-security.alerts-prod-env-002
├── ...
└── .alerts-security.alerts-prod-env-100

📁 Staging Environments (50 environments)
├── logs-*-staging-env-001 through staging-env-050
└── .alerts-security.alerts-staging-env-001 through staging-env-050
```

### Performance Characteristics

**🌍 Multi-Environment Scaling**
- **Horizontal Scaling**: 100s-1000s of simulated environments
- **Index Distribution**: Each environment gets dedicated indices
- **Namespace Isolation**: Complete data separation
- **Parallel Generation**: Concurrent environment processing

**🔬 Multi-Field Performance**
- **99% Token Reduction**: No AI calls for field generation
- **Enterprise Performance**: <1s for 25,000+ fields per document
- **Realistic Correlations**: CPU high → memory high correlation
- **Context Awareness**: Attack scenarios get security fields
- **Unlimited Scale**: Generate millions of enriched fields

**⚡ Large-Scale Optimizations**
- **Batch Processing**: Optimized for 1000+ events
- **Memory Management**: Streaming for enterprise datasets
- **AI Rate Limiting**: Built-in retry logic
- **Index Optimization**: Automatic lifecycle management

## 🔧 Advanced Enterprise Configuration

### Multi-Field Categories (50,000+ Fields Support)

```json
{
  "multiField": {
    "defaultFieldCount": 1000,
    "enableExpandedFields": true,
    "categories": {
      "behavioral_analytics": {
        "weight": 10,
        "fields": ["user_behavior.*", "host_behavior.*", "entity_behavior.*"]
      },
      "threat_intelligence": {
        "weight": 9,
        "fields": ["threat.enrichment.*", "threat.actor.*", "threat.ttp.*"]
      },
      "forensics_analysis": {
        "weight": 8,
        "expandedFieldCount": 2000,
        "fields": ["forensics.*", "memory.*", "registry.*", "browser.*"]
      },
      "cloud_security": {
        "weight": 7,
        "expandedFieldCount": 1500,
        "fields": ["aws.*", "azure.*", "gcp.*", "container.*"]
      }
    }
  }
}
```

### Enterprise Performance Tuning

```json
{
  "generation": {
    "performance": {
      "enableLargeScale": true,
      "largeScaleThreshold": 1000,
      "multiEnvironmentOptimization": true,
      "maxConcurrentEnvironments": 10,
      "multiFieldOptimization": {
        "enableAlgorithmicExpansion": true,
        "expansionThreshold": 1000,
        "performanceModeDefault": true
      }
    }
  }
}
```

### MITRE Enterprise Configuration

```json
{
  "mitre": {
    "enabled": true,
    "includeSubTechniques": true,
    "enableAttackChains": true,
    "chainProbability": 0.4,
    "enterpriseFeatures": {
      "tacticFocusing": true,
      "advancedCorrelation": true,
      "realisticProgression": true
    }
  }
}
```

## 🔍 **Testing Your Enterprise Setup**

### Quick Verification Commands

**Test Multi-Environment**
```
Generate 10 alerts across 3 environments using namespace "test"
```

**Test Multi-Field Generation**
```
Generate 5 logs with 500 additional fields focused on behavioral analytics
```

**Test Advanced MITRE**
```
Create an APT campaign with sub-techniques and attack chains enabled
```

**Test Session View**
```
Generate 100 endpoint logs with Session View compatibility
```

**Test All New Tools**
```
Test the MITRE ATT&CK integration with 3 alerts, then generate 5 detection rules with 10 events each
```

### Success Indicators

✅ **Multi-Environment Responses:**
- "🌍 Successfully generated X alerts across Y environments"
- "📁 Environments: namespace-env-001 through namespace-env-XXX"

✅ **Multi-Field Responses:**
- "🔬 Multi-Field Generation: X additional fields per document"
- "⚡ Performance Mode: Yes/No"
- "🎯 Token Reduction: 99%"

✅ **Advanced MITRE Responses:**
- "🔗 Sub-techniques enabled"
- "⛓️ Attack chains enabled"
- "🎯 Focusing on MITRE tactic: TAXXXX"

✅ **Enterprise Features:**
- "📱 Session View compatibility enabled"
- "👁️ Visual Event Analyzer compatibility enabled"
- "🎭 False positive rate: X%"

## 🚨 Security & Compliance

- **Data Isolation**: Complete separation between environments via namespaces
- **Performance Monitoring**: Built-in metrics for enterprise-scale operations
- **Compliance Ready**: Generate audit trails and compliance datasets
- **Secure by Design**: All data generation happens locally with your Elasticsearch cluster

---

## 🌟 **Ready for Enterprise Scale?**

The enhanced MCP server now provides **100% feature parity** with the CLI, plus enterprise-scale capabilities for multi-environment simulation and advanced security analytics. Transform your security testing and training with conversational AI-powered data generation at enterprise scale!

**Start with this enterprise example:**
```
Generate a sophisticated APT campaign across 25 production environments with 200 events each, include realistic mode with 30% detection rate, add 5000 additional forensics and threat intelligence fields per event, and make it compatible with Elastic Security Session View
```

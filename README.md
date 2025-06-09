# Security Documents Generator
> **Note:** For compatibility with Elasticsearch 8.18 and below, checkout the tag `8.18-compatibility`.

Generate fake data for testing and development. Configure your Elasticsearch environment via basic auth or API key, and use the various commands to generate, manipulate, and clean data.

## Getting started

1. Install dependencies: `yarn`

2. Choose a command to run or simply run `yarn start`, you will be guided to generate a config file.

3. *Optional* you can change `config.json` and provide different credentials for elasticsearch at any time.

You can provide apiKey for Cloud/Serverless, or just username/password.

Examples of config:

```
{
    "elastic": {
        "node": "https://test.es.us-west2.gcp.elastic-cloud.com",
        "apiKey": "ASdlkk=="

    },
    "kibana": {
        "node": "https://test.kb.us-west2.gcp.elastic-cloud.com:9243",
        "apiKey": "asdasdasd=="
    }
}
```


```
{
    "elastic": {
        "node": "http://localhost:9200",
        "username": "elastic",
        "password": "changeme"
    },
    "kibana": {
        "node": "http://127.0.0.1:5601",
        "username": "elastic",
        "password": "changeme"
    },
    "eventIndex": ""
}
```

## Commands

### Entity store

`yarn start entity-store` - Generate data for entity store

`yarn start clean-entity-store` - Clean data for entity store

### Alerts
`yarn start help` - To see the commands list

`yarn start generate-alerts -n <number of alerts> -h <number of hosts within the alerts> -u <number of users within the alerts> -s <optional space> --ai` - Use the `--ai` flag to generate more realistic alerts using AI

`yarn start delete-alerts` - Delete all alerts

### Events

`yarn start generate-events <number of events> --ai` - Generate events, optionally using AI for more realistic data

`yarn start delete-events` - Delete all events

### API tests

`yarn start test-risk-score` - Test risk score API time response

## AI-Generated Data

The tool now supports AI-powered data generation for more realistic and varied security documents using multiple AI providers. To use this feature:

### AI Provider Options

#### 1. OpenAI
```json
{
    "elastic": { ... },
    "kibana": { ... },
    "useAI": true,
    "openaiApiKey": "your-openai-api-key-here"
}
```

#### 2. Azure OpenAI
```json
{
    "elastic": { ... },
    "kibana": { ... },
    "useAI": true,
    "useAzureOpenAI": true,
    "azureOpenAIApiKey": "your-azure-openai-api-key",
    "azureOpenAIEndpoint": "https://your-resource-name.openai.azure.com",
    "azureOpenAIDeployment": "your-deployment-name",
    "azureOpenAIApiVersion": "2023-05-15"
}
```

#### 3. Claude (Anthropic) - NEW
```json
{
    "elastic": { ... },
    "kibana": { ... },
    "useAI": true,
    "useClaudeAI": true,
    "claudeApiKey": "your-anthropic-api-key-here",
    "claudeModel": "claude-3-5-sonnet-20241022"
}
```

### Usage with AI Providers

#### Basic AI Generation:
```bash
yarn start generate-alerts -n 100 -h 10 -u 10 --ai
yarn start generate-events 100 --ai
yarn start generate-graph --ai
```

#### Using Claude AI:
```bash
yarn start generate-alerts -n 100 -h 10 -u 10 --ai --claude
yarn start generate-events 100 --ai --claude
```

#### AI Provider Priority:
- If `--claude` flag is used or `useClaudeAI: true`, Claude takes precedence
- Otherwise, uses Azure OpenAI if configured, or standard OpenAI

The AI generation works by:
- Using the mapping schemas to understand the expected data structure
- Analyzing example documents to learn patterns
- Generating more realistic security data with proper relationships between fields
- Mixing AI-generated data with standard generation for better performance

To preserve performance, the tool uses AI for generating a subset of documents (approximately 1 in 3 or 1 in 5) and falls back to standard generation for the rest.

## 🎯 **Advanced Attack Campaign Generation**

This tool includes sophisticated attack campaign generation capabilities for realistic security testing scenarios.

### **🎭 Attack Campaign Types**

#### **Advanced Persistent Threat (APT) Campaigns:**
```bash
# Generate sophisticated APT campaign
yarn start generate-campaign apt --ai --mitre --events 100
```

#### **Ransomware Attack Scenarios:**
```bash
# Generate ransomware campaign with realistic patterns
yarn start generate-campaign ransomware --ai --mitre --events 50
```

#### **Insider Threat Scenarios:**
```bash
# Generate insider threat detection scenarios
yarn start generate-campaign insider --ai --mitre --events 30
```

### **🔧 Campaign Configuration**

Add campaign configuration to `config.json`:

```json
{
  "campaigns": {
    "enabled": true,
    "defaultType": "apt",
    "complexity": "medium"
  }
}
```

---

## 🚀 **MITRE ATT&CK Integration**

This tool supports advanced MITRE ATT&CK framework integration for realistic security testing.

### **Features**

#### **✅ Implemented Features:**
- **Sub-techniques Support**: Generate alerts with MITRE sub-techniques (e.g., T1566.001, T1078.002)
- **Attack Chains**: Multi-stage attack scenarios with technique progression
- **AI Integration**: Enhanced AI-powered generation with MITRE context
- **Performance Optimization**: Efficient batch processing for large datasets
- **Dynamic Risk Scoring**: Severity adjustment based on technique combinations

#### **🎯 MITRE Configuration**

Add this to your `config.json`:

```json
{
  "mitre": {
    "enabled": true,
    "tactics": ["TA0001", "TA0002", "TA0003", "TA0004", "TA0005"],
    "maxTechniquesPerAlert": 2,
    "includeSubTechniques": false,
    "probabilityOfMitreAlert": 0.3,
    "enableAttackChains": false,
    "maxChainLength": 3,
    "chainProbability": 0.15
  },
  "generation": {
    "alerts": {
      "defaultCount": 100,
      "batchSize": 10,
      "largeBatchSize": 25,
      "maxLargeBatchSize": 50,
      "parallelBatches": 3
    },
    "performance": {
      "enableLargeScale": false,
      "largeScaleThreshold": 1000,
      "maxConcurrentRequests": 5,
      "requestDelayMs": 100,
      "cacheEnabled": true,
      "maxCacheSize": 200,
      "progressReporting": true
    }
  }
}
```

### **📋 Command Reference**

| Command | Description | AI Flags |
|---------|-------------|---------------------|
| `generate-alerts` | Generate security alerts | `--ai`, `--claude`, `--mitre`, `--sub-techniques`, `--attack-chains`, `--large-scale`, `--start-date`, `--end-date`, `--time-pattern` |
| `generate-events` | Generate security events | `--ai`, `--claude`, `--mitre`, `--sub-techniques`, `--attack-chains`, `--large-scale`, `--start-date`, `--end-date`, `--time-pattern` |

#### **Command-Line Flags:**

##### **AI Provider Flags:**
- `--ai`: Enable AI-powered generation (required for all AI features)
- `--claude`: Use Claude AI instead of OpenAI (requires `--ai`)

##### **MITRE ATT&CK Flags:**
- `--mitre`: Use MITRE ATT&CK framework (requires `--ai`)
- `--sub-techniques`: Include MITRE sub-techniques (requires `--mitre`)
- `--attack-chains`: Generate realistic attack chains (requires `--mitre`)

##### **Performance & Timing Flags:**
- `--large-scale`: Enable performance optimizations for large datasets
- `--start-date <date>`: Start date for data generation (e.g., "7d", "1w", "2024-01-01")
- `--end-date <date>`: End date for data generation (e.g., "now", "1d", "2024-01-10")
- `--time-pattern <pattern>`: Time distribution pattern for realistic scenarios

### **🔧 Usage Examples**

#### **Basic MITRE Generation:**
```bash
yarn start generate-alerts -n 10 -h 5 -u 3 --ai --mitre
```

#### **MITRE with Claude AI:**
```bash
yarn start generate-alerts -n 10 -h 5 -u 3 --ai --claude --mitre
```

#### **Sub-techniques:**
```bash
yarn start generate-alerts -n 10 -h 5 -u 3 --ai --mitre --sub-techniques
```

#### **Attack Chains:**
```bash
yarn start generate-alerts -n 20 -h 10 -u 5 --ai --mitre --attack-chains
```

#### **Claude with Advanced Features:**
```bash
yarn start generate-alerts -n 50 -h 20 -u 10 --ai --claude --mitre --sub-techniques --attack-chains
```

#### **Large-Scale Generation:**
```bash
yarn start generate-alerts -n 2000 -h 100 -u 50 --ai --mitre --large-scale
```

#### **Combined Features:**
```bash
yarn start generate-alerts -n 1000 -h 50 -u 25 --ai --mitre --sub-techniques --attack-chains --large-scale
```

#### **Multi-Day Timestamp Generation:**
```bash
# Generate alerts over the last 7 days with business hours pattern
yarn start generate-alerts -n 100 -h 10 -u 5 --start-date "7d" --end-date "now" --time-pattern "business_hours"

# Generate weekend-heavy activity over 2 weeks
yarn start generate-alerts -n 200 -h 20 -u 10 --start-date "2w" --time-pattern "weekend_heavy"

# Simulate attack patterns over 1 month
yarn start generate-alerts -n 500 -h 50 -u 25 --ai --mitre --attack-chains --start-date "1M" --time-pattern "attack_simulation"

# Generate data for specific date range
yarn start generate-alerts -n 50 -h 5 -u 3 --start-date "2024-01-01" --end-date "2024-01-07" --time-pattern "uniform"
```

### **🎯 MITRE ATT&CK Coverage**

#### **Supported Tactics:**
- **TA0001**: Initial Access
- **TA0002**: Execution
- **TA0003**: Persistence
- **TA0004**: Privilege Escalation
- **TA0005**: Defense Evasion

#### **Sub-techniques Examples:**
- **T1566.001**: Spearphishing Attachment
- **T1566.002**: Spearphishing Link
- **T1078.001**: Default Accounts
- **T1078.002**: Domain Accounts
- **T1055.001**: Dynamic-link Library Injection
- **T1055.012**: Process Hollowing

#### **Attack Chain Examples:**
1. **Phishing → Execution → Persistence**
   - T1566 (Phishing) → T1204 (User Execution) → T1053 (Scheduled Task)

2. **Initial Access → Privilege Escalation → Defense Evasion**
   - T1078 (Valid Accounts) → T1055 (Process Injection) → T1027 (Obfuscation)

### **📅 Timestamp Configuration**

#### **Date Range Formats:**
- **Relative dates**: `"7d"` (7 days ago), `"1w"` (1 week), `"1M"` (1 month), `"1y"` (1 year)
- **Absolute dates**: `"2024-01-01T00:00:00Z"`, `"2024-12-31"`
- **Special values**: `"now"` (current time)

#### **Time Distribution Patterns:**

| Pattern | Description | Use Case |
|---------|-------------|----------|
| `uniform` | Even distribution across time range | General testing, baseline data |
| `business_hours` | 70% during 9 AM - 6 PM, Mon-Fri | Corporate environment simulation |
| `random` | High variance, completely random | Stress testing, edge cases |
| `attack_simulation` | Burst patterns, late-night activity | Security incident simulation |
| `weekend_heavy` | 60% weekend activity | Unusual activity detection |

#### **Timestamp Configuration:**
```json
{
  "timestamps": {
    "startDate": "7d",
    "endDate": "now",
    "pattern": "business_hours",
    "enableMultiDay": true,
    "daySpread": 7
  }
}
```

#### **Attack Chain Timestamps:**
When using `--attack-chains`, timestamps follow realistic attack progression:
- **Tight sequence**: 1-15 minutes between techniques
- **Burst pattern**: Seconds to few minutes (rapid execution)
- **Spread pattern**: Hours between techniques (persistent threats)

### **⚡ Performance Features**

#### **Large-Scale Optimizations:**
- **Adaptive Batching**: Automatically adjusts batch sizes for datasets >1000
- **Parallel Processing**: Concurrent batch processing (configurable)
- **Request Rate Limiting**: Respects API rate limits with configurable delays
- **Enhanced Caching**: Improved cache management with size limits
- **Progress Reporting**: Real-time progress tracking for large operations

#### **Performance Configuration:**
```json
{
  "generation": {
    "performance": {
      "enableLargeScale": true,
      "largeScaleThreshold": 1000,
      "maxConcurrentRequests": 5,
      "requestDelayMs": 100,
      "maxCacheSize": 200
    }
  },
  "timestamps": {
    "startDate": "30d",
    "endDate": "now",
    "pattern": "business_hours",
    "enableMultiDay": true,
    "daySpread": 30
  }
}
```

#### **Time Range Statistics:**
The system automatically calculates time range statistics:
```javascript
// Example output for 7-day range
{
  totalDays: 7,
  totalHours: 168,
  weekdays: 5,
  weekends: 2,
  businessHours: 45  // 9 AM - 6 PM on weekdays
}
```

### **🔍 Generated Alert Fields**

Generated alerts include enhanced MITRE fields:

```json
{
  "threat.technique.id": ["T1566.001", "T1204.002"],
  "threat.technique.name": ["Spearphishing Attachment", "Malicious File"],
  "threat.tactic.id": ["TA0001", "TA0002"],
  "threat.tactic.name": ["Initial Access", "Execution"],
  "threat.attack_chain.id": "chain-1234567890-abc123",
  "threat.attack_chain.severity": "high",
  "threat.attack_chain.length": 3,
  "kibana.alert.severity": "high",
  "kibana.alert.risk_score": 75
}
```

### **📈 Expanding MITRE Coverage**

To add more tactics/techniques, edit `src/mappings/mitre_attack.json`:

```json
{
  "tactics": {
    "TA0006": {
      "name": "Credential Access",
      "description": "Adversaries attempt to steal credentials",
      "techniques": ["T1110", "T1555", "T1003"]
    }
  },
  "techniques": {
    "T1110": {
      "name": "Brute Force",
      "description": "Adversaries may use brute force techniques",
      "tactics": ["TA0006"],
      "subTechniques": ["T1110.001", "T1110.002"],
      "chainNext": ["T1078", "T1055"]
    }
  },
  "subTechniques": {
    "T1110.001": {"name": "Password Guessing", "parent": "T1110"},
    "T1110.002": {"name": "Password Cracking", "parent": "T1110"}
  }
}
```

## How to generate data for serverless project

1. Get your Elasticsearch url.

   Go to Cloud -> Projects -> Your serverless project.

   Then click Endpoints -> View and copy paste your ES URL to `config.json` into `elastic.node` field.

2. Generate API key

   Go to Cloud -> Projects -> Api Keys -> Manage project API keys

   Create a new API key and past it to `config.json` into `elastic.apiKey` field.

3. (Optional) Change if you want index name in `config.json` in `eventIndex` field.

   By default - `logs-testlogs-default`

4. (Optional) Change mappings in `eventMappings.json` file.

5. (Optional) Change event structure in `create_events.ts` file

6. Run `yarn start generate-events n`. Where `n` is the amount of documents that will be generated.

7. `yarn start delete-events` to remove all documents from event index after your test.

## Entity Store Performance Testing

### Sending one of the pre-built files

#### One time send

To upload a perf file once, use the `upload-perf-data` command, e.g:

```
# upload the small file, delete all logs and entities beforehand
yarn start upload-perf-data-interval small --delete
```

If you omit the file name you will be presented with a picker.

#### Send at an interval
A better test is to send data at an interval to put the system under continued load.

To do this use the `upload-perf-data-interval` command. This will upload a file 10 times with 30 seconds between each send by default, e.g:

```
# upload the small data file 10 times with 30 seconds between sends
yarn start upload-perf-data-interval small --deleteEntities
```

The count and interval can be customized:

```
# upload the small data file 100 times with 60 seconds between sends
yarn start upload-perf-data-interval small --deleteEntities --interval 60 --count 100
```

The entity IDs are modified before sending so that each upload creates new entities, this means there will be count * entityCount entities by the end of the test.

While the files are uploaded, we poll elasticsearch for the cluster health and the transform health, these files can be found in `./logs`. Where one file contains the cluster health every 5 seconds, and the other contains the transform health every 5 seconds:

```
> ll logs
total 464
-rw-r--r--@ 1 mark  staff    33K Oct 28 11:20 small-2024-10-28T11:14:06.828Z-cluster-health.log
-rw-r--r--@ 1 mark  staff   145K Oct 28 11:20 small-2024-10-28T11:14:06.828Z-transform-stats.log
```

### Generating a data file

To generate a data file for performance testing, use the `create-perf-data` command.

E.g this is how 'large' was created:

```
# create a file with 100k entities each with 5 logs.
yarn start create-perf-data large 100000 5
```

Entities are split 50/50 host/user.
The log messages created contain incremental data, e.g the first log message for a host would contain IP 192.168.1.0 and 192.168.1.1, the second log would contain 192.168.1.2 and 192.168.1.3. This way when 5 log messages are sent, an entity should have 10 IP addresses ranging from 0 - 10.


### Generate rules and gaps

Will generate 100 rules with 10000 gaps per rule.

`yarn start rules --rules 100 -g 10000 -c -i"48h"`

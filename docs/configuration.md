# Configuration Guide

This guide covers all configuration options for the Security Documents Generator.

## 📋 Basic Configuration

### Initial Setup

Run the generator once to create your configuration file:

```bash
yarn start
```

This creates `config.json` with guided setup.

### Sample Configurations

#### Cloud/Serverless (API Key)
```json
{
  "elastic": {
    "node": "https://your-cluster.es.us-west2.gcp.elastic-cloud.com",
    "apiKey": "your-base64-encoded-api-key"
  },
  "kibana": {
    "node": "https://your-cluster.kb.us-west2.gcp.elastic-cloud.com",
    "apiKey": "your-base64-encoded-api-key"
  }
}
```

#### Self-Managed (Username/Password)
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
  "eventIndex": "logs-security-events"
}
```

## 🤖 AI Provider Configuration

### OpenAI
```json
{
  "useAI": true,
  "openaiApiKey": "sk-your-openai-api-key"
}
```

### Azure OpenAI
```json
{
  "useAI": true,
  "useAzureOpenAI": true,
  "azureOpenAIApiKey": "your-azure-api-key",
  "azureOpenAIEndpoint": "https://your-resource.openai.azure.com",
  "azureOpenAIDeployment": "your-deployment-name",
  "azureOpenAIApiVersion": "2023-05-15"
}
```

### Claude (Anthropic)
```json
{
  "useAI": true,
  "useClaudeAI": true,
  "claudeApiKey": "sk-ant-your-claude-api-key",
  "claudeModel": "claude-3-5-sonnet-20241022"
}
```

## ⚔️ MITRE ATT&CK Configuration

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
  }
}
```

### MITRE Options Explained

| Option | Description | Default | Values |
|--------|-------------|---------|--------|
| `enabled` | Enable MITRE integration | `false` | `true`/`false` |
| `tactics` | Enabled MITRE tactics | `["TA0001"]` | Array of tactic IDs |
| `maxTechniquesPerAlert` | Max techniques per alert | `2` | `1-5` |
| `includeSubTechniques` | Use sub-techniques | `false` | `true`/`false` |
| `probabilityOfMitreAlert` | % of alerts with MITRE | `0.3` | `0.0-1.0` |
| `enableAttackChains` | Chain techniques | `false` | `true`/`false` |
| `maxChainLength` | Max chain length | `3` | `2-8` |
| `chainProbability` | % of chains generated | `0.15` | `0.0-1.0` |

## ⚡ Performance Configuration

```json
{
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

### Performance Options

| Option | Description | Default | Recommended |
|--------|-------------|---------|-------------|
| `enableLargeScale` | Auto-enable for >1000 events | `false` | Auto |
| `largeScaleThreshold` | Threshold for large-scale | `1000` | `500-2000` |
| `maxConcurrentRequests` | Parallel API requests | `5` | `3-10` |
| `requestDelayMs` | Delay between requests | `100` | `50-200` |
| `maxCacheSize` | Cache size limit | `200` | `100-500` |

## 📅 Timestamp Configuration

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

### Date Formats

| Format | Example | Description |
|--------|---------|-------------|
| Relative | `"7d"`, `"1w"`, `"1M"` | Days/weeks/months ago |
| Absolute | `"2024-01-01"` | Specific date |
| ISO | `"2024-01-01T00:00:00Z"` | Full timestamp |
| Special | `"now"` | Current time |

### Time Patterns

| Pattern | Description | When to Use |
|---------|-------------|-------------|
| `uniform` | Even distribution | Baseline testing |
| `business_hours` | 9 AM - 6 PM, Mon-Fri | Corporate environments |
| `random` | High variance | Stress testing |
| `attack_simulation` | Burst patterns, late night | Security incidents |
| `weekend_heavy` | 60% weekend activity | Anomaly detection |

## 🎭 Campaign Configuration

```json
{
  "campaigns": {
    "enabled": true,
    "defaultType": "apt",
    "complexity": "medium",
    "enableCorrelation": true,
    "defaultTargets": 25,
    "defaultUsers": 15,
    "simulationEngine": {
      "networkComplexity": "high",
      "enableCorrelation": true,
      "enablePerformanceOptimization": false
    }
  }
}
```

## 🔍 Index Configuration

```json
{
  "eventIndex": "logs-security-events",
  "alertIndex": ".alerts-security.alerts-default",
  "customIndices": {
    "campaigns": "security-campaigns",
    "mitre": "security-mitre-data"
  }
}
```

## 🛡️ Security Configuration

```json
{
  "security": {
    "validateCertificates": true,
    "requestTimeout": 30000,
    "maxRetries": 3,
    "retryDelay": 1000
  }
}
```

## 📊 Logging Configuration

```json
{
  "logging": {
    "level": "info",
    "enableDebug": false,
    "logFile": "logs/generator.log",
    "enableAIResponseLogging": false
  }
}
```

### Log Levels
- `error`: Errors only
- `warn`: Warnings and errors
- `info`: General information (default)
- `debug`: Detailed debugging info

## 🔧 Advanced Configuration

### Custom Field Generation
```json
{
  "customFields": {
    "organization": "Acme Corp",
    "environment": "production",
    "region": "us-west-2",
    "additionalTags": ["security-test", "generated"]
  }
}
```

### Rate Limiting
```json
{
  "rateLimiting": {
    "requestsPerSecond": 10,
    "burstLimit": 20,
    "backoffMultiplier": 2
  }
}
```

### Validation Rules
```json
{
  "validation": {
    "enableFieldValidation": true,
    "requireMandatoryFields": true,
    "allowCustomFields": true,
    "maxFieldLength": 1000
  }
}
```

## 📋 Complete Configuration Example

```json
{
  "elastic": {
    "node": "https://your-cluster.com",
    "apiKey": "your-api-key"
  },
  "kibana": {
    "node": "https://your-kibana.com",
    "apiKey": "your-api-key"
  },
  "useAI": true,
  "useClaudeAI": true,
  "claudeApiKey": "sk-ant-your-key",
  "claudeModel": "claude-3-5-sonnet-20241022",
  "mitre": {
    "enabled": true,
    "tactics": ["TA0001", "TA0002", "TA0003", "TA0004", "TA0005"],
    "includeSubTechniques": true,
    "enableAttackChains": true,
    "probabilityOfMitreAlert": 0.6
  },
  "generation": {
    "performance": {
      "enableLargeScale": true,
      "maxConcurrentRequests": 5,
      "requestDelayMs": 100,
      "maxCacheSize": 300
    }
  },
  "timestamps": {
    "pattern": "business_hours",
    "enableMultiDay": true,
    "daySpread": 14
  },
  "campaigns": {
    "enabled": true,
    "enableCorrelation": true,
    "simulationEngine": {
      "networkComplexity": "high",
      "enableCorrelation": true
    }
  }
}
```

## 🔍 Environment Variables

You can override configuration with environment variables:

```bash
export ES_NODE="https://your-cluster.com"
export ES_API_KEY="your-api-key"
export OPENAI_API_KEY="sk-your-key"
export CLAUDE_API_KEY="sk-ant-your-key"
```

## 🚨 Troubleshooting

### Common Issues

1. **Connection errors**: Check Elasticsearch/Kibana URLs and credentials
2. **AI API errors**: Verify API keys and quota limits
3. **Performance issues**: Adjust batch sizes and concurrent requests
4. **Memory errors**: Enable large-scale optimizations

### Debug Mode
```bash
DEBUG_AI_RESPONSES=true yarn start generate-alerts -n 10 --ai
```

## 📝 Configuration Validation

The tool validates your configuration on startup. Common validation errors:

- Missing required fields (elastic.node, kibana.node)
- Invalid API keys or endpoints
- Conflicting AI provider settings
- Invalid MITRE tactic IDs
- Out-of-range probability values

## 🔄 Configuration Updates

You can modify `config.json` at any time. Changes are automatically detected and applied to new generation commands.
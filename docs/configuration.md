# ⚙️ Configuration Guide

Complete configuration reference for the Security Documents Generator.

## 📋 Table of Contents

- [Overview](#overview)
- [Configuration File](#configuration-file)
- [Environment Variables](#environment-variables)
- [Kibana Integration](#kibana-integration)
- [AI Service Configuration](#ai-service-configuration)
- [Index Configuration](#index-configuration)
- [Theme Configuration](#theme-configuration)
- [Space Management](#space-management)
- [Troubleshooting](#troubleshooting)

## Overview

The Security Documents Generator uses a JSON configuration file (`config.json`) to manage Kibana connections, AI services, and generation parameters. The tool creates this file automatically on first run if it doesn't exist.

## Configuration File

### Creating Configuration
```bash
# Auto-generate config on first run
yarn start generate-alerts --count 10

# The tool will prompt for required values and create config.json
```

### Configuration Structure
```json
{
  "kibana": {
    "host": "https://your-elastic-deployment.es.region.cloud.es.io:9243",
    "username": "elastic",
    "password": "your-password",
    "space": "default"
  },
  "ai": {
    "openai": {
      "apiKey": "sk-your-openai-key",
      "model": "gpt-4"
    },
    "claude": {
      "apiKey": "your-claude-key",
      "model": "claude-3-sonnet-20240229"
    },
    "gemini": {
      "apiKey": "your-gemini-key",
      "model": "gemini-pro"
    }
  },
  "generation": {
    "defaultBatchSize": 10,
    "maxRetries": 3,
    "timeoutMs": 30000,
    "defaultTheme": "corporate"
  },
  "features": {
    "aiGeneration": true,
    "mitre": true,
    "sessionView": true,
    "visualAnalyzer": true
  }
}
```

## Environment Variables

### Required Variables
```bash
# Kibana connection
export KIBANA_HOST="https://your-deployment.es.region.cloud.es.io:9243"
export KIBANA_USERNAME="elastic"
export KIBANA_PASSWORD="your-password"

# AI services (at least one required for AI features)
export OPENAI_API_KEY="sk-your-openai-key"
export CLAUDE_API_KEY="your-claude-key"
export GEMINI_API_KEY="your-gemini-key"
```

### Optional Variables
```bash
# Default space
export KIBANA_SPACE="default"

# Generation settings
export DEFAULT_BATCH_SIZE="10"
export DEFAULT_THEME="corporate"

# Debug settings
export DEBUG_AI_RESPONSES="true"
export VERBOSE_LOGGING="true"
```

## Kibana Integration

### Kibana Cloud Setup
1. **Get your cloud deployment URL**:
   - Format: `https://deployment-id.es.region.cloud.es.io:9243`
   - Example: `https://my-deployment.es.us-central1.gcp.cloud.es.io:9243`

2. **Authentication**:
   - Use built-in `elastic` user for initial setup
   - Create dedicated service account for production use

3. **Test connection**:
   ```bash
   yarn start generate-alerts --count 1 --test-connection
   ```

### Self-Managed Elasticsearch
```json
{
  "kibana": {
    "host": "https://your-kibana-host:5601",
    "username": "your-username",
    "password": "your-password",
    "space": "default",
    "ssl": {
      "rejectUnauthorized": false
    }
  }
}
```

### Advanced Kibana Configuration
```json
{
  "kibana": {
    "host": "https://your-deployment.cloud.es.io:9243",
    "username": "elastic",
    "password": "your-password",
    "space": "security-testing",
    "timeout": 30000,
    "keepAlive": true,
    "headers": {
      "X-Custom-Header": "value"
    }
  }
}
```

## AI Service Configuration

### OpenAI Configuration
```json
{
  "ai": {
    "openai": {
      "apiKey": "sk-your-key",
      "model": "gpt-4",
      "temperature": 0.7,
      "maxTokens": 4000,
      "timeout": 30000
    }
  }
}
```

### Claude Configuration
```json
{
  "ai": {
    "claude": {
      "apiKey": "your-claude-key",
      "model": "claude-3-sonnet-20240229",
      "maxTokens": 4000,
      "temperature": 0.7
    }
  }
}
```

### Gemini Configuration
```json
{
  "ai": {
    "gemini": {
      "apiKey": "your-gemini-key",
      "model": "gemini-pro",
      "temperature": 0.7,
      "topP": 0.8,
      "topK": 40
    }
  }
}
```

### AI Service Priority
The tool attempts AI services in this order:
1. **OpenAI** (if configured)
2. **Claude** (if configured)
3. **Gemini** (if configured)

### Fallback Behavior
- If no AI service is configured, the tool generates using templates
- If AI service fails, automatic fallback to template generation
- Configurable retry logic with exponential backoff

## Index Configuration

### Default Index Patterns
```json
{
  "indices": {
    "alerts": "alerts-security.alerts-{space}",
    "logs": "logs-{type}-{space}",
    "cases": "cases-{space}",
    "knowledgeBase": "knowledge-base-{space}"
  }
}
```

### Custom Index Patterns
```json
{
  "indices": {
    "alerts": "custom-alerts-{space}-{date}",
    "logs": "custom-logs-{type}-{space}-{date}",
    "rollover": {
      "enabled": true,
      "maxSize": "50gb",
      "maxAge": "30d"
    }
  }
}
```

### Index Lifecycle Management
```json
{
  "ilm": {
    "enabled": true,
    "policy": "security-data-policy",
    "rolloverAlias": "security-data",
    "phases": {
      "hot": { "max_age": "7d" },
      "warm": { "max_age": "30d" },
      "cold": { "max_age": "90d" },
      "delete": { "max_age": "365d" }
    }
  }
}
```

## Theme Configuration

### Built-in Themes
- **corporate**: Business-appropriate names and scenarios
- **marvel**: Marvel superhero universe entities
- **starwars**: Star Wars universe entities
- **lotr**: Lord of the Rings universe entities

### Custom Theme Configuration
```json
{
  "themes": {
    "custom": {
      "users": ["john.doe", "jane.smith", "admin.user"],
      "hosts": ["web-server-01", "db-server-02", "workstation-03"],
      "processes": ["custom-app.exe", "security-scanner.exe"],
      "domains": ["corporate.com", "internal.local"],
      "description": "Custom corporate theme"
    }
  }
}
```

### Theme Selection
```bash
# Use specific theme
yarn start generate-alerts --theme marvel --count 100

# Use default theme from config
yarn start generate-alerts --count 100
```

## Space Management

### Multiple Spaces Configuration
```json
{
  "spaces": {
    "default": {
      "kibana": {
        "space": "default"
      }
    },
    "training": {
      "kibana": {
        "space": "security-training"
      }
    },
    "testing": {
      "kibana": {
        "space": "soc-testing"
      }
    }
  }
}
```

### Space-Specific Generation
```bash
# Generate in specific space
yarn start generate-alerts --space training --count 100

# Generate across multiple spaces
yarn start generate-campaign apt --environments 5 --count 200
```

## Advanced Configuration

### Batch Processing
```json
{
  "generation": {
    "batchSize": 10,
    "maxConcurrent": 3,
    "retryPolicy": {
      "maxRetries": 3,
      "backoffMultiplier": 2,
      "maxDelay": 30000
    }
  }
}
```

### Performance Tuning
```json
{
  "performance": {
    "caching": {
      "enabled": true,
      "ttl": 3600,
      "maxSize": 1000
    },
    "connection": {
      "poolSize": 10,
      "keepAlive": true,
      "timeout": 30000
    }
  }
}
```

### Logging Configuration
```json
{
  "logging": {
    "level": "info",
    "file": {
      "enabled": true,
      "path": "./logs/generator.log",
      "maxSize": "100mb",
      "maxFiles": 5
    },
    "console": {
      "enabled": true,
      "colorize": true
    }
  }
}
```

## Security Configuration

### API Key Management
```json
{
  "security": {
    "apiKeys": {
      "rotation": {
        "enabled": true,
        "intervalDays": 30
      },
      "encryption": {
        "enabled": true,
        "algorithm": "aes-256-gcm"
      }
    }
  }
}
```

### Network Security
```json
{
  "network": {
    "proxy": {
      "enabled": true,
      "host": "proxy.company.com",
      "port": 8080,
      "auth": {
        "username": "proxy-user",
        "password": "proxy-pass"
      }
    },
    "ssl": {
      "verify": true,
      "ca": "/path/to/ca.pem"
    }
  }
}
```

## Validation and Testing

### Configuration Validation
```bash
# Validate configuration
yarn start validate-config

# Test all connections
yarn start test-connections

# Test specific service
yarn start test-kibana
yarn start test-ai
```

### Health Checks
```bash
# Check system health
yarn start health-check

# Check specific components
yarn start health-check --component kibana
yarn start health-check --component ai
```

## Troubleshooting

### Common Configuration Issues

#### Connection Failures
**Issue**: Cannot connect to Kibana
**Solutions**:
- Verify host URL format
- Check authentication credentials
- Validate network connectivity
- Review SSL/TLS settings

#### AI Service Errors
**Issue**: AI services not responding
**Solutions**:
- Verify API keys are valid
- Check service quotas and limits
- Review timeout settings
- Test fallback services

#### Index Mapping Conflicts
**Issue**: Field mapping conflicts
**Solutions**:
- Run setup-mappings command
- Check existing index templates
- Verify field type consistency

### Debug Configuration
```json
{
  "debug": {
    "enabled": true,
    "components": ["kibana", "ai", "generation"],
    "logLevel": "debug",
    "tracing": {
      "enabled": true,
      "sampleRate": 0.1
    }
  }
}
```

### Performance Monitoring
```json
{
  "monitoring": {
    "metrics": {
      "enabled": true,
      "interval": 60000
    },
    "alerts": {
      "enabled": true,
      "thresholds": {
        "errorRate": 0.05,
        "responseTime": 5000
      }
    }
  }
}
```

---

*Need help with configuration? Start with the auto-generated config and customize as needed for your environment!*
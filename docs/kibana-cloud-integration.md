# ☁️ Kibana Cloud Integration

Complete guide to integrating with Elastic Cloud and Kibana Cloud deployments for comprehensive security data generation.

## 📋 Table of Contents

- [Overview](#overview)
- [Quick Start](#quick-start)
- [Cloud Deployment Setup](#cloud-deployment-setup)
- [Authentication Methods](#authentication-methods)
- [Space Management](#space-management)
- [Data Generation in Cloud](#data-generation-in-cloud)
- [Index Management](#index-management)
- [Performance Considerations](#performance-considerations)
- [Security Best Practices](#security-best-practices)
- [Troubleshooting](#troubleshooting)

## Overview

The Security Documents Generator provides seamless integration with Elastic Cloud deployments, enabling:

- **Direct Cloud Connection**: Connect to any Elastic Cloud deployment
- **Multi-Space Support**: Generate data across different Kibana spaces
- **Index Management**: Automatic index creation and mapping setup
- **Security Integration**: Full compatibility with Elastic Security features
- **Scale Support**: Handle enterprise-scale cloud deployments

## Quick Start

### Basic Cloud Connection
```bash
# Configure cloud connection (first run)
yarn start generate-alerts --count 10

# You'll be prompted for:
# - Cloud deployment URL
# - Username/password or API key
# - Default space name
```

### Direct Configuration
```bash
# Set environment variables
export KIBANA_HOST="https://your-deployment.es.region.cloud.es.io:9243"
export KIBANA_USERNAME="elastic"
export KIBANA_PASSWORD="your-password"

# Generate data
yarn start generate-alerts --count 100 --space production
```

## Cloud Deployment Setup

### 1. **Get Deployment Information**

From your Elastic Cloud Console:
1. Navigate to your deployment
2. Copy the **Elasticsearch endpoint**
3. Note the **Kibana endpoint** (typically same URL with different port)
4. Ensure **Security** is enabled

**Example URLs:**
```
Elasticsearch: https://my-deployment.es.us-central1.gcp.cloud.es.io:9243
Kibana: https://my-deployment.kb.us-central1.gcp.cloud.es.io:9243
```

### 2. **Create Service Account** (Recommended)
For production use, create a dedicated service account:

1. **In Kibana** → Stack Management → Security → Users
2. **Create User**: `security-generator`
3. **Assign Roles**:
   - `kibana_admin` (for space management)
   - `superuser` (for index operations)
   - Custom role with specific privileges

### 3. **Configure API Keys** (Alternative)
For API key authentication:

1. **In Kibana** → Stack Management → Security → API Keys
2. **Create API Key** with appropriate privileges
3. **Copy the encoded key** for configuration

## Authentication Methods

### Username/Password Authentication
```json
{
  "kibana": {
    "host": "https://your-deployment.es.region.cloud.es.io:9243",
    "username": "elastic",
    "password": "your-strong-password",
    "space": "default"
  }
}
```

### API Key Authentication
```json
{
  "kibana": {
    "host": "https://your-deployment.es.region.cloud.es.io:9243",
    "apiKey": "your-base64-encoded-api-key",
    "space": "default"
  }
}
```

### Environment Variables
```bash
# Username/Password
export KIBANA_HOST="https://your-deployment.es.region.cloud.es.io:9243"
export KIBANA_USERNAME="security-generator"
export KIBANA_PASSWORD="secure-password"
export KIBANA_SPACE="security-testing"

# API Key
export KIBANA_HOST="https://your-deployment.es.region.cloud.es.io:9243"
export KIBANA_API_KEY="your-encoded-api-key"
export KIBANA_SPACE="security-testing"
```

## Space Management

### Creating Spaces
```bash
# Generate data in existing space
yarn start generate-alerts --space production --count 100

# Create and use new space (requires admin privileges)
yarn start generate-alerts --space soc-training --count 50 --create-space
```

### Multi-Space Deployment
```bash
# Generate across multiple spaces
yarn start generate-campaign apt --environments 5 --count 200

# This creates spaces:
# - environment-1
# - environment-2
# - environment-3
# - environment-4
# - environment-5
```

### Space-Specific Configuration
```json
{
  "spaces": {
    "production": {
      "kibana": {
        "space": "prod-security"
      },
      "features": {
        "aiGeneration": false,
        "debugging": false
      }
    },
    "development": {
      "kibana": {
        "space": "dev-security"
      },
      "features": {
        "aiGeneration": true,
        "debugging": true
      }
    },
    "training": {
      "kibana": {
        "space": "soc-training"
      },
      "features": {
        "falsePositives": true,
        "detailedLogging": true
      }
    }
  }
}
```

## Data Generation in Cloud

### Security Alerts
```bash
# Generate security alerts in cloud deployment
yarn start generate-alerts --count 200 --mitre --ai --space security-prod

# With realistic scenarios
yarn start generate-alerts --count 150 --realistic --false-positive-rate 0.2
```

### Detection Rules
```bash
# Generate detection rules
yarn start generate-rules --count 50 --mitre --space security-rules

# All rule types with AI enhancement
yarn start generate-rules --count 30 --all-types --ai
```

### Attack Campaigns
```bash
# Sophisticated attack campaigns
yarn start generate-campaign apt --realistic --mitre --count 300 --space incident-response

# Multi-environment ransomware simulation
yarn start generate-campaign ransomware --environments 10 --count 500
```

### Machine Learning Data
```bash
# ML training data generation
yarn start generate-ml-data --count 1000 --anomaly-types all --space ml-training

# Specific ML job data
yarn start generate-ml-data --job-type auth_rare_hour --count 500
```

## Index Management

### Automatic Index Creation
The tool automatically creates and manages indices:

```bash
# Setup index mappings (run once per space)
yarn start setup-mappings --space production

# Verify index health
yarn start health-check --component elasticsearch --space production
```

### Index Patterns
Default index patterns created:
- **Alerts**: `alerts-security.alerts-{space}`
- **Logs**: `logs-*-{space}`
- **Cases**: `cases-{space}`
- **ML Data**: `ml-anomalies-{space}`

### Custom Index Configuration
```json
{
  "indices": {
    "alerts": "custom-alerts-{space}-{date}",
    "logs": "custom-logs-{type}-{space}",
    "rollover": {
      "enabled": true,
      "maxSize": "50gb",
      "maxAge": "30d"
    }
  }
}
```

### Index Lifecycle Management
```bash
# Configure ILM policies
yarn start configure-ilm --space production --policy security-data

# Monitor index sizes
yarn start monitor-indices --space production
```

## Performance Considerations

### Cloud-Specific Optimizations
```bash
# Optimize for cloud deployment
yarn start generate-alerts --count 1000 --cloud-optimized

# Large-scale generation with batching
yarn start generate-logs --count 10000 --batch-size 50 --cloud-performance
```

### Batch Size Recommendations
| Deployment Size | Recommended Batch Size | Concurrent Batches |
|----------------|----------------------|-------------------|
| **Small** (2GB RAM) | 10 documents | 1-2 |
| **Medium** (8GB RAM) | 25 documents | 2-3 |
| **Large** (32GB RAM) | 50 documents | 3-5 |
| **Enterprise** (64GB+ RAM) | 100 documents | 5-10 |

### Network Optimization
```json
{
  "cloud": {
    "timeout": 60000,
    "keepAlive": true,
    "maxSockets": 10,
    "compression": true,
    "retryPolicy": {
      "maxRetries": 3,
      "backoffMultiplier": 2
    }
  }
}
```

## Security Best Practices

### Secure Authentication
1. **Use Service Accounts**: Create dedicated accounts for the generator
2. **Rotate Credentials**: Regularly rotate passwords and API keys
3. **Minimal Privileges**: Grant only required permissions
4. **API Key Restrictions**: Use time-limited and IP-restricted API keys

### Network Security
```json
{
  "security": {
    "ssl": {
      "verify": true,
      "ca": "/path/to/ca.pem"
    },
    "proxy": {
      "enabled": true,
      "host": "corporate-proxy.com",
      "port": 8080,
      "auth": {
        "username": "proxy-user",
        "password": "proxy-pass"
      }
    }
  }
}
```

### Data Governance
```bash
# Generate data with compliance tags
yarn start generate-alerts --count 100 --compliance-tags --data-classification restricted

# Ensure data residency compliance
yarn start generate-alerts --count 200 --region us-east-1 --compliance-mode
```

## Advanced Integration

### Multi-Region Deployments
```bash
# Generate data across regions
yarn start generate-campaign apt --regions us-east-1,eu-west-1 --count 400

# Region-specific compliance
yarn start generate-alerts --region eu-west-1 --gdpr-compliant --count 150
```

### High Availability Setup
```json
{
  "cloud": {
    "endpoints": [
      "https://primary.es.region.cloud.es.io:9243",
      "https://secondary.es.region.cloud.es.io:9243"
    ],
    "failover": {
      "enabled": true,
      "timeout": 30000,
      "retryInterval": 5000
    }
  }
}
```

### Integration with Elastic Agent
```bash
# Generate data compatible with Elastic Agent
yarn start generate-logs --agent-compatible --count 1000

# Include agent metadata
yarn start generate-alerts --count 200 --include-agent-metadata
```

## Monitoring and Observability

### Performance Monitoring
```bash
# Monitor generation performance
yarn start monitor-performance --space production --duration 1h

# Cloud resource utilization
yarn start monitor-cloud-resources --deployment my-deployment
```

### Health Checks
```bash
# Comprehensive health check
yarn start health-check --cloud --space production

# Specific component checks
yarn start health-check --component elasticsearch
yarn start health-check --component kibana
yarn start health-check --component security
```

### Alerting Integration
```json
{
  "monitoring": {
    "alerts": {
      "enabled": true,
      "webhook": "https://your-webhook-url.com",
      "thresholds": {
        "errorRate": 0.05,
        "responseTime": 5000,
        "indexSize": "10gb"
      }
    }
  }
}
```

## Troubleshooting

### Common Cloud Issues

#### Connection Problems
**Issue**: Cannot connect to cloud deployment
**Solutions**:
- Verify deployment URL format
- Check network connectivity
- Validate authentication credentials
- Review firewall and proxy settings

#### Authentication Failures
**Issue**: Authentication errors with cloud deployment
**Solutions**:
- Verify username/password or API key
- Check user permissions and roles
- Ensure account is not locked or suspended
- Validate API key expiration and restrictions

#### Performance Issues
**Issue**: Slow generation or timeouts
**Solutions**:
- Reduce batch sizes for cloud deployments
- Increase timeout values
- Check deployment resource allocation
- Monitor network latency

#### Index Management Problems
**Issue**: Index creation or mapping failures
**Solutions**:
- Verify user privileges for index operations
- Check index template conflicts
- Review cluster health and disk space
- Validate index naming patterns

### Debug Mode
```bash
# Enable debug logging for cloud operations
yarn start generate-alerts --count 10 --debug --cloud-debug

# Network-level debugging
yarn start generate-alerts --count 5 --network-debug
```

### Support Information
```bash
# Generate support bundle
yarn start support-bundle --cloud --space production

# Export configuration for support
yarn start export-config --sanitized
```

## Best Practices

### Configuration Management
1. **Environment-Specific Configs**: Separate configs for dev/test/prod
2. **Secrets Management**: Use environment variables for sensitive data
3. **Version Control**: Track configuration changes
4. **Backup Strategies**: Regular backup of important configurations

### Operational Excellence
1. **Monitoring**: Implement comprehensive monitoring
2. **Alerting**: Set up appropriate alerts for failures
3. **Documentation**: Maintain deployment documentation
4. **Testing**: Regular testing of disaster recovery procedures

### Cost Optimization
1. **Resource Sizing**: Right-size deployments for actual usage
2. **Data Lifecycle**: Implement appropriate data retention policies
3. **Index Management**: Use ILM for cost-effective data management
4. **Monitoring**: Track usage and costs regularly

---

*Ready to integrate with Elastic Cloud? Start with `yarn start generate-alerts --count 50` and follow the guided setup for seamless cloud integration!*
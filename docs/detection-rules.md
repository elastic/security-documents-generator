# Detection Rules Generation

Comprehensive guide for generating all types of Elastic Security detection rules with realistic configurations and triggered alerts.

## Overview

The Security Documents Generator supports **all 7 Elastic Security detection rule types**, enabling complete SOC testing, training scenarios, and detection rule development workflows.

### Supported Rule Types

| Rule Type | Purpose | Generated Examples |
|-----------|---------|-------------------|
| **Query** | Basic event detection | `event.category:"process" AND process.name:"cmd.exe"` |
| **Threshold** | Pattern detection over time | Failed logins > 50 per user |
| **EQL** | Event sequence detection | Multi-event attack chains |
| **Machine Learning** | Anomaly detection | Behavioral analysis (auth, DNS, processes) |
| **Threat Match** | IOC matching | IP/domain reputation checks |
| **New Terms** | Baseline deviation | New users, hosts, processes |
| **ES\|QL** | Advanced analytics | Complex aggregations and correlations |

## Quick Start

### Basic Rule Generation

```bash
# Generate all rule types (default)
yarn start rules -r 10 -s default

# Specific rule types
yarn start rules -r 5 -t query,threshold,eql -s production

# With events for testing
yarn start rules -r 15 -t query,threshold -e 100 -s testing
```

### Multi-Environment Generation

```bash
# Generate rules across multiple environments
yarn start rules -r 20 --environments 10 -s default

# Production deployment simulation
yarn start rules -r 50 --environments 25 --namespace prod -s production
```

## Command Reference

### Basic Syntax
```bash
yarn start rules [options]
```

### Options
| Option | Description | Default | Example |
|--------|-------------|---------|---------|
| `-r, --rules <number>` | Number of rules to generate | 10 | `-r 20` |
| `-e, --events <number>` | Number of events to generate | 50 | `-e 100` |
| `-t, --rule-types <types>` | Comma-separated rule types | all types | `-t query,threshold,eql` |
| `-s, --space <space>` | Kibana space | jgy | `-s production` |
| `-i, --interval <string>` | Rule execution interval | 5m | `-i 1m` |
| `-f, --from <number>` | Generate events from last N hours | 24 | `-f 48` |
| `-g, --gaps <number>` | Amount of gaps per rule | 0 | `-g 2` |
| `-c, --clean` | Clean existing rules before generating | false | `--clean` |

### Rule Types
Available values for `--rule-types`:
- `query` - KQL/Lucene query-based detection
- `threshold` - Field aggregation and cardinality detection
- `eql` - Event Query Language sequences
- `machine_learning` - Anomaly detection rules
- `threat_match` - Threat intelligence IOC matching
- `new_terms` - New entity detection
- `esql` - Elasticsearch Query Language analytics

## Rule Type Details

### Query Rules

**Purpose**: Basic event detection using KQL or Lucene queries.

```bash
yarn start rules -r 5 -t query -s default
```

**Generated Query Examples**:
- `event.category:"process" AND process.name:"cmd.exe"`
- `event.category:"authentication" AND event.outcome:"failure"`
- `event.category:"network" AND destination.port:22`
- `user.name:"admin" OR user.name:"administrator"`
- `event.category:"file" AND file.extension:"exe"`

**Configuration**:
- **Language**: `kuery` (default)
- **Index Patterns**: `logs-*`, `metrics-*`, `auditbeat-*`
- **From**: `now-1h` (configurable)
- **Interval**: `1m` (configurable)

### Threshold Rules

**Purpose**: Detect patterns based on field aggregation and cardinality analysis.

```bash
yarn start rules -r 3 -t threshold -s default
```

**Configuration**:
- **Query**: `event.category:"authentication" AND event.outcome:"failure"`
- **Threshold Field**: `user.name` (configurable)
- **Threshold Value**: 5-50 events (randomized)
- **Cardinality**: Source IP analysis (5 unique IPs)
- **Language**: `kuery`

**Use Cases**:
- Brute force detection
- Excessive failed logins
- Unusual network activity patterns
- High-volume events from single sources

### EQL Rules

**Purpose**: Event sequence detection and correlation across multiple events.

```bash
yarn start rules -r 4 -t eql -s default
```

**Generated EQL Examples**:
- `process where process.name == "cmd.exe"`
- `sequence [authentication where event.outcome == "failure"] [process where process.name == "powershell.exe"]`
- `network where destination.port == 22 and source.ip != "127.0.0.1"`
- `file where file.extension == "exe" and file.path : "C:\\\\temp\\\\*"`

**Configuration**:
- **Language**: `eql`
- **Sequences**: Multi-event correlation patterns
- **Time Windows**: Event timing relationships
- **Field Correlations**: Cross-event field matching

### Machine Learning Rules

**Purpose**: Anomaly detection and behavioral analysis using ML jobs.

```bash
yarn start rules -r 2 -t machine_learning -s default
```

**Configuration**:
- **Anomaly Threshold**: 50-90% (randomized)
- **ML Job IDs**: 
  - `auth_rare_hour` - Authentication timing anomalies
  - `packetbeat_rare_dns` - DNS query anomalies
  - `rare_process_by_host` - Process execution anomalies
- **Detection**: Behavioral baseline deviations

**Use Cases**:
- User behavior anomalies
- Unusual process execution patterns
- Network communication anomalies
- Time-based activity detection

### Threat Match Rules

**Purpose**: IOC matching against threat intelligence feeds.

```bash
yarn start rules -r 3 -t threat_match -s default
```

**Configuration**:
- **Threat Index**: `threat-intel-*`
- **Query**: `*:*` (all events)
- **Language**: `kuery`
- **Threat Mapping**:
  - `source.ip` → `threat.indicator.ip`
  - Field-to-field IOC correlation
- **Threat Query**: `*:*` (all threat indicators)

**Use Cases**:
- IP reputation checking
- Domain blacklist matching
- File hash correlation
- URL reputation analysis

### New Terms Rules

**Purpose**: Detect new entities not seen in historical baseline.

```bash
yarn start rules -r 3 -t new_terms -s default
```

**Configuration**:
- **New Terms Fields**: 
  - `['user.name']` - New users
  - `['host.name']` - New hosts
  - `['process.name']` - New processes
  - `['user.name', 'host.name']` - New user-host combinations
- **History Window**: `now-30d`
- **Language**: `kuery`
- **Query**: `*:*`

**Use Cases**:
- New user detection
- Unknown process identification
- New host discovery
- Service account monitoring

### ES|QL Rules

**Purpose**: Advanced analytics using Elasticsearch Query Language.

```bash
yarn start rules -r 2 -t esql -s default
```

**Generated ES|QL Examples**:
- `FROM logs-* | WHERE event.category == "process" | STATS count = COUNT() BY process.name`
- `FROM logs-* | WHERE event.category == "authentication" AND event.outcome == "failure" | STATS count = COUNT() BY user.name`
- `FROM logs-* | WHERE event.category == "network" | STATS count = COUNT() BY destination.ip`

**Configuration**:
- **Language**: `esql`
- **Complex Analytics**: Aggregations, correlations, statistics
- **Multi-Index**: Cross-index analysis capabilities
- **Advanced Functions**: Statistical and analytical functions

## Advanced Usage

### Mixed Rule Generation

```bash
# SOC training environment
yarn start rules -r 25 -t query,threshold,eql,new_terms -e 150 -s soc-training

# Detection testing
yarn start rules -r 15 -t machine_learning,threat_match -s ml-testing

# Rule development
yarn start rules -r 20 -t query,eql,esql -s development
```

### Multi-Space Deployment

```bash
# Production environment
yarn start rules -r 50 -t query,threshold,eql -s production

# Staging environment
yarn start rules -r 30 -t query,threshold -s staging

# Development environment
yarn start rules -r 15 -t query,eql,esql -s development
```

### Performance Testing

```bash
# Large-scale rule deployment
yarn start rules -r 100 -t query,threshold -e 500 -s load-test

# Multi-environment load testing
yarn start rules -r 200 --environments 50 -s load-test
```

## Rule Configuration

### Generated Rule Properties

Each rule includes:

| Property | Description | Example |
|----------|-------------|---------|
| **Name** | Type-specific naming | `"Threshold Rule-abc123"` |
| **Description** | Realistic descriptions | `"threshold rule that detects suspicious activity"` |
| **Severity** | Randomized realistic levels | `low`, `medium`, `high`, `critical` |
| **Risk Score** | 1-100 range | `21`, `47`, `73`, `99` |
| **Enabled** | Active by default | `true` |
| **Tags** | Type-appropriate tags | `[]` (empty, customizable) |
| **MITRE Mapping** | Where applicable | ATT&CK technique references |

### Language Configuration

Rules use appropriate query languages:

| Rule Type | Language | Purpose |
|-----------|----------|---------|
| Query | `kuery` | KQL query syntax |
| Threshold | `kuery` | KQL with aggregation |
| EQL | `eql` | Event Query Language |
| Machine Learning | N/A | ML job configuration |
| Threat Match | `kuery` | KQL for event matching |
| New Terms | `kuery` | KQL for baseline analysis |
| ES\|QL | `esql` | Elasticsearch Query Language |

## Integration with Kibana Security

### Rule Management
- **Created Rules**: Appear in Security → Rules
- **Rule Status**: Enabled by default for immediate testing
- **Rule Categories**: Properly categorized by type
- **Bulk Operations**: Support for bulk enable/disable

### Alert Generation
- **Triggered Alerts**: Rules generate realistic alerts when triggered
- **Alert Correlation**: Events created to match rule criteria
- **Alert Lifecycle**: Complete workflow from detection to investigation
- **Security Interface**: Integration with Security → Alerts

### Space Management
```bash
# Isolated environments
yarn start rules -r 20 -s production      # Production space
yarn start rules -r 15 -s staging         # Staging space
yarn start rules -r 10 -s development     # Development space
```

## Troubleshooting

### Common Issues

#### 404 API Errors
**Problem**: `Failed to fetch data from http://localhost:5601/api/detection_engine/rules, status: 404`

**Solutions**:
1. **Verify Space Name**: Ensure the correct Kibana space path
   ```bash
   # Check your space configuration
   curl -X GET "http://localhost:5601/{space}/api/detection_engine/rules/_find" \
     -H "Authorization: ApiKey {your-api-key}" \
     -H "kbn-xsrf: true"
   ```

2. **Check Detection Engine**: Ensure Security app is enabled
   ```bash
   # Initialize Detection Engine (if needed)
   curl -X POST "http://localhost:5601/{space}/api/detection_engine/index" \
     -H "Authorization: ApiKey {your-api-key}" \
     -H "kbn-xsrf: true"
   ```

#### Authentication Issues
**Problem**: Authentication failures with API calls

**Solution**: Use API key authentication
```json
// config.json
{
  "kibana": {
    "node": "http://localhost:5601",
    "apiKey": "your-api-key-here"
  }
}
```

#### Space Path Issues
**Problem**: Incorrect space URL format

**Solutions**:
- **Standard Format**: `/s/{space}/api/...`
- **Direct Format**: `/{space}/api/...` (for some deployments)
- Check your Kibana space configuration

### Performance Tips

1. **Start Small**: Begin with 5-10 rules for testing
2. **Specific Types**: Use targeted rule types for focused testing
3. **Event Proportion**: Generate events proportional to rule count
4. **Monitor Performance**: Watch Elasticsearch cluster performance
5. **Space Isolation**: Use different spaces for different environments

### Debugging

#### Verbose Output
```bash
# Enable debug logging
DEBUG=* yarn start rules -r 5 -t query -s default
```

#### API Testing
```bash
# Test API connectivity
curl -X GET "http://localhost:5601/{space}/api/detection_engine/rules/_find?per_page=1" \
  -H "Authorization: ApiKey {your-api-key}" \
  -H "kbn-xsrf: true" \
  -H "Content-Type: application/json"
```

## Use Cases

### SOC Training

Create comprehensive training environments:

```bash
# Complete SOC training setup
yarn start rules -r 30 -t query,threshold,eql,new_terms -e 200 -s soc-training

# Add realistic attack scenarios
yarn start generate-campaign apt --realistic --mitre -s soc-training

# Generate supporting logs
yarn start generate-logs -n 500 --types system,auth,network,endpoint -s soc-training
```

### Detection Testing

Test rule effectiveness and tuning:

```bash
# ML rule testing
yarn start rules -r 10 -t machine_learning -s ml-testing

# Threat intelligence testing
yarn start rules -r 15 -t threat_match -s threat-testing

# Complex query testing
yarn start rules -r 20 -t query,eql,esql -s query-testing
```

### Rule Development

Support rule development workflows:

```bash
# Development environment
yarn start rules -r 25 -t query,eql,esql -s development

# Generate test events
yarn start generate-logs -n 1000 --types system,auth,network -s development

# Performance testing
yarn start rules -r 100 -t query,threshold -e 1000 -s performance
```

### Load Testing

Enterprise-scale testing:

```bash
# Large-scale deployment
yarn start rules -r 500 -t query,threshold,eql -s load-test

# Multi-environment testing
yarn start rules -r 200 --environments 100 -s enterprise-test

# Performance benchmarking
yarn start rules -r 1000 -t query -e 5000 -s benchmark
```

## Best Practices

### Rule Generation Strategy

1. **Start Simple**: Begin with query and threshold rules
2. **Add Complexity**: Gradually introduce EQL and ML rules
3. **Test Integration**: Verify rule-alert-case workflows
4. **Monitor Performance**: Track cluster and rule performance
5. **Document Results**: Maintain testing documentation

### Environment Management

1. **Space Isolation**: Use separate spaces for different purposes
2. **Namespace Organization**: Logical namespace separation
3. **Resource Monitoring**: Monitor Elasticsearch cluster health
4. **Cleanup Strategy**: Regular cleanup of test data
5. **Backup Procedures**: Backup important rule configurations

### Testing Workflows

1. **Rule Creation**: Generate rules first
2. **Event Generation**: Create matching events
3. **Alert Verification**: Confirm alerts are triggered
4. **Investigation**: Test investigation workflows
5. **Case Management**: Verify case creation and management

## API Reference

### Create Rule Endpoint
```
POST /{space}/api/detection_engine/rules
```

### List Rules Endpoint
```
GET /{space}/api/detection_engine/rules/_find
```

### Delete Rules Endpoint
```
DELETE /{space}/api/detection_engine/rules
```

### Bulk Operations Endpoint
```
POST /{space}/api/detection_engine/rules/_bulk_action
```

For complete API documentation, see the [Elastic Security API Reference](https://www.elastic.co/docs/api/doc/kibana/operation/operation-createrule).

## Examples

### Complete SOC Setup

```bash
# 1. Generate detection rules
yarn start rules -r 25 -t query,threshold,eql,machine_learning,new_terms -s soc

# 2. Create attack campaigns
yarn start generate-campaign apt --realistic --mitre -s soc
yarn start generate-campaign ransomware --realistic --mitre -s soc

# 3. Generate supporting data
yarn start generate-logs -n 1000 --types system,auth,network,endpoint -s soc
yarn start generate-alerts -n 200 --mitre --multi-field -s soc

# 4. Create investigation cases
yarn start generate-cases -n 15 --mitre --attach-existing-alerts -s soc
```

### Performance Testing

```bash
# Large-scale rule deployment
yarn start rules -r 200 -t query,threshold,eql -e 1000 -s performance

# Multi-environment stress test
yarn start rules -r 500 --environments 50 -s stress-test

# Monitor with Elasticsearch
curl -X GET "http://localhost:9200/_cluster/health?pretty"
```

### Development Workflow

```bash
# Development rules
yarn start rules -r 15 -t query,eql,esql -s development

# Test events
yarn start generate-logs -n 500 --types system,auth -s development

# Validate rules
curl -X GET "http://localhost:5601/development/api/detection_engine/rules/_find" \
  -H "Authorization: ApiKey your-api-key" \
  -H "kbn-xsrf: true"
```
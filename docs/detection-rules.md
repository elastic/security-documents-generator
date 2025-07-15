# 🛡️ Detection Rules Generation

Complete guide to generating Elastic Security detection rules with realistic configurations and MITRE ATT&CK mappings.

## 📋 Table of Contents

- [Overview](#overview)
- [Quick Start](#quick-start)
- [Rule Types](#rule-types)
- [MITRE ATT&CK Integration](#mitre-attck-integration)
- [AI-Enhanced Generation](#ai-enhanced-generation)
- [Rule Configuration](#rule-configuration)
- [Multi-Space Generation](#multi-space-generation)
- [Use Cases](#use-cases)
- [Best Practices](#best-practices)
- [Troubleshooting](#troubleshooting)

## Overview

The detection rules generator creates production-ready Elastic Security detection rules that:

- **Generate All Rule Types**: Query, Threshold, EQL, Machine Learning, Threat Match, New Terms, ES|QL
- **Include MITRE Mappings**: Complete ATT&CK technique attribution
- **Trigger Realistic Alerts**: Generated rules create alerts for testing workflows
- **AI-Enhanced Content**: Contextual descriptions and threat intelligence
- **Multi-Space Support**: Deploy rules across different Kibana spaces

## Quick Start

### Basic Rule Generation
```bash
# Generate mixed detection rules
yarn start generate-rules --count 50

# Generate rules with MITRE mappings
yarn start generate-rules --count 25 --mitre

# Generate AI-enhanced rules
yarn start generate-rules --count 30 --ai
```

### Advanced Rule Generation
```bash
# Generate specific rule types
yarn start generate-rules --count 20 --rule-types query,threshold,eql

# Generate rules with triggered alerts
yarn start generate-rules --count 15 --with-alerts

# Generate themed rules with correlations
yarn start generate-rules --theme marvel --count 40 --correlations
```

## Rule Types

### 1. **Query Rules**
KQL/Lucene query-based detection rules:

**Example Generation:**
```bash
yarn start generate-rules --count 20 --rule-types query
```

**Generated Rule Characteristics:**
- **Query Logic**: Realistic KQL queries targeting specific log sources
- **Filters**: Time-based and field-specific filters
- **Scheduling**: Appropriate run intervals (1m to 60m)
- **Risk Scoring**: Contextual risk scores (21-99)

**Sample Output:**
```json
{
  "name": "Suspicious PowerShell Execution with Encoded Commands",
  "type": "query",
  "query": "process.name:powershell.exe AND process.args:*-enc*",
  "risk_score": 73,
  "severity": "high",
  "interval": "5m"
}
```

### 2. **Threshold Rules**
Event frequency-based detection:

**Example Generation:**
```bash
yarn start generate-rules --count 15 --rule-types threshold
```

**Generated Characteristics:**
- **Threshold Values**: Realistic count thresholds (5-100)
- **Time Windows**: Appropriate time frames (5m to 24h)
- **Group-by Fields**: Logical grouping (host.name, user.name, source.ip)
- **Cardinality Thresholds**: For distinct value counting

**Sample Output:**
```json
{
  "name": "High Volume Failed Authentication Attempts",
  "type": "threshold",
  "query": "event.category:authentication AND event.outcome:failure",
  "threshold": {
    "field": ["user.name", "source.ip"],
    "value": 50,
    "cardinality": [{"field": "user.name", "value": 1}]
  }
}
```

### 3. **EQL Rules**
Event Query Language for sequence detection:

**Example Generation:**
```bash
yarn start generate-rules --count 10 --rule-types eql
```

**Generated Patterns:**
- **Sequence Detection**: Multi-event attack patterns
- **Process Chains**: Parent-child process relationships
- **Network Sequences**: Connection patterns and data flows
- **File Operations**: File creation, modification, and deletion sequences

**Sample Output:**
```json
{
  "name": "Credential Dumping Process Chain",
  "type": "eql",
  "query": "sequence [process where process.name == \"lsass.exe\"] [file where file.extension == \".dmp\"]",
  "language": "eql"
}
```

### 4. **Machine Learning Rules**
Anomaly detection using ML jobs:

**Example Generation:**
```bash
yarn start generate-rules --count 8 --rule-types ml
```

**ML Integration:**
- **Job Dependencies**: References to existing ML jobs
- **Anomaly Thresholds**: Appropriate severity scores (25-100)
- **Result Types**: Anomaly record and bucket result types
- **Lookback Windows**: Historical analysis periods

**Sample Output:**
```json
{
  "name": "Unusual Network Activity Detected by ML",
  "type": "machine_learning",
  "anomaly_threshold": 75,
  "machine_learning_job_id": "network-anomaly-detection"
}
```

### 5. **Threat Match Rules**
IOC-based threat intelligence matching:

**Example Generation:**
```bash
yarn start generate-rules --count 12 --rule-types threat_match
```

**Threat Intelligence Features:**
- **IOC Matching**: IP addresses, domains, file hashes
- **Threat Intel Indices**: Integration with threat intelligence indices
- **Enrichment**: Automatic threat context addition
- **Attribution**: Threat actor and campaign associations

### 6. **New Terms Rules**
Detect new and unusual field values:

**Example Generation:**
```bash
yarn start generate-rules --count 10 --rule-types new_terms
```

**New Terms Detection:**
- **Learning Periods**: Historical analysis windows
- **Field Monitoring**: Track new values in specific fields
- **Baseline Establishment**: Historical normal behavior
- **Anomaly Scoring**: New term significance weighting

### 7. **ES|QL Rules**
Elasticsearch Query Language rules:

**Example Generation:**
```bash
yarn start generate-rules --count 8 --rule-types esql
```

**ES|QL Features:**
- **Advanced Analytics**: Statistical analysis and aggregations
- **Cross-Index Queries**: Multi-index data correlation
- **Performance Optimization**: Efficient query patterns
- **Complex Logic**: Advanced filtering and transformation

## MITRE ATT&CK Integration

### Complete Technique Coverage
```bash
yarn start generate-rules --count 30 --mitre
```

**MITRE Mapping Features:**
- **Tactic Coverage**: All 14 MITRE ATT&CK tactics
- **Technique Attribution**: Primary and sub-technique mapping
- **Threat Actor Context**: APT group and malware family associations
- **Attack Chains**: Multi-stage technique sequences

**Example MITRE Mapping:**
```json
{
  "threat": [{
    "framework": "MITRE ATT&CK",
    "tactic": {
      "id": "TA0002",
      "name": "Execution",
      "reference": "https://attack.mitre.org/tactics/TA0002/"
    },
    "technique": [{
      "id": "T1059.001",
      "name": "PowerShell",
      "reference": "https://attack.mitre.org/techniques/T1059/001/"
    }]
  }]
}
```

### Attack Chain Generation
```bash
yarn start generate-rules --count 20 --mitre --attack-chains
```

Creates correlated rules representing complete attack progressions:
1. **Initial Access**: T1566 (Phishing)
2. **Execution**: T1059 (Command and Scripting Interpreter)
3. **Persistence**: T1053 (Scheduled Task/Job)
4. **Lateral Movement**: T1021 (Remote Services)

## AI-Enhanced Generation

### Contextual Descriptions
```bash
yarn start generate-rules --count 25 --ai
```

AI generates:
- **Detailed Descriptions**: Technical threat context and impact
- **Investigation Guides**: Step-by-step analysis procedures
- **False Positive Analysis**: Common FP scenarios and mitigation
- **Threat Intelligence**: Current threat landscape context

**Example AI Enhancement:**
```json
{
  "description": "Detects suspicious PowerShell execution patterns commonly associated with malware deployment and credential theft. This rule identifies encoded command execution, which is frequently used by attackers to evade detection while executing malicious payloads.",
  "note": "## Investigation Guide\n1. Examine the full PowerShell command line\n2. Decode any base64 content\n3. Check for parent process context\n4. Review network connections from the host",
  "false_positives": ["Legitimate system administration scripts", "Software deployment tools", "Automated patch management"]
}
```

## Rule Configuration

### Severity and Risk Scoring
Generated rules include realistic severity and risk scoring:

```json
{
  "severity": "high",
  "risk_score": 73,
  "risk_score_mapping": [{
    "field": "event.risk_score",
    "operator": "equals",
    "value": ""
  }]
}
```

### Scheduling and Performance
Appropriate scheduling based on rule type and complexity:

```json
{
  "interval": "5m",
  "from": "now-6m",
  "to": "now",
  "look_back": "5m"
}
```

### Actions and Notifications
Rules include realistic action configurations:

```json
{
  "actions": [{
    "id": "webhook-action",
    "group": "default",
    "params": {
      "message": "Security Alert: {{context.rule.name}}"
    }
  }]
}
```

## Multi-Space Generation

### Space-Specific Rules
```bash
# Generate rules in specific space
yarn start generate-rules --space security-testing --count 30

# Generate across multiple spaces
yarn start generate-rules --environments 5 --count 100
```

**Multi-Space Benefits:**
- **Environment Isolation**: Development, testing, production separation
- **Team Segregation**: Different teams, different rule sets
- **Use Case Specialization**: SOC training vs production monitoring
- **Performance Testing**: Load testing without production impact

## Use Cases

### 1. **SOC Training and Education**
```bash
yarn start generate-rules --count 50 --ai --with-alerts --space training
```

**Training Features:**
- Complete rule-to-alert workflows
- AI-generated investigation guides
- Realistic false positive scenarios
- Progressive difficulty levels

### 2. **SIEM Testing and Validation**
```bash
yarn start generate-rules --count 100 --all-types --performance-test
```

**Testing Capabilities:**
- Rule engine performance testing
- Alert correlation validation
- Detection coverage assessment
- System resource impact analysis

### 3. **Detection Engineering**
```bash
yarn start generate-rules --count 30 --mitre --correlations --export
```

**Engineering Benefits:**
- Rule template creation
- MITRE coverage mapping
- Detection gap analysis
- Baseline rule establishment

### 4. **Compliance and Auditing**
```bash
yarn start generate-rules --count 40 --compliance-frameworks --documentation
```

**Compliance Features:**
- Regulatory requirement coverage
- Audit trail documentation
- Control effectiveness measurement
- Risk assessment support

## Best Practices

### Rule Generation Strategy
1. **Start Small**: Begin with 10-20 rules to test integration
2. **Mix Rule Types**: Use diverse rule types for comprehensive coverage
3. **Enable MITRE**: Always include ATT&CK mappings for context
4. **Use AI Enhancement**: Leverage AI for detailed descriptions and guides
5. **Test with Alerts**: Generate corresponding alerts to test workflows

### Performance Considerations
- **Batch Size**: Generate rules in batches of 25-50 for optimal performance
- **Index Impact**: Monitor index performance with threshold and ML rules
- **Resource Usage**: Consider CPU and memory impact of complex EQL queries
- **Scheduling**: Distribute rule schedules to avoid resource spikes

### Quality Assurance
- **Validation**: Test generated rules in non-production environments
- **Tuning**: Adjust thresholds based on environment noise levels
- **Documentation**: Maintain clear rule descriptions and investigation guides
- **Version Control**: Track rule changes and performance metrics

## Troubleshooting

### Common Issues

#### Rules Not Triggering
**Issue**: Generated rules don't create alerts
**Solutions**:
- Verify query syntax and field mappings
- Check rule scheduling and time windows
- Validate data source availability
- Review index patterns and privileges

#### Performance Problems
**Issue**: Rules cause system performance issues
**Solutions**:
- Reduce query complexity and scope
- Adjust scheduling intervals
- Optimize threshold values
- Monitor resource utilization

#### False Positive Management
**Issue**: Too many false positive alerts
**Solutions**:
- Use AI-generated false positive lists
- Implement proper rule tuning
- Add appropriate filters and exceptions
- Review detection logic and thresholds

### Debug and Monitoring
```bash
# Generate rules with debug output
yarn start generate-rules --count 10 --debug

# Monitor rule performance
yarn start monitor-rules --space production

# Validate rule syntax
yarn start validate-rules --rule-file exported-rules.json
```

## Advanced Features

### Rule Correlation and Chaining
Generate correlated rules that work together:
```bash
yarn start generate-rules --count 20 --correlations --attack-chains
```

### Custom Rule Templates
Use custom templates for organization-specific needs:
```bash
yarn start generate-rules --template custom-org --count 30
```

### Integration with External Tools
Export rules for use with other security tools:
```bash
yarn start generate-rules --count 40 --export-format sigma
```

---

*Ready to build comprehensive detection capabilities? Start with `yarn start generate-rules --count 25 --mitre --ai` for a complete rule generation experience!*
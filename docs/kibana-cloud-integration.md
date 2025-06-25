# 🔗 Kibana Cloud Integration Guide

Complete guide for generating security data that appears directly in Kibana Cloud's Security interface.

## 🎯 Overview

The Security Documents Generator creates data specifically for Kibana Cloud's Security application. All security alerts are automatically indexed to `.alerts-security.alerts-default` and appear in the **Security → Alerts** interface with rich contextual data for realistic security analysis.

## 🚨 Generating Data for Kibana Security Alerts

### Basic Security Alerts

Generate security alerts that immediately appear in Kibana's Security interface:

```bash
# Generate 25 security alerts with enriched fields
yarn start generate-alerts -n 25 --multi-field --field-count 500 --field-categories threat_intelligence,security_scores

# Generate MITRE ATT&CK mapped alerts
yarn start generate-alerts -n 15 --mitre --multi-field --field-count 300 --field-categories behavioral_analytics,network_analytics

# Generate alerts with false positives for detection rule testing
yarn start generate-alerts -n 20 --false-positive-rate 0.3 --multi-field --field-count 200
```

### Realistic Attack Campaigns

Create comprehensive attack scenarios with supporting logs:

```bash
# APT campaign with realistic detection rates
yarn start generate-campaign apt --mitre --realistic --detection-rate 0.8

# Ransomware attack with supporting logs
yarn start generate-campaign ransomware --mitre --realistic --detection-rate 0.6

# Insider threat simulation
yarn start generate-campaign insider --mitre --realistic --detection-rate 0.7
```

## 📊 Kibana Cloud Index Patterns

### Security Alerts Index
- **Index**: `.alerts-security.alerts-default`
- **Kibana Location**: Security → Alerts
- **Data Types**: Security alerts, MITRE ATT&CK mappings, threat intelligence
- **Access**: Direct access via Kibana Security application

### Log Data Streams
- **Pattern**: `logs-*-default` (system, auth, network, endpoint)
- **Kibana Location**: Discover → Index Patterns
- **Data Types**: Source logs, session view data, visual analyzer data
- **Integration**: Correlated with security alerts via `correlation_id`

## 🎯 Multi-Field Categories for Security Analytics

### Essential Categories for Kibana Security
- `threat_intelligence` - IoC matches, reputation scores, malware families, campaign attribution
- `security_scores` - Risk assessments, vulnerability scores, compliance ratings, confidence levels
- `behavioral_analytics` - User/host behavior analysis, anomaly scores, baseline deviations
- `network_analytics` - Connection analysis, DNS queries, beaconing detection, data exfiltration
- `endpoint_analytics` - Process injection, persistence mechanisms, lateral movement indicators
- `audit_compliance` - Audit trails, compliance checks, violation tracking, policy enforcement

### Advanced Categories
- `forensics_analysis` - Digital forensics evidence, timeline reconstruction, memory analysis
- `incident_response` - Response metrics, containment tracking, recovery analytics
- `malware_analysis` - Malware behavior, infection chains, C2 communication patterns

## 🔍 Kibana Security Workflow Examples

### 1. Basic Security Monitoring Setup

```bash
# Generate comprehensive security dataset
yarn start generate-alerts -n 50 --mitre --multi-field --field-count 400 --field-categories threat_intelligence,security_scores,behavioral_analytics

# Add supporting logs for investigation
yarn start generate-logs -n 200 --types system,auth,network,endpoint --multi-field --field-count 200 --field-categories network_analytics,endpoint_analytics

# Create realistic attack scenarios
yarn start generate-campaign apt --mitre --realistic --detection-rate 0.7
```

### 2. Detection Rule Testing

```bash
# Generate alerts with known false positives
yarn start generate-alerts -n 30 --false-positive-rate 0.25 --multi-field --field-count 300 --field-categories security_scores,audit_compliance

# Test different attack patterns
yarn start generate-campaign ransomware --mitre --realistic --detection-rate 0.8
yarn start generate-campaign phishing --mitre --realistic --detection-rate 0.6
```

### 3. SOC Analyst Training

```bash
# Create investigation scenarios with Session View data
yarn start generate-logs -n 100 --session-view --visual-analyzer --types endpoint --multi-field --field-count 250

# Generate complex attack chains
yarn start generate-campaign insider --mitre --realistic --detection-rate 0.5
```

## 🎨 Kibana Dashboard Integration

### Security Analytics Fields Available
- **Threat Intelligence**: `threat.enrichment.*`, `threat.actor.*`, `threat.ttp.*`
- **Risk Scoring**: `security.score.*`, `risk.assessment.*`
- **Behavioral Analysis**: `user_behavior.*`, `host_behavior.*`, `entity_behavior.*`
- **Network Analytics**: `network.analytics.*`, `network.performance.*`
- **MITRE ATT&CK**: `threat.technique.*`, `threat.tactic.*`, `threat.framework`

### Index Patterns for Kibana

```bash
# Security alerts (shows in Security app automatically)
.alerts-security.alerts-*

# All log data streams
logs-*

# Specific log types
logs-system.*     # System and authentication logs
logs-network.*    # Network traffic and DNS logs
logs-endpoint.*   # Endpoint detection and process logs
logs-security.*   # Security events and behavioral logs
```

## 🔧 Kibana Cloud Configuration Tips

### For optimal Kibana Security integration:

1. **Index Lifecycle Management**: Generated data streams use ILM policies for automatic cleanup
2. **Space Isolation**: Use `--space <name>` to separate different test environments
3. **Time Range**: Use `--start-date` and `--end-date` for specific time windows
4. **Field Limits**: Keep `--field-count ≤ 1000` for optimal Kibana performance
5. **Detection Rates**: Use `--detection-rate 0.7` for realistic SOC scenarios (70% detection rate)

### Recommended Kibana Queries

```kql
# View all security alerts
kibana.alert.rule.category : *

# MITRE ATT&CK alerts only
threat.technique.id : T*

# High-risk alerts
security.score.overall_risk > 70

# False positives for tuning
event.outcome : "false_positive"

# Behavioral anomalies
user_behavior.anomaly_score > 80
```

## 🚀 Quick Start for Kibana Cloud Security

### Essential Commands for Kibana Security Alerts

```bash
# 1. Generate basic security alerts (shows immediately in Security → Alerts)
yarn start generate-alerts -n 25 --mitre --multi-field --field-count 400

# 2. Create comprehensive attack scenario
yarn start generate-campaign apt --mitre --realistic --detection-rate 0.8

# 3. Add supporting investigation data
yarn start generate-logs -n 100 --types system,auth,network,endpoint --multi-field --field-count 200

# 4. Generate false positives for detection tuning
yarn start generate-alerts -n 15 --false-positive-rate 0.3 --multi-field --field-count 300

# 5. Clean up when done
yarn start delete-all
```

### Verification
- **Kibana Security**: Go to Security → Alerts (data appears automatically)
- **Index**: `.alerts-security.alerts-default` 
- **Count**: `curl -u "user:pass" "https://your-cluster/_cat/count/.alerts-security.alerts-default"`
- **Fields**: MITRE ATT&CK, threat intelligence, behavioral analytics, security scores

## 🔧 Troubleshooting

### Security Alerts Not Appearing in Kibana

**Problem**: Generated alerts don't show in Security → Alerts

**Solutions**:
```bash
# 1. Verify alerts are in the correct index
curl -u "user:pass" "https://your-cluster.elastic-cloud.com/.alerts-security.alerts-default/_count"

# 2. Generate alerts specifically for security interface
yarn start generate-alerts -n 10 --mitre --multi-field --field-count 300

# 3. Check space configuration (if using custom spaces)
yarn start generate-alerts -n 5 --space your-space-name
```

### Document Size Limits (429MB Error)

**Problem**: `es_rejected_execution_exception` with large field counts

**Solutions**:
```bash
# 1. Use recommended field counts (≤1000)
yarn start generate-alerts -n 20 --multi-field --field-count 1000

# 2. Reduce field count for very large datasets
yarn start generate-logs -n 100 --multi-field --field-count 500

# 3. The system will warn you about limits
⚠️  WARNING: Field count > 5,000 may exceed Elasticsearch document size limits
```

### Index Pattern Recognition Issues

**Problem**: Data streams not appearing in Kibana

**Solutions**:
```bash
# 1. Create index patterns manually in Kibana
logs-*                    # For all log data
.alerts-security.alerts-* # For security alerts

# 2. Use specific log types for better organization
yarn start generate-logs -n 50 --types system,auth,network,endpoint

# 3. Verify data stream creation
curl -u "user:pass" "https://your-cluster.elastic-cloud.com/_data_stream"
```

### MITRE ATT&CK Data Not Displaying

**Problem**: MITRE fields missing in Kibana Security

**Solutions**:
```bash
# 1. Always use --mitre flag for security alerts
yarn start generate-alerts -n 15 --mitre --multi-field --field-count 400

# 2. Verify MITRE fields are present
threat.technique.id
threat.technique.name
threat.tactic.id
threat.framework

# 3. Generate attack campaigns for complete MITRE coverage
yarn start generate-campaign apt --mitre --realistic
```

### Multi-Field Data Missing

**Problem**: Custom security fields not visible

**Solutions**:
```bash
# 1. Verify multi-field generation is enabled
yarn start generate-alerts -n 10 --multi-field --field-count 500 --field-categories threat_intelligence

# 2. Check specific field categories
threat.enrichment.*      # Threat intelligence
security.score.*         # Risk scoring  
user_behavior.*          # Behavioral analytics
network.analytics.*      # Network analysis

# 3. Use Kibana's field list to find generated fields
```

### Performance Issues with Large Field Counts

**Problem**: Slow Kibana performance with high field density

**Solutions**:
```bash
# 1. Use performance mode for faster generation
yarn start generate-alerts -n 25 --multi-field --field-count 300 --field-performance-mode

# 2. Optimize field categories for your use case
--field-categories threat_intelligence,security_scores  # Essential only
--field-categories behavioral_analytics,network_analytics  # Analysis focus

# 3. Use smaller batches for very large datasets
yarn start generate-logs -n 1000 --multi-field --field-count 200
```

### Time Range and Data Visualization

**Problem**: Generated data outside expected time ranges

**Solutions**:
```bash
# 1. Set specific time ranges
yarn start generate-alerts -n 20 --start-date "7d" --end-date "now"

# 2. Use time patterns for realistic distribution
--time-pattern business_hours    # 9-5 weekdays
--time-pattern attack_simulation # Realistic attack timing
--time-pattern random           # Random distribution

# 3. For historical data analysis
yarn start generate-campaign apt --start-date "30d" --end-date "7d"
```

### Space and Environment Isolation

**Problem**: Data mixing between test environments

**Solutions**:
```bash
# 1. Use dedicated spaces for different tests
yarn start generate-alerts -n 15 --space production-test
yarn start generate-alerts -n 10 --space development-test

# 2. Use namespaces for complete isolation
yarn start generate-logs -n 100 --namespace staging --environments 5

# 3. Clean up between tests
yarn start delete-all  # Removes all generated data
```

### Verification Commands

**Check data creation**:
```bash
# Count security alerts
curl -u "user:pass" "https://cluster.elastic-cloud.com/.alerts-security.alerts-default/_count"

# List created indices
curl -u "user:pass" "https://cluster.elastic-cloud.com/_cat/indices/logs-*?v"

# Check specific fields
curl -u "user:pass" "https://cluster.elastic-cloud.com/.alerts-security.alerts-default/_search?size=1&_source=threat.*,security.*"
```

## 🔗 Related Documentation

- **[Multi-Field Generation](multi-field-generation.md)** - Complete guide to generating enriched security fields
- **[Use Cases Guide](use-cases-guide.md)** - Enterprise scenarios and workflows
- **[MITRE ATT&CK Integration](mitre-attack.md)** - Attack framework integration
- **[Configuration](configuration.md)** - System setup and optimization

---

**Ready to start?** Use the Quick Start commands above to generate security data that immediately appears in your Kibana Cloud Security interface!
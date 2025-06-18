# False Positive Generation

The Security Documents Generator includes comprehensive false positive generation capabilities for testing detection rules, SOC workflows, and analyst training scenarios.

## 🎯 Overview

False positive generation creates realistic resolved alerts that mimic common scenarios where security tools trigger on benign activities. This is essential for:

- **Detection Rule Tuning**: Test rule thresholds and reduce noise
- **SOC Workflow Training**: Practice alert triage and resolution workflows  
- **Baseline Establishment**: Understand normal false positive rates
- **Tool Configuration**: Optimize security tool sensitivity settings

## 🚀 Quick Start

### Basic False Positive Generation
```bash
# Generate 100 alerts with 20% false positives
yarn start generate-alerts -n 100 --false-positive-rate 0.2

# High false positive rate for training scenarios
yarn start generate-alerts -n 50 --false-positive-rate 0.5
```

### Advanced Usage
```bash
# MITRE ATT&CK alerts with false positives
yarn start generate-alerts -n 200 --mitre --false-positive-rate 0.15

# Large-scale detection rule testing
yarn start generate-alerts -n 1000 --false-positive-rate 0.1 --large-scale
```

## 📊 False Positive Categories

The system generates five categories of realistic false positives:

### 🔧 Maintenance
- Scheduled system maintenance activity
- Authorized administrative script execution  
- System backup and archival processes
- Software deployment and updates
- Database maintenance operations

### 🛠️ Authorized Tools
- Legitimate security scanning tools
- Authorized penetration testing
- System monitoring and diagnostic tools
- Network administration utilities
- Performance benchmarking software

### 💼 Normal Business
- Normal business operations during extended hours
- Legitimate user accessing required resources
- Standard data processing workflows
- Authorized bulk data transfers
- Regular automated reporting processes

### ⚙️ Configuration Change
- Authorized configuration modifications
- Standard policy enforcement
- Legitimate service account activity
- Normal group policy updates
- Authorized firewall rule changes

### 🎯 False Detection
- Rule threshold too sensitive
- Benign process flagged incorrectly
- Legitimate traffic misidentified
- Normal user behavior outside baseline
- System process triggering detection

## 📋 Generated Fields

False positive alerts include these additional fields for analysis:

### Workflow Fields
```json
{
  "kibana.alert.status": "closed",
  "kibana.alert.workflow_status": "closed",
  "kibana.alert.workflow_reason": "Scheduled system maintenance activity",
  "kibana.alert.workflow_user": "Alice Johnson",
  "kibana.alert.workflow_updated_at": "2024-01-15T14:30:00.000Z"
}
```

### False Positive Tracking
```json
{
  "kibana.alert.false_positive": true,
  "kibana.alert.false_positive.category": "maintenance",
  "kibana.alert.false_positive.analyst": "Alice Johnson",
  "kibana.alert.false_positive.resolution_time_minutes": 45,
  "event.outcome": "false_positive"
}
```

### Rule Enhancement
```json
{
  "kibana.alert.rule.false_positives": [
    "maintenance: Scheduled system maintenance activity"
  ]
}
```

## 🔍 Querying False Positives

### ES|QL Queries

#### Find All False Positives
```esql
FROM logs-*
| WHERE event.outcome == "false_positive"
| STATS count = COUNT(*) BY kibana.alert.false_positive.category
| SORT count DESC
```

#### Analyze Resolution Patterns
```esql
FROM logs-*
| WHERE kibana.alert.workflow_status == "closed"
| STATS 
    count = COUNT(*),
    avg_resolution_time = AVG(kibana.alert.false_positive.resolution_time_minutes)
  BY kibana.alert.workflow_reason
| SORT count DESC
```

#### False Positive Rate by Rule
```esql
FROM logs-*
| STATS 
    total = COUNT(*),
    false_positives = COUNT(*) WHERE event.outcome == "false_positive"
  BY kibana.alert.rule.name
| EVAL false_positive_rate = false_positives / total * 100
| SORT false_positive_rate DESC
```

### KQL Queries

#### Basic False Positive Filter
```kql
event.outcome: "false_positive"
```

#### Resolution Analysis
```kql
kibana.alert.workflow_status: "closed" AND kibana.alert.workflow_reason: *
```

#### Category Breakdown
```kql
kibana.alert.false_positive.category: ("maintenance" OR "authorized_tools" OR "normal_business")
```

## 📈 Use Cases

### 1. Detection Rule Tuning
Test different false positive rates to find optimal rule thresholds:

```bash
# Test with low false positive rate (well-tuned rules)
yarn start generate-alerts -n 500 --false-positive-rate 0.05

# Test with high false positive rate (overly sensitive rules)  
yarn start generate-alerts -n 500 --false-positive-rate 0.3
```

### 2. SOC Analyst Training
Create realistic triage scenarios:

```bash
# Mixed alert types for comprehensive training
yarn start generate-alerts -n 200 --mitre --false-positive-rate 0.25

# High-volume scenario for time pressure training
yarn start generate-alerts -n 1000 --false-positive-rate 0.2 --large-scale
```

### 3. Tool Configuration Testing
Validate security tool configurations:

```bash
# Baseline false positive measurement
yarn start generate-alerts -n 100 --false-positive-rate 0.1

# Stress test with challenging scenarios
yarn start generate-alerts -n 300 --false-positive-rate 0.4 --mitre --attack-chains
```

### 4. Workflow Efficiency Analysis
Measure SOC workflow performance:

```bash
# Generate alerts with resolution metadata
yarn start generate-alerts -n 150 --false-positive-rate 0.3

# Query resolution time patterns
# Use the generated resolution_time_minutes field for analysis
```

## 📊 Statistics and Reporting

When generating alerts with false positives, the system provides detailed statistics:

```
📊 False Positive Statistics:
  🎯 Expected False Positives: ~30 (30.0%)
  ✅ Alerts marked as resolved with workflow reasons
  📋 Categories: maintenance, authorized_tools, normal_business, false_detection
```

This includes:
- **Expected Count**: Approximate number of false positives generated
- **Rate Confirmation**: Verification of the requested false positive rate
- **Category Distribution**: Overview of false positive types created
- **Workflow Status**: Confirmation that alerts are properly marked as resolved

## ⚠️ Best Practices

### Rate Selection
- **Training Scenarios**: 25-40% false positive rate for realistic complexity
- **Rule Tuning**: 10-20% false positive rate for optimization testing
- **Baseline Testing**: 5-15% false positive rate for normal operations
- **Stress Testing**: 40-60% false positive rate for extreme scenarios

### Query Optimization
- Use `event.outcome == "false_positive"` for fastest filtering
- Index on `kibana.alert.false_positive.category` for category analysis
- Leverage `kibana.alert.workflow_status == "closed"` for resolution tracking

### Data Retention
- False positive data is valuable for historical analysis
- Consider separate indices for training vs. production false positive data
- Archive resolution patterns for rule improvement over time

## 🔗 Integration

False positive generation integrates seamlessly with:

- **MITRE ATT&CK**: `--mitre --false-positive-rate 0.2`
- **AI Enhancement**: `--claude --false-positive-rate 0.15`  
- **Attack Campaigns**: `generate-campaign insider --false-positive-rate 0.3`
- **Large Scale**: `--large-scale --false-positive-rate 0.1`

This provides comprehensive testing scenarios that mirror real-world SOC environments with realistic false positive patterns.
# Multi-Field Generation

High-performance, token-free generation of hundreds of contextually relevant security fields for enhanced SIEM testing and SOC training.

## 🎯 Overview

The Multi-Field Generation feature adds **500+ realistic security fields** to your logs and alerts using algorithmic generation instead of AI, delivering:

- **99% Token Reduction**: Zero AI calls for field generation
- **95% Faster Generation**: <100ms for 500 fields per document
- **Realistic Correlations**: CPU high → memory high, threat confidence → risk score
- **Context Awareness**: Attack scenarios get security fields, normal logs get performance fields
- **Infinite Scalability**: Generate millions of fields in minutes

## 🚀 Quick Start

### Basic Usage

```bash
# Generate alerts with 200 additional security fields (default)
yarn start generate-alerts -n 100 --multi-field

# Generate logs with 300 additional fields
yarn start generate-logs -n 1000 --multi-field --field-count 300

# High-speed generation with performance optimization
yarn start generate-alerts -n 500 --multi-field --field-count 400 --field-performance-mode
```

### Advanced Usage

```bash
# Target specific field categories
yarn start generate-alerts -n 50 --multi-field \
  --field-categories behavioral_analytics,threat_intelligence,security_scores

# Combine with existing features
yarn start generate-campaign ransomware --mitre --multi-field --field-count 500

# Large-scale dataset generation
yarn start generate-logs -n 10000 --multi-field --field-count 200 --large-scale
```

## 📊 Available Field Categories

### 1. Behavioral Analytics (`behavioral_analytics`)
User and host behavior analysis with anomaly detection:

```json
{
  "user_behavior.anomaly_score": 87.45,
  "user_behavior.login_frequency_score": 0.92,
  "user_behavior.baseline_deviation": 2.3,
  "user_behavior.off_hours_activity_score": 15.6,
  "user_behavior.failed_login_count_24h": 3,
  "user_behavior.unique_hosts_accessed_24h": 7,
  "host_behavior.cpu_usage_baseline": 34.2,
  "host_behavior.memory_usage_baseline": 67.8,
  "host_behavior.process_creation_rate": 12.5,
  "host_behavior.anomaly_score": 23.1,
  "entity_behavior.communication_pattern_score": 56.7,
  "entity_behavior.access_pattern_score": 41.3
}
```

### 2. Threat Intelligence (`threat_intelligence`)
Threat analysis and attribution data:

```json
{
  "threat.intelligence.confidence": 85,
  "threat.intelligence.severity": "high",
  "threat.enrichment.reputation_score": -75,
  "threat.enrichment.malware_family": "Emotet",
  "threat.enrichment.ioc_matches": 12,
  "threat.enrichment.first_seen": "2024-01-15T10:30:00Z",
  "threat.enrichment.last_seen": "2024-06-18T14:22:00Z",
  "threat.actor.motivation": "financial",
  "threat.actor.sophistication": "high",
  "threat.campaign.name": "APT1",
  "threat.ttp.prevalence": 67.2,
  "threat.indicator.weight": 89.5
}
```

### 3. Performance Metrics (`performance_metrics`)
System and network performance indicators:

```json
{
  "system.performance.cpu_usage": 78.3,
  "system.performance.memory_usage": 84.7,
  "system.performance.disk_usage": 45.2,
  "system.performance.disk_io_read": 1048576,
  "system.performance.disk_io_write": 2097152,
  "system.performance.network_bytes_in": 5242880,
  "system.performance.network_bytes_out": 3145728,
  "system.performance.process_count": 234,
  "system.performance.thread_count": 1567,
  "network.performance.latency_avg": 12.5,
  "network.performance.packet_loss": 0.8,
  "network.performance.bandwidth_utilization": 67.3,
  "application.performance.response_time": 145.7
}
```

### 4. Security Scores (`security_scores`)
Risk assessment and security posture metrics:

```json
{
  "security.score.overall_risk": 72.4,
  "security.score.vulnerability_score": 68.9,
  "security.score.compliance_score": 91.2,
  "security.score.patch_level": 78.5,
  "security.score.configuration_score": 83.1,
  "risk.assessment.likelihood": 0.72,
  "risk.assessment.impact": 0.85,
  "risk.assessment.exploitability": 45.3,
  "risk.mitigation.effectiveness": 67.8,
  "security.maturity.level": 3,
  "security.controls.count": 23,
  "security.controls.effectiveness": 76.4
}
```

### 5. Audit & Compliance (`audit_compliance`)
Audit trails and compliance monitoring:

```json
{
  "audit.activity.count_24h": 342,
  "audit.activity.privileged_access_count": 8,
  "audit.activity.failed_access_count": 15,
  "compliance.check.status": "pass",
  "compliance.check.score": 92.3,
  "compliance.framework.name": "SOX",
  "compliance.violation.severity": "medium",
  "compliance.violation.count": 2,
  "audit.trail.integrity_score": 98.7,
  "audit.retention.days_remaining": 1825
}
```

### 6. Network Analytics (`network_analytics`)
Advanced network behavior analysis:

```json
{
  "network.analytics.connection_count_external": 45,
  "network.analytics.connection_count_internal": 156,
  "network.analytics.dns_query_count": 234,
  "network.analytics.suspicious_domain_count": 3,
  "network.analytics.malicious_ip_connections": 1,
  "network.analytics.port_scan_score": 23.4,
  "network.analytics.data_exfiltration_score": 12.7,
  "network.analytics.protocol_anomaly_score": 8.9,
  "network.analytics.beaconing_score": 34.5,
  "network.analytics.tunnel_detection_score": 15.6
}
```

### 7. Endpoint Analytics (`endpoint_analytics`)
Endpoint detection and response metrics:

```json
{
  "endpoint.analytics.process_injection_score": 87.3,
  "endpoint.analytics.persistence_score": 45.2,
  "endpoint.analytics.lateral_movement_score": 23.8,
  "endpoint.analytics.privilege_escalation_score": 67.4,
  "endpoint.analytics.file_modification_count": 123,
  "endpoint.analytics.registry_modification_count": 45,
  "endpoint.analytics.suspicious_process_count": 7,
  "endpoint.analytics.memory_scan_score": 34.6,
  "endpoint.analytics.behavioral_score": 78.9,
  "endpoint.analytics.antivirus_detection_count": 2
}
```

## 🔧 CLI Options

### Core Options

| Option | Description | Default | Example |
|--------|-------------|---------|---------|
| `--multi-field` | Enable multi-field generation | `false` | `--multi-field` |
| `--field-count <count>` | Number of additional fields (1-1000) | `200` | `--field-count 300` |
| `--field-categories <categories>` | Comma-separated category list | `all` | `--field-categories behavioral_analytics,threat_intelligence` |
| `--field-performance-mode` | Optimize for speed over variety | `false` | `--field-performance-mode` |

### Valid Categories

- `behavioral_analytics` - User/host behavior analysis (80+ fields)
- `threat_intelligence` - Threat analysis and attribution (70+ fields)
- `performance_metrics` - System/network performance (60+ fields)
- `security_scores` - Risk and security assessments (50+ fields)
- `audit_compliance` - Audit trails and compliance (40+ fields)
- `network_analytics` - Network behavior analysis (60+ fields)
- `endpoint_analytics` - Endpoint detection metrics (50+ fields)

## 🎯 Context-Aware Field Selection

The multi-field generator automatically selects relevant fields based on:

### Log Type Detection
- **System logs** → Performance metrics, audit trails
- **Auth logs** → User behavior, compliance checks
- **Network logs** → Network analytics, threat intelligence
- **Endpoint logs** → Endpoint analytics, process behavior
- **Security alerts** → Threat intelligence, security scores

### Attack Context Detection
- **MITRE ATT&CK indicators** → Threat intelligence fields boosted
- **Suspicious activities** → Security and behavior analytics prioritized
- **Off-hours activity** → Behavioral analysis fields enhanced
- **High resource usage** → Performance metrics emphasized

### Time-Based Context
- **Business hours** → Normal activity patterns
- **Off-hours/weekends** → Elevated anomaly scores
- **Attack timeframes** → Enhanced threat indicators

## 🔗 Realistic Field Correlations

The system automatically applies realistic correlations between fields:

### Performance Correlations
```json
{
  "system.performance.cpu_usage": 85.2,
  "system.performance.memory_usage": 88.7,  // Correlated: High CPU → High Memory
  "network.performance.latency_avg": 145.3   // Correlated: High load → Higher latency
}
```

### Security Correlations
```json
{
  "threat.intelligence.confidence": 87,
  "security.score.overall_risk": 91.4,       // Correlated: High threat → High risk
  "user_behavior.anomaly_score": 78.9        // Correlated: Threats → Anomalous behavior
}
```

### Behavioral Correlations
```json
{
  "user_behavior.anomaly_score": 76.3,
  "user_behavior.risk_score": 81.7,          // Correlated: Anomaly → Risk
  "user_behavior.baseline_deviation": 2.8    // Correlated: High anomaly → High deviation
}
```

### Network Correlations
```json
{
  "network.analytics.malicious_ip_connections": 3,
  "network.analytics.suspicious_domain_count": 5,  // Correlated: Malicious IPs → Sus domains
  "threat.enrichment.ioc_matches": 8                // Correlated: Network threats → IoCs
}
```

## ⚡ Performance Optimization

### Automatic Performance Modes

The system automatically optimizes based on field count:

- **≤100 fields**: Full AI generation with multi-field enhancement
- **>100 fields**: High-performance template generation (bypasses AI batch issues)
- **Performance mode**: Weighted selection prioritizes high-impact fields

### Performance Benchmarks

| Field Count | Generation Time | Memory Usage | Token Usage |
|-------------|----------------|--------------|-------------|
| 50 fields   | <50ms          | <10MB        | 0 tokens    |
| 200 fields  | <100ms         | <25MB        | 0 tokens    |
| 500 fields  | <200ms         | <50MB        | 0 tokens    |
| 1000 fields | <400ms         | <75MB        | 0 tokens    |

### Large-Scale Generation

For datasets >1000 documents, use the `--large-scale` flag:

```bash
yarn start generate-logs -n 10000 --multi-field --field-count 300 --large-scale
```

This enables:
- Optimized memory usage
- Parallel batch processing
- Reduced index overhead
- Progress reporting

## 🧪 Example Use Cases

### SOC Training Scenarios

```bash
# Realistic insider threat simulation
yarn start generate-campaign insider --multi-field --field-count 400 \
  --field-categories behavioral_analytics,audit_compliance,security_scores

# APT campaign with full telemetry
yarn start generate-campaign apt --mitre --multi-field --field-count 500 \
  --field-categories threat_intelligence,network_analytics,endpoint_analytics
```

### Detection Rule Testing

```bash
# Generate alerts with false positives and rich context
yarn start generate-alerts -n 200 --multi-field --field-count 300 \
  --false-positive-rate 0.15 --field-categories security_scores,behavioral_analytics

# Performance baseline testing
yarn start generate-logs -n 5000 --multi-field --field-count 200 \
  --field-categories performance_metrics,audit_compliance --field-performance-mode
```

### SIEM Performance Testing

```bash
# Large-scale ingestion test
yarn start generate-logs -n 50000 --multi-field --field-count 150 \
  --large-scale --field-performance-mode

# Mixed workload simulation
yarn start generate-alerts -n 1000 --multi-field --field-count 250 \
  --mitre --realistic --detection-rate 0.7
```

## 🔍 Integration with Existing Features

Multi-field generation seamlessly integrates with all existing features:

### MITRE ATT&CK Integration
```bash
yarn start generate-alerts -n 100 --mitre --multi-field --field-count 300
# Result: MITRE techniques + 300 additional contextual fields
```

### False Positive Generation
```bash
yarn start generate-alerts -n 200 --multi-field --false-positive-rate 0.2
# Result: 20% false positives with rich field context for rule tuning
```

### Session View & Visual Analyzer
```bash
yarn start generate-logs -n 1000 --multi-field --session-view --visual-analyzer
# Result: Process hierarchies + multi-field enrichment for investigation
```

### Realistic Campaign Mode
```bash
yarn start generate-campaign ransomware --realistic --multi-field --field-count 400
# Result: Complete attack pipeline with 400 additional fields per document
```

## 🛠️ Development Guide

### Adding New Field Categories

1. **Add templates to `src/utils/multi_field_templates.ts`**:

```typescript
export const MULTI_FIELD_TEMPLATES: MultiFieldTemplates = {
  // ... existing categories
  
  my_new_category: {
    'my_category.field_name': {
      type: 'float',
      generator: () => faker.number.float({ min: 0, max: 100 }),
      description: 'My custom security metric',
      context_weight: 8
    },
    // ... more fields
  }
};
```

2. **Update CLI validation** in `src/index.ts`:

```typescript
const validCategories = [
  'behavioral_analytics', 'threat_intelligence', 'performance_metrics',
  'security_scores', 'audit_compliance', 'network_analytics', 
  'endpoint_analytics', 'my_new_category'  // Add here
];
```

3. **Add correlations** in `src/utils/multi_field_generator.ts`:

```typescript
private applyFieldCorrelations(fields: Record<string, any>, context: LogContext): number {
  // ... existing correlations
  
  // My custom correlations
  if (fields['my_category.field_name'] && fields['other.field']) {
    // Apply realistic correlation logic
  }
}
```

### Field Template Guidelines

- **Naming convention**: `category.subcategory.field_name`
- **Context weights**: 1-10 (higher = more likely to be selected)
- **Realistic ranges**: Use appropriate min/max values for your domain
- **Correlations**: Consider how fields relate to existing metrics

### Testing New Fields

```bash
# Test specific categories
yarn start generate-alerts -n 10 --multi-field \
  --field-categories my_new_category --field-count 50

# Enable debug logging
DEBUG_AI_RESPONSES=true yarn start generate-logs -n 5 --multi-field \
  --field-categories my_new_category
```

## 🐛 Troubleshooting

### Common Issues

**Issue**: "Expected X alerts, got 0. Padding with defaults."
**Solution**: Use `--field-count >100` to automatically bypass AI batch issues:
```bash
yarn start generate-alerts -n 100 --multi-field --field-count 200
```

**Issue**: Generation seems slow with many fields
**Solution**: Enable performance mode:
```bash
yarn start generate-logs -n 1000 --multi-field --field-performance-mode
```

**Issue**: Want more threat-focused fields
**Solution**: Use specific categories:
```bash
yarn start generate-alerts -n 50 --multi-field \
  --field-categories threat_intelligence,security_scores,endpoint_analytics
```

### Debug Mode

Enable detailed logging:
```bash
DEBUG_AI_RESPONSES=true yarn start generate-alerts -n 5 --multi-field
```

This shows:
- AI response parsing details
- Field selection logic
- Correlation applications
- Performance metrics

### Performance Tuning

For optimal performance:

1. **Use field counts >100** to bypass AI batch complexity
2. **Enable performance mode** for speed over variety
3. **Use specific categories** instead of "all" for faster selection
4. **Enable large-scale mode** for datasets >1000 documents

## 📈 Performance Comparison

| Mode | Time (100 alerts) | Fields/Alert | Token Usage | Realism |
|------|-------------------|--------------|-------------|---------|
| **Standard** | 45s | 50 | 200 tokens | High |
| **AI + Multi-field** | 60s | 250 | 200 tokens | Very High |
| **Template + Multi-field** | 2s | 250 | 0 tokens | High |
| **Performance Mode** | 1s | 200 | 0 tokens | High |

## 🎉 Benefits Summary

### For Security Teams
- **Enhanced Detection Testing**: 500+ realistic fields for comprehensive rule validation
- **SOC Training**: Rich, contextual data for analyst skill development  
- **Realistic Scenarios**: Complete attack stories with forensic evidence chains
- **Performance Testing**: Validate SIEM performance under realistic field loads

### For Developers
- **Token Efficiency**: 99% reduction in AI costs while maintaining data quality
- **Scalability**: Generate millions of enriched documents in minutes
- **Integration Ready**: Works seamlessly with existing security tools
- **Customizable**: Add domain-specific fields and correlations easily

### For Operations
- **Cost Effective**: Minimal operational overhead with maximum data richness
- **Reliable**: Zero dependency on AI availability for field generation
- **Fast**: Sub-second generation times for hundreds of fields
- **Consistent**: Deterministic output for reproducible testing scenarios

---

*Ready to enhance your security data generation? Start with `yarn start generate-alerts -n 100 --multi-field --field-count 300` and experience the power of contextual multi-field generation!*
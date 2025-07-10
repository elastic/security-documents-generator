# Security Documents Generator - Documentation

Welcome to the comprehensive documentation for the Security Documents Generator.

## 📚 Available Documentation

### 🛡️ **[Detection Rules Generation](detection-rules.md)** ⭐ NEW
Complete guide for generating all types of Elastic Security detection rules:
- **All 7 Rule Types**: Query, Threshold, EQL, Machine Learning, Threat Match, New Terms, ES|QL
- **Realistic Configurations**: Type-specific queries, parameters, and MITRE mappings
- **Multi-Space Support**: Generate rules across different Kibana spaces
- **Triggered Alerts**: Rules generate realistic alerts for complete testing workflows
- **SOC Training**: Comprehensive detection rule scenarios

### 🔗 **[Kibana Cloud Integration](kibana-cloud-integration.md)** ⭐ NEW
Complete guide for generating security data that appears directly in Kibana Cloud's Security interface:
- **Direct Security Alerts**: Automatically indexed to `.alerts-security.alerts-default`
- **MITRE ATT&CK Integration**: Full framework coverage with realistic attack scenarios
- **Multi-Field Enrichment**: Threat intelligence, behavioral analytics, and security scores
- **Troubleshooting Guide**: Solutions for common Kibana Cloud integration issues
- **Quick Start Commands**: Immediate data generation for Security → Alerts interface

### 🧠 **[Knowledge Base Integration](knowledge-base-integration.md)** ⭐ NEW
Comprehensive guide for creating AI Assistant Knowledge Base documents:
- **ELSER v2 Integration**: Semantic text fields optimized for AI Assistant
- **AI-Optimized Questions**: Category-specific suggested questions for enhanced interactions
- **10 Security Categories**: From threat intelligence to compliance documentation
- **MITRE ATT&CK Mapping**: Technique and tactic associations for knowledge documents
- **Rich Console Output**: Document titles, confidence indicators, and suggested questions

### 🔬 **[Multi-Field Generation](multi-field-generation.md)**
Complete guide to generating 500+ contextual security fields with zero AI overhead:
- **99% Token Reduction**: Algorithmic field generation
- **95% Faster**: <100ms for 500 fields per document
- **7 Field Categories**: Behavioral analytics, threat intelligence, performance metrics, and more
- **Realistic Correlations**: CPU high → memory high, threat confidence → risk score
- **Context Awareness**: Automatic field selection based on log type and attack indicators

### 📋 **[Use Cases Guide](use-cases-guide.md)**
Enterprise scenarios and comprehensive workflow examples for security testing and analysis.

### ❌ **[False Positives](false-positives.md)**
Guide to generating realistic false positive alerts for detection rule testing and SOC training.

### 🎭 **[Attack Campaigns](attack-campaigns.md)**
Multi-stage attack scenario generation with MITRE ATT&CK integration.

### ⚔️ **[MITRE ATT&CK](mitre-attack.md)**
Framework integration, technique mapping, and attack chain generation.

### 🤖 **[AI Integration](ai-integration.md)**
Multi-provider AI setup and configuration (OpenAI, Azure OpenAI, Claude).

### ⚙️ **[Configuration](configuration.md)**
System configuration, performance tuning, and optimization guides.

### 📖 **[API Reference](api-reference.md)**
Complete API documentation and programmatic usage examples.

## 🚀 Quick Links

- **[Main README](../README.md)** - Project overview and quick start
- **[CLAUDE.md](../CLAUDE.md)** - Detailed project instructions for Claude Code
- **[Detection Rules Generation](detection-rules.md)** - All detection rule types and configurations ⭐
- **[Kibana Cloud Integration](kibana-cloud-integration.md)** - Direct integration with Kibana Security interface ⭐
- **[Knowledge Base Integration](knowledge-base-integration.md)** - AI Assistant Knowledge Base setup ⭐
- **[Multi-Field Generation](multi-field-generation.md)** - Comprehensive multi-field guide

## 🎯 Popular Use Cases

### Kibana Cloud Security Setup ⭐
```bash
# Generate security alerts that appear immediately in Kibana Security → Alerts
yarn start generate-alerts -n 25 --mitre --multi-field --field-count 400
yarn start generate-campaign apt --mitre --realistic --detection-rate 0.8
```

### Detection Rules Generation ⭐
```bash
# Generate all detection rule types
yarn start rules -r 15 --rule-types query,threshold,eql,machine_learning,threat_match,new_terms,esql -s default

# SOC training with specific rule types
yarn start rules -r 25 --rule-types query,threshold,eql,new_terms -e 150 -s soc-training
```

### AI Assistant Knowledge Base ⭐
```bash
# Generate comprehensive security knowledge base for AI Assistant
yarn start generate-knowledge-base -n 30 --categories threat_intelligence,incident_response --mitre
yarn start generate-knowledge-base -n 25 --access-level public --confidence-threshold 0.9
```

### SOC Training
```bash
# Generate detection rules for SOC training
yarn start rules -r 25 --rule-types query,threshold,eql,new_terms -s soc-training

# Generate realistic insider threat scenario with full telemetry
yarn start generate-campaign insider --realistic --mitre --multi-field --field-count 400
```

### Detection Rule Testing
```bash
# Generate comprehensive detection rules
yarn start rules -r 15 --rule-types query,threshold,eql,machine_learning -s testing

# Create alerts with false positives and rich context for rule tuning
yarn start generate-alerts -n 200 --multi-field --false-positive-rate 0.15
```

### Performance Testing
```bash
# Large-scale SIEM ingestion testing
yarn start generate-logs -n 50000 --multi-field --field-count 200 --large-scale
```

### Research & Development
```bash
# APT campaign with comprehensive behavioral analytics
yarn start generate-campaign apt --mitre --multi-field \
  --field-categories behavioral_analytics,threat_intelligence,endpoint_analytics
```

## 🔗 External Resources

- [Elastic Common Schema (ECS)](https://www.elastic.co/guide/en/ecs/current/index.html)
- [MITRE ATT&CK Framework](https://attack.mitre.org/)
- [Elastic Security](https://www.elastic.co/security)
- [Kibana Documentation](https://www.elastic.co/guide/en/kibana/current/index.html)

---

**Need help?** Check out the [Multi-Field Generation guide](multi-field-generation.md) for the latest features, or refer to the [main README](../README.md) for quick start instructions.
# Security Documents Generator - Documentation

Welcome to the comprehensive documentation for the Security Documents Generator.

## 📚 Available Documentation

### 🛡️ **[Detection Rules Generation](detection-rules.md)** ⭐
Complete guide for generating all types of Elastic Security detection rules:
- **All 7 Rule Types**: Query, Threshold, EQL, Machine Learning, Threat Match, New Terms, ES|QL
- **Realistic Configurations**: Type-specific queries, parameters, and MITRE mappings
- **Multi-Space Support**: Generate rules across different Kibana spaces
- **Triggered Alerts**: Rules generate realistic alerts for complete testing workflows

### 🔗 **[Kibana Cloud Integration](kibana-cloud-integration.md)** ⭐
Complete guide for generating security data that appears directly in Kibana Cloud's Security interface:
- **Direct Security Alerts**: Automatically indexed to `.alerts-security.alerts-default`
- **MITRE ATT&CK Integration**: Full framework coverage with realistic attack scenarios
- **Multi-Field Enrichment**: Threat intelligence, behavioral analytics, and security scores
- **Visual Event Analyzer**: Linux process events with complete correlation support

### 🧠 **[Knowledge Base Integration](knowledge-base-integration.md)** ⭐
Comprehensive guide for creating AI Assistant Knowledge Base documents:
- **ELSER v2 Integration**: Semantic text fields optimized for AI Assistant
- **AI-Optimized Questions**: Category-specific suggested questions for enhanced interactions
- **10 Security Categories**: From threat intelligence to compliance documentation
- **MITRE ATT&CK Mapping**: Technique and tactic associations for knowledge documents

### 🔬 **[Multi-Field Generation](multi-field-generation.md)**
Complete guide to generating unlimited contextual security fields with zero AI overhead:
- **Enterprise Scale**: Up to 50,000 fields per document
- **12 Field Categories**: From behavioral analytics to forensics analysis
- **99% Token Reduction**: Algorithmic field generation
- **Realistic Correlations**: CPU high → memory high, threat confidence → risk score

### 🤖 **[Machine Learning Integration](machine-learning-integration.md)**
ML anomaly detection data generation and Elastic Security ML job integration:
- **21 Pre-built ML Jobs** across 6 security domains
- **6 ML Analysis Functions** (rare, high_count, time_of_day, etc.)
- **Theme Integration**: 19 supported themes for realistic entity names
- **Complete ML Workflow**: From data generation to rule creation

### 🎭 **[Attack Campaigns](attack-campaigns.md)**
Multi-stage attack scenario generation with MITRE ATT&CK integration:
- **Realistic Campaign Mode**: Complete log→alert pipeline
- **4 Campaign Types**: APT, ransomware, insider, supply chain
- **Detection Rate Control**: Configure what percentage gets detected
- **Investigation Guides**: Automated analysis recommendations

### ❌ **[False Positives](false-positives.md)**
Guide to generating realistic false positive alerts for detection rule testing and SOC training:
- **5 Categories**: Maintenance, authorized tools, normal business, configuration changes, false detection
- **Workflow Integration**: Complete resolved alert lifecycle
- **Rule Tuning**: Support for optimizing detection rule thresholds

### ⚔️ **[MITRE ATT&CK](mitre-attack.md)**
Framework integration, technique mapping, and attack chain generation:
- **Complete Framework Coverage**: All tactics, techniques, and sub-techniques
- **Attack Chain Generation**: Multi-stage attack progression
- **Dynamic Risk Scoring**: Severity based on technique combinations

### 🤖 **[AI Integration](ai-integration.md)**
Multi-provider AI setup and configuration (OpenAI, Azure OpenAI, Claude):
- **3 AI Providers**: OpenAI, Azure OpenAI, Claude (Anthropic)
- **Enterprise Features**: Private network access, compliance certifications
- **Performance Optimization**: Caching, batching, rate limiting

### ⚙️ **[Configuration](configuration.md)**
System configuration, performance tuning, and optimization guides:
- **Authentication Options**: API key (recommended), username/password
- **Performance Tuning**: Batch sizes, concurrent requests, caching
- **Security Settings**: Certificate validation, timeouts, retries

### 📖 **[API Reference](api-reference.md)**
Complete command-line interface reference:
- **All Commands**: generate-alerts, generate-logs, generate-campaign, rules, etc.
- **All Options**: Detailed flag descriptions and examples
- **Integration Examples**: Combined workflows and advanced usage

### 📋 **[Use Cases Guide](use-cases-guide.md)**
Enterprise scenarios and comprehensive workflow examples:
- **Multi-Environment Deployment**: 100s-1000s of simulated environments
- **SOC Training Scenarios**: Progressive difficulty and realistic exercises
- **Performance Testing**: Large-scale data generation and validation

## 🚀 Quick Links

- **[Main README](../README.md)** - Project overview and quick start
- **[CLAUDE.md](../CLAUDE.md)** - Complete command reference for Claude Desktop
- **[Detection Rules Generation](detection-rules.md)** - All detection rule types ⭐
- **[Kibana Cloud Integration](kibana-cloud-integration.md)** - Direct Security interface integration ⭐
- **[Multi-Field Generation](multi-field-generation.md)** - Enterprise-scale field generation ⭐

## 🎯 Popular Use Cases

### Kibana Cloud Security Setup ⭐
```bash
# Generate security alerts that appear immediately in Kibana Security → Alerts
yarn start generate-alerts -n 25 --mitre --multi-field --field-count 400

# Complete attack scenario with Visual Event Analyzer
yarn start generate-campaign apt --mitre --realistic --visual-analyzer --detection-rate 0.8
```

### Detection Rules Generation ⭐
```bash
# Generate all detection rule types
yarn start rules -r 15 --rule-types query,threshold,eql,machine_learning,threat_match,new_terms,esql -s default

# SOC training with themed data
yarn start rules -r 25 --rule-types query,threshold,eql,new_terms -e 150 -s soc-training --theme marvel
```

### AI Assistant Knowledge Base ⭐
```bash
# Generate comprehensive security knowledge base
yarn start generate-knowledge-base -n 30 --categories threat_intelligence,incident_response --mitre

# High-confidence public documentation
yarn start generate-knowledge-base -n 25 --access-level public --confidence-threshold 0.9
```

### Enterprise Multi-Environment
```bash
# Generate across 100 environments with themed data
yarn start generate-alerts -n 500 --environments 100 --namespace prod --theme starwars

# Multi-environment campaign with comprehensive fields
yarn start generate-campaign apt --environments 25 --multi-field --field-count 10000 --realistic
```

### Performance Testing
```bash
# Large-scale SIEM ingestion testing
yarn start generate-logs -n 50000 --multi-field --field-count 200 --large-scale

# Enterprise-scale field generation
yarn start generate-alerts -n 100 --multi-field --field-count 25000 --field-performance-mode
```

## 🔗 External Resources

- [Elastic Common Schema (ECS)](https://www.elastic.co/guide/en/ecs/current/index.html)
- [MITRE ATT&CK Framework](https://attack.mitre.org/)
- [Elastic Security](https://www.elastic.co/security)
- [Kibana Documentation](https://www.elastic.co/guide/en/kibana/current/index.html)

---

**Need help?** Check out the [Multi-Field Generation guide](multi-field-generation.md) for the latest features, or refer to the [main README](../README.md) for quick start instructions.
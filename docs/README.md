# Security Documents Generator - Documentation

Welcome to the comprehensive documentation for the Security Documents Generator.

## 📚 Available Documentation

### 🔬 **[Multi-Field Generation](multi-field-generation.md)** ⭐ NEW
Complete guide to generating 500+ contextual security fields with zero AI overhead:
- **99% Token Reduction**: Algorithmic field generation
- **95% Faster**: <100ms for 500 fields per document
- **7 Field Categories**: Behavioral analytics, threat intelligence, performance metrics, and more
- **Realistic Correlations**: CPU high → memory high, threat confidence → risk score
- **Context Awareness**: Automatic field selection based on log type and attack indicators

### 🎭 Attack Campaigns *(Coming Soon)*
Multi-stage attack scenario generation with MITRE ATT&CK integration.

### 🤖 AI Integration *(Coming Soon)*
Multi-provider AI setup and configuration (OpenAI, Azure OpenAI, Claude).

### ⚔️ MITRE ATT&CK *(Coming Soon)*
Framework integration, technique mapping, and attack chain generation.

### ⚙️ Configuration *(Coming Soon)*
System configuration, performance tuning, and optimization guides.

## 🚀 Quick Links

- **[Main README](../README.md)** - Project overview and quick start
- **[CLAUDE.md](../CLAUDE.md)** - Detailed project instructions for Claude Code
- **[Multi-Field Generation](multi-field-generation.md)** - Comprehensive multi-field guide

## 🎯 Popular Use Cases

### SOC Training
```bash
# Generate realistic insider threat scenario with full telemetry
yarn start generate-campaign insider --realistic --mitre --multi-field --field-count 400
```

### Detection Rule Testing
```bash
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
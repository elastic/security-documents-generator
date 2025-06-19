# Security Documents Generator - Common Use Cases Guide

This comprehensive guide covers the most common use cases for the Security Documents Generator, including enterprise-scale multi-environment scenarios with advanced multi-field generation capabilities.

## 📖 Table of Contents

1. [Quick Start Examples](#quick-start-examples)
2. [Enterprise Multi-Environment Scenarios](#enterprise-multi-environment-scenarios)
3. [Campaign Generation Use Cases](#campaign-generation-use-cases)
4. [High-Density Multi-Field Generation](#high-density-multi-field-generation)
5. [SIEM Testing & Validation](#siem-testing--validation)
6. [Performance & Load Testing](#performance--load-testing)
7. [Compliance & Audit Scenarios](#compliance--audit-scenarios)
8. [SOC Training & Red Team Exercises](#soc-training--red-team-exercises)

---

## 🚀 Quick Start Examples

### Basic Security Data Generation
```bash
# Generate 100 security alerts for basic testing
yarn start generate-alerts -n 100

# Generate 500 mixed system logs
yarn start generate-logs -n 500 --types system,auth,network

# Create APT campaign with 50 events
yarn start generate-campaign apt -e 50
```

### AI-Enhanced Generation
```bash
# Generate AI-powered alerts with MITRE ATT&CK integration
yarn start generate-alerts -n 200 --mitre --claude

# Create realistic ransomware campaign with detection simulation
yarn start generate-campaign ransomware --realistic --detection-rate 0.4
```

---

## 🌍 Enterprise Multi-Environment Scenarios

### Production Environment Simulation
```bash
# Simulate 100 production environments with comprehensive data
yarn start generate-alerts -n 500 --environments 100 --namespace prod
# Result: 50,000 alerts across prod-env-001 through prod-env-100

# Generate system logs across multiple production datacenters
yarn start generate-logs -n 2000 --environments 50 --namespace prod-dc --types system,endpoint
# Result: 100,000 logs across prod-dc-env-001 through prod-dc-env-050
```

### Multi-Tenant Customer Environments
```bash
# Simulate 200 customer environments for SaaS platform testing
yarn start generate-alerts -n 100 --environments 200 --namespace customer

# Generate endpoint security data for managed security services
yarn start generate-logs -n 1000 --environments 150 --namespace msp-client --types endpoint,network
```

### Geographic Distribution Testing
```bash
# North American regions
yarn start generate-campaign apt --environments 25 --namespace us-east

# European regions  
yarn start generate-campaign insider --environments 20 --namespace eu-west

# Asia-Pacific regions
yarn start generate-campaign supply_chain --environments 30 --namespace apac
```

### Development Lifecycle Environments
```bash
# Development environments (10 environments)
yarn start generate-logs -n 500 --environments 10 --namespace dev --types system,auth

# Staging environments (5 environments) 
yarn start generate-campaign ransomware --environments 5 --namespace staging --realistic

# Production environments (50 environments)
yarn start generate-alerts -n 1000 --environments 50 --namespace prod --mitre --sub-techniques
```

---

## ⚔️ Campaign Generation Use Cases

### Advanced Persistent Threat (APT) Simulation
```bash
# Basic APT campaign
yarn start generate-campaign apt -e 1000 -t 50 --complexity high --mitre

# Multi-stage APT with realistic log generation
yarn start generate-campaign apt --realistic --logs-per-stage 12 --detection-rate 0.3 --complexity expert

# Enterprise APT across multiple environments
yarn start generate-campaign apt --environments 25 --namespace enterprise --multi-field --field-count 10000
```

### Ransomware Attack Scenarios
```bash
# Standard ransomware simulation
yarn start generate-campaign ransomware -e 2000 --complexity high --attack-chains

# Realistic ransomware with forensic evidence
yarn start generate-campaign ransomware --realistic --logs-per-stage 15 --detection-rate 0.4

# Multi-environment ransomware outbreak
yarn start generate-campaign ransomware --environments 100 --namespace global --complexity expert
```

### Insider Threat Detection
```bash
# Insider threat with behavioral analytics
yarn start generate-campaign insider --multi-field --field-categories behavioral_analytics,audit_compliance

# Multi-environment insider threat
yarn start generate-campaign insider --environments 50 --namespace corp --realistic --detection-rate 0.6
```

### Supply Chain Attacks
```bash
# Complex supply chain attack
yarn start generate-campaign supply_chain --complexity expert --sub-techniques --attack-chains

# Multi-environment supply chain compromise
yarn start generate-campaign supply_chain --environments 75 --namespace vendor --realistic
```

---

## 🔬 High-Density Multi-Field Generation

### Maximum Field Density (50,000 fields per document)
```bash
# Ultra-high density alerts for comprehensive testing
yarn start generate-alerts -n 100 --multi-field --field-count 50000

# Performance-optimized high-density generation
yarn start generate-logs -n 1000 --multi-field --field-count 25000 --field-performance-mode
```

### Category-Specific Field Generation
```bash
# Behavioral analytics focus
yarn start generate-alerts -n 500 --multi-field --field-count 5000 --field-categories behavioral_analytics,performance_metrics

# Threat intelligence enrichment
yarn start generate-logs -n 1000 --multi-field --field-count 8000 --field-categories threat_intelligence,security_scores

# Network analytics specialization
yarn start generate-logs -n 2000 --types network --multi-field --field-count 15000 --field-categories network_analytics,performance_metrics
```

### Enterprise-Scale Multi-Field Campaigns
```bash
# APT campaign with comprehensive forensics (10,000 fields per event)
yarn start generate-campaign apt --multi-field --field-count 10000 --environments 25

# Ransomware with full observability data (20,000 fields per event)
yarn start generate-campaign ransomware --multi-field --field-count 20000 --realistic --environments 50
```

---

## 🛡️ SIEM Testing & Validation

### Detection Rule Testing
```bash
# Generate alerts with false positives for rule tuning
yarn start generate-alerts -n 1000 --false-positive-rate 0.15 --mitre

# Multi-environment detection rule validation
yarn start generate-alerts -n 500 --environments 10 --false-positive-rate 0.2 --namespace test-rules
```

### SIEM Performance Testing
```bash
# High-volume data ingestion testing
yarn start generate-logs -n 10000 --environments 20 --large-scale --types system,auth,network,endpoint

# Sustained load testing with realistic attack patterns
yarn start generate-campaign apt --environments 100 --realistic --complexity high
```

### Correlation Rule Testing
```bash
# Generate correlated events for testing detection logic
yarn start generate-correlated -n 500 --log-volume 8 --mitre

# Multi-environment correlation testing
yarn start generate-correlated -n 200 --environments 25 --namespace correlation-test
```

---

## 📊 Performance & Load Testing

### Massive Scale Generation
```bash
# Generate 1 million events across 500 environments (2,000 per environment)
yarn start generate-logs -n 2000 --environments 500 --namespace load-test --large-scale

# Stress test with 100,000 alerts across 200 environments
yarn start generate-alerts -n 500 --environments 200 --namespace stress-test --large-scale
```

### Throughput Benchmarking
```bash
# High-throughput generation with performance monitoring
yarn start generate-logs -n 5000 --multi-field --field-count 30000 --field-performance-mode --large-scale

# Campaign throughput testing
yarn start generate-campaign scale-test --performance-test --enable-analytics
```

### Memory & Resource Testing
```bash
# Memory-intensive multi-field generation
yarn start generate-alerts -n 1000 --multi-field --field-count 40000 --environments 50

# Resource optimization testing
yarn start generate-campaign apt --environments 200 --multi-field --field-count 15000 --performance-test
```

---

## 📋 Compliance & Audit Scenarios

### Regulatory Compliance Testing
```bash
# Generate audit-compliant security logs
yarn start generate-logs -n 5000 --multi-field --field-categories audit_compliance,security_scores --types system,auth

# Multi-environment compliance validation
yarn start generate-alerts -n 1000 --environments 25 --namespace compliance --false-positive-rate 0.1
```

### Data Retention Testing
```bash
# Generate historical data for retention policy testing
yarn start generate-logs -n 10000 --start-date "30d" --end-date "1d" --environments 10

# Long-term data pattern generation
yarn start generate-campaign apt --start-date "90d" --end-date "now" --realistic --environments 5
```

### Forensic Investigation Scenarios
```bash
# Generate comprehensive forensic evidence
yarn start generate-campaign ransomware --realistic --multi-field --field-count 25000 --logs-per-stage 20

# Multi-environment incident simulation
yarn start generate-campaign insider --environments 10 --realistic --multi-field --field-categories forensics_analysis,behavioral_analytics
```

---

## 🎯 SOC Training & Red Team Exercises

### SOC Analyst Training
```bash
# Generate training scenarios with mixed attack types
yarn start generate-campaign apt --realistic --detection-rate 0.5 --complexity medium
yarn start generate-campaign insider --realistic --detection-rate 0.7 --complexity low

# Multi-environment training exercise
yarn start generate-alerts -n 200 --environments 5 --namespace training --false-positive-rate 0.3 --mitre
```

### Red Team Exercise Support
```bash
# Realistic attack simulation for red team exercises
yarn start generate-campaign supply_chain --realistic --complexity expert --detection-rate 0.2

# Multi-stage attack progression
yarn start generate-campaign apt --attack-chains --sub-techniques --complexity expert --realistic
```

### Blue Team Defense Testing
```bash
# Generate diverse attack patterns for defense testing
yarn start generate-campaign malware --mitre --multi-field --field-categories threat_intelligence,endpoint_analytics
yarn start generate-campaign phishing --realistic --logs-per-stage 10

# Multi-environment defense exercise
yarn start generate-campaign ransomware --environments 20 --namespace blue-team --realistic --complexity high
```

---

## 🔧 Advanced Configuration Examples

### Custom Time Patterns
```bash
# Business hours attack simulation
yarn start generate-campaign apt --time-pattern business_hours --realistic

# Weekend-heavy activity simulation  
yarn start generate-logs -n 2000 --time-pattern weekend_heavy --environments 10

# Attack-specific time patterns
yarn start generate-campaign insider --time-pattern attack_simulation --realistic
```

### Session View & Visual Analytics
```bash
# Generate Session View compatible data for process tracking
yarn start generate-logs -n 1000 --session-view --types endpoint

# Visual Event Analyzer compatible data
yarn start generate-campaign apt --visual-analyzer --realistic --complexity high

# Combined Session View and Visual Analytics
yarn start generate-logs -n 2000 --session-view --visual-analyzer --environments 5
```

### Custom Namespacing Strategies
```bash
# Geographic namespacing
yarn start generate-logs -n 1000 --environments 20 --namespace us-west-datacenter
yarn start generate-logs -n 1000 --environments 15 --namespace eu-central-datacenter

# Business unit namespacing
yarn start generate-alerts -n 500 --environments 10 --namespace finance-dept
yarn start generate-alerts -n 500 --environments 8 --namespace engineering-dept

# Environment tier namespacing
yarn start generate-campaign apt --environments 5 --namespace dev-tier
yarn start generate-campaign apt --environments 10 --namespace staging-tier  
yarn start generate-campaign apt --environments 50 --namespace prod-tier
```

---

## 💡 Best Practices & Tips

### Performance Optimization
- Use `--large-scale` flag for datasets > 1,000 events
- Enable `--field-performance-mode` for high-density multi-field generation
- Batch large multi-environment operations in smaller chunks for better resource management

### Resource Management
- Monitor memory usage when generating > 10,000 fields per document
- Use appropriate batch sizes based on your system capabilities
- Clean up test environments regularly using delete commands

### Data Quality
- Use `--realistic` mode for higher-quality attack simulation
- Enable `--mitre` for standardized threat intelligence integration
- Combine multi-field generation with realistic campaigns for comprehensive testing

### Environment Scaling
- Start with smaller environment counts and scale up based on performance
- Use meaningful namespace patterns for better data organization
- Implement Elasticsearch ILM policies for automated data lifecycle management

---

## 📞 Support & Resources

- **Documentation**: `/docs/multi-field-generation.md` for advanced multi-field features
- **Configuration**: `CLAUDE.md` for complete command reference  
- **Architecture**: See Architecture section in main documentation
- **Troubleshooting**: Check logs and use `--help` flags for command-specific guidance

This guide covers the most common use cases for enterprise-scale security data generation. Adjust parameters based on your specific testing requirements and infrastructure capabilities.
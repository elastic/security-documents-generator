# 🔄 Multi-Field Generation

Complete guide to generating security data with multiple field configurations and correlation patterns.

## 📋 Table of Contents

- [Overview](#overview)
- [Quick Start](#quick-start)
- [Field Generation Strategies](#field-generation-strategies)
- [Correlation Patterns](#correlation-patterns)
- [Performance Optimization](#performance-optimization)
- [Use Cases](#use-cases)
- [Troubleshooting](#troubleshooting)

## Overview

The multi-field generation system creates realistic security data with complex field relationships and correlation patterns, essential for testing detection rules and analytics.

## Quick Start

### Basic Multi-Field Generation
```bash
# Generate correlated alerts and logs
yarn start generate-correlated --count 100

# Generate alerts with expanded fields
yarn start generate-alerts --count 50 --fields-expansion

# Generate themed multi-field data
yarn start generate-alerts --theme marvel --count 100
```

## Field Generation Strategies

### 1. **Correlation-Based Generation**
Creates data where fields are logically connected:
- **User Activity**: Correlates user.name, source.ip, and process.name
- **Network Events**: Links destination.ip, network.protocol, and destination.port
- **Host Activity**: Correlates host.name, agent.id, and process.pid

### 2. **Theme-Based Field Expansion**
Generates contextually appropriate field values:
- **Marvel Theme**: Superhero-themed usernames, hostnames, and processes
- **Corporate Theme**: Business-appropriate naming conventions
- **Technical Theme**: Realistic technical identifiers

### 3. **Realistic Field Patterns**
Ensures field values follow real-world patterns:
- **IP Addresses**: Valid IP ranges and geolocation consistency
- **Timestamps**: Logical temporal relationships
- **Process Hierarchy**: Parent-child process relationships

## Correlation Patterns

### Alert-to-Log Correlation
```bash
# Generate alerts with corresponding process logs
yarn start generate-alerts --session-view --count 50
```

Creates:
- Security alerts with detection logic
- Corresponding endpoint process logs
- Linked through process.entity_id and agent.id

### Entity Relationship Patterns
- **User Sessions**: Multiple events for same user across time
- **Host Activity**: Correlated events on same host
- **Network Flows**: Bidirectional network communications

## Performance Optimization

### Batch Processing
- **Default Batch Size**: 10 documents per batch
- **Memory Management**: Automatic cleanup between batches
- **Index Optimization**: Efficient index pattern targeting

### Field Caching
- **Theme Data**: Cached character and entity names
- **IP Pools**: Pre-generated IP address ranges
- **Hostname Patterns**: Cached naming conventions

## Use Cases

### 1. **Detection Rule Testing**
Generate data that triggers specific detection rules:
```bash
yarn start generate-alerts --count 100 --realistic
```

### 2. **Correlation Analysis**
Test alert correlation and investigation workflows:
```bash
yarn start generate-correlated --count 200
```

### 3. **Performance Testing**
Generate large datasets for performance validation:
```bash
yarn start generate-alerts --count 1000 --batch-size 20
```

## Troubleshooting

### Common Issues

#### Field Correlation Problems
**Issue**: Fields don't correlate as expected
**Solution**: Verify correlation patterns in theme configuration

#### Performance Issues
**Issue**: Slow generation with many fields
**Solution**: Increase batch size and enable caching

#### Index Mapping Conflicts
**Issue**: Field type conflicts in Elasticsearch
**Solution**: Use setup-mappings command before generation

### Debug Mode
```bash
# Enable verbose logging
yarn start generate-alerts --count 10 --debug
```

## Advanced Configuration

### Custom Field Patterns
Modify field generation behavior through configuration:
- **Field Templates**: Define custom field value patterns
- **Correlation Rules**: Specify field relationship logic
- **Theme Customization**: Create custom naming themes

### Integration Points
- **Detection Rules**: Generated data designed to trigger rules
- **Machine Learning**: Field patterns support ML model training
- **Session View**: Process hierarchies for investigation workflows
# API Reference

Complete command-line interface reference for the Security Documents Generator.

## 📋 Command Overview

| Command | Purpose | AI Support | MITRE Support |
|---------|---------|------------|---------------|
| [`generate-campaign`](#generate-campaign) | AI-powered attack campaigns | ✅ | ✅ |
| [`generate-alerts`](#generate-alerts) | AI-enhanced security alerts | ✅ | ✅ |
| [`generate-events`](#generate-events) | AI-generated security events | ✅ | ✅ |
| [`generate-graph`](#generate-graph) | AI-powered entity graphs | ✅ | ❌ |
| [`test-mitre`](#test-mitre) | MITRE AI integration test | ✅ | ✅ |
| [`rules`](#rules) | AI-enhanced detection rules | ✅ | ✅ |
| [`delete-alerts`](#delete-alerts) | Clean up alerts | ❌ | ✅ |
| [`delete-events`](#delete-events) | Clean up events | ❌ | ✅ |
| [`delete-rules`](#delete-rules) | Clean up rules | ❌ | ✅ |

## 🎭 generate-campaign

Generate sophisticated multi-stage attack campaigns.

### Syntax
```bash
yarn start generate-campaign <type> [options]
```

### Campaign Types
- `apt` - Advanced Persistent Threat campaigns
- `ransomware` - Ransomware attack scenarios
- `insider` - Insider threat simulations
- `malware` - Malware infection campaigns
- `phishing` - Phishing attack scenarios
- `scale-test` - Performance testing framework (currently displays test plan only)

### Options

#### Core Options
| Flag | Description | Default | Example |
|------|-------------|---------|---------|
| `-c, --complexity <level>` | Campaign complexity | `high` | `--complexity expert` |
| `-t, --targets <count>` | Number of target hosts | `50` | `--targets 100` |
| `-e, --events <count>` | Number of events | `1000` | `--events 500` |
| `-s, --space <space>` | Kibana space | `default` | `--space security-test` |

#### AI Options
| Flag | Description | Example |
|------|-------------|---------|
| `--claude` | Use Claude AI instead of OpenAI | `--claude` |

> **Note:** AI generation is always enabled. The `--ai` flag has been removed as AI is now the default behavior.

#### MITRE Options
| Flag | Description | Requires | Example |
|------|-------------|----------|---------|
| `--mitre` | Enable MITRE ATT&CK | - | `--mitre` |
| `--sub-techniques` | Include sub-techniques | `--mitre` | `--mitre --sub-techniques` |
| `--attack-chains` | Generate attack chains | `--mitre` | `--mitre --attack-chains` |

#### Performance Options
| Flag | Description | Default | Example |
|------|-------------|---------|---------|
| `--large-scale` | Large-scale optimizations | `false` | `--large-scale` |
| `--batch-size <size>` | Batch size | `100` | `--batch-size 50` |
| `--performance-test` | Run performance tests | `false` | `--performance-test` |

#### Advanced Options
| Flag | Description | Default | Example |
|------|-------------|---------|---------|
| `--enable-analytics` | Advanced analytics | `false` | `--enable-analytics` |

### Examples

#### Basic Campaigns
```bash
# Simple APT campaign
yarn start generate-campaign apt --mitre --events 50

# Ransomware with attack chains
yarn start generate-campaign ransomware --mitre --attack-chains --events 100

# Insider threat simulation
yarn start generate-campaign insider --mitre --sub-techniques --events 75
```

#### Advanced Campaigns
```bash
# Expert-level APT with full features
yarn start generate-campaign apt --claude --mitre --sub-techniques --attack-chains --complexity expert --events 500 --targets 100

# Large-scale ransomware test
yarn start generate-campaign ransomware --mitre --large-scale --events 2000 --targets 200

# Performance testing framework (displays test plan)
yarn start generate-campaign scale-test --performance-test --events 10000
```

#### Custom Scenarios
```bash
# SOC training scenario
yarn start generate-campaign apt --mitre --attack-chains --complexity high --events 300 --space soc-training

# Red team exercise
yarn start generate-campaign malware --claude --mitre --sub-techniques --attack-chains --complexity expert --events 800 --targets 150
```

## 🚨 generate-alerts

Generate security alerts with optional AI and MITRE integration.

### Syntax
```bash
yarn start generate-alerts [options]
```

### Options

#### Core Options
| Flag | Description | Default | Example |
|------|-------------|---------|---------|
| `-n <count>` | Number of alerts | `1` | `-n 100` |
| `-h <count>` | Number of hosts | `1` | `-h 20` |
| `-u <count>` | Number of users | `1` | `-u 15` |
| `-s <space>` | Kibana space | `default` | `-s security` |

#### AI Options
| Flag | Description | Default | Example |
|------|-------------|---------|---------|
| `--claude` | Use Claude AI instead of OpenAI | `false` | `--claude` |

#### MITRE Options
| Flag | Description | Requires | Example |
|------|-------------|----------|---------|
| `--mitre` | Enable MITRE ATT&CK | - | `--mitre` |
| `--sub-techniques` | Include sub-techniques | `--mitre` | `--mitre --sub-techniques` |
| `--attack-chains` | Generate attack chains | `--mitre` | `--mitre --attack-chains` |

#### Performance Options
| Flag | Description | Default | Example |
|------|-------------|---------|---------|
| `--large-scale` | Large-scale optimizations | `false` | `--large-scale` |

#### Timestamp Options
| Flag | Description | Default | Example |
|------|-------------|---------|---------|
| `--start-date <date>` | Start date | `now` | `--start-date "7d"` |
| `--end-date <date>` | End date | `now` | `--end-date "now"` |
| `--time-pattern <pattern>` | Time distribution | `uniform` | `--time-pattern business_hours` |

#### False Positive Testing
| Flag | Description | Default | Example |
|------|-------------|---------|---------|
| `--false-positive-rate <rate>` | Percentage of alerts marked as false positives (0.0-1.0) | `0.0` | `--false-positive-rate 0.2` |

### Time Patterns
- `uniform` - Even distribution
- `business_hours` - 9 AM - 6 PM, Mon-Fri
- `random` - High variance
- `attack_simulation` - Burst patterns
- `weekend_heavy` - 60% weekend activity

### Examples

#### Basic Generation
```bash
# Simple alert generation
yarn start generate-alerts -n 50 -h 10 -u 5

# AI-powered alerts
yarn start generate-alerts -n 100 -h 20 -u 10
# MITRE-enhanced alerts
yarn start generate-alerts -n 200 -h 30 -u 15 --mitre
```

#### Advanced Generation
```bash
# Full-featured generation
yarn start generate-alerts -n 500 -h 50 -u 25 --claude --mitre --sub-techniques --attack-chains

# Large-scale generation
yarn start generate-alerts -n 5000 -h 200 -u 100 --mitre --large-scale

# Time-based generation
yarn start generate-alerts -n 100 -h 10 -u 5 --start-date "7d" --time-pattern business_hours
```

#### False Positive Testing
```bash
# Generate 20% false positives for rule tuning
yarn start generate-alerts -n 100 -h 10 -u 5 --false-positive-rate 0.2

# SOC workflow testing with high false positive rate
yarn start generate-alerts -n 200 -h 20 -u 10 --false-positive-rate 0.4 --mitre

# Detection rule testing with realistic false positive patterns
yarn start generate-alerts -n 500 -h 50 -u 25 --false-positive-rate 0.15 --claude --mitre
```

## 📊 generate-events

Generate security events with AI enhancement.

### Syntax
```bash
yarn start generate-events <count> [options]
```

### Arguments
| Argument | Description | Required | Example |
|----------|-------------|----------|---------|
| `<count>` | Number of events | ✅ | `100` |

### Options
| Flag | Description | Requires | Example |
|------|-------------|----------|---------|
| `--claude` | Use Claude AI instead of OpenAI | - | `--claude` |
| `--mitre` | Enable MITRE ATT&CK | - | `--mitre` |
| `--sub-techniques` | Include sub-techniques | `--mitre` | `--mitre --sub-techniques` |
| `--attack-chains` | Generate attack chains | `--mitre` | `--mitre --attack-chains` |
| `--large-scale` | Large-scale optimizations | - | `--large-scale` |

> **Note:** AI generation is always enabled. The `--ai` flag has been removed as AI is now the default behavior.

### Examples
```bash
# Basic event generation (AI always enabled)
yarn start generate-events 100

# MITRE-enhanced events
yarn start generate-events 500 --mitre

# Claude with MITRE
yarn start generate-events 1000 --claude --mitre --sub-techniques
```

## 🕸️ generate-graph

Generate entity relationship graphs.

### Syntax
```bash
yarn start generate-graph [options]
```

### Options
| Flag | Description | Default | Example |
|------|-------------|---------|---------|
| `--claude` | Use Claude AI instead of OpenAI | `false` | `--claude` |
| `-u, --users <number>` | Number of users | `100` | `--users 200` |
| `-h, --hosts <number>` | Max hosts per user | `3` | `--hosts 5` |

> **Note:** AI generation is always enabled. The `--ai` flag has been removed as AI is now the default behavior.

### Examples
```bash
# Basic graph generation (AI always enabled)
yarn start generate-graph --users 50 --hosts 2

# Claude-enhanced graph
yarn start generate-graph --claude --users 100 --hosts 4
```


## 🧪 test-mitre

Test MITRE ATT&CK integration.

### Syntax
```bash
yarn start test-mitre [options]
```

### Options
| Flag | Description | Default | Example |
|------|-------------|---------|---------|
| `-n <count>` | Number of test alerts | `5` | `-n 10` |
| `-s <space>` | Target space | `default` | `-s test` |

### Examples
```bash
# Basic MITRE test
yarn start test-mitre

# Custom test configuration
yarn start test-mitre -n 20 -s mitre-testing
```

## 🗑️ Cleanup Commands

Remove all generated data with comprehensive cleanup commands that support space-specific deletion.

### delete-alerts

Delete generated security alerts.

#### Syntax
```bash
yarn start delete-alerts [options]
```

#### Options
| Flag | Description | Default | Example |
|------|-------------|---------|---------|
| `-s, --space <space>` | Space to delete from | All spaces | `-s security-test` |

#### Examples
```bash
# Delete all alerts from all spaces
yarn start delete-alerts

# Delete alerts from specific space only
yarn start delete-alerts -s my-space
```

### delete-events

Delete generated security events.

#### Syntax
```bash
yarn start delete-events [options]
```

#### Options
| Flag | Description | Default | Example |
|------|-------------|---------|---------|
| `-s, --space <space>` | Space context (informational) | All events | `-s security-test` |

#### Examples
```bash
# Delete all events
yarn start delete-events

# Delete with space context
yarn start delete-events -s my-space
```

### delete-rules

Delete generated detection rules and associated gap events.

#### Syntax
```bash
yarn start delete-rules [options]
```

#### Options
| Flag | Description | Default | Example |
|------|-------------|---------|---------|
| `-s, --space <space>` | Space to delete from | All spaces | `-s security-test` |

#### Examples
```bash
# Delete all rules from all spaces
yarn start delete-rules

# Delete rules from specific space only
yarn start delete-rules -s my-space
```

## 🔧 Utility Commands

### AI-Enhanced Detection Rules
```bash
# Generate AI-powered rules and events
yarn start rules --rules 50 --events 100

# Delete all rules
yarn start delete-rules --space security
```

## 📅 Date Formats

### Relative Dates
- `7d` - 7 days ago
- `1w` - 1 week ago
- `1M` - 1 month ago
- `1y` - 1 year ago

### Absolute Dates
- `2024-01-01` - Specific date
- `2024-01-01T10:30:00Z` - Full timestamp

### Special Values
- `now` - Current time

## 🚨 Flag Dependencies

### AI Flags
- AI generation is always enabled
- `--claude` switches to Claude AI provider

### MITRE Flags
- `--sub-techniques` requires `--mitre`
- `--attack-chains` requires `--mitre`

### Error Examples
```bash
# ❌ Invalid: Sub-techniques without MITRE
yarn start generate-alerts --sub-techniques

# ❌ Invalid: Attack chains without MITRE
yarn start generate-alerts --attack-chains

# ✅ Valid: Claude with MITRE
yarn start generate-alerts --claude --mitre

# ✅ Valid: Full chain
yarn start generate-alerts --claude --mitre --sub-techniques --attack-chains
```

## 🔄 Command Chaining

### Sequential Generation
```bash
# Generate multiple campaign types
yarn start generate-campaign apt --mitre --events 100
yarn start generate-campaign ransomware --mitre --events 100
yarn start generate-campaign insider --mitre --events 100
```

### Combined Testing
```bash
# Full security scenario
yarn start generate-campaign apt --mitre --attack-chains --events 200
yarn start generate-alerts -n 300 --mitre --sub-techniques
yarn start generate-events 500 --mitre
```

## 🎯 Best Practices

### Performance Optimization
1. Use `--large-scale` for >1000 events
2. Adjust batch sizes based on system capacity
3. Enable caching in configuration
4. Monitor memory usage during generation

### AI Usage
1. Start with small counts to test API connectivity
2. Use Claude for enhanced creativity
3. Enable MITRE for realistic attack scenarios
4. Combine sub-techniques with attack chains

### Testing Workflows
1. Begin with basic generation
2. Add AI enhancement gradually
3. Enable MITRE for detection testing
4. Use campaigns for comprehensive scenarios

### Error Handling
1. Check API keys and quotas
2. Validate Elasticsearch connectivity
3. Monitor generation logs
4. Use debug mode for troubleshooting

## 📊 Output Validation

### Verify Generated Data
```bash
# Check alert count in Kibana
GET .alerts-security.alerts-*/_count

# Verify MITRE field population
GET .alerts-security.alerts-*/_search
{
  "query": { "exists": { "field": "threat.technique.id" } }
}

# Campaign correlation check
GET .alerts-security.alerts-*/_search
{
  "query": { "exists": { "field": "campaign.id" } }
}
```
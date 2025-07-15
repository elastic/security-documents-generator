# API Reference

Complete command-line interface reference for the Security Documents Generator.

## 📋 Command Overview

| Command | Purpose | AI Support | MITRE Support |
|---------|---------|------------|---------------|
| [`generate-campaign`](#generate-campaign) | AI-powered attack campaigns | ✅ | ✅ |
| [`generate-alerts`](#generate-alerts) | AI-enhanced security alerts | ✅ | ✅ |
| [`generate-logs`](#generate-logs) | AI-generated security logs | ✅ | ✅ |
| [`generate-correlated`](#generate-correlated) | Correlated alerts and logs | ✅ | ✅ |
| [`generate-graph`](#generate-graph) | AI-powered entity graphs | ✅ | ❌ |
| [`generate-cases`](#generate-cases) | Security case generation | ✅ | ✅ |
| [`generate-knowledge-base`](#generate-knowledge-base) | AI Assistant knowledge docs | ✅ | ✅ |
| [`generate-fields`](#generate-fields) | Standalone field generation | ❌ | ❌ |
| [`generate-ml-data`](#generate-ml-data) | ML anomaly training data | ✅ | ✅ |
| [`rules`](#rules) | AI-enhanced detection rules | ✅ | ✅ |
| [`delete-alerts`](#delete-alerts) | Clean up alerts | ❌ | ❌ |
| [`delete-logs`](#delete-logs) | Clean up logs | ❌ | ❌ |
| [`delete-rules`](#delete-rules) | Clean up rules | ❌ | ❌ |
| [`delete-all`](#delete-all) | Clean up all data | ❌ | ❌ |

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
- `supply_chain` - Supply chain attack scenarios

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

#### MITRE Options
| Flag | Description | Requires | Example |
|------|-------------|----------|---------|
| `--mitre` | Enable MITRE ATT&CK | - | `--mitre` |
| `--sub-techniques` | Include sub-techniques | `--mitre` | `--mitre --sub-techniques` |
| `--attack-chains` | Generate attack chains | `--mitre` | `--mitre --attack-chains` |

#### Realistic Mode Options
| Flag | Description | Default | Example |
|------|-------------|---------|---------|
| `--realistic` | Generate source logs that trigger alerts | `false` | `--realistic` |
| `--logs-per-stage <count>` | Logs per attack stage | `8` | `--logs-per-stage 12` |
| `--detection-rate <rate>` | Detection rate (0.0-1.0) | `0.4` | `--detection-rate 0.7` |

#### Multi-Field Options
| Flag | Description | Default | Example |
|------|-------------|---------|---------|
| `--multi-field` | Generate additional security fields | `false` | `--multi-field` |
| `--field-count <count>` | Number of additional fields | `200` | `--field-count 500` |
| `--field-categories <categories>` | Comma-separated categories | `all` | `--field-categories threat_intelligence,behavioral_analytics` |
| `--field-performance-mode` | Optimize for speed | `false` | `--field-performance-mode` |

#### Environment Options
| Flag | Description | Default | Example |
|------|-------------|---------|---------|
| `--namespace <namespace>` | Custom namespace | `default` | `--namespace prod` |
| `--environments <count>` | Multi-environment generation | `1` | `--environments 25` |

#### Session Analysis Options
| Flag | Description | Default | Example |
|------|-------------|---------|---------|
| `--session-view` | Generate Session View data | `false` | `--session-view` |
| `--visual-analyzer` | Generate Visual Event Analyzer data | `false` | `--visual-analyzer` |

#### Theme Options
| Flag | Description | Default | Example |
|------|-------------|---------|---------|
| `--theme <theme>` | Apply themed data | none | `--theme marvel` |

#### Performance Options
| Flag | Description | Default | Example |
|------|-------------|---------|---------|
| `--large-scale` | Large-scale optimizations | `false` | `--large-scale` |
| `--batch-size <size>` | Batch size | `100` | `--batch-size 50` |

### Examples

#### Basic Campaigns
```bash
# Simple APT campaign
yarn start generate-campaign apt --mitre --events 50

# Ransomware with attack chains
yarn start generate-campaign ransomware --mitre --attack-chains --events 100

# Realistic insider threat with log generation
yarn start generate-campaign insider --realistic --mitre --detection-rate 0.6
```

#### Advanced Campaigns
```bash
# Expert-level APT with full features
yarn start generate-campaign apt --claude --mitre --sub-techniques --attack-chains \
  --realistic --complexity expert --events 500 --targets 100

# Multi-environment ransomware with themed data
yarn start generate-campaign ransomware --mitre --realistic \
  --environments 25 --theme starwars --multi-field --field-count 1000

# Visual Event Analyzer campaign with comprehensive fields
yarn start generate-campaign apt --visual-analyzer --mitre --multi-field \
  --field-count 5000 --field-categories forensics_analysis,malware_analysis
```

## 🚨 generate-alerts

Generate security alerts with comprehensive options.

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

#### AI and Framework Options
| Flag | Description | Example |
|------|-------------|---------|
| `--claude` | Use Claude AI | `--claude` |
| `--mitre` | Enable MITRE ATT&CK | `--mitre` |
| `--sub-techniques` | Include sub-techniques | `--mitre --sub-techniques` |
| `--attack-chains` | Generate attack chains | `--mitre --attack-chains` |

#### Multi-Field Options
| Flag | Description | Default | Example |
|------|-------------|---------|---------|
| `--multi-field` | Generate additional fields | `false` | `--multi-field` |
| `--field-count <count>` | Number of additional fields | `200` | `--field-count 1000` |
| `--field-categories <categories>` | Field categories | `all` | `--field-categories behavioral_analytics,threat_intelligence` |
| `--field-performance-mode` | Optimize for speed | `false` | `--field-performance-mode` |

#### Environment Options
| Flag | Description | Default | Example |
|------|-------------|---------|---------|
| `--namespace <namespace>` | Custom namespace | `default` | `--namespace prod` |
| `--environments <count>` | Multi-environment generation | `1` | `--environments 50` |

#### Session Analysis Options
| Flag | Description | Default | Example |
|------|-------------|---------|---------|
| `--session-view` | Generate Session View data | `false` | `--session-view` |
| `--visual-analyzer` | Generate Visual Event Analyzer data | `false` | `--visual-analyzer` |

#### Theme Options
| Flag | Description | Example |
|------|-------------|---------|
| `--theme <theme>` | Apply themed data | `--theme marvel` |

#### Case Integration Options
| Flag | Description | Default | Example |
|------|-------------|---------|---------|
| `--create-cases` | Create security cases | `false` | `--create-cases` |
| `--alerts-per-case <count>` | Alerts per case | `5` | `--alerts-per-case 10` |

#### Time Options
| Flag | Description | Example |
|------|-------------|---------|
| `--start-date <date>` | Start date | `--start-date "7d"` |
| `--end-date <date>` | End date | `--end-date "now"` |
| `--time-pattern <pattern>` | Time distribution | `--time-pattern business_hours` |

#### False Positive Testing
| Flag | Description | Default | Example |
|------|-------------|---------|---------|
| `--false-positive-rate <rate>` | False positive rate (0.0-1.0) | `0.0` | `--false-positive-rate 0.2` |

#### Performance Options
| Flag | Description | Default | Example |
|------|-------------|---------|---------|
| `--large-scale` | Large-scale optimizations | `false` | `--large-scale` |

### Examples

#### Basic Generation
```bash
# Simple alert generation
yarn start generate-alerts -n 50 -h 10 -u 5

# MITRE-enhanced alerts with themed data
yarn start generate-alerts -n 100 --mitre --theme marvel

# Multi-field alerts with comprehensive context
yarn start generate-alerts -n 200 --multi-field --field-count 500 \
  --field-categories threat_intelligence,behavioral_analytics
```

#### Advanced Generation
```bash
# Full-featured generation with Visual Event Analyzer
yarn start generate-alerts -n 500 --claude --mitre --sub-techniques \
  --visual-analyzer --multi-field --field-count 1000

# Multi-environment themed generation
yarn start generate-alerts -n 1000 --environments 50 --theme starwars \
  --mitre --multi-field --field-count 2000

# False positive testing with comprehensive fields
yarn start generate-alerts -n 300 --false-positive-rate 0.15 \
  --multi-field --field-count 800 --field-categories security_scores,audit_compliance
```

## 📊 generate-logs

Generate realistic source logs for security analysis.

### Syntax
```bash
yarn start generate-logs [options]
```

### Options

#### Core Options
| Flag | Description | Default | Example |
|------|-------------|---------|---------|
| `-n <count>` | Number of logs | `1000` | `-n 5000` |
| `-h <count>` | Number of hosts | `10` | `-h 25` |
| `-u <count>` | Number of users | `5` | `-u 15` |
| `--types <types>` | Log types (comma-separated) | `system,auth,network,endpoint` | `--types system,auth` |

#### AI Options
| Flag | Description | Example |
|------|-------------|---------|
| `--claude` | Use Claude AI | `--claude` |
| `--mitre` | Enable MITRE ATT&CK | `--mitre` |

#### Multi-Field Options
| Flag | Description | Default | Example |
|------|-------------|---------|---------|
| `--multi-field` | Generate additional fields | `false` | `--multi-field` |
| `--field-count <count>` | Number of additional fields | `200` | `--field-count 500` |
| `--field-categories <categories>` | Field categories | `all` | `--field-categories performance_metrics,network_analytics` |
| `--field-performance-mode` | Optimize for speed | `false` | `--field-performance-mode` |

#### Session Analysis Options
| Flag | Description | Default | Example |
|------|-------------|---------|---------|
| `--session-view` | Generate Session View data | `false` | `--session-view` |
| `--visual-analyzer` | Generate Visual Event Analyzer data | `false` | `--visual-analyzer` |

#### Environment Options
| Flag | Description | Default | Example |
|------|-------------|---------|---------|
| `--namespace <namespace>` | Custom namespace | `default` | `--namespace staging` |
| `--environments <count>` | Multi-environment generation | `1` | `--environments 20` |

#### Theme Options
| Flag | Description | Example |
|------|-------------|---------|
| `--theme <theme>` | Apply themed data | `--theme nba` |

#### Time Options
| Flag | Description | Example |
|------|-------------|---------|
| `--start-date <date>` | Start date | `--start-date "7d"` |
| `--end-date <date>` | End date | `--end-date "now"` |
| `--time-pattern <pattern>` | Time distribution | `--time-pattern attack_simulation` |

### Valid Log Types
- `system` - System and authentication logs
- `auth` - Authentication events
- `network` - Network traffic and DNS logs
- `endpoint` - Endpoint detection and process logs

### Examples
```bash
# Basic log generation
yarn start generate-logs -n 1000 --types system,auth

# Themed logs with Session View
yarn start generate-logs -n 2000 --theme marvel --session-view \
  --types endpoint,network

# Multi-environment logs with comprehensive fields
yarn start generate-logs -n 5000 --environments 10 --multi-field \
  --field-count 1000 --field-categories network_analytics,endpoint_analytics
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
| `--claude` | Use Claude AI | `false` | `--claude` |
| `-u, --users <number>` | Number of users | `100` | `--users 200` |
| `-h, --hosts <number>` | Max hosts per user | `3` | `--hosts 5` |

### Examples
```bash
# Basic graph generation
yarn start generate-graph --users 50 --hosts 2

# Claude-enhanced graph
yarn start generate-graph --claude --users 100 --hosts 4
```

## 🧠 generate-knowledge-base

Generate AI Assistant Knowledge Base documents.

### Syntax
```bash
yarn start generate-knowledge-base [options]
```

### Options

#### Core Options
| Flag | Description | Default | Example |
|------|-------------|---------|---------|
| `-n <count>` | Number of documents | `20` | `-n 50` |
| `-s <space>` | Kibana space | `default` | `-s security-team` |
| `--namespace <namespace>` | Custom namespace | `default` | `--namespace prod` |

#### Content Options
| Flag | Description | Example |
|------|-------------|---------|
| `--categories <categories>` | Security categories | `--categories threat_intelligence,incident_response` |
| `--access-level <level>` | Access level filter | `--access-level public` |
| `--confidence-threshold <threshold>` | Minimum confidence (0.0-1.0) | `--confidence-threshold 0.8` |
| `--mitre` | Include MITRE ATT&CK mappings | `--mitre` |

### Valid Categories
- `threat_intelligence` - IOC analysis, APT profiles, campaign tracking
- `incident_response` - Playbooks, procedures, escalation matrices
- `vulnerability_management` - CVE analysis, patch management
- `network_security` - Firewall rules, IDS signatures, traffic analysis
- `endpoint_security` - EDR rules, behavioral patterns, process monitoring
- `cloud_security` - AWS/Azure/GCP security, container monitoring
- `compliance` - PCI DSS, SOX, GDPR, HIPAA, ISO27001 frameworks
- `forensics` - Memory analysis, disk forensics, network forensics
- `malware_analysis` - Static/dynamic analysis, reverse engineering
- `behavioral_analytics` - User analytics, entity analytics, anomaly detection

### Valid Access Levels
- `public` - Publicly accessible documentation
- `team` - Team-level access
- `organization` - Organization-wide access
- `restricted` - Restricted access

### Examples
```bash
# Basic knowledge base generation
yarn start generate-knowledge-base -n 30

# Comprehensive security knowledge base
yarn start generate-knowledge-base -n 50 \
  --categories threat_intelligence,incident_response,malware_analysis \
  --mitre --confidence-threshold 0.8

# Public documentation with high confidence
yarn start generate-knowledge-base -n 25 --access-level public \
  --confidence-threshold 0.9
```

## 🔬 generate-fields

Generate security fields on demand with unlimited field counts.

### Syntax
```bash
yarn start generate-fields [options]
```

### Options

#### Core Options
| Flag | Description | Default | Example |
|------|-------------|---------|---------|
| `-n <count>` | Number of fields | `1000` | `-n 5000` |
| `--categories <categories>` | Field categories | `all` | `--categories behavioral_analytics,threat_intelligence` |

#### Output Options
| Flag | Description | Default | Example |
|------|-------------|---------|---------|
| `--output <format>` | Output format | `console` | `--output file` |
| `--filename <name>` | Output filename | `generated-fields.json` | `--filename security-fields.json` |
| `--index <name>` | Elasticsearch index | `generated-fields-sample` | `--index test-fields` |

#### Metadata Options
| Flag | Description | Default | Example |
|------|-------------|---------|---------|
| `--include-metadata` | Include generation metadata | `true` | `--include-metadata` |
| `--create-mapping` | Create Elasticsearch mapping | `true` | `--create-mapping` |
| `--update-template` | Update index template | `true` | `--update-template` |

### Valid Output Formats
- `console` - Display in console
- `file` - Save to JSON file
- `elasticsearch` - Index directly to Elasticsearch

### Valid Field Categories
- `behavioral_analytics` - User/host behavior analysis
- `threat_intelligence` - Threat analysis and attribution
- `performance_metrics` - System/network performance
- `security_scores` - Risk and security assessments
- `audit_compliance` - Audit trails and compliance
- `network_analytics` - Network behavior analysis
- `endpoint_analytics` - Endpoint detection metrics
- `forensics_analysis` - Digital forensics (enterprise scale)
- `cloud_security` - Multi-cloud security (enterprise scale)
- `malware_analysis` - Static/dynamic analysis (enterprise scale)
- `geolocation_intelligence` - Geographic threat patterns (enterprise scale)
- `incident_response` - Incident lifecycle management (enterprise scale)

### Examples
```bash
# Generate fields to console
yarn start generate-fields -n 2000 --categories behavioral_analytics

# Save fields to file
yarn start generate-fields -n 5000 --output file \
  --filename security-analytics.json \
  --categories threat_intelligence,security_scores

# Index fields to Elasticsearch
yarn start generate-fields -n 10000 --output elasticsearch \
  --index security-field-test --categories forensics_analysis,malware_analysis
```

## 🤖 generate-ml-data

Generate ML anomaly detection data for testing security ML jobs.

### Syntax
```bash
yarn start generate-ml-data [options]
```

### Options

#### Core Options
| Flag | Description | Example |
|------|-------------|---------|
| `--modules <modules>` | Security modules | `--modules security_auth,security_linux` |
| `--jobs <jobs>` | Specific job IDs | `--jobs auth_rare_user,auth_high_count_logon_fails` |

#### ML Job Management
| Flag | Description | Default | Example |
|------|-------------|---------|---------|
| `--enable-jobs` | Create ML jobs in Elasticsearch | `false` | `--enable-jobs` |
| `--start-datafeeds` | Start datafeeds | `false` | `--start-datafeeds` |
| `--delete-existing` | Delete existing jobs first | `false` | `--delete-existing` |

#### Enhancement Options
| Flag | Description | Example |
|------|-------------|---------|
| `--theme <theme>` | Apply themed data | `--theme marvel` |
| `--claude` | Use Claude AI for enhanced patterns | `--claude` |
| `--mitre` | Integrate MITRE techniques | `--mitre` |
| `--multi-field` | Generate additional fields | `--multi-field` |

#### Environment Options
| Flag | Description | Default | Example |
|------|-------------|---------|---------|
| `--namespace <namespace>` | Custom namespace | `default` | `--namespace ml-testing` |
| `--environments <count>` | Multi-environment generation | `1` | `--environments 5` |
| `--chunk-size <size>` | Bulk indexing chunk size | `1000` | `--chunk-size 2000` |

### Valid ML Modules
- `security_auth` - Authentication anomalies (4 jobs)
- `security_linux` - Linux system anomalies (4 jobs)
- `security_windows` - Windows anomalies (3 jobs)
- `security_cloudtrail` - AWS CloudTrail anomalies (3 jobs)
- `security_network` - Network anomalies (3 jobs)
- `security_packetbeat` - Traffic anomalies (3 jobs)

### Examples
```bash
# Basic ML data generation
yarn start generate-ml-data --modules security_auth,security_linux

# Complete ML setup with jobs
yarn start generate-ml-data --modules security_auth,security_windows \
  --enable-jobs --start-datafeeds

# Themed ML data across environments
yarn start generate-ml-data --modules security_auth,security_network \
  --theme starwars --environments 3 --chunk-size 2000
```

## 🛡️ rules

Generate realistic detection rules of all types.

### Syntax
```bash
yarn start rules [options]
```

### Options

#### Core Options
| Flag | Description | Default | Example |
|------|-------------|---------|---------|
| `-r, --rules <number>` | Number of rules | `10` | `-r 25` |
| `-e, --events <number>` | Number of events | `50` | `-e 100` |
| `-s, --space <space>` | Kibana space | none | `-s production` |

#### Rule Configuration
| Flag | Description | Default | Example |
|------|-------------|---------|---------|
| `-t, --rule-types <types>` | Rule types (comma-separated) | all types | `-t query,threshold,eql` |
| `-i, --interval <string>` | Rule execution interval | `5m` | `-i 1m` |
| `-f, --from <number>` | Events from last N hours | `24` | `-f 48` |
| `-g, --gaps <number>` | Gaps per rule | `0` | `-g 2` |
| `-c, --clean` | Clean existing rules first | `false` | `--clean` |

#### ML Integration
| Flag | Description | Default | Example |
|------|-------------|---------|---------|
| `--enable-ml-jobs` | Create ML jobs | `false` | `--enable-ml-jobs` |
| `--generate-ml-data` | Generate ML training data | `false` | `--generate-ml-data` |
| `--ml-modules <modules>` | ML modules | `security_auth,security_windows,security_linux` | `--ml-modules security_auth,security_network` |

### Valid Rule Types
- `query` - KQL/Lucene query-based detection
- `threshold` - Field aggregation and cardinality detection
- `eql` - Event Query Language sequences
- `machine_learning` - Anomaly detection rules
- `threat_match` - Threat intelligence IOC matching
- `new_terms` - New entity detection
- `esql` - Elasticsearch Query Language analytics

### Examples

#### Basic Usage
```bash
# Generate all rule types
yarn start rules -r 10 -s default

# Specific rule types with events
yarn start rules -r 15 -t query,threshold,eql -e 100 -s testing

# SOC training rules
yarn start rules -r 25 -t query,threshold,eql,new_terms -e 150 -s soc-training
```

#### ML Integration
```bash
# Generate ML rules with training data
yarn start rules -r 10 -t machine_learning --generate-ml-data \
  --ml-modules security_auth,security_windows

# Complete ML workflow
yarn start rules -r 20 -t query,threshold,machine_learning \
  --enable-ml-jobs --generate-ml-data --ml-modules security_auth,security_network
```

## 📋 generate-cases

Generate security cases for investigation and incident response.

### Syntax
```bash
yarn start generate-cases [options]
```

### Options

#### Core Options
| Flag | Description | Default | Example |
|------|-------------|---------|---------|
| `-n <count>` | Number of cases | `10` | `-n 25` |
| `-s <space>` | Kibana space | `default` | `-s security-team` |
| `--namespace <namespace>` | Custom namespace | `default` | `--namespace incident-response` |

#### Content Options
| Flag | Description | Default | Example |
|------|-------------|---------|---------|
| `--mitre` | Include MITRE ATT&CK mappings | `false` | `--mitre` |
| `--theme <theme>` | Apply themed data | none | `--theme marvel` |

#### Alert Integration
| Flag | Description | Default | Example |
|------|-------------|---------|---------|
| `--attach-existing-alerts` | Attach existing alerts | `false` | `--attach-existing-alerts` |
| `--alerts-per-case <count>` | Alerts per case | `3` | `--alerts-per-case 5` |
| `--alert-query <query>` | Alert selection query | `*` | `--alert-query "severity:high"` |

#### Environment Options
| Flag | Description | Default | Example |
|------|-------------|---------|---------|
| `--environments <count>` | Multi-environment generation | `1` | `--environments 5` |

### Examples
```bash
# Basic case generation
yarn start generate-cases -n 15

# Cases with attached alerts and MITRE mapping
yarn start generate-cases -n 20 --mitre --attach-existing-alerts \
  --alerts-per-case 5

# Themed cases across environments
yarn start generate-cases -n 10 --theme starwars --environments 3 \
  --namespace security-training
```

## 🗑️ Cleanup Commands

### delete-alerts
```bash
yarn start delete-alerts [-s <space>]
```

### delete-logs
```bash
yarn start delete-logs [-s <space>]
```

### delete-rules
```bash
yarn start delete-rules [-s <space>]
```

### delete-knowledge-base
```bash
yarn start delete-knowledge-base [--namespace <namespace>]
```

### delete-all
```bash
yarn start delete-all
```

## 🎨 Theme Support

### Supported Themes (19 Total)

#### Themes with Fallback Data (Reliable)
- `nba` - Basketball players and teams
- `soccer` - Soccer players and teams
- `marvel` - Marvel superheroes and universe
- `starwars` - Star Wars characters and universe
- `tech_companies` - Tech industry leaders and companies
- `programming` - Programming language creators and tools

#### AI-Generated Themes
- `nfl`, `mlb`, `movies`, `tv_shows`, `gaming`, `mythology`, `literature`, `history`, `anime`, `music`, `food`

### Theme Usage
```bash
# Single theme (applies to all data types)
--theme marvel

# Mixed themes (specific data types)
--theme "usernames:nba,hostnames:marvel,domains:tech_companies"
```

## 🔄 Flag Dependencies

### MITRE Flags
- `--sub-techniques` requires `--mitre`
- `--attack-chains` requires `--mitre`

### Multi-Field Flags
- `--field-count` requires `--multi-field`
- `--field-categories` requires `--multi-field`
- `--field-performance-mode` requires `--multi-field`

### Case Flags
- `--alerts-per-case` requires `--attach-existing-alerts`

### ML Flags
- `--start-datafeeds` requires `--enable-jobs`

## 🎯 Common Workflows

### Complete SOC Setup
```bash
# 1. Generate detection rules
yarn start rules -r 25 -t query,threshold,eql,machine_learning -s soc

# 2. Generate training data
yarn start generate-alerts -n 500 --mitre --multi-field --theme marvel -s soc
yarn start generate-logs -n 2000 --types system,auth,network,endpoint -s soc

# 3. Create cases
yarn start generate-cases -n 20 --attach-existing-alerts --mitre -s soc
```

### Performance Testing
```bash
# Large-scale data generation
yarn start generate-alerts -n 5000 --environments 100 --large-scale
yarn start generate-logs -n 50000 --multi-field --field-count 1000 --large-scale
```

### Enterprise Multi-Environment
```bash
# Production simulation across 50 environments
yarn start generate-campaign apt --environments 50 --namespace prod \
  --multi-field --field-count 2000 --realistic

# Themed development environments
yarn start generate-alerts -n 1000 --environments 10 --theme starwars \
  --namespace dev --multi-field
```
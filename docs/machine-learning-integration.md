# 🤖 Machine Learning Integration

Complete guide to ML anomaly detection data generation and Elastic Security ML job integration.

## 📋 Table of Contents

- [Overview](#overview)
- [Quick Start](#quick-start)
- [ML Security Modules](#ml-security-modules)
- [Analysis Functions](#analysis-functions)
- [ML Job Management](#ml-job-management)
- [ML-Enhanced Detection Rules](#ml-enhanced-detection-rules)
- [Enterprise Use Cases](#enterprise-use-cases)
- [Performance Optimization](#performance-optimization)
- [Troubleshooting](#troubleshooting)

## Overview

The ML integration provides complete anomaly detection capabilities by generating realistic training data for Elastic Security Machine Learning jobs. This includes:

- **21 Pre-built ML Jobs** across 6 security domains
- **6 ML Analysis Functions** (rare, high_count, high_distinct_count, high_info_content, time_of_day)
- **Realistic Anomaly Injection** with production-like rates (0.02%-0.08%)
- **Context-Aware Field Generation** specific to security domains
- **Complete ML Workflow** from data generation to rule creation
- **🎨 Theme Integration** with 19 supported themes for realistic entity names
- **🖥️ MCP Server Integration** for conversational ML generation via Claude Desktop
- **🔧 Consistent CLI Interface** aligned with repository patterns

### Recent Enhancements

The ML functionality has been significantly enhanced to align with existing repository patterns:

#### **Theme Integration**
- **Full theme support** using the existing theme service infrastructure
- **19 supported themes** including Marvel, Star Wars, NBA, tech companies, etc.
- **Context-aware themed entities** while maintaining anomaly detection patterns
- **Consistent theming** across all security data generation types

#### **CLI Consistency** 
- **Standard options added**: `--claude`, `--mitre`, `--multi-field`
- **Aligned interface** with existing commands across the repository
- **Enhanced user experience** with familiar option patterns

#### **MCP Server Integration**
- **Conversational ML generation** through Claude Desktop integration
- **Complete parameter support** for all ML functionality
- **Multi-environment deployment** capabilities through MCP interface

## Quick Start

### Basic ML Data Generation
```bash
# Generate authentication and Linux anomaly data
yarn start generate-ml-data --modules security_auth,security_linux

# Generate with theme for realistic entities
yarn start generate-ml-data --modules security_auth --theme marvel

# View generated data in Kibana
# Navigate to Discover → test_auth_rare_user, test_v3_linux_rare_sudo_user
```

### Complete ML Setup
```bash
# Create ML jobs and generate training data with theme
yarn start generate-ml-data --modules security_auth,security_windows --enable-jobs --theme starwars

# Generate ML-enhanced detection rules with theme consistency
yarn start rules -r 10 -t machine_learning --generate-ml-data --ml-modules security_auth,security_windows --theme starwars

# Use new standard CLI options
yarn start generate-ml-data --modules security_auth --claude --mitre --multi-field --theme nba
```

### Enterprise Scale
```bash
# All modules with performance optimization
yarn start generate-ml-data --modules security_auth,security_linux,security_windows,security_network,security_packetbeat,security_cloudtrail --chunk-size 5000
```

## 🎨 Theme Integration

### Realistic Themed ML Data

The ML integration now supports the full theme system used across the repository, providing realistic and memorable entity names while maintaining accurate anomaly detection patterns.

#### **Supported Themes**

**Themes with Fallback Data (Reliable):**
- `nba` - Basketball players and teams  
- `soccer` - Soccer players and teams
- `marvel` - Marvel superheroes and universe
- `starwars` - Star Wars characters and universe
- `tech_companies` - Tech industry leaders and companies
- `programming` - Programming language creators and tools

**AI-Generated Themes:**
- `nfl`, `mlb`, `movies`, `tv_shows`, `gaming`, `mythology`, `literature`, `history`, `anime`, `music`, `food`

#### **Theme Usage Examples**

```bash
# Marvel-themed authentication anomalies
yarn start generate-ml-data --modules security_auth --theme marvel
# Result: Users like tony.stark@starkindustries.com, peter.parker@dailybugle.com
#         Hosts like stark-tower-01, spider-web-server-02

# Star Wars enterprise security
yarn start generate-ml-data --modules security_windows,security_linux --theme starwars --environments 5
# Result: Users like luke.skywalker@rebels.org, vader@empire.gov
#         Hosts like tatooine-web-01, death-star-db-03

# Tech companies for realistic corporate scenarios  
yarn start generate-ml-data --modules security_cloudtrail,security_network --theme tech_companies
# Result: Users like tim.cook@apple.com, satya.nadella@microsoft.com
#         Domains like apple.com, google.com, github.com
```

#### **Theme Benefits for ML Data**

**Training & SOC Scenarios:**
- **Memorable Entities**: "Luke Skywalker's unusual login" vs "User-47382's anomaly"
- **Engaging Training**: Teams remember Star Wars characters better than random usernames
- **Story Continuity**: All ML events follow the same thematic universe
- **Professional Demos**: Impressive presentations with recognizable entity names

**Development & Testing:**
- **Consistent Test Data**: Same theme across ML development, staging, and testing
- **Easy Identification**: Quickly distinguish themed test data from production
- **Team Alignment**: Shared vocabulary across security and development teams

#### **Technical Implementation**

The theme integration leverages the existing sophisticated theme service:

```bash
# Theme fetching during ML generation
🎨 Fetching themed data for theme: marvel
🎨 Using themed data: usernames, hostnames, processNames, domains

# Generated ML data maintains anomaly patterns while using themed entities
✅ Generated 40,000 documents with themed entities
🚨 Total anomalies: 22 (0.055% rate maintained)
```

**Context-Aware Field Generation:**
- **Normal Values**: Use themed entities (tony.stark, spider-web-01)
- **Anomalous Values**: Mix themed and suspicious patterns for realistic detection
- **Domain Intelligence**: Themed domains for normal activity, suspicious TLDs for anomalies

## ML Security Modules

### 🔐 Authentication (security_auth)
**4 Jobs** - Authentication anomaly detection

| Job ID | Function | Description | Use Case |
|--------|----------|-------------|----------|
| `auth_rare_user` | rare | Rare authentication users | Detect compromised accounts |
| `auth_high_count_logon_fails` | high_count | Authentication failure spikes | Brute force attacks |
| `auth_rare_hour_for_a_user` | time_of_day | Unusual login timing | After-hours access |
| `suspicious_login_activity` | high_info_content | Anomalous login patterns | Complex attack patterns |

**Example Generation:**
```bash
yarn start generate-ml-data --modules security_auth
# Result: 40,000 authentication events with 22 realistic anomalies
```

### 🐧 Linux Systems (security_linux)
**4 Jobs** - Linux system anomaly detection

| Job ID | Function | Description | Use Case |
|--------|----------|-------------|----------|
| `v3_linux_anomalous_user_name` | high_info_content | Unusual Linux usernames | Account takeover |
| `v3_linux_rare_sudo_user` | rare | Rare sudo usage | Privilege escalation |
| `v3_linux_anomalous_network_activity` | high_count | Network activity spikes | Data exfiltration |
| `v3_linux_rare_metadata_process` | rare | Unusual process patterns | Malware execution |

### 🪟 Windows Systems (security_windows)
**3 Jobs** - Windows anomaly detection

| Job ID | Function | Description | Use Case |
|--------|----------|-------------|----------|
| `v3_windows_anomalous_process_creation` | high_info_content | Suspicious process creation | Malware detection |
| `v3_windows_rare_user_runas_event` | rare | Unusual runas activity | Lateral movement |
| `v3_windows_anomalous_script` | high_info_content | Suspicious script execution | PowerShell attacks |

### ☁️ CloudTrail (security_cloudtrail)
**3 Jobs** - AWS CloudTrail anomaly detection

| Job ID | Function | Description | Use Case |
|--------|----------|-------------|----------|
| `high_distinct_count_error_message` | high_distinct_count | Error message diversity | Reconnaissance activity |
| `rare_error_code` | rare | Unusual CloudTrail errors | Misconfigurations |
| `cloudtrail_rare_method_for_a_city` | rare | Rare API methods by location | Geographic anomalies |

### 🌐 Network (security_network)
**3 Jobs** - Network anomaly detection

| Job ID | Function | Description | Use Case |
|--------|----------|-------------|----------|
| `high_count_network_events` | high_count | Network volume spikes | DDoS, data exfiltration |
| `rare_destination_country` | rare | Unusual destination countries | C2 communication |
| `network_rare_process_for_user` | rare | Rare network processes per user | Malware communication |

### 📡 Packetbeat (security_packetbeat)
**3 Jobs** - Network traffic anomaly detection

| Job ID | Function | Description | Use Case |
|--------|----------|-------------|----------|
| `packetbeat_rare_dns_question` | rare | Unusual DNS queries | DNS tunneling |
| `packetbeat_rare_server_domain` | rare | Rare server domains | C2 infrastructure |
| `packetbeat_rare_urls` | rare | Unusual URL patterns | Web-based attacks |

## Analysis Functions

### 1. **rare** - Rare Field Values
Detects infrequently occurring values in specified fields.

**Configuration:**
- **Anomaly Rate**: 0.02% (2 in 10,000 events)
- **Pattern**: Index 1 = anomalous, indices 2-22 = normal
- **Use Cases**: New users, unusual processes, rare domains

**Example Fields:**
```json
{
  "user.name": "admin.backup.temp",     // Anomalous
  "user.name": "john.smith",           // Normal
  "process.name": "suspicious.exe",    // Anomalous
  "process.name": "notepad.exe"        // Normal
}
```

### 2. **high_count** - Volume Anomalies
Identifies spikes in event volume within time windows.

**Configuration:**
- **Anomaly Rate**: 0.02%
- **Pattern**: High volume bursts vs normal activity
- **Use Cases**: Authentication floods, network spikes, process creation storms

### 3. **high_distinct_count** - Diversity Anomalies
Detects unusual variety in field values.

**Configuration:**
- **Anomaly Rate**: 0.02%
- **Pattern**: High diversity vs consistent patterns
- **Use Cases**: Error message variety, diverse API calls

### 4. **high_info_content** - Entropy Anomalies
Identifies high-entropy (random/encoded) content.

**Configuration:**
- **Anomaly Rate**: 0.08% (8 in 10,000 events)
- **Pattern**: Random strings vs predictable content
- **Use Cases**: Encoded commands, obfuscated scripts, encrypted payloads

**Example Fields:**
```json
{
  "process.command_line": "powershell.exe -EncodedCommand aGVsbG8gd29ybGQ=", // Anomalous
  "process.command_line": "powershell.exe Get-Process"                      // Normal
}
```

### 5. **time_of_day** - Temporal Anomalies
Detects activity at unusual times for specific entities.

**Configuration:**
- **Anomaly Rate**: 0.10% (10 in 10,000 events)
- **Pattern**: Midnight activity vs business hours
- **Use Cases**: After-hours access, unusual automation timing

## ML Job Management

### Creating and Managing ML Jobs

#### Enable ML Jobs During Generation
```bash
# Create ML jobs in Elasticsearch
yarn start generate-ml-data --modules security_auth --enable-jobs

# This performs:
# 1. Creates ML job configuration
# 2. Opens the ML job
# 3. Starts the datafeed
# 4. Generates training data
```

#### ML Job Lifecycle
```bash
# View ML job status in Kibana
# Navigate to: Machine Learning → Anomaly Detection → Jobs

# Job states after --enable-jobs:
# ✅ Created: Job definition exists
# ✅ Opened: Job ready for data
# ✅ Started: Datafeed processing data
```

### ML Job Configuration

Each ML job includes:
- **Analysis Configuration**: Function, fields, bucket span (15m)
- **Data Description**: Time field configuration
- **Influencers**: Key fields for anomaly context
- **Groups**: Categorization (security, module-specific)

**Example Configuration:**
```json
{
  "job_id": "auth_rare_user",
  "analysis_config": {
    "bucket_span": "15m",
    "detectors": [{
      "function": "rare",
      "by_field_name": "user.name",
      "detector_description": "Detect rare authentication users"
    }],
    "influencers": ["user.name", "source.ip", "host.name"]
  },
  "groups": ["security", "auth"]
}
```

## 🖥️ MCP Server Integration

### Conversational ML Generation via Claude Desktop

The ML functionality is fully integrated with the MCP (Model Context Protocol) server, enabling conversational ML data generation through Claude Desktop.

#### **Setup**

1. **Start MCP Server:**
```bash
yarn mcp
```

2. **Configure Claude Desktop:**
Add to your Claude Desktop configuration:
```json
{
  "mcpServers": {
    "security-docs-generator": {
      "command": "node",
      "args": ["dist/mcp_server.js"]
    }
  }
}
```

#### **Conversational ML Generation**

**Natural Language Commands:**
```text
Generate ML anomaly data for authentication and Windows modules using Marvel theme across 3 environments

Create ML jobs for security_auth and security_linux modules with NBA theme and enable job creation

Generate comprehensive ML training data for all 6 security modules with Star Wars theme for SOC training
```

**Available Parameters:**
- **modules**: Security modules to process
- **jobIds**: Specific ML job IDs 
- **theme**: Applied theme for entity generation
- **enableJobs**: Create ML jobs in Elasticsearch
- **namespace**: Custom namespace for indices
- **environments**: Multi-environment generation
- **chunkSize**: Performance optimization
- **aiEnhanced**: Enhanced AI patterns (future)

#### **MCP Tool: `generate_ml_anomaly_data`**

**Example MCP Usage:**
```json
{
  "modules": ["security_auth", "security_windows"],
  "theme": "marvel", 
  "enableJobs": true,
  "environments": 3,
  "chunkSize": 2000
}
```

**Response Format:**
```text
🤖 Successfully generated ML anomaly data!

📊 ML Generation Summary:
• Modules: security_auth, security_windows
• Theme: marvel
• ML Jobs Created: Yes
• Environments: 3 across marvel-env-001 to marvel-env-003
• Chunk Size: 2000

✅ Generated realistic ML training data with anomaly patterns
✅ Context-aware field generation for security domains
✅ Applied marvel theme for consistent entity naming
✅ Created and started ML jobs in Elasticsearch

🎯 Next steps:
1. Check ML indices in Kibana: test_* pattern
2. View ML jobs in Kibana Machine Learning interface
3. Run detection rules with ML integration for complete workflow
```

#### **Benefits of MCP Integration**

**Conversational Interface:**
- **Natural language** ML data generation requests
- **Parameter guidance** through Claude's understanding
- **Complex scenarios** described in plain English
- **Immediate feedback** on generation results

**Enterprise Workflow:**
- **Team collaboration** through shared Claude Desktop interface
- **Documentation generation** of ML scenarios for reports
- **Training scenario creation** through conversation
- **Multi-environment deployment** via natural language commands

## ML-Enhanced Detection Rules

### Integration with Detection Rules

The ML integration automatically connects with the `rules` command to create machine learning detection rules that reference real ML jobs.

#### Basic ML Rules
```bash
# Generate ML rules with training data
yarn start rules -r 5 -t machine_learning --generate-ml-data --ml-modules security_auth,security_windows

# Result:
# ✅ 5 machine learning rules created
# ✅ Rules reference actual ML jobs (auth_rare_user, v3_windows_anomalous_process_creation, etc.)
# ✅ Training data generated for referenced ML jobs
# ✅ Event data generated to potentially trigger ML rules
```

#### Complete ML Workflow
```bash
# Full ML-powered SOC setup
yarn start rules -r 20 -t query,threshold,machine_learning --enable-ml-jobs --generate-ml-data --ml-modules security_auth,security_cloudtrail,security_network

# Result:
# ✅ 20 detection rules (mix of traditional + ML)
# ✅ ML jobs created and started in Elasticsearch
# ✅ Training data generated for all ML modules
# ✅ Event data generated to trigger rules
```

#### Module-Specific Rule Generation
```bash
# Only use ML jobs from specified modules
yarn start rules -r 10 -t machine_learning --generate-ml-data --ml-modules security_windows,security_linux

# Ensures ML rules only reference:
# - v3_windows_anomalous_process_creation
# - v3_windows_rare_user_runas_event  
# - v3_windows_anomalous_script
# - v3_linux_anomalous_user_name
# - v3_linux_rare_sudo_user
# - v3_linux_anomalous_network_activity
# - v3_linux_rare_metadata_process
```

### ML Rule Configuration

Generated ML rules include:
- **Anomaly Threshold**: 50-90% confidence
- **ML Job References**: Real job IDs from specified modules
- **Proper Rule Type**: `machine_learning`
- **Index Patterns**: Standard security indices
- **Risk Scoring**: 1-100 based on severity

## Enterprise Use Cases

### 1. SOC Analyst Training
**Objective**: Train analysts on ML anomaly investigation

```bash
# Generate comprehensive authentication anomalies
yarn start generate-ml-data --modules security_auth --enable-jobs
# Result: 40,000 authentication events with 22 realistic anomalies

# Create ML rules for investigation practice
yarn start rules -r 5 -t machine_learning --generate-ml-data --ml-modules security_auth
# Result: ML rules that trigger on training data anomalies
```

**Training Workflow:**
1. Analysts review ML job anomalies in Kibana ML interface
2. Investigate triggered ML detection rules
3. Correlate anomalies with supporting event data
4. Practice anomaly scoring and investigation techniques

### 2. Detection Rule Testing
**Objective**: Validate ML rule effectiveness

```bash
# Test Windows and Linux ML rules
yarn start rules -r 10 -t machine_learning --generate-ml-data --ml-modules security_windows,security_linux
# Result: ML rules with corresponding training data and realistic test events
```

**Testing Workflow:**
1. ML rules created with specific job references
2. Training data generated for referenced ML jobs
3. Test events generated to potentially trigger rules
4. Validate rule effectiveness and tune thresholds

### 3. Enterprise ML Deployment
**Objective**: Deploy complete ML environment

```bash
# Full ML environment setup
yarn start generate-ml-data --modules security_auth,security_linux,security_windows,security_network,security_packetbeat,security_cloudtrail --enable-jobs --chunk-size 3000
# Result: All 21 ML jobs with 210,000 training documents
```

**Deployment Workflow:**
1. All 21 ML jobs created and started
2. Comprehensive training data across all security domains
3. Production-ready ML environment for security monitoring
4. Baseline established for anomaly detection

### 4. Multi-Environment Testing
**Objective**: Test ML across multiple environments

```bash
# Different spaces for isolation
yarn start rules -r 15 --enable-ml-jobs --generate-ml-data --ml-modules security_auth,security_windows -s ml-development
yarn start rules -r 20 --enable-ml-jobs --generate-ml-data --ml-modules security_network,security_cloudtrail -s ml-staging
yarn start rules -r 25 --enable-ml-jobs --generate-ml-data --ml-modules security_auth,security_linux,security_windows -s ml-production
```

## Performance Optimization

### Chunk Size Optimization
```bash
# Default chunk size (1000 documents per batch)
yarn start generate-ml-data --modules security_auth

# Optimized for high throughput (5000 documents per batch)
yarn start generate-ml-data --modules security_auth --chunk-size 5000

# Conservative for limited resources (500 documents per batch)
yarn start generate-ml-data --modules security_auth --chunk-size 500
```

### Memory Management
- **Default Generation**: 10,000 documents per job
- **Memory Usage**: ~50MB per job for full generation
- **Elasticsearch Impact**: Optimized bulk indexing with configurable refresh

### Scaling Recommendations

| Scale | Modules | Chunk Size | Expected Time | Documents |
|-------|---------|------------|---------------|-----------|
| **Development** | 1-2 modules | 1000 | <30 seconds | 20k-40k |
| **Testing** | 3-4 modules | 3000 | 1-2 minutes | 60k-80k |
| **Enterprise** | All 6 modules | 5000 | 3-5 minutes | 210k |

## Troubleshooting

### Common Issues

#### 1. ML Job Creation Failures
**Error**: `ML job creation failed: job already exists`

**Solution**:
```bash
# Delete existing ML job
curl -X DELETE "localhost:9200/_ml/anomaly_detectors/auth_rare_user"

# Re-run with job creation
yarn start generate-ml-data --modules security_auth --enable-jobs
```

#### 2. Index Conflicts
**Error**: `index_already_exists_exception`

**Solution**:
```bash
# Delete conflicting index
curl -X DELETE "localhost:9200/test_auth_rare_user"

# Re-run generation
yarn start generate-ml-data --modules security_auth
```

#### 3. Missing ML Jobs in Rules
**Error**: `ML rule references non-existent job`

**Solution**:
```bash
# Ensure ML modules match rule generation
yarn start rules -r 5 -t machine_learning --generate-ml-data --ml-modules security_auth,security_windows

# This ensures rules only reference jobs from specified modules
```

#### 4. Low Anomaly Detection
**Issue**: Generated anomalies not showing in ML results

**Solution**:
1. **Check Time Range**: ML jobs analyze recent data (12 days back)
2. **Verify Job Status**: Ensure ML jobs are opened and datafeeds started
3. **Review Bucket Span**: Jobs use 15-minute buckets for analysis
4. **Wait for Analysis**: ML processing may take several minutes

### Performance Issues

#### Slow Generation
```bash
# Reduce chunk size for limited resources
yarn start generate-ml-data --modules security_auth --chunk-size 500

# Or generate single module at a time
yarn start generate-ml-data --modules security_auth
yarn start generate-ml-data --modules security_linux
```

#### Elasticsearch Timeouts
```bash
# Add timeout configuration to config.json
{
  "elastic": {
    "requestTimeout": 60000,
    "maxRetries": 3
  }
}
```

### Verification Steps

#### 1. Verify Data Generation
```bash
# Check document counts
curl "localhost:9200/test_auth_rare_user/_count"
curl "localhost:9200/test_v3_linux_rare_sudo_user/_count"
```

#### 2. Verify ML Jobs
```bash
# List ML jobs
curl "localhost:9200/_ml/anomaly_detectors"

# Check specific job status
curl "localhost:9200/_ml/anomaly_detectors/auth_rare_user/_stats"
```

#### 3. Verify Anomalies
```bash
# Check for anomalies in Kibana
# Navigate to: Machine Learning → Anomaly Detection → auth_rare_user → Anomalies
```

## Advanced Configuration

### Custom ML Job Templates
Create custom ML job configurations by modifying files in `src/ml/data/configs/`:

```json
{
  "job_id": "custom_ml_job",
  "description": "Custom anomaly detection",
  "analysis_config": {
    "bucket_span": "15m",
    "detectors": [{
      "function": "rare",
      "by_field_name": "custom.field",
      "detector_description": "Custom field anomaly detection"
    }],
    "influencers": ["custom.field", "host.name"]
  },
  "groups": ["security", "custom"]
}
```

### Integration with Existing Workflows
```bash
# Combine with other generation commands
yarn start generate-ml-data --modules security_auth
yarn start generate-alerts -n 100 --mitre
yarn start generate-campaign apt --realistic --detection-rate 0.3

# Result: ML environment + security alerts + attack scenarios
```

---

**🎯 Ready to deploy ML-powered security monitoring?** Start with:

```bash
# Complete ML setup for SOC environments
yarn start rules -r 20 -t query,threshold,machine_learning --enable-ml-jobs --generate-ml-data --ml-modules security_auth,security_windows,security_linux
```

This creates a comprehensive security environment with traditional detection rules, ML-powered anomaly detection, and realistic training data across authentication, Windows, and Linux security domains.
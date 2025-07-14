# Security Documents Generator

A powerful tool for generating realistic security scenarios with complete forensic evidence chains. Features AI-powered data generation, MITRE ATT&CK integration, and realistic attack campaign simulation with source logs that trigger alerts.

## 🌟 **MCP Server Edition**

- **🌍 Multi-Environment Generation**: Scale across 100s-1000s of simulated environments
- **🔬 Multi-Field Generation**: Up to 50,000 additional security fields per document
- **⚔️ Advanced MITRE Integration**: Sub-techniques, attack chains, and tactic focusing
- **📱 Session View Compatibility**: Elastic Security process hierarchy support
- **🎯 False Positive Testing**: Generate realistic false positives for rule tuning
- **🗣️ Conversational Interface**: Ask Claude to "Generate an APT campaign across 50 environments with 5000 forensic fields each"

**Transform security testing with conversational AI-powered data generation at enterprise scale!**

## 🚀 Quick Start

1. **Install dependencies:**
   ```bash
   yarn install
   ```

2. **Initialize configuration:**
   ```bash
   yarn start
   ```
   Follow the guided setup to create your `config.json` file.

3. **Generate detection rules and attack scenarios:**
   ```bash
   # Generate detection rules (all types)
   yarn start rules -r 10 -s default
   
   # Complete ransomware attack with realistic logs → alerts pipeline
   yarn start generate-campaign ransomware --realistic --mitre --detection-rate 0.6
   ```

## 🎯 Core Features

### 🌍 **Multi-Environment & Multi-Index Generation**
- **Hundreds of Environments**: Scale to 100s-1000s of simulated environments
- **Custom Namespaces**: `--namespace prod` creates prod-env-001, prod-env-002, etc.
- **Environment Isolation**: Complete data separation between environments
- **Index Distribution**: Each environment gets its own set of indices
- **Horizontal Scaling**: Perfect for load testing and multi-tenant scenarios

### 🔬 **Enterprise-Scale Multi-Field Generation**
- **10,000+ Security Fields**: Enterprise-scale field generation with dual-mode architecture
- **12 Specialized Categories**: Core + enterprise categories (forensics, cloud, malware, geo, incident response)
- **99% Token Reduction**: Zero AI calls for field generation (algorithmic approach)
- **Sub-Second Performance**: <1s for 25,000+ fields per document
- **Auto-Scaling**: Automatically switches to enterprise mode for >1,000 fields
- **Dual-Mode Architecture**: Template mode (1-1,000) + algorithmic expansion (1,000+)
- **Context-Aware**: Attack scenarios get threat fields, normal logs get performance fields
- **Realistic Correlations**: CPU high → memory high, threat confidence → risk score

### 🛡️ **Detection Rules Generation**
- **All 7 Rule Types**: Query, Threshold, EQL, Machine Learning, Threat Match, New Terms, ES|QL
- **Realistic Configurations**: Type-specific queries, thresholds, and parameters
- **MITRE Integration**: Automatic ATT&CK technique mapping where applicable
- **Multi-Space Support**: Generate rules across different Kibana spaces
- **Triggered Alerts**: Rules generate realistic alerts for complete testing workflows

### 🎭 **Realistic Attack Scenarios**
- **Complete Log→Alert Pipeline**: Source logs generate realistic security alerts
- **Forensic Evidence Chains**: Complete attack stories from initial access to detection
- **Configurable Detection**: Adjust what percentage of activities get detected (0.0-1.0)
- **Investigation Ready**: Automated investigation guides for security analysts

### 🤖 **AI-Powered Generation**
- **Multiple AI Providers**: OpenAI, Azure OpenAI, Claude (Anthropic)
- **Context-Aware Data**: Realistic security scenarios based on real-world patterns
- **Smart Fallbacks**: Automatic failover between providers

### 🎨 **Theme-Based Data Generation**
- **17 Supported Themes**: NBA, NFL, soccer, Marvel, Star Wars, tech companies, programming, and more
- **Comprehensive Data Types**: Usernames, hostnames, emails, process names, file paths, registry keys
- **AI-Enhanced Themes**: Dynamic theme generation with realistic fallbacks
- **Consistent Theming**: All generated data follows the selected theme across the entire dataset
- **Universal Integration**: Works with all generation types (alerts, logs, campaigns, knowledge base)

### ⚔️ **MITRE ATT&CK Integration**
- **Complete Framework**: All tactics, techniques, and sub-techniques
- **Attack Progression**: Multi-stage campaigns with proper technique sequencing
- **Dynamic Risk Scoring**: Severity based on technique combinations

## 📋 Essential Commands

| Command | Description | Example |
|---------|-------------|---------|
| **`rules --rule-types`** | **🛡️ Detection rules (all types)** | `yarn start rules -r 15 --rule-types query,threshold,eql -s default` |
| **`generate-alerts --environments`** | **🌍 Multi-environment alerts** | `yarn start generate-alerts -n 100 --environments 50 --namespace prod` |
| **`generate-logs --environments`** | **🌍 Multi-environment logs** | `yarn start generate-logs -n 1000 --environments 25 --namespace staging` |
| **`generate-campaign --realistic`** | **🌟 Complete attack scenarios** | `yarn start generate-campaign apt --realistic --mitre` |
| **`--theme <theme>`** | **🎨 Theme-based data generation** | `yarn start generate-alerts -n 100 --theme marvel --mitre` |
| **`generate-fields`** | **🔬 Generate fields on demand** | `yarn start generate-fields -n 4000 --categories behavioral_analytics` |
| **`generate-alerts --multi-field`** | **🔬 Alerts with 10,000+ fields** | `yarn start generate-alerts -n 100 --multi-field --field-count 10000` |
| `generate-logs --multi-field` | Source logs with enriched fields | `yarn start generate-logs -n 1000 --multi-field --field-count 200` |
| `--theme <theme>` | Themed data generation | `yarn start generate-logs -n 500 --theme starwars --types system,auth` |
| `generate-campaign` | Multi-stage attack campaigns | `yarn start generate-campaign ransomware --mitre` |
| `generate-correlated` | Alerts with supporting logs | `yarn start generate-correlated -n 20 --mitre` |
| `generate-logs` | Realistic source logs | `yarn start generate-logs -n 1000 --types system,auth` |
| `generate-alerts` | AI-enhanced security alerts | `yarn start generate-alerts -n 100 --mitre` |

### 🌍 Multi-Environment Generation Examples
| Command | Result | Indices Created |
|---------|--------|----------------|
| `yarn start rules -r 20 --environments 10 -s default` | 200 detection rules across 10 environments | Security rules in space-specific indices |
| `yarn start generate-alerts -n 100 --environments 50` | 5,000 alerts across 50 environments | `.alerts-security.alerts-default-env-001` through `050` |
| `yarn start generate-logs -n 1000 --environments 25 --namespace prod` | 25,000 logs across 25 prod environments | `logs-*-prod-env-001` through `025` |
| `yarn start generate-campaign apt --environments 10` | APT campaigns across 10 environments | Complete attack data across 10 environment sets |
| **`yarn start generate-campaign ransomware --environments 50 --realistic`** | **🌟 Realistic ransomware across 50 environments** | **Complete log→alert pipelines across 50 environment sets** |

### 🔬 Multi-Field Generation Examples
| Command | Result | Performance |
|---------|--------|-------------|
| `yarn start generate-alerts -n 100 --multi-field` | 100 alerts + 200 fields each | <1 second |
| `yarn start generate-logs -n 1000 --multi-field --field-count 500` | 1000 logs + 500 fields each | <5 seconds |
| `yarn start generate-campaign apt --multi-field --field-count 300` | APT campaign + 300 enriched fields | <10 seconds |
| **`yarn start generate-campaign ransomware --environments 25 --multi-field --field-count 5000`** | **🌟 Enterprise ransomware across 25 environments + 5,000 fields** | **<30 seconds** |

### 🔬 **Standalone Field Generation**
Generate security fields on demand without alerts or logs:

| Command | Result | Use Case |
|---------|--------|----------|
| `yarn start generate-fields -n 1000` | 1000 fields across all categories | Development/testing |
| `yarn start generate-fields -n 4000 --categories behavioral_analytics` | 4000 behavioral analytics fields | SOC training |
| `yarn start generate-fields -n 10000 --categories threat_intelligence,security_scores` | 10000 threat + security fields | Detection rule testing |
| `yarn start generate-fields -n 500 --output file --filename security-fields.json` | Save 500 fields to file | Data analysis |
| `yarn start generate-fields -n 2000 --output elasticsearch --index test-fields` | Index 2000 fields to Elasticsearch | Integration testing |

**✅ Fixes Original Issue**: Category filtering now works correctly for any field count (1-50,000)

### 🗺️ **Elasticsearch Mapping Setup**
Ensure multi-field data appears properly in Kibana (not as unmapped fields):

| Command | Result | Use Case |
|---------|--------|----------|
| `yarn start setup-mappings` | Creates component templates for future indices | **Run once for new environments** |
| `yarn start update-mapping` | **Updates existing indices with field mappings** | **Fix existing unmapped fields** |
| **Benefits:** | **Proper field visualization in Kibana** | **Better query performance and aggregations** |

**🔧 Workflow for Existing Data:**
```bash
# 1. Generate multi-field data first
yarn start generate-alerts -n 10 --multi-field --field-count 4000 --field-categories behavioral_analytics

# 2. Fix unmapped fields in existing indices
yarn start update-mapping

# 3. Refresh field list in Kibana (Stack Management → Index Patterns → Refresh)
```

**⚠️ Important**: If you see unmapped fields in Kibana, run `update-mapping` to fix existing indices.

### 🧠 Knowledge Base Commands
| Command | Description | Example |
|---------|-------------|---------|
| **`generate-knowledge-base`** | **🧠 AI Assistant Knowledge Base** | `yarn start generate-knowledge-base -n 25 --categories threat_intelligence,incident_response` |
| `generate-knowledge-base --mitre` | Knowledge docs with MITRE mappings | `yarn start generate-knowledge-base -n 20 --mitre --confidence-threshold 0.8` |
| `delete-knowledge-base` | Clean up knowledge base | `yarn start delete-knowledge-base --namespace prod` |

### 🤖 Machine Learning Commands
| Command | Description | Example |
|---------|-------------|---------|
| **`generate-ml-data`** | **🤖 ML Training Data Generation** | `yarn start generate-ml-data --modules security_auth,security_linux` |
| `generate-ml-data --enable-jobs` | Create ML jobs in Elasticsearch | `yarn start generate-ml-data --modules security_auth --enable-jobs` |
| `rules --enable-ml-jobs --generate-ml-data` | ML-enhanced detection rules | `yarn start rules -r 10 -t machine_learning --enable-ml-jobs --generate-ml-data` |

### 🗑️ Cleanup Commands
| Command | Description |
|---------|-------------|
| `delete-alerts` | Clean up generated alerts |
| `delete-events` | Clean up generated events |
| `delete-logs` | Clean up source logs |
| `delete-rules` | Clean up detection rules |
| `delete-knowledge-base` | Clean up knowledge base documents |

## 🌍 Multi-Environment Generation

### **🚀 Scale to Hundreds of Environments**
Generate data across multiple simulated environments with complete isolation:

```bash
# Generate alerts across 50 production environments
yarn start generate-alerts -n 100 --environments 50 --namespace prod
# Creates: .alerts-security.alerts-prod-env-001 through prod-env-050
# Total: 5,000 alerts across 50 indices

# Generate logs across 100 datacenter environments
yarn start generate-logs -n 1000 --environments 100 --namespace datacenter --types system,network
# Creates: logs-system.system-datacenter-env-001 through datacenter-env-100
#          logs-network.traffic-datacenter-env-001 through datacenter-env-100
# Total: 200,000 logs across 200 indices

# Generate complete attack campaigns across multiple staging environments
yarn start generate-campaign ransomware --environments 25 --namespace staging --realistic
# Creates: Complete ransomware scenarios across staging-env-001 through staging-env-025
```

### **🏯 Use Cases for Multi-Environment Generation**
- **Load Testing**: Simulate hundreds of production environments
- **Multi-Tenant Scenarios**: Separate customer environments
- **Geographic Distribution**: Different datacenter namespaces
- **Environment Staging**: dev, staging, prod separation
- **Compliance Testing**: Isolated audit environments
- **Performance Analysis**: Compare metrics across environment types

## 🔬 Multi-Field Generation

### **🚀 High-Performance Field Enrichment**
Generate hundreds of additional security fields without AI overhead:

```bash
# Generate alerts with 300 additional security fields (instant generation)
yarn start generate-alerts -n 100 --multi-field --field-count 300

# Target specific field categories for focused testing
yarn start generate-alerts -n 50 --multi-field \
  --field-categories behavioral_analytics,threat_intelligence,security_scores

# High-speed generation with performance optimization
yarn start generate-logs -n 5000 --multi-field --field-count 200 --field-performance-mode
```

### **📊 Available Field Categories**
- **`behavioral_analytics`** - User/host behavior, anomaly scores, baseline deviations (80+ fields)
- **`threat_intelligence`** - IoC matches, reputation scores, malware families (70+ fields)
- **`performance_metrics`** - CPU, memory, disk, network utilization (60+ fields)
- **`security_scores`** - Risk assessments, vulnerability scores, compliance (50+ fields)
- **`audit_compliance`** - Audit trails, compliance checks, violations (40+ fields)
- **`network_analytics`** - Connection analysis, DNS queries, protocol anomalies (60+ fields)
- **`endpoint_analytics`** - Process injection, persistence, lateral movement (50+ fields)

### **🎯 Key Benefits**
- **99% Token Reduction**: Zero AI calls for field generation
- **95% Faster**: <100ms for 500 fields per document
- **Context-Aware**: Automatically selects relevant fields based on log type
- **Realistic Correlations**: Fields correlate logically (high CPU → high memory)
- **Infinite Scale**: Generate millions of enriched documents in minutes

### **📋 Example Generated Fields**
```json
{
  "user_behavior.anomaly_score": 87.45,
  "threat.intelligence.confidence": 92,
  "threat.enrichment.reputation_score": -75,
  "system.performance.cpu_usage": 78.3,
  "security.score.overall_risk": 84.7,
  "network.analytics.suspicious_domain_count": 3,
  "endpoint.analytics.process_injection_score": 67.4,
  "audit.activity.privileged_access_count": 8
}
```

**📚 [Full Multi-Field Documentation →](docs/multi-field-generation.md)**

## 🎨 Theme-Based Data Generation

### **🎭 Generate Consistent Themed Security Data**
Transform boring test data into engaging, memorable scenarios while maintaining security realism:

```bash
# Marvel superhero-themed security data
yarn start generate-campaign apt --theme marvel --realistic --mitre
# Creates: tony.stark@starkindustries.com, shield-web-01, avengers-sql-02

# Star Wars-themed enterprise deployment
yarn start generate-alerts -n 100 --theme starwars --mitre --multi-field
# Creates: luke.skywalker@rebels.org, jedi-api-01, death-star-db-03

# NBA-themed SOC training environment
yarn start generate-logs -n 1000 --theme nba --types system,auth,network
# Creates: lebron.james@lakers.com, warriors-mail-01, bulls-app-02
```

### **🎯 Supported Themes (17 Total)**
| Category | Themes | Example Data |
|----------|--------|--------------|
| **Sports** | `nba`, `nfl`, `soccer`, `mlb` | lebron.james, patriots-web-01, messi.lionel |
| **Entertainment** | `marvel`, `starwars`, `movies`, `tv_shows`, `anime` | tony.stark, jedi-db-02, naruto.uzumaki |
| **Technology** | `tech_companies`, `programming` | satya.nadella, google-api-01, python-srv-03 |
| **Culture** | `mythology`, `literature`, `history`, `music`, `food` | zeus.olympus, shakespeare-web-01, beethoven.ludwig |

### **📊 Themed Data Types**
Every aspect of your security data follows the selected theme:

| Data Type | Purpose | Example (Marvel Theme) |
|-----------|---------|------------------------|
| **Usernames** | User accounts, authentication logs | `tony.stark`, `peter.parker`, `steve.rogers` |
| **Hostnames** | Server names, network devices | `iron-web-01`, `spider-db-02`, `shield-mail-03` |
| **Full Names** | Employee records, audit logs | `Tony Stark`, `Peter Parker`, `Steve Rogers` |
| **Emails** | Communication logs, phishing scenarios | `tony.stark@starkindustries.com` |
| **Organizations** | Company names, department data | `Stark Industries Security`, `SHIELD Operations` |
| **Process Names** | Endpoint security, malware analysis | `StarkSecurityService`, `ShieldLogService` |
| **File Names** | Document analysis, forensics | `arc-reactor-plans.pdf`, `shield-protocols.doc` |
| **File Paths** | System monitoring, file integrity | `C:\Stark\Designs\mark42.dwg` |
| **Registry Keys** | Windows forensics, persistence analysis | `HKLM\Software\Stark\Armor` |
| **URLs** | Web traffic analysis, threat hunting | `/api/stark/inventory`, `/shield/classified` |
| **IP Addresses** | Network analysis, threat intelligence | `192.168.10.1` (Stark HQ), `172.16.0.7` (SHIELD) |
| **Application Names** | Software inventory, security tools | `Stark Analyzer`, `Shield Monitor` |
| **Service Names** | Service monitoring, process analysis | `AvengersNetService`, `GammaMonitorService` |
| **Event Descriptions** | SIEM alerts, security notifications | `Stark security protocol engaged` |

### **🚀 Theme Integration Examples**

#### **🦸 Marvel APT Campaign**
```bash
yarn start generate-campaign apt --theme marvel --realistic --mitre --detection-rate 0.8
```
**Result**: Complete APT scenario with Marvel-themed entities:
- **Initial Access**: `peter.parker@dailybugle.com` receives phishing email
- **Execution**: Malware executes on `spider-web-01.dailybugle.com`
- **Persistence**: Registry key `HKLM\Software\WebSlinger\Config` modified
- **Collection**: Data stolen from `C:\Stark\Classified\reactor-specs.pdf`
- **Exfiltration**: Data sent to external IP via `GammaMonitorService`

#### **⚽ Soccer SOC Training**
```bash
yarn start generate-logs -n 2000 --theme soccer --types system,auth,network,endpoint
```
**Result**: Comprehensive logs with soccer theme:
- **Authentication**: `messi.lionel` failed login on `barcelona-dc-01`
- **Network**: Suspicious traffic from `real-madrid-web-02` to external IP
- **Process**: `ChampionsLeagueService` consuming high CPU
- **File**: Access denied to `\\fifa-share\world-cup-plans.xlsx`

#### **🌟 Star Wars Multi-Environment**
```bash
yarn start generate-alerts -n 500 --theme starwars --environments 10 --multi-field --field-count 300
```
**Result**: 10 environments with consistent Star Wars theming:
- **Environments**: `jedi-env-001` through `empire-env-010`
- **Hosts**: `tatooine-web-01`, `coruscant-db-02`, `death-star-api-03`
- **Users**: `luke.skywalker@rebels.org`, `vader@empire.gov`
- **Enhanced Fields**: 300 additional security fields per alert

### **🎯 Theme Benefits**

#### **For Security Training:**
- **Memorable Scenarios**: "Tony Stark's laptop was compromised" vs "User-47382's device infected"
- **Engaging Content**: Teams remember Marvel characters better than random hostnames
- **Realistic Context**: Themed data still follows security best practices
- **Story Continuity**: All events in a campaign follow the same universe

#### **For Development & Testing:**
- **Consistent Test Data**: Same theme across development, staging, and testing
- **Easy Identification**: Quickly spot themed vs real data in mixed environments
- **Demo-Friendly**: Impressive presentations with recognizable names
- **Team Alignment**: Shared vocabulary across security and development teams

#### **For SOC Operations:**
- **Reduced Confusion**: Clear distinction between test and production data
- **Training Scenarios**: Create memorable attack stories for analyst training
- **Drill Identification**: Instantly recognize themed data during exercises
- **Knowledge Retention**: Teams retain information better with familiar themes

### **🔧 Theme Configuration**

#### **Simple Theme Application**
```bash
# Apply single theme to all data types
yarn start generate-alerts -n 100 --theme marvel
yarn start generate-logs -n 500 --theme nba
yarn start generate-campaign ransomware --theme starwars
```

#### **AI-Enhanced vs Fallback Data**
- **AI-Enhanced**: When AI is properly configured, generates dynamic themed data
- **Smart Fallbacks**: When AI fails, uses curated themed data collections
- **Hybrid Approach**: Combines AI creativity with reliable fallback data
- **No Interruption**: Theme generation never fails, always produces themed results

#### **Performance Characteristics**
- **First Generation**: May take 10-30 seconds for AI to generate themed data
- **Cached Results**: Subsequent generations use cached data (instant)
- **Fallback Speed**: Fallback data is instant for all themes
- **Batch Optimization**: Generates large batches to populate cache efficiently

### **💡 Theme Usage Tips**

#### **Best Practices:**
- **Consistent Environments**: Use same theme across related environments
- **Demo Preparation**: Pre-generate themed data to ensure AI cache is populated
- **Mixed Themes**: Use different themes for different test scenarios
- **Documentation**: Document which themes represent which test scenarios

#### **SOC Training Scenarios:**
```bash
# "Avengers Under Attack" - Advanced APT scenario
yarn start generate-campaign apt --theme marvel --realistic --detection-rate 0.3

# "Galactic Empire Infiltration" - Insider threat simulation
yarn start generate-campaign insider --theme starwars --realistic --detection-rate 0.6

# "Championship Security" - High-volume event monitoring
yarn start generate-logs -n 5000 --theme soccer --types system,network,endpoint
```

#### **Enterprise Integration:**
```bash
# Production-like environment with consistent theming
yarn start generate-alerts -n 1000 --theme tech_companies --environments 25 \
  --multi-field --field-count 500 --namespace production-test

# Compliance audit simulation with themed data
yarn start generate-knowledge-base -n 50 --theme mythology \
  --categories compliance,audit_compliance --access-level organization
```

## 🧠 AI Assistant Knowledge Base

### **🎯 Security Knowledge Documents for AI Assistant**
Generate comprehensive security knowledge documents optimized for Elastic AI Assistant integration:

```bash
# Generate comprehensive security knowledge base
yarn start generate-knowledge-base -n 30 --categories threat_intelligence,incident_response,vulnerability_management

# High-confidence public security documentation
yarn start generate-knowledge-base -n 25 --access-level public --confidence-threshold 0.9

# Knowledge base with MITRE ATT&CK framework integration
yarn start generate-knowledge-base -n 20 --mitre --categories malware_analysis,forensics
```

### **📚 Knowledge Base Categories**
- **`threat_intelligence`** - IOC analysis, APT profiles, campaign tracking, attribution
- **`incident_response`** - Playbooks, procedures, escalation matrices, communication
- **`vulnerability_management`** - CVE analysis, patch management, assessment reports
- **`network_security`** - Firewall rules, IDS signatures, traffic analysis, DNS security
- **`endpoint_security`** - EDR rules, behavioral patterns, process monitoring
- **`cloud_security`** - AWS/Azure/GCP security, container monitoring, serverless analytics
- **`compliance`** - PCI DSS, SOX, GDPR, HIPAA, ISO27001 frameworks
- **`forensics`** - Memory analysis, disk forensics, network forensics, timeline analysis
- **`malware_analysis`** - Static/dynamic analysis, reverse engineering, sandbox reports
- **`behavioral_analytics`** - User analytics, entity analytics, anomaly detection

### **🔍 Key Features**
- **ELSER v2 Integration**: Semantic text fields optimized for AI Assistant
- **Suggested Questions**: AI-optimized questions for each document category
- **MITRE ATT&CK Mapping**: Technique and tactic associations
- **Confidence Scoring**: Quality assessment from 0.6-1.0
- **Access Control**: Multi-level restrictions (public, team, organization, restricted)
- **Rich Console Output**: Document titles, confidence indicators, and suggested questions

### **💬 Example Generated Content**
```
📋 Generated Knowledge Base Documents:
  1. 🔥 👥 [threat_intelligence/ioc_analysis] IOC Analysis: MALWARE-7426
     💬 Suggested AI Assistant Questions:
        1. What IOCs should we immediately block in our environment?
        2. How confident are we in the attribution of this threat?
        3. What detection rules should we create based on these indicators?

  2. ✅ 🏢 [incident_response/playbooks] IR Playbook: Ransomware Incident Response
     💬 Suggested AI Assistant Questions:
        1. What are the key decision points in this incident response process?
        2. How do we customize this playbook for our environment?
        3. What tools and resources are required for each phase?
```

**📚 [Full Knowledge Base Documentation →](docs/knowledge-base-integration.md)**

## 🤖 Machine Learning Anomaly Detection

### **🎯 Enterprise ML Data Generation**
Generate realistic ML training data for Elastic Security Machine Learning jobs across all security domains:

```bash
# Generate authentication anomaly data
yarn start generate-ml-data --modules security_auth,security_linux

# Complete ML workflow: create jobs + generate training data
yarn start generate-ml-data --modules security_auth,security_windows --enable-jobs

# Enterprise scale: all modules with performance optimization
yarn start generate-ml-data --modules security_auth,security_linux,security_windows,security_network,security_packetbeat,security_cloudtrail --chunk-size 5000
```

### **📊 ML Security Modules**
- **`security_auth`** - Authentication anomalies (rare users, failed logins, unusual timing)
- **`security_linux`** - Linux system anomalies (unusual users, sudo activity, network patterns)  
- **`security_windows`** - Windows anomalies (process creation, runas events, script execution)
- **`security_cloudtrail`** - AWS CloudTrail anomalies (error patterns, API methods, geographic)
- **`security_network`** - Network anomalies (high volume, rare destinations, unusual processes)
- **`security_packetbeat`** - Traffic anomalies (DNS queries, server domains, URL patterns)

### **🚀 ML-Enhanced Detection Rules**
Integrate ML jobs directly with detection rule generation:

```bash
# Generate ML rules with automatic training data
yarn start rules -r 10 -t machine_learning --generate-ml-data --ml-modules security_auth,security_windows

# Complete ML-powered SOC setup: rules + jobs + data
yarn start rules -r 20 -t query,threshold,machine_learning --enable-ml-jobs --generate-ml-data --ml-modules security_auth,security_cloudtrail,security_network

# Enterprise ML testing across multiple spaces
yarn start rules -r 15 --enable-ml-jobs --generate-ml-data --ml-modules security_auth,security_windows,security_linux -s ml-testing
```

### **🔍 ML Analysis Functions**
- **`rare`** - Detects rare field values (unusual usernames, rare processes)
- **`high_count`** - Identifies volume anomalies (authentication spikes, network floods)
- **`high_distinct_count`** - Finds diversity anomalies (error message variety)
- **`high_info_content`** - Detects entropy anomalies (encoded commands, scripts)
- **`time_of_day`** - Identifies temporal anomalies (unusual login hours)

### **📈 Key Features**
- **21 Pre-built ML Jobs**: Complete coverage across security domains
- **Realistic Anomaly Injection**: 0.02%-0.08% anomaly rates matching production
- **Context-Aware Generation**: Field patterns specific to security domains
- **Enterprise Scale**: Generate 100k+ documents with performance optimization
- **Rule Integration**: ML jobs automatically connected to detection rules

### **💡 Example Use Cases**

#### **SOC Analyst Training**
```bash
# Create realistic authentication anomalies for training
yarn start generate-ml-data --modules security_auth --enable-jobs
# Result: 40,000 auth events with 22 realistic anomalies
```

#### **Detection Rule Testing**
```bash
# Test ML rules with comprehensive data
yarn start rules -r 5 -t machine_learning --generate-ml-data --ml-modules security_windows,security_linux
# Result: ML rules with corresponding training data and realistic test events
```

#### **Enterprise ML Deployment**
```bash
# Full ML environment setup
yarn start generate-ml-data --modules security_auth,security_linux,security_windows,security_network,security_packetbeat,security_cloudtrail --enable-jobs --chunk-size 3000
# Result: All 21 ML jobs with 210,000 training documents
```

**🤖 [Full ML Documentation →](docs/machine-learning-integration.md)**

## 🎪 Realistic Attack Scenarios

### **🎭 Complete SOC Training Scenarios**
```bash
# Realistic APT campaign: 18 source logs → 0 detected alerts (stealth attack)
yarn start generate-campaign apt --realistic --mitre --logs-per-stage 3 --detection-rate 0.3

# Ransomware outbreak: 38 source logs → 12 detected alerts (high visibility)
yarn start generate-campaign ransomware --realistic --mitre --logs-per-stage 2 --detection-rate 0.8

# Insider threat: Gradual privilege abuse with low detection
yarn start generate-campaign insider --realistic --mitre --detection-rate 0.2

# 🔬 Enhanced with Multi-Field Generation
# APT campaign with 400 additional behavioral and threat intelligence fields
yarn start generate-campaign apt --realistic --mitre --multi-field --field-count 400 \
  --field-categories behavioral_analytics,threat_intelligence,endpoint_analytics

# Ransomware with full security context (500+ fields per event)
yarn start generate-campaign ransomware --realistic --mitre --multi-field --field-count 500
```

### **🔍 What You Get:**
- **Source Logs**: Realistic Windows/Linux logs that tell the attack story
- **Triggered Alerts**: Security alerts generated from suspicious log patterns
- **Missed Activities**: Realistic gaps in detection (like real SOCs)
- **Investigation Timeline**: Chronological attack progression
- **Investigation Guide**: Step-by-step analysis recommendations

### **📊 Example Output:**
```
🎊 Realistic Campaign Generated Successfully:
  🎯 Attack Stages: 8
  ⚔️  Campaign: Conti Enterprise Ransomware Campaign
  🎭 Threat Actor: Conti
  📋 Total Logs: 38
  🚨 Detected Alerts: 12
  ⚪ Missed Activities: 2
  📅 Timeline: 45 events

📖 Investigation Guide:
  1. Review initial alerts and identify affected systems
  2. Investigate supporting logs around alert times
  3. Look for lateral movement and persistence

📍 View in Kibana space: default
🔍 Filter logs with: logs-*
🚨 View alerts in Security app
📈 12 alerts triggered by 38 source logs
```

## 🔧 Configuration

Create `config.json` with your connection and AI provider settings:

### 🔐 Authentication Options

#### API Key Authentication (Recommended - Default)
Secure authentication for Elastic Cloud, Serverless, and production environments:

```json
{
  "elastic": {
    "node": "https://your-cluster.es.us-west2.gcp.elastic-cloud.com",
    "apiKey": "VnVhQ2ZHY0JDdbkQm-e5aM..."
  },
  "kibana": {
    "node": "https://your-kibana.kb.us-west2.gcp.elastic-cloud.com:9243",
    "apiKey": "VnVhQ2ZHY0JDdbkQm-e5aM..."
  },
  "serverless": true
}
```

**📝 How to obtain API keys:**

1. **Elastic Cloud**: Stack Management → Security → API Keys → Create API Key
2. **Kibana Dev Tools**: 
   ```bash
   POST /_security/api_key
   {
     "name": "security-docs-generator",
     "role_descriptors": {
       "security_role": {
         "cluster": ["all"],
         "index": [{"names": ["*"], "privileges": ["all"]}]
       }
     }
   }
   ```
3. **Serverless**: Use the pre-configured service tokens from your serverless environment

#### Username/Password Authentication
For local development and self-hosted deployments:

```json
{
  "elastic": {
    "node": "http://localhost:9200",
    "username": "elastic",
    "password": "changeme"
  },
  "kibana": {
    "node": "http://localhost:5601",
    "username": "elastic",
    "password": "changeme"
  }
}
```

#### Serverless Development
For local serverless development (using `yarn es serverless`):

```json
{
  "elastic": {
    "node": "https://localhost:9200",
    "username": "elastic_serverless",
    "password": "changeme"
  },
  "kibana": {
    "node": "https://localhost:5601",
    "apiKey": "AAEAAWVsYXN0aWMva2liYW5hL2tpYmFuYS1kZXY6VVVVVVVVTEstKiBaNA"
  },
  "serverless": true
}
```

### 🤖 AI Provider Configuration

#### OpenAI
```json
{
  "elastic": { "node": "https://your-cluster.com", "apiKey": "..." },
  "kibana": { "node": "https://your-kibana.com", "apiKey": "..." },
  "useAI": true,
  "openaiApiKey": "sk-..."
}
```

#### Claude (Anthropic)
```json
{
  "elastic": { "node": "https://your-cluster.com", "apiKey": "..." },
  "kibana": { "node": "https://your-kibana.com", "apiKey": "..." },
  "useAI": true,
  "useClaudeAI": true,
  "claudeApiKey": "sk-ant-..."
}
```

#### Azure OpenAI
```json
{
  "elastic": { "node": "https://your-cluster.com", "apiKey": "..." },
  "kibana": { "node": "https://your-kibana.com", "apiKey": "..." },
  "useAI": true,
  "useAzureOpenAI": true,
  "azureOpenAIApiKey": "...",
  "azureOpenAIEndpoint": "https://your-resource.openai.azure.com/",
  "azureOpenAIDeployment": "gpt-4"
}
```

## 🎯 Campaign Types

| Type | Attack Stages | Key Characteristics | Detection Rate |
|------|---------------|---------------------|----------------|
| **APT** | 2-4 stages | Stealth, lateral movement, long-term | Low (0.2-0.4) |
| **Ransomware** | 8 stages | Fast progression, high impact | High (0.6-0.9) |
| **Insider** | 3-6 stages | Privilege abuse, data exfiltration | Medium (0.3-0.6) |
| **Supply Chain** | 4-7 stages | External compromise, multiple victims | Medium (0.4-0.7) |

## 🛠️ Advanced Usage

### **Realistic Mode Options**
```bash
# High detection environment (well-monitored SOC)
yarn start generate-campaign apt --realistic --detection-rate 0.8 --logs-per-stage 5

# Stealth attack (limited visibility)
yarn start generate-campaign apt --realistic --detection-rate 0.2 --logs-per-stage 8

# Large-scale incident
yarn start generate-campaign ransomware --realistic --events 50 --targets 20 --logs-per-stage 10
```

### **Custom Time Patterns**
```bash
# Business hours attack
yarn start generate-campaign insider --realistic --time-pattern business_hours

# Weekend attack (low staffing)
yarn start generate-campaign ransomware --realistic --time-pattern weekend_heavy
```

## 🔍 Investigation & Analysis

### **In Kibana:**
1. **Logs**: Filter by `logs-*` to see all source logs
2. **Alerts**: Check Security app for triggered alerts
3. **Timeline**: View chronological attack progression
4. **Correlation**: Follow investigation guide recommendations

### **Key Investigation Queries:**
```
# View all logs from affected hosts
host.name:(ws-123 OR srv-456) AND @timestamp:[now-24h TO now]

# Find authentication events around alert times
event.category:authentication AND event.outcome:success

# Look for lateral movement indicators
event.category:network AND destination.ip:10.* AND source.ip:external
```

## 📚 Documentation

| Topic | Description |
|-------|-------------|
| **[🛡️ Detection Rules Generation](docs/detection-rules.md)** | **All 7 rule types with triggered alerts** ⭐ |
| **[🔗 Kibana Cloud Integration](docs/kibana-cloud-integration.md)** | **Direct Security → Alerts integration** ⭐ |
| **[🎨 Theme-Based Generation](docs/theme-generation.md)** | **Consistent themed security data** |
| **[Multi-Field Generation](docs/multi-field-generation.md)** | **500+ security fields, zero tokens** |
| **[🤖 Machine Learning Integration](docs/machine-learning-integration.md)** | **ML anomaly detection and training data** |
| [Use Cases Guide](docs/use-cases-guide.md) | Enterprise scenarios and workflows |
| [False Positives](docs/false-positives.md) | Detection rule testing and SOC training |
| [Attack Campaigns](docs/attack-campaigns.md) | Campaign generation guide |
| [MITRE ATT&CK](docs/mitre-attack.md) | Framework integration |
| [AI Integration](docs/ai-integration.md) | AI providers and setup |
| [Configuration](docs/configuration.md) | System configuration |
| [API Reference](docs/api-reference.md) | Complete API documentation |

## 🎉 Benefits

### **For Security Teams:**
- **Realistic Training**: Complete attack scenarios with proper evidence chains
- **Detection Testing**: Validate rules against realistic attack patterns with 500+ contextual fields
- **SOC Training**: Practice investigation workflows on believable data with rich telemetry
- **Enhanced Context**: Multi-field generation provides comprehensive security analytics

### **For Developers:**
- **Integration Testing**: Test security tools with realistic data volumes and field diversity
- **Performance Testing**: Validate systems under realistic security loads with hundreds of fields
- **Rule Development**: Create detection rules with comprehensive test data
- **Cost Efficiency**: 99% token reduction while maintaining data richness

### **For Operations:**
- **Scalable Generation**: Create millions of enriched documents in minutes
- **Zero AI Dependency**: Multi-field generation works without API availability
- **Consistent Performance**: Deterministic field generation for reproducible testing
- **Resource Optimization**: Minimal computational overhead for maximum data richness

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests and documentation
5. Submit a pull request

## 📝 License

MIT License - see [LICENSE](LICENSE) for details.

---

**🎭 Ready to simulate realistic security incidents?** Start with:

```bash
# Complete attack scenario with forensic evidence chains
yarn start generate-campaign ransomware --realistic --mitre

# Enhanced with 300 additional security fields (99% faster, zero tokens)
yarn start generate-campaign ransomware --realistic --mitre --multi-field --field-count 300

# 🎨 Marvel-themed SOC training with realistic attack progression
yarn start generate-campaign apt --theme marvel --realistic --mitre --multi-field --field-count 400
```

**🔬 Experience the power of multi-field generation!** Generate hundreds of contextual security fields in milliseconds with zero AI overhead.
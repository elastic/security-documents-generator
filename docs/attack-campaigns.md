# 🏴‍☠️ Attack Campaign Generation

Complete guide to generating realistic multi-stage attack campaigns with AI-powered narrative generation.

## 📋 Table of Contents

- [Overview](#overview)
- [Quick Start](#quick-start)
- [Campaign Types](#campaign-types)
- [AI-Powered Features](#ai-powered-features)
- [Realistic Campaign Mode](#realistic-campaign-mode)
- [MITRE ATT&CK Integration](#mitre-attck-integration)
- [Configuration](#configuration)
- [Use Cases](#use-cases)
- [Troubleshooting](#troubleshooting)

## Overview

The attack campaign generator creates sophisticated, multi-stage attack scenarios that simulate real-world threat actor behavior with:

- **4 Campaign Types**: APT, Ransomware, Insider Threats, Supply Chain
- **AI-Powered Narratives**: Contextual attack stories and motivations
- **MITRE ATT&CK Mapping**: Complete technique coverage
- **Realistic Mode**: Simulates actual detection rates and defensive responses
- **Theme Integration**: Consistent entity naming across campaign events

## Quick Start

### Basic Campaign Generation
```bash
# Generate APT campaign with MITRE mapping
yarn start generate-campaign apt --mitre --count 100

# Generate ransomware campaign with theme
yarn start generate-campaign ransomware --theme marvel --count 150

# Generate realistic insider threat campaign
yarn start generate-campaign insider --realistic --count 75

# Generate supply chain attack campaign
yarn start generate-campaign supply_chain --count 200
```

### Advanced Campaign Generation
```bash
# Realistic APT with AI narratives and MITRE mapping
yarn start generate-campaign apt --realistic --ai --mitre --count 200

# Themed ransomware campaign with session view support
yarn start generate-campaign ransomware --theme marvel --session-view --count 100

# Complex supply chain attack with visual analysis
yarn start generate-campaign supply_chain --visual-analyzer --mitre --count 150
```

## Campaign Types

### 1. **APT (Advanced Persistent Threat)**
Simulates nation-state and advanced threat actor campaigns:

**Attack Stages:**
- **Initial Access**: Spear phishing, watering hole attacks
- **Persistence**: Registry modification, scheduled tasks
- **Lateral Movement**: Network reconnaissance, credential theft
- **Data Exfiltration**: File collection and C2 communication

**Example:**
```bash
yarn start generate-campaign apt --realistic --mitre --count 200
```

### 2. **Ransomware**
Simulates ransomware deployment and encryption campaigns:

**Attack Stages:**
- **Initial Compromise**: Malicious attachments, RDP brute force
- **Reconnaissance**: Network discovery, file enumeration
- **Encryption**: File encryption, shadow copy deletion
- **Extortion**: Ransom note deployment, payment demands

**Example:**
```bash
yarn start generate-campaign ransomware --theme marvel --realistic --count 150
```

### 3. **Insider Threat**
Simulates malicious insider activities:

**Attack Stages:**
- **Privilege Abuse**: Accessing unauthorized resources
- **Data Collection**: Systematic file access and copying
- **Evasion**: Covering tracks, log manipulation
- **Exfiltration**: Data theft via various channels

**Example:**
```bash
yarn start generate-campaign insider --realistic --count 100
```

### 4. **Supply Chain**
Simulates supply chain compromise attacks:

**Attack Stages:**
- **Vendor Compromise**: Third-party system infiltration
- **Code Injection**: Malicious code insertion
- **Distribution**: Compromised software deployment
- **Activation**: Backdoor activation and persistence

**Example:**
```bash
yarn start generate-campaign supply_chain --mitre --count 175
```

## AI-Powered Features

### Narrative Generation
AI creates contextual attack stories and motivations:

```json
{
  "campaign": {
    "name": "Operation Silent Storm",
    "description": "Sophisticated APT campaign targeting financial institutions",
    "motivation": "Economic espionage and credential harvesting",
    "attribution": "APT29-style tactics with novel persistence mechanisms"
  }
}
```

### Contextual Attack Progression
AI ensures logical attack flow and realistic timing:
- **Temporal Consistency**: Events follow realistic timelines
- **Tactical Evolution**: Attacks adapt based on defensive responses
- **Operational Security**: Attackers modify behavior to avoid detection

## Realistic Campaign Mode

### Detection Rate Simulation
Realistic mode simulates actual enterprise detection capabilities:

```bash
yarn start generate-campaign apt --realistic --count 200
```

**Detection Characteristics:**
- **Early Stages**: Low detection rates (10-30%)
- **Persistence**: Medium detection rates (40-60%)
- **Lateral Movement**: Higher detection rates (60-80%)
- **Exfiltration**: Variable detection based on controls

### Defensive Response Simulation
- **Alert Fatigue**: Realistic false positive generation
- **Investigation Delays**: Simulated response times
- **Incomplete Visibility**: Some activities remain undetected

## MITRE ATT&CK Integration

### Complete Technique Coverage
```bash
yarn start generate-campaign apt --mitre --count 150
```

**Technique Mapping:**
- **Initial Access**: T1566 (Phishing), T1190 (Exploit Public-Facing Application)
- **Persistence**: T1053 (Scheduled Task), T1547 (Boot or Logon Autostart)
- **Defense Evasion**: T1055 (Process Injection), T1070 (Indicator Removal)
- **Lateral Movement**: T1021 (Remote Services), T1078 (Valid Accounts)

### Realistic Technique Distribution
Each campaign type uses appropriate MITRE techniques:
- **APT**: Heavy focus on persistence and lateral movement
- **Ransomware**: Emphasis on impact and defense evasion
- **Insider**: Privilege escalation and collection techniques
- **Supply Chain**: Initial access and persistence focus

## Configuration

### Campaign Parameters
Customize campaign generation through various options:

```bash
# Campaign type selection
--campaign-type <apt|ransomware|insider|supply_chain>

# Realism controls
--realistic                    # Enable realistic detection rates
--detection-rate 0.3          # Set custom detection rate (0.0-1.0)

# Integration options
--mitre                       # Add MITRE ATT&CK mappings
--ai                          # Enable AI narrative generation
--theme <theme_name>          # Apply consistent theming

# Output controls
--count <number>              # Number of events to generate
--session-view               # Generate compatible process logs
--visual-analyzer            # Enable visual analysis features
```

### Theme Integration
Campaigns support consistent entity naming:

```bash
# Marvel-themed APT campaign
yarn start generate-campaign apt --theme marvel --count 100

# Generates entities like:
# - Usernames: tony.stark, peter.parker
# - Hostnames: stark-industries-web01, avengers-hq-dc01
# - Processes: shield-security.exe, arc-reactor-monitor.exe
```

## Use Cases

### 1. **SOC Training**
Create realistic attack scenarios for analyst training:
```bash
yarn start generate-campaign apt --realistic --mitre --count 500
```

### 2. **Detection Rule Testing**
Validate detection capabilities across attack stages:
```bash
yarn start generate-campaign ransomware --count 200 --visual-analyzer
```

### 3. **Incident Response Exercises**
Generate complex scenarios for IR team practice:
```bash
yarn start generate-campaign insider --realistic --ai --count 300
```

### 4. **SIEM Tuning**
Test correlation rules and alert prioritization:
```bash
yarn start generate-campaign supply_chain --mitre --count 400
```

## Campaign Analytics

### Attack Progression Metrics
Generated campaigns include realistic progression metrics:
- **Dwell Time**: Average time between stages
- **Success Rates**: Probability of stage completion
- **Detection Probability**: Likelihood of defensive detection
- **Impact Assessment**: Potential business impact scores

### Temporal Patterns
- **Working Hours**: Higher activity during business hours
- **Off-Hours**: Reduced but persistent background activity
- **Weekend Patterns**: Minimal legitimate activity with anomalous events

## Troubleshooting

### Common Issues

#### Campaign Continuity
**Issue**: Events don't form coherent attack narrative
**Solution**: Ensure sufficient event count for complete campaign (100+ events)

#### Missing MITRE Mappings
**Issue**: Generated events lack MITRE technique mappings
**Solution**: Always use `--mitre` flag for technique attribution

#### Unrealistic Detection Patterns
**Issue**: All campaign events trigger alerts
**Solution**: Use `--realistic` flag to simulate actual detection rates

### Performance Optimization
- **Batch Processing**: Campaigns generated in batches for memory efficiency
- **Index Management**: Automatic index pattern handling
- **Progress Reporting**: Real-time generation status updates

## Advanced Features

### Multi-Environment Campaigns
Generate campaigns across multiple environments:
```bash
yarn start generate-campaign apt --environments 10 --count 1000
```

### Campaign Correlation
Link campaign events through entity relationships:
- **Shared Infrastructure**: Common C2 servers and domains
- **Credential Reuse**: Compromised accounts across multiple systems
- **Tool Signatures**: Consistent malware and technique patterns

---

*Ready to simulate sophisticated attack campaigns? Start with `yarn start generate-campaign apt --realistic --mitre --count 200` for a comprehensive APT simulation!*
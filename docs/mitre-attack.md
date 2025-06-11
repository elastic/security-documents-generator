# MITRE ATT&CK Integration

Comprehensive guide to using the MITRE ATT&CK framework for realistic security testing.

## 🎯 Overview

The Security Documents Generator includes deep integration with the MITRE ATT&CK framework, enabling generation of realistic attack scenarios based on documented adversary tactics, techniques, and procedures (TTPs).

### Key Features
- ✅ **Complete Framework Coverage**: All tactics, techniques, and sub-techniques
- ✅ **Attack Chain Generation**: Multi-stage attack progression
- ✅ **Dynamic Risk Scoring**: Severity based on technique combinations
- ✅ **AI Enhancement**: Context-aware technique selection
- ✅ **Temporal Correlation**: Realistic attack timing patterns

## 📋 Configuration

### Basic MITRE Setup
```json
{
  "mitre": {
    "enabled": true,
    "tactics": ["TA0001", "TA0002", "TA0003", "TA0004", "TA0005"],
    "probabilityOfMitreAlert": 0.6,
    "maxTechniquesPerAlert": 2
  }
}
```

### Advanced Configuration
```json
{
  "mitre": {
    "enabled": true,
    "tactics": [
      "TA0001", "TA0002", "TA0003", "TA0004", "TA0005",
      "TA0006", "TA0007", "TA0008", "TA0009", "TA0010"
    ],
    "maxTechniquesPerAlert": 3,
    "includeSubTechniques": true,
    "probabilityOfMitreAlert": 0.8,
    "enableAttackChains": true,
    "maxChainLength": 5,
    "chainProbability": 0.3,
    "preferredTechniques": ["T1566", "T1078", "T1055"],
    "riskWeighting": {
      "high": ["T1055", "T1078", "T1027"],
      "medium": ["T1566", "T1204", "T1083"],
      "low": ["T1087", "T1069", "T1012"]
    }
  }
}
```

## 🎭 Usage Examples

### Basic MITRE Generation
```bash
# Enable MITRE framework
yarn start generate-alerts -n 50 --ai --mitre

# Include sub-techniques for granular detection
yarn start generate-alerts -n 100 --ai --mitre --sub-techniques

# Generate attack chains for realistic progression
yarn start generate-alerts -n 150 --ai --mitre --attack-chains
```

### Campaign-Level MITRE Integration
```bash
# APT campaign with MITRE techniques
yarn start generate-campaign apt --ai --mitre --sub-techniques --attack-chains --events 200

# Ransomware with specific technique focus
yarn start generate-campaign ransomware --ai --mitre --attack-chains --events 150

# Insider threat with behavioral techniques
yarn start generate-campaign insider --ai --mitre --sub-techniques --events 100
```

### Testing Specific Tactics
```bash
# Test initial access techniques
yarn start generate-alerts -n 30 --ai --mitre --focus-tactic TA0001

# Defense evasion techniques
yarn start generate-alerts -n 40 --ai --mitre --focus-tactic TA0005
```

## 📊 MITRE Framework Coverage

### Supported Tactics

| Tactic ID | Name | Description | Key Techniques |
|-----------|------|-------------|----------------|
| **TA0001** | Initial Access | Entry vectors into network | T1566, T1190, T1078 |
| **TA0002** | Execution | Running malicious code | T1204, T1059, T1053 |
| **TA0003** | Persistence | Maintaining foothold | T1547, T1543, T1574 |
| **TA0004** | Privilege Escalation | Higher-level permissions | T1068, T1055, T1134 |
| **TA0005** | Defense Evasion | Avoiding detection | T1027, T1562, T1218 |
| **TA0006** | Credential Access | Stealing credentials | T1110, T1003, T1555 |
| **TA0007** | Discovery | Environment exploration | T1083, T1087, T1018 |
| **TA0008** | Lateral Movement | Moving through network | T1021, T1550, T1563 |
| **TA0009** | Collection | Gathering information | T1005, T1039, T1560 |
| **TA0010** | Exfiltration | Stealing data | T1041, T1048, T1567 |

### High-Impact Techniques

#### Critical Techniques (High Priority)
- **T1055** - Process Injection
- **T1078** - Valid Accounts
- **T1027** - Obfuscated Files or Information
- **T1134** - Access Token Manipulation
- **T1548** - Abuse Elevation Control Mechanism

#### Common Attack Techniques
- **T1566** - Phishing (Initial Access)
- **T1204** - User Execution
- **T1059** - Command and Scripting Interpreter
- **T1021** - Remote Services
- **T1083** - File and Directory Discovery

### Sub-Techniques Examples

#### T1566 - Phishing
- **T1566.001** - Spearphishing Attachment
- **T1566.002** - Spearphishing Link
- **T1566.003** - Spearphishing via Service

#### T1078 - Valid Accounts
- **T1078.001** - Default Accounts
- **T1078.002** - Domain Accounts
- **T1078.003** - Local Accounts
- **T1078.004** - Cloud Accounts

#### T1055 - Process Injection
- **T1055.001** - Dynamic-link Library Injection
- **T1055.002** - Portable Executable Injection
- **T1055.012** - Process Hollowing

## 🔗 Attack Chain Generation

### Chain Configuration
```json
{
  "attackChains": {
    "enabled": true,
    "maxLength": 8,
    "probabilityOfChain": 0.4,
    "allowCycles": false,
    "enforceProgression": true,
    "timeSpreadMinutes": {
      "min": 5,
      "max": 120
    }
  }
}
```

### Example Attack Chains

#### APT Attack Chain
```
1. T1566.001 (Spearphishing Attachment) 
   ↓ 15 minutes
2. T1204.002 (Malicious File Execution)
   ↓ 30 minutes  
3. T1547.001 (Registry Run Keys - Persistence)
   ↓ 45 minutes
4. T1055.001 (DLL Injection - Privilege Escalation)
   ↓ 60 minutes
5. T1083 (File and Directory Discovery)
   ↓ 30 minutes
6. T1021.001 (Remote Desktop - Lateral Movement)
   ↓ 90 minutes
7. T1005 (Data from Local System - Collection)
   ↓ 20 minutes
8. T1041 (Exfiltration Over C2 Channel)
```

#### Ransomware Attack Chain
```
1. T1190 (Exploit Public-Facing Application)
   ↓ 10 minutes
2. T1059.003 (Windows Command Shell)
   ↓ 20 minutes
3. T1562.001 (Disable or Modify Tools)
   ↓ 15 minutes
4. T1083 (File and Directory Discovery)
   ↓ 30 minutes
5. T1486 (Data Encrypted for Impact)
```

#### Insider Threat Chain
```
1. T1078.002 (Domain Accounts - Legitimate Access)
   ↓ 2 hours
2. T1087.002 (Domain Account Discovery)
   ↓ 30 minutes
3. T1069.002 (Domain Groups Discovery)
   ↓ 45 minutes
4. T1005 (Data from Local System)
   ↓ 1 hour
5. T1048.003 (Exfiltration Over Unencrypted Protocol)
```

## 📊 Generated Alert Structure

### MITRE-Enhanced Alert Example
```json
{
  "@timestamp": "2025-06-10T14:30:00.000Z",
  "kibana.alert.rule.name": "MITRE T1566.001 Spearphishing Attachment Detection",
  "kibana.alert.rule.description": "Detected spearphishing attachment delivery matching T1566.001",
  "kibana.alert.severity": "high",
  "kibana.alert.risk_score": 85,
  
  "threat.technique.id": ["T1566.001"],
  "threat.technique.name": ["Spearphishing Attachment"],
  "threat.tactic.id": ["TA0001"],
  "threat.tactic.name": ["Initial Access"],
  
  "threat.attack_chain.id": "chain-apt-2025-001",
  "threat.attack_chain.severity": "high",
  "threat.attack_chain.length": 5,
  "threat.attack_chain.position": 1,
  
  "event.category": ["malware"],
  "event.action": "email_attachment_opened",
  "event.outcome": "success",
  
  "host.name": "workstation-01",
  "user.name": "john.doe",
  "user.domain": "corporate.local",
  
  "file.name": "invoice.pdf.exe",
  "file.hash.sha256": "abc123...",
  "file.size": 2048576,
  
  "process.name": "outlook.exe",
  "process.pid": 1234,
  "process.parent.name": "explorer.exe"
}
```

### Attack Chain Correlation Fields
```json
{
  "threat.attack_chain.id": "chain-apt-2025-001",
  "threat.attack_chain.stage": "initial_access",
  "threat.attack_chain.sequence": 1,
  "threat.attack_chain.total_stages": 8,
  "threat.attack_chain.next_expected": ["T1204.002", "T1059.003"],
  "threat.attack_chain.timeline": {
    "expected_next_min": 5,
    "expected_next_max": 30
  }
}
```

## 🎯 Risk Scoring

### Dynamic Risk Calculation
The generator uses sophisticated risk scoring based on:

1. **Technique Severity**
   - Critical: T1055, T1078, T1027 (Score: 85-100)
   - High: T1566, T1204, T1021 (Score: 65-84)
   - Medium: T1083, T1087, T1069 (Score: 35-64)
   - Low: T1012, T1082, T1016 (Score: 1-34)

2. **Attack Chain Context**
   - Chain length multiplier
   - Tactic progression bonus
   - Temporal correlation factor

3. **Environmental Factors**
   - Asset criticality
   - User privilege level
   - Time of activity

### Risk Scoring Examples
```json
{
  "single_technique": {
    "technique": "T1566.001",
    "base_score": 70,
    "final_score": 70,
    "severity": "high"
  },
  "attack_chain": {
    "techniques": ["T1566.001", "T1055.001", "T1027"],
    "base_score": 85,
    "chain_multiplier": 1.2,
    "final_score": 102,
    "capped_score": 100,
    "severity": "critical"
  }
}
```

## 🔍 Detection Testing

### Coverage Analysis
```bash
# Generate comprehensive technique coverage
yarn start generate-alerts -n 500 --ai --mitre --sub-techniques

# Test specific tactic coverage
for tactic in TA0001 TA0002 TA0003 TA0004 TA0005; do
  yarn start generate-alerts -n 50 --ai --mitre --focus-tactic $tactic
done
```

### Validation Queries
```elasticsearch
# Check MITRE technique coverage
GET .alerts-security.alerts-*/_search
{
  "size": 0,
  "aggs": {
    "techniques": {
      "terms": {
        "field": "threat.technique.id",
        "size": 100
      }
    },
    "tactics": {
      "terms": {
        "field": "threat.tactic.id",
        "size": 20
      }
    }
  }
}

# Attack chain analysis
GET .alerts-security.alerts-*/_search
{
  "query": {
    "exists": {
      "field": "threat.attack_chain.id"
    }
  },
  "size": 0,
  "aggs": {
    "chain_lengths": {
      "histogram": {
        "field": "threat.attack_chain.length",
        "interval": 1
      }
    }
  }
}
```

## 🎪 Advanced Scenarios

### 1. Red Team Exercise
```bash
# Comprehensive adversary simulation
yarn start generate-campaign apt --ai --mitre --attack-chains --sub-techniques \
  --complexity expert --events 1000 --targets 200
```

### 2. SOC Training
```bash
# Progressive difficulty training
yarn start generate-campaign apt --complexity low --events 50 --space soc-training-basic
yarn start generate-campaign apt --complexity medium --events 100 --space soc-training-intermediate  
yarn start generate-campaign apt --complexity high --events 200 --space soc-training-advanced
```

### 3. Detection Rule Validation
```bash
# Test each tactic systematically
tactics=("TA0001" "TA0002" "TA0003" "TA0004" "TA0005")
for tactic in "${tactics[@]}"; do
  yarn start generate-alerts -n 100 --ai --mitre --sub-techniques \
    --space "detection-testing-${tactic}"
done
```

### 4. Threat Hunt Training
```bash
# Generate subtle attack indicators
yarn start generate-campaign insider --ai --mitre --sub-techniques \
  --complexity high --events 300 --time-pattern business_hours
```

## 📈 Extending MITRE Coverage

### Adding New Techniques
Edit `src/mappings/mitre_attack.json`:

```json
{
  "techniques": {
    "T1195": {
      "name": "Supply Chain Compromise",
      "description": "Adversaries may compromise third-party software",
      "tactics": ["TA0001"],
      "subTechniques": ["T1195.001", "T1195.002", "T1195.003"],
      "chainNext": ["T1059", "T1204"],
      "riskScore": 85
    }
  },
  "subTechniques": {
    "T1195.001": {
      "name": "Compromise Software Dependencies and Development Tools",
      "parent": "T1195"
    },
    "T1195.002": {
      "name": "Compromise Software Supply Chain",
      "parent": "T1195"
    }
  }
}
```

### Custom Attack Chains
```json
{
  "customChains": {
    "financial_apt": {
      "name": "Financial Sector APT",
      "techniques": [
        "T1566.002",
        "T1204.001", 
        "T1547.001",
        "T1055.001",
        "T1083",
        "T1005",
        "T1041"
      ],
      "timingPattern": "stealth",
      "severity": "critical"
    }
  }
}
```

## 🔧 Troubleshooting

### Common Issues

#### Missing MITRE Fields
```bash
# Verify MITRE data loading
yarn start test-mitre -n 5

# Check configuration
cat config.json | grep -A 10 "mitre"
```

#### Invalid Technique IDs
```bash
# Validate technique IDs against MITRE framework
# Check src/mappings/mitre_attack.json for valid IDs
```

#### Attack Chain Errors
```bash
# Debug attack chain generation
DEBUG_AI_RESPONSES=true yarn start generate-alerts -n 5 --ai --mitre --attack-chains
```

### Performance Issues
```json
{
  "mitre": {
    "enableCaching": true,
    "maxCacheSize": 1000,
    "optimizeChainGeneration": true,
    "limitTechniquesPerAlert": 3
  }
}
```

## 📊 Analytics and Reporting

### MITRE Coverage Report
```bash
# Generate comprehensive coverage report
yarn start generate-alerts -n 1000 --ai --mitre --sub-techniques --report-coverage
```

### Chain Analysis
```bash
# Analyze attack chain effectiveness
yarn start generate-campaign apt --ai --mitre --attack-chains --events 500 --analyze-chains
```

### Detection Gaps
```elasticsearch
# Identify techniques with low detection rates
GET .alerts-security.alerts-*/_search
{
  "size": 0,
  "aggs": {
    "techniques_by_detection": {
      "terms": {
        "field": "threat.technique.id",
        "size": 100
      },
      "aggs": {
        "detected": {
          "filter": {
            "term": {
              "kibana.alert.workflow_status": "acknowledged"
            }
          }
        }
      }
    }
  }
}
```

## 🎯 Best Practices

### 1. Gradual Implementation
- Start with basic MITRE integration
- Add sub-techniques progressively
- Enable attack chains for advanced testing
- Monitor performance and adjust

### 2. Comprehensive Testing
- Cover all relevant tactics
- Test attack chain progressions
- Validate detection rule coverage
- Regular technique updates

### 3. Realistic Scenarios
- Use appropriate complexity levels
- Enable temporal correlation
- Match threat actor behaviors
- Include environmental context

### 4. Continuous Improvement
- Regular MITRE framework updates
- Feedback-driven enhancements
- Detection gap analysis
- Community contribution
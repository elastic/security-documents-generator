# Advanced Attack Campaign Generation

Generate sophisticated, realistic multi-stage cyber attack scenarios for security testing and training.

## 🎭 Campaign Types

### 🎯 APT (Advanced Persistent Threat)
Long-term targeted attacks with sophisticated lateral movement.

```bash
# Basic APT simulation
yarn start generate-campaign apt --ai --mitre --events 50

# Advanced APT with attack chains
yarn start generate-campaign apt --ai --mitre --attack-chains --sub-techniques --events 100

# Enterprise-scale APT
yarn start generate-campaign apt --ai --mitre --attack-chains --complexity expert --events 500 --targets 100
```

**Generated Attack Flow:**
1. **Initial Access** (T1566.001 - Spearphishing)
2. **Execution** (T1204.002 - User Execution)
3. **Persistence** (T1547.001 - Registry Run Keys)
4. **Privilege Escalation** (T1055.001 - DLL Injection)
5. **Defense Evasion** (T1027 - Obfuscated Files)
6. **Discovery** (T1083 - File Discovery)
7. **Lateral Movement** (T1021.001 - Remote Desktop)
8. **Collection** (T1005 - Data from Local System)
9. **Exfiltration** (T1041 - C2 Channel)

### 🔒 Ransomware Campaigns
Encryption-based attacks with backup disruption and ransom demands.

```bash
# Basic ransomware simulation
yarn start generate-campaign ransomware --ai --mitre --events 75

# Multi-stage ransomware with network spread
yarn start generate-campaign ransomware --ai --mitre --attack-chains --events 200 --targets 50

# Enterprise ransomware scenario
yarn start generate-campaign ransomware --ai --mitre --attack-chains --sub-techniques --complexity high --events 300
```

**Example Ransomware Groups:**
- **LockBit**: Supply chain focused attacks
- **Conti**: Enterprise targeting with data theft
- **REvil/Sodinokibi**: Double extortion campaigns
- **BlackCat/ALPHV**: Cross-platform attacks

**Attack Stages:**
1. **Initial Compromise** (T1566 - Phishing, T1190 - Exploit Public-Facing App)
2. **Reconnaissance** (T1083 - File Discovery, T1087 - Account Discovery)
3. **Lateral Movement** (T1021 - Remote Services, T1550 - Use Alternate Auth)
4. **Defense Evasion** (T1562.001 - Disable Security Tools)
5. **Impact** (T1486 - Data Encryption, T1490 - Inhibit Recovery)

### 👤 Insider Threat Campaigns
Malicious employee activities and privilege abuse scenarios.

```bash
# Privilege abuse simulation
yarn start generate-campaign insider --ai --mitre --events 60

# Data exfiltration scenario
yarn start generate-campaign insider --ai --mitre --sub-techniques --events 120

# Comprehensive insider threat
yarn start generate-campaign insider --ai --mitre --attack-chains --complexity high --events 150
```

**Insider Threat Types:**
- **Malicious Insiders**: Intentional data theft or sabotage
- **Compromised Insiders**: External actor using legitimate credentials
- **Negligent Insiders**: Unintentional security violations

**Behavioral Indicators:**
1. **After-hours Access** (Unusual login times)
2. **Excessive Data Access** (Beyond normal job requirements)
3. **Privilege Escalation** (T1068 - Exploitation for Privilege Escalation)
4. **Data Collection** (T1005 - Data from Local System)
5. **Exfiltration** (T1048 - Exfiltration Over Alternative Protocol)

### 🦠 Malware Campaigns
Virus outbreaks, trojan activities, and persistent malware infections.

```bash
# Malware outbreak simulation
yarn start generate-campaign malware --ai --mitre --events 100

# Advanced persistent malware
yarn start generate-campaign malware --ai --mitre --attack-chains --events 200

# Multi-variant malware campaign
yarn start generate-campaign malware --ai --mitre --sub-techniques --complexity expert --events 400
```

**Malware Families Simulated:**
- **Banking Trojans**: Credential theft and financial fraud
- **RATs (Remote Access Trojans)**: Persistent backdoor access
- **Cryptominers**: Resource hijacking for cryptocurrency
- **Botnets**: Distributed command and control

### 📧 Phishing Campaigns
Email-based attacks for credential theft and initial access.

```bash
# Email phishing simulation
yarn start generate-campaign phishing --ai --mitre --events 80

# Spear phishing with social engineering
yarn start generate-campaign phishing --ai --mitre --sub-techniques --events 150

# Business email compromise (BEC)
yarn start generate-campaign phishing --ai --mitre --attack-chains --complexity high --events 250
```

**Phishing Types:**
- **Credential Harvesting**: Fake login pages
- **Malware Delivery**: Malicious attachments/links
- **Business Email Compromise**: CEO fraud and wire transfers
- **Social Engineering**: Pretexting and psychological manipulation

## 🎚️ Complexity Levels

### Low Complexity
- Basic attack patterns
- Single-stage attacks
- Limited evasion techniques
- Straightforward indicators

```bash
yarn start generate-campaign apt --complexity low --events 30
```

### Medium Complexity (Default)
- Multi-stage progression
- Moderate evasion techniques
- Realistic timing patterns
- Mixed attack vectors

```bash
yarn start generate-campaign ransomware --complexity medium --events 100
```

### High Complexity
- Advanced evasion techniques
- Multiple attack vectors
- Sophisticated correlation
- Enterprise-level scenarios

```bash
yarn start generate-campaign insider --complexity high --events 200
```

### Expert Complexity
- Nation-state level sophistication
- Advanced persistent threats
- Zero-day simulation
- Maximum correlation depth

```bash
yarn start generate-campaign apt --complexity expert --events 500
```

## ⏱️ Temporal Patterns

### Attack Simulation Pattern
Realistic attack timing with burst activities and dormant periods.

```bash
yarn start generate-campaign apt --time-pattern attack_simulation --events 150
```

**Characteristics:**
- Burst activities during reconnaissance
- Dormant periods to avoid detection
- Late-night/weekend activities
- Realistic attack progression timing

### Business Hours Pattern
Attacks during normal business operations.

```bash
yarn start generate-campaign insider --time-pattern business_hours --events 100
```

### Weekend Heavy Pattern
Attacks during low-supervision periods.

```bash
yarn start generate-campaign ransomware --time-pattern weekend_heavy --events 80
```

## 🎯 Target Configuration

### Host-Centric Campaigns
Focus on specific host targets with lateral movement.

```bash
yarn start generate-campaign apt --targets 25 --events 200
```

### User-Centric Campaigns
Focus on user behavior and privilege abuse.

```bash
yarn start generate-campaign insider --targets 15 --events 150
```

### Large-Scale Enterprise
Simulate attacks across large organizations.

```bash
yarn start generate-campaign ransomware --targets 200 --events 1000 --large-scale
```

## 🔗 Attack Chain Configuration

### Enable Attack Chains
Create realistic multi-technique progressions.

```bash
yarn start generate-campaign apt --attack-chains --events 100
```

**Attack Chain Benefits:**
- Realistic technique progression
- Temporal correlation between techniques
- Enhanced detection testing
- Training scenario authenticity

### Sub-Techniques Integration
Include detailed MITRE sub-techniques for granular detection.

```bash
yarn start generate-campaign malware --sub-techniques --attack-chains --events 150
```

## 📊 Campaign Output Structure

### Campaign Metadata
Each campaign generates structured metadata:

```json
{
  "campaign": {
    "id": "apt-campaign-2025-06-10",
    "name": "Operation Aurora",
    "type": "apt",
    "threat_actor": "Comment Crew",
    "complexity": "high",
    "stages": 8,
    "duration": {
      "start": "2025-06-03T00:00:00Z",
      "end": "2025-06-10T23:59:59Z"
    }
  }
}
```

### Attack Stages
Structured progression through attack lifecycle:

```json
{
  "stages": [
    {
      "name": "Initial Access",
      "tactic": "TA0001",
      "techniques": ["T1566.001", "T1566.002"],
      "start_time": "2025-06-03T09:15:00Z",
      "end_time": "2025-06-03T11:30:00Z",
      "objectives": ["Establish foothold", "Deliver payload"]
    }
  ]
}
```

### Generated Alerts
Rich MITRE-mapped security alerts:

```json
{
  "kibana.alert.rule.name": "MITRE T1566.001 Spearphishing Detection",
  "threat.technique.id": ["T1566.001"],
  "threat.technique.name": ["Spearphishing Attachment"],
  "threat.tactic.id": ["TA0001"],
  "threat.tactic.name": ["Initial Access"],
  "threat.attack_chain.id": "chain-apt-2025-001",
  "threat.attack_chain.severity": "high",
  "campaign.id": "apt-campaign-2025-06-10",
  "campaign.type": "apt",
  "campaign.threat_actor": "Comment Crew",
  "kibana.alert.severity": "high",
  "kibana.alert.risk_score": 85
}
```

## 🎪 Advanced Scenarios

### SOC Training Exercise
Multi-campaign environment for analyst training.

```bash
# Generate multiple overlapping campaigns
yarn start generate-campaign apt --ai --mitre --attack-chains --events 200 --space soc-training
yarn start generate-campaign insider --ai --mitre --sub-techniques --events 100 --space soc-training
yarn start generate-campaign malware --ai --mitre --events 150 --space soc-training
```

### Red Team Exercise
Sophisticated adversary simulation.

```bash
yarn start generate-campaign apt --ai --mitre --attack-chains --sub-techniques --complexity expert --events 500 --targets 100
```

### Detection Rule Testing
Comprehensive MITRE technique coverage.

```bash
# Test all implemented techniques
yarn start generate-campaign apt --ai --mitre --sub-techniques --events 300
yarn start generate-campaign ransomware --ai --mitre --sub-techniques --events 300
yarn start generate-campaign insider --ai --mitre --sub-techniques --events 300
```

### Performance Testing
Large-scale generation for system stress testing.

```bash
yarn start generate-campaign malware --ai --mitre --large-scale --events 5000 --targets 500
```

## 🔍 Campaign Analysis

### Monitoring Generated Campaigns

1. **Kibana Security App**
   - Review generated alerts by campaign ID
   - Analyze attack progression timelines
   - Validate MITRE technique coverage

2. **SIEM Integration**
   - Correlation rule testing
   - Detection efficacy measurement
   - False positive analysis

3. **Threat Hunting**
   - Hunt for campaign indicators
   - Practice investigation workflows
   - Validate detection gaps

### Key Metrics to Track

- **Campaign Coverage**: Percentage of MITRE techniques covered
- **Detection Rate**: Alerts properly detected by security tools
- **False Positive Rate**: Benign activities flagged as malicious
- **Time to Detection**: Speed of security team response
- **Investigation Depth**: Completeness of threat analysis

## 🎯 Best Practices

### Campaign Planning
1. **Start Small**: Begin with 50-100 events
2. **Use Realistic Timing**: Enable attack_simulation pattern
3. **Layer Complexity**: Combine multiple campaign types
4. **Test Progressively**: Increase complexity over time

### Detection Testing
1. **Cover All Tactics**: Use comprehensive MITRE mapping
2. **Include Sub-Techniques**: Test granular detection rules
3. **Enable Attack Chains**: Validate correlation capabilities
4. **Mix Campaign Types**: Test diverse attack scenarios

### Training Scenarios
1. **Realistic Timelines**: Use business_hours or attack_simulation patterns
2. **Mixed Severity**: Include both high and low-severity events
3. **Progressive Difficulty**: Start with low complexity campaigns
4. **Document Scenarios**: Maintain training exercise documentation

### Performance Optimization
1. **Use Large-Scale Mode**: For >1000 events
2. **Adjust Batch Sizes**: Based on system capabilities
3. **Monitor Resource Usage**: Watch memory and CPU utilization
4. **Enable Caching**: Reduce redundant API calls

## 🚨 Troubleshooting

### Common Issues

**Campaign Generation Timeout**
```bash
# Reduce event count or complexity
yarn start generate-campaign apt --events 50 --complexity medium
```

**Memory Issues with Large Campaigns**
```bash
# Enable large-scale optimizations
yarn start generate-campaign ransomware --large-scale --events 2000
```

**AI API Rate Limiting**
```bash
# Increase request delays in config.json
"requestDelayMs": 200
```

### Debug Mode
Enable debug logging for campaign troubleshooting:

```bash
DEBUG_AI_RESPONSES=true yarn start generate-campaign apt --ai --mitre --events 10
```

## 📈 Extending Campaign Types

### Adding Custom Campaign Types
Extend the attack simulation engine with custom scenarios by modifying:

1. **Attack Scenarios**: `src/attack_scenarios/`
2. **Simulation Engine**: `src/services/attack_simulation_engine.ts`
3. **Campaign Commands**: `src/index.ts`

### Custom Threat Actors
Add your own threat actor profiles in the campaign configuration:

```json
{
  "customThreatActors": {
    "CUSTOM_APT": {
      "name": "Custom APT Group",
      "sophistication": "expert",
      "targetSectors": ["finance", "healthcare"],
      "techniques": ["T1566.001", "T1055.001", "T1027"]
    }
  }
}
```
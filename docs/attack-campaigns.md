# Realistic Attack Campaign Generation

Generate complete security scenarios with forensic evidence chains that simulate real-world cyber attacks from source logs to triggered alerts.

## 🎭 Realistic Campaign Mode ⭐ NEW

### **Complete Log→Alert Pipeline**
Generate source logs that trigger realistic security alerts, creating complete forensic scenarios for training and testing.

```bash
# Complete ransomware attack with realistic detection
yarn start generate-campaign ransomware --realistic --mitre --detection-rate 0.8

# Stealth APT with low detection rate
yarn start generate-campaign apt --realistic --mitre --detection-rate 0.3 --logs-per-stage 5

# Insider threat with gradual privilege abuse
yarn start generate-campaign insider --realistic --mitre --logs-per-stage 4 --detection-rate 0.5
```

### **Key Features:**
- **Source Logs First**: Generate Windows/Linux logs that tell the attack story
- **Realistic Detection**: Configure what percentage of activities get detected (0.0-1.0)
- **Evidence Chains**: Complete forensic timeline from initial access to detection
- **Investigation Guides**: Automated investigation steps for security analysts
- **Missed Activities**: Realistic gaps in detection (like real SOCs)

### **Example Output:**
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

## 🎯 Campaign Types

| Type | Attack Stages | Key Characteristics | Recommended Detection Rate |
|------|---------------|---------------------|---------------------------|
| **APT** | 2-4 stages | Stealth, lateral movement, long-term | Low (0.2-0.4) |
| **Ransomware** | 8 stages | Fast progression, high impact | High (0.6-0.9) |
| **Insider** | 3-6 stages | Privilege abuse, data exfiltration | Medium (0.3-0.6) |
| **Supply Chain** | 4-7 stages | External compromise, multiple victims | Medium (0.4-0.7) |

### 🔒 Ransomware Campaigns
High-impact encryption attacks with clear detection patterns.

```bash
# Basic realistic ransomware (high detection rate)
yarn start generate-campaign ransomware --realistic --mitre --detection-rate 0.8

# Stealth ransomware (lower detection)
yarn start generate-campaign ransomware --realistic --mitre --detection-rate 0.4 --logs-per-stage 6
```

**Attack Progression:**
1. **Initial Access** → Email logs, DNS queries, HTTP traffic
2. **Persistence** → Registry modifications, scheduled tasks
3. **Discovery** → File system enumeration, network scanning
4. **Credential Access** → LSASS dumps, password attacks
5. **Lateral Movement** → RDP sessions, SMB connections
6. **Collection** → File access, data compression
7. **Exfiltration** → Network uploads, C2 communications
8. **Impact** → File encryption, backup deletion

### 🎯 APT Campaigns
Long-term stealth attacks with minimal detection.

```bash
# Stealth APT with low detection
yarn start generate-campaign apt --realistic --mitre --detection-rate 0.3 --logs-per-stage 3

# Well-monitored environment
yarn start generate-campaign apt --realistic --mitre --detection-rate 0.7 --logs-per-stage 4
```

**Attack Characteristics:**
- Long dormancy periods
- Minimal noise generation
- Advanced evasion techniques
- Targeted lateral movement

### 👤 Insider Threats
Gradual privilege abuse and data exfiltration.

```bash
# Malicious insider scenario
yarn start generate-campaign insider --realistic --mitre --detection-rate 0.4

# Negligent insider
yarn start generate-campaign insider --realistic --mitre --detection-rate 0.6 --logs-per-stage 2
```

**Behavioral Patterns:**
- After-hours access
- Excessive data access
- Privilege escalation attempts
- Unusual file operations

## 🛠️ Realistic Mode Configuration

### **Detection Rate Settings**
Controls what percentage of suspicious activities trigger alerts.

```bash
# High-security environment (most activities detected)
--detection-rate 0.8

# Typical SOC environment (moderate detection)
--detection-rate 0.5

# Under-resourced SOC (low detection)
--detection-rate 0.3

# Advanced persistent threat (minimal detection)
--detection-rate 0.2
```

### **Logs Per Stage**
Controls how many source logs are generated for each attack stage.

```bash
# Minimal logging
--logs-per-stage 2

# Standard logging
--logs-per-stage 4

# Verbose logging
--logs-per-stage 8

# Comprehensive logging
--logs-per-stage 12
```

### **Time Patterns**
Realistic attack timing patterns.

```bash
# Attack during business hours
yarn start generate-campaign insider --realistic --time-pattern business_hours

# Weekend attack (low staffing)
yarn start generate-campaign ransomware --realistic --time-pattern weekend_heavy

# Realistic attack progression
yarn start generate-campaign apt --realistic --time-pattern attack_simulation
```

## 🔍 Investigation & Analysis

### **In Kibana:**
1. **Source Logs**: Filter by `logs-*` to see all generated logs
2. **Security Alerts**: Check Security app for triggered alerts
3. **Timeline Analysis**: View chronological attack progression
4. **Correlation**: Follow investigation guide recommendations

### **Key Investigation Queries:**
```
# View all logs from affected hosts
host.name:(ws-123 OR srv-456) AND @timestamp:[now-24h TO now]

# Find authentication events around alert times
event.category:authentication AND event.outcome:success

# Look for lateral movement indicators
event.category:network AND destination.ip:10.* AND source.ip:external

# Process execution chains
event.category:process AND event.type:start

# File modification activities
event.category:file AND (event.type:creation OR event.type:change)
```

### **Investigation Workflow:**
1. **Review Alerts**: Start with triggered security alerts
2. **Timeline Analysis**: Build chronological event sequence
3. **Pivot Analysis**: Follow related logs by host/user/process
4. **Evidence Collection**: Document the complete attack chain
5. **Gap Analysis**: Identify what activities were missed

## 📊 Training Scenarios

### **SOC Analyst Training**
```bash
# Beginner: Clear attack with high detection
yarn start generate-campaign ransomware --realistic --detection-rate 0.8 --logs-per-stage 3

# Intermediate: Mixed visibility
yarn start generate-campaign apt --realistic --detection-rate 0.5 --logs-per-stage 4

# Advanced: Stealth attack with minimal detection
yarn start generate-campaign apt --realistic --detection-rate 0.2 --logs-per-stage 6
```

### **Detection Rule Testing**
```bash
# Test specific MITRE techniques
yarn start generate-campaign ransomware --realistic --mitre --sub-techniques

# Validate correlation rules
yarn start generate-campaign apt --realistic --mitre --attack-chains

# Performance testing
yarn start generate-campaign insider --realistic --events 50 --targets 20
```

### **Incident Response Exercises**
```bash
# Fast-moving threat (immediate response required)
yarn start generate-campaign ransomware --realistic --detection-rate 0.9

# Long-term investigation (APT hunting)
yarn start generate-campaign apt --realistic --detection-rate 0.3 --logs-per-stage 8
```

## 🎯 Best Practices

### **Realistic Scenario Design**
1. **Match Your Environment**: Use detection rates that reflect your SOC's capabilities
2. **Progressive Training**: Start with high detection rates, reduce over time
3. **Diverse Scenarios**: Mix different campaign types and complexity levels
4. **Time Correlation**: Use realistic time patterns for training exercises

### **Detection Testing**
1. **Baseline Testing**: Start with known detection capabilities
2. **Gap Analysis**: Use low detection rates to find blind spots
3. **Rule Validation**: Test specific MITRE techniques with targeted campaigns
4. **Performance Impact**: Monitor system performance during large scenarios

### **Investigation Training**
1. **Complete Stories**: Use realistic mode for end-to-end scenarios
2. **Evidence Chains**: Follow generated investigation guides
3. **Pivot Practice**: Use Kibana queries to explore related logs
4. **Documentation**: Record investigation findings and methodologies

## 🚨 Troubleshooting

### **No Alerts Generated**
```bash
# Increase detection rate
yarn start generate-campaign apt --realistic --detection-rate 0.8

# Increase logs per stage
yarn start generate-campaign apt --realistic --logs-per-stage 6
```

### **Too Many Alerts**
```bash
# Reduce detection rate for more realistic scenario
yarn start generate-campaign ransomware --realistic --detection-rate 0.4
```

### **Performance Issues**
```bash
# Reduce logs per stage for large campaigns
yarn start generate-campaign apt --realistic --events 100 --logs-per-stage 2

# Use smaller batch sizes
yarn start generate-campaign ransomware --realistic --batch-size 50
```

## 📈 Advanced Features

### **Custom Detection Scenarios**
```bash
# Simulate specific detection gaps
yarn start generate-campaign apt --realistic --detection-rate 0.1 --logs-per-stage 10

# Test alert fatigue scenarios
yarn start generate-campaign ransomware --realistic --detection-rate 0.9 --events 200
```

### **Multi-Campaign Environments**
```bash
# Overlapping campaigns for complex scenarios
yarn start generate-campaign apt --realistic --space training-env &
yarn start generate-campaign insider --realistic --space training-env &
wait
```

### **Integration with Detection Rules**
The realistic mode generates logs that would trigger common detection rules:
- Process execution patterns
- Network connection anomalies
- File system modifications
- Authentication failures
- Privilege escalation attempts

---

**🎭 Transform your security testing with realistic attack scenarios!** Start with `yarn start generate-campaign ransomware --realistic --mitre` and experience complete forensic evidence chains.
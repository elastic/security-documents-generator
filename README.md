# Security Documents Generator

A powerful tool for generating realistic security scenarios with complete forensic evidence chains. Features AI-powered data generation, MITRE ATT&CK integration, and realistic attack campaign simulation with source logs that trigger alerts.

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

3. **Generate your first realistic attack scenario:**
   ```bash
   # Complete ransomware attack with realistic logs → alerts pipeline
   yarn start generate-campaign ransomware --realistic --mitre --detection-rate 0.6
   ```

## 🎯 Core Features

### 🎭 **Realistic Attack Scenarios** ⭐ NEW
- **Complete Log→Alert Pipeline**: Source logs generate realistic security alerts
- **Forensic Evidence Chains**: Complete attack stories from initial access to detection
- **Configurable Detection**: Adjust what percentage of activities get detected (0.0-1.0)
- **Investigation Ready**: Automated investigation guides for security analysts

### 🤖 **AI-Powered Generation**
- **Multiple AI Providers**: OpenAI, Azure OpenAI, Claude (Anthropic)
- **Context-Aware Data**: Realistic security scenarios based on real-world patterns
- **Smart Fallbacks**: Automatic failover between providers

### ⚔️ **MITRE ATT&CK Integration**
- **Complete Framework**: All tactics, techniques, and sub-techniques
- **Attack Progression**: Multi-stage campaigns with proper technique sequencing
- **Dynamic Risk Scoring**: Severity based on technique combinations

## 📋 Essential Commands

| Command | Description | Example |
|---------|-------------|---------|
| **`generate-campaign --realistic`** | **🌟 Complete attack scenarios** | `yarn start generate-campaign apt --realistic --mitre` |
| `generate-campaign` | Multi-stage attack campaigns | `yarn start generate-campaign ransomware --mitre` |
| `generate-correlated` | Alerts with supporting logs | `yarn start generate-correlated -n 20 --mitre` |
| `generate-logs` | Realistic source logs | `yarn start generate-logs -n 1000 --types system,auth` |
| `generate-alerts` | AI-enhanced security alerts | `yarn start generate-alerts -n 100 --mitre` |

### 🗑️ Cleanup Commands
| Command | Description |
|---------|-------------|
| `delete-alerts` | Clean up generated alerts |
| `delete-events` | Clean up generated events |
| `delete-logs` | Clean up source logs |
| `delete-rules` | Clean up detection rules |

## 🎪 Realistic Attack Scenarios

### **🎭 Complete SOC Training Scenarios**
```bash
# Realistic APT campaign: 18 source logs → 0 detected alerts (stealth attack)
yarn start generate-campaign apt --realistic --mitre --logs-per-stage 3 --detection-rate 0.3

# Ransomware outbreak: 38 source logs → 12 detected alerts (high visibility)
yarn start generate-campaign ransomware --realistic --mitre --logs-per-stage 2 --detection-rate 0.8

# Insider threat: Gradual privilege abuse with low detection
yarn start generate-campaign insider --realistic --mitre --detection-rate 0.2
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

Create `config.json` with your preferred AI provider:

### OpenAI
```json
{
  "elastic": { "node": "https://your-cluster.com", "apiKey": "..." },
  "kibana": { "node": "https://your-kibana.com", "apiKey": "..." },
  "useAI": true,
  "openaiApiKey": "sk-..."
}
```

### Claude (Anthropic)
```json
{
  "elastic": { "node": "https://your-cluster.com", "apiKey": "..." },
  "kibana": { "node": "https://your-kibana.com", "apiKey": "..." },
  "useAI": true,
  "useClaudeAI": true,
  "claudeApiKey": "sk-ant-..."
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
| [AI Integration](docs/ai-integration.md) | AI providers and setup |
| [Attack Campaigns](docs/attack-campaigns.md) | Campaign generation guide |
| [MITRE ATT&CK](docs/mitre-attack.md) | Framework integration |
| [Configuration](docs/configuration.md) | System configuration |

## 🎉 Benefits

### **For Security Teams:**
- **Realistic Training**: Complete attack scenarios with proper evidence chains
- **Detection Testing**: Validate rules against realistic attack patterns
- **SOC Training**: Practice investigation workflows on believable data

### **For Developers:**
- **Integration Testing**: Test security tools with realistic data volumes
- **Performance Testing**: Validate systems under realistic security loads
- **Rule Development**: Create detection rules with proper test data

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests and documentation
5. Submit a pull request

## 📝 License

MIT License - see [LICENSE](LICENSE) for details.

---

**🎭 Ready to simulate realistic security incidents?** Start with `yarn start generate-campaign ransomware --realistic --mitre` and experience complete attack scenarios with forensic evidence chains!
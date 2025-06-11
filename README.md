# Security Documents Generator

> **Note:** For compatibility with Elasticsearch 8.18 and below, checkout the tag `8.18-compatibility`.

A powerful tool for generating realistic security data for testing and development. Features AI-powered data generation, MITRE ATT&CK integration, and sophisticated attack campaign simulation.

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

3. **Generate your first campaign:**
   ```bash
   # Generate a realistic ransomware attack campaign
   yarn start generate-campaign ransomware --mitre --events 20
   ```

## 📋 Core Commands

| Command | Description | Example |
|---------|-------------|---------|
| `generate-campaign` | **NEW** AI-powered attack campaigns | `yarn start generate-campaign apt --mitre --events 50` |
| `generate-alerts` | AI-enhanced security alerts | `yarn start generate-alerts -n 100 --mitre` |
| `generate-events` | AI-generated security events | `yarn start generate-events 100 --mitre` |
| `generate-graph` | AI-powered entity graphs | `yarn start generate-graph --users 100` |
| `rules` | Detection rules with events | `yarn start rules -r 10 -e 100` |
| `test-mitre` | Test MITRE AI integration | `yarn start test-mitre -n 10` |
| `delete-alerts` | Clean up generated alerts | `yarn start delete-alerts -s my-space` |
| `delete-events` | Clean up generated events | `yarn start delete-events` |
| `delete-rules` | Clean up detection rules | `yarn start delete-rules -s my-space` |

## 🎯 Key Features

### 🤖 **AI-Powered Generation**
- **Multiple AI Providers**: OpenAI, Azure OpenAI, Claude (Anthropic)
- **Realistic Data**: Context-aware security alerts and events
- **Smart Fallbacks**: Automatic failover between providers

### ⚔️ **MITRE ATT&CK Integration**
- **Complete Framework**: All tactics, techniques, and sub-techniques
- **Attack Chains**: Multi-stage attack progression
- **Dynamic Risk Scoring**: Severity based on technique combinations

### 🎭 **Attack Campaign Simulation**
- **Campaign Types**: APT, Ransomware, Insider Threats, Malware, Phishing
- **Realistic Scenarios**: Based on real-world attack patterns
- **Temporal Correlation**: Events follow realistic attack timelines

### ⚡ **Performance & Scale**
- **Large-Scale Generation**: Optimized for 1000+ events
- **Parallel Processing**: Concurrent batch operations
- **Smart Caching**: Reduced API costs and faster generation

## 📚 Documentation

| Topic | File | Description |
|-------|------|-------------|
| **AI Integration** | [docs/ai-integration.md](docs/ai-integration.md) | AI providers and setup |
| **Attack Campaigns** | [docs/attack-campaigns.md](docs/attack-campaigns.md) | AI-powered campaign generation |
| **MITRE ATT&CK** | [docs/mitre-attack.md](docs/mitre-attack.md) | AI-enhanced framework integration |
| **Configuration** | [docs/configuration.md](docs/configuration.md) | AI and system configuration |
| **API Reference** | [docs/api-reference.md](docs/api-reference.md) | AI command reference |

## 🎪 Example Scenarios

### **AI-Powered SOC Training**
```bash
# Multi-stage AI-generated APT campaign for analyst training
yarn start generate-campaign apt --claude --mitre --attack-chains --complexity high --events 200
```

### **AI-Enhanced Detection Testing**
```bash
# Test MITRE technique coverage with AI realism
yarn start generate-alerts -n 500 --claude --mitre --sub-techniques --large-scale
```

### **AI-Driven Incident Response Exercise**
```bash
# Realistic AI-generated ransomware scenario
yarn start generate-campaign ransomware --claude --mitre --time-pattern attack_simulation --events 100
```

## 🔧 Quick Configuration

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

| Type | Use Case | Key Features |
|------|----------|--------------|
| **APT** | Advanced persistent threats | Long-term campaigns, lateral movement |
| **Ransomware** | Encryption attacks | File encryption, backup disruption |
| **Insider** | Malicious employees | Privilege abuse, data exfiltration |
| **Malware** | Virus outbreaks | Process injection, persistence |
| **Phishing** | Email attacks | Credential theft, social engineering |

## 📊 Output Examples

Generated alerts include comprehensive MITRE mapping:

```json
{
  "kibana.alert.rule.name": "MITRE T1566.001 Spearphishing Detection",
  "threat.technique.id": ["T1566.001"],
  "threat.technique.name": ["Spearphishing Attachment"],
  "threat.tactic.id": ["TA0001"],
  "threat.tactic.name": ["Initial Access"],
  "threat.attack_chain.id": "chain-apt-2025",
  "campaign.type": "apt",
  "kibana.alert.severity": "high"
}
```

## 🛠️ Advanced Usage

### **AI-Optimized Performance**
```bash
yarn start generate-campaign apt --claude --large-scale --events 5000 --targets 200
```

### **AI with Custom Time Patterns**
```bash
yarn start generate-alerts -n 100 --mitre --start-date "7d" --time-pattern business_hours
```

### **AI Attack Chain Simulation**
```bash
yarn start generate-campaign ransomware --claude --mitre --attack-chains --sub-techniques --events 150
```

## 🗑️ Cleanup Commands

Remove all generated data with comprehensive cleanup commands:

```bash
# Delete all alerts from all spaces
yarn start delete-alerts

# Delete alerts from specific space only
yarn start delete-alerts -s security-testing

# Delete all events
yarn start delete-events

# Delete all detection rules and gap events
yarn start delete-rules

# Delete rules from specific space
yarn start delete-rules -s my-space
```

## 🔍 Monitoring & Validation

Check your generated data in Kibana Security:
- **Alerts by Rule Name**: Verify MITRE technique coverage
- **Timeline View**: Confirm attack progression
- **Host/User Analysis**: Check target distribution
- **Campaign Analysis**: Review attack narratives

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests and documentation
5. Submit a pull request

## 📝 License

MIT License - see [LICENSE](LICENSE) for details.

## 🆘 Support

- **Issues**: [GitHub Issues](https://github.com/elastic/security-documents-generator/issues)
- **Documentation**: [docs/](docs/) directory
- **Examples**: See documentation files for detailed examples

---

**⚡ Ready to simulate realistic security scenarios?** Start with `yarn start generate-campaign` and explore the power of AI-driven security data generation!
# 🧠 AI Assistant Knowledge Base Integration

## Overview

The Security Documents Generator creates comprehensive security knowledge documents specifically designed for Elastic AI Assistant integration. These documents use semantic text fields with ELSER v2 model and include AI-optimized suggested questions for enhanced security assistance.

## Quick Start

### Basic Knowledge Base Generation

```bash
# Generate 20 security knowledge documents
yarn start generate-knowledge-base -n 20

# Generate with MITRE ATT&CK integration
yarn start generate-knowledge-base -n 15 --mitre

# Generate specific security categories
yarn start generate-knowledge-base -n 25 --categories threat_intelligence,incident_response

# High-confidence public documents
yarn start generate-knowledge-base -n 30 --access-level public --confidence-threshold 0.8
```

### Cleanup

```bash
# Delete knowledge base documents
yarn start delete-knowledge-base

# Delete from specific namespace
yarn start delete-knowledge-base --namespace production
```

## Knowledge Base Categories

### Core Security Domains

| Category | Subcategories | Description |
|----------|---------------|-------------|
| **`threat_intelligence`** | `ioc_analysis`, `apt_profiles`, `campaign_tracking`, `attribution` | IOC analysis, APT profiles, campaign tracking, threat attribution |
| **`incident_response`** | `playbooks`, `procedures`, `escalation_matrix`, `communication` | IR playbooks, procedures, escalation matrices, communication templates |
| **`vulnerability_management`** | `cve_analysis`, `patch_management`, `assessment_reports` | CVE analysis, patch management, vulnerability assessment reports |
| **`network_security`** | `firewall_rules`, `ids_signatures`, `traffic_analysis`, `dns_security` | Firewall rules, IDS signatures, traffic analysis, DNS security |
| **`endpoint_security`** | `edr_rules`, `behavioral_patterns`, `process_monitoring` | EDR rules, behavioral patterns, process monitoring |
| **`cloud_security`** | `aws_security`, `azure_security`, `gcp_security`, `container_security` | Cloud provider security, container monitoring, serverless analytics |
| **`compliance`** | `pci_dss`, `sox`, `gdpr`, `hipaa`, `iso27001` | Compliance frameworks and audit procedures |
| **`forensics`** | `memory_analysis`, `disk_forensics`, `network_forensics`, `timeline_analysis` | Digital forensics analysis and procedures |
| **`malware_analysis`** | `static_analysis`, `dynamic_analysis`, `reverse_engineering`, `sandbox_reports` | Malware analysis techniques and reports |
| **`behavioral_analytics`** | `user_analytics`, `entity_analytics`, `anomaly_detection` | User and entity behavior analysis |

## Document Schema

### Core Document Fields

```json
{
  "@timestamp": "2024-12-27T14:30:00.000Z",
  "content": "# IOC Analysis\n\nThis analysis covers newly identified indicators...",
  "title": "IOC Analysis: MALWARE-7426",
  "summary": "IOC analysis for threat campaign with 15 indicators identified",
  "suggested_questions": [
    "What IOCs should we immediately block in our environment?",
    "How confident are we in the attribution of this threat?",
    "What detection rules should we create based on these indicators?"
  ],
  "category": "threat_intelligence",
  "subcategory": "ioc_analysis",
  "tags": ["security", "threat", "analysis", "ioc", "malware"],
  "source": "internal",
  "confidence": 0.87,
  "language": "en",
  "version": "2.1",
  "last_updated": "2024-12-27T14:30:00.000Z",
  "author": "Security Analyst",
  "access_level": "team"
}
```

### Security Classification

```json
{
  "security": {
    "domain": "cybersecurity",
    "classification": "internal",
    "severity": "high",
    "tlp": "amber"
  }
}
```

### MITRE ATT&CK Integration

```json
{
  "mitre": {
    "technique_ids": ["T1055", "T1027", "T1082"],
    "tactic_ids": ["TA0005", "TA0007", "TA0011"],
    "framework": "MITRE ATT&CK"
  }
}
```

## Elastic AI Assistant Configuration

### 1. Index Configuration

**Index Pattern:** `knowledge-base-security-*`

**Semantic Text Field:** `content` (uses ELSER v2 model)

### 2. AI Assistant Setup

1. Navigate to **Security → AI Assistant → Knowledge Base**
2. Click **"Add Knowledge Base"**
3. Configure the knowledge source:
   - **Name:** Security Knowledge Base
   - **Index Pattern:** `knowledge-base-security-*`
   - **Semantic Text Field:** `content`
   - **Data Description:** "Security knowledge documents including threat intelligence, incident response procedures, vulnerability analysis, and security best practices with AI-optimized suggested questions"
   - **Query Instructions:** "Search for security procedures, threat analysis, IOCs, CVE information, and incident response guidance. Use suggested_questions field for enhanced AI interactions"

### 3. Field Mapping

| AI Assistant Field | Knowledge Base Field | Purpose |
|-------------------|---------------------|---------|
| **Content** | `content` | Main semantic text field for AI processing |
| **Title** | `title` | Document identification |
| **Summary** | `summary` | Quick reference and context |
| **Category** | `category` | Primary security domain filtering |
| **Tags** | `tags` | Enhanced searchability |
| **Questions** | `suggested_questions` | AI interaction optimization |

## Command Line Options

### Generation Options

| Option | Description | Example |
|--------|-------------|---------|
| `-n <count>` | Number of documents to generate | `-n 25` |
| `--categories <list>` | Specific security categories | `--categories threat_intelligence,incident_response` |
| `--access-level <level>` | Filter by access level | `--access-level public` |
| `--confidence-threshold <float>` | Minimum confidence score | `--confidence-threshold 0.8` |
| `--mitre` | Include MITRE ATT&CK mappings | `--mitre` |
| `--namespace <namespace>` | Custom index namespace | `--namespace production` |
| `--space <space>` | Target Kibana space | `--space security-team` |

### Example Commands

```bash
# Basic generation
yarn start generate-knowledge-base -n 20

# Category-specific generation
yarn start generate-knowledge-base -n 15 --categories threat_intelligence,incident_response,malware_analysis

# High-quality public documentation
yarn start generate-knowledge-base -n 25 --access-level public --confidence-threshold 0.9

# MITRE ATT&CK integrated knowledge base
yarn start generate-knowledge-base -n 30 --mitre --categories threat_intelligence,endpoint_security

# Multi-environment knowledge base
yarn start generate-knowledge-base -n 50 --namespace production --space soc-team

# Cleanup
yarn start delete-knowledge-base --namespace production
```

## AI-Optimized Suggested Questions

Each knowledge base document includes category-specific suggested questions designed to enhance AI Assistant interactions:

### Threat Intelligence Questions

- "What IOCs should we immediately block in our environment?"
- "How confident are we in the attribution of this threat?"
- "What detection rules should we create based on these indicators?"
- "Are there any false positive risks with these IOCs?"
- "What hunting queries can we run to find related activity?"

### Incident Response Questions

- "What are the key decision points in this incident response process?"
- "How do we customize this playbook for our environment?"
- "What tools and resources are required for each phase?"
- "Who should be contacted first in different incident scenarios?"
- "What communication templates should we prepare in advance?"

### Vulnerability Management Questions

- "What is the exploitability of this vulnerability in our environment?"
- "What systems in our infrastructure are affected by this CVE?"
- "What is the recommended patching timeline for this vulnerability?"
- "Are there effective workarounds while patching is in progress?"
- "How should we prioritize this vulnerability against others?"

### Network Security Questions

- "How do these firewall rules impact legitimate business traffic?"
- "What is the false positive rate expected for these signatures?"
- "What patterns in this traffic analysis indicate potential threats?"
- "How can we automate the detection of similar traffic patterns?"

## Generated Content Examples

### IOC Analysis Document

```markdown
# Indicator of Compromise Analysis

## Executive Summary
This analysis covers newly identified indicators associated with APT29 campaign targeting healthcare infrastructure.

## IOC Details
- **Hash**: 7d865e959b2466918c9863afca942d0fb89d7c9ac0c99bafc3749504ded97730
- **IP Address**: 192.168.1.100
- **Domain**: malicious-domain.com
- **File Path**: C:\Windows\System32\drivers\malware.sys

## Analysis
The malware sample exhibits sophisticated behavior patterns consistent with APT operations.
Network communications indicate C2 infrastructure hosted on compromised domains.

## Recommendations
1. Block identified IOCs at network perimeter
2. Hunt for similar patterns in environment
3. Update detection rules with new signatures
4. Monitor for lateral movement indicators

## Attribution
Likely associated with APT29 group based on TTPs and infrastructure overlap.
```

### Incident Response Playbook

```markdown
# Incident Response Playbook

## Incident Type: Ransomware Security Incident

### Phase 1: Preparation
- [ ] IR team notification
- [ ] Evidence preservation
- [ ] Stakeholder communication
- [ ] Legal/compliance notification

### Phase 2: Identification
**Detection Sources:**
- SIEM alerts
- EDR notifications
- User reports
- Threat intelligence feeds

### Phase 3: Containment
**Short-term Containment:**
- Isolate affected systems
- Disable compromised accounts
- Block malicious network traffic
- Preserve evidence

### Escalation Matrix
- **L1**: John Smith - +1-555-0101
- **L2**: Jane Doe - +1-555-0102
- **Management**: Bob Johnson - +1-555-0103
```

## Console Output Features

### Rich Information Display

The knowledge base generator provides comprehensive console output showing:

- **Document Titles**: Full titles for each generated document
- **Confidence Indicators**: 🔥 (>0.9), ✅ (>0.8), ⚡ (>0.7), 📝 (<0.7)
- **Access Level Icons**: 🌍 (public), 👥 (team), 🏢 (organization), 🔒 (restricted)
- **Category Breakdown**: Statistics by security domain
- **Suggested Questions**: AI-optimized questions for each document

### Example Output

```
🧠 Generating 15 Knowledge Base documents...
📚 Categories: threat_intelligence, incident_response
🔐 Access Level: mixed
🎯 MITRE ATT&CK Integration: enabled

✅ Successfully created 15 Knowledge Base documents in index: knowledge-base-security-default

📋 Generated Knowledge Base Documents:
  1. 🔥 👥 [threat_intelligence/ioc_analysis] IOC Analysis: MALWARE-7426
     💬 Suggested AI Assistant Questions:
        1. What IOCs should we immediately block in our environment?
        2. How confident are we in the attribution of this threat?
        3. What detection rules should we create based on these indicators?
        ... and 3 more questions

  2. ✅ 🏢 [incident_response/playbooks] IR Playbook: Ransomware Incident Response
     💬 Suggested AI Assistant Questions:
        1. What are the key decision points in this incident response process?
        2. How do we customize this playbook for our environment?
        3. What tools and resources are required for each phase?
        ... and 3 more questions

📊 Category Breakdown:
  • threat_intelligence/ioc_analysis: 8 documents
  • incident_response/playbooks: 7 documents

🔐 Access Level Distribution:
  👥 team: 9 documents
  🏢 organization: 6 documents

🎯 MITRE ATT&CK Integration: 15/15 documents
  • Techniques covered: 42

🔍 Query in Kibana: index:"knowledge-base-security-default"
🧠 AI Assistant: Documents are ready for knowledge base integration
```

## Kibana Queries

### Basic Searches

```kql
# Find threat intelligence documents
category: "threat_intelligence" AND confidence > 0.8

# Search by MITRE technique
mitre.technique_ids: "T1055" OR mitre.technique_ids: "T1190"

# High-value security knowledge
security.severity: "high" OR security.severity: "critical" AND access_level: "organization"

# Recent incident response procedures
category: "incident_response" AND last_updated > now-30d

# Documents with suggested questions
_exists_:suggested_questions AND confidence > 0.7

# Filter by TLP level
security.tlp: "green" OR security.tlp: "white"
```

### Aggregations

```bash
# Category distribution
curl -u "user:pass" "https://your-cluster/knowledge-base-security-default/_search?size=0&aggs=categories:{terms:{field:category}}"

# Confidence score distribution
curl -u "user:pass" "https://your-cluster/knowledge-base-security-default/_search?size=0&aggs=confidence_buckets:{histogram:{field:confidence,interval:0.1}}"

# MITRE technique coverage
curl -u "user:pass" "https://your-cluster/knowledge-base-security-default/_search?size=0&aggs=mitre_techniques:{terms:{field:mitre.technique_ids,size:100}}"
```

## Best Practices

### Content Generation

1. **Use Specific Categories**: Target specific security domains for focused knowledge bases
2. **Set Confidence Thresholds**: Filter for high-quality content using `--confidence-threshold`
3. **Leverage MITRE Integration**: Include `--mitre` for comprehensive threat intelligence mapping
4. **Organize by Access Levels**: Use `--access-level` for proper information sharing

### AI Assistant Integration

1. **Configure Semantic Search**: Ensure ELSER v2 model is properly configured
2. **Use Suggested Questions**: Leverage generated questions for enhanced AI interactions
3. **Monitor Performance**: Track query performance and adjust field limits as needed
4. **Regular Updates**: Refresh knowledge base content periodically

### Index Management

1. **Namespace Organization**: Use meaningful namespaces for multi-environment setups
2. **Index Lifecycle**: Implement ILM policies for automated data management
3. **Field Limits**: Monitor field count limits for optimal performance
4. **Backup Strategy**: Regular backups of critical knowledge base content

## Troubleshooting

### Common Issues

**Issue**: Documents not appearing in AI Assistant
**Solution**: Verify semantic text field mapping and ELSER v2 configuration

**Issue**: Low document quality
**Solution**: Increase confidence threshold: `--confidence-threshold 0.8`

**Issue**: Missing suggested questions
**Solution**: Ensure the `suggested_questions` field is properly mapped in index template

**Issue**: MITRE data not included
**Solution**: Add `--mitre` flag and verify MITRE ATT&CK data files are available

### Performance Optimization

- Use reasonable document counts (20-100) for initial testing
- Monitor Elasticsearch cluster resources during large generations
- Implement proper field mappings for optimal search performance
- Consider index sharding for very large knowledge bases

## Integration Examples

### SOC Analyst Workflow

```bash
# Generate comprehensive SOC knowledge base
yarn start generate-knowledge-base -n 50 \
  --categories threat_intelligence,incident_response,behavioral_analytics \
  --access-level team \
  --mitre \
  --confidence-threshold 0.7

# Query for specific threat intelligence
curl -X GET "localhost:9200/knowledge-base-security-default/_search" \
  -H 'Content-Type: application/json' \
  -d'{"query": {"bool": {"must": [{"term": {"category": "threat_intelligence"}}, {"range": {"confidence": {"gte": 0.8}}}]}}}'
```

### Threat Hunting Team Setup

```bash
# Generate threat hunting knowledge base
yarn start generate-knowledge-base -n 30 \
  --categories malware_analysis,forensics,endpoint_security \
  --mitre \
  --access-level organization \
  --namespace threat-hunting

# Configure for advanced hunting scenarios
# Documents include MITRE ATT&CK mappings and forensics procedures
```

### Compliance Team Documentation

```bash
# Generate compliance-focused knowledge base
yarn start generate-knowledge-base -n 25 \
  --categories compliance,vulnerability_management \
  --access-level organization \
  --confidence-threshold 0.9 \
  --namespace compliance-team

# High-confidence documents for audit and compliance purposes
```

## API Reference

### Knowledge Base Document Structure

```typescript
interface KnowledgeBaseDocument {
  '@timestamp': string;
  content: string;              // Semantic text field
  title: string;
  summary: string;
  suggested_questions: string[];
  category: string;
  subcategory: string;
  tags: string[];
  source: string;
  confidence: number;           // 0.6-1.0
  language: string;
  version: string;
  last_updated: string;
  author: string;
  access_level: string;
  security: {
    domain: string;
    classification: string;
    severity: string;
    tlp: string;
  };
  mitre?: {                     // Optional MITRE integration
    technique_ids: string[];
    tactic_ids: string[];
    framework: string;
  };
}
```

### Command Line Interface

```typescript
interface KnowledgeBaseOptions {
  count: number;
  includeMitre?: boolean;
  namespace?: string;
  space?: string;
  categories?: string[];
  accessLevel?: 'public' | 'team' | 'organization' | 'restricted';
  confidenceThreshold?: number;
}
```

## Related Documentation

- [Kibana Cloud Integration](kibana-cloud-integration.md) - Main integration guide
- [MITRE ATT&CK Integration](mitre-attack.md) - MITRE framework details
- [AI Integration](ai-integration.md) - AI provider configuration
- [Use Cases Guide](use-cases-guide.md) - Practical implementation examples
# 🔍 Visual Event Analyzer Integration

Complete guide to generating data compatible with Elastic Security's Visual Event Analyzer for advanced security investigation and analysis.

## 📋 Table of Contents

- [Overview](#overview)
- [Quick Start](#quick-start)
- [Data Generation](#data-generation)
- [Event Correlation](#event-correlation)
- [Investigation Workflows](#investigation-workflows)
- [Process Hierarchies](#process-hierarchies)
- [Network Analysis](#network-analysis)
- [File Operations](#file-operations)
- [Use Cases](#use-cases)
- [Best Practices](#best-practices)
- [Troubleshooting](#troubleshooting)

## Overview

The Visual Event Analyzer integration generates rich event data optimized for visual analysis and investigation in Elastic Security, providing:

- **Process Trees**: Complete process execution hierarchies
- **Network Flows**: Detailed network communication patterns
- **File Operations**: Comprehensive file system activity
- **Event Correlation**: Linked events for complete investigation context
- **Timeline Analysis**: Temporal event relationships

## Quick Start

### Basic Visual Analyzer Data
```bash
# Generate alerts with Visual Event Analyzer support
yarn start generate-alerts --count 50 --visual-analyzer

# Generate logs optimized for visual analysis
yarn start generate-logs --count 200 --visual-analyzer --types endpoint,network

# Generate campaign with visual investigation data
yarn start generate-campaign apt --visual-analyzer --count 150
```

### Advanced Visual Analysis
```bash
# Generate complex process hierarchies
yarn start generate-alerts --count 75 --visual-analyzer --process-trees

# Generate network analysis data
yarn start generate-logs --count 300 --visual-analyzer --network-flows

# Generate combined investigation dataset
yarn start generate-alerts --count 100 --visual-analyzer --session-view --comprehensive
```

## Data Generation

### Visual Analyzer Compatible Events
The system generates events specifically formatted for Visual Event Analyzer with required fields:

**Core Event Structure:**
```json
{
  "@timestamp": "2024-01-15T14:30:00.000Z",
  "event": {
    "category": "process",
    "type": "start",
    "action": "process_creation",
    "id": "unique-event-id",
    "sequence": 1001
  },
  "agent": {
    "id": "agent-001",
    "type": "endpoint",
    "version": "8.11.0"
  },
  "data_stream": {
    "type": "logs",
    "dataset": "endpoint.events.process",
    "namespace": "default"
  },
  "host": {
    "name": "workstation-01",
    "id": "host-001",
    "ip": "192.168.1.100"
  }
}
```

### Process Event Generation
Generate comprehensive process execution data:

```bash
# Generate process events with hierarchies
yarn start generate-logs --count 500 --types endpoint --visual-analyzer --process-focus

# Generate malware process chains
yarn start generate-campaign malware --visual-analyzer --process-chains --count 100
```

**Example Process Event:**
```json
{
  "process": {
    "entity_id": "process-001",
    "pid": 1234,
    "name": "powershell.exe",
    "executable": "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe",
    "command_line": "powershell.exe -ExecutionPolicy Bypass -File malicious.ps1",
    "parent": {
      "entity_id": "process-parent-001",
      "pid": 5678,
      "name": "winword.exe"
    },
    "hash": {
      "sha256": "abcd1234...",
      "md5": "efgh5678..."
    }
  },
  "user": {
    "name": "john.doe",
    "domain": "corporate.local",
    "id": "user-001"
  }
}
```

### Network Event Generation
Create detailed network communication events:

```bash
# Generate network events for visual analysis
yarn start generate-logs --count 400 --types network --visual-analyzer --network-detailed

# Generate C2 communication patterns
yarn start generate-campaign apt --visual-analyzer --network-analysis --count 200
```

**Example Network Event:**
```json
{
  "network": {
    "direction": "outbound",
    "protocol": "tcp",
    "bytes": 2048,
    "packets": 15
  },
  "source": {
    "ip": "192.168.1.100",
    "port": 49152,
    "geo": {
      "country_name": "United States"
    }
  },
  "destination": {
    "ip": "203.0.113.10",
    "port": 443,
    "domain": "malicious-c2.com",
    "geo": {
      "country_name": "Unknown"
    }
  },
  "related": {
    "ip": ["192.168.1.100", "203.0.113.10"]
  }
}
```

## Event Correlation

### Entity-Based Correlation
Events are correlated through consistent entity identifiers:

- **Process Entity ID**: Links process creation, modification, and termination
- **Agent ID**: Groups events from the same endpoint
- **Session ID**: Correlates user session activities
- **Parent-Child Relationships**: Process hierarchy maintenance

### Temporal Correlation
Events include timing relationships for investigation:

```json
{
  "event": {
    "ingested": "2024-01-15T14:30:05.000Z",
    "created": "2024-01-15T14:30:00.000Z",
    "sequence": 1001
  },
  "@timestamp": "2024-01-15T14:30:00.000Z",
  "correlation": {
    "session_id": "session-001",
    "investigation_id": "investigation-001"
  }
}
```

### Cross-Event Relationships
Generate linked events that tell complete stories:

```bash
# Generate correlated investigation data
yarn start generate-correlated --count 300 --visual-analyzer --investigation-chains

# Generate attack progression events
yarn start generate-campaign apt --visual-analyzer --event-chains --count 250
```

## Investigation Workflows

### Alert Investigation Data
Generate comprehensive data supporting security investigations:

```bash
# Generate alert with supporting investigation context
yarn start generate-alerts --count 50 --visual-analyzer --investigation-context

# Generate multi-stage attack investigation
yarn start generate-campaign apt --visual-analyzer --investigation-workflow --count 200
```

**Investigation Context:**
- **Initial Alert**: Security detection trigger
- **Supporting Events**: Related process, network, and file events
- **Timeline Data**: Chronological event sequence
- **Entity Relationships**: Connected hosts, users, and processes

### Threat Hunting Scenarios
Create data optimized for threat hunting activities:

```bash
# Generate subtle attack indicators
yarn start generate-campaign apt --visual-analyzer --hunting-scenario --stealth

# Generate behavioral anomalies
yarn start generate-logs --count 500 --visual-analyzer --anomaly-detection
```

## Process Hierarchies

### Process Tree Generation
Create realistic process execution trees:

```bash
# Generate complex process hierarchies
yarn start generate-logs --count 300 --visual-analyzer --process-trees --complex

# Generate malware execution chains
yarn start generate-campaign malware --visual-analyzer --execution-chains --count 150
```

**Process Tree Example:**
```
explorer.exe (PID: 1000)
├── winword.exe (PID: 2000)
│   ├── powershell.exe (PID: 3000)
│   │   ├── cmd.exe (PID: 4000)
│   │   └── certutil.exe (PID: 4001)
│   └── wscript.exe (PID: 3001)
└── chrome.exe (PID: 2001)
    └── chrome.exe (PID: 5000)
```

**Process Hierarchy Fields:**
```json
{
  "process": {
    "entity_id": "process-3000",
    "pid": 3000,
    "name": "powershell.exe",
    "parent": {
      "entity_id": "process-2000",
      "pid": 2000,
      "name": "winword.exe"
    },
    "session_leader": {
      "entity_id": "process-1000",
      "pid": 1000,
      "name": "explorer.exe"
    },
    "group_leader": {
      "entity_id": "process-1000",
      "pid": 1000
    }
  }
}
```

### Child Process Tracking
Track process spawning and termination:

- **Process Creation**: Document process start with parent context
- **Process Termination**: Track process end with exit codes
- **Session Management**: Group processes by user session
- **Resource Usage**: Include CPU, memory, and handle usage

## Network Analysis

### Network Flow Visualization
Generate network communication patterns for visual analysis:

```bash
# Generate network flows with visual analysis support
yarn start generate-logs --count 400 --visual-analyzer --network-flows --detailed

# Generate C2 communication analysis
yarn start generate-campaign apt --visual-analyzer --c2-analysis --count 300
```

### Connection Tracking
Track network connections with complete context:

```json
{
  "network": {
    "type": "ipv4",
    "transport": "tcp",
    "direction": "outbound",
    "community_id": "1:abcd1234..."
  },
  "source": {
    "ip": "192.168.1.100",
    "port": 49152
  },
  "destination": {
    "ip": "203.0.113.10",
    "port": 443
  },
  "related": {
    "hosts": ["workstation-01"],
    "ip": ["192.168.1.100", "203.0.113.10"],
    "user": ["john.doe"]
  }
}
```

### DNS Analysis
Generate DNS resolution events for investigation:

```json
{
  "dns": {
    "question": {
      "name": "malicious-domain.com",
      "type": "A",
      "class": "IN"
    },
    "answers": [{
      "name": "malicious-domain.com",
      "type": "A",
      "data": "203.0.113.10"
    }],
    "response_code": "NOERROR"
  }
}
```

## File Operations

### File System Activity
Generate comprehensive file operation events:

```bash
# Generate file operations for visual analysis
yarn start generate-logs --count 350 --visual-analyzer --file-operations --comprehensive

# Generate malware file activity
yarn start generate-campaign malware --visual-analyzer --file-analysis --count 200
```

**File Operation Events:**
```json
{
  "file": {
    "path": "C:\\Users\\john.doe\\Documents\\malicious.exe",
    "name": "malicious.exe",
    "extension": "exe",
    "size": 1024000,
    "created": "2024-01-15T14:25:00.000Z",
    "mtime": "2024-01-15T14:25:00.000Z",
    "hash": {
      "sha256": "abc123...",
      "md5": "def456..."
    }
  },
  "event": {
    "category": "file",
    "type": "creation",
    "action": "file_create_event"
  }
}
```

### Registry Operations
Track Windows registry modifications:

```json
{
  "registry": {
    "path": "HKLM\\Software\\Microsoft\\Windows\\CurrentVersion\\Run\\Malware",
    "key": "HKLM\\Software\\Microsoft\\Windows\\CurrentVersion\\Run",
    "value": "Malware",
    "data": {
      "strings": ["C:\\malicious.exe"],
      "type": "REG_SZ"
    }
  },
  "event": {
    "category": "registry",
    "type": "change",
    "action": "registry_key_create"
  }
}
```

## Use Cases

### 1. **Incident Investigation Training**
Train security analysts on systematic investigation procedures:

```bash
# Generate incident investigation scenarios
yarn start generate-campaign apt --visual-analyzer --investigation-training --count 200

# Create malware analysis exercises
yarn start generate-campaign malware --visual-analyzer --analysis-training --count 150
```

### 2. **Threat Hunting Exercises**
Create hunting scenarios with visual analysis support:

```bash
# Generate hunting scenarios
yarn start generate-logs --count 500 --visual-analyzer --hunting-exercises

# Create behavioral anomaly scenarios
yarn start generate-alerts --count 100 --visual-analyzer --anomaly-hunting
```

### 3. **SOC Workflow Testing**
Test investigation workflows with realistic data:

```bash
# Generate workflow testing data
yarn start generate-alerts --count 75 --visual-analyzer --workflow-testing

# Create escalation scenarios
yarn start generate-campaign apt --visual-analyzer --escalation-testing --count 250
```

### 4. **Tool Integration Testing**
Test integration between Visual Event Analyzer and other security tools:

```bash
# Generate integration test data
yarn start generate-logs --count 400 --visual-analyzer --integration-testing

# Test cross-platform analysis
yarn start generate-alerts --count 150 --visual-analyzer --cross-platform
```

## Best Practices

### Data Generation Strategy
1. **Entity Consistency**: Maintain consistent entity IDs across related events
2. **Temporal Accuracy**: Ensure realistic timing between related events
3. **Process Hierarchies**: Generate complete process trees for investigation
4. **Network Context**: Include comprehensive network communication data
5. **File Tracking**: Provide complete file operation timelines

### Investigation Design
1. **Clear Narratives**: Generate events that tell coherent investigation stories
2. **Multiple Perspectives**: Include data from different viewpoints (process, network, file)
3. **Evidence Chains**: Create clear evidence trails for investigation
4. **Realistic Complexity**: Balance complexity with investigation clarity
5. **Learning Objectives**: Design scenarios with specific learning goals

### Performance Optimization
1. **Batch Processing**: Generate related events in coordinated batches
2. **Index Optimization**: Use appropriate index patterns for Visual Event Analyzer
3. **Field Selection**: Include essential fields for visual analysis
4. **Resource Management**: Monitor system resources during generation
5. **Data Lifecycle**: Implement appropriate data retention policies

## Troubleshooting

### Common Issues

#### Missing Visual Analysis Data
**Issue**: Generated events don't appear in Visual Event Analyzer
**Solutions**:
- Verify required fields are present (agent.type, data_stream.dataset)
- Check index patterns match Visual Event Analyzer expectations
- Ensure process.entity_id consistency across related events
- Validate timestamp formatting and temporal relationships

#### Process Tree Problems
**Issue**: Process hierarchies don't display correctly
**Solutions**:
- Verify parent-child relationships through process.parent.entity_id
- Check that all process events include required process fields
- Ensure process.session_leader and process.group_leader are set
- Validate process.entity_id uniqueness and consistency

#### Event Correlation Issues
**Issue**: Related events don't correlate in analysis
**Solutions**:
- Verify entity ID consistency across event types
- Check timestamp alignment for related events
- Ensure agent.id consistency for events from same endpoint
- Validate correlation field usage

### Debug and Validation
```bash
# Generate debug data with validation
yarn start generate-logs --count 50 --visual-analyzer --debug --validate

# Test specific event types
yarn start generate-logs --count 25 --types endpoint --visual-analyzer --process-only

# Validate event correlation
yarn start validate-correlation --visual-analyzer --investigation-chains
```

## Advanced Features

### Custom Investigation Scenarios
Create organization-specific investigation scenarios:

```bash
# Custom APT investigation
yarn start generate-campaign apt --visual-analyzer --custom-scenario --organization-specific

# Industry-specific threats
yarn start generate-campaign ransomware --visual-analyzer --industry healthcare --count 200
```

### Integration with Session View
Combine Visual Event Analyzer with Session View for comprehensive analysis:

```bash
# Generate combined analysis data
yarn start generate-alerts --count 100 --visual-analyzer --session-view --comprehensive

# Multi-perspective investigation
yarn start generate-campaign apt --visual-analyzer --session-view --multi-view --count 300
```

### Machine Learning Integration
Generate data optimized for ML-enhanced visual analysis:

```bash
# ML-enhanced visual analysis
yarn start generate-alerts --count 200 --visual-analyzer --ml-enhanced

# Anomaly detection visualization
yarn start generate-logs --count 500 --visual-analyzer --anomaly-detection --ml-ready
```

---

*Ready to enhance your security investigations? Start with `yarn start generate-alerts --count 50 --visual-analyzer` to create rich investigation data for Elastic Security's Visual Event Analyzer!*
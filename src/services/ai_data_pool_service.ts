/**
 * AI Data Pool Service
 * 
 * Handles AI-powered generation of security data pools using simple,
 * reliable string array generation instead of complex JSON structures.
 */

import { OpenAI } from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import { faker } from '@faker-js/faker';
import { getConfig } from '../get_config';
import { 
  ExtendedFieldData, 
  BatchingStrategy,
  FieldGenerationBatch 
} from './unified_data_pool_types';
import { 
  withRetry, 
  safeJsonParse, 
  handleAIError 
} from '../utils/error_handling';
import { sanitizeJSONResponse } from '../utils/validation_service';

// Initialize AI clients
let openai: OpenAI | null = null;
let claude: Anthropic | null = null;

const initializeAI = (): void => {
  try {
    const config = getConfig();
    
    if (config.useClaudeAI && config.claudeApiKey) {
      claude = new Anthropic({
        apiKey: config.claudeApiKey,
      });
    } else if (config.useAzureOpenAI && config.azureOpenAIApiKey) {
      openai = new OpenAI({
        apiKey: config.azureOpenAIApiKey,
        baseURL: `${config.azureOpenAIEndpoint.replace(/\/$/, '')}/openai/deployments/${config.azureOpenAIDeployment}`,
        defaultQuery: {
          'api-version': config.azureOpenAIApiVersion || '2024-08-01-preview',
        },
        defaultHeaders: { 
          'api-key': config.azureOpenAIApiKey,
          'Content-Type': 'application/json'
        },
      });
    } else if (config.openaiApiKey) {
      openai = new OpenAI({
        apiKey: config.openaiApiKey,
      });
    }
  } catch (error) {
    console.warn('AI initialization failed:', error);
  }
};

/**
 * Generate comprehensive themed security dataset using AI for realistic coherent data
 */
export async function generateAISecurityData(
  count: number,
  theme?: string
): Promise<{
  data: {
    alertNames: string[];
    alertDescriptions: string[];
    threatNames: string[];
    processNames: string[];
    fileNames: string[];
    domains: string[];
    ipAddresses: string[];
    registryKeys: string[];
    urls: string[];
    eventDescriptions: string[];
  };
  aiCalls: number;
  tokens: number;
}> {
  if (!openai && !claude) {
    initializeAI();
  }

  if (!openai && !claude) {
    throw new Error('No AI client available');
  }

  const dataSize = Math.min(count, 20);
  let totalAICalls = 0;
  let totalTokens = 0;
  const results: any = {};

  if (theme) {
    console.log(`🎨 Generating comprehensive ${theme}-themed security dataset...`);
    
    // Generate each type individually with fallbacks for robustness
    const dataTypes = [
      { key: 'alertNames', type: 'security alert names' },
      { key: 'threatNames', type: 'cybersecurity threat names' },
      { key: 'fileNames', type: 'suspicious file names' },
      { key: 'alertDescriptions', type: 'security alert descriptions' }
    ];

    // Generate domains programmatically (avoiding AI refusal issues)
    console.log('🔧 Generating themed domains programmatically...');
    results.domains = generateThemedDomains(dataSize, theme);

    // Generate other data with AI, falling back individually
    for (const dataType of dataTypes) {
      try {
        const result = await generateThemedAIList(dataType.type, dataSize, theme);
        results[dataType.key] = result.data;
        totalAICalls += result.aiCalls;
        totalTokens += result.tokens;
        console.log(`✅ AI generated ${dataType.key}`);
      } catch (error) {
        console.warn(`AI failed for ${dataType.key}, using themed fallback`);
        results[dataType.key] = generateThemedFallbackData(dataType.key, dataSize, theme);
      }
    }
  } else {
    // No theme - use fast algorithmic generation
    results.alertNames = generateFallbackData('alertNames', dataSize);
    results.threatNames = generateFallbackData('threatNames', dataSize);
    results.fileNames = generateFallbackData('fileNames', dataSize);
    results.domains = generateFallbackData('domains', dataSize);
    results.alertDescriptions = generateFallbackData('alertDescriptions', dataSize);
  }

  // Technical fields are better algorithmic (consistent and fast)
  results.processNames = generateFallbackData('processNames', dataSize, theme);
  results.ipAddresses = generateFallbackData('ipAddresses', dataSize, theme);
  results.registryKeys = generateFallbackData('registryKeys', dataSize, theme);
  results.urls = generateFallbackData('urls', dataSize, theme);
  results.eventDescriptions = generateFallbackData('eventDescriptions', dataSize, theme);

  return {
    data: results,
    aiCalls: totalAICalls,
    tokens: totalTokens
  };
}

/**
 * Generate themed entity names using AI (usernames, hostnames)
 */
export async function generateAIThemedEntities(
  userCount: number,
  hostCount: number,
  theme: string
): Promise<{
  userNames: string[];
  hostNames: string[];
  aiCalls: number;
  tokens: number;
}> {
  if (!openai && !claude) {
    initializeAI();
  }

  if (!openai && !claude) {
    throw new Error('No AI client available');
  }

  console.log(`🎭 Generating ${theme}-themed usernames and hostnames...`);

  try {
    // Generate themed usernames and hostnames in parallel
    const [usernamesResult, hostnamesResult] = await Promise.all([
      generateThemedAIList('computer usernames', userCount, theme),
      generateThemedAIList('computer hostnames', hostCount, theme)
    ]);

    console.log(`✅ Generated ${usernamesResult.data.length} themed usernames and ${hostnamesResult.data.length} themed hostnames`);

    return {
      userNames: usernamesResult.data,
      hostNames: hostnamesResult.data,
      aiCalls: 2,
      tokens: usernamesResult.tokens + hostnamesResult.tokens
    };

  } catch (error) {
    console.warn('Themed entity generation failed, using fallbacks');
    return {
      userNames: generateThemedFallbackData('userNames', userCount, theme),
      hostNames: generateThemedFallbackData('hostNames', hostCount, theme),
      aiCalls: 0,
      tokens: 0
    };
  }
}

/**
 * Generate themed AI list with proper context for realistic data
 */
async function generateThemedAIList(
  dataType: string,
  count: number,
  theme: string
): Promise<{
  data: string[];
  aiCalls: number;
  tokens: number;
}> {
  let prompt = '';
  
  // Create specific prompts for different data types and themes
  switch (dataType) {
    case 'computer usernames':
      prompt = `Generate ${count} ${theme}-themed computer usernames that would be realistic for a company network.

For ${theme} theme, create usernames like:
- If anime: naruto.uzumaki, sasuke.uchiha, sakura.haruno
- If soccer: messi.lionel, ronaldo.cristiano, neymar.jr
- If marvel: peter.parker, tony.stark, steve.rogers

Format: firstname.lastname (lowercase)
One per line, no numbering:`;
      break;
      
    case 'computer hostnames':
      prompt = `Generate ${count} ${theme}-themed computer hostnames for a company network.

For ${theme} theme, create hostnames like:
- If anime: konoha-web-01, akatsuki-db-02, chunin-app-03
- If soccer: barcelona-web-01, madrid-db-02, arsenal-app-03
- If marvel: avengers-web-01, shield-db-02, stark-app-03

Format: theme-function-number
One per line, no numbering:`;
      break;
      
    case 'security alert names':
      prompt = `Generate ${count} ${theme}-themed cybersecurity alert names.

For ${theme} theme, create alerts like:
- If anime: "Chakra Network Intrusion Detected", "Sharingan Malware Signature"
- If soccer: "Goal Line Breach Detected", "Offside Process Execution"
- If marvel: "SHIELD Network Compromise", "Hydra Infiltration Attempt"

Keep cybersecurity relevance but use ${theme} terminology.
One per line, no numbering:`;
      break;
      
    case 'cybersecurity threat names':
      prompt = `Generate ${count} ${theme}-themed fictional threat names for cybersecurity training and simulation.

For ${theme} theme, create creative fictional threat names like:
- If anime: "Shadow Clone APT", "Chakra Network Worm", "Ninja Technique Backdoor"
- If soccer: "Offside Exploit", "Red Card Ransomware", "Goal Line Breach"
- If marvel: "Web Slinger Virus", "Shield Protocol Bypass", "Infinity Stone Stealer"

These are fictional names for security training. One per line, no numbering:`;
      break;
      
    case 'suspicious file names':
      prompt = `Generate ${count} ${theme}-themed file names for cybersecurity training scenarios.

For ${theme} theme, create realistic but fictional file names like:
- If anime: "ninja_training.exe", "chakra_manual.pdf", "village_secrets.dll"
- If soccer: "match_stats.exe", "player_data.pdf", "team_strategy.dll"  
- If marvel: "hero_training.exe", "shield_manual.pdf", "powers_database.dll"

These are for security simulation purposes. One per line, no numbering:`;
      break;
      
    case 'suspicious domain names':
      prompt = `Generate ${count} ${theme}-themed domain names for cybersecurity testing simulations.

Create educational domain examples by combining ${theme} words with common patterns:
- If anime: "naruto-downloads.com", "sasuke-updates.net", "hokage-portal.org"
- If soccer: "messi-stats.com", "fifa-downloads.net", "worldcup-portal.org"
- If marvel: "avengers-updates.com", "stark-portal.net", "shield-downloads.org"

Format: [theme-word]-[common-pattern].[tld]
These are fictional examples for training only. One per line:`;
      break;
      
    case 'security alert descriptions':
      prompt = `Generate ${count} ${theme}-themed security alert descriptions.

For ${theme} theme, create descriptions like:
- If anime: "Detected suspicious chakra flow in network traffic"
- If soccer: "Offside process execution bypassed defense mechanisms"
- If marvel: "SHIELD protocol violation detected in user activity"

One per line, no numbering:`;
      break;
      
    default:
      prompt = `Generate ${count} ${theme}-themed ${dataType}.
One per line, no numbering:`;
  }

  try {
    const config = getConfig();
    let response: any;

    if (claude) {
      response = await claude.messages.create({
        model: config.claudeModel || 'claude-3-5-sonnet-20241022',
        max_tokens: 1000,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.8,
      });
    } else if (openai) {
      const modelName = config.useAzureOpenAI && config.azureOpenAIDeployment
        ? config.azureOpenAIDeployment
        : 'gpt-4o';

      response = await openai.chat.completions.create({
        model: modelName,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.8,
        max_tokens: 1000,
      });
    }

    // Extract content
    let rawContent = '';
    if (claude && response?.content?.[0]?.type === 'text') {
      rawContent = response.content[0].text;
    } else if (openai && response?.choices?.[0]?.message?.content) {
      rawContent = response.choices[0].message.content;
    }

    // Parse simple text list
    const items = rawContent
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 2 && !line.match(/^\d+\./) && !line.includes(':'))
      .slice(0, count);

    if (items.length === 0) {
      throw new Error('No valid items generated');
    }

    return {
      data: items,
      aiCalls: 1,
      tokens: estimateTokens(rawContent)
    };

  } catch (error) {
    throw error;
  }
}

/**
 * Generate field schema using AI for extended fields
 */
export async function generateAIFieldSchema(
  fieldCount: number,
  categories: string[],
  theme?: string
): Promise<{
  fields: Array<{
    name: string;
    type: string;
    category: string;
    description: string;
  }>;
  aiCalls: number;
  tokens: number;
}> {
  if (!openai && !claude) {
    initializeAI();
  }

  if (!openai && !claude) {
    throw new Error('No AI client available');
  }

  const categoryList = categories.join(', ');
  const themeContext = theme ? `themed around ${theme}` : 'cybersecurity';
  
  const prompt = `Generate ${fieldCount} unique, realistic security field schemas ${themeContext}.

Categories to focus on: ${categoryList}

Return a JSON object with a "fields" array:
{
  "fields": [
    {
      "name": "user_behavior.anomaly_score",
      "type": "float",
      "category": "behavioral_analytics",
      "description": "User behavior anomaly detection score"
    },
    {
      "name": "threat.intelligence.reputation_score",
      "type": "integer",
      "category": "threat_intelligence", 
      "description": "IP reputation score from threat feeds"
    }
  ]
}

Field types: string, integer, float, boolean, ip, timestamp, array
Use dot notation for nested fields (e.g., "user.behavior.score")
${theme ? `All fields should be themed around ${theme} while maintaining security relevance.` : ''}
Return only valid JSON.`;

  try {
    const config = getConfig();
    let response: any;

    if (claude) {
      response = await claude.messages.create({
        model: config.claudeModel || 'claude-3-5-sonnet-20241022',
        max_tokens: 4000,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.7,
      });
    } else if (openai) {
      const modelName = config.useAzureOpenAI && config.azureOpenAIDeployment
        ? config.azureOpenAIDeployment
        : 'gpt-4o';

      response = await openai.chat.completions.create({
        model: modelName,
        messages: [{ role: 'user', content: prompt }],
        response_format: { type: 'json_object' },
        temperature: 0.7,
      });
    }

    // Extract content
    let rawContent = '';
    if (claude && response?.content?.[0]?.type === 'text') {
      rawContent = response.content[0].text;
    } else if (openai && response?.choices?.[0]?.message?.content) {
      rawContent = response.choices[0].message.content;
    }

    // Clean and parse JSON
    const cleanedContent = sanitizeJSONResponse(rawContent);
    const data = safeJsonParse(cleanedContent, 'Field schema generation') as any;

    // Validate and return
    const fields = Array.isArray(data.fields) ? data.fields : [];
    
    return {
      fields: fields.slice(0, fieldCount), // Ensure correct count
      aiCalls: 1,
      tokens: estimateTokens(rawContent)
    };

  } catch (error) {
    console.error('AI field schema generation failed:', error);
    throw error;
  }
}

/**
 * Generate field data using AI
 */
export async function generateAIFieldData(
  fieldSchema: Array<{
    name: string;
    type: string;
    category: string;
    description: string;
  }>,
  valueCount: number,
  theme?: string
): Promise<{
  fieldData: ExtendedFieldData[];
  aiCalls: number;
  tokens: number;
}> {
  if (!openai && !claude) {
    initializeAI();
  }

  if (!openai && !claude) {
    throw new Error('No AI client available');
  }

  const themeContext = theme ? `themed around ${theme}` : 'realistic';
  
  const prompt = `Generate ${valueCount} realistic values for each of these security fields ${themeContext}:

Fields:
${fieldSchema.map(f => `- ${f.name} (${f.type}): ${f.description}`).join('\n')}

Return a JSON object with field names as keys and arrays of values:
{
  "${fieldSchema[0]?.name}": ["value1", "value2", "value3", ...],
  "${fieldSchema[1]?.name}": ["value1", "value2", "value3", ...]
}

Each array should contain exactly ${valueCount} unique, realistic values of the correct type.
${theme ? `All values should be themed around ${theme}.` : ''}
Return only valid JSON.`;

  try {
    const config = getConfig();
    let response: any;

    if (claude) {
      response = await claude.messages.create({
        model: config.claudeModel || 'claude-3-5-sonnet-20241022',
        max_tokens: 4000,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.7,
      });
    } else if (openai) {
      const modelName = config.useAzureOpenAI && config.azureOpenAIDeployment
        ? config.azureOpenAIDeployment
        : 'gpt-4o';

      response = await openai.chat.completions.create({
        model: modelName,
        messages: [{ role: 'user', content: prompt }],
        response_format: { type: 'json_object' },
        temperature: 0.7,
      });
    }

    // Extract content
    let rawContent = '';
    if (claude && response?.content?.[0]?.type === 'text') {
      rawContent = response.content[0].text;
    } else if (openai && response?.choices?.[0]?.message?.content) {
      rawContent = response.choices[0].message.content;
    }

    // Clean and parse JSON
    const cleanedContent = sanitizeJSONResponse(rawContent);
    const data = safeJsonParse(cleanedContent, 'Field data generation') as any;

    // Convert to ExtendedFieldData format
    const fieldData: ExtendedFieldData[] = fieldSchema.map(schema => {
      const values = Array.isArray(data[schema.name]) 
        ? data[schema.name].map(String) 
        : [`fallback_${schema.name}_${Date.now()}`];
      
      return {
        fieldName: schema.name,
        fieldType: schema.type,
        values: values.slice(0, valueCount),
        category: schema.category,
        description: schema.description
      };
    });

    return {
      fieldData,
      aiCalls: 1,
      tokens: estimateTokens(rawContent)
    };

  } catch (error) {
    console.error('AI field data generation failed:', error);
    throw error;
  }
}

/**
 * Calculate batching strategy for large field sets
 */
export function calculateBatchingStrategy(
  fieldCount: number,
  categories: string[]
): BatchingStrategy {
  const maxFieldsPerBatch = 50; // Conservative limit
  const maxTokensPerBatch = 4000;
  
  const totalBatches = Math.ceil(fieldCount / maxFieldsPerBatch);
  const fieldsPerBatch = Math.floor(fieldCount / totalBatches);
  
  const batches = [];
  let remainingFields = fieldCount;
  
  for (let i = 0; i < totalBatches; i++) {
    const batchSize = Math.min(fieldsPerBatch, remainingFields);
    const category = categories[i % categories.length];
    
    batches.push({
      fields: Array.from({ length: batchSize }, (_, j) => 
        `field_${i}_${j}`
      ),
      estimatedTokens: batchSize * 50, // Rough estimate
      category,
      priority: i
    });
    
    remainingFields -= batchSize;
  }
  
  return {
    batches,
    totalBatches,
    estimatedTotalTokens: batches.reduce((sum, batch) => sum + batch.estimatedTokens, 0),
    processingOrder: batches.map((_, i) => i)
  };
}

/**
 * Estimate token usage for a string
 */
function estimateTokens(content: string): number {
  // Rough estimation: 1 token ≈ 4 characters
  return Math.ceil(content.length / 4);
}

/**
 * Process field generation in batches
 */
export async function processFieldBatches(
  batches: BatchingStrategy['batches'],
  theme?: string
): Promise<{
  results: FieldGenerationBatch[];
  totalAICalls: number;
  totalTokens: number;
}> {
  const results: FieldGenerationBatch[] = [];
  let totalAICalls = 0;
  let totalTokens = 0;
  
  for (const batch of batches) {
    const startTime = Date.now();
    
    try {
      // Generate field schema for this batch
      const schemaResult = await generateAIFieldSchema(
        batch.fields.length,
        [batch.category],
        theme
      );
      
      // Generate field data for this batch
      const dataResult = await generateAIFieldData(
        schemaResult.fields,
        20, // Generate 20 values per field
        theme
      );
      
      results.push({
        batchId: `batch_${batches.indexOf(batch)}`,
        fields: dataResult.fieldData,
        processingTimeMs: Date.now() - startTime,
        tokensUsed: schemaResult.tokens + dataResult.tokens,
        success: true
      });
      
      totalAICalls += schemaResult.aiCalls + dataResult.aiCalls;
      totalTokens += schemaResult.tokens + dataResult.tokens;
      
    } catch (error) {
      results.push({
        batchId: `batch_${batches.indexOf(batch)}`,
        fields: [],
        processingTimeMs: Date.now() - startTime,
        tokensUsed: 0,
        success: false,
        error: (error as any).message
      });
    }
  }
  
  return {
    results,
    totalAICalls,
    totalTokens
  };
}

/**
 * Generate realistic fallback data when AI fails
 */
function generateFallbackData(key: string, count: number, theme?: string): string[] {
  const result: string[] = [];
  
  for (let i = 0; i < count; i++) {
    switch (key) {
      case 'alertNames':
        result.push(faker.helpers.arrayElement([
          'Suspicious PowerShell Activity Detected',
          'Malware Detection - Endpoint Security',
          'Failed Login Attempts from Multiple IPs',
          'Privilege Escalation Attempt',
          'Suspicious Network Traffic to External Domain'
        ]));
        break;
        
      case 'alertDescriptions':
        result.push(faker.lorem.sentence(10));
        break;
        
      case 'threatNames':
        result.push(faker.helpers.arrayElement([
          'APT29', 'Lazarus', 'Cobalt Strike', 'Emotet', 'Ransomware', 'Trojan'
        ]));
        break;
        
      case 'processNames':
        result.push(faker.helpers.arrayElement([
          'powershell.exe', 'cmd.exe', 'rundll32.exe', 'svchost.exe', 'explorer.exe'
        ]));
        break;
        
      case 'fileNames':
        result.push(`${faker.system.fileName()}.${faker.helpers.arrayElement(['exe', 'dll', 'bat', 'ps1'])}`);
        break;
        
      case 'domains':
        if (theme) {
          // Generate themed domains programmatically
          const themeWords = theme === 'anime' ? ['naruto', 'sasuke', 'akatsuki', 'ninja', 'konoha'] :
                           theme === 'soccer' ? ['messi', 'ronaldo', 'fifa', 'worldcup', 'goal'] :
                           theme === 'marvel' ? ['avengers', 'stark', 'shield', 'spiderman', 'hulk'] :
                           ['cyber', 'secure', 'network', 'tech', 'digital'];
          const patterns = ['downloads', 'updates', 'portal', 'secure', 'official', 'pro'];
          const tlds = ['com', 'net', 'org', 'info'];
          
          const word = faker.helpers.arrayElement(themeWords);
          const pattern = faker.helpers.arrayElement(patterns);
          const tld = faker.helpers.arrayElement(tlds);
          result.push(`${word}-${pattern}.${tld}`);
        } else {
          result.push(faker.internet.domainName());
        }
        break;
        
      case 'ipAddresses':
        result.push(faker.internet.ip());
        break;
        
      case 'registryKeys':
        result.push(faker.helpers.arrayElement([
          'HKLM\\\\SOFTWARE\\\\Microsoft\\\\Windows\\\\CurrentVersion\\\\Run',
          'HKCU\\\\SOFTWARE\\\\Microsoft\\\\Windows\\\\CurrentVersion\\\\Run',
          'HKLM\\\\SYSTEM\\\\CurrentControlSet\\\\Services'
        ]));
        break;
        
      case 'urls':
        result.push(`https://malicious-${faker.string.alphanumeric(8)}.com/${faker.string.alphanumeric(6)}`);
        break;
        
      case 'eventDescriptions':
        result.push(faker.lorem.sentence(8));
        break;
        
      default:
        result.push(`fallback_${key}_${i}`);
    }
  }
  
  return result;
}

/**
 * Generate themed fallback data when AI fails but theme is specified
 */
function generateThemedFallbackData(key: string, count: number, theme: string): string[] {
  const result: string[] = [];
  
  // Create simple themed variations of standard data
  const themeMap: Record<string, any> = {
    anime: {
      prefixes: ['naruto', 'sasuke', 'sakura', 'kakashi', 'akatsuki', 'konoha'],
      hostPrefixes: ['konoha', 'akatsuki', 'chunin', 'ninja', 'hokage'],
      threatTerms: ['shadow', 'chakra', 'jutsu', 'sharingan', 'kyuubi']
    },
    soccer: {
      prefixes: ['messi', 'ronaldo', 'neymar', 'mbappe', 'benzema', 'haaland'],
      hostPrefixes: ['barcelona', 'madrid', 'arsenal', 'chelsea', 'united'],
      threatTerms: ['offside', 'penalty', 'redcard', 'goal', 'striker']
    },
    marvel: {
      prefixes: ['tony', 'steve', 'peter', 'bruce', 'natasha', 'thor'],
      hostPrefixes: ['avengers', 'shield', 'stark', 'hydra', 'wakanda'],
      threatTerms: ['infinity', 'vibranium', 'mjolnir', 'arc', 'web']
    }
  };
  
  const themeData = themeMap[theme] || themeMap.anime;
  
  for (let i = 0; i < count; i++) {
    switch (key) {
      case 'userNames':
        const firstName = faker.helpers.arrayElement(themeData.prefixes);
        const lastName = faker.person.lastName().toLowerCase();
        result.push(`${firstName}.${lastName}`);
        break;
        
      case 'hostNames':
        const hostPrefix = faker.helpers.arrayElement(themeData.hostPrefixes);
        const function_name = faker.helpers.arrayElement(['web', 'db', 'app', 'mail']);
        const env = faker.helpers.arrayElement(['prod', 'dev', 'test']);
        const num = faker.number.int({ min: 1, max: 99 }).toString().padStart(2, '0');
        result.push(`${hostPrefix}-${function_name}-${env}-${num}`);
        break;
        
      case 'alertNames':
        const threatTerm = faker.helpers.arrayElement(themeData.threatTerms);
        result.push(`${threatTerm.charAt(0).toUpperCase() + threatTerm.slice(1)} Security Alert`);
        break;
        
      case 'fileNames':
        const fileTerm = faker.helpers.arrayElement(themeData.threatTerms);
        const ext = faker.helpers.arrayElement(['exe', 'dll', 'bat']);
        result.push(`${fileTerm}_payload.${ext}`);
        break;
        
      case 'domains':
        const domainWord = faker.helpers.arrayElement(themeData.prefixes);
        const pattern = faker.helpers.arrayElement(['downloads', 'updates', 'portal', 'secure']);
        const tld = faker.helpers.arrayElement(['com', 'net', 'org']);
        result.push(`${domainWord}-${pattern}.${tld}`);
        break;
        
      default:
        result.push(generateFallbackData(key, 1, theme)[0]);
    }
  }
  
  return result;
}

/**
 * Generate themed domains programmatically to avoid AI refusal issues
 */
function generateThemedDomains(count: number, theme: string): string[] {
  const result: string[] = [];
  
  // Define theme-specific word lists
  const themeWords: Record<string, string[]> = {
    anime: ['naruto', 'sasuke', 'goku', 'luffy', 'ichigo', 'natsu', 'edward', 'light', 'saitama', 'tanjiro'],
    soccer: ['messi', 'ronaldo', 'neymar', 'mbappe', 'benzema', 'salah', 'kane', 'haaland', 'modric', 'fifa'],
    marvel: ['spiderman', 'ironman', 'hulk', 'thor', 'captain', 'avengers', 'stark', 'parker', 'banner', 'rogers'],
    nba: ['lebron', 'curry', 'durant', 'giannis', 'luka', 'tatum', 'booker', 'embiid', 'jokic', 'warriors'],
    starwars: ['luke', 'vader', 'yoda', 'han', 'leia', 'obiwan', 'anakin', 'r2d2', 'c3po', 'chewbacca']
  };
  
  // Common suspicious domain patterns for security training
  const patterns = ['downloads', 'updates', 'secure', 'portal', 'official', 'pro', 'network', 'systems', 'data', 'cloud'];
  const tlds = ['com', 'net', 'org', 'info', 'biz'];
  
  const words = themeWords[theme] || themeWords.anime;
  
  for (let i = 0; i < count; i++) {
    const word = faker.helpers.arrayElement(words);
    const pattern = faker.helpers.arrayElement(patterns);
    const tld = faker.helpers.arrayElement(tlds);
    result.push(`${word}-${pattern}.${tld}`);
  }
  
  return result;
}
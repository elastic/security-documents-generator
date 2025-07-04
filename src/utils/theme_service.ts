import { OpenAI } from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import { getConfig } from '../get_config';
import { safeJsonParse } from './error_handling';

// Supported themes
export const SUPPORTED_THEMES = [
  'nba',
  'nfl',
  'soccer',
  'mlb',
  'marvel',
  'starwars',
  'movies',
  'tv_shows',
  'tech_companies',
  'programming',
  'gaming',
  'mythology',
  'literature',
  'history',
  'anime',
  'music',
  'food',
] as const;

export type Theme = (typeof SUPPORTED_THEMES)[number];

// Theme configuration interface
export interface ThemeConfig {
  usernames?: Theme;
  hostnames?: Theme;
  fullNames?: Theme;
  domains?: Theme;
  fileNames?: Theme;
  processNames?: Theme;
  companyNames?: Theme;
  emails?: Theme;
  organizations?: Theme;
  ipAddresses?: Theme;
  applicationNames?: Theme;
  serviceNames?: Theme;
  eventDescriptions?: Theme;
  urls?: Theme;
  registryKeys?: Theme;
  filePaths?: Theme;
}

// Parsed theme configuration
export interface ParsedThemeConfig {
  usernames: Theme | null;
  hostnames: Theme | null;
  fullNames: Theme | null;
  domains: Theme | null;
  fileNames: Theme | null;
  processNames: Theme | null;
  companyNames: Theme | null;
  emails: Theme | null;
  organizations: Theme | null;
  ipAddresses: Theme | null;
  applicationNames: Theme | null;
  serviceNames: Theme | null;
  eventDescriptions: Theme | null;
  urls: Theme | null;
  registryKeys: Theme | null;
  filePaths: Theme | null;
}

// Cache for themed data to avoid repeated AI calls
interface ThemeCache {
  [key: string]: {
    data: string[];
    timestamp: number;
  };
}

const themeCache: ThemeCache = {};
const CACHE_TTL = 30 * 60 * 1000; // 30 minutes

// Initialize AI clients (reuse from ai_service pattern)
let openai: OpenAI | null = null;
let claude: Anthropic | null = null;

const initializeAI = (): void => {
  const config = getConfig();

  if (config.useClaudeAI) {
    claude = new Anthropic({
      apiKey: config.claudeApiKey,
    });
    return;
  }

  if (config.useAzureOpenAI) {
    openai = new OpenAI({
      apiKey: config.azureOpenAIApiKey,
      baseURL: `${config.azureOpenAIEndpoint}/openai/deployments/${config.azureOpenAIDeployment}`,
      defaultQuery: {
        'api-version': config.azureOpenAIApiVersion || '2023-05-15',
      },
      defaultHeaders: { 'api-key': config.azureOpenAIApiKey },
    });
  } else {
    openai = new OpenAI({
      apiKey: config.openaiApiKey,
    });
  }
};

/**
 * Parse theme string into configuration object
 * Supports formats like:
 * - "nba" (applies to all data types)
 * - "usernames:nba,hostnames:marvel" (mixed themes)
 */
export const parseThemeConfig = (themeString: string): ParsedThemeConfig => {
  const config: ParsedThemeConfig = {
    usernames: null,
    hostnames: null,
    fullNames: null,
    domains: null,
    fileNames: null,
    processNames: null,
    companyNames: null,
    emails: null,
    organizations: null,
    ipAddresses: null,
    applicationNames: null,
    serviceNames: null,
    eventDescriptions: null,
    urls: null,
    registryKeys: null,
    filePaths: null,
  };

  if (!themeString) {
    return config;
  }

  // Check if it's a simple theme (applies to all)
  if (!themeString.includes(':')) {
    const theme = themeString.trim() as Theme;
    if (SUPPORTED_THEMES.includes(theme)) {
      config.usernames = theme;
      config.hostnames = theme;
      config.fullNames = theme;
      config.domains = theme;
      config.fileNames = theme;
      config.processNames = theme;
      config.companyNames = theme;
      config.emails = theme;
      config.organizations = theme;
      config.ipAddresses = theme;
      config.applicationNames = theme;
      config.serviceNames = theme;
      config.eventDescriptions = theme;
      config.urls = theme;
      config.registryKeys = theme;
      config.filePaths = theme;
    }
    return config;
  }

  // Parse mixed theme configuration
  const pairs = themeString.split(',');
  for (const pair of pairs) {
    const [dataType, theme] = pair.split(':').map((s) => s.trim());
    if (dataType && theme && SUPPORTED_THEMES.includes(theme as Theme)) {
      const validDataType = dataType as keyof ParsedThemeConfig;
      if (validDataType in config) {
        config[validDataType] = theme as Theme;
      }
    }
  }

  return config;
};

/**
 * Validate if a theme is supported
 */
export const isValidTheme = (theme: string): theme is Theme => {
  return SUPPORTED_THEMES.includes(theme as Theme);
};

/**
 * Generate cache key for themed data
 */
const getCacheKey = (theme: Theme, dataType: string, count: number): string => {
  return `${theme}-${dataType}-${count}`;
};

/**
 * Check if cached data is still valid
 */
const isCacheValid = (timestamp: number): boolean => {
  return Date.now() - timestamp < CACHE_TTL;
};

/**
 * Generate themed data using AI
 */
const generateThemedDataWithAI = async (
  theme: Theme,
  dataType: string,
  count: number = 20,
): Promise<string[]> => {
  if (!openai && !claude) {
    initializeAI();
  }

  if (!openai && !claude) {
    throw new Error('Failed to initialize AI client for theme generation');
  }

  const prompts = {
    usernames: `Generate ${count} realistic usernames/login names themed around ${theme}.
Examples for ${theme}:
- ${theme === 'nba' ? 'lebron.james, kobe.bryant, magic.johnson' : ''}
- ${theme === 'marvel' ? 'tony.stark, peter.parker, steve.rogers' : ''}
- ${theme === 'starwars' ? 'luke.skywalker, han.solo, princess.leia' : ''}
Format: firstname.lastname (lowercase, dot separated). Return as JSON array.`,

    hostnames: `Generate ${count} realistic server/hostname names themed around ${theme}.
Examples for ${theme}:
- ${theme === 'nba' ? 'lakers-web-01, bulls-db-02, warriors-mail-03' : ''}
- ${theme === 'marvel' ? 'thor-web-01, hulk-db-02, vision-api-03' : ''}
- ${theme === 'starwars' ? 'vader-mail-01, yoda-db-02, falcon-web-03' : ''}
Format: theme-function-number (lowercase, dash separated). Return as JSON array.`,

    fullNames: `Generate ${count} realistic full names themed around ${theme}.
Examples for ${theme}:
- ${theme === 'nba' ? 'LeBron James, Kobe Bryant, Magic Johnson' : ''}
- ${theme === 'marvel' ? 'Tony Stark, Peter Parker, Steve Rogers' : ''}
- ${theme === 'starwars' ? 'Luke Skywalker, Han Solo, Princess Leia' : ''}
Format: First Last (proper case). Return as JSON array.`,

    domains: `Generate ${count} realistic domain names themed around ${theme}.
Examples for ${theme}:
- ${theme === 'tech_companies' ? 'microsoft.com, google.com, apple.com' : ''}
- ${theme === 'marvel' ? 'starkindustries.com, avengers.org, shield.gov' : ''}
- ${theme === 'nba' ? 'lakers.com, bulls.org, warriors.net' : ''}
Format: domain.tld (lowercase). Return as JSON array.`,

    fileNames: `Generate ${count} realistic file names themed around ${theme}.
Examples for ${theme}:
- ${theme === 'marvel' ? 'stark_report.pdf, avengers_meeting.docx, shield_protocol.exe' : ''}
- ${theme === 'starwars' ? 'deathstar_plans.pdf, jedi_training.docx, force_protocol.exe' : ''}
- ${theme === 'tech_companies' ? 'google_analytics.exe, apple_update.dmg, microsoft_patch.msi' : ''}
Include various extensions: .pdf, .docx, .exe, .dll, .ps1, .bat, .sh. Return as JSON array.`,

    processNames: `Generate ${count} realistic process names themed around ${theme}.
Examples for ${theme}:
- ${theme === 'marvel' ? 'stark.exe, avengers-scanner.exe, shield-monitor.exe' : ''}
- ${theme === 'starwars' ? 'deathstar.exe, jedi-scanner.exe, force-monitor.exe' : ''}
- ${theme === 'tech_companies' ? 'google-chrome.exe, apple-updater.exe, microsoft-teams.exe' : ''}
Format: process-name.exe (lowercase, dash separated). Return as JSON array.`,

    companyNames: `Generate ${count} realistic company names themed around ${theme}.
Examples for ${theme}:
- ${theme === 'marvel' ? 'Stark Industries, Oscorp, Roxxon Corporation' : ''}
- ${theme === 'starwars' ? 'Imperial Systems, Rebel Tech, Jedi Solutions' : ''}
- ${theme === 'tech_companies' ? 'Nexus Corp, Quantum Systems, Neural Networks Inc' : ''}
Format: Company Name (proper case). Return as JSON array.`,

    emails: `Generate ${count} realistic email addresses themed around ${theme}.
Examples for ${theme}:
- ${theme === 'nba' ? 'lebron.james@lakers.com, kobe.bryant@lakers.com, magic.johnson@lakers.com' : ''}
- ${theme === 'marvel' ? 'tony.stark@starkindustries.com, peter.parker@dailybugle.com, steve.rogers@shield.gov' : ''}
- ${theme === 'starwars' ? 'luke.skywalker@rebels.org, han.solo@smugglers.net, leia.organa@rebels.org' : ''}
Format: username@domain.tld (lowercase). Return as JSON array.`,

    organizations: `Generate ${count} realistic organization names themed around ${theme}.
Examples for ${theme}:
- ${theme === 'nba' ? 'Lakers Analytics Division, Bulls Security Team, Warriors IT Department' : ''}
- ${theme === 'marvel' ? 'Stark Industries Security, SHIELD Operations, Avengers Initiative' : ''}
- ${theme === 'starwars' ? 'Rebel Alliance IT, Imperial Security Bureau, Jedi Council Tech' : ''}
Format: Organization Name (proper case). Return as JSON array.`,

    ipAddresses: `Generate ${count} realistic IP addresses with themed mnemonics for ${theme}.
Examples for ${theme}:
- ${theme === 'nba' ? '192.168.23.24 (Kobe/Mamba), 10.0.33.33 (Bird), 172.16.23.6 (Jordan)' : ''}
- ${theme === 'marvel' ? '192.168.10.1 (Iron Man), 10.0.0.3 (Cap), 172.16.0.7 (Hulk)' : ''}
- ${theme === 'starwars' ? '192.168.4.4 (Force), 10.0.0.1 (A New Hope), 172.16.5.5 (Empire)' : ''}
Format: IP address only. Return as JSON array.`,

    applicationNames: `Generate ${count} realistic application names themed around ${theme}.
Examples for ${theme}:
- ${theme === 'nba' ? 'Lakers Stats Pro, Bulls Scanner, Warriors Analytics Suite' : ''}
- ${theme === 'marvel' ? 'Stark Analyzer, Shield Monitor, Avengers Toolkit' : ''}
- ${theme === 'starwars' ? 'Jedi Scanner, Death Star Monitor, Rebel Analytics' : ''}
Format: Application Name (proper case). Return as JSON array.`,

    serviceNames: `Generate ${count} realistic system service names themed around ${theme}.
Examples for ${theme}:
- ${theme === 'nba' ? 'LakersAuthService, BullsLogService, WarriorsNetService' : ''}
- ${theme === 'marvel' ? 'StarkSecurityService, ShieldLogService, AvengersNetService' : ''}
- ${theme === 'starwars' ? 'JediAuthService, RebelLogService, EmpireNetService' : ''}
Format: ServiceName (PascalCase). Return as JSON array.`,

    eventDescriptions: `Generate ${count} realistic security event descriptions themed around ${theme}.
Examples for ${theme}:
- ${theme === 'nba' ? 'Lakers defense protocol activated, Bulls authentication challenge, Warriors network scan detected' : ''}
- ${theme === 'marvel' ? 'Stark security protocol engaged, Shield perimeter breach, Avengers assembly triggered' : ''}
- ${theme === 'starwars' ? 'Jedi mind trick detected, Death Star vulnerability scan, Rebel infiltration attempt' : ''}
Format: Brief description (sentence case). Return as JSON array.`,

    urls: `Generate ${count} realistic URL paths themed around ${theme}.
Examples for ${theme}:
- ${theme === 'nba' ? '/api/lakers/stats, /bulls/player-data, /warriors/analytics' : ''}
- ${theme === 'marvel' ? '/api/stark/inventory, /shield/classified, /avengers/mission-brief' : ''}
- ${theme === 'starwars' ? '/api/jedi/training, /empire/plans, /rebels/intelligence' : ''}
Format: /path/endpoint (lowercase, slash separated). Return as JSON array.`,

    registryKeys: `Generate ${count} realistic Windows registry key paths themed around ${theme}.
Examples for ${theme}:
- ${theme === 'nba' ? 'HKLM\\Software\\Lakers\\Config, HKCU\\Software\\Bulls\\Settings, HKLM\\System\\Warriors\\Service' : ''}
- ${theme === 'marvel' ? 'HKLM\\Software\\Stark\\Armor, HKCU\\Software\\Shield\\Agent, HKLM\\System\\Avengers\\Protocol' : ''}
- ${theme === 'starwars' ? 'HKLM\\Software\\Jedi\\Force, HKCU\\Software\\Empire\\Sith, HKLM\\System\\Rebels\\Base' : ''}
Format: Registry path with backslashes. Return as JSON array.`,

    filePaths: `Generate ${count} realistic file paths themed around ${theme}.
Examples for ${theme}:
- ${theme === 'nba' ? 'C:\\Lakers\\Reports\\championship.pdf, /home/bulls/logs/game.log, /opt/warriors/data/stats.json' : ''}
- ${theme === 'marvel' ? 'C:\\Stark\\Designs\\mark42.dwg, /home/shield/intel/mission.txt, /opt/avengers/data/roster.xml' : ''}
- ${theme === 'starwars' ? 'C:\\Empire\\Plans\\deathstar.blueprint, /home/jedi/training/force.guide, /opt/rebels/data/plans.json' : ''}
Format: Full file path with extension. Return as JSON array.`,
  };

  const prompt = prompts[dataType as keyof typeof prompts] || prompts.usernames;

  try {
    const config = getConfig();
    let response: string = '';

    if (claude) {
      const claudeResponse = await claude.messages.create({
        model: config.claudeModel || 'claude-3-5-sonnet-20241022',
        max_tokens: 1000,
        messages: [
          {
            role: 'user',
            content: `${prompt}\n\nReturn ONLY a valid JSON array of strings, no additional text.`,
          },
        ],
        temperature: 0.8,
      });

      const content = claudeResponse.content[0];
      if (content.type === 'text') {
        response = content.text || '[]';
      }
    } else if (openai) {
      const modelName =
        config.useAzureOpenAI && config.azureOpenAIDeployment
          ? config.azureOpenAIDeployment
          : 'gpt-4o';

      const openaiResponse = await openai.chat.completions.create({
        model: modelName,
        messages: [
          {
            role: 'user',
            content: `${prompt}\n\nReturn ONLY a valid JSON array of strings, no additional text.`,
          },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.8,
      });

      response = openaiResponse.choices[0].message.content || '{"data": []}';
    }

    // Parse the response
    let data: string[] = [];
    try {
      const parsed = safeJsonParse(response, 'Theme generation response');
      if (Array.isArray(parsed)) {
        data = parsed;
      } else if (
        parsed &&
        typeof parsed === 'object' &&
        'data' in parsed &&
        Array.isArray((parsed as any).data)
      ) {
        data = (parsed as any).data;
      } else {
        // Fallback to extracting array from text
        const arrayMatch = response.match(/\[[\s\S]*\]/);
        if (arrayMatch) {
          data = safeJsonParse(arrayMatch[0], 'Array extraction');
        }
      }
    } catch (error) {
      console.warn(
        `Failed to parse themed data for ${theme} ${dataType}:`,
        error,
      );
      data = generateFallbackData(theme, dataType, count);
    }

    // Ensure we have enough data
    if (data.length < count) {
      const fallback = generateFallbackData(
        theme,
        dataType,
        count - data.length,
      );
      data = [...data, ...fallback];
    }

    return data.slice(0, count);
  } catch (error) {
    console.warn(
      `Failed to generate themed data for ${theme} ${dataType}:`,
      error,
    );
    return generateFallbackData(theme, dataType, count);
  }
};

/**
 * Generate fallback themed data when AI fails
 */
const generateFallbackData = (
  theme: Theme,
  dataType: string,
  count: number,
): string[] => {
  const fallbackData: Record<string, Record<string, string[]>> = {
    nba: {
      usernames: [
        'lebron.james',
        'kobe.bryant',
        'magic.johnson',
        'michael.jordan',
        'kareem.abdul',
        'stephen.curry',
        'kevin.durant',
        'giannis.antetokounmpo',
        'luka.doncic',
        'ja.morant',
        'jayson.tatum',
        'jimmy.butler',
        'kawhi.leonard',
        'russell.westbrook',
        'damian.lillard',
      ],
      hostnames: [
        'lakers-web-01',
        'bulls-db-02',
        'warriors-mail-03',
        'celtics-api-04',
        'heat-srv-05',
        'nets-app-06',
        'bucks-sql-07',
        'mavs-web-08',
        'grizzlies-db-09',
        'nuggets-api-10',
      ],
      fullNames: [
        'LeBron James',
        'Kobe Bryant',
        'Magic Johnson',
        'Michael Jordan',
        'Kareem Abdul-Jabbar',
        'Stephen Curry',
        'Kevin Durant',
        'Giannis Antetokounmpo',
        'Luka Doncic',
        'Ja Morant',
      ],
      emails: [
        'lebron.james@lakers.com',
        'kobe.bryant@lakers.com',
        'magic.johnson@lakers.com',
        'michael.jordan@bulls.com',
        'kareem.abdul@lakers.com',
      ],
      organizations: [
        'Lakers Analytics Division',
        'Bulls Security Team',
        'Warriors IT Department',
        'Celtics Data Center',
        'Heat Operations',
      ],
      ipAddresses: [
        '192.168.23.24',
        '10.0.33.33',
        '172.16.23.6',
        '192.168.8.24',
        '10.0.0.23',
      ],
      applicationNames: [
        'Lakers Stats Pro',
        'Bulls Scanner',
        'Warriors Analytics Suite',
        'Celtics Monitor',
        'Heat Dashboard',
      ],
      serviceNames: [
        'LakersAuthService',
        'BullsLogService',
        'WarriorsNetService',
        'CelticsSecService',
        'HeatMonitorService',
      ],
      eventDescriptions: [
        'Lakers defense protocol activated',
        'Bulls authentication challenge',
        'Warriors network scan detected',
        'Celtics security breach',
        'Heat monitoring alert',
      ],
      urls: [
        '/api/lakers/stats',
        '/bulls/player-data',
        '/warriors/analytics',
        '/celtics/scores',
        '/heat/roster',
      ],
      registryKeys: [
        'HKLM\\Software\\Lakers\\Config',
        'HKCU\\Software\\Bulls\\Settings',
        'HKLM\\System\\Warriors\\Service',
      ],
      filePaths: [
        'C:\\Lakers\\Reports\\championship.pdf',
        '/home/bulls/logs/game.log',
        '/opt/warriors/data/stats.json',
      ],
    },
    marvel: {
      usernames: [
        'tony.stark',
        'peter.parker',
        'steve.rogers',
        'bruce.banner',
        'natasha.romanoff',
        'clint.barton',
        'thor.odinson',
        'wanda.maximoff',
        'scott.lang',
        'carol.danvers',
      ],
      hostnames: [
        'iron-web-01',
        'spider-db-02',
        'shield-mail-03',
        'hulk-api-04',
        'widow-srv-05',
        'hawk-app-06',
        'thor-sql-07',
        'witch-web-08',
        'ant-db-09',
        'marvel-api-10',
      ],
      fullNames: [
        'Tony Stark',
        'Peter Parker',
        'Steve Rogers',
        'Bruce Banner',
        'Natasha Romanoff',
        'Clint Barton',
        'Thor Odinson',
        'Wanda Maximoff',
        'Scott Lang',
        'Carol Danvers',
      ],
      emails: [
        'tony.stark@starkindustries.com',
        'peter.parker@dailybugle.com',
        'steve.rogers@shield.gov',
        'bruce.banner@gamma.lab',
        'natasha.romanoff@shield.gov',
      ],
      organizations: [
        'Stark Industries Security',
        'SHIELD Operations',
        'Avengers Initiative',
        'Gamma Lab Research',
        'Web-Slinger Division',
      ],
      ipAddresses: [
        '192.168.10.1',
        '10.0.0.3',
        '172.16.0.7',
        '192.168.0.4',
        '10.0.0.9',
      ],
      applicationNames: [
        'Stark Analyzer',
        'Shield Monitor',
        'Avengers Toolkit',
        'Gamma Scanner',
        'Web Tracer',
      ],
      serviceNames: [
        'StarkSecurityService',
        'ShieldLogService',
        'AvengersNetService',
        'GammaMonitorService',
        'WebCrawlerService',
      ],
      eventDescriptions: [
        'Stark security protocol engaged',
        'Shield perimeter breach',
        'Avengers assembly triggered',
        'Gamma radiation detected',
        'Web pattern anomaly',
      ],
      urls: [
        '/api/stark/inventory',
        '/shield/classified',
        '/avengers/mission-brief',
        '/gamma/readings',
        '/web/patrol',
      ],
      registryKeys: [
        'HKLM\\Software\\Stark\\Armor',
        'HKCU\\Software\\Shield\\Agent',
        'HKLM\\System\\Avengers\\Protocol',
      ],
      filePaths: [
        'C:\\Stark\\Designs\\mark42.dwg',
        '/home/shield/intel/mission.txt',
        '/opt/avengers/data/roster.xml',
      ],
    },
    starwars: {
      usernames: [
        'luke.skywalker',
        'han.solo',
        'princess.leia',
        'obi.wan',
        'darth.vader',
        'yoda.master',
        'anakin.skywalker',
        'padme.amidala',
        'qui.gon',
        'mace.windu',
      ],
      hostnames: [
        'jedi-web-01',
        'rebel-db-02',
        'empire-mail-03',
        'force-api-04',
        'sith-srv-05',
        'death-app-06',
        'falcon-sql-07',
        'xwing-web-08',
        'tatooine-db-09',
        'coruscant-api-10',
      ],
      fullNames: [
        'Luke Skywalker',
        'Han Solo',
        'Princess Leia',
        'Obi-Wan Kenobi',
        'Darth Vader',
        'Master Yoda',
        'Anakin Skywalker',
        'Padme Amidala',
        'Qui-Gon Jinn',
        'Mace Windu',
      ],
      emails: [
        'luke.skywalker@rebels.org',
        'han.solo@smugglers.net',
        'leia.organa@rebels.org',
        'obi.wan@jedi.council',
        'vader@empire.gov',
      ],
      organizations: [
        'Rebel Alliance IT',
        'Imperial Security Bureau',
        'Jedi Council Tech',
        'Sith Operations',
        'Galactic Empire Systems',
      ],
      ipAddresses: [
        '192.168.4.4',
        '10.0.0.1',
        '172.16.5.5',
        '192.168.6.6',
        '10.0.0.2',
      ],
      applicationNames: [
        'Jedi Scanner',
        'Death Star Monitor',
        'Rebel Analytics',
        'Force Detector',
        'Empire Tracker',
      ],
      serviceNames: [
        'JediAuthService',
        'RebelLogService',
        'EmpireNetService',
        'ForceMonitorService',
        'SithSecurityService',
      ],
      eventDescriptions: [
        'Jedi mind trick detected',
        'Death Star vulnerability scan',
        'Rebel infiltration attempt',
        'Force disturbance sensed',
        'Empire patrol detected',
      ],
      urls: [
        '/api/jedi/training',
        '/empire/plans',
        '/rebels/intelligence',
        '/force/balance',
        '/sith/holocron',
      ],
      registryKeys: [
        'HKLM\\Software\\Jedi\\Force',
        'HKCU\\Software\\Empire\\Sith',
        'HKLM\\System\\Rebels\\Base',
      ],
      filePaths: [
        'C:\\Empire\\Plans\\deathstar.blueprint',
        '/home/jedi/training/force.guide',
        '/opt/rebels/data/plans.json',
      ],
    },
  };

  const themeData = fallbackData[theme] || fallbackData.nba;
  const typeData = themeData[dataType] || themeData.usernames;

  // Repeat and pad the data to reach the requested count
  const result: string[] = [];
  for (let i = 0; i < count; i++) {
    result.push(typeData[i % typeData.length]);
  }

  return result;
};

/**
 * Get themed data with caching and batch optimization
 */
export const getThemedData = async (
  theme: Theme,
  dataType: string,
  count: number = 20,
): Promise<string[]> => {
  const cacheKey = getCacheKey(theme, dataType, count);
  const cached = themeCache[cacheKey];

  // Return cached data if valid
  if (cached && isCacheValid(cached.timestamp)) {
    return cached.data;
  }

  // Try AI generation first, but use fallback if it fails or times out
  try {
    // Optimize batch size - generate more than requested to populate cache
    const batchSize = Math.max(count, 50); // Generate at least 50 items for better caching
    const data = await Promise.race([
      generateThemedDataWithAI(theme, dataType, batchSize),
      new Promise<string[]>(
        (_, reject) => setTimeout(() => reject(new Error('AI timeout')), 10000), // Increased timeout for batch generation
      ),
    ]);

    // Cache the full batch result
    const batchCacheKey = getCacheKey(theme, dataType, batchSize);
    themeCache[batchCacheKey] = {
      data,
      timestamp: Date.now(),
    };

    // Also cache the specific requested count
    themeCache[cacheKey] = {
      data: data.slice(0, count),
      timestamp: Date.now(),
    };

    return data.slice(0, count);
  } catch (error) {
    console.warn(
      `AI theme generation failed for ${theme} ${dataType}, using fallback`,
    );
    const fallbackData = generateFallbackData(theme, dataType, count);

    // Cache fallback data too (with shorter TTL)
    themeCache[cacheKey] = {
      data: fallbackData,
      timestamp: Date.now() - CACHE_TTL * 0.5, // Half TTL for fallback data
    };

    return fallbackData;
  }
};

/**
 * Batch generate multiple data types for a theme to optimize AI calls
 */
export const batchGenerateThemedData = async (
  theme: Theme,
  dataTypes: string[],
  count: number = 20,
): Promise<Record<string, string[]>> => {
  const results: Record<string, string[]> = {};

  // Check what's already cached
  const uncachedTypes: string[] = [];
  for (const dataType of dataTypes) {
    const cacheKey = getCacheKey(theme, dataType, count);
    const cached = themeCache[cacheKey];

    if (cached && isCacheValid(cached.timestamp)) {
      results[dataType] = cached.data;
    } else {
      uncachedTypes.push(dataType);
    }
  }

  // Generate uncached data in parallel (but limit concurrency to avoid rate limits)
  if (uncachedTypes.length > 0) {
    const batchPromises = uncachedTypes.map(async (dataType) => {
      try {
        const data = await getThemedData(theme, dataType, count);
        return { dataType, data };
      } catch (error) {
        console.warn(`Failed to generate ${dataType} for theme ${theme}`);
        return { dataType, data: generateFallbackData(theme, dataType, count) };
      }
    });

    const batchResults = await Promise.all(batchPromises);
    batchResults.forEach(({ dataType, data }) => {
      results[dataType] = data;
    });
  }

  return results;
};

/**
 * Get a random themed value
 */
export const getRandomThemedValue = async (
  theme: Theme,
  dataType: string,
): Promise<string> => {
  const data = await getThemedData(theme, dataType, 20);
  return data[Math.floor(Math.random() * data.length)];
};

/**
 * Clear theme cache
 */
export const clearThemeCache = (): void => {
  Object.keys(themeCache).forEach((key) => {
    delete themeCache[key];
  });
};

/**
 * Get theme context for AI prompts
 */
export const getThemeContext = (themeConfig: ParsedThemeConfig): string => {
  const activeThemes = Object.entries(themeConfig)
    .filter(([, theme]) => theme !== null)
    .map(([dataType, theme]) => `${dataType}: ${theme}`)
    .join(', ');

  if (!activeThemes) {
    return '';
  }

  return `
THEME CONTEXT:
Apply the following themed data generation:
${activeThemes}

Generate data that fits the specified themes while maintaining realism and security context.
For example:
- NBA theme usernames: lebron.james, kobe.bryant, magic.johnson
- Marvel theme hostnames: iron-web-01, spider-db-02, shield-mail-03
- Star Wars theme full names: Luke Skywalker, Han Solo, Princess Leia

Ensure themed data is appropriate for a professional security testing environment.
`;
};

import { OpenAI } from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import { getConfig } from '../get_config';
import { safeJsonParse } from './error_handling';

// Supported themes
// Note: Themes with fallback data work reliably even when AI fails
// Themes without fallback data depend on AI generation and fall back to NBA data if AI fails
export const SUPPORTED_THEMES = [
  // Themes with complete fallback data
  'nba', // ✅ Basketball players and teams
  'soccer', // ✅ Soccer players and teams
  'marvel', // ✅ Marvel superheroes and universe
  'starwars', // ✅ Star Wars characters and universe
  'tech_companies', // ✅ Tech industry leaders and companies
  'programming', // ✅ Programming language creators and tools

  // Themes with AI-only generation (fall back to NBA if AI fails)
  'nfl', // 🤖 American football
  'mlb', // 🤖 Baseball
  'movies', // 🤖 Movie characters and titles
  'tv_shows', // 🤖 TV show characters and titles
  'gaming', // 🤖 Video game characters and terms
  'mythology', // 🤖 Mythological figures and terms
  'literature', // 🤖 Literary characters and authors
  'history', // 🤖 Historical figures and events
  'anime', // 🤖 Anime characters and series
  'music', // 🤖 Musicians and music terms
  'food', // 🤖 Food and culinary terms
] as const;

// Themes that have complete fallback data implementations
export const THEMES_WITH_FALLBACK = [
  'nba',
  'soccer',
  'marvel',
  'starwars',
  'tech_companies',
  'programming',
] as const;

// Data types grouped by usage frequency in the actual codebase
export const CORE_DATA_TYPES = [
  'usernames',
  'hostnames',
  'domains',
  'processNames',
] as const;
export const IMPORTANT_DATA_TYPES = [
  'fileNames',
  'ipAddresses',
  'fullNames',
  'emails',
] as const;
export const SECONDARY_DATA_TYPES = [
  'organizations',
  'eventDescriptions',
  'urls',
] as const;
export const LEGACY_DATA_TYPES = [
  'companyNames',
  'applicationNames',
  'serviceNames',
  'registryKeys',
  'filePaths',
] as const;

// All data types in priority order
export const ALL_DATA_TYPES = [
  ...CORE_DATA_TYPES,
  ...IMPORTANT_DATA_TYPES,
  ...SECONDARY_DATA_TYPES,
  ...LEGACY_DATA_TYPES,
] as const;

export type Theme = (typeof SUPPORTED_THEMES)[number];

// Theme configuration interface
// Data types are grouped by usage frequency in the codebase
export interface ThemeConfig {
  // Core data types (heavily used in all log generators)
  usernames?: Theme; // 🔥 Used in all log types for authentication/user tracking
  hostnames?: Theme; // 🔥 Essential for all infrastructure logging
  domains?: Theme; // 🔥 Critical for network security and DNS
  processNames?: Theme; // 🔥 Key for endpoint security and system monitoring

  // Important data types (frequently used)
  fileNames?: Theme; // 🔴 File system monitoring and endpoint logs
  ipAddresses?: Theme; // 🔴 Network security and connection tracking
  fullNames?: Theme; // 🔴 User identity management and case data
  emails?: Theme; // 🔴 User profiles and organizational data

  // Secondary data types (moderate usage)
  organizations?: Theme; // 🟡 Knowledge base and company references
  eventDescriptions?: Theme; // 🟡 Process descriptions and system events
  urls?: Theme; // 🟡 HTTP logs and network analysis

  // Legacy/Rarely used data types (minimal usage)
  companyNames?: Theme; // 🟨 Overlap with organizations
  applicationNames?: Theme; // 🟨 Limited application generation
  serviceNames?: Theme; // 🟨 Limited service generation
  registryKeys?: Theme; // 🟨 Windows-specific, limited usage
  filePaths?: Theme; // 🟨 Overlap with fileNames
}

// Parsed theme configuration
export interface ParsedThemeConfig {
  // Core data types (heavily used)
  usernames: Theme | null;
  hostnames: Theme | null;
  domains: Theme | null;
  processNames: Theme | null;

  // Important data types (frequently used)
  fileNames: Theme | null;
  ipAddresses: Theme | null;
  fullNames: Theme | null;
  emails: Theme | null;

  // Secondary data types (moderate usage)
  organizations: Theme | null;
  eventDescriptions: Theme | null;
  urls: Theme | null;

  // Legacy/Rarely used data types
  companyNames: Theme | null;
  applicationNames: Theme | null;
  serviceNames: Theme | null;
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
Use famous names, characters, or terminology from the ${theme} domain.
Format: firstname.lastname (lowercase, dot separated).
Examples of good username patterns:
- For sports themes: player names like "lebron.james", "messi.lionel"
- For entertainment themes: character names like "luke.skywalker", "tony.stark"
- For tech themes: founder/leader names like "tim.cook", "elon.musk"
- For other themes: relevant figures or terminology
Return as JSON array.`,

    hostnames: `Generate ${count} realistic server/hostname names themed around ${theme}.
Combine ${theme} terminology with server functions.
Format: theme-function-number (lowercase, dash separated).
Examples of good hostname patterns:
- theme-web-01, theme-db-02, theme-mail-03, theme-api-04
- Where "theme" is replaced with relevant ${theme} terms
- Common server functions: web, db, mail, api, srv, app, sql, cache, proxy, dns
Return as JSON array.`,

    fullNames: `Generate ${count} realistic full names themed around ${theme}.
Use well-known figures, characters, or personalities from the ${theme} domain.
Format: First Last (proper case with proper capitalization).
Examples of good full name patterns:
- For sports: famous athlete names
- For entertainment: character or actor names
- For tech: industry leaders and innovators
- For other themes: relevant historical or fictional figures
Return as JSON array.`,

    domains: `Generate ${count} realistic domain names themed around ${theme}.
Use organizations, teams, companies, or entities from the ${theme} domain.
Format: domain.tld (lowercase).
Common TLDs: .com, .org, .net, .gov, .edu, .io, .tech
Examples of good domain patterns:
- Organization/team names + TLD
- Themed company names + TLD
- ${theme} terminology + appropriate TLD
Return as JSON array.`,

    fileNames: `Generate ${count} realistic file names themed around ${theme}.
Combine ${theme} terminology with common file purposes.
Include various extensions: .pdf, .docx, .exe, .dll, .ps1, .bat, .sh, .txt, .log, .csv, .xml, .json
Examples of good filename patterns:
- theme_report.pdf, theme_data.xlsx, theme_config.json
- theme_analysis.docx, theme_script.ps1, theme_service.exe
- Where "theme" represents relevant ${theme} terminology
Return as JSON array.`,

    processNames: `Generate ${count} realistic process names themed around ${theme}.
Combine ${theme} terminology with common process functions.
Format: theme-function.exe (lowercase, dash separated).
Common process functions: scanner, monitor, analyzer, service, updater, manager, daemon, client, server, agent
Examples of good process patterns:
- theme-scanner.exe, theme-monitor.exe, theme-service.exe
- Where "theme" represents relevant ${theme} terminology
Return as JSON array.`,

    companyNames: `Generate ${count} realistic company names themed around ${theme}.
Create business entities that would fit in the ${theme} domain.
Format: Company Name (proper case).
Common company suffixes: Inc, Corp, Corporation, Industries, Systems, Technologies, Solutions, Group, Ltd, LLC
Examples of good company patterns:
- Theme-related words + business suffix
- Names that sound professional but themed to ${theme}
Return as JSON array.`,

    emails: `Generate ${count} realistic email addresses themed around ${theme}.
Combine themed usernames with themed domain names.
Format: username@domain.tld (lowercase).
Examples of good email patterns:
- themed.username@themed-domain.com
- Use ${theme} terminology for both username and domain parts
- Common email domains for themes: organizations, companies, or entities from ${theme}
Return as JSON array.`,

    organizations: `Generate ${count} realistic organization names themed around ${theme}.
Create department or division names that combine ${theme} entities with business functions.
Format: Organization Name (proper case).
Common organizational functions: Security, IT Department, Analytics Division, Operations, Research, Development, Engineering
Examples of good organization patterns:
- [Theme Entity] + [Business Function]
- Professional sounding groups within the ${theme} domain
Return as JSON array.`,

    ipAddresses: `Generate ${count} realistic IP addresses that could have ${theme} significance.
Use valid IP address ranges: 192.168.x.x, 10.x.x.x, 172.16.x.x
Optionally incorporate meaningful numbers from ${theme} (jersey numbers, dates, references).
Format: IP address only (e.g., "192.168.1.1").
Examples of good IP patterns:
- Standard private IP ranges with potentially meaningful numbers
- Avoid obviously fake or invalid IP addresses
Return as JSON array.`,

    applicationNames: `Generate ${count} realistic application names themed around ${theme}.
Combine ${theme} terminology with software application types.
Format: Application Name (proper case).
Common application types: Scanner, Monitor, Analyzer, Suite, Toolkit, Manager, Dashboard, Studio, Pro, Client, Server
Examples of good application patterns:
- [Theme Term] + [Application Type]
- Professional software names that fit the ${theme} domain
Return as JSON array.`,

    serviceNames: `Generate ${count} realistic system service names themed around ${theme}.
Combine ${theme} terminology with common service functions.
Format: ServiceName (PascalCase, no spaces).
Common service functions: AuthService, LogService, NetService, SecurityService, MonitorService, DataService, ApiService, ConfigService
Examples of good service patterns:
- [ThemeTerm] + [ServiceFunction]
- System service names that incorporate ${theme} elements
Return as JSON array.`,

    eventDescriptions: `Generate ${count} realistic security event descriptions themed around ${theme}.
Create security-related events using ${theme} terminology and metaphors.
Format: Brief description (sentence case).
Common security events: protocol activated, breach detected, scan initiated, authentication challenge, perimeter alert, system intrusion
Examples of good event patterns:
- [Theme term] + [security action/event]
- Professional security descriptions with ${theme} flavor
Return as JSON array.`,

    urls: `Generate ${count} realistic URL paths themed around ${theme}.
Create API endpoints and web paths using ${theme} terminology.
Format: /path/endpoint (lowercase, slash separated).
Common path patterns: /api/theme/action, /theme/data-type, /theme/function
Common endpoints: stats, data, config, admin, reports, analytics, dashboard, settings
Examples of good URL patterns:
- /api/[theme-term]/[action]
- /[theme-term]/[data-type]
Return as JSON array.`,

    registryKeys: `Generate ${count} realistic Windows registry key paths themed around ${theme}.
Use standard registry roots with ${theme} terminology.
Format: Registry path with double backslashes (\\\\).
Common registry roots: HKLM\\\\Software, HKCU\\\\Software, HKLM\\\\System, HKEY_CLASSES_ROOT
Common registry purposes: Config, Settings, Service, Protocol, Agent, Application
Examples of good registry patterns:
- HKLM\\\\Software\\\\[ThemeTerm]\\\\[Purpose]
- HKCU\\\\Software\\\\[ThemeTerm]\\\\[Settings]
Return as JSON array.`,

    filePaths: `Generate ${count} realistic file paths themed around ${theme}.
Create full file paths using ${theme} terminology in directory and file names.
Format: Full file path with extension.
Include mix of Windows (C:\\\\) and Unix (/home/, /opt/) paths.
Common directories: Data, Reports, Logs, Config, Documents, Projects, Scripts
Common extensions: .pdf, .txt, .log, .json, .xml, .csv, .docx, .xlsx
Examples of good file path patterns:
- C:\\\\[ThemeTerm]\\\\[Directory]\\\\[themed-file].[ext]
- /home/[theme]/[directory]/[themed-file].[ext]
Return as JSON array.`,
  };

  const prompt = prompts[dataType as keyof typeof prompts] || prompts.usernames;

  try {
    const config = getConfig();
    let response: string = '';

    if (claude) {
      const claudeResponse = await claude.messages.create({
        model: config.claudeModel || 'claude-3-5-sonnet-20241022',
        max_tokens: 1500,
        messages: [
          {
            role: 'user',
            content: `${prompt}\n\nIMPORTANT: Return ONLY a valid JSON array of strings. No explanations, no markdown, no additional text. Just the JSON array.\nExample format: ["item1", "item2", "item3"]`,
          },
        ],
        temperature: 0.7,
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
            content: `${prompt}\n\nIMPORTANT: Return ONLY a valid JSON array of strings. No explanations, no markdown, no additional text. Just the JSON array.\nExample format: ["item1", "item2", "item3"]`,
          },
        ],
        temperature: 0.7,
        max_tokens: 1500,
      });

      response = openaiResponse.choices[0].message.content || '{"data": []}';
    }

    // Parse the response with improved error handling
    let data: string[] = [];
    try {
      // Clean the response first
      let cleanResponse = response.trim();

      // Try to extract JSON array from response
      const arrayMatch = cleanResponse.match(/\[[\s\S]*?\]/);
      if (arrayMatch) {
        cleanResponse = arrayMatch[0];
      }

      // Try direct JSON parsing first
      try {
        const parsed = JSON.parse(cleanResponse);
        if (Array.isArray(parsed)) {
          data = parsed.filter((item: any) => typeof item === 'string');
        }
      } catch (jsonError) {
        // Try with safeJsonParse as fallback
        const parsed = safeJsonParse(
          cleanResponse,
          'Theme generation response',
        );
        if (Array.isArray(parsed)) {
          data = parsed.filter((item: any) => typeof item === 'string');
        } else if (
          parsed &&
          typeof parsed === 'object' &&
          'data' in parsed &&
          Array.isArray((parsed as any).data)
        ) {
          data = (parsed as any).data.filter(
            (item: any) => typeof item === 'string',
          );
        }
      }
    } catch (error) {
      console.warn(
        `Failed to parse themed data for ${theme} ${dataType}, using fallback:`,
        error instanceof Error ? error.message : error,
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
      domains: [
        'lakers.com',
        'bulls.org',
        'warriors.net',
        'celtics.basketball',
        'nba.com',
        'espn.com',
        'sportsnet.com',
        'ballislife.net',
        'hoops.org',
        'basketball.com',
      ],
      fileNames: [
        'lebron_stats.pdf',
        'kobe_highlights.mp4',
        'magic_playbook.docx',
        'jordan_legacy.exe',
        'curry_analytics.xlsx',
        'durant_report.pdf',
        'nba_playoffs.pptx',
        'lakers_roster.txt',
        'bulls_dynasty.doc',
        'warriors_championship.pdf',
      ],
      processNames: [
        'lakers-analytics.exe',
        'bulls-stats.exe',
        'warriors-monitor.exe',
        'nba-tracker.exe',
        'celtics-scanner.exe',
        'heat-analyzer.exe',
        'nets-processor.exe',
        'bucks-service.exe',
        'mavs-updater.exe',
        'nuggets-daemon.exe',
      ],
      companyNames: [
        'Lakers Entertainment',
        'Bulls Corporation',
        'Warriors Inc',
        'Celtic Systems',
        'NBA Analytics',
        'Hoops Technologies',
        'Basketball Solutions',
        'Sports Data Corp',
        'Court Vision Inc',
        'Slam Dunk Systems',
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
      domains: [
        'starkindustries.com',
        'shield.gov',
        'avengers.org',
        'gamma.lab',
        'oscorp.com',
        'baxter.building',
        'xmen.academy',
        'wakanda.nation',
        'asgard.realm',
        'dailybugle.com',
      ],
      fileNames: [
        'stark_armor_mk42.dwg',
        'shield_protocols.pdf',
        'avengers_roster.xlsx',
        'gamma_research.doc',
        'web_shooter_specs.pdf',
        'vibranium_analysis.txt',
        'infinity_stones.docx',
        'hulk_containment.exe',
        'thor_hammer.blueprint',
        'cap_shield_design.pdf',
      ],
      processNames: [
        'stark-ai.exe',
        'shield-monitor.exe',
        'avengers-assemble.exe',
        'gamma-detector.exe',
        'web-crawler.exe',
        'vibranium-scanner.exe',
        'mjolnir-auth.exe',
        'arc-reactor.exe',
        'friday-ai.exe',
        'jarvis-protocol.exe',
      ],
      companyNames: [
        'Stark Industries',
        'Oscorp Corporation',
        'Baxter Foundation',
        'Roxxon Energy',
        'Hammer Tech',
        'Pym Technologies',
        'Rand Corporation',
        'Fisk Industries',
        'Alchemax Corp',
        'Trask Industries',
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
      domains: [
        'rebels.org',
        'empire.gov',
        'jedi.council',
        'sith.dark',
        'tatooine.rim',
        'coruscant.core',
        'deathstar.station',
        'alderaan.core',
        'dagobah.outer',
        'kamino.outer',
      ],
      fileNames: [
        'deathstar_plans.blueprint',
        'jedi_training.pdf',
        'force_guide.docx',
        'lightsaber_specs.dwg',
        'rebel_intelligence.txt',
        'imperial_protocol.exe',
        'falcon_schematics.pdf',
        'droid_programming.code',
        'holocron_data.archive',
        'hyperdrive_manual.pdf',
      ],
      processNames: [
        'force-detector.exe',
        'rebel-comm.exe',
        'empire-patrol.exe',
        'jedi-scanner.exe',
        'sith-tracker.exe',
        'deathstar-control.exe',
        'falcon-navigation.exe',
        'droid-protocol.exe',
        'lightsaber-calibration.exe',
        'hyperspace-calculator.exe',
      ],
      companyNames: [
        'Galactic Empire',
        'Rebel Alliance',
        'Jedi Order',
        'Sith Empire',
        'Trade Federation',
        'Kuat Drive Yards',
        'Corellian Engineering',
        'Sienar Fleet Systems',
        'Techno Union',
        'Banking Clan',
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
    soccer: {
      usernames: [
        'lionel.messi',
        'cristiano.ronaldo',
        'neymar.junior',
        'kylian.mbappe',
        'erling.haaland',
        'kevin.debruyne',
        'mohamed.salah',
        'sadio.mane',
        'virgil.vandijk',
        'luka.modric',
        'sergio.ramos',
        'robert.lewandowski',
        'karim.benzema',
        'paulo.dybala',
        'harry.kane',
      ],
      hostnames: [
        'barca-web-01',
        'madrid-db-02',
        'psg-mail-03',
        'city-api-04',
        'liverpool-srv-05',
        'bayern-app-06',
        'juventus-sql-07',
        'chelsea-web-08',
        'arsenal-db-09',
        'milan-api-10',
      ],
      fullNames: [
        'Lionel Messi',
        'Cristiano Ronaldo',
        'Neymar Jr',
        'Kylian Mbappe',
        'Erling Haaland',
        'Kevin De Bruyne',
        'Mohamed Salah',
        'Sadio Mane',
        'Virgil van Dijk',
        'Luka Modric',
      ],
      domains: [
        'barcelona.com',
        'realmadrid.com',
        'psg.fr',
        'mancity.com',
        'liverpool.com',
        'fcbayern.com',
        'juventus.com',
        'chelsea.com',
        'arsenal.com',
        'acmilan.com',
      ],
      fileNames: [
        'messi_stats.pdf',
        'ronaldo_goals.xlsx',
        'champions_league.pptx',
        'world_cup_2022.docx',
        'fifa_rankings.pdf',
        'transfer_market.xlsx',
        'tactical_analysis.doc',
        'player_performance.csv',
        'match_report.pdf',
        'training_schedule.xlsx',
      ],
      processNames: [
        'fifa-analyzer.exe',
        'soccer-stats.exe',
        'goal-tracker.exe',
        'match-predictor.exe',
        'player-scout.exe',
        'tactical-ai.exe',
        'formation-optimizer.exe',
        'transfer-calculator.exe',
        'penalty-analyzer.exe',
        'offside-detector.exe',
      ],
      companyNames: [
        'FC Barcelona',
        'Real Madrid CF',
        'Paris Saint-Germain',
        'Manchester City',
        'Liverpool FC',
        'Bayern Munich',
        'Juventus FC',
        'Chelsea FC',
        'Arsenal FC',
        'AC Milan',
      ],
      emails: [
        'lionel.messi@barcelona.com',
        'cristiano.ronaldo@juventus.com',
        'neymar.junior@psg.fr',
        'kylian.mbappe@psg.fr',
        'erling.haaland@mancity.com',
      ],
      organizations: [
        'Barcelona Analytics',
        'Real Madrid Tech',
        'PSG Digital',
        'City Football Group',
        'Liverpool Data Science',
      ],
      ipAddresses: [
        '192.168.10.10',
        '10.0.0.7',
        '172.16.0.9',
        '192.168.0.11',
        '10.0.0.30',
      ],
      applicationNames: [
        'Soccer Analytics Pro',
        'Goal Tracker Suite',
        'Match Predictor',
        'Player Scanner',
        'Tactical Analyzer',
      ],
      serviceNames: [
        'SoccerStatsService',
        'GoalTrackerService',
        'MatchPredictorService',
        'PlayerScoutService',
        'TacticalAnalysisService',
      ],
      eventDescriptions: [
        'Goal scoring opportunity detected',
        'Offside position identified',
        'Tactical formation change',
        'Player substitution protocol',
        'Match security alert',
      ],
      urls: [
        '/api/soccer/stats',
        '/players/performance',
        '/matches/live-score',
        '/transfers/market',
        '/tactics/analysis',
      ],
      registryKeys: [
        'HKLM\\Software\\Soccer\\Stats',
        'HKCU\\Software\\FIFA\\Settings',
        'HKLM\\System\\Match\\Config',
      ],
      filePaths: [
        'C:\\Soccer\\Stats\\messi_goals.csv',
        '/home/soccer/data/matches.json',
        '/opt/fifa/analytics/players.xml',
      ],
    },
    tech_companies: {
      usernames: [
        'tim.cook',
        'satya.nadella',
        'sundar.pichai',
        'elon.musk',
        'mark.zuckerberg',
        'jeff.bezos',
        'jensen.huang',
        'lisa.su',
        'andy.jassy',
        'pat.gelsinger',
        'arvind.krishna',
        'thomas.kurian',
        'amy.hood',
        'ruth.porat',
        'brian.krzanich',
      ],
      hostnames: [
        'apple-web-01',
        'microsoft-db-02',
        'google-mail-03',
        'tesla-api-04',
        'meta-srv-05',
        'amazon-app-06',
        'nvidia-sql-07',
        'amd-web-08',
        'intel-db-09',
        'oracle-api-10',
      ],
      fullNames: [
        'Tim Cook',
        'Satya Nadella',
        'Sundar Pichai',
        'Elon Musk',
        'Mark Zuckerberg',
        'Jeff Bezos',
        'Jensen Huang',
        'Lisa Su',
        'Andy Jassy',
        'Pat Gelsinger',
      ],
      domains: [
        'apple.com',
        'microsoft.com',
        'google.com',
        'tesla.com',
        'meta.com',
        'amazon.com',
        'nvidia.com',
        'amd.com',
        'intel.com',
        'oracle.com',
      ],
      fileNames: [
        'quarterly_earnings.pdf',
        'product_roadmap.pptx',
        'market_analysis.xlsx',
        'technical_specs.docx',
        'api_documentation.pdf',
        'security_audit.doc',
        'performance_metrics.csv',
        'code_review.txt',
        'deployment_guide.md',
        'architecture_diagram.png',
      ],
      processNames: [
        'cloud-sync.exe',
        'ai-processor.exe',
        'data-analytics.exe',
        'security-scanner.exe',
        'api-gateway.exe',
        'ml-pipeline.exe',
        'edge-computing.exe',
        'blockchain-validator.exe',
        'quantum-simulator.exe',
        'neural-network.exe',
      ],
      companyNames: [
        'Apple Inc',
        'Microsoft Corporation',
        'Alphabet Inc',
        'Tesla Inc',
        'Meta Platforms',
        'Amazon.com Inc',
        'NVIDIA Corporation',
        'Advanced Micro Devices',
        'Intel Corporation',
        'Oracle Corporation',
      ],
      emails: [
        'tim.cook@apple.com',
        'satya.nadella@microsoft.com',
        'sundar.pichai@google.com',
        'elon.musk@tesla.com',
        'mark.zuckerberg@meta.com',
      ],
      organizations: [
        'Apple Engineering',
        'Microsoft Azure',
        'Google Cloud',
        'Tesla Autopilot',
        'Meta Reality Labs',
      ],
      ipAddresses: [
        '192.168.1.1',
        '10.0.0.1',
        '172.16.0.1',
        '192.168.100.1',
        '10.10.10.1',
      ],
      applicationNames: [
        'Cloud Manager Pro',
        'AI Development Suite',
        'Data Pipeline Analyzer',
        'Security Monitor',
        'API Gateway Manager',
      ],
      serviceNames: [
        'CloudSyncService',
        'AIProcessorService',
        'DataAnalyticsService',
        'SecurityScannerService',
        'APIGatewayService',
      ],
      eventDescriptions: [
        'Cloud synchronization initiated',
        'AI model training started',
        'Data pipeline processing',
        'Security vulnerability detected',
        'API rate limit exceeded',
      ],
      urls: [
        '/api/cloud/storage',
        '/ai/machine-learning',
        '/data/analytics',
        '/security/scan',
        '/developer/portal',
      ],
      registryKeys: [
        'HKLM\\Software\\Cloud\\Config',
        'HKCU\\Software\\AI\\Settings',
        'HKLM\\System\\Security\\Scanner',
      ],
      filePaths: [
        'C:\\Cloud\\Data\\sync.log',
        '/home/dev/ai/models.pkl',
        '/opt/security/scanner/results.json',
      ],
    },
    programming: {
      usernames: [
        'linus.torvalds',
        'guido.vanrossum',
        'brendan.eich',
        'james.gosling',
        'bjarne.stroustrup',
        'dennis.ritchie',
        'ken.thompson',
        'tim.bernerslee',
        'john.carmack',
        'donald.knuth',
        'alan.turing',
        'ada.lovelace',
        'grace.hopper',
        'margaret.hamilton',
        'katherine.johnson',
      ],
      hostnames: [
        'linux-kernel-01',
        'python-dev-02',
        'javascript-v8-03',
        'java-jvm-04',
        'cpp-compiler-05',
        'unix-sys-06',
        'web-server-07',
        'game-engine-08',
        'algorithm-db-09',
        'quantum-comp-10',
      ],
      fullNames: [
        'Linus Torvalds',
        'Guido van Rossum',
        'Brendan Eich',
        'James Gosling',
        'Bjarne Stroustrup',
        'Dennis Ritchie',
        'Ken Thompson',
        'Tim Berners-Lee',
        'John Carmack',
        'Donald Knuth',
      ],
      domains: [
        'github.com',
        'stackoverflow.com',
        'python.org',
        'javascript.com',
        'cplusplus.com',
        'kernel.org',
        'opensource.org',
        'mozilla.org',
        'apache.org',
        'gnu.org',
      ],
      fileNames: [
        'kernel_module.c',
        'python_script.py',
        'react_component.js',
        'java_application.jar',
        'cpp_library.so',
        'makefile.mk',
        'dockerfile.yml',
        'package.json',
        'requirements.txt',
        'config.ini',
      ],
      processNames: [
        'gcc-compiler.exe',
        'python-interpreter.exe',
        'node-runtime.exe',
        'java-vm.exe',
        'git-daemon.exe',
        'docker-engine.exe',
        'nginx-server.exe',
        'mysql-server.exe',
        'redis-cache.exe',
        'elasticsearch.exe',
      ],
      companyNames: [
        'Linux Foundation',
        'Python Software Foundation',
        'Mozilla Foundation',
        'Apache Software Foundation',
        'Eclipse Foundation',
        'Free Software Foundation',
        'Open Source Initiative',
        'GitHub Inc',
        'Stack Overflow',
        'JetBrains',
      ],
      emails: [
        'linus.torvalds@kernel.org',
        'guido.vanrossum@python.org',
        'brendan.eich@mozilla.org',
        'james.gosling@oracle.com',
        'bjarne.stroustrup@tamu.edu',
      ],
      organizations: [
        'Linux Kernel Development',
        'Python Core Team',
        'JavaScript Standards Committee',
        'Java Community Process',
        'C++ Standards Committee',
      ],
      ipAddresses: [
        '192.168.0.100',
        '10.0.1.1',
        '172.16.1.1',
        '192.168.10.100',
        '10.1.1.1',
      ],
      applicationNames: [
        'Code Editor Pro',
        'Git Version Control',
        'Docker Container Manager',
        'Database Admin Tool',
        'API Testing Suite',
      ],
      serviceNames: [
        'CodeCompilerService',
        'GitRepositoryService',
        'DockerContainerService',
        'DatabaseService',
        'APITestingService',
      ],
      eventDescriptions: [
        'Code compilation started',
        'Git repository cloned',
        'Docker container deployed',
        'Database connection established',
        'API endpoint tested',
      ],
      urls: [
        '/api/code/compile',
        '/git/repository',
        '/docker/container',
        '/database/query',
        '/test/endpoint',
      ],
      registryKeys: [
        'HKLM\\Software\\IDE\\Config',
        'HKCU\\Software\\Git\\Settings',
        'HKLM\\System\\Docker\\Engine',
      ],
      filePaths: [
        'C:\\Dev\\Projects\\main.cpp',
        '/home/dev/python/script.py',
        '/opt/docker/containers/app.yml',
      ],
    },
  };

  const themeData = fallbackData[theme] || fallbackData.nba;
  const typeData = themeData[dataType] || themeData.usernames || [];

  // Warn if theme or data type is missing
  if (!fallbackData[theme]) {
    const hasAIOnly = !THEMES_WITH_FALLBACK.includes(theme as any);
    const warningMsg = hasAIOnly
      ? `Theme '${theme}' uses AI-only generation (no fallback data), using NBA theme as fallback`
      : `Theme '${theme}' not found in fallback data, using NBA theme instead`;
    console.warn(warningMsg);
  }
  if (!themeData[dataType]) {
    console.warn(
      `Data type '${dataType}' not found for theme '${theme}', using usernames instead`,
    );
  }

  // Repeat and pad the data to reach the requested count
  const result: string[] = [];
  for (let i = 0; i < count; i++) {
    result.push(typeData[i % typeData.length]);
  }

  return result;
};

/**
 * Get themed data with simplified caching
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
    const data = await Promise.race([
      generateThemedDataWithAI(theme, dataType, count),
      new Promise<string[]>(
        (_, reject) => setTimeout(() => reject(new Error('AI timeout')), 8000), // Reduced timeout for simpler processing
      ),
    ]);

    // Simple cache storage
    themeCache[cacheKey] = {
      data,
      timestamp: Date.now(),
    };

    return data;
  } catch (error) {
    console.warn(
      `AI theme generation failed for ${theme} ${dataType}, using fallback`,
    );
    const fallbackData = generateFallbackData(theme, dataType, count);

    // Cache fallback data with shorter TTL
    themeCache[cacheKey] = {
      data: fallbackData,
      timestamp: Date.now() - CACHE_TTL * 0.5,
    };

    return fallbackData;
  }
};

/**
 * Generate multiple data types for a theme (simplified batch processing)
 */
export const batchGenerateThemedData = async (
  theme: Theme,
  dataTypes: string[],
  count: number = 20,
): Promise<Record<string, string[]>> => {
  const results: Record<string, string[]> = {};

  // Process data types sequentially to avoid overwhelming AI APIs
  for (const dataType of dataTypes) {
    try {
      results[dataType] = await getThemedData(theme, dataType, count);
    } catch (error) {
      console.warn(
        `Failed to generate ${dataType} for theme ${theme}, using fallback`,
      );
      results[dataType] = generateFallbackData(theme, dataType, count);
    }
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
 * Get theme statistics for debugging/monitoring
 */
export const getThemeStats = () => {
  const cacheKeys = Object.keys(themeCache);
  const cacheStats = cacheKeys.reduce(
    (stats, key) => {
      const [theme, dataType] = key.split('-');
      if (!stats[theme]) stats[theme] = {};
      if (!stats[theme][dataType]) stats[theme][dataType] = 0;
      stats[theme][dataType]++;
      return stats;
    },
    {} as Record<string, Record<string, number>>,
  );

  return {
    totalCacheEntries: cacheKeys.length,
    themesWithFallback: THEMES_WITH_FALLBACK.length,
    totalSupportedThemes: SUPPORTED_THEMES.length,
    cacheByTheme: cacheStats,
    uptime: Date.now(),
  };
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

/**
 * Theme Usage Best Practices and Guidelines
 *
 * RECOMMENDED THEMES (with fallback data):
 * - 'nba', 'soccer', 'marvel', 'starwars', 'tech_companies', 'programming'
 * These themes work reliably even when AI fails.
 *
 * AI-ONLY THEMES (require internet/AI):
 * - 'nfl', 'mlb', 'movies', 'tv_shows', 'gaming', 'mythology', 'literature', 'history', 'anime', 'music', 'food'
 * These fall back to NBA data if AI generation fails.
 *
 * CORE DATA TYPES (most used):
 * - usernames, hostnames, domains, processNames
 *
 * USAGE EXAMPLES:
 *
 * Basic theme:
 * yarn start generate-logs -n 10 --theme soccer
 *
 * Mixed themes:
 * yarn start generate-logs -n 10 --theme "usernames:soccer,hostnames:tech_companies"
 *
 * PERFORMANCE TIPS:
 * - Use themes with fallback data for production/reliable environments
 * - AI-only themes work best with good internet connectivity
 * - Mixed themes allow granular control over different data types
 * - Cache TTL is 30 minutes, so repeated calls are fast
 *
 * TROUBLESHOOTING:
 * - If you see "using NBA theme as fallback" warnings, either:
 *   1. Check your internet connection for AI themes
 *   2. Use a theme with fallback data instead
 *   3. The theme name might be misspelled
 */
export const THEME_USAGE_GUIDE = {
  RECOMMENDED_THEMES: THEMES_WITH_FALLBACK,
  CORE_DATA_TYPES,
  IMPORTANT_DATA_TYPES,
  ALL_THEMES: SUPPORTED_THEMES,
  CACHE_TTL_MINUTES: 30,
  AI_TIMEOUT_SECONDS: 8,
} as const;

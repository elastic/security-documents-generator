/**
 * Universal Theme Generator
 * 
 * Centralized service for generating themed data throughout the security documents generator.
 * Provides a unified interface that chooses between AI-generated themes, fallback data, or faker.
 */

import { faker } from '@faker-js/faker';
import {
  Theme,
  ParsedThemeConfig,
  parseThemeConfig,
  getThemedData,
  getRandomThemedValue,
} from './theme_service';

// Themed data generation results
export interface ThemedUser {
  username: string;
  fullName: string;
  email: string;
}

export interface ThemedHost {
  hostname: string;
  ipAddress: string;
}

export interface ThemedFile {
  filename: string;
  path: string;
}

export interface ThemedProcess {
  name: string;
  description: string;
}

export interface ThemedOrganization {
  name: string;
  domain: string;
}

export interface ThemedApplication {
  name: string;
  serviceName: string;
}

export interface ThemedNetworkResource {
  url: string;
  domain: string;
  ipAddress: string;
}

export interface ThemedSystemResource {
  registryKey: string;
  eventDescription: string;
}

/**
 * Universal Theme Data Generator
 * Provides themed alternatives to faker calls throughout the codebase
 */
export class UniversalThemeGenerator {
  private themeConfig: ParsedThemeConfig | null = null;

  constructor(themeString?: string) {
    if (themeString) {
      this.themeConfig = parseThemeConfig(themeString);
    }
  }

  /**
   * Update the theme configuration
   */
  setTheme(themeString: string): void {
    this.themeConfig = parseThemeConfig(themeString);
  }

  /**
   * Clear theme configuration (use faker fallback)
   */
  clearTheme(): void {
    this.themeConfig = null;
  }

  /**
   * Generate a themed user or fall back to faker
   */
  async generateUser(): Promise<ThemedUser> {
    const usernameTheme = this.themeConfig?.usernames;
    const fullNameTheme = this.themeConfig?.fullNames;
    const emailTheme = this.themeConfig?.emails;

    let username: string;
    let fullName: string;
    let email: string;

    // Generate username
    if (usernameTheme) {
      try {
        username = await getRandomThemedValue(usernameTheme, 'usernames');
      } catch {
        username = `${faker.person.firstName().toLowerCase()}.${faker.person.lastName().toLowerCase()}`;
      }
    } else {
      username = `${faker.person.firstName().toLowerCase()}.${faker.person.lastName().toLowerCase()}`;
    }

    // Generate full name
    if (fullNameTheme) {
      try {
        fullName = await getRandomThemedValue(fullNameTheme, 'fullNames');
      } catch {
        fullName = faker.person.fullName();
      }
    } else {
      fullName = faker.person.fullName();
    }

    // Generate email
    if (emailTheme) {
      try {
        email = await getRandomThemedValue(emailTheme, 'emails');
      } catch {
        email = faker.internet.email();
      }
    } else {
      email = faker.internet.email();
    }

    return { username, fullName, email };
  }

  /**
   * Generate a themed hostname or fall back to faker
   */
  async generateHostname(): Promise<string> {
    const theme = this.themeConfig?.hostnames;
    
    if (theme) {
      try {
        return await getRandomThemedValue(theme, 'hostnames');
      } catch {
        // Fallback to faker
      }
    }
    
    // Default faker generation
    const departments = ['web', 'db', 'app', 'mail', 'dc', 'file', 'print', 'backup'];
    const environments = ['prod', 'dev', 'test', 'stage'];
    const department = faker.helpers.arrayElement(departments);
    const environment = faker.helpers.arrayElement(environments);
    const number = faker.number.int({ min: 1, max: 99 });
    
    return `${department}-${environment}-${number.toString().padStart(2, '0')}`;
  }

  /**
   * Generate a themed host with hostname and IP
   */
  async generateHost(): Promise<ThemedHost> {
    const hostname = await this.generateHostname();
    
    let ipAddress: string;
    const ipTheme = this.themeConfig?.ipAddresses;
    
    if (ipTheme) {
      try {
        ipAddress = await getRandomThemedValue(ipTheme, 'ipAddresses');
      } catch {
        ipAddress = faker.internet.ip();
      }
    } else {
      ipAddress = faker.internet.ip();
    }

    return { hostname, ipAddress };
  }

  /**
   * Generate a themed file or fall back to faker
   */
  async generateFile(): Promise<ThemedFile> {
    const fileTheme = this.themeConfig?.fileNames;
    const pathTheme = this.themeConfig?.filePaths;

    let filename: string;
    let path: string;

    // Generate filename
    if (fileTheme) {
      try {
        filename = await getRandomThemedValue(fileTheme, 'fileNames');
      } catch {
        filename = `${faker.system.fileName()}.${faker.helpers.arrayElement(['pdf', 'docx', 'exe', 'dll', 'txt'])}`;
      }
    } else {
      filename = `${faker.system.fileName()}.${faker.helpers.arrayElement(['pdf', 'docx', 'exe', 'dll', 'txt'])}`;
    }

    // Generate path
    if (pathTheme) {
      try {
        path = await getRandomThemedValue(pathTheme, 'filePaths');
      } catch {
        path = faker.system.filePath();
      }
    } else {
      path = faker.system.filePath();
    }

    return { filename, path };
  }

  /**
   * Generate a themed process or fall back to faker
   */
  async generateProcess(): Promise<ThemedProcess> {
    const processTheme = this.themeConfig?.processNames;
    const descriptionTheme = this.themeConfig?.eventDescriptions;

    let name: string;
    let description: string;

    // Generate process name
    if (processTheme) {
      try {
        name = await getRandomThemedValue(processTheme, 'processNames');
      } catch {
        name = `${faker.hacker.noun().replace(/\s+/g, '-').toLowerCase()}.exe`;
      }
    } else {
      name = `${faker.hacker.noun().replace(/\s+/g, '-').toLowerCase()}.exe`;
    }

    // Generate description
    if (descriptionTheme) {
      try {
        description = await getRandomThemedValue(descriptionTheme, 'eventDescriptions');
      } catch {
        description = faker.hacker.phrase();
      }
    } else {
      description = faker.hacker.phrase();
    }

    return { name, description };
  }

  /**
   * Generate a themed organization or fall back to faker
   */
  async generateOrganization(): Promise<ThemedOrganization> {
    const orgTheme = this.themeConfig?.organizations;
    const domainTheme = this.themeConfig?.domains;

    let name: string;
    let domain: string;

    // Generate organization name
    if (orgTheme) {
      try {
        name = await getRandomThemedValue(orgTheme, 'organizations');
      } catch {
        name = faker.company.name();
      }
    } else {
      name = faker.company.name();
    }

    // Generate domain
    if (domainTheme) {
      try {
        domain = await getRandomThemedValue(domainTheme, 'domains');
      } catch {
        domain = faker.internet.domainName();
      }
    } else {
      domain = faker.internet.domainName();
    }

    return { name, domain };
  }

  /**
   * Generate a themed application or fall back to faker
   */
  async generateApplication(): Promise<ThemedApplication> {
    const appTheme = this.themeConfig?.applicationNames;
    const serviceTheme = this.themeConfig?.serviceNames;

    let name: string;
    let serviceName: string;

    // Generate application name
    if (appTheme) {
      try {
        name = await getRandomThemedValue(appTheme, 'applicationNames');
      } catch {
        name = `${faker.hacker.noun()} ${faker.helpers.arrayElement(['Scanner', 'Monitor', 'Analyzer', 'Toolkit'])}`;
      }
    } else {
      name = `${faker.hacker.noun()} ${faker.helpers.arrayElement(['Scanner', 'Monitor', 'Analyzer', 'Toolkit'])}`;
    }

    // Generate service name
    if (serviceTheme) {
      try {
        serviceName = await getRandomThemedValue(serviceTheme, 'serviceNames');
      } catch {
        serviceName = `${faker.hacker.noun().replace(/\s+/g, '')}Service`;
      }
    } else {
      serviceName = `${faker.hacker.noun().replace(/\s+/g, '')}Service`;
    }

    return { name, serviceName };
  }

  /**
   * Generate themed network resources or fall back to faker
   */
  async generateNetworkResource(): Promise<ThemedNetworkResource> {
    const urlTheme = this.themeConfig?.urls;
    const domainTheme = this.themeConfig?.domains;
    const ipTheme = this.themeConfig?.ipAddresses;

    let url: string;
    let domain: string;
    let ipAddress: string;

    // Generate URL
    if (urlTheme) {
      try {
        url = await getRandomThemedValue(urlTheme, 'urls');
      } catch {
        url = `/${faker.internet.domainWord()}/${faker.internet.domainWord()}`;
      }
    } else {
      url = `/${faker.internet.domainWord()}/${faker.internet.domainWord()}`;
    }

    // Generate domain
    if (domainTheme) {
      try {
        domain = await getRandomThemedValue(domainTheme, 'domains');
      } catch {
        domain = faker.internet.domainName();
      }
    } else {
      domain = faker.internet.domainName();
    }

    // Generate IP address
    if (ipTheme) {
      try {
        ipAddress = await getRandomThemedValue(ipTheme, 'ipAddresses');
      } catch {
        ipAddress = faker.internet.ip();
      }
    } else {
      ipAddress = faker.internet.ip();
    }

    return { url, domain, ipAddress };
  }

  /**
   * Generate themed system resources or fall back to faker
   */
  async generateSystemResource(): Promise<ThemedSystemResource> {
    const registryTheme = this.themeConfig?.registryKeys;
    const eventTheme = this.themeConfig?.eventDescriptions;

    let registryKey: string;
    let eventDescription: string;

    // Generate registry key
    if (registryTheme) {
      try {
        registryKey = await getRandomThemedValue(registryTheme, 'registryKeys');
      } catch {
        registryKey = `HKLM\\Software\\${faker.company.name().replace(/\s+/g, '')}\\${faker.hacker.noun().replace(/\s+/g, '')}`;
      }
    } else {
      registryKey = `HKLM\\Software\\${faker.company.name().replace(/\s+/g, '')}\\${faker.hacker.noun().replace(/\s+/g, '')}`;
    }

    // Generate event description
    if (eventTheme) {
      try {
        eventDescription = await getRandomThemedValue(eventTheme, 'eventDescriptions');
      } catch {
        eventDescription = faker.hacker.phrase();
      }
    } else {
      eventDescription = faker.hacker.phrase();
    }

    return { registryKey, eventDescription };
  }

  /**
   * Check if any theme is configured
   */
  hasTheme(): boolean {
    return this.themeConfig !== null && Object.values(this.themeConfig).some(theme => theme !== null);
  }

  /**
   * Get the current theme configuration
   */
  getThemeConfig(): ParsedThemeConfig | null {
    return this.themeConfig;
  }
}

// Global instance for easy access
let globalThemeGenerator: UniversalThemeGenerator | null = null;

/**
 * Get or create the global theme generator instance
 */
export function getGlobalThemeGenerator(): UniversalThemeGenerator {
  if (!globalThemeGenerator) {
    globalThemeGenerator = new UniversalThemeGenerator();
  }
  return globalThemeGenerator;
}

/**
 * Set the global theme
 */
export function setGlobalTheme(themeString: string): void {
  getGlobalThemeGenerator().setTheme(themeString);
}

/**
 * Clear the global theme
 */
export function clearGlobalTheme(): void {
  getGlobalThemeGenerator().clearTheme();
}

/**
 * Quick access functions for common operations
 */
export async function getThemedUsername(fallback?: string): Promise<string> {
  const generator = getGlobalThemeGenerator();
  if (generator.hasTheme()) {
    try {
      const user = await generator.generateUser();
      return user.username;
    } catch {
      // Fall through to fallback
    }
  }
  return fallback || `${faker.person.firstName().toLowerCase()}.${faker.person.lastName().toLowerCase()}`;
}

export async function getThemedHostname(fallback?: string): Promise<string> {
  const generator = getGlobalThemeGenerator();
  if (generator.hasTheme()) {
    try {
      return await generator.generateHostname();
    } catch {
      // Fall through to fallback
    }
  }
  return fallback || `web-prod-${faker.number.int({ min: 1, max: 99 }).toString().padStart(2, '0')}`;
}

export async function getThemedProcessName(fallback?: string): Promise<string> {
  const generator = getGlobalThemeGenerator();
  if (generator.hasTheme()) {
    try {
      const process = await generator.generateProcess();
      return process.name;
    } catch {
      // Fall through to fallback
    }
  }
  return fallback || `${faker.hacker.noun().replace(/\s+/g, '-').toLowerCase()}.exe`;
}

export async function getThemedFilename(fallback?: string): Promise<string> {
  const generator = getGlobalThemeGenerator();
  if (generator.hasTheme()) {
    try {
      const file = await generator.generateFile();
      return file.filename;
    } catch {
      // Fall through to fallback
    }
  }
  return fallback || `${faker.system.fileName()}.exe`;
}

export async function getThemedDomain(fallback?: string): Promise<string> {
  const generator = getGlobalThemeGenerator();
  if (generator.hasTheme()) {
    try {
      const org = await generator.generateOrganization();
      return org.domain;
    } catch {
      // Fall through to fallback
    }
  }
  return fallback || faker.internet.domainName();
}
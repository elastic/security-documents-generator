/**
 * Base ML Data Generator
 * Migrated from Python DataGenerator class
 */

import { MLGeneratorConfig, MLDataDocument, GeneratorOptions } from '../types/ml_types';

export abstract class BaseMLGenerator {
  protected jobId: string;
  protected analysisField?: string;
  protected overField?: string;
  protected partitionField?: string;
  protected influencers?: string[];
  protected startTime: number;
  protected endTime: number;
  protected documentTemplate: Record<string, any>;
  protected currentTime: number;
  protected options: GeneratorOptions;

  constructor(config: MLGeneratorConfig, options: GeneratorOptions = {}) {
    this.jobId = config.jobId;
    this.analysisField = config.analysisField;
    this.overField = config.overField;
    this.partitionField = config.partitionField;
    this.influencers = config.influencers;
    this.startTime = config.startTime;
    this.endTime = config.endTime;
    this.documentTemplate = config.documentTemplate;
    this.currentTime = config.startTime;
    
    // Default options
    this.options = {
      anomalyRate: 0.0002, // 0.02% default
      timeIncrement: [1, 10], // 1-10 seconds
      burstSize: 100,
      stringLength: [5, 10],
      ...options
    };
  }

  /**
   * Calculate time range (12 days ago to midnight today)
   * Maintains Python implementation exactly
   */
  public static getTimeRange(): { start: number; end: number } {
    const now = new Date();
    const endTime = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      0, 0, 0, 0
    );
    const startTime = new Date(endTime.getTime() - 12 * 24 * 60 * 60 * 1000);
    
    return {
      start: Math.floor(startTime.getTime() / 1000),
      end: Math.floor(endTime.getTime() / 1000)
    };
  }

  /**
   * Generate field value based on field type and index
   * Enhanced context-aware field generation with theme support
   */
  protected getFieldValue(field: string, num: number): string | number {
    // Use themed data if available
    if (this.options.themedData) {
      if (field.includes('user.name') && this.options.themedData.usernames) {
        return this.options.themedData.usernames[num % this.options.themedData.usernames.length];
      }
      if (field.includes('host.name') && this.options.themedData.hostnames) {
        return this.options.themedData.hostnames[num % this.options.themedData.hostnames.length];
      }
      if (field.includes('process.name') && this.options.themedData.processNames) {
        return this.options.themedData.processNames[num % this.options.themedData.processNames.length];
      }
      if ((field.includes('domain') || field.includes('url')) && this.options.themedData.domains) {
        if (num === 1) {
          // Anomalous: suspicious domains
          return `${this.getRandomString(12)}.tk`;
        } else {
          // Normal: themed domains
          return this.options.themedData.domains[num % this.options.themedData.domains.length];
        }
      }
    }
    // IP address patterns
    if (field.includes('.ip')) {
      return `0.0.0.${num}`;
    }
    
    // Error code patterns (HTTP-style)
    if (field.includes('error_code')) {
      if (num < 10) {
        return parseInt(`40${num}`);
      } else {
        return parseInt(`4${num}`);
      }
    }
    
    // Port number patterns
    if (field.includes('.port')) {
      if (num < 10) {
        return parseInt(`100${num}`);
      } else {
        return parseInt(`10${num}`);
      }
    }
    
    // Process name patterns (context-aware)
    if (field.includes('process.name')) {
      const processes = ['cmd.exe', 'powershell.exe', 'bash', 'sudo', 'ssh', 'scp', 'curl', 'wget'];
      return processes[num % processes.length];
    }
    
    // Command line patterns (for scripts and commands)
    if (field.includes('command_line')) {
      if (num === 1) {
        // Anomalous: complex encoded commands
        return `powershell.exe -EncodedCommand ${this.getRandomString(64)}`;
      } else {
        // Normal: simple commands
        const commands = [
          'powershell.exe Get-Process',
          'cmd.exe /c dir',
          'bash -c "ls -la"',
          'sudo systemctl status'
        ];
        return commands[num % commands.length];
      }
    }
    
    // Domain/URL patterns
    if (field.includes('domain') || field.includes('url')) {
      if (num === 1) {
        // Anomalous: suspicious domains
        return `${this.getRandomString(12)}.tk`;
      } else {
        // Normal: legitimate domains
        const domains = ['microsoft.com', 'google.com', 'github.com', 'elastic.co'];
        return domains[num % domains.length];
      }
    }
    
    // DNS query patterns
    if (field.includes('dns.question.name')) {
      if (num === 1) {
        // Anomalous: DNS tunneling patterns
        return `${this.getRandomString(32)}.malicious.com`;
      } else {
        // Normal: common DNS queries
        const queries = ['www.google.com', 'api.github.com', 'elastic.co', 'microsoft.com'];
        return queries[num % queries.length];
      }
    }
    
    // User-Agent patterns
    if (field.includes('user_agent')) {
      if (num === 1) {
        // Anomalous: suspicious user agents
        return `${this.getRandomString(20)}`;
      } else {
        // Normal: common user agents
        const agents = [
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
          'curl/7.68.0',
          'wget/1.20.3'
        ];
        return agents[num % agents.length];
      }
    }
    
    // Geographic patterns
    if (field.includes('country') || field.includes('geo.country')) {
      const countries = ['US', 'GB', 'DE', 'JP', 'CN', 'RU', 'IN', 'BR'];
      return countries[num % countries.length];
    }
    
    // Default pattern
    return `${field}.${num}`;
  }

  /**
   * Generate random integer between start and end (inclusive)
   */
  protected getRandomInteger(start: number, end: number): number {
    return Math.floor(Math.random() * (end - start + 1)) + start;
  }

  /**
   * Generate random string of specified length
   */
  protected getRandomString(length: number): string {
    const chars = 'abcdefghijklmnopqrstuvwxyz';
    let result = '';
    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }

  /**
   * Check if current event should be anomalous
   */
  protected isAnomalousEvent(): boolean {
    return Math.random() < (this.options.anomalyRate || 0.0002);
  }

  /**
   * Add standard fields to document
   * Maintains Python add_fields logic exactly
   */
  protected addFields(doc: Record<string, any>, timestamp: number): MLDataDocument {
    const document: MLDataDocument = {
      ...doc,
      '@timestamp': timestamp,
      '_index': `test_${this.jobId}`
    };

    // Add over field if specified
    if (this.overField) {
      document[this.overField] = this.getFieldValue(
        this.overField,
        this.getRandomInteger(1, 4)
      );
    }

    // Add partition field if specified
    if (this.partitionField) {
      document[this.partitionField] = this.getFieldValue(
        this.partitionField,
        this.getRandomInteger(1, 101)
      );
    }

    // Add influencer fields if specified
    if (this.influencers) {
      for (const field of this.influencers) {
        if (!(field in document)) {
          document[field] = this.getFieldValue(
            field,
            this.getRandomInteger(1, 101)
          );
        }
      }
    }

    return document;
  }

  /**
   * Advance time by random increment
   */
  protected advanceTime(): void {
    const [min, max] = this.options.timeIncrement || [1, 10];
    this.currentTime += this.getRandomInteger(min, max);
  }

  /**
   * Get current hour from timestamp
   */
  protected getHour(timestamp: number): number {
    return new Date(timestamp * 1000).getHours();
  }

  /**
   * Abstract method to be implemented by specific generators
   */
  public abstract generate(): IterableIterator<MLDataDocument>;

  /**
   * Generate all data and return as array
   */
  public async generateAll(): Promise<MLDataDocument[]> {
    const documents: MLDataDocument[] = [];
    let documentCount = 0;
    const maxDocuments = 10000; // Safety limit

    for (const doc of this.generate()) {
      documents.push(doc);
      documentCount++;
      
      if (documentCount >= maxDocuments) {
        console.warn(`Generated maximum ${maxDocuments} documents for ${this.jobId}`);
        break;
      }
    }

    return documents;
  }

  /**
   * Reset generator to start time
   */
  public reset(): void {
    this.currentTime = this.startTime;
  }

  /**
   * Get generation progress (0-1)
   */
  public getProgress(): number {
    if (this.endTime <= this.startTime) return 1;
    return Math.min(1, (this.currentTime - this.startTime) / (this.endTime - this.startTime));
  }
}
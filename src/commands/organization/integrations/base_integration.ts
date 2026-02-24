/**
 * Base Integration Class
 * Abstract class defining the interface for all security integrations
 */

import { Organization, CorrelationMap } from '../types';
import { installPackage } from '../../../utils/kibana_api';
import { ingest } from '../../utils/indices';
import cliProgress from 'cli-progress';
import { chunk } from 'lodash-es';

/**
 * Document type for integration documents
 * Using a generic record type to allow any document structure
 */
export type IntegrationDocument = Record<string, unknown> & {
  '@timestamp': string;
};

/**
 * Data stream configuration
 */
export interface DataStreamConfig {
  name: string;
  index: string;
}

/**
 * Integration generation result
 */
export interface IntegrationResult {
  integrationName: string;
  documentsGenerated: number;
  dataStreams: string[];
  success: boolean;
  error?: string;
}

/**
 * Abstract base class for security integrations
 */
export abstract class BaseIntegration {
  /**
   * Package name for Fleet installation
   */
  abstract readonly packageName: string;

  /**
   * Display name for logging
   */
  abstract readonly displayName: string;

  /**
   * Data streams this integration writes to
   */
  abstract readonly dataStreams: DataStreamConfig[];

  /**
   * Whether this is a pre-release package (requires ?prerelease=true for Fleet API)
   */
  readonly prerelease: boolean = false;

  /**
   * Install the integration package via Fleet API
   */
  async install(space: string = 'default'): Promise<void> {
    console.log(`Installing ${this.displayName} package...`);
    try {
      await installPackage({ packageName: this.packageName, space, prerelease: this.prerelease });
      console.log(`  ✓ ${this.displayName} package installed`);
    } catch (error) {
      // Package might already be installed, which is fine
      if (error instanceof Error && error.message.includes('409')) {
        console.log(`  ✓ ${this.displayName} package already installed`);
      } else {
        throw error;
      }
    }
  }

  /**
   * Generate documents for this integration based on organization data
   */
  abstract generateDocuments(
    org: Organization,
    correlationMap: CorrelationMap
  ): Map<string, IntegrationDocument[]>;

  /**
   * Index generated documents to Elasticsearch
   */
  async indexDocuments(
    documentsMap: Map<string, IntegrationDocument[]>,
    showProgress: boolean = true
  ): Promise<number> {
    let totalIndexed = 0;

    for (const [index, documents] of documentsMap) {
      if (documents.length === 0) continue;

      console.log(`  Indexing ${documents.length} documents to ${index}...`);

      if (showProgress) {
        const progress = new cliProgress.SingleBar(
          {
            clearOnComplete: true,
            format: '    [{bar}] {percentage}% | {value}/{total}',
          },
          cliProgress.Presets.shades_classic
        );

        const chunks = chunk(documents, 1000);
        progress.start(documents.length, 0);

        for (const docChunk of chunks) {
          await ingest(index, docChunk);
          progress.increment(docChunk.length);
        }

        progress.stop();
      } else {
        await ingest(index, documents);
      }

      totalIndexed += documents.length;
    }

    return totalIndexed;
  }

  /**
   * Run the complete integration workflow
   */
  async run(
    org: Organization,
    correlationMap: CorrelationMap,
    space: string = 'default'
  ): Promise<IntegrationResult> {
    console.log(`\n--- ${this.displayName} Integration ---`);

    try {
      // Install the package
      await this.install(space);

      // Generate documents
      console.log(`Generating ${this.displayName} documents...`);
      const documentsMap = this.generateDocuments(org, correlationMap);

      // Index documents
      const totalIndexed = await this.indexDocuments(documentsMap);

      console.log(`  ✓ ${this.displayName}: ${totalIndexed} documents indexed`);

      return {
        integrationName: this.packageName,
        documentsGenerated: totalIndexed,
        dataStreams: this.dataStreams.map((ds) => ds.index),
        success: true,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`  ✗ ${this.displayName} failed: ${errorMessage}`);

      return {
        integrationName: this.packageName,
        documentsGenerated: 0,
        dataStreams: [],
        success: false,
        error: errorMessage,
      };
    }
  }

  /**
   * Get current timestamp in ISO format
   */
  protected getTimestamp(): string {
    return new Date().toISOString();
  }

  /**
   * Get timestamp with random offset (for realistic data distribution)
   */
  protected getRandomTimestamp(maxOffsetHours: number = 24): string {
    const now = new Date();
    const offsetMs = Math.random() * maxOffsetHours * 60 * 60 * 1000;
    return new Date(now.getTime() - offsetMs).toISOString();
  }
}

/**
 * Integration registry type
 */
export type IntegrationRegistry = Map<string, BaseIntegration>;

/**
 * Create an empty correlation map
 */
export const createEmptyCorrelationMap = (): CorrelationMap => ({
  oktaUserIdToEmployee: new Map(),
  employeeIdToOktaUserId: new Map(),
  awsUserToOktaUser: new Map(),
  departmentToOktaGroup: new Map(),
  entraIdUserIdToEmployee: new Map(),
  departmentToEntraIdGroup: new Map(),
  githubUsernameToEmployee: new Map(),
  duoUserIdToEmployee: new Map(),
  onePasswordUuidToEmployee: new Map(),
  crowdstrikeAgentIdToDevice: new Map(),
  jamfUdidToDevice: new Map(),
  adDnToEmployee: new Map(),
});

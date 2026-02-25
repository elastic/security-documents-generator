/**
 * AbuseCH Threat Intelligence Integration
 * Generates malware hash and malicious URL indicator documents
 */

import { BaseIntegration, IntegrationDocument, DataStreamConfig } from './base_integration';
import { Organization, CorrelationMap } from '../types';
import { faker } from '@faker-js/faker';
import {
  MALWARE_FAMILIES,
  MALWARE_HASHES,
  MALICIOUS_URLS,
  TI_CONFIDENCE_LEVELS,
  ABUSECH_MALWARE_TYPES,
  ABUSECH_THREAT_TYPES,
} from '../data/threat_intel_data';

/**
 * TI AbuseCH Integration
 */
export class TiAbusechIntegration extends BaseIntegration {
  readonly packageName = 'ti_abusech';
  readonly displayName = 'AbuseCH Threat Intelligence';

  readonly dataStreams: DataStreamConfig[] = [
    { name: 'malware', index: 'logs-ti_abusech.malware-default' },
    { name: 'url', index: 'logs-ti_abusech.url-default' },
  ];

  generateDocuments(
    org: Organization,
    _correlationMap: CorrelationMap
  ): Map<string, IntegrationDocument[]> {
    const documentsMap = new Map<string, IntegrationDocument[]>();
    const malwareDocs: IntegrationDocument[] = [];
    const urlDocs: IntegrationDocument[] = [];

    const indicatorCount = this.getIndicatorCount(org.size);

    // Generate malware hash indicators
    for (let i = 0; i < indicatorCount.malware; i++) {
      malwareDocs.push(this.generateMalwareDocument());
    }

    // Generate URL indicators
    for (let i = 0; i < indicatorCount.url; i++) {
      urlDocs.push(this.generateUrlDocument());
    }

    documentsMap.set('logs-ti_abusech.malware-default', malwareDocs);
    documentsMap.set('logs-ti_abusech.url-default', urlDocs);
    return documentsMap;
  }

  private generateMalwareDocument(): IntegrationDocument {
    const family = faker.helpers.arrayElement(MALWARE_FAMILIES);
    // Use deterministic hashes from our shared set so CrowdStrike alerts can reference them
    const sha256 = faker.helpers.arrayElement(MALWARE_HASHES);
    const md5 = faker.string.hexadecimal({ length: 32, prefix: '' }).toLowerCase();
    const sha1 = faker.string.hexadecimal({ length: 40, prefix: '' }).toLowerCase();
    const confidence = faker.helpers.weightedArrayElement(
      TI_CONFIDENCE_LEVELS.map((c) => ({ value: c.level, weight: c.weight }))
    );
    const fileType = faker.helpers.arrayElement(ABUSECH_MALWARE_TYPES);
    const firstSeen = faker.date.past({ years: 1 }).toISOString();
    const lastSeen = this.getRandomTimestamp(168); // Within last week

    const rawEvent = {
      file_size: String(faker.number.int({ min: 1024, max: 5242880 })),
      file_type: fileType,
      firstseen: firstSeen.replace('T', ' ').replace(/\.\d{3}Z$/, ''),
      imphash: null,
      md5_hash: md5,
      sha256_hash: sha256,
      sha1_hash: sha1,
      signature: family.name,
      ssdeep: faker.string.alphanumeric(64),
      tlsh: faker.string.alphanumeric(72).toUpperCase(),
      urlhaus_download: `https://urlhaus-api.abuse.ch/v1/download/${sha256}/`,
      reporter: family.reporter,
      tags: family.tags,
      confidence_level: confidence,
      virustotal: `${faker.number.int({ min: 10, max: 60 })} / 70`,
    };

    return {
      '@timestamp': lastSeen,
      message: JSON.stringify(rawEvent),
      data_stream: { namespace: 'default', type: 'logs', dataset: 'ti_abusech.malware' },
      tags: ['forwarded', 'ti_abusech-malware', 'threatintel', 'preserve_original_event'],
    } as IntegrationDocument;
  }

  private generateUrlDocument(): IntegrationDocument {
    const url = faker.helpers.arrayElement(MALICIOUS_URLS);
    const threatType = faker.helpers.arrayElement(ABUSECH_THREAT_TYPES);
    const status = faker.helpers.weightedArrayElement([
      { value: 'online', weight: 40 },
      { value: 'offline', weight: 40 },
      { value: 'unknown', weight: 20 },
    ]);
    const family = faker.helpers.arrayElement(MALWARE_FAMILIES);
    const firstSeen = faker.date.past({ years: 1 });
    const lastSeen = this.getRandomTimestamp(168);

    // Extract host from URL
    const urlObj = new URL(url);
    const host = urlObj.hostname;

    // Format dates as "yyyy-MM-dd HH:mm:ss UTC" (what the pipeline expects)
    const formatAbusechDate = (date: Date): string => {
      const pad = (n: number) => n.toString().padStart(2, '0');
      return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())} ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())} UTC`;
    };

    const rawEvent = {
      id: faker.string.numeric(7),
      url,
      host,
      date_added: formatAbusechDate(firstSeen),
      last_online: formatAbusechDate(new Date(lastSeen)),
      urlhaus_reference: `https://urlhaus.abuse.ch/url/${faker.string.numeric(7)}/`,
      reporter: 'abuse.ch',
      threat: threatType,
      status,
      tags: [family.name.toLowerCase(), threatType],
      blacklists: {
        surbl: faker.datatype.boolean(0.5) ? 'listed' : 'not listed',
        spamhaus_dbl: faker.datatype.boolean(0.5) ? 'listed' : 'not listed',
      },
    };

    return {
      '@timestamp': lastSeen,
      message: JSON.stringify(rawEvent),
      _conf: {
        interval: '1h',
      },
      data_stream: { namespace: 'default', type: 'logs', dataset: 'ti_abusech.url' },
      tags: ['forwarded', 'ti_abusech-url', 'preserve_original_event'],
    } as IntegrationDocument;
  }

  private getIndicatorCount(size: string): { malware: number; url: number } {
    switch (size) {
      case 'small':
        return { malware: 25, url: 25 };
      case 'medium':
        return { malware: 50, url: 50 };
      case 'enterprise':
        return { malware: 100, url: 100 };
      default:
        return { malware: 50, url: 50 };
    }
  }
}

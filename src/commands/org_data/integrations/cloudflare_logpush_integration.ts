/**
 * Cloudflare Logpush Integration
 * Generates HTTP request and firewall event documents
 */

import { BaseIntegration, IntegrationDocument, DataStreamConfig } from './base_integration';
import { Organization, CorrelationMap, CloudflareZone } from '../types';
import { faker } from '@faker-js/faker';
import {
  CLOUDFLARE_COLOS,
  CLOUDFLARE_WAF_RULES,
  HTTP_METHODS,
  API_PATHS,
  HTTP_STATUS_CODES,
  ATTACKER_IPS,
  ATTACKER_COUNTRIES,
  WEB_USER_AGENTS,
} from '../data/network_data';

/**
 * Cloudflare Logpush Integration
 */
export class CloudflareLogpushIntegration extends BaseIntegration {
  readonly packageName = 'cloudflare_logpush';
  readonly displayName = 'Cloudflare Logpush';

  readonly dataStreams: DataStreamConfig[] = [
    { name: 'http_request', index: 'logs-cloudflare_logpush.http_request-default' },
    { name: 'firewall_event', index: 'logs-cloudflare_logpush.firewall_event-default' },
  ];

  generateDocuments(
    org: Organization,
    _correlationMap: CorrelationMap
  ): Map<string, IntegrationDocument[]> {
    const documentsMap = new Map<string, IntegrationDocument[]>();
    const httpDocs: IntegrationDocument[] = [];
    const fwDocs: IntegrationDocument[] = [];

    const httpCount = this.getHttpRequestCount(org.size);
    const fwCount = Math.floor(httpCount * 0.1); // ~10% of traffic triggers firewall

    // Generate HTTP request logs (mix of legitimate and attack traffic)
    for (let i = 0; i < httpCount; i++) {
      const isAttack = faker.datatype.boolean(0.05); // 5% attack traffic
      const zone = faker.helpers.arrayElement(org.cloudflareZones);
      httpDocs.push(this.generateHttpDocument(zone, isAttack));
    }

    // Generate firewall event logs
    for (let i = 0; i < fwCount; i++) {
      const zone = faker.helpers.arrayElement(org.cloudflareZones);
      fwDocs.push(this.generateFirewallDocument(zone));
    }

    documentsMap.set('logs-cloudflare_logpush.http_request-default', httpDocs);
    documentsMap.set('logs-cloudflare_logpush.firewall_event-default', fwDocs);
    return documentsMap;
  }

  private generateHttpDocument(zone: CloudflareZone, isAttack: boolean): IntegrationDocument {
    const subdomain = faker.helpers.arrayElement(zone.subdomains);
    const host = `${subdomain}.${zone.name}`;
    const method = faker.helpers.weightedArrayElement(
      HTTP_METHODS.map((m) => ({ value: m.method, weight: m.weight }))
    );
    const path = faker.helpers.arrayElement(API_PATHS);
    const statusCode = isAttack
      ? faker.helpers.arrayElement([403, 429, 503])
      : faker.helpers.weightedArrayElement(
          HTTP_STATUS_CODES.map((s) => ({ value: s.code, weight: s.weight }))
        );
    const clientIp = isAttack ? faker.helpers.arrayElement(ATTACKER_IPS) : faker.internet.ipv4();
    const clientCountry = isAttack
      ? faker.helpers.arrayElement(ATTACKER_COUNTRIES)
      : faker.helpers.arrayElement(['US', 'GB', 'DE', 'FR', 'JP', 'AU', 'CA', 'BR']);
    const colo = faker.helpers.arrayElement(CLOUDFLARE_COLOS);
    const rayId = faker.string.hexadecimal({ length: 16, prefix: '' }).toLowerCase();
    const userAgent = faker.helpers.arrayElement(WEB_USER_AGENTS);

    const botScore = isAttack
      ? faker.number.int({ min: 1, max: 20 })
      : faker.number.int({ min: 30, max: 99 });

    const timestamp = this.getRandomTimestamp(48);

    const rawEvent = {
      ClientIP: clientIp,
      ClientASN: faker.number.int({ min: 1000, max: 65000 }),
      ClientCountry: clientCountry,
      ClientDeviceType: faker.helpers.arrayElement(['desktop', 'mobile', 'bot']),
      ClientRequestMethod: method,
      ClientRequestHost: host,
      ClientRequestPath: path,
      ClientRequestProtocol: 'HTTP/2',
      ClientRequestScheme: 'https',
      ClientRequestURI: `https://${host}${path}`,
      ClientRequestBytes: faker.number.int({ min: 100, max: 50000 }),
      ClientRequestUserAgent: userAgent,
      EdgeColoCode: colo,
      EdgeResponseStatus: statusCode,
      EdgeResponseBytes: faker.number.int({ min: 200, max: 500000 }),
      EdgeResponseContentType: faker.helpers.arrayElement([
        'application/json',
        'text/html',
        'text/css',
        'application/javascript',
      ]),
      EdgeStartTimestamp: new Date(timestamp).getTime(),
      EdgeEndTimestamp: new Date(timestamp).getTime() + faker.number.int({ min: 5, max: 500 }),
      EdgeTimeToFirstByteMs: faker.number.int({ min: 5, max: 500 }),
      OriginIP: faker.internet.ipv4(),
      OriginResponseStatus: statusCode,
      RayID: rayId,
      ZoneID: zone.id,
      ZoneName: zone.name,
      CacheCacheStatus: faker.helpers.arrayElement(['hit', 'miss', 'dynamic', 'expired', 'bypass']),
      BotScore: botScore,
      BotScoreSrc: faker.helpers.arrayElement(['Machine Learning', 'Heuristics', 'Not Computed']),
      WAFAction: isAttack ? 'block' : 'allow',
    };

    return {
      '@timestamp': timestamp,
      message: JSON.stringify(rawEvent),
      data_stream: {
        namespace: 'default',
        type: 'logs',
        dataset: 'cloudflare_logpush.http_request',
      },
    } as IntegrationDocument;
  }

  private generateFirewallDocument(zone: CloudflareZone): IntegrationDocument {
    const rule = faker.helpers.arrayElement(CLOUDFLARE_WAF_RULES);
    const action = faker.helpers.weightedArrayElement([
      { value: 'block', weight: 50 },
      { value: 'challenge', weight: 20 },
      { value: 'js_challenge', weight: 10 },
      { value: 'managed_challenge', weight: 10 },
      { value: 'log', weight: 10 },
    ]);
    const subdomain = faker.helpers.arrayElement(zone.subdomains);
    const host = `${subdomain}.${zone.name}`;
    const clientIp = faker.helpers.arrayElement(ATTACKER_IPS);
    const clientCountry = faker.helpers.arrayElement(ATTACKER_COUNTRIES);
    const rayId = faker.string.hexadecimal({ length: 16, prefix: '' }).toLowerCase();
    const userAgent = faker.helpers.arrayElement(WEB_USER_AGENTS);

    const timestamp = this.getRandomTimestamp(48);

    const rawEvent = {
      Action: action,
      ClientIP: clientIp,
      ClientASN: faker.number.int({ min: 1000, max: 65000 }),
      ClientCountry: clientCountry,
      ClientIPClass: faker.helpers.arrayElement([
        'clean',
        'badHost',
        'searchEngine',
        'monitoringService',
      ]),
      ClientRequestMethod: faker.helpers.arrayElement(['GET', 'POST', 'PUT']),
      ClientRequestHost: host,
      ClientRequestPath: faker.helpers.arrayElement(API_PATHS),
      ClientRequestProtocol: 'HTTP/2',
      ClientRequestScheme: 'https',
      ClientRequestUserAgent: userAgent,
      Datetime: new Date(timestamp).getTime(),
      EdgeResponseStatus: 403,
      RayID: rayId,
      RuleID: rule.id,
      Description: rule.description,
      Source: rule.source,
      Kind: 'firewall',
      ZoneName: zone.name,
      MatchIndex: 0,
    };

    return {
      '@timestamp': timestamp,
      message: JSON.stringify(rawEvent),
      data_stream: {
        namespace: 'default',
        type: 'logs',
        dataset: 'cloudflare_logpush.firewall_event',
      },
    } as IntegrationDocument;
  }

  private getHttpRequestCount(size: string): number {
    switch (size) {
      case 'small':
        return faker.number.int({ min: 200, max: 500 });
      case 'medium':
        return faker.number.int({ min: 500, max: 2000 });
      case 'enterprise':
        return faker.number.int({ min: 2000, max: 10000 });
      default:
        return 500;
    }
  }
}

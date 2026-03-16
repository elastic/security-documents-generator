/**
 * Lyve Cloud Integration
 * Generates S3 API audit log documents for Seagate Lyve Cloud
 * Based on the Elastic lyve_cloud integration package
 */

import {
  BaseIntegration,
  type IntegrationDocument,
  type DataStreamConfig,
} from './base_integration.ts';
import { type Organization, type Employee, type CorrelationMap } from '../types.ts';
import { faker } from '@faker-js/faker';

const S3_API_ACTIONS: Array<{ value: string; weight: number }> = [
  { value: 'GetObject', weight: 30 },
  { value: 'PutObject', weight: 20 },
  { value: 'HeadObject', weight: 15 },
  { value: 'ListBuckets', weight: 10 },
  { value: 'GetBucketLocation', weight: 8 },
  { value: 'DeleteObject', weight: 5 },
  { value: 'CreateBucket', weight: 3 },
  { value: 'DeleteBucket', weight: 1 },
  { value: 'ListObjectsV2', weight: 5 },
  { value: 'CopyObject', weight: 3 },
];

const BUCKET_NAMES = [
  'prod-backups',
  'staging-data',
  'analytics-exports',
  'compliance-logs',
  'media-assets',
  'dev-artifacts',
  'security-audit-trail',
  'customer-uploads',
];

const S3_STATUS_CODES: Array<{ status: string; code: number; weight: number }> = [
  { status: 'OK', code: 200, weight: 85 },
  { status: 'NoSuchKey', code: 404, weight: 5 },
  { status: 'AccessDenied', code: 403, weight: 5 },
  { status: 'NoSuchBucket', code: 404, weight: 3 },
  { status: 'InternalError', code: 500, weight: 2 },
];

export class LyveCloudIntegration extends BaseIntegration {
  readonly packageName = 'lyve_cloud';
  readonly displayName = 'Lyve Cloud';

  readonly dataStreams: DataStreamConfig[] = [
    { name: 'Audit Logs', index: 'logs-lyve_cloud.audit-default' },
  ];

  generateDocuments(
    org: Organization,
    _correlationMap: CorrelationMap,
  ): Map<string, IntegrationDocument[]> {
    const documentsMap = new Map<string, IntegrationDocument[]>();
    const documents: IntegrationDocument[] = [];

    for (const employee of org.employees) {
      const eventCount = faker.number.int({ min: 2, max: 5 });
      for (let i = 0; i < eventCount; i++) {
        documents.push(this.createAuditDocument(employee, org));
      }
    }

    documentsMap.set(this.dataStreams[0].index, documents);
    return documentsMap;
  }

  private createAuditDocument(employee: Employee, _org: Organization): IntegrationDocument {
    const api = faker.helpers.weightedArrayElement(
      S3_API_ACTIONS.map((a) => ({ value: a, weight: a.weight })),
    );
    const statusEntry = faker.helpers.weightedArrayElement(
      S3_STATUS_CODES.map((s) => ({ value: s, weight: s.weight })),
    );
    const bucket = faker.helpers.arrayElement(BUCKET_NAMES);
    const serviceAccountName = `${employee.userName}-terraform`;
    const timestamp = this.getRandomTimestamp(72);
    const sourceIp = faker.internet.ipv4();
    const forwardedIp = faker.internet.ipv4();
    const timeToResponse = faker.number.int({ min: 1000000, max: 100000000 });
    const timeToFirstByte = timeToResponse - faker.number.int({ min: 10000, max: 500000 });

    const auditEntry: Record<string, unknown> = {
      api: {
        name: api.value,
        bucket,
        status: statusEntry.status,
        statusCode: statusEntry.code,
        timeToResponse: `${timeToResponse}ns`,
        timeToFirstByte: `${timeToFirstByte}ns`,
      },
      time: timestamp,
      version: '1',
      requestID: faker.string.hexadecimal({ length: 16, prefix: '' }).toUpperCase(),
      userAgent: faker.helpers.arrayElement([
        'aws-cli/2.7.7 Python/3.9.11 Linux/5.15.0-52-generic',
        'MinIO (linux; amd64) minio-go/v7.0.15',
        'Boto3/1.26.0 Python/3.10.0',
        `s3cmd/2.3.0 Python/3.8.10 Linux/${faker.system.semver()}`,
      ]),
      deploymentid: faker.string.uuid(),
      requestHeader: {
        'X-Forwarded-For': `${forwardedIp}, ${sourceIp}`,
        'X-Forwarded-Host': 's3.us-east-1.lyvecloud.seagate.com',
        'X-Real-Ip': `${sourceIp}:${faker.number.int({ min: 10000, max: 65535 })}`,
      },
      responseHeader: {
        'Accept-Ranges': 'bytes',
        'X-Amz-Bucket-Region': 'us-east-1',
        'X-Amz-Server-Side-Encryption': 'AES256',
      },
    };

    if (api.value.includes('Object')) {
      (auditEntry.api as Record<string, unknown>).object = {
        key: `${faker.system.directoryPath()}/${faker.system.fileName()}`,
        size: faker.number.int({ min: 100, max: 50000000 }),
        sequencer: faker.string.hexadecimal({ length: 16, prefix: '' }).toUpperCase(),
      };
    }

    const rawAudit = {
      serviceAccountName,
      serviceAccountCreatorId: employee.email,
      auditEntry,
    };

    return {
      '@timestamp': timestamp,
      message: JSON.stringify(rawAudit),
      log: { file: { path: '/var/log/lyve/S3/audit.json' } },
      data_stream: { namespace: 'default', type: 'logs', dataset: 'lyve_cloud.audit' },
    } as IntegrationDocument;
  }
}

/**
 * Zoom Integration
 * Generates webhook event documents for Zoom
 * Based on the Elastic zoom integration package
 */

import { BaseIntegration, IntegrationDocument, DataStreamConfig } from './base_integration';
import { Organization, Employee, CorrelationMap } from '../types';
import { faker } from '@faker-js/faker';

const WEBHOOK_EVENTS: Array<{
  action: string;
  category: string[];
  type: string[];
  weight: number;
}> = [
  {
    action: 'meeting.started',
    category: ['session'],
    type: ['start'],
    weight: 20,
  },
  {
    action: 'meeting.ended',
    category: ['session'],
    type: ['end'],
    weight: 20,
  },
  {
    action: 'meeting.participant_joined',
    category: ['session'],
    type: ['info'],
    weight: 15,
  },
  {
    action: 'meeting.participant_left',
    category: ['session'],
    type: ['info'],
    weight: 10,
  },
  {
    action: 'user.activated',
    category: ['iam'],
    type: ['user', 'creation'],
    weight: 5,
  },
  {
    action: 'user.deactivated',
    category: ['iam'],
    type: ['user', 'deletion'],
    weight: 3,
  },
  {
    action: 'user.updated',
    category: ['iam'],
    type: ['user', 'change'],
    weight: 5,
  },
  {
    action: 'account.updated',
    category: ['iam'],
    type: ['user', 'change'],
    weight: 3,
  },
  {
    action: 'recording.completed',
    category: ['file'],
    type: ['creation'],
    weight: 8,
  },
  {
    action: 'recording.deleted',
    category: ['file'],
    type: ['deletion'],
    weight: 2,
  },
  {
    action: 'user.signed_in',
    category: ['authentication'],
    type: ['start'],
    weight: 8,
  },
  {
    action: 'user.signed_out',
    category: ['authentication'],
    type: ['end'],
    weight: 3,
  },
];

const MEETING_TOPICS = [
  'Daily Standup',
  'Sprint Planning',
  'Product Review',
  'Team Sync',
  'Customer Demo',
  'All Hands Meeting',
  'Architecture Review',
  '1:1 Meeting',
  'Security Review',
  'Incident Postmortem',
  'Design Review',
  'Onboarding Session',
];

export class ZoomIntegration extends BaseIntegration {
  readonly packageName = 'zoom';
  readonly displayName = 'Zoom';

  readonly dataStreams: DataStreamConfig[] = [
    { name: 'Webhook Events', index: 'logs-zoom.webhook-default' },
  ];

  generateDocuments(
    org: Organization,
    _correlationMap: CorrelationMap
  ): Map<string, IntegrationDocument[]> {
    const documentsMap = new Map<string, IntegrationDocument[]>();
    const documents: IntegrationDocument[] = [];
    const masterAccountId = faker.string.alphanumeric(22);

    for (const employee of org.employees) {
      const eventCount = faker.number.int({ min: 2, max: 4 });
      for (let i = 0; i < eventCount; i++) {
        documents.push(this.createWebhookDocument(employee, org, masterAccountId));
      }
    }

    documentsMap.set(this.dataStreams[0].index, documents);
    return documentsMap;
  }

  private createWebhookDocument(
    employee: Employee,
    org: Organization,
    masterAccountId: string
  ): IntegrationDocument {
    const eventDef = faker.helpers.weightedArrayElement(
      WEBHOOK_EVENTS.map((e) => ({ value: e, weight: e.weight }))
    );
    const timestamp = this.getRandomTimestamp(72);
    const operatorId = faker.string.alphanumeric(22);
    const accountId = faker.string.alphanumeric(22);
    const isMeeting = eventDef.action.startsWith('meeting.');
    const isRecording = eventDef.action.startsWith('recording.');

    const payload: Record<string, unknown> = {
      account_id: accountId,
      operator: employee.email,
      operator_id: operatorId,
      time_stamp: new Date(timestamp).getTime(),
    };

    const zoomFields: Record<string, unknown> = {
      master_account_id: masterAccountId,
      operator: employee.email,
      operator_id: operatorId,
      account_id: accountId,
    };

    if (isMeeting) {
      const meetingId = faker.number.int({ min: 10000000000, max: 99999999999 });
      const topic = faker.helpers.arrayElement(MEETING_TOPICS);
      const participants = faker.number.int({ min: 2, max: 20 });
      const duration = faker.number.int({ min: 5, max: 120 });
      const targetEmployee = faker.helpers.arrayElement(org.employees);

      payload.object = {
        id: meetingId,
        topic,
        host_id: operatorId,
        host_email: employee.email,
        duration,
        start_time: timestamp,
        type: faker.helpers.arrayElement([1, 2, 3]),
      };

      zoomFields.meeting = {
        id: String(meetingId),
        topic,
        host_id: operatorId,
        duration,
        start_time: timestamp,
        type: faker.helpers.arrayElement(['instant', 'scheduled', 'recurring']),
      };

      if (eventDef.action.includes('participant')) {
        zoomFields.participant = {
          id: faker.string.alphanumeric(22),
          user_name: `${targetEmployee.firstName} ${targetEmployee.lastName}`,
          email: targetEmployee.email,
          join_time: timestamp,
        };
      }

      if (eventDef.action === 'meeting.ended') {
        (zoomFields.meeting as Record<string, unknown>).participants_count = participants;
      }
    }

    if (isRecording) {
      const meetingId = faker.number.int({ min: 10000000000, max: 99999999999 });
      zoomFields.recording = {
        meeting_id: String(meetingId),
        host_email: employee.email,
        topic: faker.helpers.arrayElement(MEETING_TOPICS),
        total_size: faker.number.int({ min: 1000000, max: 500000000 }),
        recording_count: faker.number.int({ min: 1, max: 5 }),
        type: faker.helpers.arrayElement(['shared_screen_with_speaker_view', 'audio_only']),
      };
    }

    if (eventDef.action.startsWith('user.') && !eventDef.action.includes('signed')) {
      zoomFields.user = {
        id: operatorId,
        email: employee.email,
        first_name: employee.firstName,
        last_name: employee.lastName,
        type: faker.helpers.arrayElement([1, 2]),
        dept: employee.department,
      };
    }

    if (eventDef.action === 'account.updated') {
      zoomFields.account = {
        account_name: org.name,
        account_alias: org.name.substring(0, 2).toUpperCase(),
      };
    }

    const rawEvent = JSON.stringify({
      event: eventDef.action,
      payload: { ...payload },
    });

    const relatedUsers: string[] = [operatorId];
    if (eventDef.action.startsWith('user.')) {
      relatedUsers.push(employee.email);
    }

    return {
      '@timestamp': timestamp,
      event: {
        action: eventDef.action,
        category: eventDef.category,
        type: eventDef.type,
        kind: 'event',
        original: rawEvent,
        dataset: 'zoom.webhook',
        timezone: '+00:00',
      },
      zoom: zoomFields,
      user: {
        id: operatorId,
        email: employee.email,
      },
      observer: { product: 'Webhook', vendor: 'Zoom' },
      related: { user: relatedUsers },
      tags: ['preserve_original_event', 'zoom-webhook', 'forwarded'],
      data_stream: { namespace: 'default', type: 'logs', dataset: 'zoom.webhook' },
    } as IntegrationDocument;
  }
}

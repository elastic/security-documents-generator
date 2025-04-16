import {
  GeneratorEntry,
  GeneratorDoc,
  GeneratorFn,
  TimeWindow,
} from '../../types';
import { faker } from '@faker-js/faker';
import { createTimestampInWindow } from '../../utils';

function generateOktaMFADenyEvents({
  matchingCount,
  noiseCount,
  userCount,
  timeWindow,
}: {
  matchingCount: number;
  noiseCount: number;
  userCount: number;
  timeWindow: TimeWindow;
}): GeneratorDoc[] {
  const events: GeneratorDoc[] = [];

  // Generate matching events (users with 5+ deny pushes in a 10-minute window)
  events.push(
    ...generateMatchingDenyEvents({ matchingCount, userCount, timeWindow }),
  );

  // Generate noise events (users with fewer than 5 deny pushes in any 10-minute window)
  events.push(
    ...generateNoiseDenyEvents({ noiseCount, userCount, timeWindow }),
  );

  return events;
}

function generateMatchingDenyEvents({
  matchingCount,
  userCount,
  timeWindow,
}: {
  matchingCount: number;
  userCount: number;
  timeWindow: TimeWindow;
}): GeneratorDoc[] {
  const events: GeneratorDoc[] = [];

  // Generate user email addresses for the matching events
  const userEmails: string[] = [];
  for (let i = 0; i < userCount; i++) {
    userEmails.push(faker.internet.email().toLowerCase());
  }

  // Create sets of 5+ deny pushes for users within 10-minute windows
  for (let i = 0; i < matchingCount; i++) {
    // Select a random user
    const userEmail = userEmails[Math.floor(Math.random() * userEmails.length)];

    // Create a random base timestamp within the time window
    const baseTimestamp = new Date(createTimestampInWindow(timeWindow));

    // Round down to the nearest 10-minute window
    baseTimestamp.setMinutes(Math.floor(baseTimestamp.getMinutes() / 10) * 10);
    baseTimestamp.setSeconds(0);
    baseTimestamp.setMilliseconds(0);

    // Determine number of deny pushes for this user in this window (5-15)
    const denyPushCount = 5 + Math.floor(Math.random() * 11);

    // Generate the specified number of deny push events for this user in this 10-minute window
    for (let j = 0; j < denyPushCount; j++) {
      // Create a timestamp within the 10-minute window from the base timestamp
      const eventTimestamp = new Date(baseTimestamp);
      eventTimestamp.setSeconds(Math.floor(Math.random() * 600)); // Random seconds within 10 minutes (0-599)

      events.push({
        index: 'logs-okta-default',
        source: {
          '@timestamp': eventTimestamp.toISOString(),
          event: {
            action: 'user.mfa.okta_verify.deny_push',
            outcome: 'FAILURE',
            category: ['authentication'],
            type: ['info'],
            reason: 'User denied MFA push notification',
          },
          okta: {
            actor: {
              alternate_id: userEmail,
              display_name: faker.person.fullName(),
              id: faker.string.uuid(),
              type: 'User',
            },
            client: {
              ip: faker.internet.ip(),
              user_agent: {
                browser: faker.internet.userAgent(),
              },
              zone: 'LAN',
            },
            security_context: {
              domain: userEmail.split('@')[1],
              is_remote: faker.datatype.boolean(),
            },
            request: {
              ip_chain: [
                {
                  ip: faker.internet.ip(),
                  source: faker.internet.domainName(),
                },
              ],
            },
            outcome: {
              result: 'DENY',
              reason: 'User rejected authentication attempt',
            },
            transaction: {
              id: faker.string.uuid(),
              type: 'WEB',
            },
            debug_context: {
              debug_data: {
                request_id: faker.string.uuid(),
                request_uri: '/api/v1/authn',
                threat_suspected: 'false',
              },
            },
          },
        },
      });
    }
  }

  return events;
}

function generateNoiseDenyEvents({
  noiseCount,
  userCount,
  timeWindow,
}: {
  noiseCount: number;
  userCount: number;
  timeWindow: TimeWindow;
}): GeneratorDoc[] {
  const events: GeneratorDoc[] = [];

  // Generate user email addresses for the noise events
  const userEmails: string[] = [];
  for (let i = 0; i < userCount; i++) {
    userEmails.push(faker.internet.email().toLowerCase());
  }

  // Create sets of 1-4 deny pushes for users within various 10-minute windows
  let remainingNoise = noiseCount;
  while (remainingNoise > 0) {
    // Select a random user
    const userEmail = userEmails[Math.floor(Math.random() * userEmails.length)];

    // Create a random base timestamp within the time window
    const baseTimestamp = new Date(createTimestampInWindow(timeWindow));

    // Round down to the nearest 10-minute window
    baseTimestamp.setMinutes(Math.floor(baseTimestamp.getMinutes() / 10) * 10);
    baseTimestamp.setSeconds(0);
    baseTimestamp.setMilliseconds(0);

    // Determine number of deny pushes for this user in this window (1-4)
    const denyPushCount = 1 + Math.floor(Math.random() * 4);

    // Generate the specified number of deny push events for this user in this 10-minute window
    for (let j = 0; j < denyPushCount && remainingNoise > 0; j++) {
      // Create a timestamp within the 10-minute window from the base timestamp
      const eventTimestamp = new Date(baseTimestamp);
      eventTimestamp.setSeconds(Math.floor(Math.random() * 600)); // Random seconds within 10 minutes (0-599)

      events.push({
        index: 'logs-okta-default',
        source: {
          '@timestamp': eventTimestamp.toISOString(),
          event: {
            action: 'user.mfa.okta_verify.deny_push',
            outcome: 'FAILURE',
            category: ['authentication'],
            type: ['info'],
            reason: 'User denied MFA push notification',
          },
          okta: {
            actor: {
              alternate_id: userEmail,
              display_name: faker.person.fullName(),
              id: faker.string.uuid(),
              type: 'User',
            },
            client: {
              ip: faker.internet.ip(),
              user_agent: {
                browser: faker.internet.userAgent(),
              },
              zone: 'LAN',
            },
            security_context: {
              domain: userEmail.split('@')[1],
              is_remote: faker.datatype.boolean(),
            },
            request: {
              ip_chain: [
                {
                  ip: faker.internet.ip(),
                  source: faker.internet.domainName(),
                },
              ],
            },
            outcome: {
              result: 'DENY',
              reason: 'User rejected authentication attempt',
            },
            transaction: {
              id: faker.string.uuid(),
              type: 'WEB',
            },
            debug_context: {
              debug_data: {
                request_id: faker.string.uuid(),
                request_uri: '/api/v1/authn',
                threat_suspected: 'false',
              },
            },
          },
        },
      });

      remainingNoise--;
    }

    // Also generate some additional noise with different event actions
    if (remainingNoise > 0 && Math.random() > 0.7) {
      const otherActions = [
        'user.mfa.okta_verify.verification_success',
        'user.authentication.verify',
        'user.session.start',
        'user.session.end',
        'user.mfa.factor.update',
        'user.mfa.okta_verify.access_token_success',
      ];

      const action =
        otherActions[Math.floor(Math.random() * otherActions.length)];

      events.push({
        index: 'logs-okta-default',
        source: {
          '@timestamp': createTimestampInWindow(timeWindow),
          event: {
            action: action,
            outcome: action.includes('success') ? 'SUCCESS' : 'UNKNOWN',
            category: ['authentication'],
            type: ['info'],
          },
          okta: {
            actor: {
              alternate_id: userEmail,
              display_name: faker.person.fullName(),
              id: faker.string.uuid(),
              type: 'User',
            },
            client: {
              ip: faker.internet.ip(),
              user_agent: {
                browser: faker.internet.userAgent(),
              },
              zone: 'LAN',
            },
            transaction: {
              id: faker.string.uuid(),
              type: 'WEB',
            },
          },
        },
      });

      remainingNoise--;
    }
  }

  return events;
}

const generateTestData: GeneratorFn = async ({ timeWindow }) => {
  const matchingCount: number = 10; // Number of "clusters" of matching events (5+ denies in 10 min)
  const noiseCount: number = 200; // Number of noise events
  const userCount: number = 30; // Number of unique users
  return generateOktaMFADenyEvents({
    matchingCount,
    noiseCount,
    userCount,
    timeWindow,
  });
};

export const credentialAccessMfaBombingPushNotications: GeneratorEntry = {
  id: 'credential_access_mfa_bombing_push_notications',
  generate: generateTestData,
};

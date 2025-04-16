import {
  GeneratorEntry,
  GeneratorDoc,
  GeneratorFn,
  TimeWindow,
} from '../../types';
import { faker } from '@faker-js/faker';
import { createTimestampInWindow } from '../../utils';

function generateOktaPasswordResetEvents({
  suspiciousActorCount,
  normalActorCount,
  timeWindow,
}: {
  suspiciousActorCount: number;
  normalActorCount: number;
  timeWindow: TimeWindow;
}): GeneratorDoc[] {
  const events: GeneratorDoc[] = [];

  // Generate events for suspicious actors (resetting passwords for many distinct users)
  events.push(
    ...generateSuspiciousResetEvents({ suspiciousActorCount, timeWindow }),
  );

  // Generate noise events (normal password reset activity)
  events.push(...generateNormalResetEvents({ normalActorCount, timeWindow }));

  return events;
}

function generateSuspiciousResetEvents({
  suspiciousActorCount,
  timeWindow,
}: {
  suspiciousActorCount: number;
  timeWindow: TimeWindow;
}): GeneratorDoc[] {
  const events: GeneratorDoc[] = [];

  // Generate suspicious actors (e.g., IT admins who are resetting too many passwords)
  for (let i = 0; i < suspiciousActorCount; i++) {
    const actorEmail = faker.internet.email().toLowerCase();
    const actorName = faker.person.fullName();
    const actorId = faker.string.uuid();

    // Generate a unique dt_hash for each actor (representing an actor's device/session)
    const dtHash = faker.string.alphanumeric(32).toLowerCase();

    // For each suspicious actor, generate resets for 11-20 unique users (exceeding the threshold of 10)
    const uniqueUserCount = 11 + Math.floor(Math.random() * 10);
    const targetUsers: Array<{ name: string; email: string; id: string }> = [];

    for (let j = 0; j < uniqueUserCount; j++) {
      targetUsers.push({
        name: faker.person.fullName(),
        email: faker.internet.email().toLowerCase(),
        id: faker.string.uuid(),
      });
    }

    // Generate 16-30 reset events for this actor (exceeding the threshold of 15)
    const resetCount = 16 + Math.floor(Math.random() * 15);

    // Ensure every unique user gets at least one reset
    // First, reset each unique user at least once
    for (let k = 0; k < uniqueUserCount; k++) {
      events.push(
        createResetEvent({
          timeWindow,
          actorId,
          actorName,
          actorEmail,
          dtHash,
          targetUser: targetUsers[k],
        }),
      );
    }

    // Then distribute the remaining resets
    for (let k = uniqueUserCount; k < resetCount; k++) {
      // Randomly select a target user from our list
      const targetUser =
        targetUsers[Math.floor(Math.random() * targetUsers.length)];

      events.push(
        createResetEvent({
          timeWindow,
          actorId,
          actorName,
          actorEmail,
          dtHash,
          targetUser,
        }),
      );
    }
  }

  return events;
}

function createResetEvent({
  timeWindow,
  actorId,
  actorName,
  actorEmail,
  dtHash,
  targetUser,
}: {
  timeWindow: TimeWindow;
  actorId: string;
  actorName: string;
  actorEmail: string;
  dtHash: string;
  targetUser: { name: string; email: string; id: string };
}): GeneratorDoc {
  return {
    index: 'logs-okta.system-default',
    source: {
      '@timestamp': createTimestampInWindow(timeWindow),
      event: {
        dataset: 'okta.system',
        action: 'user.account.reset_password',
        outcome: 'SUCCESS',
        category: ['iam'],
        type: ['user'],
        reason: 'Password reset initiated by admin',
      },
      source: {
        user: {
          id: actorId,
          full_name: actorName,
          email: actorEmail,
        },
      },
      user: {
        target: {
          id: targetUser.id,
          full_name: targetUser.name,
          email: targetUser.email,
        },
      },
      okta: {
        actor: {
          alternate_id: actorEmail,
          display_name: actorName,
          id: actorId,
          type: 'User',
        },
        target: [
          {
            alternate_id: targetUser.email,
            display_name: targetUser.name,
            id: targetUser.id,
            type: 'User',
          },
        ],
        client: {
          ip: faker.internet.ip(),
          user_agent: {
            browser: faker.internet.userAgent(),
          },
          zone: 'ADMIN',
        },
        debug_context: {
          debug_data: {
            request_id: faker.string.uuid(),
            request_uri:
              '/api/v1/users/' + targetUser.id + '/lifecycle/reset_password',
            dt_hash: dtHash,
          },
        },
        outcome: {
          result: 'SUCCESS',
          reason: 'Password reset successful',
        },
        transaction: {
          id: faker.string.uuid(),
          type: 'WEB',
        },
        event_type: 'policy.evaluate_sign_on',
      },
    },
  };
}

function generateNormalResetEvents({
  normalActorCount,
  timeWindow,
}: {
  normalActorCount: number;
  timeWindow: TimeWindow;
}): GeneratorDoc[] {
  const events: GeneratorDoc[] = [];

  // Generate normal actors (e.g., IT admins doing regular password resets)
  for (let i = 0; i < normalActorCount; i++) {
    const actorEmail = faker.internet.email().toLowerCase();
    const actorName = faker.person.fullName();
    const actorId = faker.string.uuid();

    // Generate a unique dt_hash for each actor
    const dtHash = faker.string.alphanumeric(32).toLowerCase();

    // Generate some users that need password resets
    // For normal actors, generate resets for 1-10 unique users (below the threshold of 10)
    const uniqueUserCount = 1 + Math.floor(Math.random() * 9); // Changed to max 9 to ensure below 10
    const targetUsers: Array<{ name: string; email: string; id: string }> = [];

    for (let j = 0; j < uniqueUserCount; j++) {
      targetUsers.push({
        name: faker.person.fullName(),
        email: faker.internet.email().toLowerCase(),
        id: faker.string.uuid(),
      });
    }

    // Generate 1-15 reset events for this actor (at or below the threshold of 15)
    const resetCount = 1 + Math.floor(Math.random() * 14); // Changed to max 14 to ensure at most 15

    for (let k = 0; k < resetCount; k++) {
      // Randomly select a target user from our list
      const targetUser =
        targetUsers[Math.floor(Math.random() * targetUsers.length)];

      events.push(
        createResetEvent({
          timeWindow,
          actorId,
          actorName,
          actorEmail,
          dtHash,
          targetUser,
        }),
      );
    }

    // Generate other types of events for additional noise
    if (Math.random() > 0.7) {
      const otherActions = [
        'user.account.update_profile',
        'user.account.unlock',
        'user.account.disable',
        'user.mfa.factor.update',
        'group.user.add',
        'application.user.provision',
      ];

      const randomActionCount = Math.floor(Math.random() * 5) + 1;

      for (let a = 0; a < randomActionCount; a++) {
        const action =
          otherActions[Math.floor(Math.random() * otherActions.length)];
        const targetUser =
          targetUsers[Math.floor(Math.random() * targetUsers.length)];

        events.push({
          index: 'logs-okta.system-default',
          source: {
            '@timestamp': createTimestampInWindow(timeWindow),
            event: {
              dataset: 'okta.system',
              action: action,
              outcome: 'SUCCESS',
              category: ['iam'],
              type: ['user'],
            },
            source: {
              user: {
                id: actorId,
                full_name: actorName,
                email: actorEmail,
              },
            },
            user: {
              target: {
                id: targetUser.id,
                full_name: targetUser.name,
                email: targetUser.email,
              },
            },
            okta: {
              actor: {
                alternate_id: actorEmail,
                display_name: actorName,
                id: actorId,
                type: 'User',
              },
              debug_context: {
                debug_data: {
                  dt_hash: dtHash,
                },
              },
              outcome: {
                result: 'SUCCESS',
              },
            },
          },
        });
      }
    }

    // Generate self-resets (where actor = target) which should be excluded by the query
    if (Math.random() > 0.5) {
      const selfResetCount = Math.floor(Math.random() * 3) + 1;

      for (let s = 0; s < selfResetCount; s++) {
        events.push({
          index: 'logs-okta.system-default',
          source: {
            '@timestamp': createTimestampInWindow(timeWindow),
            event: {
              dataset: 'okta.system',
              action: 'user.account.reset_password',
              outcome: 'SUCCESS',
              category: ['iam'],
              type: ['user'],
              reason: 'Self-service password reset',
            },
            source: {
              user: {
                id: actorId,
                full_name: actorName,
                email: actorEmail,
              },
            },
            user: {
              target: {
                id: actorId,
                full_name: actorName,
                email: actorEmail,
              },
            },
            okta: {
              actor: {
                alternate_id: actorEmail,
                display_name: actorName,
                id: actorId,
                type: 'User',
              },
              target: [
                {
                  alternate_id: actorEmail,
                  display_name: actorName,
                  id: actorId,
                  type: 'User',
                },
              ],
              debug_context: {
                debug_data: {
                  request_id: faker.string.uuid(),
                  request_uri:
                    '/api/v1/users/' + actorId + '/lifecycle/reset_password',
                  dt_hash: dtHash,
                },
              },
              outcome: {
                result: 'SUCCESS',
                reason: 'Self-service password reset successful',
              },
            },
          },
        });
      }
    }
  }

  return events;
}

// Main generator function using the parameters
const generateTestData: GeneratorFn = async ({ timeWindow }) => {
  const suspiciousActorCount: number = 3; // Number of actors with suspicious reset patterns
  const normalActorCount: number = 15; // Number of actors with normal reset patterns
  return generateOktaPasswordResetEvents({
    suspiciousActorCount,
    normalActorCount,
    timeWindow,
  });
};

export const credentialAccessRapidResetPasswordRequestsForDifferentUsers: GeneratorEntry =
  {
    id: 'credential_access_rapid_reset_password_requests_for_different_users',
    generate: generateTestData,
  };

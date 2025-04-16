import {
  GeneratorEntry,
  GeneratorDoc,
  GeneratorFn,
  TimeWindow,
} from '../../types';
import { faker } from '@faker-js/faker';
import { createTimestampInWindow } from '../../utils';

function generateOktaMultiCountryLogins({
  suspiciousUserCount,
  normalUserCount,
  timeWindow,
}: {
  suspiciousUserCount: number;
  normalUserCount: number;
  timeWindow: TimeWindow;
}): GeneratorDoc[] {
  const events: GeneratorDoc[] = [];

  // Generate events for suspicious users (logging in from multiple countries in the same hour)
  events.push(
    ...generateSuspiciousLoginEvents({ suspiciousUserCount, timeWindow }),
  );

  // Generate normal login events (logins from a single country)
  events.push(...generateNormalLoginEvents({ normalUserCount, timeWindow }));

  return events;
}

function generateSuspiciousLoginEvents({
  suspiciousUserCount,
  timeWindow,
}: {
  suspiciousUserCount: number;
  timeWindow: TimeWindow;
}): GeneratorDoc[] {
  const events: GeneratorDoc[] = [];

  // Generate suspicious users (users who login from multiple countries in the same hour)
  for (let i = 0; i < suspiciousUserCount; i++) {
    const userEmail = faker.internet.email().toLowerCase();
    const userName = faker.person.fullName();
    const userId = faker.string.uuid();

    // List of countries for suspicious logins
    const countries = [
      { name: 'United States', code: 'US' },
      { name: 'Russia', code: 'RU' },
      { name: 'China', code: 'CN' },
      { name: 'United Kingdom', code: 'GB' },
      { name: 'Germany', code: 'DE' },
      { name: 'India', code: 'IN' },
      { name: 'Brazil', code: 'BR' },
      { name: 'Japan', code: 'JP' },
      { name: 'Australia', code: 'AU' },
      { name: 'Canada', code: 'CA' },
    ];

    // For each suspicious user, generate 2-5 logins from different countries within the same hour
    const countryCount = 2 + Math.floor(Math.random() * 4); // 2-5 countries
    const selectedCountries = faker.helpers
      .shuffle([...countries])
      .slice(0, countryCount);

    // Create a base timestamp for this hour window
    const baseTimestamp = createTimestampInWindow(timeWindow);
    const hourStart = new Date(baseTimestamp);
    hourStart.setMinutes(0, 0, 0);

    // Generate login events for each country within the same hour
    for (let j = 0; j < selectedCountries.length; j++) {
      const country = selectedCountries[j];

      // Create timestamp within the same hour
      const eventTimestamp = new Date(hourStart);
      eventTimestamp.setMinutes(
        Math.floor(Math.random() * 60),
        Math.floor(Math.random() * 60),
        0,
      );

      events.push({
        index: 'logs-okta.system-default',
        source: {
          '@timestamp': eventTimestamp.toISOString(),
          event: {
            dataset: 'okta.system',
            outcome: 'SUCCESS',
            category: ['authentication'],
            type: ['start'],
          },
          source: {
            user: {
              id: userId,
              full_name: userName,
              email: userEmail,
            },
          },
          client: {
            geo: {
              country_name: country.name,
              country_iso_code: country.code,
              region_name: faker.location.state(),
              city_name: faker.location.city(),
            },
            ip: faker.internet.ip(),
            user_agent: {
              name: faker.internet.userAgent(),
            },
          },
          okta: {
            event_type: 'policy.evaluate_sign_on',
            actor: {
              alternate_id: userEmail,
              display_name: userName,
              id: userId,
              type: 'User',
            },
            client: {
              ip: faker.internet.ip(),
              user_agent: {
                browser: faker.internet.userAgent(),
              },
              zone: 'null',
              device: faker.helpers.arrayElement([
                'Mobile',
                'Computer',
                'Tablet',
              ]),
              geographical_context: {
                country: country.name,
                city: faker.location.city(),
                state: faker.location.state(),
              },
            },
            outcome: {
              result: faker.helpers.arrayElement(['ALLOW', 'SUCCESS']),
              reason: 'Login successful',
            },
            transaction: {
              id: faker.string.uuid(),
              type: 'WEB',
            },
            request: {
              ip_chain: [
                {
                  ip: faker.internet.ip(),
                  geographical_context: {
                    country: country.name,
                    city: faker.location.city(),
                    state: faker.location.state(),
                  },
                },
              ],
            },
            security_context: {
              domain: faker.internet.domainName(),
            },
          },
        },
      });
    }
  }

  return events;
}

function generateNormalLoginEvents({
  normalUserCount,
  timeWindow,
}: {
  normalUserCount: number;
  timeWindow: TimeWindow;
}): GeneratorDoc[] {
  const events: GeneratorDoc[] = [];

  // Generate normal users (users who login from a single country)
  for (let i = 0; i < normalUserCount; i++) {
    const userEmail = faker.internet.email().toLowerCase();
    const userName = faker.person.fullName();
    const userId = faker.string.uuid();

    // List of countries for normal logins (pick one)
    const countries = [
      { name: 'United States', code: 'US' },
      { name: 'United Kingdom', code: 'GB' },
      { name: 'Canada', code: 'CA' },
      { name: 'Germany', code: 'DE' },
      { name: 'France', code: 'FR' },
      { name: 'Australia', code: 'AU' },
      { name: 'Japan', code: 'JP' },
      { name: 'Brazil', code: 'BR' },
      { name: 'Italy', code: 'IT' },
      { name: 'Spain', code: 'ES' },
    ];

    // Select a single country for this normal user
    const country = faker.helpers.arrayElement(countries);

    // Generate 1-5 login events for this user (but all from the same country)
    const loginCount = 1 + Math.floor(Math.random() * 5);

    for (let j = 0; j < loginCount; j++) {
      events.push({
        index: 'logs-okta.system-default',
        source: {
          '@timestamp': createTimestampInWindow(timeWindow),
          event: {
            dataset: 'okta.system',
            outcome: 'SUCCESS',
            category: ['authentication'],
            type: ['start'],
          },
          source: {
            user: {
              id: userId,
              full_name: userName,
              email: userEmail,
            },
          },
          client: {
            geo: {
              country_name: country.name,
              country_iso_code: country.code,
              region_name: faker.location.state(),
              city_name: faker.location.city(),
            },
            ip: faker.internet.ip(),
            user_agent: {
              name: faker.internet.userAgent(),
            },
          },
          okta: {
            event_type: 'policy.evaluate_sign_on',
            actor: {
              alternate_id: userEmail,
              display_name: userName,
              id: userId,
              type: 'User',
            },
            client: {
              ip: faker.internet.ip(),
              user_agent: {
                browser: faker.internet.userAgent(),
              },
              zone: 'null',
              device: faker.helpers.arrayElement([
                'Mobile',
                'Computer',
                'Tablet',
              ]),
              geographical_context: {
                country: country.name,
                city: faker.location.city(),
                state: faker.location.state(),
              },
            },
            outcome: {
              result: faker.helpers.arrayElement(['ALLOW', 'SUCCESS']),
              reason: 'Login successful',
            },
            transaction: {
              id: faker.string.uuid(),
              type: 'WEB',
            },
            request: {
              ip_chain: [
                {
                  ip: faker.internet.ip(),
                  geographical_context: {
                    country: country.name,
                    city: faker.location.city(),
                    state: faker.location.state(),
                  },
                },
              ],
            },
            security_context: {
              domain: faker.internet.domainName(),
            },
          },
        },
      });
    }

    // Generate some other Okta events for additional noise
    if (Math.random() > 0.7) {
      const otherEventTypes = [
        'user.authentication.auth_via_mfa',
        'user.session.start',
        'user.session.refresh',
        'user.mfa.factor.verify',
        'system.client.request.completed',
      ];

      const randomEventCount = Math.floor(Math.random() * 3) + 1;

      for (let e = 0; e < randomEventCount; e++) {
        const eventType = faker.helpers.arrayElement(otherEventTypes);

        events.push({
          index: 'logs-okta.system-default',
          source: {
            '@timestamp': createTimestampInWindow(timeWindow),
            event: {
              dataset: 'okta.system',
              outcome: 'SUCCESS',
              category: ['authentication'],
              type: ['info'],
            },
            source: {
              user: {
                id: userId,
                full_name: userName,
                email: userEmail,
              },
            },
            client: {
              geo: {
                country_name: country.name,
                country_iso_code: country.code,
                region_name: faker.location.state(),
                city_name: faker.location.city(),
              },
              ip: faker.internet.ip(),
            },
            okta: {
              event_type: eventType,
              actor: {
                alternate_id: userEmail,
                display_name: userName,
                id: userId,
                type: 'User',
              },
              client: {
                geographical_context: {
                  country: country.name,
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
  }

  return events;
}

// Main generator function using the parameters
const generateTestData: GeneratorFn = async ({ timeWindow }) => {
  const suspiciousUserCount: number = 5; // Number of users with suspicious multi-country login patterns
  const normalUserCount: number = 20; // Number of users with normal login patterns
  return generateOktaMultiCountryLogins({
    suspiciousUserCount,
    normalUserCount,
    timeWindow,
  });
};

export const initialAccessImpossibleTravelSignOn: GeneratorEntry = {
  id: 'okta_multi_country_logins',
  generate: generateTestData,
};

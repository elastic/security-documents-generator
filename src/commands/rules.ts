/**
 * Generate Detection Rules
 *
 * Creates sophisticated detection rules with AI-powered names and realistic event data.
 * Supports all rule types including complex EQL, ESQL, and new terms detection.
 */
import { faker } from '@faker-js/faker';
import { getEsClient } from './utils/indices';
import moment from 'moment';
import { chunk } from 'lodash-es';
import { createRule, getAllRules, bulkDeleteRules } from '../utils/kibana_api';
import { generateRealisticRuleNamesBatch } from '../utils/ai_service';
import { MLDataGenerator } from '../ml/ml_data_generator';
import { MLJobManager } from '../ml/utils/job_manager';
import { ML_SECURITY_MODULES } from '../ml/types/ml_types';

const EVENTS_INDEX = 'logs-system.system-default';

interface Event {
  '@timestamp': string;
  message: string;
  host: {
    name: string;
    ip: string;
  };
  user: {
    name: string;
    id: string;
  };
  event: {
    category: string[];
    type: string[];
    outcome: string;
  };
  // Optional fields for specific rule types
  process?: {
    name?: string;
    command_line?: string;
    pid?: number;
  };
  file?: {
    name?: string;
    extension?: string;
    path?: string;
  };
  destination?: {
    ip?: string;
    port?: number;
  };
  source?: {
    ip?: string;
  };
}

interface RuleGenerationOptions {
  interval: string;
  from: number;
  gapsPerRule: number;
  ruleTypes?: (
    | 'query'
    | 'threshold'
    | 'eql'
    | 'machine_learning'
    | 'threat_match'
    | 'new_terms'
    | 'esql'
  )[];
  enableMLJobs?: boolean;
  generateMLData?: boolean;
  mlModules?: string[];
}

interface GapRange {
  gte: string;
  lte: string;
}

interface GapEvent {
  '@timestamp': string;
  event: {
    provider: 'alerting';
    action: 'gap';
    kind: 'alert';
    category: ['siem'];
  };
  kibana: {
    alert: {
      rule: {
        revision: number;
        rule_type_id: string;
        consumer: string;
        execution: {
          uuid: string;
        };
        gap: {
          range: GapRange;
          filled_intervals: GapRange[];
          in_progress_intervals: GapRange[];
          unfilled_intervals: GapRange[];
          status: 'unfilled' | 'filled' | 'in_progress';
          total_gap_duration_ms: number;
          filled_duration_ms: number;
          unfilled_duration_ms: number;
          in_progress_duration_ms: number;
        };
      };
    };
    saved_objects: Array<{
      rel: 'primary';
      type: 'alert';
      id: string;
      type_id: string;
    }>;
    space_ids: string[];
    server_uuid: string;
    version: string;
  };
  rule: {
    id: string;
    license: string;
    category: string;
    ruleset: string;
    name: string;
  };
  ecs: {
    version: string;
  };
}

const generateEvent = (from: number): Event => ({
  '@timestamp': moment()
    .subtract(faker.number.int({ min: 1, max: from }), 'h')
    .toISOString(),
  message: faker.lorem.sentence(),
  host: {
    name: faker.internet.domainName(),
    ip: faker.internet.ip(),
  },
  user: {
    name: faker.internet.username(),
    id: faker.string.uuid(),
  },
  event: {
    category: faker.helpers.arrayElements(
      ['authentication', 'process', 'network', 'file'],
      { min: 1, max: 2 },
    ),
    type: faker.helpers.arrayElements(['start', 'end', 'info'], {
      min: 1,
      max: 2,
    }),
    outcome: faker.helpers.arrayElement(['success', 'failure']),
  },
});

// Generate events that will trigger specific rule types
const generateMatchingEvents = (
  ruleType: string,
  ruleConfig: any,
  from: number,
  count: number,
): Event[] => {
  const events: Event[] = [];

  for (let i = 0; i < count; i++) {
    const timestamp = moment()
      .subtract(faker.number.int({ min: 1, max: from }), 'h')
      .toISOString();

    let event: Event;

    switch (ruleType) {
      case 'query':
        event = generateQueryMatchingEvent(ruleConfig.query, timestamp);
        break;
      case 'threshold':
        event = generateThresholdMatchingEvent(ruleConfig, timestamp);
        break;
      case 'eql':
        event = generateEQLMatchingEvent(ruleConfig.eql_query, timestamp);
        break;
      case 'machine_learning':
        const mlJobId = ruleConfig.ml_job_id?.[0];
        event = generateMLMatchingEvent(timestamp, mlJobId);
        break;
      case 'threat_match':
        event = generateThreatMatchingEvent(timestamp);
        break;
      case 'new_terms':
        event = generateNewTermsMatchingEvent(
          ruleConfig.new_terms_fields,
          timestamp,
        );
        break;
      case 'esql':
        event = generateESQLMatchingEvent(ruleConfig.esql_query, timestamp);
        break;
      default:
        event = generateEvent(from);
    }

    events.push(event);
  }

  return events;
};

const generateQueryMatchingEvent = (
  query: string,
  timestamp: string,
): Event => {
  const baseEvent = {
    '@timestamp': timestamp,
    message: faker.lorem.sentence(),
    host: {
      name: faker.internet.domainName(),
      ip: faker.internet.ip(),
    },
    user: {
      name: faker.internet.username(),
      id: faker.string.uuid(),
    },
    event: {
      category: ['process'],
      type: ['start'],
      outcome: 'success',
    },
  };

  // Parse the query to generate matching events
  if (
    query.includes('event.category:"process"') &&
    query.includes('process.name:"cmd.exe"')
  ) {
    return {
      ...baseEvent,
      event: { ...baseEvent.event, category: ['process'] },
      process: { name: 'cmd.exe', command_line: 'cmd.exe /c whoami' },
    } as Event;
  }

  if (
    query.includes('event.category:"authentication"') &&
    query.includes('event.outcome:"failure"')
  ) {
    return {
      ...baseEvent,
      event: {
        ...baseEvent.event,
        category: ['authentication'],
        outcome: 'failure',
      },
      user: {
        ...baseEvent.user,
        name: faker.helpers.arrayElement(['admin', 'administrator', 'root']),
      },
    } as Event;
  }

  if (
    query.includes('event.category:"network"') &&
    query.includes('destination.port:22')
  ) {
    return {
      ...baseEvent,
      event: { ...baseEvent.event, category: ['network'] },
      destination: { port: 22, ip: faker.internet.ip() },
      source: { ip: faker.internet.ip() },
    } as Event;
  }

  if (
    query.includes('user.name:"admin"') ||
    query.includes('user.name:"administrator"')
  ) {
    return {
      ...baseEvent,
      user: {
        ...baseEvent.user,
        name: faker.helpers.arrayElement(['admin', 'administrator']),
      },
    } as Event;
  }

  if (
    query.includes('event.category:"file"') &&
    query.includes('file.extension:"exe"')
  ) {
    return {
      ...baseEvent,
      event: { ...baseEvent.event, category: ['file'] },
      file: {
        name: faker.system.fileName() + '.exe',
        extension: 'exe',
        path: `C:\\temp\\${faker.system.fileName()}.exe`,
      },
    } as Event;
  }

  return baseEvent;
};

const generateThresholdMatchingEvent = (
  config: any,
  timestamp: string,
): Event => {
  const userName = faker.helpers.arrayElement([
    'testuser',
    'admin',
    'guest',
    'service',
  ]);

  return {
    '@timestamp': timestamp,
    message: 'Authentication failed',
    host: {
      name: faker.internet.domainName(),
      ip: faker.internet.ip(),
    },
    user: {
      name: userName, // Use consistent usernames to trigger threshold
      id: faker.string.uuid(),
    },
    event: {
      category: ['authentication'],
      type: ['start'],
      outcome: 'failure',
    },
    source: {
      ip: faker.internet.ip(),
    },
  } as Event;
};

const generateEQLMatchingEvent = (
  eqlQuery: string,
  timestamp: string,
): Event => {
  const baseEvent = {
    '@timestamp': timestamp,
    message: faker.lorem.sentence(),
    host: {
      name: faker.internet.domainName(),
      ip: faker.internet.ip(),
    },
    user: {
      name: faker.internet.username(),
      id: faker.string.uuid(),
    },
    event: {
      category: ['process'],
      type: ['start'],
      outcome: 'success',
    },
  };

  if (eqlQuery.includes('process where process.name == "cmd.exe"')) {
    return {
      ...baseEvent,
      process: {
        name: 'cmd.exe',
        command_line: 'cmd.exe /c dir',
        pid: faker.number.int({ min: 1000, max: 9999 }),
      },
    } as Event;
  }

  if (eqlQuery.includes('authentication where event.outcome == "failure"')) {
    return {
      ...baseEvent,
      event: {
        ...baseEvent.event,
        category: ['authentication'],
        outcome: 'failure',
      },
    } as Event;
  }

  if (eqlQuery.includes('network where destination.port == 22')) {
    return {
      ...baseEvent,
      event: { ...baseEvent.event, category: ['network'] },
      destination: { port: 22, ip: faker.internet.ip() },
      source: { ip: faker.internet.ip() },
    } as Event;
  }

  if (eqlQuery.includes('file where file.extension == "exe"')) {
    return {
      ...baseEvent,
      event: { ...baseEvent.event, category: ['file'] },
      file: {
        name: faker.system.fileName() + '.exe',
        extension: 'exe',
        path: `C:\\temp\\${faker.system.fileName()}.exe`,
      },
    } as Event;
  }

  return baseEvent;
};

const generateMLMatchingEvent = (timestamp: string, mlJobId?: string): Event => {
  // Generate event based on ML job type if provided
  if (mlJobId) {
    if (mlJobId.includes('auth')) {
      return {
        '@timestamp': timestamp,
        message: 'Authentication event for ML analysis',
        host: {
          name: faker.internet.domainName(),
          ip: faker.internet.ip(),
        },
        user: {
          name: faker.internet.username(),
          id: faker.string.uuid(),
        },
        event: {
          category: ['authentication'],
          type: ['start'],
          outcome: faker.helpers.arrayElement(['success', 'failure']),
        },
        source: {
          ip: faker.internet.ip(),
        },
      } as Event;
    }
    
    if (mlJobId.includes('windows') || mlJobId.includes('linux')) {
      return {
        '@timestamp': timestamp,
        message: 'Process event for ML analysis',
        host: {
          name: faker.internet.domainName(),
          ip: faker.internet.ip(),
          os: {
            type: mlJobId.includes('windows') ? 'windows' : 'linux'
          }
        },
        user: {
          name: faker.internet.username(),
          id: faker.string.uuid(),
        },
        event: {
          category: ['process'],
          type: ['start'],
          outcome: 'success',
        },
        process: {
          name: faker.helpers.arrayElement(['cmd.exe', 'powershell.exe', 'bash', 'sudo']),
          command_line: faker.lorem.sentence(),
        },
      } as Event;
    }
    
    if (mlJobId.includes('network') || mlJobId.includes('packetbeat')) {
      return {
        '@timestamp': timestamp,
        message: 'Network event for ML analysis',
        host: {
          name: faker.internet.domainName(),
          ip: faker.internet.ip(),
        },
        user: {
          name: faker.internet.username(),
          id: faker.string.uuid(),
        },
        event: {
          category: ['network'],
          type: ['connection'],
          outcome: 'success',
        },
        source: {
          ip: faker.internet.ip(),
        },
        destination: {
          ip: faker.internet.ip(),
          port: faker.number.int({ min: 80, max: 8080 }),
        },
      } as Event;
    }
    
    if (mlJobId.includes('cloudtrail')) {
      return {
        '@timestamp': timestamp,
        message: 'CloudTrail event for ML analysis',
        host: {
          name: faker.internet.domainName(),
          ip: faker.internet.ip(),
        },
        user: {
          name: faker.internet.username(),
          id: faker.string.uuid(),
        },
        event: {
          category: ['api'],
          type: ['info'],
          outcome: faker.helpers.arrayElement(['success', 'failure']),
        },
        cloud: {
          provider: 'aws',
        },
        aws: {
          cloudtrail: {
            error_code: faker.helpers.arrayElement(['UnauthorizedOperation', 'AccessDenied', 'InvalidUserID.NotFound']),
            error_message: faker.lorem.sentence(),
          }
        },
      } as Event;
    }
  }
  
  // Default ML event
  return {
    '@timestamp': timestamp,
    message: 'Unusual authentication activity detected',
    host: {
      name: faker.internet.domainName(),
      ip: faker.internet.ip(),
    },
    user: {
      name: faker.internet.username(),
      id: faker.string.uuid(),
    },
    event: {
      category: ['authentication'],
      type: ['start'],
      outcome: 'success',
    },
    source: {
      ip: faker.internet.ip(),
    },
  } as Event;
};

const generateThreatMatchingEvent = (timestamp: string): Event => {
  return {
    '@timestamp': timestamp,
    message: 'Suspicious IP activity',
    host: {
      name: faker.internet.domainName(),
      ip: faker.internet.ip(),
    },
    user: {
      name: faker.internet.username(),
      id: faker.string.uuid(),
    },
    event: {
      category: ['network'],
      type: ['connection'],
      outcome: 'success',
    },
    source: {
      ip: faker.helpers.arrayElement([
        '192.168.1.100', // Known suspicious IP for threat intel matching
        '10.0.0.50',
        '172.16.0.100',
      ]),
    },
  } as Event;
};

const generateNewTermsMatchingEvent = (
  fields: string[],
  timestamp: string,
): Event => {
  return {
    '@timestamp': timestamp,
    message: 'New entity detected',
    host: {
      name: fields.includes('host.name')
        ? `new-host-${faker.string.alphanumeric(8)}`
        : faker.internet.domainName(),
      ip: faker.internet.ip(),
    },
    user: {
      name: fields.includes('user.name')
        ? `new-user-${faker.string.alphanumeric(8)}`
        : faker.internet.username(),
      id: faker.string.uuid(),
    },
    event: {
      category: ['process'],
      type: ['start'],
      outcome: 'success',
    },
    process: {
      name: fields.includes('process.name')
        ? `new-process-${faker.string.alphanumeric(8)}.exe`
        : 'notepad.exe',
    },
  } as Event;
};

const generateESQLMatchingEvent = (
  esqlQuery: string,
  timestamp: string,
): Event => {
  const baseEvent = {
    '@timestamp': timestamp,
    message: faker.lorem.sentence(),
    host: {
      name: faker.internet.domainName(),
      ip: faker.internet.ip(),
    },
    user: {
      name: faker.internet.username(),
      id: faker.string.uuid(),
    },
    event: {
      category: ['process'],
      type: ['start'],
      outcome: 'success',
    },
  };

  if (esqlQuery.includes('event.category == "process"')) {
    return {
      ...baseEvent,
      process: {
        name: faker.helpers.arrayElement([
          'cmd.exe',
          'powershell.exe',
          'notepad.exe',
        ]),
        pid: faker.number.int({ min: 1000, max: 9999 }),
      },
    } as Event;
  }

  if (esqlQuery.includes('event.category == "authentication"')) {
    return {
      ...baseEvent,
      event: { ...baseEvent.event, category: ['authentication'] },
    } as Event;
  }

  if (esqlQuery.includes('event.category == "network"')) {
    return {
      ...baseEvent,
      event: { ...baseEvent.event, category: ['network'] },
      destination: { ip: faker.internet.ip() },
    } as Event;
  }

  return baseEvent;
};

const generateNonOverlappingGapEvents = (
  ruleId: string,
  ruleName: string,
  fromHours: number,
  gapCount: number,
): GapEvent[] => {
  const totalMinutes = fromHours * 60;
  // Calculate maximum duration for each gap including spacing
  const maxTimePerGap = Math.floor(totalMinutes / gapCount);

  // Ensure minimum values are at least 1
  const minGapDuration = Math.max(
    1,
    Math.min(5, Math.floor(maxTimePerGap * 0.6)),
  ); // 60% of available time
  const maxGapDuration = Math.max(
    minGapDuration + 1,
    Math.min(30, Math.floor(maxTimePerGap * 0.8)),
  ); // 80% of available time
  const maxSpaceBetweenGaps = Math.max(1, Math.floor(maxTimePerGap * 0.2)); // 20% of available time

  if (maxTimePerGap < 2) {
    console.warn(
      `Warning: Time window too small for ${gapCount} gaps. Each gap will be very short (${maxTimePerGap} minutes or less)`,
    );
  }

  const gaps: Array<{ start: number; end: number }> = [];
  let currentTimePoint = 0;

  // Generate exactly gapCount gaps
  for (let i = 0; i < gapCount; i++) {
    const gapDuration = faker.number.int({
      min: minGapDuration,
      max: maxGapDuration,
    });
    const spaceBetweenGaps = faker.number.int({
      min: 1,
      max: maxSpaceBetweenGaps,
    });

    const gapEnd = currentTimePoint + spaceBetweenGaps;
    const gapStart = gapEnd + gapDuration;

    currentTimePoint = gapStart;
    gaps.push({ start: gapEnd, end: gapStart });
  }

  // Convert minute-based gaps to actual gap events
  return gaps.map((gap) => {
    const gapDurationMs = (gap.end - gap.start) * 60 * 1000;
    const gapEndTime = moment().subtract(gap.start, 'minutes');
    const gapStartTime = moment().subtract(gap.end, 'minutes');

    const range = {
      gte: gapStartTime.toISOString(),
      lte: gapEndTime.toISOString(),
    };

    return {
      '@timestamp': range.lte,
      event: {
        provider: 'alerting',
        action: 'gap',
        kind: 'alert',
        category: ['siem'],
      },
      kibana: {
        alert: {
          rule: {
            revision: 1,
            rule_type_id: 'siem.queryRule',
            consumer: 'siem',
            execution: {
              uuid: faker.string.uuid(),
            },
            gap: {
              range,
              filled_intervals: [],
              in_progress_intervals: [],
              unfilled_intervals: [range],
              status: 'unfilled',
              total_gap_duration_ms: gapDurationMs,
              filled_duration_ms: 0,
              unfilled_duration_ms: gapDurationMs,
              in_progress_duration_ms: 0,
            },
          },
        },
        saved_objects: [
          {
            rel: 'primary',
            type: 'alert',
            id: ruleId,
            type_id: 'siem.queryRule',
          },
        ],
        space_ids: ['default'],
        server_uuid: '5d29f261-1b85-4d90-9088-53e0e0e87c7c',
        version: '9.1.0',
      },
      rule: {
        id: ruleId,
        license: 'basic',
        category: 'siem.queryRule',
        ruleset: 'siem',
        name: ruleName,
      },
      ecs: {
        version: '1.8.0',
      },
    };
  });
};

const ingestEvents = async (events: Event[]) => {
  const client = getEsClient();
  if (!client) throw new Error('Failed to get ES client');

  const chunks = chunk(events, 1000);
  let totalIndexed = 0;

  for (const chunk of chunks) {
    try {
      const operations = chunk.flatMap((doc) => [
        { create: { _index: EVENTS_INDEX } },
        doc,
      ]);

      const result = await client.bulk({ operations, refresh: true });

      if (result.errors) {
        console.error('Bulk indexing errors detected');
        const errors = result.items?.filter(
          (item) => item.create?.error || item.index?.error,
        );
        console.error(`Failed to index ${errors?.length || 0} events`);
      } else {
        totalIndexed += chunk.length;
      }
    } catch (err) {
      console.error('Error ingesting events:', err);
      throw err;
    }
  }

  if (totalIndexed > 0) {
    console.log(
      `✅ Successfully indexed ${totalIndexed}/${events.length} events to ${EVENTS_INDEX}`,
    );
  }
};

const ingestGapEvents = async (gapEvents: GapEvent[]) => {
  const client = getEsClient();
  if (!client) throw new Error('Failed to get ES client');

  const chunks = chunk(gapEvents, 1000);

  for (const chunk of chunks) {
    try {
      const operations = chunk.flatMap((doc) => [
        { create: { _index: '.kibana-event-log-ds' } },
        doc,
      ]);

      await client.bulk({ operations, refresh: true });
    } catch (err) {
      console.error('Error ingesting gap events:', err);
      throw err;
    }
  }
};

const deleteGapEvents = async () => {
  const client = getEsClient();
  if (!client) throw new Error('Failed to get ES client');

  try {
    console.log('Deleting gap events...');
    const response = await client.deleteByQuery({
      index: '.ds-.kibana-event-log-*',
      refresh: true,
      query: {
        bool: {
          must: [
            { term: { 'event.action': 'gap' } },
            { term: { 'event.provider': 'alerting' } },
          ],
        },
      },
    });

    console.log(`Deleted ${response.deleted} gap events`);
    return response.deleted;
  } catch (err) {
    console.error('Error deleting gap events:', err);
    throw err;
  }
};

// Helper function to extract category from query for AI context
const getQueryCategory = (query: string): string => {
  if (query.includes('process')) return 'process';
  if (query.includes('authentication')) return 'authentication';
  if (query.includes('network')) return 'network';
  if (query.includes('file')) return 'file';
  if (query.includes('registry')) return 'registry';
  if (query.includes('powershell')) return 'powershell';
  if (query.includes('cmd.exe')) return 'command_line';
  return 'general';
};

// Rule type templates with realistic configurations
const getRuleTypeConfig = (type: string, availableMLJobs?: string[]) => {
  switch (type) {
    case 'query':
      return {
        query: faker.helpers.arrayElement([
          'event.category:"process" AND process.name:"cmd.exe"',
          'event.category:"authentication" AND event.outcome:"failure"',
          'event.category:"network" AND destination.port:22',
          'user.name:"admin" OR user.name:"administrator"',
          'event.category:"file" AND file.extension:"exe"',
        ]),
      };
    case 'threshold':
      return {
        query: 'event.category:"authentication" AND event.outcome:"failure"',
        threshold_field: ['user.name'],
        threshold_value: faker.number.int({ min: 5, max: 50 }),
      };
    case 'eql':
      return {
        eql_query: faker.helpers.arrayElement([
          'process where process.name == "cmd.exe"',
          'sequence [authentication where event.outcome == "failure"] [process where process.name == "powershell.exe"]',
          'network where destination.port == 22 and source.ip != "127.0.0.1"',
          'file where file.extension == "exe" and file.path : "C:\\\\temp\\\\*"',
        ]),
      };
    case 'machine_learning':
      // Use filtered ML jobs if provided, otherwise use all
      const mlJobsToUse = availableMLJobs && availableMLJobs.length > 0 
        ? availableMLJobs 
        : ML_SECURITY_MODULES.flatMap(module => module.jobs);
      return {
        anomaly_threshold: faker.number.int({ min: 50, max: 90 }),
        ml_job_id: [
          faker.helpers.arrayElement(mlJobsToUse),
        ],
      };
    case 'threat_match':
      return {
        threat_index: ['threat-intel-*'],
        threat_query: '*:*',
      };
    case 'new_terms':
      return {
        new_terms_fields: faker.helpers.arrayElement([
          ['user.name'],
          ['host.name'],
          ['process.name'],
          ['user.name', 'host.name'],
        ]),
      };
    case 'esql':
      return {
        esql_query: faker.helpers.arrayElement([
          'FROM logs-* | WHERE event.category == "process" | STATS count = COUNT() BY process.name',
          'FROM logs-* | WHERE event.category == "authentication" AND event.outcome == "failure" | STATS count = COUNT() BY user.name',
          'FROM logs-* | WHERE event.category == "network" | STATS count = COUNT() BY destination.ip',
        ]),
      };
    default:
      return { query: '*:*' };
  }
};

export const generateRulesAndAlerts = async (
  ruleCount: number,
  eventCount: number,
  options: RuleGenerationOptions,
  space?: string,
) => {
  // Define available rule types
  const availableRuleTypes = options.ruleTypes || [
    'query',
    'threshold',
    'eql',
    'machine_learning',
    'threat_match',
    'new_terms',
    'esql',
  ];

  // Get ML jobs only from specified modules if ML data generation is enabled
  let availableMLJobs: string[] = [];
  if (options.generateMLData && options.mlModules) {
    availableMLJobs = ML_SECURITY_MODULES
      .filter(module => options.mlModules?.includes(module.name))
      .flatMap(module => module.jobs);
    
    console.log(`🤖 Using ML jobs from modules: ${options.mlModules.join(', ')}`);
    console.log(`🎯 Available ML jobs: ${availableMLJobs.join(', ')}`);
    
    if (availableMLJobs.length === 0) {
      console.warn('⚠️  No ML jobs found for specified modules. Using all available ML jobs.');
      availableMLJobs = ML_SECURITY_MODULES.flatMap(module => module.jobs);
    }
  } else {
    availableMLJobs = ML_SECURITY_MODULES.flatMap(module => module.jobs);
    console.log(`🤖 Using all available ML jobs: ${availableMLJobs.length} total`);
  }

  // Prepare rule configurations for batch AI processing
  const ruleConfigs = Array.from({ length: ruleCount }, (_, index) => {
    const ruleType = availableRuleTypes[index % availableRuleTypes.length];
    const severity = faker.helpers.arrayElement([
      'low',
      'medium',
      'high',
      'critical',
    ]);
    const riskScore = faker.number.int({ min: 1, max: 100 });
    const typeConfig = getRuleTypeConfig(ruleType, availableMLJobs);
    const ruleQuery =
      typeConfig.query ||
      typeConfig.eql_query ||
      typeConfig.esql_query ||
      '*:*';

    return {
      ruleType,
      severity,
      riskScore,
      typeConfig,
      ruleQuery,
      category: getQueryCategory(ruleQuery),
    };
  });

  // Process rules in batches for optimal performance
  const BATCH_SIZE = 20; // AI can handle up to 20 rules efficiently in one call
  const ruleResults = [];

  console.log(`🤖 Generating AI rule names in batches of ${BATCH_SIZE}...`);

  for (let i = 0; i < ruleConfigs.length; i += BATCH_SIZE) {
    const batch = ruleConfigs.slice(i, i + BATCH_SIZE);

    // Generate AI rule names for this batch
    const aiRules = batch.map((config) => ({
      ruleType: config.ruleType,
      ruleQuery: config.ruleQuery,
      severity: config.severity,
      category: config.category,
    }));

    const batchAIResults = await generateRealisticRuleNamesBatch(aiRules);

    // Create rules with AI-generated names in parallel
    const batchPromises = batch.map(async (config, batchIndex) => {
      const aiResult = batchAIResults[batchIndex];

      // Extract new_terms_fields separately to handle type compatibility
      const { new_terms_fields, ...otherTypeConfig } = config.typeConfig;
      const processedNewTermsFields =
        new_terms_fields && Array.isArray(new_terms_fields)
          ? ([...new_terms_fields] as string[])
          : undefined;

      return createRule({
        name: aiResult.name,
        description: aiResult.description,
        enabled: true,
        risk_score: config.riskScore,
        severity: config.severity,
        index: ['logs-*', 'metrics-*', 'auditbeat-*'],
        type: config.ruleType as any,
        from: `now-${options.from}h`,
        interval: options.interval,
        space: space,
        new_terms_fields: processedNewTermsFields,
        ...otherTypeConfig,
      });
    });

    const batchResults = await Promise.all(batchPromises);
    ruleResults.push(...batchResults);

    const progress = Math.min(i + BATCH_SIZE, ruleConfigs.length);
    console.log(`✅ Generated ${progress}/${ruleConfigs.length} rules`);
  }

  // Generate events that match each rule's configuration
  const allEvents: Event[] = [];
  const eventsPerRule = Math.max(1, Math.floor(eventCount / ruleCount));

  for (let i = 0; i < ruleCount; i++) {
    const ruleType = availableRuleTypes[i % availableRuleTypes.length];
    const ruleConfig = getRuleTypeConfig(ruleType, availableMLJobs);

    // Generate events specifically designed to match this rule type
    const matchingEvents = generateMatchingEvents(
      ruleType,
      ruleConfig,
      options.from,
      eventsPerRule,
    );

    allEvents.push(...matchingEvents);
  }

  // Generate some additional random events for noise
  const randomEventCount = Math.floor(eventCount * 0.3); // 30% random events
  const randomEvents = Array.from({ length: randomEventCount }, () =>
    generateEvent(options.from),
  );
  allEvents.push(...randomEvents);

  let gapEvents: GapEvent[] = [];
  if (options.gapsPerRule > 0) {
    // Generate non-overlapping gap events for each rule
    gapEvents = ruleResults.flatMap((rule) => {
      return generateNonOverlappingGapEvents(
        rule.id,
        rule.name || 'Unknown Rule',
        options.from,
        options.gapsPerRule,
      );
    });
  }

  await Promise.all([ingestEvents(allEvents), ingestGapEvents(gapEvents)]);

  // Generate ML data and create ML jobs if enabled
  let mlJobsCreated = 0;
  let mlDocumentsGenerated = 0;
  
  if (options.enableMLJobs || options.generateMLData) {
    console.log('🤖 Processing ML functionality...');
    
    // Get ML job IDs from created ML rules
    const mlRuleJobIds = ruleResults
      .filter(rule => rule.type === 'machine_learning')
      .flatMap(rule => rule.ml_job_id || []);
    
    if (mlRuleJobIds.length > 0) {
      console.log(`Found ${mlRuleJobIds.length} ML jobs to process: ${mlRuleJobIds.join(', ')}`);
      
      if (options.enableMLJobs) {
        // Create and enable ML jobs
        const jobManager = new MLJobManager();
        for (const jobId of mlRuleJobIds) {
          try {
            await jobManager.createJob(jobId);
            await jobManager.openJob(jobId);
            await jobManager.startDatafeed(jobId);
            mlJobsCreated++;
            console.log(`✅ ML job ${jobId} created and started`);
          } catch (error) {
            console.warn(`⚠️  Failed to create ML job ${jobId}:`, (error as Error).message);
          }
        }
      }
      
      if (options.generateMLData) {
        // Generate ML data for the jobs
        const mlGenerator = new MLDataGenerator();
        const mlModules = options.mlModules || ['security_auth', 'security_windows', 'security_linux'];
        
        for (const module of mlModules) {
          try {
            const results = await mlGenerator.generateByModule(module, {
              chunkSize: 1000,
              refreshPolicy: 'true'
            });
            
            const moduleDocCount = results.reduce((sum, r) => sum + r.documentsGenerated, 0);
            mlDocumentsGenerated += moduleDocCount;
            console.log(`✅ Generated ${moduleDocCount} ML documents for ${module} module`);
          } catch (error) {
            console.warn(`⚠️  Failed to generate ML data for ${module}:`, (error as Error).message);
          }
        }
      }
    }
  }

  console.log(`Created ${ruleResults.length} rules`);
  console.log(
    `Ingested ${allEvents.length} events (${allEvents.length - randomEventCount} matching events + ${randomEventCount} random events)`,
  );
  console.log(`Generated ${gapEvents.length} gap events`);
  
  if (mlJobsCreated > 0) {
    console.log(`🤖 Created and started ${mlJobsCreated} ML jobs`);
  }
  if (mlDocumentsGenerated > 0) {
    console.log(`🤖 Generated ${mlDocumentsGenerated} ML documents`);
  }
  
  console.log(
    `🎯 Rules should now generate alerts from matching source events!`,
  );

  return { 
    rules: ruleResults, 
    events: allEvents, 
    gapEvents,
    mlJobsCreated,
    mlDocumentsGenerated 
  };
};

export const deleteAllRules = async (space?: string) => {
  console.log('Fetching all rules...');
  const { data: rules } = await getAllRules(space);

  if (rules.length === 0) {
    console.log('No rules found to delete');
    return;
  }

  console.log(`Found ${rules.length} rules. Deleting...`);

  // Using bulk delete with chunks of 100
  const ruleIds = rules.map((rule) => rule.id);
  const chunks = chunk(ruleIds, 100);

  try {
    let deletedCount = 0;
    for (const chunkIds of chunks) {
      await bulkDeleteRules(chunkIds, space);
      deletedCount += chunkIds.length;
      console.log(`Progress: ${deletedCount}/${rules.length} rules deleted`);
    }

    // Delete gap events after rules are deleted
    await deleteGapEvents();

    console.log(
      `Successfully deleted ${deletedCount} rules and their gap events`,
    );
  } catch (err) {
    console.error('Failed to delete rules:', JSON.stringify(err));
    throw err;
  }
};

import { faker } from '@faker-js/faker';
import { getEsClient } from './utils/indices';
import moment from 'moment';
import { chunk } from 'lodash-es';
import { createRule, getAllRules, bulkDeleteRules } from '../utils/kibana_api';

const EVENTS_INDEX = 'logs-*';

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
}

interface RuleGenerationOptions {
  interval: string;
  from: number;
  gapsPerRule: number;
  gapDurationDays?: number; // If specified, creates gap(s) within this duration range
  gapCountInRange?: number; // Number of gaps to create within the gapDurationDays range (default: 1)
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
    category: faker.helpers.arrayElements(['authentication', 'process', 'network', 'file'], {
      min: 1,
      max: 2,
    }),
    type: faker.helpers.arrayElements(['start', 'end', 'info'], {
      min: 1,
      max: 2,
    }),
    outcome: faker.helpers.arrayElement(['success', 'failure']),
  },
});

const createGapEvent = (
  ruleId: string,
  ruleName: string,
  range: GapRange,
  gapDurationMs: number
): GapEvent => {
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
};

const generateSingleLargeGapEvent = (
  ruleId: string,
  ruleName: string,
  gapDurationDays: number
): GapEvent => {
  const gapDurationMs = gapDurationDays * 24 * 60 * 60 * 1000;
  const gapEndTime = moment();
  const gapStartTime = moment().subtract(gapDurationDays, 'days');

  const range = {
    gte: gapStartTime.toISOString(),
    lte: gapEndTime.toISOString(),
  };

  return createGapEvent(ruleId, ruleName, range, gapDurationMs);
};

const generateMultipleGapsInRange = (
  ruleId: string,
  ruleName: string,
  gapDurationDays: number,
  gapCount: number
): GapEvent[] => {
  const rangeEnd = moment();
  const rangeStart = moment().subtract(gapDurationDays, 'days');

  // Calculate gap durations - each gap should be a reasonable portion of the total range
  const minGapDurationHours = Math.max(1, Math.floor((gapDurationDays * 24) / gapCount / 3)); // At least 1 hour, but try to make gaps reasonable
  const maxGapDurationHours = Math.floor((gapDurationDays * 24) / gapCount / 1.5); // Leave some space between gaps

  const gaps: GapEvent[] = [];
  let currentTime = rangeStart.clone();

  for (let i = 0; i < gapCount; i++) {
    // Calculate gap duration (in hours, then convert to ms)
    const gapDurationHours = faker.number.int({
      min: minGapDurationHours,
      max: Math.max(minGapDurationHours + 1, maxGapDurationHours),
    });
    const gapDurationMs = gapDurationHours * 60 * 60 * 1000;

    // Calculate gap start and end times
    const gapStart = currentTime.clone();
    const gapEnd = gapStart.clone().add(gapDurationHours, 'hours');

    // Make sure we don't exceed the range
    if (gapEnd.isAfter(rangeEnd)) {
      break;
    }

    const range: GapRange = {
      gte: gapStart.toISOString(),
      lte: gapEnd.toISOString(),
    };

    gaps.push(createGapEvent(ruleId, ruleName, range, gapDurationMs));

    // Move to next gap position with some spacing
    const spacingHours = faker.number.int({
      min: 1,
      max: Math.max(2, Math.floor((gapDurationDays * 24) / gapCount / 4)),
    });
    currentTime = gapEnd.clone().add(spacingHours, 'hours');

    // If we've reached the end, stop
    if (currentTime.isAfter(rangeEnd) || currentTime.isSame(rangeEnd)) {
      break;
    }
  }

  return gaps;
};

const generateNonOverlappingGapEvents = (
  ruleId: string,
  ruleName: string,
  fromHours: number,
  gapCount: number
): GapEvent[] => {
  const totalMinutes = fromHours * 60;
  // Calculate maximum duration for each gap including spacing
  const maxTimePerGap = Math.floor(totalMinutes / gapCount);

  // Ensure minimum values are at least 1
  const minGapDuration = Math.max(1, Math.min(5, Math.floor(maxTimePerGap * 0.6))); // 60% of available time
  const maxGapDuration = Math.max(
    minGapDuration + 1,
    Math.min(30, Math.floor(maxTimePerGap * 0.8))
  ); // 80% of available time
  const maxSpaceBetweenGaps = Math.max(1, Math.floor(maxTimePerGap * 0.2)); // 20% of available time

  if (maxTimePerGap < 2) {
    console.warn(
      `Warning: Time window too small for ${gapCount} gaps. Each gap will be very short (${maxTimePerGap} minutes or less)`
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

  for (const chunk of chunks) {
    try {
      const operations = chunk.flatMap((doc) => [{ index: { _index: EVENTS_INDEX } }, doc]);

      await client.bulk({ operations, refresh: true });
    } catch (err) {
      console.error('Error ingesting events:', err);
      throw err;
    }
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
          must: [{ term: { 'event.action': 'gap' } }, { term: { 'event.provider': 'alerting' } }],
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

export const generateRulesAndAlerts = async (
  ruleCount: number,
  eventCount: number,
  options: RuleGenerationOptions
) => {
  // Create rules through Kibana API
  const ruleResults = await Promise.all(
    Array.from({ length: ruleCount }, () => {
      const ruleName = `Rule-${faker.string.alphanumeric(8)}`;
      const severity = faker.helpers.arrayElement(['low', 'medium', 'high', 'critical']);
      const riskScore = faker.number.int({ min: 1, max: 100 });

      return createRule({
        name: ruleName,
        description: faker.lorem.sentence(),
        enabled: true,
        risk_score: riskScore,
        severity: severity,
        index: ['logs-*', 'metrics-*', 'auditbeat-*'],
        type: 'query',
        query: '*:*',
        from: `now-${options.from}h`,
        interval: options.interval,
      });
    })
  );

  // Generate events that rules can match against
  const events = Array.from({ length: eventCount }, () => generateEvent(options.from));

  let gapEvents: GapEvent[] = [];
  if (options.gapDurationDays && options.gapDurationDays > 0) {
    const gapCount = options.gapCountInRange || 1;
    if (gapCount === 1) {
      // Generate a single large gap for each rule
      gapEvents = ruleResults.map((rule) => {
        return generateSingleLargeGapEvent(
          rule.id,
          rule.name || 'Unknown Rule',
          options.gapDurationDays!
        );
      });
    } else {
      // Generate multiple gaps within the specified range
      gapEvents = ruleResults.flatMap((rule) => {
        return generateMultipleGapsInRange(
          rule.id,
          rule.name || 'Unknown Rule',
          options.gapDurationDays!,
          gapCount
        );
      });
    }
  } else if (options.gapsPerRule > 0) {
    // Generate non-overlapping gap events for each rule
    gapEvents = ruleResults.flatMap((rule) => {
      return generateNonOverlappingGapEvents(
        rule.id,
        rule.name || 'Unknown Rule',
        options.from,
        options.gapsPerRule
      );
    });
  }

  await Promise.all([ingestEvents(events), ingestGapEvents(gapEvents)]);

  console.log(`Created ${ruleResults.length} rules`);
  console.log(`Ingested ${events.length} events`);
  console.log(`Generated ${gapEvents.length} gap events`);

  return { rules: ruleResults, events, gapEvents };
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

    console.log(`Successfully deleted ${deletedCount} rules and their gap events`);
  } catch (err) {
    console.error('Failed to delete rules:', JSON.stringify(err));
    throw err;
  }
};

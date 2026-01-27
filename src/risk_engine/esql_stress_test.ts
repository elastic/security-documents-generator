/* eslint-disable no-useless-escape */
import { getEsClient } from '../commands/utils/indices';
import { promises as fs } from 'fs';
import path from 'path';
import { getAlertIndex } from '../utils';
import { sleep } from '../utils/sleep';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Report = Record<number, { ok?: any; error?: any; delay?: number }>;
const identifierField = 'host.name';
export const stressTest = async (runs: number, opts: { outputFile?: string; pageSize: number }) => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pagination: any = await getPagination({
    pageSize: opts.pageSize,
  });

  const afterKeys = { upper: pagination?.after_key[identifierField] || 'z' };

  const delays = [250, 500, 1000];
  const seqReport: Report = {};
  for (let ms of delays) {
    console.log('\n--------------------------------------------------------------------\n');
    console.log(`Starting sequential execution with ${ms}ms delay`);

    for (let i = 0; i < runs; i++) {
      await run(
        i + 1,
        {
          pageSize: opts.pageSize,
          afterKeys,
        },
        seqReport
      );
      console.log(`Run ${i + 1} of ${runs} completed. Sleeping ${ms}ms...`);
      await sleep(ms);
    }

    console.log(
      `Sequential execution with ${ms}ms delay completed. Sleeping 5s to allow ES to recover...`
    );

    if (Object.values(seqReport).every((r) => r.ok)) {
      console.log('All sequential runs were successful at delay', ms);
      console.log('Stopping further sequential tests.');
      break;
    }
    await sleep(5000);
  }

  console.log('Sequential execution completed');

  const entityTypesNo = 3;
  const batches = Math.floor(runs / entityTypesNo);
  const multiReport: Report = {};
  console.log('\n--------------------------------------------------------------------\n');
  console.log(
    `Starting parallel execution with ${entityTypesNo} parallel runs, total ${batches} batches...`
  );
  for (let i = 0; i < batches; i++) {
    await Promise.all(
      Array.from({ length: entityTypesNo }, (_, j) =>
        run(
          i * entityTypesNo + j + 1,
          {
            pageSize: opts.pageSize,
            afterKeys,
          },
          multiReport
        )
      )
    );

    console.log(`Batch ${i + 1} of ${batches} completed`);
    await sleep(2000);
  }

  try {
    const seqFile =
      opts?.outputFile ?? path.join(process.cwd(), `reports/esql_seq_stress_results.json`);
    const reportsDirectory = path.dirname(seqFile);
    await fs.mkdir(reportsDirectory, { recursive: true });
    await fs.writeFile(seqFile, JSON.stringify(seqReport, null, 2), 'utf8');
    console.log('Sequential results written to', seqFile);

    const multiFile =
      opts?.outputFile ?? path.join(process.cwd(), `reports/esql_multi_stress_results.json`);
    await fs.writeFile(multiFile, JSON.stringify(multiReport, null, 2), 'utf8');
    console.log('Parallel results written to', multiFile);
  } catch (e) {
    console.log('Failed to write results file:', e);
  }
};
export const run = async (
  n: number,
  params: {
    pageSize: number;
    afterKeys: {
      lower?: string;
      upper?: string;
    };
  },
  report: Report
) => {
  const client = getEsClient();

  const lower = params.afterKeys.lower
    ? `${identifierField} >= ${params.afterKeys.lower}`
    : undefined;
  const upper = params.afterKeys.upper
    ? `${identifierField} <= ${params.afterKeys.upper}`
    : undefined;
  if (!lower && !upper) {
    throw new Error('Either lower or upper after key must be provided for pagination');
  }
  const rangeClause = [lower, upper].filter(Boolean).join(' and ');

  const query = /* sql */ `
      FROM .alerts-security.alerts-default
        | WHERE kibana.alert.risk_score IS NOT NULL AND KQL("${rangeClause}")
        | RENAME kibana.alert.risk_score as risk_score,
             kibana.alert.rule.name as rule_name,
             kibana.alert.rule.uuid as rule_id,
             kibana.alert.uuid as alert_id,
             @timestamp as time
        | EVAL input = CONCAT(""" {"risk_score": """", risk_score::keyword, """", "timestamp": """", time::keyword, """", "description": """", rule_name, """\", "id": \"""", alert_id, """\" } """)
        | STATS
            alert_count = count(risk_score),
            scores = MV_PSERIES_WEIGHTED_SUM(TOP(risk_score, 10000, "desc"), 1.5),
            risk_inputs = TOP(input, 10, "desc")
          BY ${identifierField}
        | SORT scores DESC
        | LIMIT ${params.pageSize}
        
`;
  // console.log(query);
  await client.esql
    .query({ query })
    .then((response) => {
      console.log(`Esql query executed successfully in run ${n}`);
      console.log('Results found:', response.values.length);
      console.log('Sample result:', JSON.stringify(response.values[0]));
      report[n] = {
        ok: { scoresCalculated: response.values.length, rangeClause, query },
      };
    })
    .catch((e) => {
      console.log(`Error executing ESQL query in run ${n}:`, e.message);
      console.log('Query was:', query);
      report[n] = { error: e };
    });
};

export const getPagination = async (params: { pageSize: number }) => {
  const query = {
    size: 0,
    index: getAlertIndex('default'),
    ignore_unavailable: true,
    runtime_mappings: {},
    query: {
      function_score: {
        query: {
          bool: {
            should: [
              {
                match_all: {}, // This forces ES to calculate score
              },
            ],
          },
        },
        field_value_factor: {
          field: 'kibana.alert.risk_score',
        },
      },
    },
    aggs: {
      entities: {
        composite: {
          size: params.pageSize,
          sources: [
            {
              [identifierField]: {
                terms: {
                  field: identifierField,
                },
              },
            },
          ],
        },
      },
    },
  };

  const client = getEsClient();

  const response = await client.search(query).catch((e) => {
    console.error(`Error executing composite query: ${e.message}`);
  });
  console.log(response?.aggregations?.entities);
  return response?.aggregations?.entities;
};

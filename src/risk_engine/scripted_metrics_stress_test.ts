import { getEsClient } from '../commands/utils/indices';
import { getAlertIndex } from '../utils';
import { sleep } from '../utils/sleep';

type Report = Record<
  number,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  { ok?: any; error?: any; delay?: number; query?: any }
>;
export const stressTest = async (runs: number, opts: { outputFile?: string; pageSize: number }) => {
  const ms = 250;
  const seqReport: Report = {};

  console.log('\n--------------------------------------------------------------------\n');
  console.log(`Starting sequential execution with ${ms}ms delay`);

  for (let i = 0; i < runs; i++) {
    await run(i + 1, opts.pageSize, seqReport);
    console.log(`Run ${i + 1} of ${runs} completed. Sleeping ${ms}ms...`);
    if (seqReport[i + 1].error) {
      console.log('Sequential run failed at delay', ms);
      console.log('Stopping further sequential tests.');
      return;
    }
    await sleep(ms);
  }

  console.log(
    `Sequential execution with ${ms}ms delay completed. Sleeping 5s to allow ES to recover...`
  );
};

const run = async (n: number, pageSize: number, report: Report) => {
  const esClient = await getEsClient();
  const index = getAlertIndex('default');
  const query = getQuery(pageSize, index);
  await esClient
    .search(query)
    .then(() => {
      console.log(`Scripted Metrics query executed successfully in run ${n}`);
      report[n] = { ok: true };
    })
    .catch((e) => {
      console.log(`Error executing Scripted Metrics query in run ${n}:`, e.message);
      report[n] = { error: e, query };
    });
};

const getQuery = (pageSize: number, index: string) => ({
  size: 0,
  _source: false,
  index,
  ignore_unavailable: true,
  runtime_mappings: {},
  query: {
    function_score: {
      query: {
        bool: {
          filter: [
            {
              exists: {
                field: 'kibana.alert.risk_score',
              },
            },
          ],
          should: [
            {
              match_all: {},
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
    user: {
      composite: {
        size: pageSize,
        sources: [
          {
            'user.name': {
              terms: {
                field: 'user.name',
              },
            },
          },
        ],
      },
      aggs: {
        top_inputs: {
          sampler: {
            shard_size: 10000,
          },
          aggs: {
            risk_details: {
              scripted_metric: {
                init_script: 'state.inputs = []',
                map_script:
                  "Map fields = new HashMap();fields.put('id', doc['kibana.alert.uuid'].value);fields.put('index', doc['_index'].value);fields.put('time', doc['@timestamp'].value);fields.put('rule_name', doc['kibana.alert.rule.name'].value);fields.put('category', doc['event.kind'].value);fields.put('score', doc['kibana.alert.risk_score'].value);state.inputs.add(fields); ",
                combine_script: 'return state;',
                params: {
                  p: 1.5,
                  risk_cap: 2.5924,
                  global_identifier_type_weight: 1,
                },
                reduce_script:
                  "Map results = new HashMap();results['notes'] = [];results['category_1_score'] = 0.0;results['category_1_count'] = 0;results['risk_inputs'] = [];results['score'] = 0.0;def inputs = states[0].inputs;Collections.sort(inputs, (a, b) -> b.get('score').compareTo(a.get('score')));for (int i = 0; i < inputs.length; i++) { double current_score = inputs[i].score / Math.pow(i + 1, params.p); if (i < 10) { inputs[i]['contribution'] = current_score / params.risk_cap; results['risk_inputs'].add(inputs[i]); } results['category_1_score'] += current_score; results['category_1_count'] += 1; results['score'] += current_score;}results['score'] *= params.global_identifier_type_weight;results['normalized_score'] = results['score'] / params.risk_cap;return results;",
              },
            },
          },
        },
      },
    },
    host: {
      composite: {
        size: pageSize,
        sources: [
          {
            'host.name': {
              terms: {
                field: 'host.name',
              },
            },
          },
        ],
      },
      aggs: {
        top_inputs: {
          sampler: {
            shard_size: 10000,
          },
          aggs: {
            risk_details: {
              scripted_metric: {
                init_script: 'state.inputs = []',
                map_script:
                  "Map fields = new HashMap();fields.put('id', doc['kibana.alert.uuid'].value);fields.put('index', doc['_index'].value);fields.put('time', doc['@timestamp'].value);fields.put('rule_name', doc['kibana.alert.rule.name'].value);fields.put('category', doc['event.kind'].value);fields.put('score', doc['kibana.alert.risk_score'].value);state.inputs.add(fields); ",
                combine_script: 'return state;',
                params: {
                  p: 1.5,
                  risk_cap: 2.5924,
                  global_identifier_type_weight: 1,
                },
                reduce_script:
                  "Map results = new HashMap();results['notes'] = [];results['category_1_score'] = 0.0;results['category_1_count'] = 0;results['risk_inputs'] = [];results['score'] = 0.0;def inputs = states[0].inputs;Collections.sort(inputs, (a, b) -> b.get('score').compareTo(a.get('score')));for (int i = 0; i < inputs.length; i++) { double current_score = inputs[i].score / Math.pow(i + 1, params.p); if (i < 10) { inputs[i]['contribution'] = current_score / params.risk_cap; results['risk_inputs'].add(inputs[i]); } results['category_1_score'] += current_score; results['category_1_count'] += 1; results['score'] += current_score;}results['score'] *= params.global_identifier_type_weight;results['normalized_score'] = results['score'] / params.risk_cap;return results;",
              },
            },
          },
        },
      },
    },
    service: {
      composite: {
        size: pageSize,
        sources: [
          {
            'service.name': {
              terms: {
                field: 'service.name',
              },
            },
          },
        ],
      },
      aggs: {
        top_inputs: {
          sampler: {
            shard_size: 10000,
          },
          aggs: {
            risk_details: {
              scripted_metric: {
                init_script: 'state.inputs = []',
                map_script:
                  "Map fields = new HashMap();fields.put('id', doc['kibana.alert.uuid'].value);fields.put('index', doc['_index'].value);fields.put('time', doc['@timestamp'].value);fields.put('rule_name', doc['kibana.alert.rule.name'].value);fields.put('category', doc['event.kind'].value);fields.put('score', doc['kibana.alert.risk_score'].value);state.inputs.add(fields); ",
                combine_script: 'return state;',
                params: {
                  p: 1.5,
                  risk_cap: 2.5924,
                  global_identifier_type_weight: 1,
                },
                reduce_script:
                  "Map results = new HashMap();results['notes'] = [];results['category_1_score'] = 0.0;results['category_1_count'] = 0;results['risk_inputs'] = [];results['score'] = 0.0;def inputs = states[0].inputs;Collections.sort(inputs, (a, b) -> b.get('score').compareTo(a.get('score')));for (int i = 0; i < inputs.length; i++) { double current_score = inputs[i].score / Math.pow(i + 1, params.p); if (i < 10) { inputs[i]['contribution'] = current_score / params.risk_cap; results['risk_inputs'].add(inputs[i]); } results['category_1_score'] += current_score; results['category_1_count'] += 1; results['score'] += current_score;}results['score'] *= params.global_identifier_type_weight;results['normalized_score'] = results['score'] / params.risk_cap;return results;",
              },
            },
          },
        },
      },
    },
  },
});

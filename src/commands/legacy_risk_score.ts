import { installLegacyRiskScore } from '../utils/kibana_api';
import { getEsClient } from './utils';

const esClient = getEsClient();

/**
 * Install legacy risk score and generate data
 */
export const generateLegacyRiskScore = async () => {
  console.log('Installing legacy risk score');

  await installLegacyRiskScore();

  console.log('Generating data');

  await bulkIndexData();

  console.log('Data generated');
};

const data = [
  {
    index: 'ml_host_risk_score_latest_default',
    source: {
      risk_stats: {
        rule_risks: [
          {
            rule_id: '3301ee30-36d2-11ed-bc8e-edf6538225c3',
            rule_name: 'test',
            rule_risk: 21,
          },
        ],
        risk_score: 21.084609494640123,
        risk_multipliers: [],
      },
      '@timestamp': '2022-09-18T17:50:42.961Z',
      host: {
        name: 'MacBook-Pro.local',
        risk: {
          calculated_level: 'Low',
          calculated_score_norm: 21,
          rule_risks: [
            {
              rule_name: 'test',
              rule_risk: 21,
            },
          ],
        },
      },
      ingest_timestamp: '2022-09-18T17:54:22.363192Z',
      risk: 'Unknown',
    },
  },
  {
    index: 'ml_host_risk_score_default',
    source: {
      host: {
        name: 'MacBook-Pro.local',
        risk: {
          calculated_level: 'Low',
          calculated_score_norm: 21,
          rule_risks: [
            {
              rule_name: 'test',
              rule_risk: 21,
            },
          ],
        },
      },
      risk_stats: {
        rule_risks: [
          {
            rule_id: '3301ee30-36d2-11ed-bc8e-edf6538225c3',
            rule_name: 'test',
            rule_risk: 21,
          },
        ],
        risk_score: 21.084609494640123,
        risk_multipliers: [],
      },
      ingest_timestamp: '2022-09-18T17:54:22.363192Z',
      risk: 'Unknown',
      '@timestamp': '2022-09-18T17:50:42.961Z',
    },
  },
  {
    id: 'Yb5XrKVhLNCdGL2ef-A3jloAAAAAAAAA',
    index: 'ml_user_risk_score_latest_default',
    source: {
      risk_stats: {
        rule_risks: [
          {
            rule_name: 'test',
            rule_risk: 21,
          },
        ],
        risk_score: 21.084609494640123,
      },
      '@timestamp': '2022-09-18T18:28:30.943Z',
      ingest_timestamp: '2022-09-18T18:31:32.969840Z',
      risk: 'Unknown',
      user: {
        name: 'johnsmith',
        risk: {
          calculated_level: 'Low',
          calculated_score_norm: 21,
          rule_risks: [
            {
              rule_name: 'test',
              rule_risk: 21,
            },
          ],
        },
      },
    },
  },
  {
    id: 'LrLLssaZUZHhh2cKbkwqIEpguUegcpuG9V+qzVlm8N0=',
    index: 'ml_user_risk_score_default',
    source: {
      risk_stats: {
        rule_risks: [
          {
            rule_name: 'test',
            rule_risk: 21,
          },
        ],
        risk_score: 21.084609494640123,
      },
      ingest_timestamp: '2022-09-18T18:31:32.969840Z',
      risk: 'Unknown',
      '@timestamp': '2022-09-18T18:28:30.943Z',
      user: {
        name: 'johnsmith',
        risk: {
          calculated_level: 'Low',
          calculated_score_norm: 21,
          rule_risks: [
            {
              rule_name: 'test',
              rule_risk: 21,
            },
          ],
        },
      },
    },
  },
];

const bulkIndexData = async () => {
  const body = data.flatMap((doc) => {
    doc.source['@timestamp'] = new Date().toISOString();
    return [{ index: { _index: doc.index } }, doc.source];
  });

  await esClient.bulk({ refresh: true, body });
};

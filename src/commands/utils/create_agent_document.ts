import { v4 as uuidv4 } from 'uuid';
import moment from 'moment';

export const createAgentDocument = ({ hostname }: { hostname: string }) => {
  const agentId = uuidv4();

  const nowTimestamp = moment().utc().toISOString();

  return {
    access_api_key_id: 'WDxG740BAG_XfFTa8Wbz',
    action_seq_no: [-1],
    active: true,
    agent: {
      id: agentId,
      version: '8.13.0',
    },
    enrolled_at: '2024-02-28T10:33:40Z',
    local_metadata: {
      elastic: {
        agent: {
          'build.original':
            '8.13.0 (build: edeb9adbf0c11a997359038d1393d14ab03462ce at 2024-02-23 12:32:56 +0000 UTC)',
          complete: false,
          id: agentId,
          log_level: 'info',
          snapshot: false,
          upgradeable: false,
          version: '8.13.0',
        },
      },
      host: {
        architecture: 'x86_64',
        hostname,
        id: '',
        ip: ['127.0.0.1/8', '172.17.0.10/16'],
        mac: ['02:42:ac:11:00:0a'],
        name: hostname,
      },
      os: {
        family: 'debian',
        full: 'Ubuntu focal(20.04.6 LTS (Focal Fossa))',
        kernel: '5.15.0-1032-gcp',
        name: 'Ubuntu',
        platform: 'ubuntu',
        version: '20.04.6 LTS (Focal Fossa)',
      },
    },
    policy_id: 'policy-elastic-agent-on-cloud',
    type: 'PERMANENT',
    outputs: {
      'es-containerhost': {
        api_key: 'XjxH740BAG_XfFTaAmYH:AtX5ejLMRIyfcmRXTMX-Lg',
        permissions_hash:
          'b8bf91d03aa17d178cdd82db91a1e0e7711e8fd623ee2d5cb689f912ad5cd026',
        type: 'elasticsearch',
        api_key_id: 'XjxH740BAG_XfFTaAmYH',
      },
    },
    policy_revision_idx: 5,
    policy_coordinator_idx: 1,
    updated_at: nowTimestamp,
    components: [
      {
        id: 'fake-policy',
        units: [
          {
            id: 'fleet-server-es-containerhost-fleet-server-fleet_server-elastic-cloud-fleet-server',
            type: 'input',
            message: 'Re-configuring',
            status: 'CONFIGURING',
          },
          {
            id: 'fleet-server-es-containerhost',
            type: 'output',
            message: 'Re-configuring',
            status: 'CONFIGURING',
          },
        ],
        type: 'fleet-server',
        message: "Healthy: communicating with pid '153'",
        status: 'HEALTHY',
      },
      {
        id: 'apm-es-containerhost',
        units: [
          {
            id: 'apm-es-containerhost',
            type: 'output',
            message: 'Healthy',
            status: 'HEALTHY',
          },
          {
            id: 'apm-es-containerhost-elastic-cloud-apm',
            type: 'input',
            message: 'Healthy',
            status: 'HEALTHY',
          },
        ],
        type: 'apm',
        message: "Healthy: communicating with pid '179'",
        status: 'HEALTHY',
      },
    ],
    last_checkin_message: 'Running',
    last_checkin_status: 'online',
    last_checkin: nowTimestamp,
  };
};

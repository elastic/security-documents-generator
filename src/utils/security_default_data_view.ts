import { getDataView, createDataView } from './kibana_api';

type DataView = {
  id: string;
  version: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
} & Record<string, any>;

const getDataViewInSpace = (space: string): DataView => ({
  id: `security-solution-${space}`,
  version: 'WzE3LDFd',
  title: `.alerts-security.alerts-${space},apm-*-transaction*,auditbeat-*,endgame-*,filebeat-*,logs-*,packetbeat-*,traces-apm*,winlogbeat-*,-*elastic-cloud-logs-*`,
  timeFieldName: '@timestamp',
  sourceFilters: [],
  fieldFormats: {},
  runtimeFieldMap: {},
  fieldAttrs: {},
  allowNoIndex: true,
  name: `Security solution ${space}`,
  allowHidden: false,
});

export const ensureSecurityDefaultDataView = async (space: string) => {
  const dataView = getDataViewInSpace(space);
  const existing = await getDataView(dataView.id, space);
  if (existing) {
    console.log(`Data view ${dataView.id} already exists in space ${space}`);
    return;
  }
  console.log(`Creating data view ${dataView.id} in space ${space}`);
  await createDataView(dataView, space);
  console.log(`Data view ${dataView.id} created in space ${space}`);
};

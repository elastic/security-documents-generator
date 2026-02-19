import {
  BulkResponse,
  BulkOperationContainer,
  BulkCreateOperation,
  DeleteByQueryResponse,
} from '@elastic/elasticsearch/lib/api/types';
import { chunk } from 'lodash-es';
import { getEsClient } from '../utils/indices';
import { addMetadataToDoc } from '../../utils/doc_metadata';
import { createProgressBar } from '../utils/cli_utils';
import { DEFAULT_CHUNK_SIZE } from '../../constants';

export type BulkOperationTuple = [BulkOperationContainer, object];

export const logBulkErrors = (result: BulkResponse, context: string): void => {
  if (!result.errors) {
    return;
  }
  const failedItems = result.items?.filter((item) => 'error' in item && item.error);
  console.error(context, failedItems);
};

/**
 * Execute a bulk request with a pre-built body (array of operation + document pairs).
 * Use when the caller has already constructed the full bulk body (e.g. mixed indices, custom _id).
 */
export async function bulkUpsert(params: {
  documents: unknown[];
  refresh?: boolean;
}): Promise<BulkResponse> {
  const { documents, refresh = true } = params;
  const client = getEsClient();
  const result = await client.bulk({ body: documents, refresh });
  logBulkErrors(result, 'Bulk request reported errors. Some documents may have failed.');
  return result;
}

export interface BulkIngestParams {
  index: string;
  documents: object[];
  chunkSize?: number;
  action?: 'index' | 'create';
  showProgress?: boolean;
  metadata?: boolean;
  refresh?: boolean;
  pipeline?: string;
}

/**
 * Ingest an array of documents into a single index in chunks.
 * Builds bulk operations (index or create) and optionally adds _metadata and progress bar.
 */
export async function bulkIngest(params: BulkIngestParams): Promise<void> {
  const {
    index,
    documents,
    chunkSize = DEFAULT_CHUNK_SIZE,
    action = 'index',
    showProgress = false,
    metadata = false,
    refresh = true,
    pipeline,
  } = params;

  const client = getEsClient();
  const chunks = chunk(documents, chunkSize);
  const progressBar = showProgress ? createProgressBar(index) : null;

  if (progressBar) {
    progressBar.start(documents.length, 0);
  }

  for (const chunkDocs of chunks) {
    const operations = chunkDocs.flatMap((doc) => {
      const payload = metadata ? addMetadataToDoc(doc) : doc;
      const op = action === 'create' ? { create: {} } : { index: {} };
      return [op, payload];
    });

    const result = await client.bulk({ index, operations, refresh, pipeline });
    logBulkErrors(result, 'Bulk ingest reported errors. Continuing with potential partial data.');
    if (progressBar) {
      progressBar.increment(chunkDocs.length);
    }
  }

  if (progressBar) {
    progressBar.stop();
  }
}

export interface StreamingBulkIngestParams {
  index: string;
  datasource: AsyncIterable<object>;
  flushBytes?: number;
  flushInterval?: number;
  onDrop?: (doc: unknown) => void;
  onDocument?: (doc: object) => BulkOperationTuple;
  onSuccess?: () => void;
}

/**
 * Stream documents from an async iterable into Elasticsearch using the helpers.bulk API.
 * Use for large or unbounded streams (e.g. file line readers, generators).
 */
export async function streamingBulkIngest(params: StreamingBulkIngestParams): Promise<void> {
  const {
    index,
    datasource,
    flushBytes = 1024 * 1024,
    flushInterval = 3000,
    onDrop,
    onDocument,
    onSuccess,
  } = params;

  const defaultOnDocument = (doc: object): BulkOperationTuple => [
    { create: { _index: index } as BulkCreateOperation },
    { ...doc },
  ];
  const docTransform = onDocument ?? defaultOnDocument;

  const client = getEsClient();

  // helpers.bulk expects AsyncIterator; get iterator from AsyncIterable
  const iterator = (datasource as AsyncIterable<object>)[Symbol.asyncIterator]();

  await client.helpers.bulk({
    datasource: iterator,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- helpers.bulk Action type is a complex union
    onDocument: (doc: object) => docTransform(doc) as any,
    flushBytes,
    flushInterval,
    onDrop: onDrop ? (d) => onDrop(d.document) : undefined,
    onSuccess,
  });
}

export async function deleteAllByIndex(params: {
  index: string | string[];
  refresh?: boolean;
  ignoreUnavailable?: boolean;
}): Promise<DeleteByQueryResponse> {
  const client = getEsClient();
  return client.deleteByQuery({
    index: params.index,
    refresh: params.refresh ?? true,
    ignore_unavailable: params.ignoreUnavailable ?? false,
    query: { match_all: {} },
  });
}

export async function deleteDataStreamSafe(name: string): Promise<void> {
  const client = getEsClient();
  try {
    await client.indices.deleteDataStream({ name });
  } catch (error: unknown) {
    const statusCode = (error as { meta?: { statusCode?: number } }).meta?.statusCode;
    if (statusCode !== 404) {
      throw error;
    }
    console.log('Resource does not yet exist, and will be created.');
  }
}

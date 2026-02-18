import {
  BulkResponse,
  BulkOperationContainer,
  BulkCreateOperation,
} from '@elastic/elasticsearch/lib/api/types';
import { chunk } from 'lodash-es';
import { getEsClient } from '../utils/indices';
import { addMetadataToDoc } from '../../utils/doc_metadata';
import { createProgressBar } from '../utils/cli_utils';
import { DEFAULT_CHUNK_SIZE } from '../../constants';

export type BulkOperationTuple = [BulkOperationContainer, object];

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
  if (result.errors) {
    console.error(
      'Bulk request reported errors. Some documents may have failed.',
      result.items?.filter((i) => 'error' in i && i.error)
    );
  }
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

    const result = await client.bulk({ index, operations, refresh });
    if (result.errors) {
      console.error(
        'Bulk ingest reported errors. Continuing with potential partial data.',
        result.items?.filter((i) => 'error' in i && i.error)
      );
    }
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

import { getEsClient, indexCheck, ingest } from '../utils/indices';

export const createPrivilegedAccessDetectionSourceIndex = async (index: string) => {
  try {
    await indexCheck(index, {
      mappings: {
        properties: {
          '@timestamp': {
            type: 'date',
          },
          user: {
            properties: {
              name: {
                type: 'keyword',
                fields: {
                  text: {
                    type: 'text',
                  },
                },
              },
            },
          },
          host: {
            properties: {
              name: {
                type: 'keyword',
                fields: {
                  text: {
                    type: 'text',
                  },
                },
              },
              os: {
                properties: {
                  type: {
                    type: 'keyword',
                    fields: {
                      text: {
                        type: 'text',
                      },
                    },
                  },
                },
              },
            },
          },
          process: {
            properties: {
              name: {
                type: 'keyword',
                fields: {
                  text: {
                    type: 'text',
                  },
                },
              },
              command_line: {
                type: 'keyword',
                fields: {
                  text: {
                    type: 'text',
                  },
                },
              },
            },
          },
          event: {
            properties: {
              type: {
                type: 'keyword',
                fields: {
                  text: {
                    type: 'text',
                  },
                },
              },
              category: {
                type: 'keyword',
                fields: {
                  text: {
                    type: 'text',
                  },
                },
              },
            },
          },
        },
      },
    });
  } catch (error) {
    console.log(
      'There was an error creating the source data index. This is likely a field mapping issue: ',
      error
    );
    throw error;
  }
};

export const deleteSourceIndex = async (index: string) => {
  try {
    await getEsClient().indices.delete({
      index: [index],
      ignore_unavailable: true,
    });
    console.log('Index deleted');
  } catch (error) {
    console.log(
      'There was an error deleting the source index. Will continue, and attempt to recreate the index: ',
      error
    );
  }
};

export const ingestIntoSourceIndex = async (index: string, documents: Array<object>) =>
  await ingest(index, documents);

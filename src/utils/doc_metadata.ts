import packageJson from '../../package.json' with { type: 'json' };
const { version } = packageJson;
import { faker } from '@faker-js/faker';

const RUN_ID = faker.string.uuid();
const AUTHOR = 'security-documents-generator';
const generateMetadata = () => {
  return {
    generatedAt: new Date().toISOString(),
    version: version,
    author: AUTHOR,
    runId: RUN_ID,
  };
};

export const addMetadataToDoc = (doc: object) => {
  return {
    ...doc,
    _metadata: generateMetadata(),
  };
};

export const getMetadataKQL = () => {
  return `_metadata.author: "${AUTHOR}"`;
};

import { version } from '../../package.json';
import { v4 as uuidv4 } from 'uuid';
const RUN_ID = uuidv4();
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

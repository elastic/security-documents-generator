import { kibanaApi } from '.';
import { getAlertIndex } from '.';
import { getEsClient } from '../commands/utils';
const DUMMY_RULE_ID = 'dummy-rule';

export const initializeSpace = async (space: string) => {
  await ensureSpaceExists(space);
  
  if (await alertIndexExistsInSpace(space)) {
    console.log('Skipping space initialization.');
    return;
  }
  console.log(`Initializing space ${space}`);
  console.log(`Creating dummy rule to initialize alerts index in ${space}`);
  await kibanaApi.createRule({space,id: DUMMY_RULE_ID}); 
  console.log('Deleting dummy rule');
  await kibanaApi.deleteRule(DUMMY_RULE_ID, space);
  console.log('Dummy rule deleted. Space initialized');
}

const alertIndexExistsInSpace = async (space: string): Promise<boolean> => {
  const client = getEsClient(); 
  const index = getAlertIndex(space);
  console.log(`Checking if index ${index} exists`);
  const exists = await client.indices.exists({ index });

  if (exists) {
    console.log(`Index ${index} exists`);
    return true;
  }

  console.log(`Index ${index} does not exist`);
  return false;
}

const ensureSpaceExists = async (space: string) => {
  console.log(`Checking if space ${space} exists`);
  if (await kibanaApi.getSpace(space)) {
    console.log(`Space ${space} exists`);
    return;
  }

  console.log(`Space ${space} does not exist. Creating space ${space}`);
  await kibanaApi.createSpace(space);
  console.log(`Space ${space} created`);
}


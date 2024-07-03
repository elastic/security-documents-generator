import { createRule, deleteRule } from '../commands/api';
import { getAlertIndex } from '.';
import { getEsClient } from '../commands/utils';
const DUMMY_RULE_ID = 'dummy-rule';

export const initializeSpace = async (space: string) => {
  if (await alertIndexExistsInSpace(space)) {
    console.log('Skipping space initialization.');
    return;
  }
  console.log(`Initializing space ${space}`);
  console.log(`Creating dummy rule to initialize alerts index in ${space}`);
  await createRule({space,id: DUMMY_RULE_ID}); 
  console.log('Deleting dummy rule');
  await deleteRule(DUMMY_RULE_ID, space);
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


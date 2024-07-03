import { createRule, deleteRule } from '../api';

const DUMMY_RULE_ID = 'dummy-rule';

export async function initializeSpace(space: string) {
  console.log(`Creating dummy rule to initialize alerts inde in ${space}`);
  await createRule({space,id: DUMMY_RULE_ID}); 
  console.log('Deleting dummy rule');
  await deleteRule(DUMMY_RULE_ID, space);
  console.log('Dummy rule deleted. Space initialized');
}


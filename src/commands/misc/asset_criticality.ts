import { faker } from '@faker-js/faker';
import { generateNewSeed } from '../../constants.ts';
import { log } from '../../utils/logger.ts';
import {
  assignAssetCriticalityToEntities,
  createRandomHost,
  createRandomUser,
} from '../entity_store/entity_store.ts';

/**
 * Generate asset criticality
 */
export const generateAssetCriticality = async ({
  users,
  hosts,
  seed = generateNewSeed(),
  space = 'default',
}: {
  users: number;
  hosts: number;
  seed?: number;
  space: string;
}) => {
  faker.seed(seed);

  try {
    const generatedUsers = faker.helpers.multiple(createRandomUser, {
      count: users,
    });

    const generatedHosts = faker.helpers.multiple(createRandomHost, {
      count: hosts,
    });

    await assignAssetCriticalityToEntities({
      entities: generatedUsers,
      field: 'user.name',
      space,
    });
    log.info(`Assigned asset criticality to ${generatedUsers.length} users`);
    await assignAssetCriticalityToEntities({
      entities: generatedHosts,
      field: 'host.name',
      space,
    });
    log.info(`Assigned asset criticality to ${generatedHosts.length} hosts`);

    log.info('Finished generating asset criticality');
  } catch (error) {
    log.error('Error: ', error);
  }
};

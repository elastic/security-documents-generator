import { faker } from '@faker-js/faker';
import { generateNewSeed } from '../constants';
import {
  assignAssetCriticalityToEntities,
  createRandomHost,
  createRandomUser,
} from './entity-store';

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
    console.log(`Assigned asset criticality to ${generatedUsers.length} users`);
    await assignAssetCriticalityToEntities({
      entities: generatedHosts,
      field: 'host.name',
      space,
    });
    console.log(`Assigned asset criticality to ${generatedHosts.length} hosts`);

    console.log('Finished generating asset criticality');
  } catch (error) {
    console.log('Error: ', error);
  }
};

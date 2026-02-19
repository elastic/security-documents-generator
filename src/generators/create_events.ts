import { faker } from '@faker-js/faker';
import moment from 'moment';

export default function createEvents(override = {}) {
  return {
    '@timestamp': moment().format('yyyy-MM-DDTHH:mm:ss.SSSSSSZ'),
    criticality: faker.helpers.arrayElement([
      'low_impact',
      'medium_impact',
      'high_impact',
      'extreme_impact',
    ]),
    ...override,
  };
}

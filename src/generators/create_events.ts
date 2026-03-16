import { faker } from '@faker-js/faker';
import dayjs from 'dayjs';

export default function createEvents(override = {}) {
  return {
    '@timestamp': dayjs().format('YYYY-MM-DDTHH:mm:ss.SSSZ'),
    criticality: faker.helpers.arrayElement([
      'low_impact',
      'medium_impact',
      'high_impact',
      'extreme_impact',
    ]),
    ...override,
  };
}

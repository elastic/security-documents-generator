import { faker } from '@faker-js/faker';
import { generateTimestamp } from './utils/timestamp_utils';
export default function createEvents(override = {}) {
    return {
        '@timestamp': generateTimestamp(),
        criticality: faker.helpers.arrayElement([
            'low_impact',
            'medium_impact',
            'high_impact',
            'extreme_impact',
        ]),
        ...override,
    };
}

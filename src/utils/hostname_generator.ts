/**
 * Hostname Generator Utility
 *
 * Generates realistic hostname lists for attack simulations
 */

import { faker } from '@faker-js/faker';

/**
 * Generates a list of realistic hostnames for security testing
 */
export function generateHostnameList(count: number): string[] {
  const hostnames: string[] = [];
  const departments = [
    'web',
    'db',
    'app',
    'mail',
    'dc',
    'file',
    'print',
    'backup',
  ];
  const environments = ['prod', 'dev', 'test', 'stage'];

  for (let i = 0; i < count; i++) {
    const department = faker.helpers.arrayElement(departments);
    const environment = faker.helpers.arrayElement(environments);
    const number = faker.number.int({ min: 1, max: 99 });

    const hostname = `${department}-${environment}-${number.toString().padStart(2, '0')}`;
    hostnames.push(hostname);
  }

  return hostnames;
}

export default generateHostnameList;

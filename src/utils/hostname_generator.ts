/**
 * Hostname Generator Utility
 *
 * Generates realistic hostname lists for attack simulations with theme support
 */

import { faker } from '@faker-js/faker';
import { getGlobalThemeGenerator } from './universal_theme_generator';

/**
 * Generates a list of realistic hostnames for security testing
 * Now supports theme-based generation when a theme is configured
 */
export async function generateHostnameList(count: number): Promise<string[]> {
  const hostnames: string[] = [];
  const generator = getGlobalThemeGenerator();

  if (generator.hasTheme()) {
    // Use theme-based generation
    for (let i = 0; i < count; i++) {
      try {
        const hostname = await generator.generateHostname();
        hostnames.push(hostname);
      } catch {
        // Fallback to standard generation on error
        hostnames.push(generateFallbackHostname());
      }
    }
  } else {
    // Use standard faker-based generation
    for (let i = 0; i < count; i++) {
      hostnames.push(generateFallbackHostname());
    }
  }

  return hostnames;
}

/**
 * Generate a single hostname with theme support
 */
export async function generateThemedHostname(): Promise<string> {
  const generator = getGlobalThemeGenerator();

  if (generator.hasTheme()) {
    try {
      return await generator.generateHostname();
    } catch {
      return generateFallbackHostname();
    }
  }

  return generateFallbackHostname();
}

/**
 * Fallback hostname generation using faker
 */
function generateFallbackHostname(): string {
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

  const department = faker.helpers.arrayElement(departments);
  const environment = faker.helpers.arrayElement(environments);
  const number = faker.number.int({ min: 1, max: 99 });

  return `${department}-${environment}-${number.toString().padStart(2, '0')}`;
}

// Maintain backward compatibility
export default generateHostnameList;

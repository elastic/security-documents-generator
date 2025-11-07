import { faker } from '@faker-js/faker';

export const enhanceUserEntity = (user: Record<string, unknown>) => {
  const name = user.user.name;
  const asset = user.asset as Record<string, unknown>;

  return {
    asset: {
      criticality: faker.helpers.arrayElement([
        'low_impact',
        'medium_impact',
        'high_impact',
        'extreme_impact',
      ]),
      environment: faker.helpers.arrayElement([
        'production',
        'staging',
        'development',
      ]),
      id: asset?.id ?? faker.string.uuid(),
      model: faker.company.name(),
      name,
      owner: faker.person.fullName(),
      serial_number: faker.string.uuid(),
      vendor: faker.company.name(),
      business_unit: faker.commerce.department(),
    },
    entity: {
      id: name,
      relationships: {
        accesses_frequently: [faker.person.fullName()],
        owns: [faker.person.fullName()],
        supervises: [faker.person.fullName()],
        supervised_by: [faker.person.fullName()],
      },
      attributes: {
        asset: faker.datatype.boolean(),
        managed: faker.datatype.boolean(),
        mfa_enabled: faker.datatype.boolean(),
        privileged: faker.datatype.boolean(),
      },
      behaviors: {
        brute_force_victim: faker.datatype.boolean(),
        new_country_login: faker.datatype.boolean(),
        used_usb_device: faker.datatype.boolean(),
      },
      lifecycle: {
        first_seen: new Date().toISOString(),
        last_activity: new Date().toISOString(),
      },
      name: name,
      risk: {
        calculated_level: faker.helpers.arrayElement([
          'Low',
          'Moderate',
          'High',
          'Critical',
          'Unknown',
        ]),
        calculated_score: faker.number.float({ min: 0, max: 200 }),
        calculated_score_norm: faker.number.float({ min: 0, max: 1 }),
      },
      source: 'endpoint',
      sub_type: 'user',
      type: 'Identity',
    },
  };
};

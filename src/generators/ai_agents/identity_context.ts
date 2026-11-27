import { faker } from '@faker-js/faker';
import {
  ENTRA_USER_INDEX,
  OKTA_USER_INDEX,
  POC_MOCK_TAG,
  type GeneratedDocument,
} from './types.ts';

/**
 * IdP documents that give a signed-in email a person behind it. The IdP users are in the
 * Okta and Entra ID entity analytics stored shapes (the packages' pipeline test outputs), so Entity
 * Store mints `user:<email>@okta` and `user:<email>@entra_id` rows from them. None of it is observed.
 */
export interface IdpPerson {
  readonly email: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly department: string;
  readonly title: string;
}

const iso = (ms: number): string => new Date(ms).toISOString();

export type OktaStatus = 'ACTIVE' | 'DEPROVISIONED' | 'SUSPENDED';

const OKTA_ACCOUNT_STATUSES = [
  'recovery',
  'locked_out',
  'suspended',
  'password_expired',
  'deprovisioned',
];

export const buildOktaUser = (
  person: IdpPerson,
  {
    at,
    status,
    statusChangedAt = at,
  }: { at: number; status: OktaStatus; statusChangedAt?: number },
): GeneratedDocument => {
  const id = `00u${faker.string.alphanumeric(17)}`;
  const fullName = `${person.firstName} ${person.lastName}`;
  return {
    index: OKTA_USER_INDEX,
    source: {
      '@timestamp': iso(at),
      asset: {
        category: 'entity',
        id,
        name: fullName,
        status,
        type: 'okta_user',
        vendor: 'OKTA',
        last_status_change_date: iso(statusChangedAt),
      },
      data_stream: { dataset: 'entityanalytics_okta.user', namespace: 'default', type: 'logs' },
      ecs: { version: '8.11.0' },
      entityanalytics_okta: {
        user: {
          id,
          status,
          status_changed: iso(statusChangedAt),
          profile: {
            email: person.email,
            login: person.email,
            first_name: person.firstName,
            last_name: person.lastName,
            department: person.department,
            title: person.title,
            user_type: 'Employee',
          },
        },
      },
      event: {
        category: ['iam'],
        kind: 'asset',
        module: 'entityanalytics_okta',
        type: ['user', 'info'],
      },
      input: { type: 'entity-analytics' },
      labels: { identity_source: 'okta-poc-mock' },
      tags: [POC_MOCK_TAG],
      user: {
        id,
        email: person.email,
        name: person.email,
        full_name: fullName,
        account: {
          status: Object.fromEntries(
            OKTA_ACCOUNT_STATUSES.map((value) => [value, value === status.toLowerCase()]),
          ),
          change_date: iso(statusChangedAt),
        },
        profile: { department: person.department, job_title: person.title, status },
      },
    },
  };
};

export const buildEntraUser = (
  person: IdpPerson,
  { at, accountEnabled }: { at: number; accountEnabled: boolean },
): GeneratedDocument => {
  const id = faker.string.uuid();
  const fullName = `${person.firstName} ${person.lastName}`;
  return {
    index: ENTRA_USER_INDEX,
    source: {
      '@timestamp': iso(at),
      asset: { category: 'entity', id, type: 'microsoft_entra_id_user' },
      data_stream: { dataset: 'entityanalytics_entra_id.user', namespace: 'default', type: 'logs' },
      ecs: { version: '8.11.0' },
      entityanalytics_entra_id: {
        user: {
          id,
          account_enabled: accountEnabled,
          department: person.department,
          display_name: fullName,
          given_name: person.firstName,
          surname: person.lastName,
          job_title: person.title,
          mail: person.email,
          user_principal_name: person.email,
        },
      },
      event: {
        category: ['iam'],
        kind: 'asset',
        module: 'entityanalytics_entra_id',
        type: ['user', 'info'],
      },
      labels: { identity_source: 'entra_id-poc-mock' },
      tags: [POC_MOCK_TAG],
      user: {
        id,
        email: person.email,
        name: person.email,
        full_name: fullName,
        first_name: person.firstName,
        last_name: person.lastName,
        job_title: person.title,
        ...(accountEnabled && { enabled: true }),
      },
    },
  };
};

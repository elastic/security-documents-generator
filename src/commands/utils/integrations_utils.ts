import {
  AD_USERS_SAMPLE_ADMIN_DOCUMENT,
  AD_USERS_SAMPLE_DOCUMENT,
  OKTA_USERS_SAMPLE_DOCUMENT,
} from '../privileged_user_monitoring/sample_documents';
import {
  userNameAsEmail,
  userNameWhitespaceRemoved,
} from './sample_data_helpers';
import { TimeWindows } from './time_windows';
import { faker } from '@faker-js/faker';

export const OKTA_ADMIN_USER_ROLES: string[] = [
  'Super Administrator',
  'Organization Administrator',
  'Group Administrator',
  'Application Administrator',
  'Mobile Administrator',
  'Help Desk Administrator',
  'Report Administrator',
  'API Access Management Administrator',
  'Group Membership Administrator',
  'Read-only Administrator',
];

export const OKTA_NON_ADMIN_USER_ROLES: string[] = [
  'Guest',
  'Employee',
  'Contractor',
  'Intern',
  'Temp',
];

export const AD_ADMIN_USER_GROUPS: string[] = [
  'Domain Admins',
  'Enterprise Admins',
];

export const AD_NON_ADMIN_USER_GROUPS: string[] = [
  'Domain Users',
  'Account Operators',
  'Backup Operators',
  'Guests',
];

export type OktaSampleUser = {
  email: string;
  firstName: string;
  lastName: string;
  userId: string;
  userName: string;
};

export type AdSampleUser = {
  userName: string;
};

export const createOktaSampleUser = (): OktaSampleUser => {
  const firstName = faker.person.firstName();
  const lastName = faker.person.lastName();
  const userId = faker.string.uuid();
  const userName = userNameWhitespaceRemoved(`${firstName}.${lastName}`);
  const email = userNameAsEmail(userName);
  return {
    email,
    firstName,
    lastName,
    userId,
    userName,
  };
};

export const createAdSampleUser = (): AdSampleUser => {
  const firstName = faker.person.firstName();
  const lastName = faker.person.lastName();
  const userName = userNameWhitespaceRemoved(`${firstName}.${lastName}`);
  return {
    userName: userName,
  };
};

// integrations helpers for admin roles split
export const pick = <T>(a: T[]) => a[Math.floor(Math.random() * a.length)];
export const makeDoc = (isAdmin: boolean) =>
  OKTA_USERS_SAMPLE_DOCUMENT(
    createOktaSampleUser(), // new user each doc
    TimeWindows.toRandomTimestamp(TimeWindows.last30DayWindow()),
    [isAdmin ? pick(OKTA_ADMIN_USER_ROLES) : pick(OKTA_NON_ADMIN_USER_ROLES)],
  );

export const makeAdUserDoc = (isAdmin: boolean, increment?: number) => {
  const adSampleUser = createAdSampleUser();
  const timestamp = TimeWindows.toRandomTimestamp(
    TimeWindows.last30DayWindow(),
  );
  const isAdminGroup = pick(
    isAdmin ? AD_ADMIN_USER_GROUPS : AD_NON_ADMIN_USER_GROUPS,
  );

  if (isAdmin) {
    return AD_USERS_SAMPLE_ADMIN_DOCUMENT(adSampleUser, timestamp, [
      isAdminGroup,
    ]);
  } else {
    return AD_USERS_SAMPLE_DOCUMENT(
      adSampleUser,
      timestamp,
      [isAdminGroup],
      increment ?? 0, // fallback to 0 if not provided
    );
  }
};

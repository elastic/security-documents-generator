import { credentialAccessMfaBombingPushNotications } from './credential_access_mfa_bombing_push_notications';
import { credentialAccessRapidResetPasswordRequestsForDifferentUsers } from './credential_access_rapid_reset_password_requests_for_different_users';
import { initialAccessImpossibleTravelSignOn } from './initial_access_impossible_travel_sign_on';

export const oktaGenerators = [
  credentialAccessMfaBombingPushNotications,
  credentialAccessRapidResetPasswordRequestsForDifferentUsers,
  initialAccessImpossibleTravelSignOn,
] as const;

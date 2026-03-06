/**
 * SaaS application definitions for realistic integration data
 */

import { DepartmentName } from '../types';

/**
 * SaaS application used by the organization
 */
export interface SaaSApp {
  name: string;
  category: string;
  o365Workload?: string; // M365 workload name if applicable
  googleService?: string; // Google Workspace service if applicable
}

/**
 * O365 workloads and their operations
 */
export const O365_WORKLOADS: Record<string, { operations: string[]; recordType: string }> = {
  AzureActiveDirectory: {
    operations: [
      'UserLoggedIn',
      'UserLoginFailed',
      'Add service principal.',
      'Update application.',
      'Add app role assignment to service principal.',
      'Change user password.',
      'Reset user password.',
      'Add member to group.',
      'Remove member from group.',
      'Consent to application.',
    ],
    recordType: 'AzureActiveDirectoryStsLogon',
  },
  Exchange: {
    operations: [
      'MailItemsAccessed',
      'Send',
      'Create',
      'Update',
      'MoveToDeletedItems',
      'SoftDelete',
      'SearchQueryInitiated',
      'MailboxLogin',
    ],
    recordType: 'ExchangeItem',
  },
  SharePoint: {
    operations: [
      'FileAccessed',
      'FileModified',
      'FileUploaded',
      'FileDownloaded',
      'FileDeleted',
      'FileMoved',
      'FileCopied',
      'FileRenamed',
      'FolderCreated',
      'FolderDeleted',
      'PageViewed',
      'SearchQueryPerformed',
      'SharingSet',
      'SharingRevoked',
    ],
    recordType: 'SharePoint',
  },
  OneDrive: {
    operations: [
      'FileAccessed',
      'FileModified',
      'FileUploaded',
      'FileDownloaded',
      'FileSyncUploadedFull',
      'FileSyncDownloadedFull',
      'PageViewed',
    ],
    recordType: 'SharePoint',
  },
  MicrosoftTeams: {
    operations: [
      'TeamCreated',
      'MemberAdded',
      'MemberRemoved',
      'ChannelAdded',
      'MessageSent',
      'ChatCreated',
      'AppInstalled',
      'TabAdded',
      'MeetingStarted',
      'MeetingEnded',
    ],
    recordType: 'MicrosoftTeams',
  },
};

/**
 * Department to O365 workload usage weights
 */
export const DEPT_O365_WEIGHTS: Record<DepartmentName, Record<string, number>> = {
  'Product & Engineering': {
    MicrosoftTeams: 30,
    OneDrive: 25,
    SharePoint: 20,
    Exchange: 15,
    AzureActiveDirectory: 10,
  },
  'Sales & Marketing': {
    Exchange: 35,
    SharePoint: 25,
    MicrosoftTeams: 20,
    OneDrive: 15,
    AzureActiveDirectory: 5,
  },
  'Customer Success': {
    Exchange: 30,
    MicrosoftTeams: 30,
    SharePoint: 20,
    OneDrive: 15,
    AzureActiveDirectory: 5,
  },
  Operations: {
    Exchange: 25,
    SharePoint: 25,
    MicrosoftTeams: 20,
    OneDrive: 15,
    AzureActiveDirectory: 15,
  },
  Executive: {
    Exchange: 30,
    MicrosoftTeams: 25,
    SharePoint: 20,
    OneDrive: 15,
    AzureActiveDirectory: 10,
  },
};

/**
 * O365 SharePoint site URLs by department
 */
export const SHAREPOINT_SITES: Record<string, string[]> = {
  'Product & Engineering': ['/sites/engineering', '/sites/product', '/sites/devops'],
  'Sales & Marketing': ['/sites/sales', '/sites/marketing', '/sites/campaigns'],
  'Customer Success': ['/sites/customer-success', '/sites/support', '/sites/knowledge-base'],
  Operations: ['/sites/hr', '/sites/finance', '/sites/legal', '/sites/it'],
  Executive: ['/sites/leadership', '/sites/board', '/sites/strategy'],
};

/**
 * Google Workspace service types and their event types
 */
export const GOOGLE_WORKSPACE_SERVICES = {
  login: {
    events: [
      'login_success',
      'login_failure',
      'login_challenge',
      'login_verification',
      'logout',
      'account_disabled_password_leak',
      'suspicious_login',
      'suspicious_login_less_secure_app',
      'government_attack_warning',
    ],
    challengeMethods: [
      'idv_preregistered_phone',
      'idv_backup_phone',
      'idv_secret_qa',
      'password',
      'google_prompt',
    ],
  },
  admin: {
    events: [
      'CHANGE_APPLICATION_SETTING',
      'CREATE_USER',
      'DELETE_USER',
      'SUSPEND_USER',
      'UNSUSPEND_USER',
      'GRANT_ADMIN_PRIVILEGE',
      'REVOKE_ADMIN_PRIVILEGE',
      'ADD_GROUP_MEMBER',
      'REMOVE_GROUP_MEMBER',
      'CHANGE_PASSWORD',
      'CHANGE_USER_SETTING',
      'TOGGLE_SERVICE_ENABLED',
      'CREATE_DATA_TRANSFER_REQUEST',
      'CHANGE_DOMAIN_DEFAULT_LOCALE',
    ],
    applications: ['drive', 'gmail', 'calendar', 'meet', 'chat', 'sites', 'groups'],
  },
  drive: {
    events: [
      'add_to_folder',
      'create',
      'delete',
      'download',
      'edit',
      'move',
      'preview',
      'rename',
      'upload',
      'view',
      'change_acl_editors',
      'change_document_visibility',
      'change_document_access_scope',
      'shared_with_domains',
    ],
    fileTypes: [
      'document',
      'spreadsheet',
      'presentation',
      'form',
      'pdf',
      'image',
      'video',
      'folder',
    ],
    visibilities: [
      'people_with_link',
      'private',
      'people_within_domain_with_link',
      'public_on_the_web',
    ],
  },
  saml: {
    events: ['login_success', 'login_failure'],
    failureTypes: [
      'failure_app_not_configured_for_user',
      'failure_app_not_enabled_for_user',
      'failure_invalid_signature',
      'failure_unspecified',
      'failure_no_user',
    ],
    initiatedBy: ['idp', 'sp'],
    applications: [
      'Salesforce',
      'Slack',
      'AWS Console',
      'GitHub',
      'Jira',
      'Confluence',
      'ServiceNow',
      'Workday',
      'Zoom',
    ],
  },
  token: {
    events: ['authorize', 'revoke'],
    appNames: [
      'Gmail Add-on',
      'Google Drive',
      'Google Calendar',
      'Slack',
      'Zoom',
      'Chrome Extension',
      'Third-Party App',
      'Mobile App',
    ],
    clientTypes: ['WEB', 'NATIVE', 'INSTALLED'],
    scopes: [
      'https://www.googleapis.com/auth/gmail.readonly',
      'https://www.googleapis.com/auth/drive',
      'https://www.googleapis.com/auth/calendar',
      'https://www.googleapis.com/auth/userinfo.email',
      'https://www.googleapis.com/auth/admin.directory.user',
    ],
  },
  access_transparency: {
    events: ['APPLICATION_EVENT'],
    products: ['CALENDAR', 'DRIVE', 'GMAIL', 'GROUPS', 'MEET', 'SITES'],
  },
  context_aware_access: {
    events: ['APPLICATION_EVENT'],
    accessLevels: ['corpNetwork', 'managedDevice', 'trustedDevice'],
    deviceStates: ['COMPLIANT', 'NON_COMPLIANT', 'UNKNOWN'],
    applications: ['Gmail', 'Drive', 'Calendar', 'Meet', 'Chat', 'Admin Console'],
  },
  alert: {
    types: [
      'User reported phishing',
      'Suspicious login',
      'Government backed attack',
      'Device compromised',
      'Leaked password',
      'Malware message detected',
      'Phishing message detected',
      'Suspicious message reported',
    ],
    sources: [
      'Gmail phishing',
      'Suspicious login',
      'Government backed attack',
      'Device management',
      'Identity service',
      'Gmail',
    ],
    severities: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const,
    statuses: ['NOT_STARTED', 'IN_PROGRESS', 'CLOSED'] as const,
  },
  user_accounts: {
    events: [
      '2sv_disable',
      '2sv_enroll',
      'account_disabled_generic',
      'account_disabled_spamming',
      'account_disabled_hijacked',
      'account_enabled',
      'password_edit',
      'recovery_email_edit',
      'recovery_phone_edit',
      'titanium_enroll',
      'titanium_unenroll',
    ],
    eventTypes: ['2sv_change', 'account_warning', 'password_change', 'recovery_info_change'],
  },
  groups: {
    events: [
      'change_acl_permission',
      'add_member',
      'remove_member',
      'change_basic_setting',
      'change_member_role',
      'create_group',
      'delete_group',
      'approve_join_request',
      'reject_join_request',
    ],
    eventTypes: ['acl_change', 'group_member_change', 'group_setting_change'],
    aclPermissions: [
      'can_add_members',
      'can_post_messages',
      'can_view_members',
      'can_invite_members',
    ],
    memberRoles: ['owner', 'manager', 'member'],
  },
  group_enterprise: {
    events: [
      'add_info_setting',
      'remove_info_setting',
      'change_info_setting',
      'add_member',
      'remove_member',
      'change_member_role',
      'update_security_setting',
    ],
    eventTypes: ['moderator_action', 'member_action'],
    memberRoles: ['owner', 'manager', 'member'],
    memberTypes: ['user', 'group', 'service_account'],
  },
  device: {
    events: [
      'APPLICATION_EVENT',
      'DEVICE_REGISTER_UNREGISTER_EVENT',
      'DEVICE_COMPLIANCE_EVENT',
      'SUSPICIOUS_ACTIVITY_EVENT',
      'OS_UPDATE_EVENT',
    ],
    deviceTypes: ['ANDROID', 'IOS', 'GOOGLE_SYNC', 'WINDOWS', 'MAC', 'LINUX', 'CHROME_OS'],
    complianceStates: ['COMPLIANT', 'NON_COMPLIANT', 'UNKNOWN'],
    compromisedStates: ['NOT_COMPROMISED', 'COMPROMISED'],
    ownerships: ['COMPANY_OWNED', 'BRING_YOUR_OWN_DEVICE'],
    accountStates: ['REGISTERED', 'UNREGISTERED', 'PENDING'],
  },
  rules: {
    events: ['rule_match', 'rule_trigger', 'label_applied', 'label_removed'],
    eventTypes: ['rule_match_type', 'rule_trigger_type'],
    dataSources: ['DRIVE', 'CHROME', 'CHAT', 'GMAIL'],
    severities: ['LOW', 'MEDIUM', 'HIGH'],
    scanTypes: ['CONTENT_SCAN', 'CONTEXT_SCAN'],
    ruleNames: [
      'PII Detection Rule',
      'Credit Card Number Rule',
      'SSN Detection Rule',
      'Confidential Content Rule',
      'External Sharing Rule',
    ],
  },
  chrome: {
    events: [
      'BROWSER_EXTENSION_INSTALL',
      'BROWSER_EXTENSION_UNINSTALL',
      'UNSAFE_SITE_VISIT',
      'MALWARE_TRANSFER',
      'PASSWORD_REUSE',
      'LOGIN_EVENT',
      'CONTENT_TRANSFER',
      'CONTENT_UNSCANNED',
      'EXTENSION_REQUEST',
    ],
    extensionSources: ['CHROME_WEBSTORE', 'EXTERNAL', 'SIDELOADED'],
    clientTypes: ['CHROME_BROWSER', 'CHROME_OS_DEVICE', 'CHROME_PROFILE'],
    browserVersions: [
      '123.0.6312.112',
      '124.0.6367.91',
      '125.0.6422.60',
      '126.0.6478.55',
      '127.0.6533.72',
    ],
    extensionNames: [
      'uBlock Origin',
      'Grammarly',
      'LastPass',
      'Honey',
      'Dark Reader',
      'Zoom Scheduler',
      'Salesforce',
      'HubSpot Sales',
    ],
  },
  gmail: {
    events: ['delivery', 'receipt', 'sending', 'bounce'],
    mailEventTypes: ['0', '1', '2', '27'],
    actionTypes: ['68', '4', '5', '2'],
  },
  calendar: {
    events: [
      'create_calendar',
      'delete_calendar',
      'change_calendar_acls',
      'change_calendar_setting',
      'create_event',
      'change_event',
      'delete_event',
      'change_event_guest_response',
    ],
    eventTypes: ['calendar_change', 'event_change', 'notification_setting'],
    apiKinds: ['web', 'caldav', 'api_v3', 'android', 'ios'],
  },
  chat: {
    events: [
      'room_name_updated',
      'room_created',
      'member_added',
      'member_removed',
      'message_posted',
      'message_edited',
      'message_deleted',
      'attachment_uploaded',
    ],
    eventTypes: ['user_action', 'admin_action'],
    actorTypes: ['NON_ADMIN', 'ADMIN'],
    conversationTypes: ['SPACE', 'GROUP_CHAT', 'DIRECT_MESSAGE'],
    conversationOwnerships: ['INTERNALLY_OWNED', 'EXTERNALLY_OWNED'],
  },
  meet: {
    events: [
      'invitation_sent',
      'call_started',
      'call_ended',
      'participant_joined',
      'participant_left',
      'recording_started',
      'recording_stopped',
      'screen_share_started',
      'screen_share_stopped',
    ],
    eventTypes: ['conference_action', 'call_event'],
    identifierTypes: ['email_address', 'phone_number', 'device'],
  },
  keep: {
    events: [
      'uploaded_attachment',
      'created_note',
      'edited_note',
      'deleted_note',
      'shared_note',
      'trashed_note',
    ],
    eventTypes: ['user_action'],
  },
  data_studio: {
    events: [
      'view_report',
      'edit_report',
      'create_report',
      'delete_report',
      'share_report',
      'delete_distribution_content',
    ],
    assetTypes: ['REPORT', 'DATA_SOURCE'],
    visibilities: ['PEOPLE_WITHIN_DOMAIN_WITH_LINK', 'PRIVATE', 'PUBLIC', 'PEOPLE_WITH_LINK'],
    eventTypes: ['ACCESS', 'EDIT', 'CREATION'],
  },
  vault: {
    events: [
      'view_per_matter_litigation_hold_report',
      'create_matter',
      'close_matter',
      'reopen_matter',
      'add_hold',
      'remove_hold',
      'create_export',
      'view_held_accounts',
    ],
    eventTypes: ['user_action', 'admin_action'],
  },
  gcp: {
    events: [
      'IMPORT_SSH_PUBLIC_KEY',
      'DELETE_SSH_PUBLIC_KEY',
      'CREATE_INSTANCE',
      'DELETE_INSTANCE',
      'UPDATE_INSTANCE',
    ],
    eventTypes: ['CLOUD_OSLOGIN', 'CLOUD_COMPUTE'],
  },
};

/**
 * Department to Google Workspace drive activity weights
 */
export const DEPT_DRIVE_WEIGHTS: Record<DepartmentName, Record<string, number>> = {
  'Product & Engineering': {
    document: 30,
    spreadsheet: 15,
    presentation: 10,
    form: 5,
    pdf: 20,
    image: 10,
    folder: 10,
  },
  'Sales & Marketing': {
    document: 15,
    spreadsheet: 30,
    presentation: 25,
    form: 5,
    pdf: 15,
    image: 5,
    folder: 5,
  },
  'Customer Success': {
    document: 25,
    spreadsheet: 20,
    presentation: 15,
    form: 10,
    pdf: 20,
    image: 5,
    folder: 5,
  },
  Operations: {
    document: 20,
    spreadsheet: 30,
    presentation: 10,
    form: 10,
    pdf: 20,
    image: 5,
    folder: 5,
  },
  Executive: {
    document: 20,
    spreadsheet: 15,
    presentation: 35,
    form: 5,
    pdf: 15,
    image: 5,
    folder: 5,
  },
};

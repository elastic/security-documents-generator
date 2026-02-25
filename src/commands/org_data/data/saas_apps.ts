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

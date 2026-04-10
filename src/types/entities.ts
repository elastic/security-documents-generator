export type EntityType = 'user' | 'host' | 'service' | 'generic';

export const ENTITY_TYPES: EntityType[] = ['user', 'host', 'service', 'generic'];

export interface EntityFields {
  id: string;
  name: string;
  type: string;
  sub_type: string;
  address: string;
}

export interface HostFields {
  host: {
    hostname?: string;
    domain?: string;
    ip?: string[];
    name: string;
    id?: string;
    type?: string;
    mac?: string[];
    architecture?: string[];
  };
}

export interface UserFields {
  user: {
    full_name?: string[];
    domain?: string;
    roles?: string[];
    name: string;
    id?: string;
    email?: string | string[];
    hash?: string[];
    entity?: { id: string };
  };
  /** Event metadata for UEBA postAggFilter (e.g. IAM so user entities are kept after LOOKUP) */
  event?: {
    kind?: string;
    category?: string;
    type?: string;
  };
}

export interface ServiceFields {
  service: {
    name: string;
    id?: string;
    type?: string;
    node?: {
      roles?: string;
      name?: string;
    };
    environment?: string;
    address?: string;
    state?: string;
    ephemeral_id?: string;
    version?: string;
  };
}

export interface GenericEntityFields {
  entity: EntityFields;
  event?: {
    ingested?: string;
    dataset?: string;
    module?: string;
  };
  cloud?: {
    provider?: string;
    region?: string;
    account?: {
      name?: string;
      id?: string;
    };
  };
}

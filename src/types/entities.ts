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
  entity: EntityFields;
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
  entity: EntityFields;
  user: {
    full_name?: string[];
    domain?: string;
    roles?: string[];
    name: string;
    id?: string;
    email?: string[];
    hash?: string[];
  };
}

export interface ServiceFields {
  entity: EntityFields;
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

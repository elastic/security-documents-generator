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
  /**
   * Event metadata for the user postAggFilter: a doc becomes/updates an entity
   * only if `event.kind` includes `asset` (-> IdP namespace, high confidence)
   * or `host.id` is present (-> `entity.namespace: local`, medium confidence).
   * Neither present means the doc is dropped, same as noise.
   */
  event?: {
    kind?: string;
    module?: string;
    category?: string;
    type?: string;
  };
  /** Presence of `host.id` (with no IdP `event.kind: asset`) resolves `entity.namespace: local` -> medium confidence. */
  host?: {
    id: string;
    name?: string;
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

interface EntityFields {
  id?: string;
  name?: string;
  type: string;
  sub_type: string;
  address: string;
}

interface HostFields {
  entity?: EntityFields;
  hostname?: string;
  domain?: string;
  ip?: string[];
  name?: string;
  id?: string;
  type?: string;
  mac?: string[];
  architecture?: string[];
}

interface UserFields {
  entity?: EntityFields;
  full_name?: string[];
  domain?: string;
  roles?: string[];
  name?: string;
  id?: string;
  email?: string[];
  hash?: string[];
}

interface ServiceFields {
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
}

interface EventFields {
  ingested?: string;
  dataset?: string;
  module?: string;
}

interface CloudFields {
  provider?: string;
  region?: string;
  account?: {
    name?: string;
    id?: string;
  };
}

export interface ECSDocument {
  entity?: EntityFields;
  host?: HostFields;
  user?: UserFields;
  service?: ServiceFields;
  event?: EventFields;
  cloud?: CloudFields;
}

export interface HostDocument extends ECSDocument {
  host: HostFields;
}

export interface UserDocument extends ECSDocument {
  user: UserFields;
}

export interface ServiceDocument extends ECSDocument {
  service: ServiceFields;
}

export interface GenericEntityDocument extends ECSDocument {
  entity: EntityFields;
  event: EventFields;
  cloud: CloudFields;
}

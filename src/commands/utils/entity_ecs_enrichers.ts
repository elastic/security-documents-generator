import { HostDocument, UserDocument } from '../ecs_fields';

interface EnrichOptions {
  entityIndex: number;
  valueStartIndex: number;
  fieldLength: number;
  idPrefix: string;
  newEntityIdSchema?: boolean;
}

type IdEnricher<T> = (opts: EnrichOptions, doc: T) => T;

const adaptUserToHost = (user: UserDocument): HostDocument =>
  ({ ...user, host: user.host || {} }) as HostDocument;

export const generateIpAddresses = (startIndex: number, count: number) => {
  const ips = [];
  for (let i = 0; i < count; i++) {
    ips.push(`192.168.1.${startIndex + i}`);
  }
  return ips;
};

export const generateMacAddresses = (startIndex: number, count: number) => {
  const macs = [];
  for (let i = 0; i < count; i++) {
    const macPart = (startIndex + i)
      .toString(16)
      .padStart(12, '0')
      .match(/.{1,2}/g)
      ?.join(':');
    macs.push(macPart ? macPart : '00:00:00:00:00:00');
  }
  return macs;
};

const enrichHostEntityId = (
  { idPrefix, entityIndex }: EnrichOptions,
  doc: HostDocument
): HostDocument => {
  if (!doc.host.entity) {
    return doc;
  }
  doc.host.entity.id = `${idPrefix}-host-hei-${entityIndex}`;
  return doc;
};

const enrichHostId = (
  { idPrefix, entityIndex }: EnrichOptions,
  doc: HostDocument
): HostDocument => {
  doc.host.id = `${idPrefix}-host-hi-${entityIndex}`;
  return doc;
};

const enrichHostName = (
  { idPrefix, entityIndex }: EnrichOptions,
  doc: HostDocument
): HostDocument => {
  doc.host.name = `${idPrefix}-host-n-${entityIndex}`;
  return doc;
};

const enrichHostHostname = (
  { idPrefix, entityIndex }: EnrichOptions,
  doc: HostDocument
): HostDocument => {
  doc.host.hostname = `${idPrefix}-host-hn-${entityIndex}`;
  return doc;
};

const enrichHostDomain = ({ idPrefix }: EnrichOptions, doc: HostDocument): HostDocument => {
  doc.host.domain = `example.${idPrefix}.com`;
  return doc;
};

const enrichHostMac = ({ valueStartIndex }: EnrichOptions, doc: HostDocument): HostDocument => {
  doc.host.mac = generateMacAddresses(valueStartIndex, 1);
  return doc;
};

const enrichHostNameDomain = (opts: EnrichOptions, doc: HostDocument): HostDocument => {
  return enrichHostName(opts, enrichHostDomain(opts, doc));
};

const enrichHostHostnameDomain = (opts: EnrichOptions, doc: HostDocument): HostDocument => {
  return enrichHostHostname(opts, enrichHostDomain(opts, doc));
};

const enrichHostNameMac = (opts: EnrichOptions, doc: HostDocument): HostDocument => {
  return enrichHostName(opts, enrichHostMac(opts, doc));
};

const enrichHostHostnameMac = (opts: EnrichOptions, doc: HostDocument): HostDocument => {
  return enrichHostHostname(opts, enrichHostMac(opts, doc));
};

const enrichUserEntityId = (
  { idPrefix, entityIndex }: EnrichOptions,
  doc: UserDocument
): UserDocument => {
  if (!doc.user.entity) {
    return doc;
  }

  doc.user.entity.id = `${idPrefix}-user-uei-${entityIndex}`;
  return doc;
};

const enrichUserId = (
  { idPrefix, entityIndex }: EnrichOptions,
  doc: UserDocument
): UserDocument => {
  doc.user.id = `${idPrefix}-user-ui-${entityIndex}`;
  return doc;
};

const enrichUserEmail = (
  { idPrefix, entityIndex }: EnrichOptions,
  doc: UserDocument
): UserDocument => {
  doc.user.email = [`${idPrefix}_${entityIndex}@load-elastic.co`];
  return doc;
};

const enrichUserName = (
  { idPrefix, entityIndex }: EnrichOptions,
  doc: UserDocument
): UserDocument => {
  doc.user.name = `${idPrefix}-user-n-${entityIndex}`;
  return doc;
};

const enrichUserDomain = ({ idPrefix }: EnrichOptions, doc: UserDocument): UserDocument => {
  doc.user.domain = `example.${idPrefix}.com`;
  return doc;
};

const enrichUserNameUserDomain = (opts: EnrichOptions, doc: UserDocument): UserDocument => {
  return enrichUserName(opts, enrichUserDomain(opts, doc));
};

const enrichUserNameHostId = (opts: EnrichOptions, doc: UserDocument): UserDocument => {
  return enrichUserName(opts, enrichHostId(opts, adaptUserToHost(doc)) as UserDocument);
};

const enrichUserNameHostDomainHostName = (opts: EnrichOptions, doc: UserDocument): UserDocument => {
  return enrichUserName(
    opts,
    enrichHostName(opts, enrichHostDomain(opts, adaptUserToHost(doc))) as UserDocument
  );
};

const enrichUserNameHostDomainHostHostname = (
  opts: EnrichOptions,
  doc: UserDocument
): UserDocument => {
  return enrichUserName(
    opts,
    enrichHostHostname(opts, enrichHostDomain(opts, adaptUserToHost(doc))) as UserDocument
  );
};

const enrichUserNameHostMacHostName = (opts: EnrichOptions, doc: UserDocument): UserDocument => {
  return enrichUserName(
    opts,
    enrichHostName(opts, enrichHostMac(opts, adaptUserToHost(doc))) as UserDocument
  );
};

const enrichUserNameHostMacHostHostname = (
  opts: EnrichOptions,
  doc: UserDocument
): UserDocument => {
  return enrichUserName(
    opts,
    enrichHostHostname(opts, enrichHostMac(opts, adaptUserToHost(doc))) as UserDocument
  );
};

const enrichUserNameHostName = (opts: EnrichOptions, doc: UserDocument): UserDocument => {
  return enrichUserName(opts, enrichHostName(opts, adaptUserToHost(doc)) as UserDocument);
};

const enrichUserNameHostHostname = (opts: EnrichOptions, doc: UserDocument): UserDocument => {
  return enrichUserName(opts, enrichHostHostname(opts, adaptUserToHost(doc)) as UserDocument);
};

export const hostIdEnrichers: IdEnricher<HostDocument>[] = [
  // host.entity.id
  enrichHostEntityId,
  // host.id
  enrichHostId,
  // host.name + host.domain
  enrichHostNameDomain,
  // host.hostname + host.domain
  enrichHostHostnameDomain,
  // host.name + host.mac
  enrichHostNameMac,
  // host.hostname + host.mac
  enrichHostHostnameMac,
  // host.name
  enrichHostName,
  // host.hostname
  enrichHostHostname,
];

export const userIdEnrichers: IdEnricher<UserDocument>[] = [
  // user.entity.id
  enrichUserEntityId,
  // user.id
  enrichUserId,
  // user.email
  enrichUserEmail,
  // user.name + user.domain
  enrichUserNameUserDomain,
  // user.name + host.id
  enrichUserNameHostId,
  // user.name + host.domain + host.name
  enrichUserNameHostDomainHostName,
  // user.name + host.domain + host.hostname
  enrichUserNameHostDomainHostHostname,
  // user.name + host.mac + host.name
  enrichUserNameHostMacHostName,
  // user.name + host.mac + host.hostname
  enrichUserNameHostMacHostHostname,
  // user.name + host.name
  enrichUserNameHostName,
  // user.name + host.hostname
  enrichUserNameHostHostname,
  // user.name
  enrichUserName,
];

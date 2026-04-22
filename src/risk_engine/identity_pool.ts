export interface EntityIdentity {
  type: 'user' | 'host';
  name: string;
  /** Canonical EUID aligned with entity store / risk scoring (e.g. `host:host-0001`, `user:user-0001@host-0042@local`). */
  entityId: string;
  /** For users: `host.id` used with `user.name` for the local-user EUID branch; matches paired alert host. */
  pairedHostId?: string;
  /** Target entity EUID when this identity is a resolution alias. */
  resolvedTo?: string;
}

export interface IdentityPool {
  users: EntityIdentity[];
  hosts: EntityIdentity[];
  all: EntityIdentity[];
}

export interface IdentityPoolParams {
  userCount: number;
  hostCount: number;
  resolutionPct?: number;
  resolutionGroupSize?: number;
  /**
   * Optional prefix to match `create-perf-data` entity naming convention.
   * When set, entities are named `{prefix}-user-{n}` (1-based, no padding),
   * matching the `{idPrefix}-user-{entityIndex}` pattern in entity_store_perf.ts.
   * When omitted, entities use the standalone `user-{n}` format (zero-padded).
   */
  prefix?: string;
}

const padWidth = (maxIndex: number) => Math.max(4, String(maxIndex).length);

const formatEntityName = (
  kind: 'user' | 'host',
  index: number,
  maxIndex: number,
  prefix?: string,
) => {
  if (prefix) {
    // Match create-perf-data convention: {prefix}-{kind}-{n} (1-based, no padding)
    return `${prefix}-${kind}-${index}`;
  }
  const width = padWidth(maxIndex);
  return `${kind}-${String(index).padStart(width, '0')}`;
};

const applyResolutionGroups = (
  identities: EntityIdentity[],
  resolutionPct: number,
  resolutionGroupSize: number,
) => {
  if (resolutionPct <= 0 || identities.length === 0) {
    return;
  }
  const groupSize = Math.max(2, Math.floor(resolutionGroupSize));
  const participantCount = Math.min(
    identities.length,
    Math.floor((identities.length * resolutionPct) / 100),
  );
  if (participantCount < 2) {
    return;
  }
  const participants = identities.slice(0, participantCount);
  for (let i = 0; i < participants.length; i += groupSize) {
    const group = participants.slice(i, i + groupSize);
    if (group.length < 2) {
      continue;
    }
    const target = group[0];
    if (!target) {
      continue;
    }
    for (let j = 1; j < group.length; j++) {
      const member = group[j];
      if (member) {
        member.resolvedTo = target.entityId;
      }
    }
  }
};

export const generateIdentityPool = (params: IdentityPoolParams): IdentityPool => {
  const { userCount, hostCount, prefix } = params;
  const resolutionPct = params.resolutionPct ?? 0;
  const resolutionGroupSize = params.resolutionGroupSize ?? 3;

  if (userCount < 1 || hostCount < 1) {
    throw new Error('userCount and hostCount must be at least 1 for coordinated scenarios');
  }

  const userPadMax = Math.max(userCount, 1);
  const hostPadMax = Math.max(hostCount, 1);

  const hosts: EntityIdentity[] = [];
  for (let i = 1; i <= hostCount; i++) {
    const name = formatEntityName('host', i, hostPadMax, prefix);
    hosts.push({
      type: 'host',
      name,
      entityId: `host:${name}`,
    });
  }

  const users: EntityIdentity[] = [];
  for (let i = 1; i <= userCount; i++) {
    const name = formatEntityName('user', i, userPadMax, prefix);
    const hostIndex = (i * 7919 + 17) % hostCount;
    const pairedHost = hosts[hostIndex];
    if (!pairedHost) {
      throw new Error('Internal error: empty host pool');
    }
    const pairedHostId = pairedHost.name;
    users.push({
      type: 'user',
      name,
      pairedHostId,
      entityId: `user:${name}@${pairedHostId}@local`,
    });
  }

  applyResolutionGroups(users, resolutionPct, resolutionGroupSize);
  applyResolutionGroups(hosts, resolutionPct, resolutionGroupSize);

  return {
    users,
    hosts,
    all: [...users, ...hosts],
  };
};

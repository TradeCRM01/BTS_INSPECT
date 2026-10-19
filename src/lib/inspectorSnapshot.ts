export type InspectorLive = {
  name?: string | null;
  licence?: string | null;
};

export type InspectorSnapshot = {
  name?: string | null;
  licence?: string | null;
};

export type InspectorIdentity = {
  name: string;
  licence: string | null;
};

export function resolveInspectorIdentity(args: {
  inspectorId?: string | null;
  live?: InspectorLive | null;
  snapshot?: InspectorSnapshot | null;
}): InspectorIdentity {
  if (args.inspectorId) {
    const name = (args.live?.name ?? '').trim();
    return {
      name: name || 'Unknown',
      licence: args.live?.licence?.trim() || null,
    };
  }
  const name = (args.snapshot?.name ?? '').trim();
  return {
    name: name || 'Unknown',
    licence: args.snapshot?.licence?.trim() || null,
  };
}

export function inspectionInspectorLine(identity: InspectorIdentity): string {
  if (identity.licence) return `${identity.name} · ${identity.licence}`;
  return identity.name;
}

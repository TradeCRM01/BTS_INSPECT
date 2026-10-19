export function clientBelongsToPortal(
  client: { company_id?: string | null } | null | undefined,
  portalCompanyId: string,
): boolean {
  return Boolean(client && client.company_id === portalCompanyId);
}

export function inspectorCompanyMatches(
  profile: { company_id?: string | null } | null | undefined,
  tokenCompanyId: string,
): boolean {
  return Boolean(profile && profile.company_id === tokenCompanyId);
}

export function inspectionsForTokenCompany<
  T extends { id?: string; inspector_id?: string | null },
>(
  inspections: T[],
  profiles: Array<{ id: string; company_id?: string | null }>,
  tokenCompanyId: string,
): T[] {
  const companyByInspector = new Map(
    profiles.map((profile) => [profile.id, profile.company_id]),
  );
  return inspections.filter((inspection) => {
    if (!inspection.inspector_id) return true;
    return companyByInspector.get(inspection.inspector_id) === tokenCompanyId;
  });
}

export function inspectorSnapshotFields(row: {
  inspector_id?: string | null;
  inspector_name_snapshot?: string | null;
  inspector_licence_snapshot?: string | null;
}): { inspectorName: string | null; inspectorLicence: string | null } | Record<string, never> {
  if (row.inspector_id) return {};
  return {
    inspectorName: row.inspector_name_snapshot ?? null,
    inspectorLicence: row.inspector_licence_snapshot ?? null,
  };
}

export function printSnapshotFields(row: {
  meta?: Record<string, string> | null;
  client_name_snapshot?: string | null;
  job_title_snapshot?: string | null;
  site_name_snapshot?: string | null;
  site_address_snapshot?: string | null;
}): {
  siteName: string | null;
  siteAddress: string | null;
  clientName: string | null;
  jobNumber: string | null;
} {
  const meta = row.meta ?? {};
  return {
    siteName: meta.siteName || row.site_name_snapshot || null,
    siteAddress: meta.siteAddress || row.site_address_snapshot || null,
    clientName: meta.clientName || row.client_name_snapshot || null,
    jobNumber: meta.jobNumber ?? null,
  };
}

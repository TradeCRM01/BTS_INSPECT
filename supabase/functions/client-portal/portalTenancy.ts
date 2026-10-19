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
  T extends { inspector_id?: string | null },
>(
  inspections: T[],
  profiles: Array<{ id: string; company_id?: string | null }>,
  tokenCompanyId: string,
): T[] {
  const companyByInspector = new Map(
    profiles.map((profile) => [profile.id, profile.company_id]),
  );
  return inspections.filter((inspection) =>
    companyByInspector.get(inspection.inspector_id ?? "") === tokenCompanyId
  );
}

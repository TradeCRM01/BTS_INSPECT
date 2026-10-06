/** Default off when no ai_settings row exists. */
export function aiSettingsAdminToolsEnabled(
  data: { admin_tools_enabled?: boolean | null } | null | undefined,
): boolean {
  return data?.admin_tools_enabled ?? false;
}

export type DashboardQueryResult = {
  data: unknown[] | null;
  count?: number | null;
  error?: { message: string } | null;
};

export type DashboardQuery = {
  select: (columns: string, options?: { count?: "exact"; head?: boolean }) => DashboardQuery;
  eq: (column: string, value: unknown) => DashboardQuery;
  in: (column: string, values: readonly unknown[]) => DashboardQuery;
  gte: (column: string, value: unknown) => DashboardQuery;
  lte: (column: string, value: unknown) => DashboardQuery;
  order: (column: string, options?: { ascending?: boolean }) => DashboardQuery;
  limit: (count: number) => DashboardQuery;
  then: <T>(
    onfulfilled?: (value: DashboardQueryResult) => T | PromiseLike<T>,
  ) => Promise<T>;
};

export type DashboardSummaryClient = {
  from: (table: string) => DashboardQuery;
};

export const DASHBOARD_SUMMARY_TABLES = [
  "jobs",
  "inspections",
  "invoices",
  "compliance_items",
  "stock_items",
  "agent_actions",
] as const;

/** Tables that have company_id. Live inspections do not — they scope via inspector_id. */
export const DASHBOARD_COMPANY_ID_TABLES = [
  "jobs",
  "invoices",
  "compliance_items",
  "stock_items",
  "agent_actions",
] as const;

export const CROSS_COMPANY_CLIENT_ERROR = "Error: that client isn't in your company.";
export const CROSS_COMPANY_JOB_ERROR = "Error: that job isn't in your company.";

export type OwnedRowQuery = {
  select: (columns: string) => OwnedRowQuery;
  eq: (column: string, value: unknown) => OwnedRowQuery;
  maybeSingle: () => Promise<{ data: { id?: string } | null }>;
};

export type CompanyOwnedRowClient = {
  from: (table: string) => OwnedRowQuery;
};

export function companyOwnedIdError(kind: "client" | "job"): string {
  return kind === "job" ? CROSS_COMPANY_JOB_ERROR : CROSS_COMPANY_CLIENT_ERROR;
}

export async function companyOwnsId(
  client: CompanyOwnedRowClient,
  table: "clients" | "jobs",
  id: string,
  companyId: string,
): Promise<boolean> {
  if (!id || !companyId) return false;
  const { data } = await client
    .from(table)
    .select("id")
    .eq("id", id)
    .eq("company_id", companyId)
    .maybeSingle();
  return Boolean(data?.id);
}

/** Reject a model-supplied client/job id that is not in this company. */
export async function rejectIfForeignOwned(
  client: CompanyOwnedRowClient,
  kind: "client" | "job",
  id: string,
  companyId: string,
): Promise<string | null> {
  const table = kind === "job" ? "jobs" : "clients";
  const ok = await companyOwnsId(client, table, id, companyId);
  return ok ? null : companyOwnedIdError(kind);
}

export function inspectorIdsFromProfiles(data: unknown): string[] {
  return ((data ?? []) as Array<{ id?: string }>)
    .map((row) => String(row.id ?? "").trim())
    .filter(Boolean);
}

export async function fetchCompanyInspectorIds(
  client: DashboardSummaryClient,
  companyId: string,
): Promise<string[]> {
  const profiles = await client
    .from("profiles")
    .select("id")
    .eq("company_id", companyId);
  return inspectorIdsFromProfiles(profiles.data);
}

export async function fetchCompanyDashboardSummary(
  client: DashboardSummaryClient,
  companyId: string,
  now: Date = new Date(),
): Promise<{
  active_jobs: number;
  inspections_today: number;
  overdue_invoices: number;
  upcoming_compliance: unknown[];
  low_stock_items: unknown[];
  recent_agent_actions: unknown[];
}> {
  const today = now.toISOString().slice(0, 10);
  const in30 = new Date(now.getTime() + 30 * 86400000).toISOString().slice(0, 10);
  const inspectorIds = await fetchCompanyInspectorIds(client, companyId);
  const inspectionsToday = inspectorIds.length === 0
    ? Promise.resolve({ data: [] as unknown[], count: 0, error: null } satisfies DashboardQueryResult)
    : client
      .from("inspections")
      .select("*", { count: "exact", head: true })
      .in("inspector_id", inspectorIds)
      .gte("started_at", today);
  const [jobs, inspToday, overdueInv, compliance, lowStock, recentActions] = await Promise.all([
    client
      .from("jobs")
      .select("id,title,status,priority,scheduled_date", { count: "exact", head: true })
      .eq("company_id", companyId)
      .in("status", ["scheduled", "in_progress"]),
    inspectionsToday,
    client
      .from("invoices")
      .select("*", { count: "exact", head: true })
      .eq("company_id", companyId)
      .eq("status", "overdue"),
    client
      .from("compliance_items")
      .select("id,title,next_due_date,status")
      .eq("company_id", companyId)
      .gte("next_due_date", today)
      .lte("next_due_date", in30)
      .order("next_due_date", { ascending: true })
      .limit(10),
    client
      .from("stock_items")
      .select("id,name,quantity,reorder_level")
      .eq("company_id", companyId)
      .eq("archived", false)
      .limit(10),
    client
      .from("agent_actions")
      .select("action_type,summary,status,created_at")
      .eq("company_id", companyId)
      .order("created_at", { ascending: false })
      .limit(5),
  ]);
  const overdue = ((lowStock.data ?? []) as Array<Record<string, number>>).filter(
    (r) => Number(r.quantity ?? 0) <= Number(r.reorder_level ?? 0),
  );
  return {
    active_jobs: jobs.count ?? 0,
    inspections_today: inspToday.count ?? 0,
    overdue_invoices: overdueInv.count ?? 0,
    upcoming_compliance: compliance.data ?? [],
    low_stock_items: overdue,
    recent_agent_actions: recentActions.data ?? [],
  };
}

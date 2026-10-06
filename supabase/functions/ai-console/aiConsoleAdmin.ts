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
  const [jobs, inspToday, overdueInv, compliance, lowStock, recentActions] = await Promise.all([
    client
      .from("jobs")
      .select("id,title,status,priority,scheduled_date", { count: "exact", head: true })
      .eq("company_id", companyId)
      .in("status", ["scheduled", "in_progress"]),
    client
      .from("inspections")
      .select("*", { count: "exact", head: true })
      .eq("company_id", companyId)
      .gte("created_at", today),
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

/** View-mode dashboard layout — money tier first, then ops filler. Edit mode keeps pixel canvas. */

export type DashboardWidgetRow = {
  id: string;
  widget_type: string;
};

const MONEY_WIDGET_TYPES = new Set([
  'outstanding_invoices',
  'revenue_overview',
  'cash_flow',
]);

const OPS_WIDGET_TYPES = new Set([
  'upcoming_jobs',
  'compliance_deadlines',
  'kpi_scorecard',
  'team_activity',
  'open_pos',
  'low_stock',
  'recent_inspections',
  'pending_reports',
  'inspection_stats',
]);

export type DashboardWidgetViewTier = 'money' | 'ops' | 'other';

export function dashboardWidgetViewTier(widgetType: string): DashboardWidgetViewTier {
  if (MONEY_WIDGET_TYPES.has(widgetType)) return 'money';
  if (OPS_WIDGET_TYPES.has(widgetType)) return 'ops';
  return 'other';
}

const TIER_RANK: Record<DashboardWidgetViewTier, number> = {
  money: 0,
  ops: 1,
  other: 2,
};

/** Stable sort: money → ops → other; preserve relative order within a tier. */
export function sortDashboardWidgetsForView<T extends DashboardWidgetRow>(widgets: T[]): T[] {
  return widgets
    .map((w, index) => ({ w, index, tier: dashboardWidgetViewTier(w.widget_type) }))
    .sort((a, b) => {
      const dr = TIER_RANK[a.tier] - TIER_RANK[b.tier];
      if (dr !== 0) return dr;
      return a.index - b.index;
    })
    .map(({ w }) => w);
}

/** View-mode dashboard layout — money tier first, then ops filler. Edit mode keeps pixel canvas. */

export type DashboardWidgetRow = {
  id?: string;
  widget_type: string;
  config?: unknown;
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

/** Spread so an adjacent swap of implicit ranks writes two rows, not the whole stack. */
export const DASHBOARD_PHONE_ORDER_TIER = 1_000_000;

export function readDashboardWidgetPhoneOrder(config: unknown): number | undefined {
  if (!config || typeof config !== 'object' || Array.isArray(config)) return undefined;
  const n = (config as { phone_order?: unknown }).phone_order;
  return typeof n === 'number' && Number.isFinite(n) ? n : undefined;
}

export function dashboardWidgetPhoneOrder<T extends DashboardWidgetRow>(widget: T, index: number): number {
  const explicit = readDashboardWidgetPhoneOrder(widget.config);
  if (explicit !== undefined) return explicit;
  return TIER_RANK[dashboardWidgetViewTier(widget.widget_type)] * DASHBOARD_PHONE_ORDER_TIER + index;
}

export function withDashboardWidgetPhoneOrder<T extends DashboardWidgetRow>(widget: T, phone_order: number): T {
  const base = widget.config && typeof widget.config === 'object' && !Array.isArray(widget.config)
    ? { ...(widget.config as Record<string, unknown>) }
    : {};
  return { ...widget, config: { ...base, phone_order } as T['config'] };
}

/**
 * One order for the phone view grid and phone Customize stack.
 * Explicit `config.phone_order` wins; otherwise money → ops → other, then load index.
 */
export function sortDashboardWidgetsForView<T extends DashboardWidgetRow>(widgets: readonly T[]): T[] {
  return widgets
    .map((w, index) => ({ w, index, order: dashboardWidgetPhoneOrder(w, index) }))
    .sort((a, b) => {
      const dr = a.order - b.order;
      if (dr !== 0) return dr;
      return a.index - b.index;
    })
    .map(({ w }) => w);
}

/**
 * Phone reorder only. Never copies grid_x / grid_y / grid_w / grid_h.
 * Renumbers every card 0..n-1 so an explicit order cannot tie an implicit one.
 */
export function swapAdjacentDashboardWidgetPhoneOrder<T extends DashboardWidgetRow>(
  widgets: readonly T[],
  id: string,
  direction: -1 | 1,
): T[] {
  const ordered = sortDashboardWidgetsForView(widgets);
  const i = ordered.findIndex(row => row.id === id);
  const j = i + direction;
  if (i < 0 || j < 0 || j >= ordered.length) return [...widgets];
  const next = [...ordered];
  const swapped = next[i];
  next[i] = next[j];
  next[j] = swapped;
  const rank = new Map(next.map((row, index) => [row.id, index]));
  return widgets.map(row => {
    const order = rank.get(row.id);
    if (order === undefined) return row;
    return withDashboardWidgetPhoneOrder(row, order);
  });
}

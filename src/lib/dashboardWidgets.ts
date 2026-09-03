import { getWidgetDef } from '../widgets/registry';

/** Pixel size used when placing a registry widget on the dashboard canvas. */
export const DASHBOARD_WIDGET_CELL_W = 130;
export const DASHBOARD_WIDGET_CELL_H = 90;

/**
 * Trade-useful first dashboard — jobs, invoices, compliance.
 * Not bitcoin / market toys. All trades, not a single licence.
 */
export const DEFAULT_DASHBOARD_WIDGET_TYPES = [
  'upcoming_jobs',
  'outstanding_invoices',
  'compliance_deadlines',
] as const;

export type DefaultDashboardWidgetType = (typeof DEFAULT_DASHBOARD_WIDGET_TYPES)[number];

export type DashboardWidgetInsert = {
  widget_type: string;
  grid_x: number;
  grid_y: number;
  grid_w: number;
  grid_h: number;
  config: Record<string, never>;
};

const DEFAULT_LAYOUT: Array<{ grid_x: number; grid_y: number }> = [
  { grid_x: 20, grid_y: 20 },
  { grid_x: 430, grid_y: 20 },
  { grid_x: 20, grid_y: 310 },
];

export function dashboardWidgetPixelSize(type: string): { grid_w: number; grid_h: number } {
  const def = getWidgetDef(type);
  return {
    grid_w: (def?.defaultSize.w ?? 2) * DASHBOARD_WIDGET_CELL_W,
    grid_h: (def?.defaultSize.h ?? 2) * DASHBOARD_WIDGET_CELL_H,
  };
}

/** Seed only when the user has no rows. Existing layouts are left alone. */
export function shouldSeedDefaultDashboardWidgets(
  rows: ReadonlyArray<unknown> | null | undefined,
): boolean {
  return (rows?.length ?? 0) === 0;
}

export function defaultDashboardWidgetInserts(): DashboardWidgetInsert[] {
  return DEFAULT_DASHBOARD_WIDGET_TYPES.map((widget_type, i) => {
    const place = DEFAULT_LAYOUT[i] ?? { grid_x: 20, grid_y: 20 + i * 30 };
    return {
      widget_type,
      ...place,
      ...dashboardWidgetPixelSize(widget_type),
      config: {},
    };
  });
}

import { getWidgetDef } from '../widgets/registry';

/** Pixel size used when placing a registry widget on the dashboard canvas. */
export const DASHBOARD_WIDGET_CELL_W = 130;
export const DASHBOARD_WIDGET_CELL_H = 90;

/**
 * Trade-useful first dashboard — jobs, invoices, compliance.
 * Not a market ticker. All trades, not a single licence.
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

export type DashboardWidgetSeedDecision = 'keep' | 'seed' | 'empty';

/** IO used so first-visit / delete-all / CAS can be tested without a live table. */
export type DashboardWidgetSeedIo<T> = {
  loadRows: () => Promise<T[]>;
  loadSeeded: () => Promise<boolean>;
  /** Compare-and-set false → true. True only for the one writer. */
  claimSeed: () => Promise<boolean>;
  insertDefaults: () => Promise<T[]>;
  /** Existing layouts: mark seeded so a later delete-all remount stays empty. */
  markSeeded?: () => Promise<void>;
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

/**
 * Seed once. Empty + never seeded → write defaults.
 * Existing rows stay. Seeded + empty (delete-all remount) stays empty.
 */
export function decideDashboardWidgetSeed(args: {
  rows: ReadonlyArray<unknown> | null | undefined;
  seeded: boolean | null | undefined;
}): DashboardWidgetSeedDecision {
  if ((args.rows?.length ?? 0) > 0) return 'keep';
  if (args.seeded) return 'empty';
  return 'seed';
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

export async function resolveDashboardWidgets<T>(io: DashboardWidgetSeedIo<T>): Promise<T[]> {
  const rows = await io.loadRows();
  const seeded = await io.loadSeeded();
  const decision = decideDashboardWidgetSeed({ rows, seeded });
  if (decision === 'keep') {
    if (!seeded) await io.markSeeded?.();
    return rows;
  }
  if (decision === 'empty') return rows;

  const won = await io.claimSeed();
  if (!won) return io.loadRows();
  return io.insertDefaults();
}

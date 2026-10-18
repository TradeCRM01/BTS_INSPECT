import { getWidgetDef, WIDGET_REGISTRY } from '../widgets/registry';

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

export const RETIRED_DASHBOARD_WIDGET_TYPES = ['bitcoin', 'crypto', 'stock_market'] as const;

export const DASHBOARD_WIDGET_ORIGIN = 20;
export const DASHBOARD_WIDGET_CANVAS_W = 1100;

export type DashboardWidgetInsert = {
  widget_type: string;
  grid_x: number;
  grid_y: number;
  grid_w: number;
  grid_h: number;
  config: Record<string, never>;
};

export type DashboardWidgetRect = {
  id?: string;
  widget_type: string;
  grid_x: number;
  grid_y: number;
  grid_w: number;
  grid_h: number;
};

export type DashboardWidgetSeedDecision = 'keep' | 'seed' | 'empty';

/** IO used so first-visit / delete-all / CAS can be tested without a live table. */
export type DashboardWidgetSeedIo<T> = {
  loadRows: () => Promise<T[]>;
  loadSeeded: () => Promise<boolean>;
  /** Compare-and-set false → true. True only for the one writer. */
  claimSeed: () => Promise<boolean>;
  insertDefaults: () => Promise<T[]>;
  /** Same CAS owner: true → false so a failed insert does not eat first visit. */
  releaseSeed: () => Promise<void>;
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

export function isRetiredDashboardWidgetType(type: string): boolean {
  return (RETIRED_DASHBOARD_WIDGET_TYPES as readonly string[]).includes(type);
}

export function dashboardWidgetRectsOverlap(a: DashboardWidgetRect, b: DashboardWidgetRect): boolean {
  return a.grid_x < b.grid_x + b.grid_w
    && b.grid_x < a.grid_x + a.grid_w
    && a.grid_y < b.grid_y + b.grid_h
    && b.grid_y < a.grid_y + a.grid_h;
}

export function dashboardWidgetLayoutOverlaps(widgets: readonly DashboardWidgetRect[]): boolean {
  for (let i = 0; i < widgets.length; i += 1) {
    for (let j = i + 1; j < widgets.length; j += 1) {
      if (dashboardWidgetRectsOverlap(widgets[i], widgets[j])) return true;
    }
  }
  return false;
}

export function firstFreeDashboardWidgetSlot(
  existing: readonly DashboardWidgetRect[],
  size: Pick<DashboardWidgetRect, 'grid_w' | 'grid_h'>,
  canvasW = DASHBOARD_WIDGET_CANVAS_W,
): { grid_x: number; grid_y: number } {
  const w = Math.max(1, size.grid_w);
  const h = Math.max(1, size.grid_h);
  const floor = existing.reduce(
    (max, row) => Math.max(max, row.grid_y + row.grid_h),
    DASHBOARD_WIDGET_ORIGIN,
  );
  const lastY = floor + DASHBOARD_WIDGET_CELL_H * 12;
  const maxX = Math.max(DASHBOARD_WIDGET_ORIGIN, canvasW - w);

  for (let y = DASHBOARD_WIDGET_ORIGIN; y <= lastY; y += DASHBOARD_WIDGET_CELL_H) {
    for (let x = DASHBOARD_WIDGET_ORIGIN; x <= maxX; x += DASHBOARD_WIDGET_CELL_W) {
      const candidate: DashboardWidgetRect = {
        widget_type: '',
        grid_x: x,
        grid_y: y,
        grid_w: w,
        grid_h: h,
      };
      if (!existing.some(row => dashboardWidgetRectsOverlap(candidate, row))) {
        return { grid_x: x, grid_y: y };
      }
    }
  }

  return { grid_x: DASHBOARD_WIDGET_ORIGIN, grid_y: floor + DASHBOARD_WIDGET_ORIGIN };
}

export function placeAddedDashboardWidget(
  existing: readonly DashboardWidgetRect[],
  widgetType: string,
  canvasW = DASHBOARD_WIDGET_CANVAS_W,
): { grid_x: number; grid_y: number; grid_w: number; grid_h: number } | null {
  if (isRetiredDashboardWidgetType(widgetType)) return null;
  const size = dashboardWidgetPixelSize(widgetType);
  return { ...size, ...firstFreeDashboardWidgetSlot(existing, size, canvasW) };
}

export function repairDashboardWidgetLayout<T extends DashboardWidgetRect>(
  widgets: readonly T[],
  canvasW = DASHBOARD_WIDGET_CANVAS_W,
): { widgets: T[]; changed: boolean; droppedIds: string[] } {
  const droppedIds = widgets
    .filter(row => isRetiredDashboardWidgetType(row.widget_type) && row.id)
    .map(row => row.id as string);
  const kept = widgets.filter(row => !isRetiredDashboardWidgetType(row.widget_type));
  const ordered = [...kept].sort((a, b) => {
    if (a.grid_y !== b.grid_y) return a.grid_y - b.grid_y;
    if (a.grid_x !== b.grid_x) return a.grid_x - b.grid_x;
    return (a.id ?? a.widget_type).localeCompare(b.id ?? b.widget_type);
  });

  const placed: T[] = [];
  let moved = false;
  for (const widget of ordered) {
    if (!placed.some(row => dashboardWidgetRectsOverlap(widget, row))) {
      placed.push(widget);
      continue;
    }
    moved = true;
    placed.push({ ...widget, ...firstFreeDashboardWidgetSlot(placed, widget, canvasW) });
  }

  const byId = new Map(placed.map((row, i) => [row.id ?? `idx-${i}`, row]));
  return {
    widgets: kept.map((row, i) => byId.get(row.id ?? `idx-${i}`) ?? row),
    changed: droppedIds.length > 0 || moved,
    droppedIds,
  };
}

export function dashboardWidgetPickerTypes(): string[] {
  return WIDGET_REGISTRY
    .filter(def => !isRetiredDashboardWidgetType(def.type))
    .map(def => def.type);
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
  try {
    return await io.insertDefaults();
  } catch (err) {
    try {
      await io.releaseSeed();
    } catch {
      // Keep the insert error — first visit is retried only if the flag reverted.
    }
    throw err;
  }
}

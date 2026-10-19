import { getWidgetDef, WIDGET_REGISTRY, isRetiredWidgetType, RETIRED_WIDGET_TYPES } from '../widgets/registry';

export const RETIRED_DASHBOARD_WIDGET_TYPES = RETIRED_WIDGET_TYPES;

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

export const DASHBOARD_WIDGET_ORIGIN = 20;
export const DASHBOARD_WIDGET_CANVAS_W = 1100;
export const DASHBOARD_WIDGET_GAP = 20;

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
  return isRetiredWidgetType(type);
}

export function dashboardWidgetRectsOverlap(a: DashboardWidgetRect, b: DashboardWidgetRect): boolean {
  return a.grid_x < b.grid_x + b.grid_w
    && b.grid_x < a.grid_x + a.grid_w
    && a.grid_y < b.grid_y + b.grid_h
    && b.grid_y < a.grid_y + a.grid_h;
}

export function dashboardWidgetRectsConflict(
  a: DashboardWidgetRect,
  b: DashboardWidgetRect,
  gap = DASHBOARD_WIDGET_GAP,
): boolean {
  return a.grid_x < b.grid_x + b.grid_w + gap
    && b.grid_x < a.grid_x + a.grid_w + gap
    && a.grid_y < b.grid_y + b.grid_h + gap
    && b.grid_y < a.grid_y + a.grid_h + gap;
}

export function dashboardWidgetLayoutOverlaps(widgets: readonly DashboardWidgetRect[]): boolean {
  for (let i = 0; i < widgets.length; i += 1) {
    for (let j = i + 1; j < widgets.length; j += 1) {
      if (dashboardWidgetRectsOverlap(widgets[i], widgets[j])) return true;
    }
  }
  return false;
}

export function dashboardWidgetFitsCanvas(
  row: Pick<DashboardWidgetRect, 'grid_x' | 'grid_w'>,
  canvasW: number,
): boolean {
  if (row.grid_w > canvasW) return row.grid_x === DASHBOARD_WIDGET_ORIGIN;
  return row.grid_x + row.grid_w <= canvasW;
}

/**
 * Render-time fit. Does not rewrite stored rows.
 * Shrink in place when the leftover strip is at least one cell; otherwise
 * keep the widget's width and slide it so x+w fits. Callers repair overlap.
 */
export function clampDashboardWidgetToCanvas<T extends DashboardWidgetRect>(row: T, canvasW: number): T {
  const origin = DASHBOARD_WIDGET_ORIGIN;
  let w = Math.max(1, row.grid_w);
  let x = row.grid_x;
  if (w > canvasW) return { ...row, grid_x: origin, grid_w: canvasW };
  if (x + w <= canvasW) return row;
  const remaining = canvasW - x;
  if (x < canvasW && remaining >= DASHBOARD_WIDGET_CELL_W) {
    w = remaining;
  } else {
    x = Math.max(origin, canvasW - w);
    if (x + w > canvasW) w = Math.max(1, canvasW - x);
  }
  if (x === row.grid_x && w === row.grid_w) return row;
  return { ...row, grid_x: x, grid_w: w };
}

/**
 * Clamp each widget so x+w fits the current canvas. Repair overlaps without
 * shrinking widgets that already fit. Callers must not persist the result
 * unless the user saves.
 */
export function clampDashboardWidgetsToCanvas<T extends DashboardWidgetRect>(
  widgets: readonly T[],
  canvasW: number,
): T[] {
  const width = Math.max(1, Math.floor(canvasW));
  const fitted = widgets.map(row => clampDashboardWidgetToCanvas(row, width));
  const overflow = fitted.some(row => !dashboardWidgetFitsCanvas(row, width));
  if (!overflow && !dashboardWidgetLayoutOverlaps(fitted)) return fitted;
  return repairDashboardWidgetLayout(fitted, width).widgets;
}

export function measureDashboardCanvasWidth(
  ...els: Array<{ clientWidth: number } | null | undefined>
): number {
  for (const el of els) {
    const width = el?.clientWidth ?? 0;
    if (width > 0) return width;
  }
  return DASHBOARD_WIDGET_CANVAS_W;
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
  const lastY = floor + DASHBOARD_WIDGET_CELL_H * 16;
  const maxX = Math.max(DASHBOARD_WIDGET_ORIGIN, canvasW - w);

  for (let y = DASHBOARD_WIDGET_ORIGIN; y <= lastY; y += DASHBOARD_WIDGET_CELL_H) {
    for (let x = DASHBOARD_WIDGET_ORIGIN; x <= maxX; x += DASHBOARD_WIDGET_CELL_W) {
      if (w <= canvasW && x + w > canvasW) continue;
      const candidate: DashboardWidgetRect = {
        widget_type: '',
        grid_x: x,
        grid_y: y,
        grid_w: w,
        grid_h: h,
      };
      if (!existing.some(row => dashboardWidgetRectsConflict(candidate, row))) {
        return { grid_x: x, grid_y: y };
      }
    }
  }

  return { grid_x: DASHBOARD_WIDGET_ORIGIN, grid_y: floor + DASHBOARD_WIDGET_GAP };
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

function widgetOriginallyCollides<T extends DashboardWidgetRect>(widget: T, others: readonly T[]): boolean {
  return others.some(row => row !== widget && dashboardWidgetRectsOverlap(widget, row));
}

export function repairDashboardWidgetLayout<T extends DashboardWidgetRect>(
  widgets: readonly T[],
  canvasW = DASHBOARD_WIDGET_CANVAS_W,
): { widgets: T[]; changed: boolean; droppedIds: string[] } {
  const droppedIds = widgets
    .filter(row => isRetiredDashboardWidgetType(row.widget_type) && row.id)
    .map(row => row.id as string);
  const kept = widgets.filter(row => !isRetiredDashboardWidgetType(row.widget_type));
  const anchors = kept.filter(row => !widgetOriginallyCollides(row, kept));
  const colliders = kept
    .filter(row => widgetOriginallyCollides(row, kept))
    .sort((a, b) => {
      if (a.grid_y !== b.grid_y) return a.grid_y - b.grid_y;
      if (a.grid_x !== b.grid_x) return a.grid_x - b.grid_x;
      return (a.id ?? a.widget_type).localeCompare(b.id ?? b.widget_type);
    });

  const nextByWidget = new Map<T, T>();
  for (const row of anchors) nextByWidget.set(row, row);

  const placed: T[] = [...anchors];
  let moved = false;
  for (const widget of colliders) {
    const obstacles = placed;
    if (!obstacles.some(row => dashboardWidgetRectsOverlap(widget, row))) {
      placed.push(widget);
      nextByWidget.set(widget, widget);
      continue;
    }
    moved = true;
    const next = { ...widget, ...firstFreeDashboardWidgetSlot(obstacles, widget, canvasW) };
    placed.push(next);
    nextByWidget.set(widget, next);
  }

  return {
    widgets: kept.map(row => nextByWidget.get(row) ?? row),
    changed: droppedIds.length > 0 || moved,
    droppedIds,
  };
}

export function pickerDashboardWidgets(category: string) {
  return WIDGET_REGISTRY.filter(
    def => def.category === category && !isRetiredDashboardWidgetType(def.type),
  );
}

export function dashboardWidgetPickerTypes(): string[] {
  return pickerDashboardWidgets('data')
    .concat(pickerDashboardWidgets('system'))
    .concat(pickerDashboardWidgets('tools'))
    .concat(pickerDashboardWidgets('fun'))
    .concat(pickerDashboardWidgets('intelligence'))
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

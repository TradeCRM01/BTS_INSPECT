import { describe, expect, it } from 'vitest';
import { getWidgetDef } from '../widgets/registry';
import {
  DASHBOARD_WIDGET_CELL_H,
  DASHBOARD_WIDGET_CELL_W,
  DEFAULT_DASHBOARD_WIDGET_TYPES,
  DASHBOARD_WIDGET_MIN_W,
  applyDashboardWidgetDrag,
  applyDashboardWidgetResize,
  clampDashboardWidgetToCanvas,
  clampDashboardWidgetsToCanvas,
  dashboardWidgetFitsCanvas,
  dashboardWidgetLayoutOverlaps,
  dashboardWidgetPixelSize,
  dashboardWidgetRectsOverlap,
  decideDashboardWidgetSeed,
  defaultDashboardWidgetInserts,
  pickerDashboardWidgets,
  placeAddedDashboardWidget,
  repairDashboardWidgetLayout,
  resolveDashboardWidgets,
  type DashboardWidgetInsert,
  type DashboardWidgetRect,
  type DashboardWidgetSeedIo,
} from './dashboardWidgets';
import { sortDashboardWidgetsForView, swapAdjacentDashboardWidgetPhoneOrder } from './dashboardWidgetView';

type Row = DashboardWidgetInsert & { id?: string };

function seedStore(init: { rows: Row[]; seeded: boolean }) {
  const store = {
    rows: [...init.rows],
    seeded: init.seeded,
    inserts: 0,
    marks: 0,
    releases: 0,
  };

  const writeDefaults = () => {
    store.inserts += 1;
    store.rows = defaultDashboardWidgetInserts().map((row, i) => ({
      ...row,
      id: `seed-${i}`,
    }));
    return [...store.rows];
  };

  const io: DashboardWidgetSeedIo<Row> = {
    loadRows: async () => [...store.rows],
    loadSeeded: async () => store.seeded,
    claimSeed: async () => {
      if (store.seeded) return false;
      store.seeded = true;
      return true;
    },
    insertDefaults: async () => writeDefaults(),
    releaseSeed: async () => {
      store.releases += 1;
      store.seeded = false;
    },
    markSeeded: async () => {
      store.marks += 1;
      store.seeded = true;
    },
  };

  return { store, io };
}

describe('default dashboard widget seed', () => {
  it('seeds upcoming jobs, invoices, and compliance — not bitcoin', () => {
    expect(DEFAULT_DASHBOARD_WIDGET_TYPES).toEqual([
      'upcoming_jobs',
      'outstanding_invoices',
      'compliance_deadlines',
    ]);
    const seed = defaultDashboardWidgetInserts();
    expect(seed.map(row => row.widget_type)).toEqual([...DEFAULT_DASHBOARD_WIDGET_TYPES]);
    expect(seed.some(row => row.widget_type === 'bitcoin')).toBe(false);
    expect(seed.some(row => row.widget_type === 'crypto')).toBe(false);
    expect(DEFAULT_DASHBOARD_WIDGET_TYPES).not.toContain('bitcoin');
    expect(DEFAULT_DASHBOARD_WIDGET_TYPES).not.toContain('crypto');
    expect(DEFAULT_DASHBOARD_WIDGET_TYPES).not.toContain('stock_market');
    expect(seed.some(row => /electric|electrical|spark/i.test(row.widget_type))).toBe(false);
    expect(new Set(seed.map(row => row.widget_type)).size).toBe(seed.length);
    for (const type of DEFAULT_DASHBOARD_WIDGET_TYPES) {
      expect(getWidgetDef(type)).toBeTruthy();
    }
  });

  it('first visit with zero rows seeds; existing rows are skipped', () => {
    expect(decideDashboardWidgetSeed({ rows: [], seeded: false })).toBe('seed');
    expect(decideDashboardWidgetSeed({ rows: null, seeded: false })).toBe('seed');
    expect(decideDashboardWidgetSeed({ rows: undefined, seeded: false })).toBe('seed');
    expect(decideDashboardWidgetSeed({ rows: [{ id: 'kept' }], seeded: false })).toBe('keep');
    expect(decideDashboardWidgetSeed({
      rows: defaultDashboardWidgetInserts(),
      seeded: true,
    })).toBe('keep');
  });

  it('delete-all remount stays empty once the seed flag is set', () => {
    expect(decideDashboardWidgetSeed({ rows: [], seeded: true })).toBe('empty');
    expect(decideDashboardWidgetSeed({ rows: null, seeded: true })).toBe('empty');
  });

  it('places each default widget once, using registry pixel sizes', () => {
    const seed = defaultDashboardWidgetInserts();
    const keys = seed.map(row => `${row.widget_type}:${row.grid_x},${row.grid_y}`);
    expect(new Set(keys).size).toBe(seed.length);
    for (const row of seed) {
      const size = dashboardWidgetPixelSize(row.widget_type);
      expect(row.grid_w).toBe(size.grid_w);
      expect(row.grid_h).toBe(size.grid_h);
      expect(row.config).toEqual({});
    }
    const jobs = getWidgetDef('upcoming_jobs');
    expect(dashboardWidgetPixelSize('upcoming_jobs')).toEqual({
      grid_w: (jobs?.defaultSize.w ?? 0) * DASHBOARD_WIDGET_CELL_W,
      grid_h: (jobs?.defaultSize.h ?? 0) * DASHBOARD_WIDGET_CELL_H,
    });
  });
});

describe('dashboard widget seed once', () => {
  it('first visit writes the three and marks seeded', async () => {
    const { store, io } = seedStore({ rows: [], seeded: false });
    const rows = await resolveDashboardWidgets(io);
    expect(rows.map(row => row.widget_type)).toEqual([...DEFAULT_DASHBOARD_WIDGET_TYPES]);
    expect(store.seeded).toBe(true);
    expect(store.inserts).toBe(1);
    expect(store.rows).toHaveLength(3);
  });

  it('existing rows stay untouched and get the seeded flag', async () => {
    const existing: Row = {
      id: 'kept',
      widget_type: 'clock',
      grid_x: 8,
      grid_y: 8,
      grid_w: 260,
      grid_h: 180,
      config: {},
    };
    const { store, io } = seedStore({ rows: [existing], seeded: false });
    const rows = await resolveDashboardWidgets(io);
    expect(rows).toEqual([existing]);
    expect(store.rows).toEqual([existing]);
    expect(store.inserts).toBe(0);
    expect(store.seeded).toBe(true);
    expect(store.marks).toBe(1);
  });

  it('delete-all remount does not seed', async () => {
    const { store, io } = seedStore({ rows: [], seeded: true });
    const rows = await resolveDashboardWidgets(io);
    expect(rows).toEqual([]);
    expect(store.rows).toEqual([]);
    expect(store.inserts).toBe(0);
    expect(store.seeded).toBe(true);
  });

  it('two empty loads do not double-write', async () => {
    const { store, io } = seedStore({ rows: [], seeded: false });
    const [a, b] = await Promise.all([
      resolveDashboardWidgets(io),
      resolveDashboardWidgets(io),
    ]);
    expect(store.inserts).toBe(1);
    expect(store.rows).toHaveLength(3);
    expect(store.seeded).toBe(true);
    expect(Math.max(a.length, b.length)).toBe(3);
    expect(store.rows.filter(row => row.widget_type === 'upcoming_jobs')).toHaveLength(1);
    expect(new Set(store.rows.map(row => row.widget_type)).size).toBe(3);
  });

  it('failed insert does not eat the first visit', async () => {
    const { store, io } = seedStore({ rows: [], seeded: false });
    let blow = true;
    io.insertDefaults = async () => {
      store.inserts += 1;
      if (blow) throw new Error('insert failed');
      store.rows = defaultDashboardWidgetInserts().map((row, i) => ({
        ...row,
        id: `seed-${i}`,
      }));
      return [...store.rows];
    };

    await expect(resolveDashboardWidgets(io)).rejects.toThrow('insert failed');
    expect(store.seeded).toBe(false);
    expect(store.rows).toEqual([]);
    expect(store.releases).toBe(1);

    blow = false;
    const rows = await resolveDashboardWidgets(io);
    expect(rows.map(row => row.widget_type)).toEqual([...DEFAULT_DASHBOARD_WIDGET_TYPES]);
    expect(store.seeded).toBe(true);
    expect(store.inserts).toBe(2);
    expect(store.rows).toHaveLength(3);
  });
});

function withIds(rows: DashboardWidgetInsert[]): DashboardWidgetRect[] {
  return rows.map((row, i) => ({ ...row, id: `seed-${row.widget_type}-${i}` }));
}

/** Independent AABB — do not call the module overlap helper here. */
function rawOverlap(
  a: Pick<DashboardWidgetRect, 'grid_x' | 'grid_y' | 'grid_w' | 'grid_h'>,
  b: Pick<DashboardWidgetRect, 'grid_x' | 'grid_y' | 'grid_w' | 'grid_h'>,
): boolean {
  return a.grid_x < b.grid_x + b.grid_w
    && b.grid_x < a.grid_x + a.grid_w
    && a.grid_y < b.grid_y + b.grid_h
    && b.grid_y < a.grid_y + a.grid_h;
}

function rawLayoutOverlaps(widgets: readonly DashboardWidgetRect[]): boolean {
  for (let i = 0; i < widgets.length; i += 1) {
    for (let j = i + 1; j < widgets.length; j += 1) {
      if (rawOverlap(widgets[i], widgets[j])) return true;
    }
  }
  return false;
}

function addTypes(
  start: DashboardWidgetRect[],
  types: string[],
  canvasW?: number,
): DashboardWidgetRect[] {
  let rows = [...start];
  for (const type of types) {
    const place = placeAddedDashboardWidget(rows, type, canvasW);
    expect(place).not.toBeNull();
    expect(place!.grid_x + place!.grid_w).toBeLessThanOrEqual(Math.max(canvasW ?? 1100, place!.grid_w + 20));
    rows = [...rows, { id: `add-${type}`, widget_type: type, ...place! }];
  }
  return rows;
}

describe('dashboard widget grid placement', () => {
  const jobs: DashboardWidgetRect = {
    id: 'jobs', widget_type: 'upcoming_jobs', grid_x: 20, grid_y: 20, grid_w: 390, grid_h: 270,
  };
  const weatherOnJobs: DashboardWidgetRect = {
    id: 'weather', widget_type: 'weather', grid_x: 20, grid_y: 20, grid_w: 260, grid_h: 270,
  };
  const complianceClear: DashboardWidgetRect = {
    id: 'compliance', widget_type: 'compliance_deadlines', grid_x: 430, grid_y: 20, grid_w: 390, grid_h: 270,
  };

  it('detects real overlap and clearance without using the layout helper', () => {
    expect(rawOverlap(jobs, weatherOnJobs)).toBe(true);
    expect(dashboardWidgetRectsOverlap(jobs, weatherOnJobs)).toBe(true);
    expect(rawOverlap(jobs, complianceClear)).toBe(false);
    expect(dashboardWidgetRectsOverlap(jobs, complianceClear)).toBe(false);
    expect(rawOverlap(weatherOnJobs, complianceClear)).toBe(false);
    expect(dashboardWidgetRectsOverlap(weatherOnJobs, complianceClear)).toBe(false);
  });

  it('does not overlap after adding several widgets onto the seed layout', () => {
    const rows = addTypes(withIds(defaultDashboardWidgetInserts()), [
      'weather', 'client_stats', 'clock', 'low_stock',
    ]);
    expect(rows).toHaveLength(7);
    expect(rawLayoutOverlaps(rows)).toBe(false);
    expect(dashboardWidgetLayoutOverlaps(rows)).toBe(false);
  });

  it('keeps new widgets inside a 910 px canvas', () => {
    const rows = addTypes(withIds(defaultDashboardWidgetInserts()), [
      'weather', 'clock', 'calendar',
    ], 910);
    for (const row of rows.filter(w => w.id?.startsWith('add-'))) {
      expect(row.grid_x).toBeGreaterThanOrEqual(20);
      expect(row.grid_x + row.grid_w).toBeLessThanOrEqual(910);
    }
    expect(rawLayoutOverlaps(rows)).toBe(false);
  });

  it('keeps new widgets inside a 686 px canvas', () => {
    const rows = addTypes(withIds(defaultDashboardWidgetInserts()), [
      'weather', 'clock', 'calendar',
    ], 686);
    for (const row of rows.filter(w => w.id?.startsWith('add-'))) {
      expect(row.grid_x).toBeGreaterThanOrEqual(20);
      expect(row.grid_x + row.grid_w).toBeLessThanOrEqual(686);
    }
    expect(rawLayoutOverlaps(rows)).toBe(false);
  });

  it('repairs an overlapping saved layout on load without dropping valid widgets', () => {
    const overlapping: DashboardWidgetRect[] = [
      jobs,
      weatherOnJobs,
      { id: 'stacked', widget_type: 'compliance_deadlines', grid_x: 90, grid_y: 20, grid_w: 390, grid_h: 270 },
    ];
    const { widgets, changed, droppedIds } = repairDashboardWidgetLayout(overlapping);
    expect(changed).toBe(true);
    expect(droppedIds).toEqual([]);
    expect(widgets.map(w => w.id).sort()).toEqual(['jobs', 'stacked', 'weather']);
    expect(widgets.find(w => w.id === 'jobs')).toMatchObject({ grid_x: 20, grid_y: 20, grid_w: 390, grid_h: 270 });
    expect(rawLayoutOverlaps(widgets)).toBe(false);
    expect(dashboardWidgetLayoutOverlaps(widgets)).toBe(false);
  });

  it('does not move a saved layout that already has no overlaps', () => {
    const seed = withIds(defaultDashboardWidgetInserts());
    const { widgets, changed, droppedIds } = repairDashboardWidgetLayout(seed);
    expect(changed).toBe(false);
    expect(droppedIds).toEqual([]);
    expect(widgets).toEqual(seed);
    expect(rawLayoutOverlaps(widgets)).toBe(false);
  });

  it('leaves a non-colliding widget at its saved coordinates', () => {
    const saved: DashboardWidgetRect[] = [jobs, weatherOnJobs, complianceClear];
    const { widgets, changed, droppedIds } = repairDashboardWidgetLayout(saved);
    expect(changed).toBe(true);
    expect(droppedIds).toEqual([]);
    const compliance = widgets.find(w => w.id === 'compliance');
    expect(compliance).toMatchObject({
      id: 'compliance',
      grid_x: 430,
      grid_y: 20,
      grid_w: 390,
      grid_h: 270,
    });
    const keptJobs = widgets.find(w => w.id === 'jobs');
    expect(keptJobs).toMatchObject({ grid_x: 20, grid_y: 20, grid_w: 390, grid_h: 270 });
    const movedWeather = widgets.find(w => w.id === 'weather');
    expect(movedWeather).toBeTruthy();
    expect(movedWeather).not.toMatchObject({ grid_x: 20, grid_y: 20 });
    expect(rawOverlap(keptJobs!, compliance!)).toBe(false);
    expect(rawOverlap(movedWeather!, keptJobs!)).toBe(false);
    expect(rawOverlap(movedWeather!, compliance!)).toBe(false);
    expect(rawLayoutOverlaps(widgets)).toBe(false);
  });

  it('drops retired rows and leaves remaining widgets at their saved coordinates', () => {
    const seed = withIds(defaultDashboardWidgetInserts());
    const saved: DashboardWidgetRect[] = [
      ...seed,
      { id: 'btc', widget_type: 'bitcoin', grid_x: 20, grid_y: 20, grid_w: 260, grid_h: 180 },
      { id: 'mkt', widget_type: 'stock_market', grid_x: 700, grid_y: 20, grid_w: 390, grid_h: 180 },
    ];
    const { widgets, changed, droppedIds } = repairDashboardWidgetLayout(saved);
    expect(changed).toBe(true);
    expect(droppedIds.sort()).toEqual(['btc', 'mkt']);
    expect(widgets.some(w => w.widget_type === 'bitcoin' || w.widget_type === 'crypto' || w.widget_type === 'stock_market')).toBe(false);
    expect(widgets).toEqual(seed);
    expect(rawLayoutOverlaps(widgets)).toBe(false);
  });

  it('phone reorder swaps display order without moving desktop x/y/w/h', () => {
    const rows: Array<DashboardWidgetRect & { id: string; config?: unknown }> = [
      { id: 'b', widget_type: 'weather', grid_x: 20, grid_y: 200, grid_w: 260, grid_h: 180, config: {} },
      { id: 'a', widget_type: 'upcoming_jobs', grid_x: 20, grid_y: 20, grid_w: 390, grid_h: 180, config: {} },
      { id: 'c', widget_type: 'clock', grid_x: 20, grid_y: 400, grid_w: 260, grid_h: 180, config: {} },
    ];
    expect(sortDashboardWidgetsForView(rows).map(row => row.id)).toEqual(['a', 'b', 'c']);
    const down = swapAdjacentDashboardWidgetPhoneOrder(rows, 'a', 1);
    expect(sortDashboardWidgetsForView(down).map(row => row.id)).toEqual(['b', 'a', 'c']);
    expect(down.find(row => row.id === 'a')).toMatchObject({ grid_x: 20, grid_y: 20, grid_w: 390, grid_h: 180 });
    expect(down.find(row => row.id === 'b')).toMatchObject({ grid_x: 20, grid_y: 200, grid_w: 260, grid_h: 180 });
    const top = swapAdjacentDashboardWidgetPhoneOrder(rows, 'a', -1);
    expect(sortDashboardWidgetsForView(top).map(row => row.id)).toEqual(['a', 'b', 'c']);
  });

  it('phone Down on live Invoices keeps Compliance on the 1166 canvas', () => {
    const live: Array<DashboardWidgetRect & { id: string; config?: unknown }> = [
      { id: 'w-jobs', widget_type: 'upcoming_jobs', grid_x: 20, grid_y: 20, grid_w: 390, grid_h: 270, config: {} },
      { id: 'w-weather1', widget_type: 'weather', grid_x: 540, grid_y: 20, grid_w: 260, grid_h: 270, config: {} },
      { id: 'w-weather2', widget_type: 'weather', grid_x: 20, grid_y: 380, grid_w: 260, grid_h: 270, config: {} },
      { id: 'w-invoices', widget_type: 'outstanding_invoices', grid_x: 800, grid_y: 380, grid_w: 260, grid_h: 180, config: {} },
      { id: 'w-compliance', widget_type: 'compliance_deadlines', grid_x: 20, grid_y: 740, grid_w: 390, grid_h: 270, config: {} },
    ];
    const next = swapAdjacentDashboardWidgetPhoneOrder(live, 'w-invoices', 1);
    for (const row of next) {
      const prev = live.find(item => item.id === row.id)!;
      expect(row).toMatchObject({
        grid_x: prev.grid_x,
        grid_y: prev.grid_y,
        grid_w: prev.grid_w,
        grid_h: prev.grid_h,
      });
    }
    expect(next.find(row => row.id === 'w-compliance')).toMatchObject({ grid_x: 20, grid_y: 740, grid_w: 390 });
    expect(dashboardWidgetLayoutOverlaps(next)).toBe(false);
    expect(next.every(row => dashboardWidgetFitsCanvas(row, 1166))).toBe(true);
    expect(repairDashboardWidgetLayout(next, 1166).changed).toBe(false);
  });

  it('phone Down on Upcoming Jobs does not overlap Weather on the seed-plus-tools layout', () => {
    const seed = withIds(defaultDashboardWidgetInserts()).map(row => ({
      ...row,
      id: row.id ?? row.widget_type,
      config: {},
    }));
    const weatherPlace = placeAddedDashboardWidget(seed, 'weather')!;
    const weather = { id: 'weather', widget_type: 'weather', ...weatherPlace, config: {} };
    const miniPlace = placeAddedDashboardWidget([...seed, weather], 'mini_calendar')!;
    const mini = { id: 'mini', widget_type: 'mini_calendar', ...miniPlace, config: {} };
    const rows = [...seed, weather, mini];
    const jobs = rows.find(row => row.widget_type === 'upcoming_jobs')!;
    const next = swapAdjacentDashboardWidgetPhoneOrder(rows, jobs.id!, 1);
    for (const row of next) {
      const prev = rows.find(item => item.id === row.id)!;
      expect(row).toMatchObject({
        grid_x: prev.grid_x,
        grid_y: prev.grid_y,
        grid_w: prev.grid_w,
        grid_h: prev.grid_h,
      });
    }
    expect(rawLayoutOverlaps(next)).toBe(false);
    expect(repairDashboardWidgetLayout(next).changed).toBe(false);
    expect(next.find(row => row.id === 'weather')).toMatchObject({
      grid_x: weather.grid_x,
      grid_y: weather.grid_y,
      grid_w: weather.grid_w,
      grid_h: weather.grid_h,
    });
  });

  it('clamps right-edge Compliance into a 910 canvas without rewriting stored rows or overlapping', () => {
    const rows: DashboardWidgetRect[] = [
      { id: 'jobs', widget_type: 'upcoming_jobs', grid_x: 0, grid_y: 0, grid_w: 360, grid_h: 200 },
      { id: 'invoices', widget_type: 'outstanding_invoices', grid_x: 376, grid_y: 0, grid_w: 280, grid_h: 200 },
      { id: 'compliance', widget_type: 'compliance_deadlines', grid_x: 672, grid_y: 0, grid_w: 320, grid_h: 200 },
    ];
    const stored = rows.map(row => ({ ...row }));
    const next = clampDashboardWidgetsToCanvas(rows, 910);
    expect(next.find(row => row.id === 'compliance')).toMatchObject({ grid_x: 672, grid_w: 238 });
    expect(next.every(row => row.grid_x + row.grid_w <= 910)).toBe(true);
    expect(dashboardWidgetLayoutOverlaps(next)).toBe(false);
    expect(rows).toEqual(stored);
  });

  it('relocates right-edge Compliance on a 686 canvas instead of shrinking to a sliver', () => {
    const rows: DashboardWidgetRect[] = [
      { id: 'jobs', widget_type: 'upcoming_jobs', grid_x: 0, grid_y: 0, grid_w: 360, grid_h: 200 },
      { id: 'invoices', widget_type: 'outstanding_invoices', grid_x: 376, grid_y: 0, grid_w: 280, grid_h: 200 },
      { id: 'compliance', widget_type: 'compliance_deadlines', grid_x: 672, grid_y: 0, grid_w: 320, grid_h: 200 },
    ];
    const stored = rows.map(row => ({ ...row }));
    const next = clampDashboardWidgetsToCanvas(rows, 686);
    const compliance = next.find(row => row.id === 'compliance')!;
    expect(compliance.grid_w).toBeGreaterThanOrEqual(200);
    expect(next.every(row => dashboardWidgetFitsCanvas(row, 686))).toBe(true);
    expect(dashboardWidgetLayoutOverlaps(next)).toBe(false);
    expect(rows).toEqual(stored);
  });

  it('clamps live Invoices at x=800 into 910 and 686 canvases without overlap', () => {
    const live: DashboardWidgetRect[] = [
      { id: 'w-jobs', widget_type: 'upcoming_jobs', grid_x: 20, grid_y: 20, grid_w: 390, grid_h: 270 },
      { id: 'w-weather1', widget_type: 'weather', grid_x: 540, grid_y: 20, grid_w: 260, grid_h: 270 },
      { id: 'w-weather2', widget_type: 'weather', grid_x: 20, grid_y: 380, grid_w: 260, grid_h: 270 },
      { id: 'w-invoices', widget_type: 'outstanding_invoices', grid_x: 800, grid_y: 380, grid_w: 260, grid_h: 180 },
      { id: 'w-compliance', widget_type: 'compliance_deadlines', grid_x: 20, grid_y: 740, grid_w: 390, grid_h: 270 },
    ];
    for (const canvasW of [910, 686]) {
      const next = clampDashboardWidgetsToCanvas(live, canvasW);
      expect(next.every(row => dashboardWidgetFitsCanvas(row, canvasW))).toBe(true);
      expect(dashboardWidgetLayoutOverlaps(next)).toBe(false);
      expect(live.find(row => row.id === 'w-invoices')).toMatchObject({ grid_x: 800, grid_w: 260 });
    }
  });

  it('clamps a card wider than the canvas to canvas minus the gutter', () => {
    const row: DashboardWidgetRect = {
      id: 'wide', widget_type: 'upcoming_jobs', grid_x: 20, grid_y: 20, grid_w: 780, grid_h: 270,
    };
    const next = clampDashboardWidgetToCanvas(row, 686);
    expect(next.grid_x).toBe(20);
    expect(next.grid_w).toBe(666);
    expect(next.grid_x + next.grid_w).toBe(686);
    expect(row.grid_w).toBe(780);
  });

  it('does not shrink a card below the 180px resize minimum', () => {
    const live: DashboardWidgetRect[] = [
      { id: 'w-jobs', widget_type: 'upcoming_jobs', grid_x: 20, grid_y: 20, grid_w: 390, grid_h: 270 },
      { id: 'w-weather1', widget_type: 'weather', grid_x: 540, grid_y: 20, grid_w: 260, grid_h: 270 },
      { id: 'w-pending', widget_type: 'pending_reports', grid_x: 540, grid_y: 740, grid_w: 390, grid_h: 180 },
    ];
    const next = clampDashboardWidgetsToCanvas(live, 686);
    for (const row of next) {
      expect(row.grid_w).toBeGreaterThanOrEqual(DASHBOARD_WIDGET_MIN_W);
      expect(row.grid_x + row.grid_w).toBeLessThanOrEqual(686);
    }
    expect(dashboardWidgetLayoutOverlaps(next)).toBe(false);
    expect(live.find(row => row.id === 'w-weather1')).toMatchObject({ grid_x: 540, grid_w: 260 });
  });

  it('re-places a clamped card into the nearest free slot, not the bottom', () => {
    const rows: DashboardWidgetRect[] = [
      { id: 'w-jobs', widget_type: 'upcoming_jobs', grid_x: 20, grid_y: 20, grid_w: 390, grid_h: 270 },
      { id: 'w-weather1', widget_type: 'weather', grid_x: 540, grid_y: 20, grid_w: 260, grid_h: 270 },
      { id: 'w-weather2', widget_type: 'weather', grid_x: 20, grid_y: 380, grid_w: 260, grid_h: 270 },
      { id: 'w-weather3', widget_type: 'weather', grid_x: 410, grid_y: 380, grid_w: 260, grid_h: 270 },
      { id: 'w-invoices', widget_type: 'outstanding_invoices', grid_x: 800, grid_y: 380, grid_w: 260, grid_h: 180 },
      { id: 'w-compliance', widget_type: 'compliance_deadlines', grid_x: 20, grid_y: 740, grid_w: 390, grid_h: 270 },
      { id: 'w-pending', widget_type: 'pending_reports', grid_x: 540, grid_y: 740, grid_w: 390, grid_h: 180 },
      { id: 'w-clock', widget_type: 'clock', grid_x: 20, grid_y: 1030, grid_w: 260, grid_h: 180 },
      { id: 'w-calendar', widget_type: 'calendar', grid_x: 410, grid_y: 1030, grid_w: 390, grid_h: 270 },
      { id: 'w-calculator', widget_type: 'calculator', grid_x: 20, grid_y: 1320, grid_w: 260, grid_h: 320 },
      { id: 'w-quick', widget_type: 'quick_actions', grid_x: 410, grid_y: 1320, grid_w: 260, grid_h: 270 },
      { id: 'w-kpi', widget_type: 'kpi_scorecard', grid_x: 800, grid_y: 1030, grid_w: 390, grid_h: 270 },
    ];
    const next = clampDashboardWidgetsToCanvas(rows, 910);
    const invoices = next.find(row => row.id === 'w-invoices')!;
    expect(invoices.grid_x + invoices.grid_w).toBeLessThanOrEqual(910);
    expect(invoices.grid_y).toBe(940);
    expect(invoices.grid_y).toBeLessThan(1640);
    expect(dashboardWidgetLayoutOverlaps(next)).toBe(false);
    expect(rows.find(row => row.id === 'w-invoices')).toMatchObject({ grid_x: 800, grid_y: 380 });
  });

  it('drag on a clamped card starts from the drawn rect and stays on a 910 canvas', () => {
    const live: DashboardWidgetRect[] = [
      { id: 'w-jobs', widget_type: 'upcoming_jobs', grid_x: 20, grid_y: 20, grid_w: 390, grid_h: 270 },
      { id: 'w-weather1', widget_type: 'weather', grid_x: 540, grid_y: 20, grid_w: 260, grid_h: 270 },
      { id: 'w-weather2', widget_type: 'weather', grid_x: 20, grid_y: 380, grid_w: 260, grid_h: 270 },
      { id: 'w-invoices', widget_type: 'outstanding_invoices', grid_x: 800, grid_y: 380, grid_w: 260, grid_h: 180 },
      { id: 'w-compliance', widget_type: 'compliance_deadlines', grid_x: 20, grid_y: 740, grid_w: 390, grid_h: 270 },
    ];
    const drawn = clampDashboardWidgetsToCanvas(live, 910).find(row => row.id === 'w-invoices')!;
    expect(drawn.grid_x).not.toBe(800);
    const next = applyDashboardWidgetDrag(drawn, { x: -100, y: 0 }, 910);
    expect(next.grid_x).toBe(drawn.grid_x - 100);
    expect(next.grid_y).toBe(drawn.grid_y);
    expect(next.grid_w).toBe(drawn.grid_w);
    expect(next.grid_x + next.grid_w).toBeLessThanOrEqual(910);
    expect(next.grid_x).not.toBe(700);
  });

  it('resize max follows the canvas from the drawn x', () => {
    const sized = applyDashboardWidgetResize(
      { grid_x: 650, grid_w: 260, grid_h: 180 },
      { x: 400, y: 0 },
      910,
    );
    expect(sized.grid_x).toBe(650);
    expect(sized.grid_w).toBe(260);
    expect(sized.grid_x + sized.grid_w).toBe(910);
  });

  it('filters the picker with the same helper the page uses', () => {
    const data = pickerDashboardWidgets('data').map(def => def.type);
    const system = pickerDashboardWidgets('system').map(def => def.type);
    expect(data).not.toContain('bitcoin');
    expect(data).not.toContain('crypto');
    expect(data).not.toContain('stock_market');
    expect(data).toContain('weather');
    expect(system).toContain('upcoming_jobs');
    expect(placeAddedDashboardWidget([], 'bitcoin')).toBeNull();
  });
});

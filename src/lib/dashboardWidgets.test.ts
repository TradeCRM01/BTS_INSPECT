import { describe, expect, it } from 'vitest';
import { getWidgetDef } from '../widgets/registry';
import {
  DASHBOARD_WIDGET_CELL_H,
  DASHBOARD_WIDGET_CELL_W,
  DEFAULT_DASHBOARD_WIDGET_TYPES,
  dashboardWidgetPixelSize,
  decideDashboardWidgetSeed,
  defaultDashboardWidgetInserts,
  resolveDashboardWidgets,
  type DashboardWidgetInsert,
  type DashboardWidgetSeedIo,
} from './dashboardWidgets';

type Row = DashboardWidgetInsert & { id?: string };

function seedStore(init: { rows: Row[]; seeded: boolean }) {
  const store = {
    rows: [...init.rows],
    seeded: init.seeded,
    inserts: 0,
    marks: 0,
  };

  const io: DashboardWidgetSeedIo<Row> = {
    loadRows: async () => [...store.rows],
    loadSeeded: async () => store.seeded,
    claimSeed: async () => {
      if (store.seeded) return false;
      store.seeded = true;
      return true;
    },
    insertDefaults: async () => {
      store.inserts += 1;
      store.rows = defaultDashboardWidgetInserts().map((row, i) => ({
        ...row,
        id: `seed-${i}`,
      }));
      return [...store.rows];
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
});

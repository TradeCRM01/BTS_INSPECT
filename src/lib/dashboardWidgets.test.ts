import { describe, expect, it } from 'vitest';
import { getWidgetDef } from '../widgets/registry';
import {
  DASHBOARD_WIDGET_CELL_H,
  DASHBOARD_WIDGET_CELL_W,
  DEFAULT_DASHBOARD_WIDGET_TYPES,
  dashboardWidgetPixelSize,
  defaultDashboardWidgetInserts,
  shouldSeedDefaultDashboardWidgets,
} from './dashboardWidgets';

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

  it('writes a default set only when the user has zero rows', () => {
    expect(shouldSeedDefaultDashboardWidgets([])).toBe(true);
    expect(shouldSeedDefaultDashboardWidgets(null)).toBe(true);
    expect(shouldSeedDefaultDashboardWidgets(undefined)).toBe(true);
    expect(shouldSeedDefaultDashboardWidgets([{ id: 'kept' }])).toBe(false);
    expect(shouldSeedDefaultDashboardWidgets(defaultDashboardWidgetInserts())).toBe(false);
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

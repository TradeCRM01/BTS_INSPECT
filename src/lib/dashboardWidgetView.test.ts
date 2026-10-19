import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  dashboardWidgetViewTier,
  sortDashboardWidgetsForView,
  swapAdjacentDashboardWidgetPhoneOrder,
} from './dashboardWidgetView';

describe('dashboardWidgetView', () => {
  it('ranks money widgets before ops filler', () => {
    const widgets = [
      { id: 'a', widget_type: 'weather' },
      { id: 'b', widget_type: 'outstanding_invoices' },
      { id: 'c', widget_type: 'upcoming_jobs' },
      { id: 'd', widget_type: 'cash_flow' },
    ];
    expect(sortDashboardWidgetsForView(widgets).map(w => w.id)).toEqual(['b', 'd', 'c', 'a']);
    expect(dashboardWidgetViewTier('outstanding_invoices')).toBe('money');
    expect(dashboardWidgetViewTier('upcoming_jobs')).toBe('ops');
  });

  it('uses the same phone_order for view and customize after a swap', () => {
    const widgets = [
      { id: 'jobs', widget_type: 'upcoming_jobs', config: {} },
      { id: 'weather', widget_type: 'weather', config: {} },
      { id: 'invoices', widget_type: 'outstanding_invoices', config: {} },
    ];
    expect(sortDashboardWidgetsForView(widgets).map(w => w.id)).toEqual(['invoices', 'jobs', 'weather']);
    const moved = swapAdjacentDashboardWidgetPhoneOrder(widgets, 'weather', -1);
    expect(sortDashboardWidgetsForView(moved).map(w => w.id)).toEqual(['invoices', 'weather', 'jobs']);
    const reloaded = moved.map(row => ({ ...row }));
    expect(sortDashboardWidgetsForView(reloaded).map(w => w.id)).toEqual(['invoices', 'weather', 'jobs']);
  });

  it('DashboardPage uses view grid outside edit mode', () => {
    const page = readFileSync(resolve(process.cwd(), 'src/pages/DashboardPage.tsx'), 'utf8');
    expect(page).toContain('sortDashboardWidgetsForView');
    expect(page).toContain('dashboard-home-view-grid');
    expect(page).toContain('dashboard-home-widget-card');
  });

  it('phone reorder persists only phone_order and never writes desktop x/y', () => {
    const helper = readFileSync(resolve(process.cwd(), 'src/lib/dashboardWidgetView.ts'), 'utf8');
    const page = readFileSync(resolve(process.cwd(), 'src/pages/DashboardPage.tsx'), 'utf8');
    const move = page.slice(page.indexOf('const movePhoneWidget'), page.indexOf('const updateWidgetConfig'));
    expect(helper).toContain('phone_order');
    expect(helper).toContain('Never copies grid_x / grid_y / grid_w / grid_h');
    expect(helper).not.toMatch(/grid_x:\s*[ab]\.grid_x/);
    expect(helper).not.toMatch(/grid_y:\s*[ab]\.grid_y/);
    expect(move).toContain('swapAdjacentDashboardWidgetPhoneOrder');
    expect(move).toContain('persistWidget(row.id, { config: row.config })');
    expect(move).not.toMatch(/persistWidget\([^)]*grid_x/);
    expect(move).not.toMatch(/persistWidget\([^)]*grid_y/);
    expect(move).not.toContain('grid_x: row.grid_x');
    expect(move).not.toContain('grid_y: row.grid_y');
  });

  it('MONEY-3: sent unpaid invoices count in outstanding widget query', () => {
    const widgets = readFileSync(resolve(process.cwd(), 'src/widgets/WidgetComponents.tsx'), 'utf8');
    expect(widgets).toContain(".in('status', ['sent', 'overdue', 'part_paid'])");
    expect(widgets).toContain('invoiceBalanceOwed');
  });
});

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { dashboardWidgetViewTier, sortDashboardWidgetsForView } from './dashboardWidgetView';

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

  it('DashboardPage uses view grid outside edit mode', () => {
    const page = readFileSync(resolve(process.cwd(), 'src/pages/DashboardPage.tsx'), 'utf8');
    expect(page).toContain('sortDashboardWidgetsForView');
    expect(page).toContain('dashboard-home-view-grid');
    expect(page).toContain('dashboard-home-widget-card');
  });

  it('MONEY-3: sent unpaid invoices count in outstanding widget query', () => {
    const widgets = readFileSync(resolve(process.cwd(), 'src/widgets/WidgetComponents.tsx'), 'utf8');
    expect(widgets).toContain(".in('status', ['sent', 'overdue', 'part_paid'])");
    expect(widgets).toContain('invoiceBalanceOwed');
  });
});

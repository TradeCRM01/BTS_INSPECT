import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { JobCostingPanel } from './JobCostingPanel';
import type { TimesheetEntryForBill } from '../../lib/hoursToJobBill';

const queryState = vi.hoisted(() => ({
  costs: [] as Array<Record<string, unknown>>,
  timesheetEntries: [] as TimesheetEntryForBill[],
  billedIds: new Set<string>(),
}));

vi.mock('@tanstack/react-query', () => ({
  useQuery: ({ queryKey }: { queryKey: unknown[] }) => {
    const key = queryKey[0];
    if (key === 'job-costs') return { data: queryState.costs };
    if (key === 'job-linked-quote') {
      return { data: { id: 'quote-1', quote_number: 42, total: 550 } };
    }
    if (key === 'job-timesheet-entries-bill') return { data: queryState.timesheetEntries };
    if (key === 'job-billed-timesheet-ids') return { data: queryState.billedIds };
    if (key === 'expense-cost-models') return { data: [] };
    return { data: [] };
  },
  useMutation: () => ({
    mutate: vi.fn(),
    isPending: false,
    isError: false,
  }),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({
    profile: { id: 'profile-1', company_id: 'company-1' },
    company: { default_material_markup: 10, default_tax_rate: 10 },
  }),
}));

vi.mock('../../lib/supabase', () => ({
  supabase: {},
}));

vi.mock('../ui/ManagedSelect', () => ({
  ManagedSelect: ({ value }: { value: string }) => createElement(
    'select',
    { 'aria-label': 'Nature', value, onChange: () => undefined },
    createElement('option', { value: '' }, 'Select'),
  ),
}));

function renderPanel(): string {
  return renderToStaticMarkup(
    createElement(JobCostingPanel, { jobId: 'job-1', clientId: 'client-1' }),
  );
}

const closedLabourEntry: TimesheetEntryForBill = {
  id: 'e1',
  job_id: 'job-1',
  timesheet_id: 't1',
  start_time: '2026-10-06T00:00:00.000Z',
  end_time: '2026-10-06T01:00:00.000Z',
  billable: true,
  work_type: 'Labour',
  notes: null,
};

describe('JobCostingPanel bill states', () => {
  beforeEach(() => {
    queryState.costs = [];
    queryState.timesheetEntries = [];
    queryState.billedIds = new Set();
  });

  it('keeps bill actions but removes totals and invoice action when the bill is empty', () => {
    const html = renderPanel();

    expect(html).toContain('No materials on this job yet.');
    expect(html).toContain('Parts and labour from site — add a line below.');
    expect(html).toContain('Linked quote');
    expect(html).toContain('Add a bill line');
    expect(html).toContain('Add to bill');
    expect(html).toContain('Allocate Parts');
    expect(html).toContain('Bill = supply cost + markup.');
    expect(html).not.toContain('Materials cost');
    expect(html).not.toContain('Labour cost');
    expect(html).not.toContain('Other cost');
    expect(html).not.toContain('Charge total');
    expect(html).not.toContain('Create invoice from bill');
  });

  it('restores totals and the invoice action when the bill has a line', () => {
    queryState.costs = [{
      id: 'cost-1',
      created_at: '2026-09-23T00:00:00.000Z',
      cost_type: 'materials',
      charge_type: 'Materials',
      description: 'Copper pipe',
      quantity: 2,
      unit_cost: 10,
      total_cost: 20,
      markup_percent: 10,
      unit_price: 11,
      total_price: 22,
    }];

    const html = renderPanel();

    expect(html).toContain('Materials cost');
    expect(html).toContain('Labour cost');
    expect(html).toContain('Other cost');
    expect(html).toContain('Charge total');
    expect(html).toContain('Create invoice from bill');
    expect(html).toContain('Add to bill');
    expect(html).toContain('Allocate Parts');
    expect(html).not.toContain('No materials on this job yet.');
  });

  it('order B — shows Create invoice from bill when only unbilled hours exist', () => {
    queryState.timesheetEntries = [closedLabourEntry];
    const html = renderPanel();
    expect(html).toContain('Create invoice from bill');
    expect(html).toContain('1.0 unbilled hours · Add as labour');
    expect(html).not.toContain('Charge total');
  });
});

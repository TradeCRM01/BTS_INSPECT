/** Browser-side stubs for the P3 Jobs Chromium harness. Not imported by the app. */

export type P3Cfg = { path?: string; empty?: boolean; clientsError?: boolean; extrasError?: boolean };

function cfg(): P3Cfg {
  return (globalThis as unknown as { __P3__?: P3Cfg }).__P3__ ?? {};
}

export function useAuth() {
  return {
    profile: {
      id: '00000000-0000-0000-0000-000000000002',
      name: 'Field Audit',
      role: 'admin',
      company_id: 'c1',
    },
    company: {
      id: 'c1',
      name: 'Northside Plumbing & Gas Maintenance Services Pty Ltd',
      report_theme: null,
      time_zone: 'Australia/Brisbane',
    },
    signOut: async () => {},
    isPlatformOperator: true,
  };
}

export function useCompanyAiKey() {
  return { ready: true, hasKey: true };
}

export function DevConsole() {
  return null;
}

export function GlobalSearch() {
  return null;
}

const STAMP = '2026-10-19T00:00:00.000Z';

function jobBase() {
  return {
    company_id: 'c1',
    description: null as string | null,
    priority: 'medium',
    inspection_id: null as string | null,
    created_by: '00000000-0000-0000-0000-000000000002',
    created_at: STAMP,
    updated_at: STAMP,
    color: null as string | null,
    budget: 900 as number | null,
    parent_job_id: null as string | null,
    cost_code: null as string | null,
  };
}

function liveJobs() {
  if (cfg().empty) return [];
  const base = jobBase();
  const fillers = [4, 5, 6, 7, 8, 9, 10, 11, 12].map((n) => ({
    ...base,
    id: n === 4 ? 'p3-void-parent' : n === 5 ? 'p3-void-child' : `p3-j${n}`,
    client_id: 'p3-client-36',
    title: n === 4 ? 'Void parent invoice' : n === 5 ? 'Child of void parent' : `Filler job ${n}`,
    status: n === 4 || n === 5 ? 'completed' : n === 12 ? 'in_progress' : 'scheduled',
    scheduled_date: '2026-10-20',
    start_time: '08:00',
    end_time: '12:00',
    address: `${n} Example St, Ashgrove QLD 4060`,
    assigned_team: ['p3-dean'],
    job_number: n,
    budget: null,
    parent_job_id: n === 5 ? 'p3-void-parent' : null,
  }));
  return [{
    ...base,
    id: 'p3-0036',
    client_id: 'p3-client-36',
    title: 'Hot water replacement',
    status: 'completed',
    scheduled_date: '2026-10-19',
    start_time: '07:00',
    end_time: '10:30',
    address: '12 Grange Rd, Stafford',
    assigned_team: ['p3-dean', 'p3-tom'],
    job_number: 36,
  }, {
    ...base,
    id: 'p3-need-crew',
    client_id: 'p3-client-36',
    title: 'Dated needs crew',
    status: 'scheduled',
    scheduled_date: '2026-10-21',
    start_time: '09:00',
    end_time: '11:00',
    address: '4 Crew St, Stafford',
    assigned_team: [],
    job_number: 2,
    budget: null,
  }, {
    ...base,
    id: 'p3-undated',
    client_id: 'p3-client-36',
    title: 'Undated crewless',
    status: 'scheduled',
    scheduled_date: null,
    start_time: null,
    end_time: null,
    address: '8 Quiet St, Stafford',
    assigned_team: [],
    job_number: 3,
    budget: null,
  }, {
    ...base, id: 'x-unknown', client_id: 'p3-client-36', title: 'Unknown status dated crewless',
    status: 'on_hold', scheduled_date: '2026-10-22', start_time: '09:00', end_time: '10:00',
    address: '1 Odd St, Stafford', assigned_team: [], job_number: 91, budget: null,
  }, {
    ...base, id: 'x-ws', client_id: 'p3-client-36', title: 'Whitespace crew ids',
    status: 'scheduled', scheduled_date: '2026-10-22', start_time: '09:00', end_time: '10:00',
    address: '2 Odd St, Stafford', assigned_team: ['  ', ''], job_number: 92, budget: null,
  }, {
    ...base, id: 'x-done', client_id: 'p3-client-36', title: 'Done with draft invoice',
    status: 'completed', scheduled_date: '2026-10-18', start_time: '07:00', end_time: '10:30',
    address: '3 Odd St, Stafford', assigned_team: ['p3-dean'], job_number: 93, budget: null,
  }, {
    ...base, id: 'x-parent', client_id: 'p3-client-36', title: 'Parent invoiced only in c2',
    status: 'scheduled', scheduled_date: '2026-10-18', start_time: '07:00', end_time: '10:30',
    address: '4 Odd St, Stafford', assigned_team: ['p3-dean'], job_number: 94, budget: null,
  }, {
    ...base, id: 'x-child', client_id: 'p3-client-36', title: 'Child of c2 invoiced parent',
    status: 'completed', scheduled_date: '2026-10-18', start_time: '07:00', end_time: '10:30',
    address: '5 Odd St, Stafford', assigned_team: ['p3-dean'], job_number: 95, budget: null,
    parent_job_id: 'x-parent',
  }, ...fillers];
}

function liveClients() {
  return [{
    id: 'p3-client-36',
    company_id: 'c1',
    name: 'P3 Grange Rd',
    phone: '0400000036',
    email: 'sam@example.com',
    address: '12 Grange Rd, Stafford',
    archived: false,
  }];
}

function liveCrew() {
  return [
    { id: 'p3-dean', name: 'Dean' },
    { id: 'p3-tom', name: 'Tom' },
  ];
}

function liveNotes() {
  return [{
    id: 'p3-note-tom',
    company_id: 'c1',
    job_id: 'p3-0036',
    author_id: 'p3-tom',
    author_name: 'Tom Nguyen',
    body: 'Flushed the old unit.',
    created_at: '2026-10-19T07:40:00.000Z',
    outcome: null,
  }, {
    id: 'p3-note-dean',
    company_id: 'c1',
    job_id: 'p3-0036',
    author_id: 'p3-dean',
    author_name: 'Dean Walsh',
    body: 'New unit on.',
    created_at: '2026-10-19T08:10:00.000Z',
    outcome: null,
  }];
}

const P3_PHOTO_CAPTIONS = [
  'Overflow gully, before',
  'CCTV, roots at 6.2 m',
  'Boundary trap, exposed',
  'Jetting set-up',
  'CCTV, line clear',
  'Inspection cap fitted',
  'Site after',
];

function livePhotos() {
  return Array.from({ length: 7 }, (_, i) => {
    const hour = String(7 + i).padStart(2, '0');
    const at = `2026-10-19T${hour}:00:00.000Z`;
    return {
      id: `p3-photo-${i + 1}`,
      company_id: 'c1',
      job_id: 'p3-0036',
      visit_note_id: null,
      storage_path: `jobs/p3-0036/${i + 1}.jpg`,
      caption: P3_PHOTO_CAPTIONS[i] ?? null,
      created_by: 'p3-dean',
      created_at: at,
      taken_at: at,
      taken_at_source: 'upload',
      lat: null,
      lng: null,
      location_source: null,
      location_accuracy_m: null,
    };
  });
}

function liveCosts() {
  const rows = [
    { description: 'Call-out', quantity: 1, unit_price: 180, unit_cost: 80, total_cost: 80, total_price: 180 },
    { description: 'Hot water unit', quantity: 1, unit_price: 400, unit_cost: 280, total_cost: 280, total_price: 400 },
    { description: 'Parts', quantity: 1, unit_price: 180, unit_cost: 90, total_cost: 90, total_price: 180 },
    { description: 'Flush', quantity: 1, unit_price: 75.5, unit_cost: 30, total_cost: 30, total_price: 75.5 },
  ];
  return rows.map((row, i) => ({
    id: `p3-cost-${i + 1}`,
    job_id: 'p3-0036',
    company_id: 'c1',
    cost_type: 'material',
    markup_percent: 0,
    charge_type: 'fixed',
    stock_item_id: null,
    cost_model_id: null,
    timesheet_entry_id: null,
    created_at: `2026-10-19T07:0${i}:00.000Z`,
    ...row,
  }));
}

function liveTimesheets() {
  return [{
    id: 'p3-ts-1',
    company_id: 'c1',
    employee_id: '00000000-0000-0000-0000-000000000002',
    date: '2026-10-19',
    clock_in: '07:00',
    clock_out: '11:24',
    total_minutes: 264,
    status: 'submitted',
  }];
}

function liveTimesheetEntries() {
  return [{
    id: 'p3-tse-1',
    timesheet_id: 'p3-ts-1',
    job_id: 'p3-0036',
    start_time: '2026-10-19T07:00:00.000Z',
    end_time: '2026-10-19T11:24:00.000Z',
    work_type: 'Plumbing',
    billable: false,
    notes: null,
  }];
}

function liveJhas() {
  return [{
    id: 'p3-jha-1',
    job_id: 'p3-0036',
    status: 'completed',
    report_number: 'JHA-1',
    created_at: STAMP,
    template_snapshot: null,
    meta: null,
    steps: [],
  }];
}

function liveQuotes() {
  return [{
    id: 'p3-quote-1',
    job_id: 'p3-0036',
    quote_number: 12,
    status: 'draft',
    total: 900,
    created_at: STAMP,
    line_items: [],
  }];
}

function liveInvoices() {
  return [{
    id: 'p3-inv-void',
    company_id: 'c1',
    job_id: 'p3-void-parent',
    invoice_number: 9,
    status: 'void',
    total: 100,
    due_date: null,
    created_at: STAMP,
  }, {
    id: 'x-inv-draft', company_id: 'c1', job_id: 'x-done', invoice_number: 93,
    status: 'draft', total: 100, due_date: null, created_at: STAMP,
  }, {
    id: 'x-inv-c2', company_id: 'c2', job_id: 'x-parent', invoice_number: 94,
    status: 'sent', total: 100, due_date: null, created_at: STAMP,
  }];
}

type MockRow = Record<string, unknown>;

function tableRows(table: string): MockRow[] {
  if (table === 'jobs') return liveJobs() as unknown as MockRow[];
  if (table === 'clients') return liveClients() as unknown as MockRow[];
  if (table === 'job_visit_notes') return liveNotes() as unknown as MockRow[];
  if (table === 'job_photos') return livePhotos() as unknown as MockRow[];
  if (table === 'job_costs') return liveCosts() as unknown as MockRow[];
  if (table === 'timesheets') return liveTimesheets() as unknown as MockRow[];
  if (table === 'timesheet_entries') return liveTimesheetEntries() as unknown as MockRow[];
  if (table === 'jha_documents') return liveJhas() as unknown as MockRow[];
  if (table === 'quotes') return liveQuotes() as unknown as MockRow[];
  if (table === 'invoices') return liveInvoices() as unknown as MockRow[];
  if (table === 'companies') {
    return [{ id: 'c1', name: 'Northside Plumbing', default_labour_rate: null, time_zone: 'Australia/Brisbane' }];
  }
  return [];
}

function from(table: string) {
  let rows = tableRows(table).map((row) => ({ ...row }));
  const payload = () => {
    if (table === 'clients' && cfg().clientsError) {
      return { data: null, error: { message: 'clients failed' }, count: 0 };
    }
    if ((table === 'quotes' || table === 'invoices') && cfg().extrasError) {
      return { data: null, error: { message: 'extras failed' }, count: 0 };
    }
    return { data: rows, error: null, count: rows.length };
  };
  const chain: Record<string, unknown> = {};
  chain.select = () => chain;
  chain.eq = (column: string, value: unknown) => {
    rows = rows.filter((row) => row[column] === value);
    return chain;
  };
  chain.neq = (column: string, value: unknown) => {
    rows = rows.filter((row) => row[column] !== value);
    return chain;
  };
  chain.gte = () => chain;
  chain.lte = () => chain;
  chain.in = (column: string, ids: unknown[]) => {
    const set = new Set(ids);
    rows = rows.filter((row) => set.has(row[column]));
    return chain;
  };
  chain.or = () => chain;
  chain.ilike = () => chain;
  chain.limit = () => chain;
  chain.order = () => chain;
  chain.is = (column: string, value: unknown) => {
    rows = rows.filter((row) => (value === null ? row[column] == null : row[column] === value));
    return chain;
  };
  chain.not = (column: string, op: string, value: unknown) => {
    if (op === 'is' && value === null) {
      rows = rows.filter((row) => row[column] != null);
    }
    return chain;
  };
  chain.insert = () => chain;
  chain.update = () => chain;
  chain.delete = () => chain;
  chain.maybeSingle = () => Promise.resolve({ data: rows[0] ?? null, error: null });
  chain.single = () => Promise.resolve({ data: rows[0] ?? null, error: null });
  chain.then = (
    resolve?: (v: unknown) => unknown,
    reject?: (e: unknown) => unknown,
  ) => Promise.resolve(payload()).then(resolve, reject);
  return chain;
}

export const supabase = {
  from,
  rpc: async (name: string) => {
    if (name === 'get_company_members') return { data: liveCrew(), error: null };
    return { data: [], error: null };
  },
  auth: {
    getSession: async () => ({ data: { session: null } }),
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
  },
  storage: {
    from: (bucket: string) => ({
      createSignedUrl: async (path: string) => ({
        data: { signedUrl: `https://example.test/${bucket}/${path}` },
        error: null,
      }),
      createSignedUrls: async (paths: string[]) => ({
        data: paths.map((path) => ({
          path,
          signedUrl: `https://example.test/${bucket}/${path}`,
        })),
        error: null,
      }),
      upload: async () => ({ data: null, error: null }),
    }),
  },
};

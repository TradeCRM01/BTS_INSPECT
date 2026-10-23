/** Frozen Today board fixture: Monday 19 October 2026, 13:40 AEST. */

export const TODAY_FIXTURE_DAY = '2026-10-19';
export const TODAY_FIXTURE_NOW = new Date(2026, 9, 19, 13, 40, 0);

export const TODAY_FIXTURE_COMPANY = 'c1';
export const TODAY_FIXTURE_OTHER = 'other-co';

export function todayFixtureNow(): Date {
  return new Date(TODAY_FIXTURE_NOW.getTime());
}

const STAMP = '2026-10-19T03:40:00.000Z';

export const TODAY_FIXTURE_CREW = [
  { id: 'crew-tom', name: 'Tom Reid' },
  { id: 'crew-dean', name: 'Dean Hollis' },
  { id: 'crew-josh', name: 'Josh Perm' },
  { id: 'crew-kayla', name: 'Kayla Shore' },
];

export const TODAY_FIXTURE_CLIENTS = [
  { id: 'cl-brooke', company_id: TODAY_FIXTURE_COMPANY, name: 'Brooke Lawson', address: '12 Brooke St, Stafford QLD 4053' },
  { id: 'cl-hannah', company_id: TODAY_FIXTURE_COMPANY, name: 'Hannah Cole', address: '8 Hannah St, Nundah QLD 4012' },
  { id: 'cl-raj', company_id: TODAY_FIXTURE_COMPANY, name: 'Raj Patel', address: '4 Raj St, Chermside QLD 4032' },
  { id: 'cl-kedron', company_id: TODAY_FIXTURE_COMPANY, name: 'Kedron Medical Centre', address: '20 Kedron St, Kedron QLD 4031' },
  { id: 'cl-mia', company_id: TODAY_FIXTURE_COMPANY, name: 'Mia Fraser', address: '9 Mia St, Wavell Heights QLD 4012' },
  { id: 'cl-sarah', company_id: TODAY_FIXTURE_COMPANY, name: 'Sarah Whitfield', address: '1 Sarah St, Ashgrove QLD 4060' },
  { id: 'cl-gympie', company_id: TODAY_FIXTURE_COMPANY, name: 'Gympie Rd Dental', address: '110 Gympie Rd, Kedron QLD 4031' },
  { id: 'cl-stafford', company_id: TODAY_FIXTURE_COMPANY, name: 'Stafford Bowls Club', address: '108 Stafford Rd, Stafford QLD 4053' },
  { id: 'cl-gwen', company_id: TODAY_FIXTURE_COMPANY, name: 'Gwen Albright', address: '12 Gwen St, Kedron QLD 4031' },
  { id: 'cl-luke', company_id: TODAY_FIXTURE_COMPANY, name: 'Luke Ferris', address: '8 Luke St, Wavell Heights QLD 4012' },
  { id: 'cl-priya', company_id: TODAY_FIXTURE_COMPANY, name: 'Priya Shah', address: '4 Priya St, Stafford QLD 4053' },
  { id: 'cl-leak', company_id: TODAY_FIXTURE_OTHER, name: 'Foreign Co', address: '99 Other St' },
];

function job(over: Record<string, unknown>) {
  return {
    company_id: TODAY_FIXTURE_COMPANY,
    description: null,
    priority: 'medium',
    inspection_id: null,
    created_by: '00000000-0000-0000-0000-000000000002',
    created_at: STAMP,
    updated_at: STAMP,
    color: null,
    budget: null,
    parent_job_id: null,
    cost_code: null,
    ...over,
  };
}

export const TODAY_FIXTURE_JOBS = [
  job({
    id: 'job-36',
    client_id: 'cl-brooke',
    title: 'Blocked sewer, CCTV inspection',
    status: 'completed',
    scheduled_date: TODAY_FIXTURE_DAY,
    start_time: '07:00',
    end_time: '10:30',
    address: '12 Brooke St, Stafford QLD 4053',
    assigned_team: ['crew-dean', 'crew-tom'],
    job_number: 36,
  }),
  job({
    id: 'job-33',
    client_id: 'cl-hannah',
    title: 'Bathroom rough-in',
    status: 'in_progress',
    scheduled_date: TODAY_FIXTURE_DAY,
    start_time: '08:00',
    end_time: '15:30',
    address: '8 Hannah St, Nundah QLD 4012',
    assigned_team: ['crew-kayla', 'crew-josh'],
    job_number: 33,
  }),
  job({
    id: 'job-37',
    client_id: 'cl-raj',
    title: 'Leaking mixer tap',
    status: 'completed',
    scheduled_date: TODAY_FIXTURE_DAY,
    start_time: '11:00',
    end_time: '12:00',
    address: '4 Raj St, Chermside QLD 4032',
    assigned_team: ['crew-tom'],
    job_number: 37,
  }),
  job({
    id: 'job-38',
    client_id: 'cl-kedron',
    title: 'Backflow test, annual',
    status: 'in_progress',
    scheduled_date: TODAY_FIXTURE_DAY,
    start_time: '13:00',
    end_time: '14:00',
    address: '20 Kedron St, Kedron QLD 4031',
    assigned_team: ['crew-dean'],
    job_number: 38,
  }),
  job({
    id: 'job-39',
    client_id: 'cl-mia',
    title: 'Hot water quote, site visit',
    status: 'scheduled',
    scheduled_date: TODAY_FIXTURE_DAY,
    start_time: '14:30',
    end_time: '16:00',
    address: '9 Mia St, Wavell Heights QLD 4012',
    assigned_team: [],
    job_number: 39,
  }),
  job({
    id: 'job-42',
    client_id: 'cl-mia',
    title: 'Hot water service',
    status: 'scheduled',
    scheduled_date: null,
    start_time: null,
    end_time: null,
    address: '9 Yard Rd, Lutwyche QLD 4030',
    assigned_team: [],
    job_number: 42,
  }),
  job({
    id: 'job-46',
    client_id: 'cl-brooke',
    title: 'Hold for parts',
    status: 'on_hold',
    scheduled_date: TODAY_FIXTURE_DAY,
    start_time: '16:00',
    end_time: '17:00',
    address: '2 Hold St, Stafford QLD 4053',
    assigned_team: [' '],
    job_number: 46,
  }),
  job({
    id: 'job-47',
    client_id: 'cl-raj',
    title: 'Parts on order',
    status: 'awaiting_parts',
    scheduled_date: TODAY_FIXTURE_DAY,
    start_time: '15:00',
    end_time: '16:00',
    address: '47 Parts Rd, Chermside QLD 4032',
    assigned_team: ['crew-dean'],
    job_number: 47,
  }),
  job({
    id: 'job-40',
    client_id: 'cl-gwen',
    title: 'Toilet cistern replacement',
    status: 'scheduled',
    scheduled_date: '2026-10-20',
    start_time: '07:30',
    end_time: '09:00',
    address: '12 Gwen St, Kedron QLD 4031',
    assigned_team: ['crew-tom'],
    job_number: 40,
  }),
  job({
    id: 'job-41',
    client_id: 'cl-luke',
    title: 'Blocked kitchen drain',
    status: 'scheduled',
    scheduled_date: '2026-10-20',
    start_time: '12:00',
    end_time: '13:30',
    address: '8 Luke St, Wavell Heights QLD 4012',
    assigned_team: ['crew-josh'],
    job_number: 41,
  }),
  job({
    id: 'job-50',
    client_id: 'cl-priya',
    title: 'Gas cooktop install',
    status: 'scheduled',
    scheduled_date: '2026-10-21',
    start_time: '08:00',
    end_time: '10:00',
    address: '4 Priya St, Stafford QLD 4053',
    assigned_team: ['crew-dean'],
    job_number: 50,
  }),
  job({
    id: 'job-foreign',
    company_id: TODAY_FIXTURE_OTHER,
    client_id: 'cl-leak',
    title: 'Foreign job',
    status: 'scheduled',
    scheduled_date: TODAY_FIXTURE_DAY,
    start_time: '09:00',
    end_time: '10:00',
    address: '99 Other St',
    assigned_team: [],
    job_number: 99,
  }),
];

export const TODAY_FIXTURE_INVOICES = [
  { id: 'inv-1112', company_id: TODAY_FIXTURE_COMPANY, invoice_number: 1112, status: 'sent', total: 1929.65, amount_paid: 0, due_date: '2026-10-30', client_id: 'cl-sarah', job_id: null, created_at: '2026-10-02' },
  { id: 'inv-1110', company_id: TODAY_FIXTURE_COMPANY, invoice_number: 1110, status: 'sent', total: 1188, amount_paid: 0, due_date: '2026-10-23', client_id: 'cl-gympie', job_id: null, created_at: '2026-10-01' },
  { id: 'inv-108', company_id: TODAY_FIXTURE_COMPANY, invoice_number: 108, status: 'overdue', total: 462, amount_paid: 0, due_date: '2026-10-09', client_id: 'cl-stafford', job_id: null, created_at: '2026-09-01' },
  { id: 'inv-draft', company_id: TODAY_FIXTURE_COMPANY, invoice_number: 200, status: 'draft', total: 999, amount_paid: 0, due_date: '2026-10-30', client_id: 'cl-sarah', job_id: null, created_at: '2026-10-19' },
  { id: 'inv-void', company_id: TODAY_FIXTURE_COMPANY, invoice_number: 201, status: 'void', total: 999, amount_paid: 0, due_date: '2026-10-30', client_id: 'cl-sarah', job_id: null, created_at: '2026-10-19' },
  { id: 'inv-foreign', company_id: TODAY_FIXTURE_OTHER, invoice_number: 300, status: 'sent', total: 5000, amount_paid: 0, due_date: '2026-10-30', client_id: 'cl-leak', job_id: null, created_at: '2026-10-19' },
  { id: 'inv-36', company_id: TODAY_FIXTURE_COMPANY, invoice_number: 136, status: 'void', total: 10, amount_paid: 0, due_date: null, client_id: 'cl-brooke', job_id: 'job-36', created_at: '2026-10-19' },
];

export const TODAY_FIXTURE_PAYMENTS = [
  { id: 'pay-1', company_id: TODAY_FIXTURE_COMPANY, invoice_id: 'inv-1112', amount: 4214.30, paid_at: TODAY_FIXTURE_DAY, method: 'transfer' },
  { id: 'pay-foreign', company_id: TODAY_FIXTURE_OTHER, invoice_id: 'inv-foreign', amount: 8000, paid_at: TODAY_FIXTURE_DAY, method: 'transfer' },
];

export const TODAY_FIXTURE_EXPENSES = [
  { id: 'ex-1', company_id: TODAY_FIXTURE_COMPANY, total: 1862.75, expense_date: TODAY_FIXTURE_DAY, status: 'recorded', cost_class: 'cogs', employee_cost_type: null },
  { id: 'ex-wages', company_id: TODAY_FIXTURE_COMPANY, total: 2000, expense_date: TODAY_FIXTURE_DAY, status: 'paid', cost_class: 'employee', employee_cost_type: 'wages' },
  { id: 'ex-super', company_id: TODAY_FIXTURE_COMPANY, total: 190, expense_date: TODAY_FIXTURE_DAY, status: 'paid', cost_class: 'employee', employee_cost_type: 'super' },
  { id: 'ex-draft', company_id: TODAY_FIXTURE_COMPANY, total: 300, expense_date: TODAY_FIXTURE_DAY, status: 'draft', cost_class: 'overhead', employee_cost_type: null },
  { id: 'ex-foreign', company_id: TODAY_FIXTURE_OTHER, total: 900, expense_date: TODAY_FIXTURE_DAY, status: 'paid', cost_class: 'cogs', employee_cost_type: null },
];

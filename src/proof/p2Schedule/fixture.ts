// K0 SCHEDULE_FIXTURE: the signed mockup week, frozen Monday 19 Oct 2026 13:40.
// 4 crews, 18 on the board, 4 need crew, 3 undated, plus the named card types.

export type Row = Readonly<Record<string, unknown>>;

const COMPANY_ID = '40183ed1-8b95-49fd-a55e-571b379b0f49';
export const DEAN = '8fac7109-aafa-4edb-afed-563db6553bfa';
export const MAYA = 'ada57004-1e9f-4d82-b3c7-85ae4f07b7b1';
export const CHRIS = '11111111-1111-4111-8111-111111111111';
export const SAM = '22222222-2222-4222-8222-222222222222';

export const JOB_IDS = {
  twoCrew: 'aaaaaaaa-0036-4000-8000-000000000036',
  longRef: 'aaaaaaaa-0141-4000-8000-000000000141',
  ready: 'aaaaaaaa-0050-4000-8000-000000000050',
  done: 'aaaaaaaa-0051-4000-8000-000000000051',
  parent: 'aaaaaaaa-0080-4000-8000-000000000080',
  child: 'aaaaaaaa-0081-4000-8000-000000000081',
  weekend: 'aaaaaaaa-0060-4000-8000-000000000060',
  untimed: 'aaaaaaaa-0061-4000-8000-000000000061',
  need1: 'aaaaaaaa-0062-4000-8000-000000000062',
  need2: 'aaaaaaaa-0063-4000-8000-000000000063',
  progress: 'aaaaaaaa-0064-4000-8000-000000000064',
  fillA: 'aaaaaaaa-0065-4000-8000-000000000065',
  fillB: 'aaaaaaaa-0066-4000-8000-000000000066',
  fillC: 'aaaaaaaa-0067-4000-8000-000000000067',
  fillD: 'aaaaaaaa-0068-4000-8000-000000000068',
  cancelled: 'aaaaaaaa-0099-4000-8000-000000000099',
  undated1: 'aaaaaaaa-0048-4000-8000-000000000048',
  undated2: 'aaaaaaaa-0049-4000-8000-000000000049',
  undated3: 'aaaaaaaa-0052-4000-8000-000000000052',
  quotedOpen: 'aaaaaaaa-0202-4000-8000-000000000202',
  spaceCrew: 'aaaaaaaa-0203-4000-8000-000000000203',
  cancelOpen: 'aaaaaaaa-0204-4000-8000-000000000204',
  longDay: 'aaaaaaaa-0205-4000-8000-000000000205',
  quotedCrew: 'aaaaaaaa-0206-4000-8000-000000000206',
  crewString: 'aaaaaaaa-0207-4000-8000-000000000207',
  crewObject: 'aaaaaaaa-0208-4000-8000-000000000208',
  crewNumber: 'aaaaaaaa-0209-4000-8000-000000000209',
  crewListNum: 'aaaaaaaa-0210-4000-8000-000000000210',
  crewListObj: 'aaaaaaaa-0211-4000-8000-000000000211',
} as const;

const C = {
  luke: '3a1b0c2d-1111-4111-8111-000000000001',
  nora: '4e5dd5b9-e8ca-43e4-9645-99acc56d8aae',
  alex: 'dcf71a24-7b96-482c-ae9d-7cb5724476cf',
  priya: '3f8c1d7a-f9d5-4ba9-9bd6-218911349ce1',
};

const STAFFORD = '12 Stafford Rd, Stafford QLD 4053';
const WAVELL = '8 Edinburgh Castle Rd, Wavell Heights QLD 4012';
const KEDRON = '14 Kedron Brook Rd, Wilston QLD 4051';

type JobInput = {
  id: string;
  job_number: number;
  title: string;
  client_id: string | null;
  scheduled_date?: string | null;
  start_time?: string | null;
  end_time?: string | null;
  status?: string;
  address?: string | null;
  assigned_team?: unknown;
  description?: string | null;
  parent_job_id?: string | null;
  cost_code?: string | null;
};

const job = (j: JobInput): Row => ({
  company_id: COMPANY_ID,
  description: null,
  status: 'scheduled',
  priority: 'medium',
  scheduled_date: null,
  start_time: null,
  end_time: null,
  address: null,
  assigned_team: [],
  inspection_id: null,
  created_by: DEAN,
  created_at: '2026-10-06T12:00:00+00:00',
  updated_at: '2026-10-18T22:00:00+00:00',
  color: null,
  budget: null,
  parent_job_id: null,
  cost_code: null,
  dispatch_ready: false,
  dispatch_version: 1,
  required_crew_count: 0,
  last_dispatch_override_at: null,
  last_dispatch_override_reason: null,
  created_via: 'human',
  automation_ref: null,
  creator_name_snapshot: 'Dean Walsh',
  ...j,
});

export const JOBS: readonly Row[] = [
  job({
    id: JOB_IDS.twoCrew,
    job_number: 36,
    title: 'Switchboard upgrade two-crew',
    client_id: C.nora,
    scheduled_date: '2026-10-19',
    start_time: '07:00:00',
    end_time: '10:30:00',
    address: STAFFORD,
    assigned_team: [DEAN, MAYA],
  }),
  job({
    id: JOB_IDS.longRef,
    job_number: 141,
    cost_code: 'A',
    title: 'Long ref card for the week board that must keep #0141.A whole while the title owns the ellipsis on a narrow weekend column',
    client_id: C.priya,
    scheduled_date: '2026-10-19',
    start_time: '09:00:00',
    end_time: '11:00:00',
    address: KEDRON,
    assigned_team: [CHRIS],
  }),
  job({
    id: JOB_IDS.ready,
    job_number: 50,
    title: 'Completed uninvoiced mixer',
    client_id: C.nora,
    status: 'completed',
    scheduled_date: '2026-10-19',
    start_time: '11:30:00',
    end_time: '12:30:00',
    address: STAFFORD,
    assigned_team: [DEAN],
  }),
  job({
    id: JOB_IDS.done,
    job_number: 51,
    title: 'Completed with draft invoice',
    client_id: C.alex,
    status: 'completed',
    scheduled_date: '2026-10-19',
    start_time: '12:00:00',
    end_time: '13:00:00',
    assigned_team: [MAYA],
  }),
  job({
    id: JOB_IDS.child,
    job_number: 81,
    parent_job_id: JOB_IDS.parent,
    cost_code: '01',
    title: 'Child visit of parent 80',
    client_id: C.alex,
    status: 'completed',
    scheduled_date: '2026-10-19',
    start_time: '15:00:00',
    end_time: '16:00:00',
    assigned_team: [SAM],
  }),
  job({
    id: JOB_IDS.untimed,
    job_number: 61,
    title: 'Untimed booked Monday',
    client_id: C.nora,
    scheduled_date: '2026-10-19',
    assigned_team: [DEAN],
  }),
  job({
    id: JOB_IDS.progress,
    job_number: 64,
    title: 'Live progress on Dean',
    client_id: C.alex,
    status: 'in_progress',
    scheduled_date: '2026-10-20',
    start_time: '08:00:00',
    end_time: '10:00:00',
    assigned_team: [DEAN],
  }),
  job({
    id: JOB_IDS.fillA,
    job_number: 65,
    title: 'Tuesday filler A',
    client_id: C.priya,
    scheduled_date: '2026-10-20',
    start_time: '10:30:00',
    end_time: '12:00:00',
    assigned_team: [MAYA],
  }),
  job({
    id: JOB_IDS.fillD,
    job_number: 68,
    title: 'Tuesday filler D',
    client_id: C.nora,
    scheduled_date: '2026-10-20',
    start_time: '13:00:00',
    end_time: '15:00:00',
    assigned_team: [CHRIS],
  }),
  job({
    id: JOB_IDS.need1,
    job_number: 62,
    title: 'Need crew scheduled',
    client_id: C.luke,
    scheduled_date: '2026-10-21',
    start_time: '08:00:00',
    end_time: '10:00:00',
    address: WAVELL,
  }),
  job({
    id: JOB_IDS.fillB,
    job_number: 66,
    title: 'Wednesday filler B',
    client_id: C.alex,
    scheduled_date: '2026-10-21',
    start_time: '11:00:00',
    end_time: '13:00:00',
    assigned_team: [SAM],
  }),
  job({
    id: JOB_IDS.need2,
    job_number: 63,
    title: 'Need crew in progress',
    client_id: C.luke,
    status: 'in_progress',
    scheduled_date: '2026-10-22',
    start_time: '09:00:00',
    end_time: '11:00:00',
    address: WAVELL,
  }),
  job({
    id: JOB_IDS.fillC,
    job_number: 67,
    title: 'Thursday filler C',
    client_id: C.priya,
    scheduled_date: '2026-10-22',
    start_time: '12:00:00',
    end_time: '14:00:00',
    assigned_team: [MAYA],
  }),
  job({
    id: JOB_IDS.weekend,
    job_number: 60,
    title: 'Saturday weekend job',
    client_id: C.nora,
    scheduled_date: '2026-10-24',
    start_time: '08:00:00',
    end_time: '10:00:00',
    address: STAFFORD,
    assigned_team: [CHRIS],
  }),
  job({
    id: JOB_IDS.cancelled,
    job_number: 99,
    title: 'Cancelled dated job',
    client_id: C.alex,
    status: 'cancelled',
    scheduled_date: '2026-10-19',
    start_time: '16:00:00',
    end_time: '17:00:00',
    assigned_team: [CHRIS],
  }),
  job({
    id: JOB_IDS.parent,
    job_number: 80,
    title: 'Parent of child visit',
    client_id: C.alex,
    status: 'completed',
  }),
  job({
    id: JOB_IDS.undated1,
    job_number: 48,
    title: 'Undated Luke Ferris',
    client_id: C.luke,
    address: WAVELL,
  }),
  job({
    id: JOB_IDS.undated2,
    job_number: 49,
    title: 'Undated second',
    client_id: C.nora,
  }),
  job({
    id: JOB_IDS.undated3,
    job_number: 52,
    title: 'Undated third',
    client_id: C.priya,
    status: 'in_progress',
  }),
  job({
    id: JOB_IDS.quotedOpen,
    job_number: 202,
    title: 'Quoted crewless switchboard',
    client_id: C.luke,
    status: 'quoted',
    scheduled_date: '2026-10-22',
    address: WAVELL,
  }),
  job({
    id: JOB_IDS.spaceCrew,
    job_number: 203,
    title: 'Whitespace crew only',
    client_id: C.alex,
    scheduled_date: '2026-10-20',
    start_time: '16:00:00',
    end_time: '17:00:00',
    assigned_team: [' '],
  }),
  job({
    id: JOB_IDS.cancelOpen,
    job_number: 204,
    title: 'Cancelled crewless dated',
    client_id: C.nora,
    status: 'cancelled',
    scheduled_date: '2026-10-23',
  }),
  job({
    id: JOB_IDS.longDay,
    job_number: 205,
    title: 'Long day range',
    client_id: C.nora,
    scheduled_date: '2026-10-21',
    start_time: '07:30:00',
    end_time: '16:00:00',
    assigned_team: [DEAN],
  }),
  job({
    id: JOB_IDS.quotedCrew,
    job_number: 206,
    title: 'Quoted with crew',
    client_id: C.priya,
    status: 'quoted',
    scheduled_date: '2026-10-23',
    start_time: '10:00:00',
    end_time: '11:00:00',
    assigned_team: [DEAN],
  }),
];

export const MALFORMED_CREW_JOBS: readonly Row[] = [
  job({
    id: JOB_IDS.crewString,
    job_number: 207,
    title: 'Crew as string',
    client_id: C.luke,
    scheduled_date: '2026-10-19',
    start_time: '08:00:00',
    end_time: '09:00:00',
    assigned_team: 'dean',
  }),
  job({
    id: JOB_IDS.crewObject,
    job_number: 208,
    title: 'Crew as object',
    client_id: C.nora,
    scheduled_date: '2026-10-20',
    start_time: '08:00:00',
    end_time: '09:00:00',
    assigned_team: { id: 'x' },
  }),
  job({
    id: JOB_IDS.crewNumber,
    job_number: 209,
    title: 'Crew as number',
    client_id: C.alex,
    scheduled_date: '2026-10-21',
    start_time: '08:00:00',
    end_time: '09:00:00',
    assigned_team: 1,
  }),
  job({
    id: JOB_IDS.crewListNum,
    job_number: 210,
    title: 'Crew as null',
    client_id: C.priya,
    scheduled_date: '2026-10-22',
    start_time: '08:00:00',
    end_time: '09:00:00',
    assigned_team: null,
  }),
  job({
    id: JOB_IDS.crewListObj,
    job_number: 211,
    title: 'Crew as whitespace',
    client_id: C.luke,
    scheduled_date: '2026-10-23',
    start_time: '08:00:00',
    end_time: '09:00:00',
    assigned_team: [' '],
  }),
];

export const MALFORMED_CREW_IDS = [
  JOB_IDS.crewString, JOB_IDS.crewObject, JOB_IDS.crewNumber, JOB_IDS.crewListNum, JOB_IDS.crewListObj,
] as const;

export const NEED_CREW_PAIR: readonly Row[] = [
  job({
    id: JOB_IDS.need1,
    job_number: 62,
    title: 'Need crew scheduled',
    client_id: C.luke,
    scheduled_date: '2026-10-21',
    start_time: '08:00:00',
    end_time: '10:00:00',
    address: WAVELL,
  }),
  job({
    id: JOB_IDS.undated3,
    job_number: 52,
    title: 'Undated in progress',
    client_id: C.priya,
    status: 'in_progress',
  }),
];

const client = (id: string, name: string, address: string | null, phone: string | null): Row => ({
  id, company_id: COMPANY_ID, name, address, phone, archived: false, email: null, contact_person: null, notes: null,
});

export const CLIENTS: readonly Row[] = [
  client(C.luke, 'Luke Ferris', WAVELL, '0400 000 000'),
  client(C.nora, 'Nora Bennett', KEDRON, '0400 000 000'),
  client(C.alex, 'Alex Rivera', '15 Queen St, Brisbane QLD 4000', '0400 000 000'),
  client(C.priya, 'Priya Shah', '22 Latrobe Tce, Paddington QLD 4064', '0400 000 000'),
];

export const MEMBERS: readonly Row[] = [
  { id: DEAN, name: 'Dean Walsh', email: 'dean@example.invalid', role: 'admin', schedule_color: '#1E4A6D' },
  { id: MAYA, name: 'Maya Chen', email: 'maya@example.invalid', role: 'member', schedule_color: null },
  { id: CHRIS, name: 'Chris Ng', email: 'chris@example.invalid', role: 'member', schedule_color: null },
  { id: SAM, name: 'Sam Patel', email: 'sam@example.invalid', role: 'member', schedule_color: '#2E75B6' },
];

export const PROFILE: Row = {
  id: DEAN,
  company_id: COMPANY_ID,
  name: 'Dean Walsh',
  email: 'dean@example.invalid',
  role: 'admin',
  schedule_color: '#1E4A6D',
};

export const COMPANY: Row = { id: COMPANY_ID, name: 'CoS Test Plumbing — delete ok', report_theme: null };

export const INVOICES: readonly Row[] = [
  { id: 'inv-draft-done', job_id: JOB_IDS.done, status: 'draft', company_id: COMPANY_ID },
  { id: 'inv-void-ready', job_id: JOB_IDS.ready, status: 'void', company_id: COMPANY_ID },
  { id: 'inv-draft-parent', job_id: JOB_IDS.parent, status: 'draft', company_id: COMPANY_ID },
];

export const TABLES: Readonly<Record<string, readonly Row[]>> = {
  jobs: JOBS,
  clients: CLIENTS,
  invoices: INVOICES,
  jha_documents: [],
  jha_take5: [],
  inspections: [],
};

export const SAVE_JOB_TITLE = 'Undated Luke Ferris';
export const SCHEDULE_FIXTURE = {
  onBoard: 18,
  needCrew: 4,
  needsDate: 3,
  crews: 4,
  whisper: '18 on the board · 4 need crew · 3 without a date',
  twoCrewRef: '#0036',
  longRef: '#0141.A',
  clock: '07:00–10:30',
} as const;

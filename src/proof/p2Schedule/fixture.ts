// Rows read from the live operator test company (40183ed1) on 2026-10-23, the data behind the before capture.
// Rendered strings are exact. Member emails are placeholders because Schedule never renders them.

export type Row = Readonly<Record<string, unknown>>;

const COMPANY_ID = '40183ed1-8b95-49fd-a55e-571b379b0f49';
const GRAFTER = '8fac7109-aafa-4edb-afed-563db6553bfa';
const INVITEE = 'ada57004-1e9f-4d82-b3c7-85ae4f07b7b1';
const C = {
  nora: '4e5dd5b9-e8ca-43e4-9645-99acc56d8aae',
  alex: 'dcf71a24-7b96-482c-ae9d-7cb5724476cf',
  sam: '008af063-7739-49d3-97dd-c2253f6b1236',
  priya: '3f8c1d7a-f9d5-4ba9-9bd6-218911349ce1',
  cos298: '116b526e-0397-40b3-b60e-2a178bf2fd3d',
  megan: '5dd46e6b-6452-4fd6-b302-04390b8e1bcb',
  owen: '7c006dee-1d37-4a7d-8418-6bab6a0d1f36',
};
const KEDRON = '14 Kedron Brook Rd, Wilston QLD 4051';
const PARENT_79 = '2485221a-d94f-4023-8067-3bd2d5d0c421';

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
  assigned_team?: string[];
  description?: string | null;
  parent_job_id?: string | null;
  cost_code?: string | null;
  budget?: number | null;
  created_by?: string | null;
  created_at?: string;
  updated_at?: string;
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
  created_by: null,
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
  creator_name_snapshot: j.created_by ? 'Grafter CoS Test' : null,
  ...j,
});

const undated = (id: string, job_number: number, title: string, client_id: string, created_by: string | null, created_at: string): Row =>
  job({ id, job_number, title, client_id, created_by, created_at, updated_at: created_at });

export const JOBS: readonly Row[] = [
  job({ id: '13ec12ff-92b3-4c25-82dd-845c9b825d21', job_number: 138, title: 'Replace leaking shower mixer — delete ok', client_id: C.nora, status: 'completed', scheduled_date: '2026-10-19', start_time: '14:00:00', end_time: '16:00:00', address: KEDRON, assigned_team: [GRAFTER], description: 'Shower mixer dripping, replace cartridge. delete ok', parent_job_id: PARENT_79, cost_code: '01', budget: -250, created_by: GRAFTER, created_at: '2026-10-18T21:39:55.829475+00:00', updated_at: '2026-10-18T21:47:23.67+00:00' }),
  job({ id: 'f543a2ef-756d-41b4-bbe5-8c6731a1423d', job_number: 20, title: 'Hours test — delete ok', client_id: C.alex, scheduled_date: '2026-10-19', assigned_team: [INVITEE], created_at: '2026-10-06T12:17:28.885014+00:00', updated_at: '2026-10-18T22:01:52.548+00:00' }),
  job({ id: '1c515a4a-1a1a-4c96-9e66-f26e9818e786', job_number: 142, title: '375 modal test — delete ok', client_id: null, scheduled_date: '2026-10-19', created_by: GRAFTER, created_at: '2026-10-18T22:02:10.591745+00:00', updated_at: '2026-10-18T22:02:10.591745+00:00' }),
  job({ id: '1396b220-b95a-48d4-a07e-b0b939639ed2', job_number: 36, title: '338 Not scheduled 1280 — delete ok', client_id: C.sam, scheduled_date: '2026-10-19', created_by: GRAFTER, created_at: '2026-10-07T01:50:24.440607+00:00', updated_at: '2026-10-18T21:28:32.409+00:00' }),
  job({ id: 'f23f8855-13f5-492b-8e44-eca85a3cfc5d', job_number: 140, title: 'Hot water tempering valve service 390 — delete ok', client_id: C.nora, scheduled_date: '2026-10-20', start_time: '10:00:00', end_time: '08:00:00', address: KEDRON, assigned_team: [GRAFTER], budget: -5000, created_by: GRAFTER, created_at: '2026-10-18T21:48:31.07278+00:00', updated_at: '2026-10-18T21:48:31.07278+00:00' }),
  job({ id: 'ef47ce56-1ded-4d84-9d5b-02c2d60ba3ad', job_number: 143, title: 'B3 sweep quote — delete ok 19 Oct 2026', client_id: C.priya, scheduled_date: '2026-10-21', start_time: '08:00:00', end_time: '10:00:00', address: '22 Latrobe Tce, Paddington QLD 4064', assigned_team: [GRAFTER], budget: 342.66, created_by: GRAFTER, created_at: '2026-10-18T22:08:32.450957+00:00', updated_at: '2026-10-18T22:08:32.450957+00:00' }),
  job({ id: '1787f968-5590-4c10-8acd-ad25270b14d9', job_number: 21, title: 'Hours test 2 — delete ok', client_id: C.alex, scheduled_date: '2026-10-21', start_time: '10:00:00', end_time: '12:00:00', assigned_team: [INVITEE], created_at: '2026-10-06T12:22:32.305431+00:00', updated_at: '2026-10-18T22:00:51.25+00:00' }),
  job({ id: 'cd5a3e5a-332a-47fe-8e5f-bde23f0f4a36', job_number: 145, title: 'Backflow annual delete ok - Wed, 21 Oct 2026', client_id: C.cos298, scheduled_date: '2026-10-21', created_by: GRAFTER, created_at: '2026-10-18T23:28:23.4906+00:00', updated_at: '2026-10-18T23:28:23.4906+00:00' }),
  job({ id: '0de8448c-6b3f-4da4-a974-f19f00be22d6', job_number: 144, title: 'B3 390 quote — delete ok', client_id: C.megan, scheduled_date: '2026-10-22', start_time: '08:00:00', end_time: '16:00:00', address: KEDRON, assigned_team: [GRAFTER], budget: 317.23, created_by: GRAFTER, created_at: '2026-10-18T22:18:31.282679+00:00', updated_at: '2026-10-18T22:18:31.282679+00:00' }),
  job({ id: 'cb02a110-b774-4c51-ac84-cf673a379f87', job_number: 32, title: 'Hours test 12 — delete ok', client_id: C.alex, scheduled_date: '2026-10-22', start_time: '09:00:00', end_time: '11:00:00', assigned_team: [GRAFTER], created_at: '2026-10-06T13:43:27.067466+00:00', updated_at: '2026-10-18T21:27:47.665+00:00' }),
  job({ id: '41c2cff5-8e5d-4fa7-8d8b-3725b101b3f7', job_number: 139, title: 'Stage 2 re-tile shower niche — delete ok', client_id: C.megan, scheduled_date: '2026-10-22', address: KEDRON, parent_job_id: PARENT_79, cost_code: '02', created_by: GRAFTER, created_at: '2026-10-18T21:43:14.173309+00:00', updated_at: '2026-10-18T21:43:14.173309+00:00' }),
  job({ id: 'c8eed2c8-e3a9-4ab8-b0c3-08a1ee47a9de', job_number: 141, title: 'Burst flexi hose under vanity 1280 — delete ok', client_id: C.owen, scheduled_date: '2026-10-23', start_time: '13:00:00', end_time: '15:00:00', address: '3 Cardigan St, Ashgrove QLD 4060', assigned_team: [INVITEE], description: 'Replace burst braided hose, check isolation valve. delete ok', cost_code: 'A$', budget: 350, created_by: GRAFTER, created_at: '2026-10-18T21:53:12.487687+00:00', updated_at: '2026-10-18T21:53:12.487687+00:00' }),
  job({ id: '66f735ec-2ed1-4c7f-9984-67ccdef4d4c8', job_number: 137, title: 'Replace kitchen mixer tap', client_id: C.megan, scheduled_date: '2026-10-23', start_time: '14:00:00', end_time: '16:00:00', address: KEDRON, assigned_team: [GRAFTER], created_by: GRAFTER, created_at: '2026-10-18T21:29:17.593676+00:00', updated_at: '2026-10-18T21:29:17.593676+00:00' }),
  undated('3e2a3ee5-570e-4822-b424-25fd17d889f2', 26, 'Hours test 6 — delete ok', C.alex, null, '2026-10-06T13:01:07.974056+00:00'),
  undated('0b7d2a4c-1cc9-4b10-9796-06a082b09a11', 39, '338 Not scheduled 375 — delete ok', C.sam, GRAFTER, '2026-10-07T01:53:06.430065+00:00'),
  undated('bb9e1bbe-47d1-4afa-9a5b-f8dcc3ef4181', 28, 'Hours test 8 — delete ok', C.alex, null, '2026-10-06T13:15:26.986754+00:00'),
  undated('4788b279-37c5-4403-8853-c75d7607e063', 25, 'Hours test 5 — delete ok', C.alex, null, '2026-10-06T13:00:59.447996+00:00'),
  undated('9fb8fb71-0f24-4c5d-8d72-1af56b22d01a', 27, 'Hours test 7 — delete ok', C.alex, null, '2026-10-06T13:15:18.851607+00:00'),
  undated('3010266c-a147-40f8-9c90-3f3637996c58', 24, 'Hours test 4 — delete ok', C.alex, null, '2026-10-06T12:49:20.726956+00:00'),
  undated('8c795510-6677-4f14-bc3c-e1d5160c44c8', 33, '332 Not scheduled prove — delete ok', C.alex, null, '2026-10-06T14:03:05.354516+00:00'),
  undated('ff3ff438-cb99-4874-80da-f2f8ba11b623', 23, 'Hours test 4 — delete ok', C.alex, null, '2026-10-06T12:48:37.936769+00:00'),
  undated('637ebf9b-3d12-43d0-bafc-1770b5f196fc', 22, 'Hours test 3 — delete ok', C.alex, null, '2026-10-06T12:38:04.60892+00:00'),
  undated('f4313782-b34e-458d-803c-4171c39faf9b', 30, 'Hours test 10 — delete ok', C.alex, null, '2026-10-06T13:25:26.544102+00:00'),
  undated('edf35e4f-6ed1-4a43-ac5f-12ed0988697f', 29, 'Hours test 9 — delete ok', C.alex, null, '2026-10-06T13:19:24.931335+00:00'),
  // Parent of the two .01/.02 jobs. Completed and undated, so neither range query returns it.
  job({ id: PARENT_79, job_number: 79, title: '1.5 hr circuit labour hour, call-out fee for Megan Lowe — delete ok', client_id: C.megan, status: 'completed' }),
];

const client = (id: string, name: string, address: string | null, phone: string | null): Row => ({
  id, company_id: COMPANY_ID, name, address, phone, archived: false, email: null,
});

export const CLIENTS: readonly Row[] = [
  client(C.cos298, 'CoS 298 Client — delete ok', null, null),
  client(C.sam, 'Sam Patel — delete ok', null, null),
  client(C.alex, 'Alex Rivera p2b-ch9t — delete ok', '15 Queen St, Brisbane QLD 4000', '0412 555 301'),
  client(C.megan, 'Megan Lowe — delete ok', KEDRON, '0400 000 123'),
  client(C.priya, 'Priya Shah — delete ok', '22 Latrobe Tce, Paddington QLD 4064', '0400 000 789'),
  client(C.nora, 'Nora Bennett — delete ok', KEDRON, '0400 000 000'),
  client(C.owen, 'Owen Price — delete ok', null, null),
];

export const MEMBERS: readonly Row[] = [
  { id: GRAFTER, name: 'Grafter CoS Test', email: 'crew-1@example.invalid', role: 'admin', schedule_color: null },
  { id: INVITEE, name: 'CoS Invitee Test', email: 'crew-2@example.invalid', role: 'member', schedule_color: null },
];

export const PROFILE: Row = {
  id: GRAFTER,
  company_id: COMPANY_ID,
  name: 'Grafter CoS Test',
  email: 'crew-1@example.invalid',
  role: 'admin',
  schedule_color: null,
};

export const COMPANY: Row = { id: COMPANY_ID, name: 'CoS Test Plumbing — delete ok', report_theme: null };

export const TABLES: Readonly<Record<string, readonly Row[]>> = {
  jobs: JOBS,
  clients: CLIENTS,
  jha_documents: [],
  jha_take5: [],
  inspections: [],
};

export const SAVE_JOB_TITLE = 'Hours test 6 — delete ok';

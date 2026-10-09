import type { JobWithClient } from '../types/crm';

/** FIX-3a LOOK only — week of Fri 9 Oct 2026 (Brisbane), 3 booked + 17 unscheduled. */
export const FIX3A_SCHEDULE_LOOK = 'fix3a-schedule';
export const FIX3A_LOOK_ANCHOR = new Date(2026, 9, 9);

const FIX3A_LOOK_DAVE = 'look-crew-dave';
const FIX3A_LOOK_JACK = 'look-crew-jack';
const FIX3A_LOOK_SAM = 'look-crew-sam';
const FIX3A_LOOK_FIT = '#DB2777';

function fix3aLookBase(
  over: Partial<JobWithClient> & Pick<JobWithClient, 'id' | 'title' | 'scheduled_date' | 'assigned_team' | 'job_number'>,
): JobWithClient {
  return {
    company_id: 'look-week-board',
    client_id: null,
    description: null,
    status: 'scheduled',
    priority: 'medium',
    start_time: '08:00',
    end_time: '16:00',
    address: '132 Ryan Road, Perth WA 6000',
    client_name: 'PWD Group',
    client_address: '132 Ryan Road, Perth WA 6000',
    inspection_id: null,
    created_by: 'look-week-board',
    created_at: '2025-03-31T00:00:00.000Z',
    updated_at: '2025-03-31T00:00:00.000Z',
    color: null,
    budget: null,
    parent_job_id: null,
    cost_code: null,
    parent_job_number: null,
    ...over,
  };
}

export const FIX3A_UNSCHEDULED_SEED: {
  title: string;
  client_name: string;
  address: string;
  status: JobWithClient['status'];
}[] = [
  { title: 'Leak under kitchen sink', client_name: 'Valley Apartments', address: '55 Vulture Street, West End QLD 4101', status: 'scheduled' },
  { title: 'Split-system regas', client_name: 'Harbour Club', address: '4 Wharf Parade, Brisbane QLD 4000', status: 'in_progress' },
  { title: 'Deck board replace', client_name: 'PWD Group', address: '22 Logan Road, Woolloongabba QLD 4102', status: 'scheduled' },
  { title: 'Emergency make-safe', client_name: 'Metro Retail', address: '90 Queen Street, Brisbane QLD 4000', status: 'in_progress' },
  { title: 'Downpipe clear-out', client_name: 'Northside Body Corp', address: '18 Ferry Street, Kangaroo Point QLD 4169', status: 'scheduled' },
  { title: 'Oven circuit check', client_name: 'Valley Apartments', address: '12 Merivale Street, South Brisbane QLD 4101', status: 'scheduled' },
  { title: 'Door closer adjust', client_name: 'Harbour Club', address: '31 Duncan Street, West End QLD 4101', status: 'in_progress' },
  { title: 'Gutter guard quote visit', client_name: 'PWD Group', address: '88 Melbourne Street, South Brisbane QLD 4101', status: 'scheduled' },
  { title: 'Tapware swap — ensuite', client_name: 'Metro Retail', address: '200 Adelaide Street, Brisbane QLD 4000', status: 'scheduled' },
  { title: 'Aircon filter service', client_name: 'Northside Body Corp', address: '6 Skyring Terrace, Newstead QLD 4006', status: 'in_progress' },
  { title: 'Stair balustrade measure', client_name: 'Valley Apartments', address: '44 Cordelia Street, South Brisbane QLD 4101', status: 'scheduled' },
  { title: 'Hot water element test', client_name: 'Harbour Club', address: '15 Boundary Street, West End QLD 4101', status: 'scheduled' },
  { title: 'Patch plaster — water stain', client_name: 'PWD Group', address: '3 Stanley Street, Woolloongabba QLD 4102', status: 'in_progress' },
  { title: 'Exhaust fan install', client_name: 'Metro Retail', address: '111 Eagle Street, Brisbane QLD 4000', status: 'scheduled' },
  { title: 'Lockset changeover', client_name: 'Northside Body Corp', address: '27 Gladstone Road, Highgate Hill QLD 4101', status: 'scheduled' },
  { title: 'Ducted return grille clean', client_name: 'Valley Apartments', address: '70 Grey Street, South Brisbane QLD 4101', status: 'in_progress' },
  { title: 'Fence post reset', client_name: 'Harbour Club', address: '9 Hockings Street, West End QLD 4101', status: 'scheduled' },
];

function fix3aUnscheduledJob(
  seed: typeof FIX3A_UNSCHEDULED_SEED[number],
  index: number,
): JobWithClient {
  return fix3aLookBase({
    id: `fix3a-unscheduled-${index + 1}`,
    job_number: 700 + index,
    title: seed.title,
    scheduled_date: null,
    assigned_team: [],
    status: seed.status,
    start_time: null,
    end_time: null,
    client_name: seed.client_name,
    address: seed.address,
    client_address: seed.address,
  });
}

export function fix3aLookJobs(): JobWithClient[] {
  const booked: JobWithClient[] = [
    fix3aLookBase({
      id: 'fix3a-booked-1',
      title: 'Heat pump service',
      scheduled_date: '2026-10-06',
      assigned_team: [FIX3A_LOOK_DAVE],
      job_number: 601,
      client_name: 'Harbour Club',
      start_time: '08:00',
      end_time: '11:30',
      address: '4 Wharf Parade, Brisbane QLD 4000',
    }),
    fix3aLookBase({
      id: 'fix3a-booked-2',
      title: 'Bathroom rough-in',
      scheduled_date: '2026-10-08',
      assigned_team: [FIX3A_LOOK_JACK],
      job_number: 602,
      client_name: 'PWD Group',
      start_time: '07:30',
      end_time: '15:00',
      address: '22 Logan Road, Brisbane QLD 4102',
    }),
    fix3aLookBase({
      id: 'fix3a-booked-3',
      title: 'Carpet stretch — level 2',
      scheduled_date: '2026-10-09',
      assigned_team: [FIX3A_LOOK_SAM],
      job_number: 603,
      client_name: 'Metro Retail',
      start_time: '09:00',
      end_time: '12:00',
      address: '90 Queen Street, Brisbane QLD 4000',
      color: FIX3A_LOOK_FIT,
    }),
  ];
  const unscheduled = FIX3A_UNSCHEDULED_SEED.map((seed, index) => fix3aUnscheduledJob(seed, index));
  return [...booked, ...unscheduled];
}

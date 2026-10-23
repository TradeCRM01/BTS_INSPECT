import { useState, useCallback, useRef, useMemo, useEffect, useLayoutEffect, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { addDays } from 'date-fns';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { AppShell } from '../components/layout/AppShell';
import { LoadingSpinner, PageError, useToast } from '../components/ui';
import { ReminderRow } from '../components/reminders/ReminderRow';
import { JobFormModal } from '../components/crm/JobFormModal';
import { deriveNudges, type Nudge, type NudgeInvoice, type NudgeQuote } from '../lib/nudges';
import { countNeedsCrew } from '../lib/needCrew';
import {
  TODAY_NUDGE_INVOICE_STATUSES,
  canSeeTodayMoney,
  fetchComingUp,
  fetchOutstanding,
  fetchReadyToInvoice,
  fetchTodayCash,
  todayCashRangeLabel,
  todayCashWindow,
  type ReadyToInvoiceJob,
  type TodayCashTotals,
  type TodayOutstandingRow,
  type TodayOutstandingTotals,
  readyToInvoiceDetail,
  visibleTodayNudges,
  visibleTodayWidgets,
} from '../lib/todayBoard';
import { todayBandFromWidth } from '../lib/todayLayout';
import { TodayBoardView } from './TodayBoardView';
import {
  canTickReminder,
  listReminderJobsById,
  listReminders,
  postponeReminder,
  quickCaptureReminder,
  reminderCrewNames,
  reminderJobLabels,
  setReminderDone,
  splitReminderLists,
  todayReminders,
  type PostponeChoice,
  type Reminder,
} from '../lib/reminders';
import { getAuditClients, getAuditDashboardWidgets, getAuditJobs, getAuditTeamMembers } from '../lib/devFieldAuditDocs';
import { pageQueryBlocked } from '../lib/devFieldAuditAuth';
import {
  DndContext, DragEndEvent, DragStartEvent, PointerSensor, useSensor, useSensors,
  useDraggable,
} from '@dnd-kit/core';
import {
  Plus, X, GripVertical, Trash2, Sparkles, MoreHorizontal,
  ChevronUp, ChevronDown,
} from 'lucide-react';
import {
  readDashboardWidgetPhoneOrder,
  sortDashboardWidgetsForView,
  swapAdjacentDashboardWidgetPhoneOrder,
} from '../lib/dashboardWidgetView';
import { WIDGET_CATEGORIES, getWidgetDef } from '../widgets/registry';
import { WidgetRenderer } from '../widgets/WidgetComponents';
import type { Json } from '../types/database';
import type { Client, Job, JobWithClient } from '../types/crm';
import { attachJobClients, hydrateJobParentNumbers } from '../lib/scheduleJobSearch';
import {
  dashboardTodayKey,
  todaysDashboardJobs,
} from '../lib/dashboardHome';
import {
  DASHBOARD_WIDGET_CANVAS_W,
  applyDashboardWidgetDrag,
  applyDashboardWidgetResize,
  clampDashboardWidgetsToCanvas,
  isRetiredDashboardWidgetType,
  measureDashboardCanvasWidth,
  pickerDashboardWidgets,
  DASHBOARD_EDIT_CHROME_TOP,
  DASHBOARD_EDIT_CHROME_BOTTOM,
  placeAddedDashboardWidget,
  repairDashboardWidgetLayout,
  defaultDashboardWidgetInserts,
  resolveDashboardWidgets,
} from '../lib/dashboardWidgets';
import type { ScheduleCrewMember } from '../lib/scheduleBoard';

interface DashboardWidget {
  id: string;
  widget_type: string;
  grid_x: number; // pixel x
  grid_y: number; // pixel y
  grid_w: number; // pixel width
  grid_h: number; // pixel height
  config: Json;
}

async function persistDashboardWidgetRepair(
  before: DashboardWidget[],
  repaired: { widgets: DashboardWidget[]; droppedIds: string[] },
  userId: string,
) {
  const afterById = new Map(repaired.widgets.map(row => [row.id, row]));
  for (const id of repaired.droppedIds) {
    const { data, error } = await supabase
      .from('dashboard_widgets')
      .delete()
      .eq('id', id)
      .eq('user_id', userId)
      .select('id');
    if (error) throw error;
    if (!data?.length) throw new Error('Dashboard widget repair delete matched 0 rows');
  }
  for (const prev of before) {
    const next = afterById.get(prev.id);
    if (!next) continue;
    if (next.grid_x === prev.grid_x && next.grid_y === prev.grid_y) continue;
    const { data, error } = await supabase
      .from('dashboard_widgets')
      .update({
        grid_x: next.grid_x,
        grid_y: next.grid_y,
        updated_at: new Date().toISOString(),
      } as never)
      .eq('id', prev.id)
      .eq('user_id', userId)
      .select('id');
    if (error) throw error;
    if (!data?.length) throw new Error('Dashboard widget repair update matched 0 rows');
  }
}

async function persistDashboardWidgetPhoneOrder(
  id: string,
  phone_order: number | undefined,
  userId: string,
) {
  const { data: live, error: readError } = await supabase
    .from('dashboard_widgets')
    .select('config')
    .eq('id', id)
    .eq('user_id', userId)
    .maybeSingle();
  if (readError) {
    console.error('Widget update failed', readError);
    return readError;
  }
  if (!live) {
    const err = new Error('Dashboard widget phone_order read matched 0 rows');
    console.error('Widget update failed', err);
    return err;
  }
  const base = live.config && typeof live.config === 'object' && !Array.isArray(live.config)
    ? { ...(live.config as Record<string, unknown>) }
    : {};
  if (phone_order === undefined) delete base.phone_order;
  else base.phone_order = phone_order;
  const { data, error } = await supabase
    .from('dashboard_widgets')
    .update({
      config: base as Json,
      updated_at: new Date().toISOString(),
    } as never)
    .eq('id', id)
    .eq('user_id', userId)
    .select('id');
  if (error) {
    console.error('Widget update failed', error);
    return error;
  }
  if (!data?.length) {
    const err = new Error('Dashboard widget phone_order update matched 0 rows');
    console.error('Widget update failed', err);
    return err;
  }
  return null;
}

const CANVAS_PAD = 16;

/** Signed dashboard frame seed — home look only, not a live company. */
const DASHBOARD_LOOK = 'dashboard';
/** Playwright: /?look=dashboard-seed — 11-widget layout with Compliance on the right edge */
const DASHBOARD_LOOK_SEED = 'dashboard-seed';
/** Playwright: /?look=dashboard-repro — live 12-widget canvas with Invoices on the right edge */
const DASHBOARD_LOOK_REPRO = 'dashboard-repro';
/** Playwright: /?auditAuth=1&look=dashboard-jack — seven-widget money-first view grid */
const DASHBOARD_LOOK_JACK_LAYOUT = 'dashboard-jack';
/** Playwright: /?auditAuth=1&look=crew-s8d-dashboard-needs — Today row Needs crew */
const CREW_S8D_DASHBOARD_NEEDS = 'crew-s8d-dashboard-needs';
const DASHBOARD_LOOK_DAVE = 'look-dash-dave';
const DASHBOARD_LOOK_JACK = 'look-dash-jack';

const DASHBOARD_LOOK_TOM = 'look-dash-tom';
const DASHBOARD_LOOK_JOSH = 'look-dash-josh';
const DASHBOARD_LOOK_DEAN = 'look-dash-dean';

function dashboardLookCrew(): ScheduleCrewMember[] {
  return [
    { id: DASHBOARD_LOOK_DAVE, name: 'Dave' },
    { id: DASHBOARD_LOOK_JACK, name: 'Jack' },
    { id: DASHBOARD_LOOK_TOM, name: 'Tom Reid' },
    { id: DASHBOARD_LOOK_JOSH, name: 'Josh Perm' },
    { id: DASHBOARD_LOOK_DEAN, name: 'Dean Hollis' },
  ];
}

/** Same calendar day as the signed dashboard LOOK frames. */
const DASHBOARD_LOOK_DAY = '2026-10-19';

function dashboardLookNow(): Date {
  return new Date(2026, 9, 19, 13, 40, 0);
}

const DASHBOARD_LOOK_OWNER = '00000000-0000-0000-0000-000000000002';

function dashboardLookReminders(ownerId: string): Reminder[] {
  const dueAt = new Date(2026, 9, 19, 8, 0, 0).toISOString();
  const row = (id: string, title: string): Reminder => ({
    id,
    ownerId,
    title,
    details: '',
    dueAt,
    jobId: null,
    relatedHref: null,
    completed: false,
    completedAt: null,
    visibility: 'private',
    taggedUserIds: [],
    createdAt: dueAt,
  });
  return [
    row('look-rem-mia', 'Call Mia about quote follow-up before Friday'),
    row('look-rem-0137', '#0137 · Replace kitchen mixer today'),
    row('look-rem-megan', 'Ring Megan re valve Tuesday morning on site'),
  ];
}

function dashboardLookWidgets(): DashboardWidget[] {
  return [
    {
      id: 'look-widget-upcoming-jobs',
      widget_type: 'upcoming_jobs',
      grid_x: 0,
      grid_y: 0,
      grid_w: 360,
      grid_h: 280,
      config: {
        lookJobs: [
          {
            id: 'look-w-job-northside',
            title: 'Site labour',
            scheduled_date: DASHBOARD_LOOK_DAY,
            start_time: '07:30',
            client_id: 'look-w-client-northside',
            client_name: 'Northside Electrical',
            priority: 'medium',
          },
          {
            id: 'look-w-job-harbour',
            title: 'Warehouse lights',
            scheduled_date: DASHBOARD_LOOK_DAY,
            start_time: '09:00',
            client_id: 'look-w-client-harbour',
            client_name: 'Harbour Lights',
            priority: 'medium',
          },
        ],
      },
    },
    {
      id: 'look-widget-outstanding-invoices',
      widget_type: 'outstanding_invoices',
      grid_x: 376,
      grid_y: 0,
      grid_w: 280,
      grid_h: 280,
      config: {
        lookInvoices: {
          count: 1,
          outstanding: 836,
          overdue: 0,
          recent: [
            {
              id: 'look-w-inv-2002',
              invoice_number: 2002,
              status: 'sent',
              total: 836,
              due_date: '2026-09-07',
            },
          ],
        },
      },
    },
    {
      id: 'look-widget-compliance',
      widget_type: 'compliance_deadlines',
      grid_x: 672,
      grid_y: 0,
      grid_w: 320,
      grid_h: 280,
      config: {
        lookCompliance: {
          upcoming: [
            {
              id: 'look-w-comp-licence',
              title: 'Licence EC-9988',
              next_due_date: '2026-09-18',
            },
          ],
          overdue: [],
        },
      },
    },
  ];
}

function dashboardSeedLookWidgets(): DashboardWidget[] {
  const rows: DashboardWidget[] = dashboardLookWidgets().map(row => ({ ...row }));
  const extra = [
    'weather',
    'clock',
    'calendar',
    'calculator',
    'quick_actions',
    'pending_reports',
    'agent_reminders',
    'ai_agent',
    'kpi_scorecard',
  ] as const;
  for (const type of extra) {
    const placed = placeAddedDashboardWidget(rows, type);
    if (!placed) continue;
    rows.push({
      id: `seed-${type}`,
      widget_type: type,
      ...placed,
      config: {} as Json,
    });
  }
  return rows;
}

function dashboardReproLookWidgets(): DashboardWidget[] {
  const blank = (id: string, widget_type: string, grid_x: number, grid_y: number, grid_w: number, grid_h: number): DashboardWidget => ({
    id, widget_type, grid_x, grid_y, grid_w, grid_h, config: {} as Json,
  });
  return [
    blank('w-jobs', 'upcoming_jobs', 20, 20, 390, 270),
    blank('w-weather1', 'weather', 540, 20, 260, 270),
    blank('w-weather2', 'weather', 20, 380, 260, 270),
    blank('w-weather3', 'weather', 410, 380, 260, 270),
    blank('w-invoices', 'outstanding_invoices', 800, 380, 260, 180),
    blank('w-compliance', 'compliance_deadlines', 20, 740, 390, 270),
    blank('w-pending', 'pending_reports', 540, 740, 390, 180),
    blank('w-clock', 'clock', 20, 1030, 260, 180),
    blank('w-calendar', 'calendar', 410, 1030, 390, 270),
    blank('w-calculator', 'calculator', 20, 1320, 260, 320),
    blank('w-quick', 'quick_actions', 410, 1320, 260, 270),
    blank('w-kpi', 'kpi_scorecard', 800, 1030, 390, 270),
  ];
}

function dashboardJackLookWidgets(): DashboardWidget[] {
  const seed = dashboardLookWidgets();
  const upcomingCfg = seed.find(w => w.widget_type === 'upcoming_jobs')?.config ?? {};
  const complianceCfg = seed.find(w => w.widget_type === 'compliance_deadlines')?.config ?? {};
  const place = (id: string, widget_type: string, config: Record<string, unknown> = {}): DashboardWidget => ({
    id,
    widget_type,
    grid_x: 0,
    grid_y: 0,
    grid_w: 300,
    grid_h: 200,
    config: config as Json,
  });
  return [
    place('look-jack-outstanding', 'outstanding_invoices', {
      lookInvoices: {
        count: 2,
        outstanding: 1840,
        overdue: 420,
        recent: [
          {
            id: 'look-jack-inv-sent',
            invoice_number: 2002,
            status: 'sent',
            total: 836,
            due_date: '2026-09-07',
          },
          {
            id: 'look-jack-inv-overdue',
            invoice_number: 2003,
            status: 'overdue',
            total: 1004,
            due_date: '2026-08-28',
          },
        ],
      },
    }),
    place('look-jack-cash', 'cash_flow'),
    place('look-jack-revenue', 'revenue_overview'),
    place('look-jack-upcoming', 'upcoming_jobs', upcomingCfg as Record<string, unknown>),
    place('look-jack-compliance', 'compliance_deadlines', complianceCfg as Record<string, unknown>),
    place('look-jack-kpi', 'kpi_scorecard'),
    place('look-jack-team', 'team_activity'),
  ];
}

function dashboardLookJobs(needsCrewOnly = false): JobWithClient[] {
  const day = DASHBOARD_LOOK_DAY;
  const stamp = '2026-10-19T03:40:00.000Z';
  const base = {
    company_id: 'look-dashboard',
    client_id: null as string | null,
    description: null as string | null,
    priority: 'medium' as const,
    inspection_id: null as string | null,
    created_by: DASHBOARD_LOOK_DAVE,
    created_at: stamp,
    updated_at: stamp,
    color: null as string | null,
    budget: null as number | null,
    parent_job_id: null as string | null,
    cost_code: null as string | null,
  };
  if (needsCrewOnly) {
    return [{
      ...base,
      id: 'look-dash-needs-crew',
      title: 'Crew status frame',
      status: 'scheduled',
      scheduled_date: day,
      start_time: '08:00',
      end_time: '12:00',
      address: '12 Workshop Rd, Perth WA 6000',
      assigned_team: [],
      job_number: 88,
      client_name: 'Northside Electrical',
    }];
  }
  return [
    {
      ...base,
      id: 'look-dash-northside',
      title: 'Site labour',
      status: 'in_progress',
      scheduled_date: day,
      start_time: '07:30',
      end_time: '16:00',
      address: '12 Workshop Rd, Perth WA 6000',
      assigned_team: [DASHBOARD_LOOK_DAVE],
      job_number: 42,
      client_name: 'Northside Electrical',
    },
    {
      ...base,
      id: 'look-dash-harbour',
      title: 'Warehouse lights',
      status: 'scheduled',
      scheduled_date: day,
      start_time: '09:00',
      end_time: '12:00',
      address: '8 Wharf St, Fremantle WA 6160',
      assigned_team: [DASHBOARD_LOOK_JACK],
      job_number: 43,
      client_name: 'Harbour Lights',
    },
    {
      ...base,
      id: 'look-dash-need-crew',
      title: 'Workshop callout',
      status: 'scheduled',
      scheduled_date: day,
      start_time: '13:00',
      end_time: '15:00',
      address: '4 Depot St, Perth WA 6000',
      assigned_team: [],
      job_number: 44,
      client_name: 'Depot Mechanical',
    },
    {
      ...base,
      id: 'look-dash-no-date',
      title: 'Waiting on a date',
      status: 'scheduled',
      scheduled_date: null,
      start_time: null,
      end_time: null,
      address: '9 Yard Rd, Perth WA 6000',
      assigned_team: [],
      job_number: 45,
      client_name: 'Yard Services',
    },
    {
      ...base,
      id: 'look-dash-on-hold',
      title: 'Hold for parts',
      status: 'on_hold' as Job['status'],
      scheduled_date: day,
      start_time: '16:00',
      end_time: '17:00',
      address: '2 Hold St, Perth WA 6000',
      assigned_team: [' '],
      job_number: 46,
      client_name: 'Hold Mechanical',
    },
    {
      ...base,
      id: 'look-dash-awaiting',
      title: 'Parts on order',
      status: 'awaiting_parts' as Job['status'],
      scheduled_date: day,
      start_time: '15:00',
      end_time: '16:00',
      address: '47 Parts Rd, Perth WA 6000',
      assigned_team: [DASHBOARD_LOOK_DAVE],
      job_number: 47,
      client_name: 'Parts Electrical',
    },
    {
      ...base,
      id: 'look-dash-malformed-string',
      title: 'Malformed string crew',
      status: 'scheduled',
      scheduled_date: day,
      start_time: '09:30',
      end_time: '10:00',
      address: '1 Bad St, Perth WA 6000',
      assigned_team: 'dave' as unknown as string[],
      job_number: 48,
      client_name: 'Malformed Co',
    },
    {
      ...base,
      id: 'look-dash-malformed-object',
      title: 'Malformed object crew',
      status: 'scheduled',
      scheduled_date: day,
      start_time: '10:00',
      end_time: '10:30',
      address: '2 Bad St, Perth WA 6000',
      assigned_team: { a: 1 } as unknown as string[],
      job_number: 49,
      client_name: 'Malformed Co',
    },
  ];
}

function dashboardLookCash(): TodayCashTotals {
  const todayKey = DASHBOARD_LOOK_DAY;
  const { from, to } = todayCashWindow(todayKey);
  const amounts = [
    { moneyIn: 800, moneyOut: 100 },
    { moneyIn: 200, moneyOut: 400 },
    { moneyIn: 900, moneyOut: 200 },
    { moneyIn: 700, moneyOut: 300 },
    { moneyIn: 100, moneyOut: 50 },
    { moneyIn: 0, moneyOut: 0 },
    { moneyIn: 514.3, moneyOut: 812.75 },
  ];
  const days = amounts.map((row, i) => {
    const date = new Date(2026, 9, 13 + i);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    return { date: key, ...row };
  });
  return {
    moneyIn: 4214.3,
    moneyOut: 1862.75,
    net: 2351.55,
    from,
    to,
    rangeLabel: todayCashRangeLabel(from, to),
    days,
  };
}

function dashboardLookOutstanding(): TodayOutstandingTotals & { display: Array<TodayOutstandingRow & { client_name?: string | null }> } {
  return {
    outstanding: 3579.65,
    overdue: 462,
    count: 3,
    display: [
      { id: 'look-inv-1', invoice_number: 1112, status: 'sent', total: 1929.65, amount_paid: 0, due_date: '2026-10-30', created_at: '2026-10-02', client_id: 'c1', client_name: 'Sarah Whitfield' },
      { id: 'look-inv-2', invoice_number: 1110, status: 'sent', total: 1188, amount_paid: 0, due_date: '2026-10-23', created_at: '2026-10-01', client_id: 'c2', client_name: 'Gympie Rd Dental' },
      { id: 'look-inv-3', invoice_number: 108, status: 'overdue', total: 462, amount_paid: 0, due_date: '2026-10-09', created_at: '2026-09-01', client_id: 'c3', client_name: 'Stafford Bowls Club' },
    ],
  };
}

function dashboardLookReady(): ReadyToInvoiceJob[] {
  return [
    { id: 'look-ready-36', job_number: 36, title: 'Blocked sewer', scheduled_date: DASHBOARD_LOOK_DAY, client_id: null, kind: 'standalone' },
    { id: 'look-ready-37', job_number: 37, title: 'Leaking mixer', scheduled_date: DASHBOARD_LOOK_DAY, client_id: null, kind: 'standalone' },
  ];
}

function dashboardLookComingUp(): Array<JobWithClient> {
  const stamp = '2026-10-19T03:40:00.000Z';
  const base = {
    company_id: 'look-dashboard',
    client_id: null as string | null,
    description: null as string | null,
    priority: 'medium' as const,
    inspection_id: null as string | null,
    created_by: DASHBOARD_LOOK_DAVE,
    created_at: stamp,
    updated_at: stamp,
    color: null as string | null,
    budget: null as number | null,
    parent_job_id: null as string | null,
    cost_code: null as string | null,
    status: 'scheduled' as const,
  };
  return [
    {
      ...base,
      id: 'look-coming-cistern',
      title: 'Toilet cistern replacement',
      scheduled_date: '2026-10-20',
      start_time: '07:30',
      end_time: '09:00',
      address: '12 Gwen St, Kedron QLD 4031',
      assigned_team: [DASHBOARD_LOOK_TOM],
      job_number: 40,
      client_name: 'Gwen Albright',
    },
    {
      ...base,
      id: 'look-coming-drain',
      title: 'Blocked kitchen drain',
      scheduled_date: '2026-10-20',
      start_time: '12:00',
      end_time: '13:30',
      address: '8 Luke St, Wavell Heights QLD 4012',
      assigned_team: [DASHBOARD_LOOK_JOSH],
      job_number: 41,
      client_name: 'Luke Ferris',
    },
    {
      ...base,
      id: 'look-coming-gas',
      title: 'Gas cooktop install',
      scheduled_date: '2026-10-21',
      start_time: '08:00',
      end_time: '10:00',
      address: '4 Priya St, Stafford QLD 4053',
      assigned_team: [DASHBOARD_LOOK_DEAN],
      job_number: 50,
      client_name: 'Priya Shah',
    },
  ];
}

type DashboardNudgeData = { jobs: JobWithClient[]; quotes: NudgeQuote[]; invoices: NudgeInvoice[] };
type ClientRef = { client_id: string | null };
type NudgeClient = Pick<Client, 'id' | 'name' | 'phone' | 'address'>;

function withClientName<T extends ClientRef>(row: T, names: Map<string, string>): T & { client_name: string | null } {
  return { ...row, client_name: row.client_id ? names.get(row.client_id) ?? null : null };
}

/** Today's and tomorrow's jobs, sent quotes, and unpaid invoices, each carrying its client name. */
export async function loadDashboardNudgeData(todayKey: string, tomorrowKey: string): Promise<DashboardNudgeData> {
  const [jobsRes, quotesRes, invoicesRes] = await Promise.all([
    supabase
      .from('jobs')
      .select('*')
      .gte('scheduled_date', todayKey)
      .lte('scheduled_date', tomorrowKey),
    supabase
      .from('quotes')
      .select('id, quote_number, status, updated_at, sent_at, chased_at, validity_date, total, client_id')
      .eq('status', 'sent'),
    supabase
      .from('invoices')
      .select('id, invoice_number, status, due_date, updated_at, total, chased_at, client_id')
      .in('status', [...TODAY_NUDGE_INVOICE_STATUSES]),
  ]);
  if (jobsRes.error) throw jobsRes.error;
  if (quotesRes.error) throw quotesRes.error;
  if (invoicesRes.error) throw invoicesRes.error;
  const jobs = (jobsRes.data ?? []) as Job[];
  const quotes = (quotesRes.data ?? []) as (NudgeQuote & ClientRef)[];
  const invoices = (invoicesRes.data ?? []) as (NudgeInvoice & ClientRef)[];

  const clientIds = [...new Set([...jobs, ...quotes, ...invoices].map(r => r.client_id).filter(Boolean))] as string[];
  let clients: NudgeClient[] = [];
  if (clientIds.length > 0) {
    const { data, error } = await supabase
      .from('clients')
      .select('id, name, phone, address')
      .in('id', clientIds);
    if (error) throw error;
    clients = (data ?? []) as NudgeClient[];
  }
  const names = new Map(clients.map(c => [c.id, c.name]));
  return {
    jobs: attachJobClients(jobs, clients),
    quotes: quotes.map(q => withClientName(q, names)),
    invoices: invoices.map(i => withClientName(i, names)),
  };
}

export function DashboardPage() {
  const { profile, company } = useAuth();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const lookParam = (import.meta.env.DEV || import.meta.env.VITE_LOOK_PROOF === '1') ? searchParams.get('look') : null;
  const lookCrewS8dDashboard = lookParam === CREW_S8D_DASHBOARD_NEEDS;
  const lookDashboardJack = lookParam === DASHBOARD_LOOK_JACK_LAYOUT;
  const lookDashboardSeed = lookParam === DASHBOARD_LOOK_SEED;
  const lookDashboardRepro = lookParam === DASHBOARD_LOOK_REPRO;
  const lookDashboard = lookParam === DASHBOARD_LOOK
    || lookCrewS8dDashboard
    || lookDashboardJack
    || lookDashboardSeed
    || lookDashboardRepro;
  const [editMode, setEditMode] = useState(false);
  const [showJobForm, setShowJobForm] = useState(false);
  const [viewportW, setViewportW] = useState(() => (typeof window === 'undefined' ? 1280 : window.innerWidth));
  const [clock, setClock] = useState(() => new Date());
  const [showPicker, setShowPicker] = useState(false);
  const [addingWidget, setAddingWidget] = useState(false);
  const addingWidgetRef = useRef(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const widgetsBoxRef = useRef<HTMLDivElement>(null);
  const [canvasW, setCanvasW] = useState(DASHBOARD_WIDGET_CANVAS_W);
  const now = lookDashboard ? dashboardLookNow() : clock;
  const todayKey = dashboardTodayKey(now);
  const tomorrowKey = dashboardTodayKey(addDays(now, 1));
  const { showToast } = useToast();
  const todayBand = todayBandFromWidth(viewportW);

  useEffect(() => {
    const onResize = () => setViewportW(window.innerWidth);
    onResize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    if (lookDashboard) return;
    const id = window.setInterval(() => setClock(new Date()), 60_000);
    return () => window.clearInterval(id);
  }, [lookDashboard]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  const { data: widgets, isLoading: widgetsLoading, error } = useQuery<DashboardWidget[]>({
    queryKey: ['dashboard-widgets'],
    queryFn: async () => {
      if (lookDashboardSeed) return repairDashboardWidgetLayout(dashboardSeedLookWidgets()).widgets;
      if (lookDashboardRepro) return repairDashboardWidgetLayout(dashboardReproLookWidgets()).widgets;
      if (lookDashboardJack) return repairDashboardWidgetLayout(dashboardJackLookWidgets()).widgets;
      if (lookDashboard) return repairDashboardWidgetLayout(dashboardLookWidgets()).widgets;
      const mock = getAuditDashboardWidgets();
      if (mock) return repairDashboardWidgetLayout(mock as DashboardWidget[]).widgets;
      if (!profile?.id) return [];

      const loadRows = async (): Promise<DashboardWidget[]> => {
        const { data, error } = await supabase
          .from('dashboard_widgets')
          .select('id, widget_type, grid_x, grid_y, grid_w, grid_h, config')
          .order('grid_y', { ascending: true })
          .order('id', { ascending: true });
        if (error) throw error;
        return (data ?? []) as DashboardWidget[];
      };

      const rows = await resolveDashboardWidgets<DashboardWidget>({
        loadRows,
        loadSeeded: async () => {
          const { data, error } = await supabase
            .from('profiles')
            .select('dashboard_widgets_seeded')
            .eq('id', profile.id)
            .maybeSingle();
          if (error) throw error;
          return !!data?.dashboard_widgets_seeded;
        },
        claimSeed: async () => {
          const { data, error } = await supabase
            .from('profiles')
            .update({ dashboard_widgets_seeded: true } as never)
            .eq('id', profile.id)
            .eq('dashboard_widgets_seeded', false)
            .select('id')
            .maybeSingle();
          if (error) throw error;
          return !!data?.id;
        },
        insertDefaults: async () => {
          const { data, error } = await supabase
            .from('dashboard_widgets')
            .insert(defaultDashboardWidgetInserts() as never)
            .select('id, widget_type, grid_x, grid_y, grid_w, grid_h, config');
          if (error) throw error;
          return (data ?? []) as DashboardWidget[];
        },
        releaseSeed: async () => {
          const { error } = await supabase
            .from('profiles')
            .update({ dashboard_widgets_seeded: false } as never)
            .eq('id', profile.id)
            .eq('dashboard_widgets_seeded', true);
          if (error) throw error;
        },
        markSeeded: async () => {
          const { error } = await supabase
            .from('profiles')
            .update({ dashboard_widgets_seeded: true } as never)
            .eq('id', profile.id)
            .eq('dashboard_widgets_seeded', false);
          if (error) throw error;
        },
      });
      const repaired = repairDashboardWidgetLayout(rows);
      if (repaired.changed) {
        try {
          await persistDashboardWidgetRepair(rows, repaired, profile.id);
        } catch (err) {
          console.error('Dashboard widget repair write failed', err);
        }
      }
      return repaired.widgets;
    },
    enabled: !!profile,
  });

  useLayoutEffect(() => {
    const node = widgetsBoxRef.current;
    const report = () => {
      const next = measureDashboardCanvasWidth(canvasRef.current, widgetsBoxRef.current);
      setCanvasW(prev => (prev === next ? prev : next));
    };
    report();
    if (!node || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(report);
    observer.observe(node);
    return () => observer.disconnect();
  }, [editMode, widgetsLoading, widgets?.length]);

  const { data: teamMembers } = useQuery<ScheduleCrewMember[]>({
    queryKey: ['dashboard-today-crew', lookDashboard],
    queryFn: async () => {
      if (lookDashboard) return dashboardLookCrew();
      const mock = getAuditTeamMembers();
      if (mock) return mock.map(m => ({ id: m.id, name: m.name }));
      if (!profile?.company_id) return [];
      const { data, error } = await supabase.rpc('get_company_members', {
        p_company_id: profile.company_id,
      });
      if (error) throw error;
      return (data ?? []).map((m: { id: string; name: string }) => ({
        id: m.id,
        name: m.name,
      }));
    },
    enabled: !!profile,
  });

  const { data: todayJobs, isLoading: jobsLoading, error: jobsError } = useQuery<JobWithClient[]>({
    queryKey: ['dashboard-today-jobs', todayKey, lookDashboard],
    queryFn: async () => {
      if (lookDashboard) return dashboardLookJobs(lookCrewS8dDashboard);
      const mock = getAuditJobs();
      if (mock) {
        return todaysDashboardJobs(attachJobClients(mock as Job[], getAuditClients() ?? []));
      }
      const [dayRes, onSiteRes] = await Promise.all([
        supabase
          .from('jobs')
          .select('*')
          .gte('scheduled_date', todayKey)
          .lte('scheduled_date', todayKey),
        supabase
          .from('jobs')
          .select('*')
          .eq('status', 'in_progress'),
      ]);
      if (dayRes.error) throw dayRes.error;
      if (onSiteRes.error) throw onSiteRes.error;

      const byId = new Map<string, Job>();
      for (const row of [...(dayRes.data ?? []), ...(onSiteRes.data ?? [])]) {
        byId.set(row.id, row as Job);
      }
      const jobs = [...byId.values()];

      const clientIds = [...new Set(jobs.map(j => j.client_id).filter(Boolean))] as string[];
      const clientMap = new Map<string, Client>();
      if (clientIds.length > 0) {
        const { data: clientsData, error: clientError } = await supabase
          .from('clients')
          .select('*')
          .in('id', clientIds);
        if (clientError) throw clientError;
        for (const c of clientsData ?? []) {
          clientMap.set(c.id, c as Client);
        }
      }

      return todaysDashboardJobs(
        await hydrateJobParentNumbers(attachJobClients(jobs, [...clientMap.values()])),
      );
    },
    enabled: !!profile,
  });

  const companyId = profile?.company_id ?? '';
  const liveCompany = !!companyId && !lookDashboard;
  const liveMoney = liveCompany && canSeeTodayMoney(profile?.role);

  const { data: readyJobs, isLoading: readyLoading, error: readyError, refetch: refetchReady } = useQuery({
    queryKey: ['today-ready', companyId, todayKey, lookDashboard],
    queryFn: () => lookDashboard ? dashboardLookReady() : fetchReadyToInvoice(supabase, companyId, todayKey),
    enabled: liveCompany || lookDashboard,
  });
  const { data: outstanding, isLoading: outstandingLoading, error: outstandingError, refetch: refetchOutstanding } = useQuery({
    queryKey: ['today-outstanding', companyId, lookDashboard],
    queryFn: () => lookDashboard ? dashboardLookOutstanding() : fetchOutstanding(supabase, companyId, now),
    enabled: liveMoney || lookDashboard,
  });
  const outstandingClientIds = [...new Set((outstanding?.display ?? []).map(row => row.client_id).filter(Boolean))] as string[];
  const { data: outstandingClients } = useQuery({
    queryKey: ['today-outstanding-clients', companyId, outstandingClientIds.join(',')],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('clients')
        .select('id, name')
        .eq('company_id', companyId)
        .in('id', outstandingClientIds);
      if (error) throw error;
      return data ?? [];
    },
    enabled: liveMoney && outstandingClientIds.length > 0,
  });
  const outstandingNamed = outstanding
    ? {
      ...outstanding,
      display: outstanding.display.map(row => ({
        ...row,
        client_name:
          (row as TodayOutstandingRow & { client_name?: string | null }).client_name
          ?? outstandingClients?.find(client => client.id === row.client_id)?.name
          ?? null,
      })),
    }
    : outstanding;
  const { data: cash, isLoading: cashLoading, error: cashError, refetch: refetchCash } = useQuery({
    queryKey: ['today-cash', companyId, todayKey, lookDashboard],
    queryFn: () => lookDashboard ? dashboardLookCash() : fetchTodayCash(supabase, companyId, todayKey),
    enabled: liveMoney || lookDashboard,
  });
  const { data: comingUp, isLoading: comingLoading, error: comingError, refetch: refetchComing } = useQuery({
    queryKey: ['today-coming-up', companyId, todayKey, lookDashboard],
    queryFn: () => lookDashboard ? dashboardLookComingUp() : fetchComingUp(supabase, companyId, todayKey),
    enabled: liveCompany || lookDashboard,
  });

  const { data: reminders } = useQuery({
    queryKey: ['reminders', companyId],
    queryFn: () => listReminders(companyId),
    enabled: liveCompany,
  });
  const lookNow = now;
  const stripRows = lookDashboard
    ? dashboardLookReminders(profile?.id ?? DASHBOARD_LOOK_OWNER)
    : todayReminders(splitReminderLists(reminders ?? []).upcoming, now);
  const linkedJobIds = [...new Set(stripRows.map(r => r.jobId).filter(Boolean))] as string[];
  const { data: linkedJobs } = useQuery({
    queryKey: ['reminders-linked-jobs', linkedJobIds],
    queryFn: () => listReminderJobsById(linkedJobIds),
    enabled: liveCompany && linkedJobIds.length > 0,
  });
  const jobLabels = reminderJobLabels(linkedJobs);
  const crewNames = reminderCrewNames(teamMembers);

  const { data: nudgeData } = useQuery<DashboardNudgeData>({
    queryKey: ['dashboard-nudges', todayKey],
    queryFn: () => loadDashboardNudgeData(todayKey, tomorrowKey),
    enabled: liveCompany,
  });
  const readyNudge: Nudge | null = (readyJobs ?? []).length > 0
    ? {
      key: 'ready_to_invoice',
      kind: 'ready_to_invoice' as Nudge['kind'],
      label: readyJobs!.length === 1 ? `${readyToInvoiceDetail(readyJobs!)} ready to invoice` : `${readyJobs!.length} jobs ready to invoice`,
      detail: readyToInvoiceDetail(readyJobs!),
      href: readyJobs!.length === 1 ? `/jobs/${readyJobs![0].id}` : '/jobs?status=completed',
    }
    : null;
  const nudges = visibleTodayNudges(
    [
      ...(nudgeData ? deriveNudges({ ...nudgeData, userId: profile?.id ?? null, now }) : []),
      ...(readyNudge ? [readyNudge] : []),
    ],
    profile?.role,
  );

  const [reminderTitle, setReminderTitle] = useState('');
  const [reminderSaving, setReminderSaving] = useState(false);
  const reminderCaptureRef = useRef<HTMLInputElement>(null);

  const runReminder = async (work: () => Promise<void>) => {
    try {
      await work();
      await queryClient.invalidateQueries({ queryKey: ['reminders'] });
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Could not save the reminder.', 'error');
    }
  };

  const captureReminder = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!reminderTitle.trim() || reminderSaving) return;
    setReminderSaving(true);
    await runReminder(async () => {
      await quickCaptureReminder({ companyId, userId: profile?.id, title: reminderTitle });
      setReminderTitle('');
    });
    setReminderSaving(false);
    reminderCaptureRef.current?.focus();
  };

  const toggleReminderDone = (id: string, done: boolean) => void runReminder(() => setReminderDone(id, done));
  const postponeReminderTo = (id: string, choice: PostponeChoice) => void runReminder(() => postponeReminder(id, choice));

  const addWidget = async (widgetType: string) => {
    if (addingWidgetRef.current) return;
    const def = getWidgetDef(widgetType);
    if (!def || isRetiredDashboardWidgetType(widgetType)) return;
    const w = widgets ?? [];
    const canvasW = measureDashboardCanvasWidth(
      canvasRef.current,
      widgetsBoxRef.current,
    );
    const placed = placeAddedDashboardWidget(w, widgetType, canvasW);
    if (!placed) return;
    addingWidgetRef.current = true;
    setAddingWidget(true);
    try {
      const local = lookDashboard || !!getAuditDashboardWidgets();
      if (local) {
        queryClient.setQueryData<DashboardWidget[]>(['dashboard-widgets'], [
          ...w,
          {
            id: `local-${widgetType}-${w.length}`,
            widget_type: widgetType,
            ...placed,
            config: {} as Json,
          },
        ]);
        setShowPicker(false);
        return;
      }
      const { data, error } = await supabase
        .from('dashboard_widgets')
        .insert({
          widget_type: widgetType,
          ...placed,
          config: {} as Json,
        } as never)
        .select('id, widget_type, grid_x, grid_y, grid_w, grid_h, config')
        .single();
      if (!error && data) {
        queryClient.setQueryData<DashboardWidget[]>(['dashboard-widgets'], [...w, data as DashboardWidget]);
      }
      setShowPicker(false);
    } finally {
      addingWidgetRef.current = false;
      setAddingWidget(false);
    }
  };

  const localDashboard = lookDashboard || !!getAuditDashboardWidgets();

  const removeWidget = async (id: string) => {
    if (!localDashboard) {
      const { error } = await supabase.from('dashboard_widgets').delete().eq('id', id);
      if (error) {
        showToast('Could not remove the widget.', 'error');
        return;
      }
    }
    queryClient.setQueryData<DashboardWidget[]>(['dashboard-widgets'], prev =>
      (prev ?? []).filter(w => w.id !== id));
  };

  const persistWidget = useCallback(async (id: string, patch: Partial<DashboardWidget>) => {
    if (lookDashboard || !!getAuditDashboardWidgets()) return null;
    const update: Record<string, unknown> = { ...patch, updated_at: new Date().toISOString() };
    delete update.id;
    delete update.widget_type;
    const { error } = await supabase
      .from('dashboard_widgets')
      .update(update as never)
      .eq('id', id);
    if (error) console.error('Widget update failed', error);
    return error ?? null;
  }, [lookDashboard]);

  const movePhoneWidget = async (id: string, direction: -1 | 1) => {
    const current = widgets ?? [];
    const next = swapAdjacentDashboardWidgetPhoneOrder(current, id, direction);
    const changed = next.filter(row => {
      const prev = current.find(w => w.id === row.id);
      if (!prev) return false;
      return readDashboardWidgetPhoneOrder(prev.config) !== readDashboardWidgetPhoneOrder(row.config);
    });
    if (changed.length === 0) return;
    queryClient.setQueryData<DashboardWidget[]>(['dashboard-widgets'], next);
    if (localDashboard || !profile?.id) return;

    const results = await Promise.all(changed.map(async row => {
      const prev = current.find(w => w.id === row.id)!;
      const error = await persistDashboardWidgetPhoneOrder(
        row.id,
        readDashboardWidgetPhoneOrder(row.config),
        profile.id,
      );
      return { row, prev, error };
    }));
    if (!results.some(result => result.error)) return;

    await Promise.all(
      results
        .filter(result => !result.error)
        .map(result => persistDashboardWidgetPhoneOrder(
          result.prev.id,
          readDashboardWidgetPhoneOrder(result.prev.config),
          profile.id,
        )),
    );
    queryClient.setQueryData<DashboardWidget[]>(['dashboard-widgets'], current);
    showToast('Could not move the widget.', 'error');
  };

  const updateWidgetConfig = useCallback(async (id: string, config: Record<string, unknown>) => {
    const { error } = await supabase
      .from('dashboard_widgets')
      .update({ config: config as Json, updated_at: new Date().toISOString() } as never)
      .eq('id', id);
    if (!error) {
      queryClient.setQueryData<DashboardWidget[]>(['dashboard-widgets'],
        (widgets ?? []).map(w => w.id === id ? { ...w, config: config as Json } : w));
    }
  }, [queryClient, widgets]);

  const displayWidgets = useMemo(
    () => clampDashboardWidgetsToCanvas(widgets ?? [], canvasW),
    [widgets, canvasW],
  );
  const shownWidgets = useMemo(
    () => visibleTodayWidgets(displayWidgets, profile?.role),
    [displayWidgets, profile?.role],
  );

  const handleDragStart = (e: DragStartEvent) => {
    setActiveId(String(e.active.id));
  };

  const handleDragEnd = (e: DragEndEvent) => {
    setActiveId(null);
    const { active, delta } = e;
    if (!delta.x && !delta.y) return;
    const shown = displayWidgets.find(x => x.id === active.id);
    if (!shown) return;
    const next = applyDashboardWidgetDrag(shown, delta, canvasW);
    queryClient.setQueryData<DashboardWidget[]>(['dashboard-widgets'],
      (widgets ?? []).map(x => x.id === shown.id ? { ...x, ...next } : x));
    persistWidget(shown.id, next);
  };

  const resizeState = useRef<{
    id: string;
    startX: number;
    startY: number;
    startW: number;
    startH: number;
    grid_x: number;
    canvasW: number;
    last?: { grid_x: number; grid_w: number; grid_h: number };
  } | null>(null);

  const startResize = (e: React.PointerEvent, widget: DashboardWidget) => {
    e.preventDefault();
    e.stopPropagation();
    resizeState.current = {
      id: widget.id,
      startX: e.clientX,
      startY: e.clientY,
      startW: widget.grid_w,
      startH: widget.grid_h,
      grid_x: widget.grid_x,
      canvasW,
    };
    window.addEventListener('pointermove', onResizeMove);
    window.addEventListener('pointerup', onResizeEnd, { once: true });
  };

  const onResizeMove = useCallback((e: PointerEvent) => {
    const rs = resizeState.current;
    if (!rs) return;
    const sized = applyDashboardWidgetResize(
      { grid_x: rs.grid_x, grid_w: rs.startW, grid_h: rs.startH },
      { x: e.clientX - rs.startX, y: e.clientY - rs.startY },
      rs.canvasW,
    );
    rs.last = sized;
    queryClient.setQueryData<DashboardWidget[]>(['dashboard-widgets'],
      (widgets ?? []).map(x => x.id === rs.id ? { ...x, ...sized } : x));
  }, [queryClient, widgets]);

  const onResizeEnd = useCallback(() => {
    const rs = resizeState.current;
    resizeState.current = null;
    window.removeEventListener('pointermove', onResizeMove);
    if (rs?.last) persistWidget(rs.id, rs.last);
  }, [persistWidget, onResizeMove]);

  const canvasHeight = useMemo(() => {
    const ws = shownWidgets;
    const floor = editMode ? 320 : 0;
    if (!ws.length) return floor;
    const extra = editMode ? DASHBOARD_EDIT_CHROME_TOP + DASHBOARD_EDIT_CHROME_BOTTOM : 0;
    const maxBottom = Math.max(...ws.map(w => w.grid_y + w.grid_h));
    return Math.max(floor, maxBottom + extra + CANVAS_PAD);
  }, [shownWidgets, editMode]);

  const viewWidgets = useMemo(
    () => sortDashboardWidgetsForView(shownWidgets),
    [shownWidgets],
  );

  if (pageQueryBlocked(error) || pageQueryBlocked(jobsError)) {
    return <AppShell><PageError message="Could not load dashboard" /></AppShell>;
  }

  const work = todayJobs ?? [];
  const needCrewCount = countNeedsCrew(work);
  const moreMenu = (
    <DashboardHomeMore
      editMode={editMode}
      onToggleEdit={() => setEditMode(e => !e)}
      onNewJob={() => setShowJobForm(true)}
    />
  );

  return (
    <AppShell>
      <div className="ops-page dashboard-home is-day-open is-today-board">
        <article className="dashboard-home-sheet" data-dashboard-home="1">
          <div className="dashboard-home-sheet-body">
            <TodayBoardView
              now={now}
              width={viewportW}
              band={todayBand}
              companyName={company?.name}
              role={profile?.role}
              jobs={work}
              jobsLoading={jobsLoading}
              jobsError={jobsError}
              onRetryJobs={() => { void queryClient.invalidateQueries({ queryKey: ['dashboard-today-jobs'] }); }}
              team={teamMembers}
              ready={{
                data: readyJobs,
                isLoading: readyLoading,
                error: readyError,
                onRetry: () => { void refetchReady(); },
              }}
              outstanding={{
                data: outstandingNamed,
                isLoading: outstandingLoading,
                error: outstandingError,
                onRetry: () => { void refetchOutstanding(); },
              }}
              cash={{
                data: cash,
                isLoading: cashLoading,
                error: cashError,
                onRetry: () => { void refetchCash(); },
              }}
              coming={{
                data: comingUp,
                isLoading: comingLoading,
                error: comingError,
                onRetry: () => { void refetchComing(); },
              }}
              nudges={nudges}
              more={moreMenu}
              onNewJob={() => setShowJobForm(true)}
              needCrewCount={needCrewCount}
            />

            <div className="today-grid-below" data-today-grid="1">
            <section className="today-sec today-reminders dashboard-home-strip" data-today-section="s12" data-dashboard-reminders="1">
              <div className="today-sec-h dashboard-home-section-head">
                <h2 className="ops-section-title" id="today-reminders-h">Reminders</h2>
                <Link to="/reminders" className="today-quiet dashboard-home-all">All ›</Link>
              </div>
              <form className="reminders-capture dashboard-reminders-capture" onSubmit={captureReminder}>
                <input
                  ref={reminderCaptureRef}
                  id="dashboard-reminder-capture"
                  className="reminders-capture-input"
                  placeholder="What do you need to remember?"
                  aria-label="What do you need to remember?"
                  value={reminderTitle}
                  onChange={e => setReminderTitle(e.target.value)}
                  autoComplete="off"
                />
                <button
                  type="submit"
                  className="btn-primary dashboard-home-primary reminders-capture-add"
                  disabled={!reminderTitle.trim() || reminderSaving}
                >
                  Add
                </button>
              </form>
              {stripRows.length > 0 && (
                <ul className="reminders-list">
                  {stripRows.map(reminder => (
                    <ReminderRow
                      key={reminder.id}
                      reminder={reminder}
                      jobLabel={reminder.jobId ? jobLabels.get(reminder.jobId) ?? null : null}
                      ownerName={reminder.ownerId ? crewNames.get(reminder.ownerId) ?? null : null}
                      crewNames={crewNames}
                      isMine={reminder.ownerId === profile?.id}
                      canTick={canTickReminder(reminder, profile?.id ?? '')}
                      now={lookNow}
                      onToggleDone={toggleReminderDone}
                      onPostpone={postponeReminderTo}
                    />
                  ))}
                </ul>
              )}
            </section>

            <h2 className="today-sec-h today-widgets-head ops-section-title">
              Your widgets
              {todayBand !== 'p' ? moreMenu : null}
            </h2>
            {editMode && (
              <div className="dashboard-home-tools">
                <button
                  type="button"
                  onClick={() => setShowPicker(true)}
                  className="btn-primary dashboard-home-primary"
                >
                  <Plus size={16} />
                  Add widget
                </button>
              </div>
            )}

            {!widgetsLoading && (widgets ?? []).length === 0 && (
              <div className="dashboard-home-tools">
                <button
                  type="button"
                  onClick={() => setShowPicker(true)}
                  className="btn-primary dashboard-home-primary"
                >
                  <Plus size={16} />
                  Add widget
                </button>
              </div>
            )}

            {widgetsLoading ? (
              <div className="dashboard-home-widgets flex justify-center py-12"><LoadingSpinner /></div>
            ) : (widgets ?? []).length === 0 ? null : (
              <div className="dashboard-home-widgets" data-dashboard-widgets="1" ref={widgetsBoxRef}>
                {editMode ? (
                  <>
                    <DashboardPhoneEditStack
                      widgets={shownWidgets}
                      onMove={movePhoneWidget}
                      onRemove={removeWidget}
                    >
                      {w => (
                        <WidgetRenderer
                          type={w.widget_type}
                          config={(w.config as Record<string, unknown>) ?? {}}
                          onConfigChange={(c) => updateWidgetConfig(w.id, c)}
                        />
                      )}
                    </DashboardPhoneEditStack>

                    <div className="hidden md:block">
                      <DndContext
                        sensors={sensors}
                        onDragStart={handleDragStart}
                        onDragEnd={handleDragEnd}
                      >
                        <div
                          ref={canvasRef}
                          className={`dashboard-home-canvas relative overflow-x-auto is-editing`}
                          style={{ height: canvasHeight, minWidth: '100%' }}
                        >
                          {shownWidgets.map(w => (
                              <FreeWidget
                                key={w.id}
                                widget={w}
                                editMode={editMode}
                                onRemove={() => removeWidget(w.id)}
                                onResizeStart={(e) => startResize(e, w)}
                                onConfigChange={(c) => updateWidgetConfig(w.id, c)}
                                isDragging={activeId === w.id}
                              />
                            ))}
                        </div>
                      </DndContext>
                    </div>
                  </>
                ) : (
                  <div className="dashboard-home-view-grid" data-dashboard-view-grid="1">
                    {viewWidgets.map(w => (
                      <div
                        key={w.id}
                        className="dashboard-home-widget dashboard-home-widget-card"
                        data-dashboard-widget-id={w.id}
                      >
                        <div className="dashboard-home-widget-ink">
                          <WidgetRenderer
                            type={w.widget_type}
                            config={(w.config as Record<string, unknown>) ?? {}}
                            onConfigChange={(c) => updateWidgetConfig(w.id, c)}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
            </div>
          </div>
        </article>
      </div>

      {/* Widget Picker Modal */}
      {showPicker && (
        <WidgetPicker
          onAdd={addWidget}
          onClose={() => { if (!addingWidget) setShowPicker(false); }}
          existingTypes={new Set((widgets ?? []).map(w => w.widget_type))}
          busy={addingWidget}
        />
      )}
      {showJobForm && (
        <JobFormModal
          job={null}
          presetDate={todayKey}
          presetClientId={null}
          onClose={() => setShowJobForm(false)}
          onSaved={(jobId) => {
            setShowJobForm(false);
            void queryClient.invalidateQueries({ queryKey: ['dashboard-today-jobs'] });
            void queryClient.invalidateQueries({ queryKey: ['today-coming-up'] });
            if (jobId) window.location.assign(`/jobs/${jobId}`);
          }}
        />
      )}
    </AppShell>
  );
}

// Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ Free-form Widget Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
function placeDashboardMore(more: HTMLDetailsElement) {
  const menu = more.querySelector('.dashboard-home-more-menu') as HTMLElement | null;
  const paper = more.closest('.dashboard-home-sheet') as HTMLElement | null;
  if (!menu || !paper) return;
  more.classList.remove('is-flip', 'is-shift');
  menu.style.removeProperty('--dashboard-home-more-shift');
  if (!more.open) return;
  const pad = 8;
  const paperRect = paper.getBoundingClientRect();
  const bar = paper.querySelector('.dashboard-home-sheet-bar');
  const inkFloor = (bar?.getBoundingClientRect().bottom ?? paperRect.top) + pad;
  const viewBottom = window.innerHeight - pad;
  const menuRect = menu.getBoundingClientRect();
  const trigger = more.querySelector('summary') as HTMLElement | null;
  const triggerRect = trigger?.getBoundingClientRect() ?? menuRect;
  const flippedTop = triggerRect.top - pad - menuRect.height;
  const overflowsBottom = menuRect.bottom > Math.min(paperRect.bottom - pad, viewBottom);
  if (overflowsBottom && flippedTop >= inkFloor) {
    more.classList.add('is-flip');
  }
  const after = menu.getBoundingClientRect();
  let shift = 0;
  if (after.right > paperRect.right - pad) shift = paperRect.right - pad - after.right;
  if (after.left + shift < paperRect.left + pad) shift = paperRect.left + pad - after.left;
  if (shift !== 0) {
    more.classList.add('is-shift');
    menu.style.setProperty('--dashboard-home-more-shift', `${Math.round(shift)}px`);
  }
}

export function DashboardPhoneEditStack<T extends {
  id: string;
  widget_type: string;
  config?: unknown;
}>({
  widgets,
  onMove,
  onRemove,
  children,
}: {
  widgets: T[];
  onMove: (id: string, direction: -1 | 1) => void;
  onRemove: (id: string) => void;
  children: (widget: T) => ReactNode;
}) {
  const ordered = sortDashboardWidgetsForView(widgets);
  return (
    <div className="md:hidden dashboard-home-widget-stack" data-dashboard-phone-stack="1">
      {ordered.map((w, index) => {
        const name = getWidgetDef(w.widget_type)?.label ?? 'widget';
        return (
          <div
            key={w.id}
            className="dashboard-home-widget"
            data-dashboard-widget-id={w.id}
          >
            <div className="dashboard-home-phone-edit-bar">
              <button
                type="button"
                aria-label={`Move ${name} up`}
                disabled={index === 0}
                onClick={() => onMove(w.id, -1)}
              >
                <ChevronUp size={18} />
              </button>
              <button
                type="button"
                aria-label={`Move ${name} down`}
                disabled={index === ordered.length - 1}
                onClick={() => onMove(w.id, 1)}
              >
                <ChevronDown size={18} />
              </button>
              <button
                type="button"
                className="dashboard-home-phone-remove"
                aria-label={`Remove ${name}`}
                title={`Remove ${name}`}
                onClick={() => onRemove(w.id)}
              >
                <Trash2 size={16} />
              </button>
            </div>
            <div className="dashboard-home-widget-ink">
              {children(w)}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function DashboardHomeMore({
  editMode,
  onToggleEdit,
  onNewJob,
}: {
  editMode: boolean;
  onToggleEdit: () => void;
  onNewJob?: () => void;
}) {
  const moreRef = useRef<HTMLDetailsElement>(null);

  const closeMore = () => {
    if (moreRef.current) moreRef.current.open = false;
  };

  const placeMoreMenu = () => {
    if (moreRef.current) placeDashboardMore(moreRef.current);
  };

  useEffect(() => {
    const more = moreRef.current;
    const onPointer = (event: PointerEvent) => {
      if (!moreRef.current?.open) return;
      if (!moreRef.current.contains(event.target as Node)) closeMore();
    };
    more?.addEventListener('toggle', placeMoreMenu);
    window.addEventListener('resize', placeMoreMenu);
    document.addEventListener('pointerdown', onPointer);
    return () => {
      more?.removeEventListener('toggle', placeMoreMenu);
      window.removeEventListener('resize', placeMoreMenu);
      document.removeEventListener('pointerdown', onPointer);
    };
  }, []);

  return (
    <details ref={moreRef} className="dashboard-home-more">
      <summary aria-label="More">
        <MoreHorizontal size={18} />
      </summary>
      <div className="dashboard-home-more-menu" role="menu">
        {onNewJob ? (
          <button
            type="button"
            role="menuitem"
            className="today-more-new"
            onClick={() => { onNewJob(); closeMore(); }}
          >
            New job
          </button>
        ) : null}
        <button
          type="button"
          role="menuitem"
          onClick={() => { onToggleEdit(); closeMore(); }}
        >
          {editMode ? 'Done editing' : 'Customize'}
        </button>
      </div>
    </details>
  );
}

function FreeWidget({
  widget, editMode, onRemove, onResizeStart, onConfigChange, isDragging,
}: {
  widget: DashboardWidget & { content_h?: number };
  editMode: boolean;
  onRemove: () => void;
  onResizeStart: (e: React.PointerEvent) => void;
  onConfigChange: (config: Record<string, unknown>) => void;
  isDragging: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging: isDragActive } = useDraggable({
    id: widget.id,
    disabled: !editMode,
  });

  const dragStyle: React.CSSProperties = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
    : {};

  const contentH = widget.content_h ?? widget.grid_h;
  const posStyle: React.CSSProperties = {
    left: widget.grid_x,
    top: widget.grid_y,
    width: widget.grid_w,
    height: widget.grid_h,
  };

  return (
    <div
      ref={setNodeRef}
      data-dashboard-widget-id={widget.id}
      style={{ ...posStyle, ...dragStyle }}
      className={`absolute overflow-visible ${isDragging || isDragActive ? 'z-50' : 'z-10'} ${isDragActive ? 'select-none' : ''}`}
    >
      {editMode && (
        <div className="dashboard-home-edit-chrome">
          <button
            {...attributes}
            {...listeners}
            className="min-w-[44px] min-h-[44px] w-11 h-11 flex items-center justify-center rounded-md bg-white border border-gray-200 shadow-sm text-gray-400 cursor-grab active:cursor-grabbing hover:text-gray-600 hover:bg-gray-50 transition-colors touch-none"
            title="Drag to move"
          >
            <GripVertical size={14} />
          </button>
          <button
            onClick={onRemove}
            className="min-w-[44px] min-h-[44px] w-11 h-11 flex items-center justify-center rounded-md bg-white border border-gray-200 shadow-sm text-red-500 hover:bg-red-50 transition-colors"
            title="Remove widget"
          >
            <Trash2 size={13} />
          </button>
        </div>
      )}

      <div
        className={`dashboard-home-widget w-full overflow-hidden ${
          editMode ? 'is-editing' : ''
        } ${isDragging || isDragActive ? 'is-dragging' : ''}`}
        style={{ height: contentH }}
      >
        <div className="dashboard-home-widget-ink h-full">
          <WidgetRenderer
            type={widget.widget_type}
            config={(widget.config as Record<string, unknown>) ?? {}}
            onConfigChange={onConfigChange}
          />
        </div>
      </div>

      {editMode && (
        <div className="dashboard-home-edit-foot">
          <div
            onPointerDown={onResizeStart}
            className="dashboard-home-widget-resize min-w-[44px] min-h-[44px] w-11 h-11 cursor-se-resize touch-none flex items-end justify-end"
            title="Drag to resize"
          >
            <svg width="10" height="10" viewBox="0 0 10 10" className="text-gray-400">
              <path d="M9 1L1 9M9 5L5 9" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
            </svg>
          </div>
        </div>
      )}
    </div>
  );
}

// Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ Widget Picker Modal Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
function WidgetPicker({
  onAdd, onClose, existingTypes, busy = false,
}: {
  onAdd: (type: string) => void;
  onClose: () => void;
  existingTypes: Set<string>;
  busy?: boolean;
}) {
  const [category, setCategory] = useState<string>('system');

  const filtered = pickerDashboardWidgets(category);

  return (
    <div className="overlay-backdrop dashboard-home-picker">
      <div
        className="overlay-panel-xl"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <Sparkles size={18} className="text-blue-500" />
            <h2 className="text-base font-semibold text-[#1A1A1A]">Add a Widget</h2>
          </div>
          <button onClick={onClose} className="min-w-[44px] min-h-[44px] w-11 h-11 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600">
            <X size={18} />
          </button>
        </div>

        {/* Category tabs */}
        <div className="flex gap-1 px-5 py-3 border-b border-gray-50 overflow-x-auto">
          {WIDGET_CATEGORIES.map(cat => (
            <button
              key={cat.id}
              onClick={() => setCategory(cat.id)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
                category === cat.id
                  ? 'bg-blue-500 text-white'
                  : 'text-gray-500 hover:bg-gray-100'
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>

        {/* Widget grid */}
        <div className="flex-1 overflow-auto p-5">
          <div className="grid grid-cols-2 gap-3">
            {filtered.map(w => {
              const Icon = w.icon;
              const added = existingTypes.has(w.type);
              return (
                <button
                  key={w.type}
                  onClick={() => onAdd(w.type)}
                  disabled={busy || added}
                  className={`flex items-start gap-3 p-3 rounded-xl border text-left transition-all ${
                    busy || added
                      ? 'border-gray-100 bg-gray-50 opacity-50 cursor-not-allowed'
                      : 'border-gray-200 hover:border-blue-300 hover:shadow-md hover:bg-blue-50/30'
                  }`}
                >
                  <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center shrink-0">
                    <Icon size={20} className="text-blue-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p className="text-sm font-semibold text-[#1A1A1A]">{w.label}</p>
                      {added && (
                        <span className="text-[9px] bg-gray-100 text-gray-400 px-1.5 py-0.5 rounded-full">Added</span>
                      )}
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5">{w.description}</p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

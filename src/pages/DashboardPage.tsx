import { useState, useCallback, useRef, useMemo, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { AppShell } from '../components/layout/AppShell';
import { EmptyState, LoadingSpinner, PageError } from '../components/ui';
import { getAuditClients, getAuditDashboardWidgets, getAuditJobs, getAuditTeamMembers } from '../lib/devFieldAuditDocs';
import { pageQueryBlocked } from '../lib/devFieldAuditAuth';
import {
  DndContext, DragEndEvent, DragStartEvent, PointerSensor, useSensor, useSensors,
  useDraggable,
} from '@dnd-kit/core';
import {
  Plus, X, GripVertical, Trash2, Sparkles, Briefcase, MoreHorizontal,
} from 'lucide-react';
import { WIDGET_REGISTRY, WIDGET_CATEGORIES, getWidgetDef } from '../widgets/registry';
import { WidgetRenderer } from '../widgets/WidgetComponents';
import type { Json } from '../types/database';
import type { Client, Job, JobWithClient } from '../types/crm';
import { attachJobClients, hydrateJobParentNumbers } from '../lib/scheduleJobSearch';
import { formatJobRef } from '../lib/jobRef';
import {
  dashboardClockLabel,
  dashboardCrewLabel,
  dashboardHeadingDate,
  dashboardJobHref,
  dashboardJobMetaLine,
  dashboardJobPlace,
  dashboardJobState,
  dashboardJobStateLabel,
  dashboardTodayKey,
  todaysDashboardJobs,
} from '../lib/dashboardHome';
import {
  dashboardWidgetPixelSize,
  defaultDashboardWidgetInserts,
  shouldSeedDefaultDashboardWidgets,
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

const MIN_W = 180;
const MIN_H = 120;
const MAX_W = 800;
const MAX_H = 700;
const CANVAS_PAD = 40;

/** Signed dashboard frame seed — home look only, not a live company. */
const DASHBOARD_LOOK = 'dashboard';
const DASHBOARD_LOOK_DAVE = 'look-dash-dave';
const DASHBOARD_LOOK_JACK = 'look-dash-jack';

function dashboardLookCrew(): ScheduleCrewMember[] {
  return [
    { id: DASHBOARD_LOOK_DAVE, name: 'Dave' },
    { id: DASHBOARD_LOOK_JACK, name: 'Jack' },
  ];
}

function dashboardLookJobs(): JobWithClient[] {
  const day = dashboardTodayKey();
  const stamp = '2026-09-03T00:00:00.000Z';
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
  ];
}

export function DashboardPage() {
  const { profile, company } = useAuth();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const lookDashboard = searchParams.get('look') === DASHBOARD_LOOK;
  const [editMode, setEditMode] = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const todayKey = dashboardTodayKey();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  const { data: widgets, isLoading: widgetsLoading, error } = useQuery<DashboardWidget[]>({
    queryKey: ['dashboard-widgets'],
    queryFn: async () => {
      const mock = getAuditDashboardWidgets();
      if (mock) return mock;
      const { data, error } = await supabase
        .from('dashboard_widgets')
        .select('id, widget_type, grid_x, grid_y, grid_w, grid_h, config')
        .order('grid_y', { ascending: true });
      if (error) throw error;
      const rows = (data ?? []) as DashboardWidget[];
      if (!shouldSeedDefaultDashboardWidgets(rows)) return rows;

      const { data: seeded, error: seedError } = await supabase
        .from('dashboard_widgets')
        .insert(defaultDashboardWidgetInserts() as never)
        .select('id, widget_type, grid_x, grid_y, grid_w, grid_h, config');
      if (!seedError && seeded?.length) return seeded as DashboardWidget[];

      // Concurrent first visit — reload instead of writing a second set.
      const { data: retry, error: retryError } = await supabase
        .from('dashboard_widgets')
        .select('id, widget_type, grid_x, grid_y, grid_w, grid_h, config')
        .order('grid_y', { ascending: true });
      if (retryError) throw retryError;
      return (retry ?? []) as DashboardWidget[];
    },
    enabled: !!profile,
  });

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
      if (lookDashboard) return dashboardLookJobs();
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

  // Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ CRUD Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
  const addWidget = async (widgetType: string) => {
    const def = getWidgetDef(widgetType);
    if (!def) return;
    const w = widgets ?? [];
    // Place at a staggered offset so new widgets don't overlap exactly
    const offset = w.length * 30;
    const size = dashboardWidgetPixelSize(widgetType);
    const { data, error } = await supabase
      .from('dashboard_widgets')
      .insert({
        widget_type: widgetType,
        grid_x: Math.min(offset, 400),
        grid_y: 20,
        grid_w: size.grid_w,
        grid_h: size.grid_h,
        config: {} as Json,
      } as never)
      .select('id, widget_type, grid_x, grid_y, grid_w, grid_h, config')
      .single();
    if (!error && data) {
      queryClient.setQueryData<DashboardWidget[]>(['dashboard-widgets'], [...w, data as DashboardWidget]);
    }
    setShowPicker(false);
  };

  const removeWidget = async (id: string) => {
    const { error } = await supabase.from('dashboard_widgets').delete().eq('id', id);
    if (!error) {
      queryClient.setQueryData<DashboardWidget[]>(['dashboard-widgets'],
        (widgets ?? []).filter(w => w.id !== id));
    }
  };

  const persistWidget = useCallback(async (id: string, patch: Partial<DashboardWidget>) => {
    const update: Record<string, unknown> = { ...patch, updated_at: new Date().toISOString() };
    delete update.id;
    delete update.widget_type;
    const { error } = await supabase
      .from('dashboard_widgets')
      .update(update as never)
      .eq('id', id);
    if (error) console.error('Widget update failed', error);
  }, []);

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

  // Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ DnD Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
  const handleDragStart = (e: DragStartEvent) => {
    setActiveId(String(e.active.id));
  };

  const handleDragEnd = (e: DragEndEvent) => {
    setActiveId(null);
    const { active, delta } = e;
    if (!delta.x && !delta.y) return;
    const w = (widgets ?? []).find(x => x.id === active.id);
    if (!w) return;
    const newX = Math.max(0, w.grid_x + delta.x);
    const newY = Math.max(0, w.grid_y + delta.y);
    queryClient.setQueryData<DashboardWidget[]>(['dashboard-widgets'],
      (widgets ?? []).map(x => x.id === w.id ? { ...x, grid_x: newX, grid_y: newY } : x));
    persistWidget(w.id, { grid_x: newX, grid_y: newY });
  };

  // Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ Resize via pointer events Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
  const resizeState = useRef<{ id: string; startX: number; startY: number; startW: number; startH: number } | null>(null);

  const startResize = (e: React.PointerEvent, widget: DashboardWidget) => {
    e.preventDefault();
    e.stopPropagation();
    resizeState.current = {
      id: widget.id,
      startX: e.clientX,
      startY: e.clientY,
      startW: widget.grid_w,
      startH: widget.grid_h,
    };
    window.addEventListener('pointermove', onResizeMove);
    window.addEventListener('pointerup', onResizeEnd, { once: true });
  };

  const onResizeMove = useCallback((e: PointerEvent) => {
    const rs = resizeState.current;
    if (!rs) return;
    const dw = e.clientX - rs.startX;
    const dh = e.clientY - rs.startY;
    const newW = Math.max(MIN_W, Math.min(MAX_W, rs.startW + dw));
    const newH = Math.max(MIN_H, Math.min(MAX_H, rs.startH + dh));
    queryClient.setQueryData<DashboardWidget[]>(['dashboard-widgets'],
      (widgets ?? []).map(x => x.id === rs.id ? { ...x, grid_w: newW, grid_h: newH } : x));
  }, [queryClient, widgets]);

  const onResizeEnd = useCallback(() => {
    const rs = resizeState.current;
    resizeState.current = null;
    window.removeEventListener('pointermove', onResizeMove);
    if (rs) {
      const w = (widgets ?? []).find(x => x.id === rs.id);
      if (w) persistWidget(rs.id, { grid_w: w.grid_w, grid_h: w.grid_h });
    }
  }, [widgets, persistWidget, onResizeMove]);

  // Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ Canvas height: grows to fit all widgets Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
  const canvasHeight = useMemo(() => {
    const ws = widgets ?? [];
    if (!ws.length) return 500;
    const maxBottom = Math.max(...ws.map(w => w.grid_y + w.grid_h));
    return Math.max(500, maxBottom + CANVAS_PAD);
  }, [widgets]);

  if (pageQueryBlocked(error) || pageQueryBlocked(jobsError)) {
    return <AppShell><PageError message="Could not load dashboard" /></AppShell>;
  }

  const work = todayJobs ?? [];
  const jobCountLabel = work.length === 1 ? '1 job' : `${work.length} jobs`;
  const whisper = [
    dashboardHeadingDate(),
    company?.name,
    !jobsLoading && work.length > 0 ? jobCountLabel : null,
  ].filter(Boolean).join(' · ');

  return (
    <AppShell>
      <div className="ops-page dashboard-home is-day-open">
        <article className="dashboard-home-sheet" data-dashboard-home="1">
          <header className="dashboard-home-sheet-bar">
            <span className="dashboard-home-mark">Today</span>
          </header>
          <div className="dashboard-home-sheet-body">
            <h1 className="ops-page-title dashboard-home-hero">Dashboard</h1>
            <p className="hub-look-eyebrow dashboard-home-label dashboard-home-whisper">{whisper}</p>

            <div className="dashboard-home-tools">
              {editMode ? (
                <button
                  type="button"
                  onClick={() => setShowPicker(true)}
                  className="btn-primary dashboard-home-primary"
                >
                  <Plus size={16} />
                  Add widget
                </button>
              ) : work.length === 0 && !jobsLoading ? (
                <Link to="/schedule" className="btn-primary dashboard-home-primary">
                  Open schedule
                </Link>
              ) : (
                <Link to="/schedule" className="btn-primary dashboard-home-primary">
                  Week board
                </Link>
              )}
              <div className="dashboard-home-tools-overflow">
                <DashboardHomeMore
                  editMode={editMode}
                  onToggleEdit={() => setEditMode(e => !e)}
                />
              </div>
            </div>

            {jobsLoading ? (
              <div className="flex justify-center py-16"><LoadingSpinner /></div>
            ) : work.length === 0 ? (
              <EmptyState
                icon={Briefcase}
                title="Nothing on today"
                message="No jobs are booked for today. The week is on the schedule."
              />
            ) : (
              <div className="dashboard-home-ledger">
                <div className="dashboard-home-thead">
                  <span>Time</span>
                  <span>Job</span>
                  <span>Place</span>
                </div>
                {work.map(job => {
                  const state = dashboardJobState(job);
                  const place = dashboardJobPlace(job);
                  const meta = [
                    formatJobRef(job),
                    dashboardJobMetaLine(job) || place,
                    dashboardCrewLabel(job.assigned_team, teamMembers),
                    dashboardJobStateLabel(state),
                  ].filter(Boolean).join(' · ');
                  return (
                    <Link
                      key={job.id}
                      to={dashboardJobHref(job.id)}
                      data-dashboard-job={job.id}
                      className="dashboard-home-row"
                      aria-label="Open"
                    >
                      <span className="dashboard-home-time">
                        {dashboardClockLabel(job.start_time, job.end_time)}
                      </span>
                      <span className="dashboard-home-job">
                        <span className="dashboard-home-title">{job.title}</span>
                        <span className="dashboard-home-ref">{meta}</span>
                      </span>
                      <span className="dashboard-home-place">{place}</span>
                    </Link>
                  );
                })}
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
          </div>
        </article>

        {widgetsLoading ? (
          <div className="dashboard-home-widgets flex justify-center py-12"><LoadingSpinner /></div>
        ) : (widgets ?? []).length === 0 ? null : (
          <div className="dashboard-home-widgets">
            <div className="md:hidden grid grid-cols-1 gap-3">
              {(widgets ?? []).map(w => (
                <div key={w.id} className="dashboard-home-widget overflow-hidden" style={{ minHeight: Math.min(w.grid_h, 300) }}>
                  <div className="h-full p-3">
                    <WidgetRenderer
                      type={w.widget_type}
                      config={(w.config as Record<string, unknown>) ?? {}}
                      onConfigChange={(c) => updateWidgetConfig(w.id, c)}
                    />
                  </div>
                </div>
              ))}
            </div>

            <div className="hidden md:block">
              <DndContext
                sensors={sensors}
                onDragStart={handleDragStart}
                onDragEnd={handleDragEnd}
              >
                <div
                  ref={canvasRef}
                  className={`dashboard-home-canvas relative overflow-x-auto${editMode ? ' is-editing' : ''}`}
                  style={{ height: canvasHeight, minWidth: '100%' }}
                >
                  {(widgets ?? []).map(w => (
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
          </div>
        )}
      </div>

      {/* Widget Picker Modal */}
      {showPicker && (
        <WidgetPicker
          onAdd={addWidget}
          onClose={() => setShowPicker(false)}
          existingTypes={new Set((widgets ?? []).map(w => w.widget_type))}
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

function DashboardHomeMore({
  editMode,
  onToggleEdit,
}: {
  editMode: boolean;
  onToggleEdit: () => void;
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
  widget: DashboardWidget;
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

  const posStyle: React.CSSProperties = {
    left: widget.grid_x,
    top: widget.grid_y,
    width: widget.grid_w,
    height: widget.grid_h,
  };

  return (
    <div
      ref={setNodeRef}
      style={{ ...posStyle, ...dragStyle }}
      className={`absolute ${isDragging || isDragActive ? 'z-50' : 'z-10'} ${isDragActive ? 'select-none' : ''}`}
    >
      <div
        className={`dashboard-home-widget h-full w-full overflow-hidden ${
          editMode ? 'is-editing' : ''
        } ${isDragging || isDragActive ? 'is-dragging' : ''}`}
      >
        {/* Edit-mode controls bar */}
        {editMode && (
          <div className="absolute top-1.5 left-1.5 z-20 flex items-center gap-1">
            <button
              {...attributes}
              {...listeners}
              className="w-7 h-7 flex items-center justify-center rounded-md bg-white border border-gray-200 shadow-sm text-gray-400 cursor-grab active:cursor-grabbing hover:text-gray-600 hover:bg-gray-50 transition-colors touch-none"
              title="Drag to move"
            >
              <GripVertical size={14} />
            </button>
          </div>
        )}

        {editMode && (
          <div className="absolute top-1.5 right-1.5 z-20">
            <button
              onClick={onRemove}
              className="w-7 h-7 flex items-center justify-center rounded-md bg-white border border-gray-200 shadow-sm text-red-500 hover:bg-red-50 transition-colors"
              title="Remove widget"
            >
              <Trash2 size={13} />
            </button>
          </div>
        )}

        {/* Widget content */}
        <div className={`h-full p-3 ${editMode ? 'pt-8' : ''}`}>
          <WidgetRenderer
            type={widget.widget_type}
            config={(widget.config as Record<string, unknown>) ?? {}}
            onConfigChange={onConfigChange}
          />
        </div>

        {/* Resize handle */}
        {editMode && (
          <div
            onPointerDown={onResizeStart}
            className="absolute bottom-0 right-0 z-20 w-5 h-5 cursor-se-resize touch-none flex items-end justify-end"
            title="Drag to resize"
          >
            <svg width="10" height="10" viewBox="0 0 10 10" className="text-gray-400">
              <path d="M9 1L1 9M9 5L5 9" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
            </svg>
          </div>
        )}
      </div>
    </div>
  );
}

// Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ Widget Picker Modal Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
function WidgetPicker({
  onAdd, onClose, existingTypes,
}: {
  onAdd: (type: string) => void;
  onClose: () => void;
  existingTypes: Set<string>;
}) {
  const [category, setCategory] = useState<string>('system');

  const filtered = WIDGET_REGISTRY.filter(w => w.category === category);

  return (
    <div className="overlay-backdrop">
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
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600">
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
                  disabled={added && w.category === 'system'}
                  className={`flex items-start gap-3 p-3 rounded-xl border text-left transition-all ${
                    added && w.category === 'system'
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
                      {added && w.category === 'system' && (
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

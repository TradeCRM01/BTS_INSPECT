import { useState, useMemo, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { AppShell } from '../components/layout/AppShell';
import { LoadingSpinner } from '../components/ui/LoadingSpinner';
import { PageError } from '../components/ui/PageError';
import type { Job, JobWithClient, JobStatus, Client } from '../types/crm';
import { JOB_STATUS_LABELS } from '../types/crm';
import { JobFormModal } from '../components/crm/JobFormModal';
import {
  DayBoardView, WeekBoardView, MonthBoardView, JobListView,
  type TeamMember,
} from '../components/crm/BoardViews';
import { pickEmployeeColor } from '../lib/jobColors';
import { EmployeeColorSwatch } from '../components/crm/EmployeeColorSwatch';
import {
  ChevronLeft, ChevronRight, Plus, Calendar as CalIcon,
  List, LayoutGrid, Columns3, Users, X,
} from 'lucide-react';
import {
  format, startOfMonth, endOfMonth, startOfWeek, endOfWeek,
  addDays, addMonths, addWeeks, isToday,
} from 'date-fns';

type ViewMode = 'day' | 'week' | 'month' | 'list';

export function SchedulePage() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [viewMode, setViewMode] = useState<ViewMode>('day');
  const [showForm, setShowForm] = useState(false);
  const [editingJob, setEditingJob] = useState<Job | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [presetClientId, setPresetClientId] = useState<string | null>(null);
  const [presetEmployeeId, setPresetEmployeeId] = useState<string | undefined>(undefined);
  const [filteredEmployeeIds, setFilteredEmployeeIds] = useState<Set<string>>(new Set());
  const [colorSavingId, setColorSavingId] = useState<string | null>(null);

  const preselectClient = searchParams.get('client');
  const preselectJob = searchParams.get('job');

  // ── Load team members ──────────────────────────────────────────
  const { data: teamMembers } = useQuery<TeamMember[]>({
    queryKey: ['team-members-schedule'],
    queryFn: async () => {
      if (!profile?.company_id) return [];
      const { data, error } = await supabase.rpc('get_company_members', {
        p_company_id: profile.company_id,
      });
      if (error) throw error;
      return (data ?? []).map((m: {
        id: string; name: string; email: string; schedule_color?: string | null;
      }) => ({
        id: m.id,
        name: m.name,
        email: m.email,
        schedule_color: m.schedule_color ?? null,
      }));
    },
    enabled: !!profile,
  });

  const setScheduleColor = async (memberId: string, color: string | null) => {
    setColorSavingId(memberId);
    try {
      const { error } = await supabase.rpc('set_member_schedule_color', {
        p_member_id: memberId,
        p_color: color,
      });
      if (error) throw error;
      queryClient.setQueryData<TeamMember[]>(['team-members-schedule'], prev =>
        (prev ?? []).map(m => (m.id === memberId ? { ...m, schedule_color: color } : m)),
      );
      queryClient.invalidateQueries({ queryKey: ['team-members-schedule'] });
    } catch (e) {
      console.error(e);
      alert(e instanceof Error ? e.message : 'Could not save colour');
    } finally {
      setColorSavingId(null);
    }
  };

  // ── Date range for query ───────────────────────────────────────
  const rangeStart = useMemo(() => {
    if (viewMode === 'day') return format(currentDate, 'yyyy-MM-dd');
    if (viewMode === 'week')
      return format(startOfWeek(currentDate, { weekStartsOn: 1 }), 'yyyy-MM-dd');
    if (viewMode === 'list') {
      // List view: show next 30 days from today
      return format(new Date(), 'yyyy-MM-dd');
    }
    return format(startOfWeek(startOfMonth(currentDate), { weekStartsOn: 1 }), 'yyyy-MM-dd');
  }, [currentDate, viewMode]);

  const rangeEnd = useMemo(() => {
    if (viewMode === 'day') return format(currentDate, 'yyyy-MM-dd');
    if (viewMode === 'week')
      return format(endOfWeek(currentDate, { weekStartsOn: 1 }), 'yyyy-MM-dd');
    if (viewMode === 'list') {
      return format(addDays(new Date(), 30), 'yyyy-MM-dd');
    }
    return format(endOfWeek(endOfMonth(currentDate), { weekStartsOn: 1 }), 'yyyy-MM-dd');
  }, [currentDate, viewMode]);

  // ── Load jobs in range ─────────────────────────────────────────
  const { data: jobs, isLoading, error } = useQuery<JobWithClient[]>({
    queryKey: ['jobs', rangeStart, rangeEnd],
    queryFn: async () => {
      let query = supabase
        .from('jobs')
        .select('*')
        .gte('scheduled_date', rangeStart)
        .lte('scheduled_date', rangeEnd)
        .order('start_time', { ascending: true, nullsFirst: false });

      const { data: jobsData, error } = await query;
      if (error) throw error;
      const jobs = (jobsData ?? []) as Job[];

      const clientIds = [...new Set(jobs.map(j => j.client_id).filter(Boolean))] as string[];
      let clientMap = new Map<string, Client>();
      if (clientIds.length > 0) {
        const { data: clientsData } = await supabase
          .from('clients')
          .select('*')
          .in('id', clientIds);
        for (const c of clientsData ?? []) {
          clientMap.set(c.id, c as Client);
        }
      }

      return jobs.map(j => ({
        ...j,
        client_name: j.client_id ? clientMap.get(j.client_id)?.name ?? null : null,
        client_phone: j.client_id ? clientMap.get(j.client_id)?.phone ?? null : null,
        client_address: j.client_id ? clientMap.get(j.client_id)?.address ?? null : null,
      }));
    },
    enabled: !!profile,
  });

  // ── Load preselected job ───────────────────────────────────────
  useQuery({
    queryKey: ['job-detail', preselectJob],
    queryFn: async () => {
      const { data } = await supabase
        .from('jobs')
        .select('*')
        .eq('id', preselectJob!)
        .maybeSingle();
      if (data) {
        setEditingJob(data as Job);
        setShowForm(true);
      }
      return data;
    },
    enabled: !!preselectJob && !!profile,
  });

  // ── Preselect client for new job form ──────────────────────────
  useEffect(() => {
    if (preselectClient) {
      setPresetClientId(preselectClient);
      setShowForm(true);
      setSearchParams({}, { replace: true });
    }
  }, [preselectClient]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Mutations ──────────────────────────────────────────────────
  const updateJobStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: JobStatus }) => {
      const { error } = await supabase.from('jobs').update({ status, updated_at: new Date().toISOString() }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['jobs'] }),
  });

  const rescheduleJob = useMutation({
    mutationFn: async ({ id, date, employeeId }: { id: string; date: string; employeeId?: string }) => {
      const updates: any = { scheduled_date: date, updated_at: new Date().toISOString() };
      if (employeeId !== undefined) {
        updates.assigned_team = [employeeId];
      }
      const { error } = await supabase.from('jobs').update(updates).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['jobs'] }),
  });

  // ── Handlers ───────────────────────────────────────────────────
  const handleDayClick = (dateStr: string, employeeId?: string) => {
    setSelectedDate(dateStr);
    setPresetEmployeeId(employeeId);
    setEditingJob(null);
    setShowForm(true);
  };

  const handleCloseForm = () => {
    setShowForm(false);
    setEditingJob(null);
    setSelectedDate(null);
    setPresetClientId(null);
    setPresetEmployeeId(undefined);
    if (preselectJob) setSearchParams({}, { replace: true });
  };

  const toggleEmployeeFilter = (id: string) => {
    setFilteredEmployeeIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const clearEmployeeFilters = () => setFilteredEmployeeIds(new Set());

  // ── View config ────────────────────────────────────────────────
  const viewIcons: Record<ViewMode, any> = {
    day: Columns3,
    week: LayoutGrid,
    month: CalIcon,
    list: List,
  };

  if (error) return <AppShell><PageError message="Could not load schedule" /></AppShell>;

  return (
    <AppShell>
      <div className="max-w-[1400px] mx-auto px-4 py-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
          <div>
            <h1 className="text-xl font-semibold text-[#1A1A1A]">Schedule</h1>
            <p className="text-sm text-[#4A5568] mt-0.5">
              {jobs?.length ?? 0} jobs in view
              {viewMode === 'day' && ` · ${format(currentDate, 'EEEE, d MMMM yyyy')}`}
            </p>
          </div>
          <button
            onClick={() => {
              setEditingJob(null);
              setSelectedDate(format(currentDate, 'yyyy-MM-dd'));
              setPresetEmployeeId(undefined);
              setShowForm(true);
            }}
            className="btn-primary"
          >
            <Plus size={16} /> New Job
          </button>
        </div>

        {/* Toolbar */}
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <button onClick={() => setCurrentDate(new Date())}
              className="px-3 py-1.5 text-sm font-medium text-[#4A5568] border border-[#E5E7EB] rounded-md hover:bg-gray-50">
              Today
            </button>
            <div className="flex items-center">
              <button
                onClick={() => setCurrentDate(d =>
                  viewMode === 'month' ? addMonths(d, -1)
                  : viewMode === 'day' ? addDays(d, -1)
                  : addWeeks(d, -1)
                )}
                className="w-8 h-8 flex items-center justify-center rounded-l-md border border-[#E5E7EB] hover:bg-gray-50 text-[#4A5568]"
              >
                <ChevronLeft size={16} />
              </button>
              <button
                onClick={() => setCurrentDate(d =>
                  viewMode === 'month' ? addMonths(d, 1)
                  : viewMode === 'day' ? addDays(d, 1)
                  : addWeeks(d, 1)
                )}
                className="w-8 h-8 flex items-center justify-center rounded-r-md border-y border-r border-[#E5E7EB] hover:bg-gray-50 text-[#4A5568]"
              >
                <ChevronRight size={16} />
              </button>
            </div>
            <h2 className="text-sm font-semibold text-[#1A1A1A] ml-1">
              {viewMode === 'day' && format(currentDate, 'd MMMM yyyy')}
              {viewMode === 'week' && `${format(startOfWeek(currentDate, { weekStartsOn: 1 }), 'd MMM')} – ${format(endOfWeek(currentDate, { weekStartsOn: 1 }), 'd MMM yyyy')}`}
              {viewMode === 'month' && format(currentDate, 'MMMM yyyy')}
              {viewMode === 'list' && 'Next 30 Days'}
            </h2>
          </div>

          {/* View toggle */}
          <div className="flex items-center gap-0.5 bg-gray-100 rounded-lg p-0.5">
            {(['day', 'week', 'month', 'list'] as ViewMode[]).map(mode => {
              const Icon = viewIcons[mode];
              return (
                <button
                  key={mode}
                  onClick={() => setViewMode(mode)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors capitalize ${
                    viewMode === mode ? 'bg-white text-[#0A2540] shadow-sm' : 'text-[#6B7280] hover:text-[#374151]'
                  }`}
                >
                  <Icon size={14} />
                  {mode}
                </button>
              );
            })}
          </div>
        </div>

        {/* Employee filter pills (day & week views) — click swatch to change colour */}
        {(viewMode === 'day' || viewMode === 'week') && teamMembers && teamMembers.length > 0 && (
          <div className="flex items-center gap-2 mb-3 flex-wrap">
            <div className="flex items-center gap-1.5 text-xs font-medium text-[#4A5568]">
              <Users size={13} /> Team:
            </div>
            <span className="text-[10px] text-[#9CA3AF] hidden sm:inline">Click a colour dot to change it</span>
            {filteredEmployeeIds.size > 0 && (
              <button onClick={clearEmployeeFilters}
                className="flex items-center gap-1 text-xs text-[#2E75B6] hover:underline">
                <X size={11} /> Clear filter
              </button>
            )}
            <div className="flex items-center gap-1.5 flex-wrap">
              {teamMembers.map(m => {
                const active = filteredEmployeeIds.size === 0 || filteredEmployeeIds.has(m.id);
                const color = pickEmployeeColor(m.id, m.schedule_color);
                return (
                  <div
                    key={m.id}
                    className={`flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium border transition-all ${
                      active
                        ? 'border-transparent bg-white shadow-sm'
                        : 'border-[#E5E7EB] bg-gray-50 opacity-50 hover:opacity-80'
                    }`}
                  >
                    <EmployeeColorSwatch
                      name={m.name}
                      color={color}
                      savedColor={m.schedule_color}
                      disabled={colorSavingId === m.id}
                      onPick={hex => void setScheduleColor(m.id, hex)}
                    />
                    <button
                      type="button"
                      onClick={() => toggleEmployeeFilter(m.id)}
                      className="hover:underline"
                      title={active && filteredEmployeeIds.size > 0 ? 'Hide from board' : 'Filter to this person'}
                    >
                      {m.name}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Board */}
        {isLoading ? (
          <div className="flex justify-center py-20"><LoadingSpinner /></div>
        ) : viewMode === 'day' ? (
          <DayBoardView
            jobs={jobs ?? []}
            teamMembers={teamMembers ?? []}
            currentDate={currentDate}
            onJobClick={job => { setEditingJob(job); setShowForm(true); }}
            onDayClick={handleDayClick}
            onJobDrop={(id, date, empId) => rescheduleJob.mutate({ id, date, employeeId: empId })}
            filteredEmployeeIds={filteredEmployeeIds}
          />
        ) : viewMode === 'week' ? (
          <WeekBoardView
            jobs={jobs ?? []}
            teamMembers={teamMembers ?? []}
            currentDate={currentDate}
            onJobClick={job => { setEditingJob(job); setShowForm(true); }}
            onDayClick={handleDayClick}
            onJobDrop={(id, date) => rescheduleJob.mutate({ id, date })}
            filteredEmployeeIds={filteredEmployeeIds}
          />
        ) : viewMode === 'month' ? (
          <MonthBoardView
            jobs={jobs ?? []}
            teamMembers={teamMembers ?? []}
            currentDate={currentDate}
            onJobClick={job => { setEditingJob(job); setShowForm(true); }}
            onDayClick={handleDayClick}
            onJobDrop={(id, date) => rescheduleJob.mutate({ id, date })}
            filteredEmployeeIds={filteredEmployeeIds}
          />
        ) : (
          <JobListView
            jobs={jobs ?? []}
            teamMembers={teamMembers ?? []}
            onEdit={job => { setEditingJob(job); setShowForm(true); }}
            onStatusChange={(id, status) => updateJobStatus.mutate({ id, status })}
          />
        )}
      </div>

      {showForm && (
        <JobFormModal
          job={editingJob}
          presetDate={selectedDate}
          presetClientId={presetClientId}
          presetEmployeeId={presetEmployeeId}
          onClose={handleCloseForm}
          onSaved={() => {
            handleCloseForm();
            queryClient.invalidateQueries({ queryKey: ['jobs'] });
          }}
        />
      )}
    </AppShell>
  );
}

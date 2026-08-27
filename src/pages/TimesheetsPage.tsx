import { useState, useMemo, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { pageQueryBlocked } from '../lib/devFieldAuditAuth';
import { getAuditJobs, getAuditTeamMembers } from '../lib/devFieldAuditDocs';
import { AppShell } from '../components/layout/AppShell';
import { LoadingSpinner, PageError, EmptyState, SearchBar, useToast } from '../components/ui';
import { TimeEntryForm } from '../components/timesheets/TimeEntryForm';
import { format, parseISO, startOfWeek, addDays, isSameDay } from 'date-fns';
import { Clock, Play, Square, Plus, ChevronLeft, ChevronRight } from 'lucide-react';
import type { Timesheet, TimesheetEntry } from '../types/fsm';
import { formatDuration } from '../types/fsm';
import {
  TIMESHEET_LIST_DEFAULT_FILTER,
  TIMESHEET_LIST_FILTERS,
  getAuditTimesheetEntries,
  getAuditTimesheets,
  timesheetListAttachJobs,
  timesheetListCountLabel,
  timesheetListEmptyKind,
  timesheetListEmptyMessage,
  timesheetListEmptyTitle,
  timesheetListOpenHref,
  timesheetListOpenId,
  timesheetListOpened,
  timesheetListPillClass,
  timesheetListVisibleItems,
  timesheetListWeekStart,
  type TimesheetListFilter,
} from '../lib/timesheetsList';

export function TimesheetsPage() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const [currentWeek, setCurrentWeek] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [selectedEmployee, setSelectedEmployee] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<TimesheetListFilter>(TIMESHEET_LIST_DEFAULT_FILTER);
  const presetJobId = searchParams.get('job');
  const openId = timesheetListOpenId(searchParams.get('id'));
  const [showEntryForm, setShowEntryForm] = useState(() => !!presetJobId);

  const { data: teamMembers, isFetched: teamFetched } = useQuery({
    queryKey: ['team-members'],
    queryFn: async () => {
      const mock = getAuditTeamMembers();
      if (mock) return mock;
      const { data, error } = await supabase.rpc('get_company_members', { p_company_id: profile!.company_id });
      if (error) throw error;
      return (data ?? []) as { id: string; name: string; email: string; role: string }[];
    },
    enabled: !!profile,
  });

  // Auto-select current user
  useEffect(() => {
    if (selectedEmployee) return;
    if (teamMembers && teamMembers.length > 0) {
      const me = teamMembers.find(m => m.id === profile?.id);
      setSelectedEmployee(me?.id ?? teamMembers[0].id);
      return;
    }
    if (teamFetched && profile?.id) setSelectedEmployee(profile.id);
  }, [teamMembers, teamFetched, selectedEmployee, profile]);

  const weekStart = format(currentWeek, 'yyyy-MM-dd');
  const weekEnd = format(addDays(currentWeek, 6), 'yyyy-MM-dd');

  const { data: timesheets, isLoading, error } = useQuery({
    queryKey: ['timesheets', weekStart, selectedEmployee],
    queryFn: async () => {
      const audit = getAuditTimesheets();
      if (audit) return audit;
      const { data, error } = await supabase
        .from('timesheets')
        .select('*')
        .eq('company_id', profile!.company_id)
        .gte('date', weekStart)
        .lte('date', weekEnd)
        .order('date');
      if (error) throw error;
      return (data ?? []) as Timesheet[];
    },
    enabled: !!profile,
  });

  const needsRemoteOpen = !!openId && !(timesheets ?? []).some(t => t.id === openId);

  const { data: openedRemote } = useQuery({
    queryKey: ['timesheet-open', openId],
    queryFn: async () => {
      const audit = getAuditTimesheets();
      if (audit) return audit.find(t => t.id === openId) ?? null;
      const { data, error } = await supabase
        .from('timesheets')
        .select('*')
        .eq('id', openId)
        .eq('company_id', profile!.company_id)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as Timesheet | null;
    },
    enabled: !!profile && needsRemoteOpen,
  });

  useEffect(() => {
    if (!openedRemote) return;
    setSelectedEmployee(openedRemote.employee_id);
    setCurrentWeek(timesheetListWeekStart(openedRemote.date));
  }, [openedRemote]);

  const { data: entries } = useQuery({
    queryKey: ['timesheet-entries', selectedEmployee, weekStart],
    queryFn: async () => {
      if (!selectedEmployee) return [];
      const tsIds = (timesheets ?? []).filter(t => t.employee_id === selectedEmployee).map(t => t.id);
      if (tsIds.length === 0) return [];
      const auditEntries = getAuditTimesheetEntries();
      if (auditEntries) return auditEntries.filter(entry => tsIds.includes(entry.timesheet_id));
      const { data, error } = await supabase.from('timesheet_entries').select('*').in('timesheet_id', tsIds).order('start_time');
      if (error) throw error;
      return (data ?? []) as TimesheetEntry[];
    },
    enabled: !!selectedEmployee && !!timesheets,
  });

  const { data: jobs } = useQuery({
    queryKey: ['jobs-for-timesheets'],
    queryFn: async () => {
      const mock = getAuditJobs();
      if (mock) return mock.map(j => ({ id: j.id, title: j.title, job_number: j.job_number }));
      const { data, error } = await supabase
        .from('jobs')
        .select('id, title, job_number')
        .order('scheduled_date', { ascending: false, nullsFirst: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as { id: string; title: string; job_number: number | null }[];
    },
    enabled: !!profile,
  });

  const clockInMutation = useMutation({
    mutationFn: async () => {
      const today = format(new Date(), 'yyyy-MM-dd');
      const existing = (timesheets ?? []).find(t => t.employee_id === selectedEmployee && t.date === today);
      if (existing) {
        const { error } = await supabase.from('timesheets').update({ clock_in: new Date().toISOString(), status: 'open' }).eq('id', existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('timesheets').insert({ company_id: profile!.company_id, employee_id: selectedEmployee, date: today, clock_in: new Date().toISOString(), status: 'open' });
        if (error) throw error;
      }
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['timesheets'] }); showToast('Clocked in'); },
  });

  const clockOutMutation = useMutation({
    mutationFn: async () => {
      const today = format(new Date(), 'yyyy-MM-dd');
      const existing = (timesheets ?? []).find(t => t.employee_id === selectedEmployee && t.date === today);
      if (!existing || !existing.clock_in) return;
      const clockOut = new Date();
      const clockIn = new Date(existing.clock_in);
      const totalMin = Math.round((clockOut.getTime() - clockIn.getTime()) / 60000) - existing.break_minutes;
      const { error } = await supabase.from('timesheets').update({ clock_out: clockOut.toISOString(), total_minutes: Math.max(0, totalMin), status: 'open' }).eq('id', existing.id);
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['timesheets'] }); showToast('Clocked out'); },
  });

  const submitMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('timesheets').update({ status: 'submitted' }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['timesheets'] }); showToast('Timesheet submitted'); },
  });

  const myTimesheets = useMemo(() => {
    if (!selectedEmployee) return [];
    return (timesheets ?? []).filter(t => t.employee_id === selectedEmployee);
  }, [timesheets, selectedEmployee]);

  const decorated = useMemo(() => {
    const names = new Map((teamMembers ?? []).map(m => [m.id, m.name]));
    return myTimesheets.map(t => ({
      ...timesheetListAttachJobs(t, entries ?? [], jobs ?? []),
      employee_name: names.get(t.employee_id) ?? null,
    }));
  }, [myTimesheets, entries, jobs, teamMembers]);

  const visible = useMemo(
    () => timesheetListVisibleItems(decorated, { filter, query: search, job: presetJobId }),
    [decorated, filter, search, presetJobId],
  );

  const empty = timesheetListEmptyKind({
    total: decorated.length,
    visible: visible.length,
    filter,
    query: search,
  });

  const opened = timesheetListOpened(myTimesheets, openId);
  const todayTs = myTimesheets.find(t => isSameDay(parseISO(t.date), new Date()));
  const isClockedIn = !!todayTs?.clock_in && !todayTs?.clock_out;
  const shownEntries = useMemo(() => {
    const all = entries ?? [];
    if (!openId) return all;
    return all.filter(entry => entry.timesheet_id === openId);
  }, [entries, openId]);

  if (isLoading) return <AppShell><div className="ops-page hub-timesheets"><div className="flex justify-center py-20"><LoadingSpinner /></div></div></AppShell>;
  if (pageQueryBlocked(error)) return <AppShell><div className="ops-page hub-timesheets"><PageError message="Could not load timesheets" /></div></AppShell>;

  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(currentWeek, i));

  return (
    <AppShell>
      <div className="ops-page hub-timesheets">
        <div className="ops-page-head">
          <div>
            <p className="hub-timesheets-kicker">Timesheets</p>
            <h1 className="ops-page-title">Timesheets</h1>
            <p className="hub-timesheets-lede">{timesheetListCountLabel(visible.length)}</p>
            <p className="hub-timesheets-lede">Week of {format(currentWeek, 'dd MMM')} — {format(addDays(currentWeek, 6), 'dd MMM yyyy')}</p>
          </div>
          <div className="hub-timesheets-tools">
            {isClockedIn ? (
              <button onClick={() => clockOutMutation.mutate()} className="btn-danger">
                <Square size={16} /> Clock Out
              </button>
            ) : (
              <button onClick={() => clockInMutation.mutate()} className="inline-flex items-center gap-2 bg-[#16A34A] text-white px-3 py-2 rounded-md text-sm font-medium hover:bg-[#15803D] transition-all duration-200 active:scale-[0.98]">
                <Play size={16} /> Clock In
              </button>
            )}
            <button onClick={() => setShowEntryForm(true)} className="btn-primary">
              <Plus size={16} /> Add Entry
            </button>
          </div>
        </div>

        <div className="hub-timesheets-weekbar">
          <div className="hub-timesheets-weeknav">
            <button type="button" onClick={() => setCurrentWeek(addDays(currentWeek, -7))} className="hub-timesheets-week-btn" aria-label="Previous week"><ChevronLeft size={18} /></button>
            <button type="button" onClick={() => setCurrentWeek(startOfWeek(new Date(), { weekStartsOn: 1 }))} className="hub-timesheets-week-btn">Today</button>
            <button type="button" onClick={() => setCurrentWeek(addDays(currentWeek, 7))} className="hub-timesheets-week-btn" aria-label="Next week"><ChevronRight size={18} /></button>
          </div>
          <select
            value={selectedEmployee ?? ''}
            onChange={e => setSelectedEmployee(e.target.value)}
            className="hub-timesheets-select"
            aria-label="Employee"
          >
            {(teamMembers ?? []).map(m => <option key={m.id} value={m.id}>{m.name}{m.id === profile?.id ? ' (You)' : ''}</option>)}
          </select>
        </div>

        <div className="hub-timesheets-chrome">
          <div className="hub-timesheets-filters" role="group" aria-label="Filter timesheets">
            {TIMESHEET_LIST_FILTERS.map(opt => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setFilter(opt.value)}
                className={`hub-chrome-filter ${filter === opt.value ? 'hub-chrome-filter-on' : ''}`}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <SearchBar
            value={search}
            onChange={setSearch}
            placeholder="Search job, date, #0042…"
            className="hub-timesheets-search"
          />
        </div>

        <div className="hub-timesheets-days">
          {weekDays.map((day, i) => {
            const ts = myTimesheets.find(t => isSameDay(parseISO(t.date), day));
            const isToday = isSameDay(day, new Date());
            const isOpen = !!ts && ts.id === openId;
            const inner = (
              <>
                <span className="hub-timesheets-day-name">{format(day, 'EEE')}</span>
                <span className="hub-timesheets-day-num">{format(day, 'dd')}</span>
                {ts && ts.total_minutes > 0 && <span className="hub-timesheets-day-hrs">{formatDuration(ts.total_minutes)}</span>}
              </>
            );
            return ts ? (
              <Link
                key={i}
                to={timesheetListOpenHref(ts.id, presetJobId)}
                className={`hub-timesheets-day ${isOpen ? 'is-open' : ''} ${isToday ? 'is-today' : ''}`}
              >
                {inner}
              </Link>
            ) : (
              <div key={i} className={`hub-timesheets-day ${isToday ? 'is-today' : ''}`}>{inner}</div>
            );
          })}
        </div>

        <div className="hub-timesheets-sheet">
          <div className="hub-timesheets-thead">
            <span>Date</span>
            <span>Job</span>
            <span>Hours</span>
            <span>Status</span>
            <span />
          </div>
          {empty && (
            <EmptyState
              icon={Clock}
              title={timesheetListEmptyTitle(empty)}
              message={timesheetListEmptyMessage(empty)}
            />
          )}
          {visible.map(item => {
            const isOpen = item.row.id === openId;
            return (
              <Link
                key={item.row.id}
                to={item.href}
                className={`hub-timesheets-row ${isOpen ? 'is-open' : ''}`}
              >
                <span className="hub-timesheets-date">
                  <span className="hub-timesheets-date-name">{item.title}</span>
                </span>
                <span className="hub-timesheets-job">{item.jobLine || '—'}</span>
                <span className="hub-timesheets-hours">{item.hoursLabel}</span>
                <span className={`hub-timesheets-pill ${timesheetListPillClass(item.row.status)}`}>{item.statusLabel}</span>
                <span className="hub-timesheets-row-next">
                  <span className="hub-next">Open</span>
                </span>
              </Link>
            );
          })}
        </div>

        <div className="hub-timesheets-sheet hub-timesheets-entries">
          <h3 className="hub-timesheets-group">
            {opened ? `Time entries · ${format(parseISO(opened.date), 'dd MMM')}` : 'Time entries'}
          </h3>
          {shownEntries.length === 0 ? (
            <EmptyState
              icon={Clock}
              title={openId ? 'No time entries on this timesheet' : 'No time entries for this week'}
              message={openId ? 'Add an entry on this day, or clock in.' : 'Clock in or add an entry to start tracking time. Open a timesheet from the list above.'}
            />
          ) : (
            shownEntries.map(entry => {
              const ts = myTimesheets.find(t => t.id === entry.timesheet_id);
              const duration = entry.end_time
                ? Math.round((new Date(entry.end_time).getTime() - new Date(entry.start_time).getTime()) / 60000)
                : 0;
              return (
                <div key={entry.id} className="hub-timesheets-entry">
                  <span className="hub-timesheets-date">
                    <span className="hub-timesheets-date-name">{ts ? format(parseISO(ts.date), 'dd MMM') : '—'}</span>
                    <span className="hub-timesheets-muted">
                      {format(new Date(entry.start_time), 'HH:mm')}
                      {entry.end_time ? ` — ${format(new Date(entry.end_time), 'HH:mm')}` : ' — running'}
                    </span>
                  </span>
                  <span className="hub-timesheets-muted">
                    {entry.work_type || ''}
                    {entry.job_id ? ` · ${jobs?.find(j => j.id === entry.job_id)?.title ?? 'Job'}` : ''}
                    {entry.billable ? ' · Billable' : ' · Non-billable'}
                  </span>
                  <span className="hub-timesheets-hours">{duration > 0 ? formatDuration(duration) : '—'}</span>
                </div>
              );
            })
          )}
          {(opened ? [opened] : myTimesheets).length > 0 && (
            <div className="hub-timesheets-submit">
              <p className="hub-timesheets-muted">Submit timesheets for approval when ready</p>
              <div className="hub-timesheets-submit-acts">
                {(opened ? [opened] : myTimesheets).filter(t => t.status === 'open' && t.total_minutes > 0).map(t => (
                  <button key={t.id} type="button" onClick={() => submitMutation.mutate(t.id)} className="hub-timesheets-week-btn">
                    Submit {format(parseISO(t.date), 'dd MMM')}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {showEntryForm && selectedEmployee && (
        <TimeEntryForm
          timesheets={myTimesheets}
          jobs={jobs ?? []}
          employeeId={selectedEmployee}
          presetJobId={presetJobId ?? undefined}
          onClose={() => {
            setShowEntryForm(false);
            if (presetJobId) {
              const next = new URLSearchParams(searchParams);
              next.delete('job');
              setSearchParams(next, { replace: true });
            }
          }}
          onSaved={() => {
            setShowEntryForm(false);
            if (presetJobId) {
              const next = new URLSearchParams(searchParams);
              next.delete('job');
              setSearchParams(next, { replace: true });
            }
            queryClient.invalidateQueries();
            showToast('Entry saved');
          }}
        />
      )}
    </AppShell>
  );
}

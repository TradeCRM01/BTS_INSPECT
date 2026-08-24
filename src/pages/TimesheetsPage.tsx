import { useState, useMemo, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { pageQueryBlocked } from '../lib/devFieldAuditAuth';
import { AppShell } from '../components/layout/AppShell';
import { LoadingSpinner, PageError, EmptyState, useToast } from '../components/ui';
import { TimeEntryForm } from '../components/timesheets/TimeEntryForm';
import { format, parseISO, startOfWeek, addDays, isSameDay } from 'date-fns';
import { Clock, Play, Square, Plus, ChevronLeft, ChevronRight } from 'lucide-react';
import type { Timesheet, TimesheetEntry } from '../types/fsm';
import { TIMESHEET_STATUS_LABELS, formatDuration } from '../types/fsm';

export function TimesheetsPage() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const [currentWeek, setCurrentWeek] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [selectedEmployee, setSelectedEmployee] = useState<string | null>(null);
  const presetJobId = searchParams.get('job');
  const [showEntryForm, setShowEntryForm] = useState(() => !!presetJobId);

  const { data: teamMembers, isFetched: teamFetched } = useQuery({
    queryKey: ['team-members'],
    queryFn: async () => {
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

  const { data: entries } = useQuery({
    queryKey: ['timesheet-entries', selectedEmployee, weekStart],
    queryFn: async () => {
      if (!selectedEmployee) return [];
      const tsIds = (timesheets ?? []).filter(t => t.employee_id === selectedEmployee).map(t => t.id);
      if (tsIds.length === 0) return [];
      const { data, error } = await supabase.from('timesheet_entries').select('*').in('timesheet_id', tsIds).order('start_time');
      if (error) throw error;
      return (data ?? []) as TimesheetEntry[];
    },
    enabled: !!selectedEmployee && !!timesheets,
  });

  const { data: jobs } = useQuery({
    queryKey: ['jobs-for-timesheets'],
    queryFn: async () => {
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

  const weekTotal = useMemo(() => {
    return myTimesheets.reduce((s, t) => s + (t.total_minutes ?? 0), 0);
  }, [myTimesheets]);

  const todayTs = myTimesheets.find(t => isSameDay(parseISO(t.date), new Date()));
  const isClockedIn = !!todayTs?.clock_in && !todayTs?.clock_out;

  if (isLoading) return <AppShell><div className="flex justify-center py-20"><LoadingSpinner /></div></AppShell>;
  if (pageQueryBlocked(error)) return <AppShell><PageError message="Could not load timesheets" /></AppShell>;

  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(currentWeek, i));

  return (
    <AppShell>
      <div className="max-w-[1200px] mx-auto px-4 py-6">
        <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
          <div>
            <h1 className="text-xl font-semibold text-[#1A1A1A]">Timesheets</h1>
            <p className="text-sm text-[#4A5568] mt-0.5">Week of {format(currentWeek, 'dd MMM')} — {format(addDays(currentWeek, 6), 'dd MMM yyyy')}</p>
          </div>
          <div className="flex items-center gap-2">
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

        {/* Week navigation + employee selector */}
        <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
          <div className="flex items-center gap-2">
            <button onClick={() => setCurrentWeek(addDays(currentWeek, -7))} className="p-2 rounded-lg border border-[#E5E7EB] hover:bg-[#F9FAFB] text-[#4A5568]"><ChevronLeft size={18} /></button>
            <button onClick={() => setCurrentWeek(startOfWeek(new Date(), { weekStartsOn: 1 }))} className="px-3 py-1.5 text-sm font-medium text-[#0A2540] border border-[#E5E7EB] rounded-md hover:bg-[#F9FAFB]">Today</button>
            <button onClick={() => setCurrentWeek(addDays(currentWeek, 7))} className="p-2 rounded-lg border border-[#E5E7EB] hover:bg-[#F9FAFB] text-[#4A5568]"><ChevronRight size={18} /></button>
          </div>
          <select value={selectedEmployee ?? ''} onChange={e => setSelectedEmployee(e.target.value)}
            className="min-h-[44px] h-auto py-2 px-3 text-sm border border-[#E5E7EB] rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-[#2E75B6]">
            {(teamMembers ?? []).map(m => <option key={m.id} value={m.id}>{m.name}{m.id === profile?.id ? ' (You)' : ''}</option>)}
          </select>
        </div>

        {/* Summary */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
          <SummaryCard label="Week Total" value={formatDuration(weekTotal)} accentColor="#0A2540" />
          <SummaryCard label="Days Worked" value={`${myTimesheets.filter(t => t.total_minutes > 0).length}`} accentColor="#2E75B6" />
          <SummaryCard label="Status" value={todayTs ? TIMESHEET_STATUS_LABELS[todayTs.status] : '—'} accentColor="#16A34A" />
          <SummaryCard label="Clocked In" value={isClockedIn ? 'Yes' : 'No'} accentColor={isClockedIn ? '#16A34A' : '#6B7280'} />
        </div>

        {/* Week grid */}
        <div className="bg-white rounded-xl border border-[#E5E7EB] shadow-sm overflow-hidden">
          <div className="grid grid-cols-7 border-b border-[#E5E7EB]">
            {weekDays.map((day, i) => {
              const ts = myTimesheets.find(t => isSameDay(parseISO(t.date), day));
              const isToday = isSameDay(day, new Date());
              return (
                <div key={i} className={`p-3 text-center ${isToday ? 'bg-blue-50' : 'bg-[#F9FAFB]'}`}>
                  <p className="text-xs font-medium text-[#6B7280] uppercase">{format(day, 'EEE')}</p>
                  <p className={`text-lg font-bold ${isToday ? 'text-[#2E75B6]' : 'text-[#1A1A1A]'}`}>{format(day, 'dd')}</p>
                  {ts && ts.total_minutes > 0 && <p className="text-xs text-[#4A5568] mt-1">{formatDuration(ts.total_minutes)}</p>}
                </div>
              );
            })}
          </div>

          {/* Entries list */}
          <div className="p-4">
            <h3 className="text-sm font-semibold text-[#1A1A1A] mb-3">Time Entries</h3>
            {(entries ?? []).length === 0 ? (
          <EmptyState
            icon={Clock}
            title="No time entries for this week"
            message="Clock in or add an entry to start tracking time."
          />
            ) : (
              <div className="space-y-2">
                {(entries ?? []).map(entry => {
                  const ts = myTimesheets.find(t => t.id === entry.timesheet_id);
                  const duration = entry.end_time
                    ? Math.round((new Date(entry.end_time).getTime() - new Date(entry.start_time).getTime()) / 60000)
                    : 0;
                  return (
                    <div key={entry.id} className="flex items-center justify-between p-3 rounded-lg border border-[#E5E7EB] hover:bg-[#F9FAFB] transition-colors">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-[#0A2540]/5 flex items-center justify-center">
                          <Clock size={18} className="text-[#0A2540]" />
                        </div>
                        <div>
                          <p className="text-sm font-medium text-[#1A1A1A]">{ts ? format(parseISO(ts.date), 'dd MMM') : '—'}</p>
                          <p className="text-xs text-[#4A5568]">
                            {format(new Date(entry.start_time), 'HH:mm')}
                            {entry.end_time ? ` — ${format(new Date(entry.end_time), 'HH:mm')}` : ' — running'}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        {entry.work_type && <span className="text-xs text-[#6B7280]">{entry.work_type}</span>}
                        {entry.job_id && (
                          <Link to={`/jobs/${entry.job_id}`} className="text-xs text-[#2E75B6] hover:underline">
                            {jobs?.find(j => j.id === entry.job_id)?.title ?? 'Job'}
                          </Link>
                        )}
                        {entry.billable ? <span className="text-xs text-green-600 font-medium">Billable</span> : <span className="text-xs text-gray-500">Non-billable</span>}
                        {duration > 0 && <span className="text-sm font-medium text-[#1A1A1A]">{formatDuration(duration)}</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Submit section */}
          {myTimesheets.length > 0 && (
            <div className="px-4 py-3 border-t border-[#E5E7EB] flex items-center justify-between">
              <p className="text-sm text-[#4A5568]">Submit timesheets for approval when ready</p>
              <div className="flex items-center gap-2">
                {myTimesheets.filter(t => t.status === 'open' && t.total_minutes > 0).map(t => (
                  <button key={t.id} onClick={() => submitMutation.mutate(t.id)}
                    className="px-3 py-1.5 text-sm font-medium text-[#0A2540] border border-[#E5E7EB] rounded-md hover:bg-[#F9FAFB]">
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

function SummaryCard({ label, value, accentColor }: { label: string; value: string; accentColor: string }) {
  return (
    <div className="card-accent p-4">
      <p className="text-xs font-medium text-[#4A5568] uppercase tracking-wide">{label}</p>
      <p className="text-xl font-bold text-[#1A1A1A] mt-1">{value}</p>
      <div className="mt-2 h-1 rounded-full" style={{ backgroundColor: accentColor, opacity: 0.2 }} />
    </div>
  );
}

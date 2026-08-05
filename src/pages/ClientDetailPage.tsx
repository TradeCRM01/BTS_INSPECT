import { useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { AppShell } from '../components/layout/AppShell';
import { LoadingSpinner, PageError, Breadcrumbs, useToast } from '../components/ui';
import type { Client, Job, JobWithClient } from '../types/crm';
import { JOB_STATUS_LABELS, JOB_STATUS_STYLES, JOB_PRIORITY_DOT } from '../types/crm';
import { ArrowLeft, Phone, Mail, MapPin, Users, CreditCard as Edit3, X, Briefcase, Calendar, Clock, Plus, ChevronRight, FileText, ShieldCheck, Bell } from 'lucide-react';
import { format, parseISO, differenceInDays } from 'date-fns';
import { ClientForm } from './ClientsPage';
import type { ComplianceItem } from '../types/compliance';
import { COMPLIANCE_STATUS_LABELS, COMPLIANCE_STATUS_STYLES } from '../types/compliance';

export function ClientDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { profile } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [showEdit, setShowEdit] = useState(false);

  const { data: client, isLoading, error } = useQuery<Client>({
    queryKey: ['client', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('clients')
        .select('*')
        .eq('id', id!)
        .maybeSingle();
      if (error) throw error;
      return data as Client;
    },
    enabled: !!id && !!profile,
  });

  const { data: jobs } = useQuery<JobWithClient[]>({
    queryKey: ['client-jobs', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('jobs')
        .select('*')
        .eq('client_id', id!)
        .order('scheduled_date', { ascending: false, nullsFirst: false });
      if (error) throw error;
      return (data ?? []) as JobWithClient[];
    },
    enabled: !!id && !!profile,
  });

  const { data: complianceItems } = useQuery<ComplianceItem[]>({
    queryKey: ['client-compliance', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('compliance_items')
        .select('*')
        .eq('client_id', id!)
        .order('next_due_date', { ascending: true });
      if (error) throw error;
      return (data ?? []) as ComplianceItem[];
    },
    enabled: !!id && !!profile,
  });

  const { data: inspections } = useQuery({
    queryKey: ['client-inspections', id],
    queryFn: async () => {
      const jobIds = (jobs ?? []).map(j => j.inspection_id).filter(Boolean) as string[];
      if (jobIds.length === 0) return [];
      const { data, error } = await supabase
        .from('inspections')
        .select('id, status, started_at, template_snapshot, inspector_id')
        .in('id', jobIds)
        .order('started_at', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!id && !!profile && (jobs?.length ?? 0) > 0,
  });

  if (isLoading) return <AppShell><div className="flex justify-center py-20"><LoadingSpinner /></div></AppShell>;
  if (error || !client) return <AppShell><PageError message="Could not load this client" /></AppShell>;

  const activeJobs = (jobs ?? []).filter(j => j.status === 'scheduled' || j.status === 'in_progress');
  const completedJobs = (jobs ?? []).filter(j => j.status === 'completed');

  return (
    <AppShell>
      <div className="max-w-[900px] mx-auto px-4 py-6">
        <Breadcrumbs items={[{ label: 'Clients', to: '/clients' }, { label: client.name }]} />

        {/* Header card */}
        <div className="card p-5 mb-6">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-4 min-w-0">
              <div className="w-14 h-14 rounded-xl bg-[#0A2540]/10 flex items-center justify-center shrink-0">
                <Users size={26} className="text-[#0A2540]" />
              </div>
              <div className="min-w-0">
                <h1 className="text-lg font-semibold text-[#1A1A1A]">{client.name}</h1>
                {client.contact_person && (
                  <p className="text-sm text-[#4A5568] mt-0.5">{client.contact_person}</p>
                )}
                <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5">
                  {client.phone && (
                    <a href={`tel:${client.phone}`} className="flex items-center gap-1.5 text-sm text-[#2E75B6] hover:underline">
                      <Phone size={13} /> {client.phone}
                    </a>
                  )}
                  {client.email && (
                    <a href={`mailto:${client.email}`} className="flex items-center gap-1.5 text-sm text-[#2E75B6] hover:underline">
                      <Mail size={13} /> {client.email}
                    </a>
                  )}
                  {client.address && (
                    <div className="flex items-center gap-1.5 text-sm text-[#4A5568]">
                      <MapPin size={13} /> {client.address}
                    </div>
                  )}
                </div>
              </div>
            </div>
            <button onClick={() => setShowEdit(true)} className="btn-secondary">
              <Edit3 size={14} /> Edit
            </button>
          </div>

          {client.notes && (
            <div className="mt-4 pt-4 border-t border-[#F3F4F6]">
              <p className="text-xs font-medium text-[#4A5568] mb-1">Notes</p>
              <p className="text-sm text-[#1A1A1A] whitespace-pre-wrap">{client.notes}</p>
            </div>
          )}
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-3 gap-3 mb-6">
          <StatCard label="Total Jobs" value={jobs?.length ?? 0} icon={Briefcase} />
          <StatCard label="Active" value={activeJobs.length} icon={Calendar} color="text-blue-600" />
          <StatCard label="Completed" value={completedJobs.length} icon={FileText} color="text-green-600" />
        </div>

        {/* Jobs section */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-[#1A1A1A] uppercase tracking-wide">Job History</h2>
            <Link to={`/schedule?client=${client.id}`}
              className="flex items-center gap-1 text-sm text-[#2E75B6] hover:underline">
              <Plus size={14} /> Schedule Job
            </Link>
          </div>

          {(jobs ?? []).length === 0 ? (
            <div className="bg-white rounded-xl border border-[#E5E7EB] p-8 text-center">
              <Briefcase size={32} className="text-gray-300 mx-auto mb-2" />
              <p className="text-sm text-gray-500">No jobs yet for this client</p>
            </div>
          ) : (
            <div className="space-y-2">
              {(jobs ?? []).map(job => (
                <JobRow key={job.id} job={job} />
              ))}
            </div>
          )}
        </div>

        {/* Compliance items */}
        {(complianceItems ?? []).length > 0 && (
          <div className="mb-6">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-[#1A1A1A] uppercase tracking-wide">Compliance</h2>
              <Link to="/compliance" className="flex items-center gap-1 text-sm text-[#2E75B6] hover:underline">
                <ShieldCheck size={14} /> View All
              </Link>
            </div>
            <div className="space-y-2">
              {(complianceItems ?? []).map(ci => {
                const daysUntil = differenceInDays(parseISO(ci.next_due_date), new Date());
                return (
                  <div key={ci.id} className="flex items-center gap-3 bg-white rounded-lg border border-[#E5E7EB] p-3">
                    <ShieldCheck size={16} className="text-[#0A2540] shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-[#1A1A1A] truncate">{ci.title}</p>
                      <p className="text-xs text-[#6B7280]">
                        Due {format(parseISO(ci.next_due_date), 'd MMM yyyy')}
                        {daysUntil < 0 && <span className="text-[#B42318] font-medium"> · {Math.abs(daysUntil)} days overdue</span>}
                        {daysUntil >= 0 && daysUntil <= 30 && <span className="text-[#F7931A]"> · in {daysUntil} days</span>}
                      </p>
                    </div>
                    <span className={`text-xs px-2 py-0.5 rounded-full shrink-0 ${COMPLIANCE_STATUS_STYLES[ci.status]}`}>
                      {COMPLIANCE_STATUS_LABELS[ci.status]}
                    </span>
                    {ci.reminder_sent_at && (
                      <span className="text-[10px] text-[#6B7280] flex items-center gap-0.5 shrink-0">
                        <Bell size={9} /> {format(new Date(ci.reminder_sent_at), 'd MMM')}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Linked inspections */}
        {(inspections ?? []).length > 0 && (
          <div className="mb-6">
            <h2 className="text-sm font-semibold text-[#1A1A1A] uppercase tracking-wide mb-3">Linked Inspections</h2>
            <div className="space-y-2">
              {(inspections ?? []).map((insp: any) => {
                const to = insp.status === 'completed' || insp.status === 'issued'
                  ? `/inspections/${insp.id}/report`
                  : `/inspections/${insp.id}`;
                return (
                  <Link key={insp.id} to={to}
                    className="flex items-center gap-3 bg-white rounded-lg border border-[#E5E7EB] p-3 hover:shadow-sm transition-shadow">
                    <FileText size={16} className="text-[#2E75B6] shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-[#1A1A1A] truncate">
                        {insp.template_snapshot?.name ?? 'Inspection'}
                      </p>
                      <p className="text-xs text-[#9CA3AF]">{format(new Date(insp.started_at), 'd MMM yyyy')}</p>
                    </div>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${insp.status === 'completed' ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-700'}`}>
                      {insp.status}
                    </span>
                    <ChevronRight size={15} className="text-[#D1D5DB]" />
                  </Link>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {showEdit && (
        <ClientForm
          client={client}
          onClose={() => setShowEdit(false)}
          onSaved={() => {
            setShowEdit(false);
            queryClient.invalidateQueries({ queryKey: ['client', id] });
            queryClient.invalidateQueries({ queryKey: ['clients'] });
            showToast('Client updated');
          }}
        />
      )}
    </AppShell>
  );
}

function StatCard({ label, value, icon: Icon, color }: { label: string; value: number; icon: any; color?: string }) {
  return (
    <div className="bg-white rounded-xl border border-[#E5E7EB] shadow-sm p-4">
      <div className="flex items-center gap-2 mb-1">
        <Icon size={14} className={color ?? 'text-[#9CA3AF]'} />
        <span className="text-xs text-[#4A5568] font-medium">{label}</span>
      </div>
      <p className={`text-2xl font-bold ${color ?? 'text-[#1A1A1A]'}`}>{value}</p>
    </div>
  );
}

function JobRow({ job }: { job: JobWithClient }) {
  return (
    <Link to={`/schedule?job=${job.id}`}
      className="flex items-center gap-3 bg-white rounded-lg border border-[#E5E7EB] p-3 hover:shadow-sm transition-shadow">
      <div className="w-2 h-10 rounded-full shrink-0" style={{ background: JOB_PRIORITY_DOT[job.priority] }} />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-[#1A1A1A] truncate">{job.title}</p>
        <div className="flex items-center gap-3 mt-0.5">
          {job.scheduled_date && (
            <span className="flex items-center gap-1 text-xs text-[#6B7280]">
              <Calendar size={11} /> {format(parseISO(job.scheduled_date), 'd MMM yyyy')}
            </span>
          )}
          {job.start_time && (
            <span className="flex items-center gap-1 text-xs text-[#6B7280]">
              <Clock size={11} /> {job.start_time.slice(0, 5)}
            </span>
          )}
        </div>
      </div>
      <span className={`text-xs px-2 py-0.5 rounded-full shrink-0 ${JOB_STATUS_STYLES[job.status]}`}>
        {JOB_STATUS_LABELS[job.status]}
      </span>
      <ChevronRight size={15} className="text-[#D1D5DB] shrink-0" />
    </Link>
  );
}

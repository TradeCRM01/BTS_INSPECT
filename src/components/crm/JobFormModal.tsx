import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import type { Job, JobStatus, JobPriority, Client } from '../../types/crm';
import {
  JOB_STATUS_LABELS, JOB_PRIORITY_LABELS,
} from '../../types/crm';
import { X, Trash2, GitBranch } from 'lucide-react';
import { format } from 'date-fns';
import { OverlayPortal } from '../ui/OverlayPortal';
import { jobSiteAddressFromClient, visibleClientContacts } from '../../lib/clientRecords';

interface JobFormModalProps {
  job: Job | null;
  presetDate: string | null;
  presetClientId: string | null;
  presetEmployeeId?: string | undefined;
  presetParentJobId?: string | null;
  presetAddress?: string | null;
  /** `details` = identity only; schedule/crew/status live on the job page. */
  fields?: 'all' | 'details';
  onAddStage?: () => void;
  onClose: () => void;
  onSaved: (jobId: string, opts?: { deleted?: boolean }) => void;
}

export function JobFormModal({
  job,
  presetDate,
  presetClientId,
  presetEmployeeId,
  presetParentJobId,
  presetAddress,
  fields = 'all',
  onAddStage,
  onClose,
  onSaved,
}: JobFormModalProps) {
  const { profile } = useAuth();
  const detailsOnly = fields === 'details' && !!job;
  const [clients, setClients] = useState<Client[]>([]);
  const [teamMembers, setTeamMembers] = useState<{ id: string; name: string }[]>([]);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [parentJobs, setParentJobs] = useState<{ id: string; title: string; job_number: number | null }[]>([]);

  const [form, setForm] = useState({
    title: job?.title ?? '',
    client_id: job?.client_id ?? presetClientId ?? '',
    description: job?.description ?? '',
    status: job?.status ?? 'scheduled' as JobStatus,
    priority: job?.priority ?? 'medium' as JobPriority,
    scheduled_date: job?.scheduled_date ?? presetDate ?? format(new Date(), 'yyyy-MM-dd'),
    start_time: job?.start_time ?? '',
    end_time: job?.end_time ?? '',
    address: job?.address ?? presetAddress ?? '',
    assigned_team: job?.assigned_team ?? (presetEmployeeId ? [presetEmployeeId] : []),
    budget: job?.budget ?? '',
    parent_job_id: job?.parent_job_id ?? presetParentJobId ?? '',
  });

  useEffect(() => {
    async function loadOptions() {
      if (!profile?.company_id) return;
      const [clientsRes, teamRes] = await Promise.all([
        supabase.from('clients').select('*').eq('archived', false).order('name'),
        supabase.rpc('get_company_members', { p_company_id: profile.company_id }),
      ]);
      if (clientsRes.data) setClients(clientsRes.data as Client[]);
      if (teamRes.data) setTeamMembers((teamRes.data as { id: string; name: string }[]).map(m => ({ id: m.id, name: m.name })));
    }
    loadOptions();
  }, [profile?.company_id]);

  useEffect(() => {
    if (!profile?.company_id) return;
    supabase.from('jobs').select('id, title, job_number').eq('company_id', profile.company_id).is('parent_job_id', null)
      .neq('id', job?.id ?? '00000000-0000-0000-0000-000000000000').order('title').limit(50)
      .then(({ data }) => { if (data) setParentJobs(data as { id: string; title: string; job_number: number | null }[]); });
  }, [profile?.company_id, job?.id]);

  const selectedClient = useMemo(() => clients.find(c => c.id === form.client_id), [clients, form.client_id]);

  useEffect(() => {
    if (job) return;
    if (!selectedClient) return;
    setForm(f => {
      const address = jobSiteAddressFromClient(f.address, selectedClient.address);
      return address === f.address ? f : { ...f, address };
    });
  }, [job, selectedClient]);

  const toggleTeamMember = (id: string) => {
    setForm(f => ({
      ...f,
      assigned_team: f.assigned_team.includes(id)
        ? f.assigned_team.filter(t => t !== id)
        : [...f.assigned_team, id],
    }));
  };

  const handleSave = async () => {
    if (!form.title.trim()) { setErr('Title is required'); return; }
    if (!profile?.company_id) return;
    setSaving(true);
    setErr('');

    const payload: Record<string, unknown> = {
      title: form.title.trim(),
      client_id: form.client_id || null,
      description: form.description.trim() || null,
      priority: form.priority,
      address: form.address.trim() || null,
      budget: form.budget ? Number(form.budget) : null,
      parent_job_id: form.parent_job_id || null,
    };

    if (!detailsOnly) {
      payload.status = form.status;
      payload.scheduled_date = form.scheduled_date || null;
      payload.start_time = form.start_time || null;
      payload.end_time = form.end_time || null;
      payload.assigned_team = form.assigned_team;
    }

    if (job) {
      const { error } = await supabase.from('jobs').update({ ...payload, updated_at: new Date().toISOString() }).eq('id', job.id);
      setSaving(false);
      if (error) { setErr(error.message); return; }
      onSaved(job.id);
      return;
    }

    const { data, error } = await supabase
      .from('jobs')
      .insert({ ...payload, company_id: profile.company_id, created_by: profile.id })
      .select('id')
      .single();
    setSaving(false);
    if (error) { setErr(error.message); return; }
    onSaved(data.id as string);
  };

  const handleDelete = async () => {
    if (!job) return;
    setSaving(true);
    const { error } = await supabase.from('jobs').delete().eq('id', job.id);
    setSaving(false);
    if (error) { setErr(error.message); return; }
    onSaved(job.id, { deleted: true });
  };

  return (
    <OverlayPortal>
    <div className="overlay-backdrop">
      <div className="overlay-panel-xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-semibold text-[#1A1A1A]">
              {job ? (detailsOnly ? 'Job details' : 'Edit Job') : presetParentJobId ? 'New stage' : 'New Job'}
            </h2>
            {job?.job_number && (
              <span className="text-xs font-bold text-[#2E75B6] bg-[#EFF6FF] px-2 py-0.5 rounded-full">
                #{String(job.job_number).padStart(4, '0')}
              </span>
            )}
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-400">
            <X size={18} />
          </button>
        </div>

        <div className="overlay-body">
          <div className="overlay-form-grid">
          <div className="overlay-form-span-all">
            <label className="block text-xs font-medium text-[#4A5568] mb-1">Job Title <span className="text-red-500">*</span></label>
            <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
              className="form-input" placeholder="e.g. Annual safety inspection" autoFocus />
          </div>

          <div>
            <label className="block text-xs font-medium text-[#4A5568] mb-1">Client</label>
            <select value={form.client_id} onChange={e => setForm(f => ({ ...f, client_id: e.target.value }))}
              className="form-input cursor-pointer">
              <option value="">No client (walk-up)</option>
              {clients.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            {selectedClient && (
              <div className="mt-2 flex flex-col gap-1">
                {visibleClientContacts(selectedClient).map(line => (
                  <a
                    key={line.kind}
                    href={line.href}
                    className="ops-link text-xs truncate"
                    target={line.kind === 'map' ? '_blank' : undefined}
                    rel={line.kind === 'map' ? 'noreferrer' : undefined}
                  >
                    {line.label}
                  </a>
                ))}
              </div>
            )}
            {selectedClient?.address && !form.address && (
              <button type="button" onClick={() => setForm(f => ({ ...f, address: selectedClient.address ?? '' }))}
                className="ops-link text-xs mt-1">
                Use client address: {selectedClient.address}
              </button>
            )}
          </div>

          <div className="overlay-form-span-2">
            <label className="block text-xs font-medium text-[#4A5568] mb-1">Job Site Address</label>
            <input value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))}
              className="form-input" placeholder="Where the work is happening" />
          </div>

          {!detailsOnly && (
            <div>
              <label className="block text-xs font-medium text-[#4A5568] mb-1">Status</label>
              <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value as JobStatus }))}
                className="form-input cursor-pointer">
                {(Object.keys(JOB_STATUS_LABELS) as JobStatus[]).map(s => (
                  <option key={s} value={s}>{JOB_STATUS_LABELS[s]}</option>
                ))}
              </select>
            </div>
          )}
          <div>
            <label className="block text-xs font-medium text-[#4A5568] mb-1">Priority</label>
            <select value={form.priority} onChange={e => setForm(f => ({ ...f, priority: e.target.value as JobPriority }))}
              className="form-input cursor-pointer">
              {(Object.keys(JOB_PRIORITY_LABELS) as JobPriority[]).map(p => (
                <option key={p} value={p}>{JOB_PRIORITY_LABELS[p]}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-[#4A5568] mb-1">Job Budget (AUD)</label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={form.budget ?? ''}
              onChange={e => setForm(f => ({ ...f, budget: e.target.value }))}
              className="form-input"
              placeholder="0.00"
            />
          </div>

          {!detailsOnly && (
            <>
              <div>
                <label className="block text-xs font-medium text-[#4A5568] mb-1">Date</label>
                <input type="date" value={form.scheduled_date ?? ''} onChange={e => setForm(f => ({ ...f, scheduled_date: e.target.value }))}
                  className="form-input" />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#4A5568] mb-1">Start</label>
                <input type="time" value={form.start_time ?? ''} onChange={e => setForm(f => ({ ...f, start_time: e.target.value }))}
                  className="form-input" />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#4A5568] mb-1">End</label>
                <input type="time" value={form.end_time ?? ''} onChange={e => setForm(f => ({ ...f, end_time: e.target.value }))}
                  className="form-input" />
              </div>
            </>
          )}

          <div className="overlay-form-span-all">
            <label className="block text-xs font-medium text-[#4A5568] mb-1">Description</label>
            <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              className="form-input min-h-[88px] resize-y" placeholder="Job details, scope of work, special instructions..." />
          </div>

          {!detailsOnly && teamMembers.length > 0 && (
            <div className="overlay-form-span-all">
              <label className="block text-xs font-medium text-[#4A5568] mb-1.5">Assign Crew</label>
              <div className="flex flex-wrap gap-1.5">
                {teamMembers.map(m => {
                  const selected = form.assigned_team.includes(m.id);
                  return (
                    <button key={m.id} type="button" onClick={() => toggleTeamMember(m.id)}
                      className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                        selected
                          ? 'bg-[#0A2540] text-white'
                          : 'bg-gray-100 text-[#4A5568] hover:bg-gray-200'
                      }`}>
                      {m.name}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div className="overlay-form-span-2">
            <label className="block text-xs font-medium text-[#4A5568] mb-1">Parent project</label>
            <select value={form.parent_job_id} onChange={e => setForm(f => ({ ...f, parent_job_id: e.target.value }))}
              className="form-input cursor-pointer">
              <option value="">None (standalone job)</option>
              {parentJobs.map(p => (
                <option key={p.id} value={p.id}>{p.title}{p.job_number ? ` #${String(p.job_number).padStart(4, '0')}` : ''}</option>
              ))}
            </select>
            <p className="text-xs text-[#9CA3AF] mt-1">Link this job as a phase of a larger job.</p>
          </div>

          {detailsOnly && onAddStage && (
            <div className="overlay-form-span-all">
              <button
                type="button"
                onClick={onAddStage}
                className="flex items-center gap-1.5 text-sm text-[#2E75B6] hover:underline font-medium"
              >
                <GitBranch size={14} /> Add a stage to this project
              </button>
            </div>
          )}

          {err && <p className="overlay-form-span-all text-sm text-red-600">{err}</p>}
          </div>
        </div>

        <div className="flex items-center justify-between px-5 py-4 border-t border-gray-100">
          <div>
            {job && !confirmDelete ? (
              <button onClick={() => setConfirmDelete(true)}
                className="flex items-center gap-1.5 text-sm text-red-600 hover:text-red-700 font-medium">
                <Trash2 size={14} /> Delete
              </button>
            ) : job && confirmDelete ? (
              <div className="flex items-center gap-2">
                <span className="text-xs text-red-600">Delete this job?</span>
                <button onClick={() => setConfirmDelete(false)}
                  className="text-xs px-2 py-1 border border-[#E5E7EB] rounded hover:bg-gray-50">Cancel</button>
                <button onClick={handleDelete} disabled={saving}
                  className="text-xs px-2 py-1 bg-red-600 text-white rounded hover:bg-red-700">Delete</button>
              </div>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-[#4A5568] border border-[#E5E7EB] rounded-md hover:bg-gray-50">
              Cancel
            </button>
            <button onClick={handleSave} disabled={saving}
              className="px-4 py-2 text-sm font-medium text-white bg-[#0A2540] rounded-md hover:bg-[#0d2f4e] disabled:opacity-50">
              {saving ? 'Saving...' : job ? 'Save Changes' : presetParentJobId ? 'Create stage' : 'Create Job'}
            </button>
          </div>
        </div>
      </div>
    </div>
    </OverlayPortal>
  );
}

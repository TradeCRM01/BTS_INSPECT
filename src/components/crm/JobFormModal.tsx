import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import type { Job, JobStatus, JobPriority, Client } from '../../types/crm';
import {
  JOB_STATUS_LABELS, JOB_PRIORITY_LABELS,
} from '../../types/crm';
import { X, Clock, MapPin, User, FileText, Trash2, Link2, Briefcase, DollarSign, GitBranch, Plus } from 'lucide-react';
import { Link } from 'react-router-dom';
import { format } from 'date-fns';
import { JobCostingPanel } from '../jobs/JobCostingPanel';

interface JobFormModalProps {
  job: Job | null;
  presetDate: string | null;
  presetClientId: string | null;
  presetEmployeeId?: string | undefined;
  onClose: () => void;
  onSaved: () => void;
}

export function JobFormModal({ job, presetDate, presetClientId, presetEmployeeId, onClose, onSaved }: JobFormModalProps) {
  const { profile } = useAuth();
  const [clients, setClients] = useState<Client[]>([]);
  const [teamMembers, setTeamMembers] = useState<{ id: string; name: string }[]>([]);
  const [inspections, setInspections] = useState<{ id: string; name: string; status: string }[]>([]);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [parentJobs, setParentJobs] = useState<{ id: string; title: string; job_number: number | null }[]>([]);
  const [childJobs, setChildJobs] = useState<{ id: string; title: string; status: string; job_number: number | null }[]>([]);
  const [showAddStage, setShowAddStage] = useState(false);

  const [form, setForm] = useState({
    title: job?.title ?? '',
    client_id: job?.client_id ?? presetClientId ?? '',
    description: job?.description ?? '',
    status: job?.status ?? 'scheduled' as JobStatus,
    priority: job?.priority ?? 'medium' as JobPriority,
    scheduled_date: job?.scheduled_date ?? presetDate ?? format(new Date(), 'yyyy-MM-dd'),
    start_time: job?.start_time ?? '',
    end_time: job?.end_time ?? '',
    address: job?.address ?? '',
    assigned_team: job?.assigned_team ?? (presetEmployeeId ? [presetEmployeeId] : []),
    inspection_id: job?.inspection_id ?? '',
    budget: job?.budget ?? '',
    parent_job_id: job?.parent_job_id ?? '',
  });

  useEffect(() => {
    async function loadOptions() {
      if (!profile?.company_id) return;
      const [clientsRes, teamRes] = await Promise.all([
        supabase.from('clients').select('*').eq('archived', false).order('name'),
        supabase.rpc('get_company_members', { p_company_id: profile.company_id }),
      ]);
      if (clientsRes.data) setClients(clientsRes.data as Client[]);
      if (teamRes.data) setTeamMembers(teamRes.data.map((m: any) => ({ id: m.id, name: m.name })));

      if (form.client_id) {
        const { data: insps } = await supabase
          .from('inspections')
          .select('id, status, template_snapshot, started_at, meta')
          .or(`client_id.eq.${form.client_id},and(client_id.is.null)`)
          .order('started_at', { ascending: false })
          .limit(20);
        if (insps) setInspections(insps.map((i: any) => ({
          id: i.id,
          name: i.template_snapshot?.name ?? 'Inspection',
          status: i.status,
        })));
      }
    }
    loadOptions();
  }, [profile?.company_id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Load parent job options (jobs without parent_job_id, excluding this job)
  useEffect(() => {
    if (!profile?.company_id) return;
    supabase.from('jobs').select('id, title, job_number').eq('company_id', profile.company_id).is('parent_job_id', null)
      .neq('id', job?.id ?? '00000000-0000-0000-0000-000000000000').order('title').limit(50)
      .then(({ data }) => { if (data) setParentJobs(data as { id: string; title: string; job_number: number | null }[]); });
  }, [profile?.company_id, job?.id]);

  // Load child jobs if this is a parent
  useEffect(() => {
    if (!job?.id) { setChildJobs([]); return; }
    supabase.from('jobs').select('id, title, status, job_number').eq('parent_job_id', job.id).order('created_at')
      .then(({ data }) => { if (data) setChildJobs(data as { id: string; title: string; status: string; job_number: number | null }[]); });
  }, [job?.id]);
  useEffect(() => {
    if (!form.client_id) { setInspections([]); return; }
    (async () => {
      const { data } = await supabase
        .from('inspections')
        .select('id, status, template_snapshot, started_at, meta')
        .order('started_at', { ascending: false })
        .limit(20);
      if (data) setInspections(data.map((i: any) => ({
        id: i.id,
        name: i.template_snapshot?.name ?? 'Inspection',
        status: i.status,
      })));
    })();
  }, [form.client_id]);

  const selectedClient = useMemo(() => clients.find(c => c.id === form.client_id), [clients, form.client_id]);

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

    const payload = {
      title: form.title.trim(),
      client_id: form.client_id || null,
      description: form.description.trim() || null,
      status: form.status,
      priority: form.priority,
      scheduled_date: form.scheduled_date || null,
      start_time: form.start_time || null,
      end_time: form.end_time || null,
      address: form.address.trim() || null,
      assigned_team: form.assigned_team,
      inspection_id: form.inspection_id || null,
      budget: form.budget ? Number(form.budget) : null,
      parent_job_id: form.parent_job_id || null,
    };

    const { error } = job
      ? await supabase.from('jobs').update({ ...payload, updated_at: new Date().toISOString() }).eq('id', job.id)
      : await supabase.from('jobs').insert({ ...payload, company_id: profile.company_id, created_by: profile.id });

    setSaving(false);
    if (error) { setErr(error.message); return; }
    onSaved();
  };

  const handleDelete = async () => {
    if (!job) return;
    setSaving(true);
    const { error } = await supabase.from('jobs').delete().eq('id', job.id);
    setSaving(false);
    if (error) { setErr(error.message); return; }
    onSaved();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/30 p-4 pt-[8vh] overflow-y-auto" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden mb-8" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-semibold text-[#1A1A1A]">{job ? 'Edit Job' : 'New Job'}</h2>
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

        {/* Body */}
        <div className="flex-1 overflow-auto px-5 py-4 space-y-4">
          {/* Title */}
          <div>
            <label className="block text-xs font-medium text-[#4A5568] mb-1">Job Title <span className="text-red-500">*</span></label>
            <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
              className="form-input" placeholder="e.g. Annual safety inspection" autoFocus />
          </div>

          {/* Client */}
          <div>
            <label className="block text-xs font-medium text-[#4A5568] mb-1">Client</label>
            <select value={form.client_id} onChange={e => setForm(f => ({ ...f, client_id: e.target.value }))}
              className="form-input cursor-pointer">
              <option value="">No client (walk-up)</option>
              {clients.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            {selectedClient?.address && !form.address && (
              <button onClick={() => setForm(f => ({ ...f, address: selectedClient.address ?? '' }))}
                className="text-xs text-[#2E75B6] hover:underline mt-1">
                Use client address: {selectedClient.address}
              </button>
            )}
          </div>

          {/* Status + Priority */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-[#4A5568] mb-1">Status</label>
              <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value as JobStatus }))}
                className="form-input cursor-pointer">
                {(Object.keys(JOB_STATUS_LABELS) as JobStatus[]).map(s => (
                  <option key={s} value={s}>{JOB_STATUS_LABELS[s]}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-[#4A5568] mb-1">Priority</label>
              <select value={form.priority} onChange={e => setForm(f => ({ ...f, priority: e.target.value as JobPriority }))}
                className="form-input cursor-pointer">
                {(Object.keys(JOB_PRIORITY_LABELS) as JobPriority[]).map(p => (
                  <option key={p} value={p}>{JOB_PRIORITY_LABELS[p]}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Date + Time */}
          <div className="grid grid-cols-3 gap-3">
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
          </div>

          {/* Address */}
          <div>
            <label className="block text-xs font-medium text-[#4A5568] mb-1">Job Site Address</label>
            <input value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))}
              className="form-input" placeholder="Where the work is happening" />
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-medium text-[#4A5568] mb-1">Description</label>
            <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              className="form-input min-h-[60px] resize-y" placeholder="Job details, scope of work, special instructions..." />
          </div>

          {/* Crew Assignment */}
          {teamMembers.length > 0 && (
            <div>
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

          {/* Link Inspection */}
          {inspections.length > 0 && (
            <div>
              <label className="block text-xs font-medium text-[#4A5568] mb-1">Link to Inspection</label>
              <select value={form.inspection_id} onChange={e => setForm(f => ({ ...f, inspection_id: e.target.value }))}
                className="form-input cursor-pointer">
                <option value="">No linked inspection</option>
                {inspections.map(i => (
                  <option key={i.id} value={i.id}>{i.name} ({i.status})</option>
                ))}
              </select>
            </div>
          )}

          {/* Parent Project (Multi-Stage) */}
          <div>
            <label className="block text-xs font-medium text-[#4A5568] mb-1">Parent Project (for multi-stage jobs)</label>
            <select value={form.parent_job_id} onChange={e => setForm(f => ({ ...f, parent_job_id: e.target.value }))}
              className="form-input cursor-pointer">
              <option value="">None (standalone job)</option>
              {parentJobs.map(p => (
                <option key={p.id} value={p.id}>{p.title}{p.job_number ? ` #${String(p.job_number).padStart(4, '0')}` : ''}</option>
              ))}
            </select>
            <p className="text-xs text-[#9CA3AF] mt-1">Link this job as a phase/stage of a larger project.</p>
          </div>

          {/* Child stages (if this is a parent) */}
          {job && childJobs.length > 0 && (
            <div className="border-t border-gray-100 pt-3">
              <div className="flex items-center gap-1.5 mb-2">
                <GitBranch size={14} className="text-[#0A2540]" />
                <h3 className="text-xs font-semibold text-[#1A1A1A] uppercase tracking-wide">Project Stages ({childJobs.length})</h3>
              </div>
              <div className="space-y-1">
                {childJobs.map(child => (
                  <div key={child.id} className="flex items-center justify-between p-2 rounded-lg bg-gray-50 hover:bg-gray-100 transition-colors">
                    <span className="text-sm text-[#1A1A1A]">{child.title}</span>
                    <span className="text-xs text-[#6B7280]">{child.status}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Add stage button for parent jobs */}
          {job && !job.parent_job_id && (
            <button
              type="button"
              onClick={() => setShowAddStage(true)}
              className="flex items-center gap-1.5 text-sm text-[#2E75B6] hover:underline font-medium"
            >
              <Plus size={14} /> Add a stage to this project
            </button>
          )}

          {/* Budget */}
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
            <p className="text-xs text-[#9CA3AF] mt-1">Used for budget vs actual comparison in job costing.</p>
          </div>

          {/* Job Costing Panel (only when editing existing job) */}
          {job && (
            <div className="border-t border-gray-100 pt-4">
              <div className="flex items-center gap-1.5 mb-3">
                <DollarSign size={14} className="text-[#0A2540]" />
                <h3 className="text-xs font-semibold text-[#1A1A1A] uppercase tracking-wide">Job Costs</h3>
              </div>
              <JobCostingPanel jobId={job.id} />
            </div>
          )}

          {/* Existing inspection link */}
          {job?.inspection_id && (
            <Link to={`/inspections/${job.inspection_id}`}
              className="flex items-center gap-2 text-sm text-[#2E75B6] hover:underline">
              <Link2 size={14} /> Open linked inspection
            </Link>
          )}

          {err && <p className="text-sm text-red-600">{err}</p>}
        </div>

        {/* Footer */}
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
              {saving ? 'Saving...' : job ? 'Save Changes' : 'Create Job'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

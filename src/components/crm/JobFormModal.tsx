import { useState, useEffect, useMemo, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import type { Job, JobPriority, Client } from '../../types/crm';
import { JOB_PRIORITY_LABELS } from '../../types/crm';
import {
  jobCrewScheduleNeedsCrewClass,
  jobCrewScheduleStatus,
} from '../../lib/jobCrewScheduleStatus';
import { X, Trash2, GitBranch } from 'lucide-react';
import { OverlayPortal } from '../ui/OverlayPortal';
import { TimeFieldInput } from '../ui/TimeFieldInput';
import { applyTimeFieldsSaveBlock, focusTimeFieldInput, timeFieldsSaveValidation } from '../../lib/timeFieldInput';
import { ClientForm } from '../../pages/ClientsPage';
import { jobFormSelectNewClient, jobSiteAddressFromClient, visibleClientContacts } from '../../lib/clientRecords';
import { persistLivingJobOnBoundJhas } from '../../lib/persistLivingJobJha';
import { formatJobRef, nextCostCode, normalizeCostCode } from '../../lib/jobRef';
import { JOB_COLORS, jobColorToStore } from '../../lib/jobColors';
import { assumedTradeTag, checkDateTag, fromBookingTag } from '../../lib/quickBook';
import { getAuditTeamMembers } from '../../lib/devFieldAuditDocs';
import { crewAssignmentHelper } from '../../lib/jobDispatchCrew';
import { FromBooking } from './FromBooking';

export type JobFormFromBooking = {
  title?: boolean;
  client?: boolean;
  date?: boolean;
  dateCheck?: boolean;
  start?: boolean;
  startTrade?: boolean;
  crew?: boolean;
  address?: boolean;
};

interface JobFormModalProps {
  job: Job | null;
  presetDate: string | null;
  presetClientId: string | null;
  presetEmployeeId?: string | undefined;
  presetParentJobId?: string | null;
  presetAddress?: string | null;
  presetTitle?: string | null;
  presetStartTime?: string | null;
  presetClientName?: string | null;
  presetTeam?: { id: string; name: string }[];
  fromBooking?: JobFormFromBooking | null;
  matchHints?: { job?: string | null; client?: string | null; crew?: string | null } | null;
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
  presetTitle,
  presetStartTime,
  presetClientName,
  presetTeam,
  fromBooking = null,
  matchHints = null,
  fields = 'all',
  onAddStage,
  onClose,
  onSaved,
}: JobFormModalProps) {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const detailsOnly = fields === 'details' && !!job;
  const [clients, setClients] = useState<Client[]>([]);
  const [teamMembers, setTeamMembers] = useState<{ id: string; name: string }[]>(presetTeam ?? []);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [addingClient, setAddingClient] = useState(false);
  const [parentJobs, setParentJobs] = useState<{ id: string; title: string; job_number: number | null }[]>([]);

  const [dateEdited, setDateEdited] = useState(false);
  const [startEdited, setStartEdited] = useState(false);
  const [titleEdited, setTitleEdited] = useState(false);
  const [clientEdited, setClientEdited] = useState(false);
  const [addressEdited, setAddressEdited] = useState(false);
  const [crewEdited, setCrewEdited] = useState(false);
  const [pendingClientName, setPendingClientName] = useState(presetClientName ?? '');
  const [clientErr, setClientErr] = useState('');
  const clientNameRef = useRef<HTMLInputElement>(null);
  const clientErrRef = useRef<HTMLParagraphElement>(null);
  const [startNeedsAmPm, setStartNeedsAmPm] = useState(false);
  const [endNeedsAmPm, setEndNeedsAmPm] = useState(false);
  const startFieldRef = useRef<HTMLDivElement>(null);
  const endFieldRef = useRef<HTMLDivElement>(null);
  const startCheck = assumedTradeTag(fromBooking?.startTrade, presetStartTime, startEdited);
  const dateCheck = checkDateTag(fromBooking?.dateCheck, dateEdited);

  const [form, setForm] = useState({
    title: job?.title ?? presetTitle ?? '',
    client_id: job?.client_id ?? presetClientId ?? '',
    description: job?.description ?? '',
    priority: job?.priority ?? 'medium' as JobPriority,
    scheduled_date: job?.scheduled_date ?? presetDate ?? '',
    start_time: job?.start_time ?? presetStartTime ?? '',
    end_time: job?.end_time ?? '',
    address: job?.address ?? presetAddress ?? '',
    assigned_team: job?.assigned_team ?? (presetEmployeeId ? [presetEmployeeId] : []),
    budget: job?.budget ?? '',
    parent_job_id: job?.parent_job_id ?? presetParentJobId ?? '',
    cost_code: job?.cost_code ?? '',
    color: job?.color ?? '',
  });

  useEffect(() => {
    async function loadOptions() {
      const auditTeam = getAuditTeamMembers();
      if (auditTeam) {
        setTeamMembers(auditTeam.map(m => ({ id: m.id, name: m.name })));
      } else if (presetTeam?.length) {
        setTeamMembers(presetTeam);
      }
      if (!profile?.company_id) return;
      const [clientsRes, teamRes] = await Promise.all([
        supabase.from('clients').select('*').eq('archived', false).order('name'),
        auditTeam
          ? Promise.resolve({ data: null as null, error: null })
          : supabase.rpc('get_company_members', { p_company_id: profile.company_id }),
      ]);
      if (clientsRes.data) setClients(clientsRes.data as Client[]);
      if (!auditTeam && teamRes.data) {
        setTeamMembers((teamRes.data as { id: string; name: string }[]).map(m => ({ id: m.id, name: m.name })));
      } else if (!auditTeam && presetTeam?.length) {
        setTeamMembers(presetTeam);
      }
    }
    loadOptions();
  }, [profile?.company_id, presetTeam]);

  useEffect(() => {
    if (!profile?.company_id) return;
    supabase.from('jobs').select('id, title, job_number').eq('company_id', profile.company_id).is('parent_job_id', null)
      .neq('id', job?.id ?? '00000000-0000-0000-0000-000000000000').order('title').limit(50)
      .then(({ data }) => { if (data) setParentJobs(data as { id: string; title: string; job_number: number | null }[]); });
  }, [profile?.company_id, job?.id]);

  useEffect(() => {
    if (job || !form.parent_job_id || form.cost_code) return;
    supabase.from('jobs').select('cost_code').eq('parent_job_id', form.parent_job_id)
      .then(({ data }) => {
        const next = nextCostCode((data ?? []).map(row => row.cost_code as string | null));
        setForm(f => (f.cost_code ? f : { ...f, cost_code: next }));
      });
  }, [job, form.parent_job_id, form.cost_code]);

  const selectedClient = useMemo(() => clients.find(c => c.id === form.client_id), [clients, form.client_id]);
  const pendingUnmatched = !!pendingClientName.trim() && !form.client_id;
  const scheduleStatus = useMemo(
    () => jobCrewScheduleStatus(form.scheduled_date, form.assigned_team),
    [form.scheduled_date, form.assigned_team],
  );
  const scheduleStatusClass = [
    jobCrewScheduleNeedsCrewClass(scheduleStatus.kind),
    scheduleStatus.kind === 'booked' ? 'is-booked' : '',
  ].filter(Boolean).join(' ');

  const applyNewClient = async (clientId: string) => {
    setAddingClient(false);
    let nextClients = clients;
    if (profile?.company_id) {
      const { data } = await supabase.from('clients').select('*').eq('archived', false).order('name');
      if (data) {
        nextClients = data as Client[];
        setClients(nextClients);
      }
    }
    const created = nextClients.find(c => c.id === clientId);
    setClientEdited(true);
    setPendingClientName('');
    setClientErr('');
    setForm(f => jobFormSelectNewClient(f, clientId, created?.address));
  };

  useEffect(() => {
    if (job) return;
    if (!selectedClient) return;
    setForm(f => {
      const address = jobSiteAddressFromClient(f.address, selectedClient.address);
      return address === f.address ? f : { ...f, address };
    });
  }, [job, selectedClient]);

  const toggleTeamMember = (id: string) => {
    setCrewEdited(true);
    setForm(f => ({
      ...f,
      assigned_team: f.assigned_team.includes(id)
        ? f.assigned_team.filter(t => t !== id)
        : [...f.assigned_team, id],
    }));
  };

  const handleSave = async () => {
    if (!form.title.trim()) { setErr('Title is required'); return; }
    const typedClient = pendingClientName.trim();
    if (typedClient && !form.client_id) {
      setClientErr(`Create client “${typedClient}” or pick one`);
      requestAnimationFrame(() => {
        clientErrRef.current?.scrollIntoView({ block: 'center' });
        clientNameRef.current?.focus();
      });
      return;
    }
    setClientErr('');
    if (!profile?.company_id) return;
    if (!detailsOnly) {
      const block = timeFieldsSaveValidation({
        start: form.start_time ?? '',
        end: form.end_time ?? '',
        startNeedsAmPm,
        endNeedsAmPm,
      });
      if (block) {
        applyTimeFieldsSaveBlock(block, {
          setFormError: m => setErr(m ?? ''),
          focusStart: () => focusTimeFieldInput(startFieldRef.current),
          focusEnd: () => focusTimeFieldInput(endFieldRef.current),
        });
        return;
      }
    }
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
      cost_code: normalizeCostCode(form.cost_code) || null,
      color: jobColorToStore(form.color),
    };

    if (!detailsOnly) {
      payload.status = job?.status ?? 'scheduled';
      payload.scheduled_date = form.scheduled_date || null;
      payload.start_time = form.start_time || null;
      payload.end_time = form.end_time || null;
      payload.assigned_team = form.assigned_team;
    }

    if (job) {
      const { error } = await supabase.from('jobs').update({ ...payload, updated_at: new Date().toISOString() }).eq('id', job.id);
      if (error) { setSaving(false); setErr(error.message); return; }
      try {
        await persistLivingJobOnBoundJhas(job.id);
      } catch (syncErr) {
        setSaving(false);
        setErr(syncErr instanceof Error ? syncErr.message : 'Job saved, but this job’s SWMS / Take 5 / inspection could not be updated.');
        onSaved(job.id);
        return;
      }
      setSaving(false);
      onSaved(job.id);
      return;
    }

    const { data, error } = await supabase
      .from('jobs')
      .insert({ ...payload, company_id: profile.company_id, created_by: profile.id })
      .select('*')
      .single();
    setSaving(false);
    if (error) { setErr(error.message); return; }
    queryClient.setQueryData(['job', data.id], data);
    if (data.client_id && selectedClient?.id === data.client_id) {
      queryClient.setQueryData(['job-client', data.client_id], selectedClient);
    }
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
    <div className="overlay-backdrop hub-ops-form-backdrop">
      <div className="overlay-panel-xl hub-ops-form-sheet" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#E2D9CC]">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-semibold text-navy">
              {job ? (detailsOnly ? 'Job details' : 'Edit Job') : presetParentJobId ? 'New stage' : 'New Job'}
            </h2>
            {job && (
              <span className="ops-meta tabular-nums">
                {formatJobRef({
                  job_number: job.job_number,
                  cost_code: form.cost_code || job.cost_code,
                  parent_job_number: parentJobs.find(p => p.id === (form.parent_job_id || job.parent_job_id))?.job_number ?? null,
                })}
              </span>
            )}
          </div>
          <button type="button" onClick={onClose} className="hub-ops-form-close flex items-center justify-center hover:bg-[#F5F0E6]">
            <X size={18} />
          </button>
        </div>

        <div className="overlay-body">
          <div className="overlay-form-grid">
          <div className="overlay-form-span-all">
            <label className="ops-field-label">
              Client
              <FromBooking show={fromBookingTag(fromBooking?.client, clientEdited)} />
            </label>
            {pendingUnmatched ? (
              <input
                ref={clientNameRef}
                value={pendingClientName}
                onChange={e => {
                  setClientEdited(true);
                  setPendingClientName(e.target.value);
                  if (!e.target.value.trim()) setClientErr('');
                }}
                className="form-input"
                aria-label="Client name from booking"
              />
            ) : null}
            {pendingUnmatched ? (
              <button
                type="button"
                onClick={() => setAddingClient(true)}
                className="hub-job-create-client"
              >
                {`Create client “${pendingClientName.trim()}”`}
              </button>
            ) : null}
            {clientErr ? (
              <p ref={clientErrRef} className="text-sm text-fail">{clientErr}</p>
            ) : null}
            {pendingUnmatched ? (
              <label className="ops-field-label" htmlFor="hub-job-existing-client">
                Or pick an existing client
              </label>
            ) : null}
            <select
              id="hub-job-existing-client"
              value={form.client_id}
              onChange={e => {
                setClientEdited(true);
                setForm(f => ({ ...f, client_id: e.target.value }));
                if (e.target.value) {
                  setPendingClientName('');
                  setClientErr('');
                }
              }}
              className="form-input cursor-pointer"
              aria-label={pendingUnmatched ? 'Or pick an existing client' : 'Existing client'}
            >
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
              <button type="button" onClick={() => {
                setAddressEdited(true);
                setForm(f => ({ ...f, address: selectedClient.address ?? '' }));
              }}
                className="ops-link text-xs mt-1">
                Use client address: {selectedClient.address}
              </button>
            )}
            {pendingUnmatched ? null : (
            <button type="button" onClick={() => setAddingClient(true)}
              className="hub-job-create-client">
              Add new client
            </button>
            )}
          </div>

          <div className="overlay-form-span-all">
            <label className="ops-field-label">
              Job Title <span className="text-fail">*</span>
              <FromBooking show={fromBookingTag(fromBooking?.title, titleEdited)} />
            </label>
            <input value={form.title} onChange={e => {
              setTitleEdited(true);
              setForm(f => ({ ...f, title: e.target.value }));
            }}
              className="form-input" placeholder="e.g. Annual safety inspection" autoFocus />
          </div>

          <div className="overlay-form-span-2">
            <label className="ops-field-label">
              Job Site Address
              <FromBooking show={fromBookingTag(fromBooking?.address, addressEdited)} />
            </label>
            <input value={form.address} onChange={e => {
              setAddressEdited(true);
              setForm(f => ({ ...f, address: e.target.value }));
            }}
              className="form-input" placeholder="Where the work is happening" />
          </div>

          {!detailsOnly && (
            <>
              <div className="overlay-form-span-all hub-job-form-schedule-status">
                <span className="ops-field-label">Status</span>
                <span
                  className={`hub-job-form-status-pill ${scheduleStatusClass}`}
                  data-job-form-schedule-status={scheduleStatus.kind}
                >
                  {scheduleStatus.label}
                </span>
              </div>
              <div>
                <label className="ops-field-label">
                  Date
                  <FromBooking show={fromBookingTag(fromBooking?.date, dateEdited)} />
                  {dateCheck ? (
                    <span className="hub-schedule-from-booking">{dateCheck}</span>
                  ) : null}
                </label>
                <input
                  type="date"
                  lang="en-AU"
                  value={form.scheduled_date ?? ''}
                  onChange={e => {
                    setForm(f => ({ ...f, scheduled_date: e.target.value }));
                    setDateEdited(true);
                  }}
                  className="form-input hub-date-input-en-au"
                />
                <p className="ops-meta mt-1">dd/mm/yyyy</p>
              </div>
              <div>
                <label className="ops-field-label">
                  Start
                  <FromBooking show={fromBookingTag(fromBooking?.start, startEdited)} />
                  {startCheck ? (
                    <span className="hub-schedule-from-booking">{startCheck}</span>
                  ) : null}
                </label>
                <div ref={startFieldRef}>
                  <TimeFieldInput
                    value={form.start_time ?? ''}
                    onChange={v => {
                      setForm(f => ({ ...f, start_time: v }));
                      setStartEdited(true);
                    }}
                    onIncompleteAmPmChange={setStartNeedsAmPm}
                    className="form-input"
                  />
                </div>
              </div>
              <div>
                <label className="ops-field-label">End</label>
                <div ref={endFieldRef}>
                  <TimeFieldInput
                    value={form.end_time ?? ''}
                    onChange={v => setForm(f => ({ ...f, end_time: v }))}
                    onIncompleteAmPmChange={setEndNeedsAmPm}
                    className="form-input"
                  />
                </div>
              </div>
              <div className="overlay-form-span-all hub-job-form-crew">
                <label className="ops-field-label">
                  Crew
                  <FromBooking show={fromBookingTag(fromBooking?.crew, crewEdited)} />
                </label>
                {matchHints?.crew ? (
                  <p className="hub-schedule-job-sheet-hint">{matchHints.crew}</p>
                ) : null}
                {teamMembers.length === 0 ? (
                  <p className="ops-meta">No team members to assign yet.</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {teamMembers.map(m => {
                      const selected = form.assigned_team.includes(m.id);
                      return (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() => toggleTeamMember(m.id)}
                          className={`hub-job-form-crew-chip ${selected ? 'is-on' : ''}`}
                        >
                          {m.name}
                        </button>
                      );
                    })}
                  </div>
                )}
                <p className="ops-meta mt-2">{crewAssignmentHelper(form.assigned_team, teamMembers)}</p>
              </div>
            </>
          )}

          <div>
            <label className="ops-field-label">Priority</label>
            <select value={form.priority} onChange={e => setForm(f => ({ ...f, priority: e.target.value as JobPriority }))}
              className="form-input cursor-pointer">
              {(Object.keys(JOB_PRIORITY_LABELS) as JobPriority[]).map(p => (
                <option key={p} value={p}>{JOB_PRIORITY_LABELS[p]}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="ops-field-label">Job Budget (AUD)</label>
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

          <div className="overlay-form-span-all">
            <label className="ops-field-label">Description</label>
            <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              className="form-input min-h-[88px] resize-y" placeholder="Job details, scope of work, special instructions..." />
          </div>

          <div>
            <label className="ops-field-label">Parent project</label>
            <select value={form.parent_job_id} onChange={e => setForm(f => ({ ...f, parent_job_id: e.target.value, cost_code: e.target.value ? f.cost_code : '' }))}
              className="form-input cursor-pointer">
              <option value="">None (standalone job)</option>
              {parentJobs.map(p => (
                <option key={p.id} value={p.id}>{formatJobRef(p)} {p.title}</option>
              ))}
            </select>
            <p className="ops-meta mt-1">Link this job as a phase of a larger job.</p>
          </div>

          <div>
            <label className="ops-field-label">Cost code</label>
            <input
              value={form.cost_code}
              onChange={e => setForm(f => ({ ...f, cost_code: e.target.value }))}
              className="form-input"
              placeholder="01"
              maxLength={12}
            />
            <p className="ops-meta mt-1">Shown as #0042.01 on the schedule</p>
          </div>

          <div className="overlay-form-span-all">
            <label className="ops-field-label">Colour</label>
            <div className="flex flex-wrap items-center gap-1.5">
              {JOB_COLORS.map(hex => {
                const selected = jobColorToStore(form.color) === hex.toUpperCase();
                return (
                  <button
                    key={hex}
                    type="button"
                    title={hex}
                    aria-label={`Colour ${hex}`}
                    aria-pressed={selected}
                    onClick={() => setForm(f => ({ ...f, color: hex }))}
                    className={`h-7 w-7 rounded-md border-2 ${
                      selected ? 'border-navy' : 'border-transparent'
                    }`}
                    style={{ background: hex }}
                  />
                );
              })}
              <input
                type="color"
                value={jobColorToStore(form.color) ?? JOB_COLORS[0]}
                onChange={e => setForm(f => ({ ...f, color: e.target.value.toUpperCase() }))}
                className="h-7 w-10 cursor-pointer rounded border border-rule bg-white"
                aria-label="Another colour"
              />
              {form.color ? (
                <button
                  type="button"
                  className="ops-link text-xs"
                  onClick={() => setForm(f => ({ ...f, color: '' }))}
                >
                  Clear
                </button>
              ) : null}
            </div>
            <p className="ops-meta mt-1">Week-board chip. Same-quote stages keep this unless you change that job.</p>
          </div>

          {detailsOnly && onAddStage && (
            <div className="overlay-form-span-all">
              <button
                type="button"
                onClick={onAddStage}
                className="ops-link inline-flex items-center gap-1.5"
              >
                <GitBranch size={14} /> Add a stage to this project
              </button>
            </div>
          )}

          {err && <p className="overlay-form-span-all text-sm text-fail">{err}</p>}
          </div>
        </div>

        <div className="flex items-center justify-between px-5 py-4 border-t border-[#E2D9CC]">
          <div>
            {job && !confirmDelete ? (
              <button onClick={() => setConfirmDelete(true)}
                className="inline-flex items-center gap-1.5 text-sm font-medium text-fail">
                <Trash2 size={14} /> Delete
              </button>
            ) : job && confirmDelete ? (
              <div className="flex items-center gap-2">
                <span className="ops-meta text-fail">Delete this job?</span>
                <button onClick={() => setConfirmDelete(false)} className="btn-secondary">Cancel</button>
                <button onClick={handleDelete} disabled={saving} className="btn-danger disabled:opacity-50">Delete</button>
              </div>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            <button onClick={onClose} className="btn-secondary">
              Cancel
            </button>
            <button onClick={handleSave} disabled={saving}
              className="btn-primary min-h-[44px] disabled:opacity-50">
              {saving ? 'Saving...' : job ? 'Save Changes' : presetParentJobId ? 'Create stage' : 'Create Job'}
            </button>
          </div>
        </div>
      </div>
    </div>
    {addingClient && (
      <ClientForm
        client={null}
        openedFromJob
        presetName={pendingClientName || undefined}
        onClose={() => setAddingClient(false)}
        onSaved={clientId => { void applyNewClient(clientId); }}
      />
    )}
    </OverlayPortal>
  );
}

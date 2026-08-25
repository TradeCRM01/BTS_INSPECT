import { useState } from 'react';
import { X } from 'lucide-react';
import { format } from 'date-fns';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { OverlayPortal } from '../ui/OverlayPortal';
import { ManagedSelect } from '../ui/ManagedSelect';
import { LIST_KEYS } from '../../lib/useManagedList';
import {
  buildJobTimeEntry,
  buildOpenTimesheetInsert,
  entryMinutes,
} from '../../lib/timesheetJob';
import type { Timesheet } from '../../types/fsm';

export function TimeEntryForm({
  timesheets,
  jobs,
  employeeId,
  presetJobId,
  lockJob,
  onClose,
  onSaved,
}: {
  timesheets: Timesheet[];
  jobs: { id: string; title: string; job_number: number | null }[];
  employeeId: string;
  presetJobId?: string;
  lockJob?: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { profile } = useAuth();
  const [form, setForm] = useState({
    date: format(new Date(), 'yyyy-MM-dd'),
    start_time: '08:00',
    end_time: '17:00',
    work_type: '',
    billable: true,
    notes: '',
    job_id: presetJobId ?? '',
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!profile?.company_id) return;
    setSaving(true);
    setErr(null);
    try {
      const startDateTime = new Date(`${form.date}T${form.start_time}`);
      const endDateTime = form.end_time ? new Date(`${form.date}T${form.end_time}`) : null;

      const existing = timesheets.find(t => t.date === form.date);
      let tsId = existing?.id;
      if (!tsId) {
        const { data: newTs, error: tsError } = await supabase.from('timesheets')
          .insert(buildOpenTimesheetInsert({
            companyId: profile.company_id,
            employeeId,
            date: form.date,
          }))
          .select().single();
        if (tsError) throw tsError;
        tsId = newTs.id as string;
      }

      const { error } = await supabase.from('timesheet_entries').insert(buildJobTimeEntry({
        timesheetId: tsId,
        companyId: profile.company_id,
        jobId: form.job_id || null,
        start: startDateTime,
        end: endDateTime,
        workType: form.work_type,
        billable: form.billable,
        notes: form.notes,
      }));
      if (error) throw error;

      if (endDateTime) {
        const addedMin = entryMinutes(startDateTime.toISOString(), endDateTime.toISOString());
        const existingMin = existing?.total_minutes ?? 0;
        await supabase.from('timesheets').update({ total_minutes: existingMin + addedMin }).eq('id', tsId);
      }

      onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to save');
    } finally { setSaving(false); }
  }

  return (
    <OverlayPortal>
      <div className="overlay-backdrop">
        <div className="overlay-panel-lg" onClick={e => e.stopPropagation()}>
          <div className="flex items-center justify-between px-5 py-4 border-b border-[#E5E7EB] shrink-0">
            <h2 className="text-lg font-semibold text-[#1A1A1A]">Add Time Entry</h2>
            <button type="button" onClick={onClose}><X size={20} className="text-[#6B7280]" /></button>
          </div>
          <form onSubmit={handleSave} className="overlay-body">
            <Field label="Date"><input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} className="form-input" /></Field>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Start Time"><input type="time" value={form.start_time} onChange={e => setForm(f => ({ ...f, start_time: e.target.value }))} className="form-input" /></Field>
              <Field label="End Time"><input type="time" value={form.end_time} onChange={e => setForm(f => ({ ...f, end_time: e.target.value }))} className="form-input" /></Field>
            </div>
            <Field label="Job">
              <select
                value={form.job_id}
                onChange={e => setForm(f => ({ ...f, job_id: e.target.value }))}
                className="form-input cursor-pointer"
                disabled={lockJob && !!presetJobId}
              >
                <option value="">No linked job</option>
                {presetJobId && !jobs.some(j => j.id === presetJobId) && (
                  <option value={presetJobId}>Linked job</option>
                )}
                {jobs.map(j => (
                  <option key={j.id} value={j.id}>
                    {j.job_number != null ? `#${String(j.job_number).padStart(4, '0')} ` : ''}{j.title}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Work Type"><ManagedSelect listKey={LIST_KEYS.workTypes} value={form.work_type}
              onChange={v => setForm(f => ({ ...f, work_type: v }))} placeholder="Select work type..." /></Field>
            <Field label="Notes"><textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2} className="form-input min-h-[50px] resize-y" placeholder="What did you work on?" /></Field>
            <label className="flex items-center gap-2 text-sm text-[#1A1A1A]"><input type="checkbox" checked={form.billable} onChange={e => setForm(f => ({ ...f, billable: e.target.checked }))} className="rounded" /> Billable time</label>
            {err && <p className="text-sm text-[#B42318]">{err}</p>}
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-[#4A5568] border border-[#E5E7EB] rounded-md hover:bg-[#F9FAFB]">Cancel</button>
              <button type="submit" disabled={saving} className="px-4 py-2 text-sm font-medium text-white bg-[#0A2540] rounded-md hover:bg-[#0d2f4e] disabled:opacity-50">{saving ? 'Saving...' : 'Save'}</button>
            </div>
          </form>
        </div>
      </div>
    </OverlayPortal>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="text-sm font-medium text-[#4A5568] mb-1 block">{label}</span>{children}</label>;
}

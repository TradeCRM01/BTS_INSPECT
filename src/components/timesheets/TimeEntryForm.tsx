import { useRef, useState } from 'react';
import { X } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { isDevFieldAuditAuth } from '../../lib/devFieldAuditAuth';
import { appendAuditTimesheetEntry, AUDIT_TIMESHEET_ID } from '../../lib/timesheetsList';
import { OverlayPortal } from '../ui/OverlayPortal';
import { ManagedSelect } from '../ui/ManagedSelect';
import { TimeFieldInput } from '../ui/TimeFieldInput';
import {
  applyTimeFieldsSaveBlock,
  focusTimeFieldInput,
  timeFieldsSaveValidation,
  type TimeFieldHintKind,
} from '../../lib/timeFieldInput';
import { LIST_KEYS } from '../../lib/useManagedList';
import {
  applyTimeEntryDurationChip,
  buildJobTimeEntry,
  buildOpenTimesheetInsert,
  entryMinutes,
  TIME_ENTRY_DURATION_CHIP_HOURS,
  timeEntryDefaultsForAddHours,
  timeEntryDefaultsFromBooking,
} from '../../lib/timesheetJob';
import type { Timesheet } from '../../types/fsm';

export function TimeEntryForm({
  timesheets,
  jobs,
  employeeId,
  presetJobId,
  presetDate,
  presetStartTime,
  presetEndTime,
  lockJob,
  blankTimesOnOpen,
  onClose,
  onSaved,
}: {
  timesheets: Timesheet[];
  jobs: { id: string; title: string; job_number: number | null }[];
  employeeId: string;
  presetJobId?: string;
  presetDate?: string | null;
  presetStartTime?: string | null;
  presetEndTime?: string | null;
  lockJob?: boolean;
  blankTimesOnOpen?: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { profile } = useAuth();
  const [form, setForm] = useState(() => ({
    ...(blankTimesOnOpen
      ? timeEntryDefaultsForAddHours()
      : timeEntryDefaultsFromBooking({
        scheduled_date: presetDate,
        start_time: presetStartTime,
        end_time: presetEndTime,
      })),
    work_type: blankTimesOnOpen ? 'Labour' : '',
    billable: true,
    notes: '',
    job_id: presetJobId ?? '',
  }));
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [startTimeHint, setStartTimeHint] = useState<TimeFieldHintKind>('none');
  const [endTimeHint, setEndTimeHint] = useState<TimeFieldHintKind>('none');
  const startFieldRef = useRef<HTMLDivElement>(null);
  const endFieldRef = useRef<HTMLDivElement>(null);
  const saveLock = useRef(false);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (saveLock.current || saving) return;
    const block = timeFieldsSaveValidation({
      start: form.start_time,
      end: form.end_time,
      startHint: startTimeHint,
      endHint: endTimeHint,
      requireBothTimes: true,
    });
    if (block) {
      applyTimeFieldsSaveBlock(block, {
        setFormError: msg => setErr(msg),
        focusStart: () => focusTimeFieldInput(startFieldRef.current),
        focusEnd: () => focusTimeFieldInput(endFieldRef.current),
      });
      return;
    }
    if (!profile?.company_id) return;
    saveLock.current = true;
    setSaving(true);
    setErr(null);
    try {
      const startDateTime = new Date(`${form.date}T${form.start_time}`);
      let endDateTime = form.end_time ? new Date(`${form.date}T${form.end_time}`) : null;
      if (endDateTime && endDateTime <= startDateTime) {
        endDateTime = new Date(endDateTime.getTime() + 86400000);
      }

      if (isDevFieldAuditAuth()) {
        const startDateTime = new Date(`${form.date}T${form.start_time}`);
        let endDateTime = form.end_time ? new Date(`${form.date}T${form.end_time}`) : null;
        if (endDateTime && endDateTime <= startDateTime) {
          endDateTime = new Date(endDateTime.getTime() + 86400000);
        }
        const auditId = `audit-time-add-${Date.now()}`;
        appendAuditTimesheetEntry({
          id: auditId,
          timesheet_id: timesheets.find(t => t.date === form.date)?.id ?? AUDIT_TIMESHEET_ID,
          company_id: profile.company_id,
          job_id: form.job_id || null,
          start_time: startDateTime.toISOString(),
          end_time: endDateTime?.toISOString() ?? null,
          work_type: form.work_type,
          billable: form.billable,
          notes: form.notes,
          created_at: new Date().toISOString(),
        });
        onSaved();
        return;
      }

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
    } finally {
      setSaving(false);
      saveLock.current = false;
    }
  }

  return (
    <OverlayPortal>
      <div className="overlay-backdrop hub-ops-form-backdrop">
        <div className="overlay-panel-lg hub-ops-form-sheet" onClick={e => e.stopPropagation()}>
          <div className="flex items-center justify-between px-5 py-4 border-b border-[#E2D9CC] shrink-0">
            <h2 className="text-lg font-semibold text-navy">Add Time Entry</h2>
            <button type="button" onClick={onClose} className="hub-ops-form-close flex items-center justify-center hover:bg-[#F5F0E6]">
              <X size={20} />
            </button>
          </div>
          <form onSubmit={handleSave} noValidate className="overlay-body flex flex-col gap-4">
            <Field label="Date">
              <input
                type="date"
                lang="en-AU"
                value={form.date}
                onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
                className="form-input hub-date-input-en-au"
              />
              <p className="ops-meta mt-1">dd/mm/yyyy</p>
            </Field>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Start Time">
                <div ref={startFieldRef}>
                  <TimeFieldInput
                    value={form.start_time}
                    onChange={start_time => setForm(f => ({ ...f, start_time }))}
                    onTimeFieldHintChange={setStartTimeHint}
                    className="form-input"
                  />
                </div>
              </Field>
              <Field label="End Time">
                <div ref={endFieldRef}>
                  <TimeFieldInput
                    value={form.end_time}
                    onChange={end_time => setForm(f => ({ ...f, end_time }))}
                    onTimeFieldHintChange={setEndTimeHint}
                    className="form-input"
                  />
                </div>
              </Field>
            </div>
            {blankTimesOnOpen ? (
              <div className="hub-time-entry-chips">
                {TIME_ENTRY_DURATION_CHIP_HOURS.map(h => (
                  <button
                    key={h}
                    type="button"
                    className="job-time-chip"
                    onClick={() => setForm(f => ({ ...f, ...applyTimeEntryDurationChip(f, h) }))}
                  >
                    {h}h
                  </button>
                ))}
              </div>
            ) : null}
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
            <Field label="Work Type">
              <ManagedSelect
                listKey={LIST_KEYS.workTypes}
                value={form.work_type}
                onChange={v => setForm(f => ({ ...f, work_type: v }))}
                placeholder="Select work type..."
              />
            </Field>
            <Field label="Notes">
              <textarea
                value={form.notes}
                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                rows={2}
                className="form-input min-h-[50px] resize-y"
                placeholder="What did you work on?"
              />
            </Field>
            <label className="hub-ops-form-check">
              <input
                type="checkbox"
                checked={form.billable}
                onChange={e => setForm(f => ({ ...f, billable: e.target.checked }))}
              />
              Billable time
            </label>
            {err && <p className="text-sm text-fail">{err}</p>}
            <div className="hub-ops-form-footer flex justify-end gap-2 pt-2 border-t border-[#E2D9CC]">
              <button type="button" onClick={onClose} className="btn-secondary min-h-[44px]">Cancel</button>
              <button type="submit" disabled={saving} className="btn-primary min-h-[44px] disabled:opacity-50">
                {saving ? 'Saving...' : 'Save'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </OverlayPortal>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="ops-field-label">{label}</span>
      {children}
    </label>
  );
}

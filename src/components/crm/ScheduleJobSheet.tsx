import { useEffect, useState } from 'react';
import { AppDialog, EditorStickyFooter } from '../ui';
import type { JobWithClient } from '../../types/crm';
import type { ScheduleSheetInput } from '../../lib/scheduleBoard';
import { jobsListSite, jobsListSuburbFromSite } from '../../lib/jobsListRow';

function timeInput(value: string | null | undefined): string {
  return (value ?? '').slice(0, 5);
}

function sheetSiteLine(job: JobWithClient | null): string {
  if (!job) return '';
  const suburb = jobsListSuburbFromSite(jobsListSite(job.address, job.client_address));
  return [job.client_name, suburb].filter(Boolean).join(' · ');
}

function FromBooking({ show }: { show: boolean }) {
  if (!show) return null;
  return <span className="hub-schedule-from-booking">From your booking</span>;
}

export function ScheduleJobSheet({
  job,
  teamMembers,
  viewedDate,
  prefill = null,
  matchHints = null,
  fromBooking = null,
  saving = false,
  onClose,
  onSave,
}: {
  job: JobWithClient | null;
  teamMembers: { id: string; name: string }[];
  viewedDate: string;
  prefill?: Partial<ScheduleSheetInput> | null;
  matchHints?: { job?: string | null; client?: string | null; crew?: string | null } | null;
  fromBooking?: { job?: boolean; date?: boolean; start?: boolean; crew?: boolean } | null;
  saving?: boolean;
  onClose: () => void;
  onSave: (fields: ScheduleSheetInput) => void;
}) {
  const [crewId, setCrewId] = useState('');
  const [date, setDate] = useState(viewedDate);
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const site = sheetSiteLine(job);

  useEffect(() => {
    if (!job) return;
    const voiceCrew = !!prefill && 'crewId' in prefill && prefill.crewId;
    setCrewId(voiceCrew ? (prefill?.crewId ?? '') : (job.assigned_team?.[0] ?? ''));
    setDate(prefill?.date || viewedDate);
    setStartTime(prefill?.startTime ? timeInput(prefill.startTime) : timeInput(job.start_time));
    setEndTime(prefill?.endTime ? timeInput(prefill.endTime) : timeInput(job.end_time));
  }, [job, viewedDate, prefill]);

  return (
    <AppDialog
      open={!!job}
      onClose={onClose}
      title="Schedule this job"
      backdropClose
      swipeDownClose
      panelClassName="hub-schedule-job-sheet"
      footer={(
        <EditorStickyFooter
          onCancel={onClose}
          onSave={() => {
            if (!date) return;
            onSave({
              date,
              startTime,
              endTime,
              crewId: crewId || null,
            });
          }}
          saveLabel="Save"
          saving={saving}
        />
      )}
    >
      <div className="hub-schedule-job-sheet-body">
        <h2 className="hub-schedule-job-sheet-heading">Schedule this job</h2>
        <p className="hub-schedule-job-sheet-title">
          {job?.title}
          <FromBooking show={!!fromBooking?.job} />
        </p>
        {site ? <p className="hub-schedule-job-sheet-meta">{site}</p> : null}
        <label className="block">
          <span className="ops-field-label">
            Crew
            <FromBooking show={!!fromBooking?.crew} />
          </span>
          <select
            className="form-input"
            value={crewId}
            onChange={e => setCrewId(e.target.value)}
          >
            <option value="">Unassigned</option>
            {teamMembers.map(member => (
              <option key={member.id} value={member.id}>{member.name}</option>
            ))}
          </select>
        </label>
        {matchHints?.crew ? (
          <p className="hub-schedule-job-sheet-hint">{matchHints.crew}</p>
        ) : null}
        <label className="block">
          <span className="ops-field-label">
            Date
            <FromBooking show={!!fromBooking?.date} />
          </span>
          <input
            type="date"
            className="form-input"
            value={date}
            onChange={e => setDate(e.target.value)}
          />
        </label>
        <label className="block">
          <span className="ops-field-label">
            Start
            <FromBooking show={!!fromBooking?.start} />
          </span>
          <input
            type="time"
            className="form-input"
            value={startTime}
            onChange={e => setStartTime(e.target.value)}
          />
        </label>
        <label className="block">
          <span className="ops-field-label">End</span>
          <input
            type="time"
            className="form-input"
            value={endTime}
            onChange={e => setEndTime(e.target.value)}
          />
        </label>
      </div>
    </AppDialog>
  );
}

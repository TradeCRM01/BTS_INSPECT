import { useEffect, useState } from 'react';
import { AppDialog } from '../ui/AppDialog';
import type { JobWithClient } from '../../types/crm';
import type { ScheduleSheetInput } from '../../lib/scheduleBoard';

function timeInput(value: string | null | undefined): string {
  return (value ?? '').slice(0, 5);
}

export function ScheduleJobSheet({
  job,
  teamMembers,
  viewedDate,
  saving = false,
  onClose,
  onSave,
}: {
  job: JobWithClient | null;
  teamMembers: { id: string; name: string }[];
  viewedDate: string;
  saving?: boolean;
  onClose: () => void;
  onSave: (fields: ScheduleSheetInput) => void;
}) {
  const [crewId, setCrewId] = useState('');
  const [date, setDate] = useState(viewedDate);
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');

  useEffect(() => {
    if (!job) return;
    setCrewId(job.assigned_team?.[0] ?? '');
    setDate(viewedDate);
    setStartTime(timeInput(job.start_time));
    setEndTime(timeInput(job.end_time));
  }, [job, viewedDate]);

  return (
    <AppDialog
      open={!!job}
      onClose={onClose}
      title="Schedule this job"
      backdropClose
      panelClassName="hub-schedule-job-sheet"
      footer={(
        <div className="hub-schedule-job-sheet-foot">
          <button
            type="button"
            className="btn-primary"
            disabled={saving || !date}
            onClick={() => onSave({
              date,
              startTime,
              endTime,
              crewId: crewId || null,
            })}
          >
            Save
          </button>
        </div>
      )}
    >
      <div className="hub-schedule-job-sheet-body">
        <h2 className="hub-schedule-job-sheet-heading">Schedule this job</h2>
        <p className="hub-schedule-job-sheet-title">{job?.title}</p>
        <label className="block">
          <span className="ops-field-label">Crew</span>
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
        <label className="block">
          <span className="ops-field-label">Date</span>
          <input
            type="date"
            className="form-input"
            value={date}
            onChange={e => setDate(e.target.value)}
          />
        </label>
        <label className="block">
          <span className="ops-field-label">Start</span>
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

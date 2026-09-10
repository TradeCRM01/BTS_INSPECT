import { useState } from 'react';
import type { StaffHours } from '../../lib/booking';

export type StaffHoursRow = StaffHours & { id?: string };

export function StaffHoursPanel({
  date,
  members,
  hours,
  saving = false,
  unavailable = false,
  onSave,
  onClear,
}: {
  date: string;
  members: { id: string; name: string }[];
  hours: StaffHoursRow[];
  saving?: boolean;
  unavailable?: boolean;
  onSave: (row: StaffHours) => void;
  onClear: (memberId: string, date: string) => void;
}) {
  const [memberId, setMemberId] = useState(members[0]?.id ?? '');
  const [working, setWorking] = useState(false);
  const [start, setStart] = useState('07:00');
  const [end, setEnd] = useState('16:00');
  const [reason, setReason] = useState('');

  const existing = hours.filter(h => h.date === date);

  if (unavailable) {
    return (
      <div className="ops-tray mb-3">
        <div className="ops-tray-head">
          <p className="ops-card-kicker">Hours & leave</p>
        </div>
        <p className="ops-meta px-3 py-2">
          Dated hours are not on this database yet. Overlap warnings still run from existing jobs.
        </p>
      </div>
    );
  }

  if (members.length === 0) return null;

  return (
    <div className="ops-tray mb-3">
      <div className="ops-tray-head">
        <p className="ops-card-kicker">Hours & leave</p>
        <span className="ops-meta">{date}</span>
      </div>
      <div className="px-3 py-2 space-y-2">
        <p className="ops-meta">
          Record a day off or different hours for this date. An empty row means the usual pattern — we do not invent one.
        </p>
        <div className="flex flex-wrap items-end gap-2">
          <label className="block">
            <span className="ops-field-label">Person</span>
            <select
              className="form-input"
              value={memberId}
              onChange={e => setMemberId(e.target.value)}
            >
              {members.map(m => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="ops-field-label">That day</span>
            <select
              className="form-input"
              value={working ? 'working' : 'off'}
              onChange={e => setWorking(e.target.value === 'working')}
            >
              <option value="off">Day off</option>
              <option value="working">Working hours</option>
            </select>
          </label>
          {working && (
            <>
              <label className="block">
                <span className="ops-field-label">Start</span>
                <input type="time" className="form-input" value={start} onChange={e => setStart(e.target.value)} />
              </label>
              <label className="block">
                <span className="ops-field-label">End</span>
                <input type="time" className="form-input" value={end} onChange={e => setEnd(e.target.value)} />
              </label>
            </>
          )}
          <label className="block min-w-[10rem] flex-1">
            <span className="ops-field-label">Reason</span>
            <input
              className="form-input"
              maxLength={200}
              value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder="Leave, rail shutdown…"
            />
          </label>
          <button
            type="button"
            className="btn-secondary min-h-11"
            disabled={saving || !memberId || !reason.trim()}
            onClick={() => onSave({
              memberId,
              date,
              working,
              start: working ? start : null,
              end: working ? end : null,
              reason: reason.trim(),
            })}
          >
            Save
          </button>
        </div>
        {existing.length === 0 ? (
          <p className="ops-meta">No exceptions on this date.</p>
        ) : (
          <ul className="space-y-1">
            {existing.map(row => {
              const name = members.find(m => m.id === row.memberId)?.name ?? 'Someone';
              return (
                <li key={`${row.memberId}-${row.date}`} className="flex items-center justify-between gap-2 text-xs">
                  <span>
                    <b>{name}</b>
                    {row.working
                      ? ` · ${row.start?.slice(0, 5)}–${row.end?.slice(0, 5)}`
                      : ' · off'}
                    {row.reason ? ` · ${row.reason}` : ''}
                  </span>
                  <button
                    type="button"
                    className="ops-link"
                    onClick={() => onClear(row.memberId, row.date)}
                  >
                    Restore usual
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

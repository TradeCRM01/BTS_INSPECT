import { useRef, useState } from 'react';
import { Camera, Check, Clock, Play, Square, StickyNote } from 'lucide-react';
import type { JobStatus } from '../../types/crm';

export function JobFieldPathBar({
  status,
  clockedOn,
  busy,
  onClockOn,
  onClockOff,
  onNote,
  onPhoto,
  onAllDone,
  onMoreToDo,
  onStartJha,
  onStartTake5,
}: {
  status: JobStatus;
  clockedOn: boolean;
  busy: boolean;
  onClockOn: () => void;
  onClockOff: () => void;
  onNote: (note: string) => void;
  onPhoto: (file: File) => void;
  onAllDone: () => void;
  onMoreToDo: () => void;
  onStartJha: () => void;
  onStartTake5: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [noteOpen, setNoteOpen] = useState(false);
  const [note, setNote] = useState('');
  const closed = status === 'cancelled' || status === 'completed';

  function submitNote() {
    const text = note.trim();
    if (!text) return;
    onNote(text);
    setNote('');
    setNoteOpen(false);
  }

  return (
    <div className="job-field-path lg:hidden" data-testid="job-field-path">
      <p className="ops-meta mb-2">On site</p>
      <div className="job-field-path-paper">
        <button type="button" className="job-field-path-paper-btn" disabled={busy} onClick={onStartJha}>
          JHA
        </button>
        <button type="button" className="job-field-path-paper-btn" disabled={busy} onClick={onStartTake5}>
          Take 5
        </button>
      </div>
      <div className="job-field-path-grid">
        {clockedOn ? (
          <button type="button" className="btn-danger" disabled={busy} onClick={onClockOff}>
            <Square size={16} /> Clock off
          </button>
        ) : (
          <button type="button" className="btn-secondary" disabled={busy || closed} onClick={onClockOn}>
            <Play size={16} /> Clock on
          </button>
        )}
        <button type="button" className="btn-secondary" disabled={busy || closed} onClick={() => fileRef.current?.click()}>
          <Camera size={16} /> Photo
        </button>
        <button type="button" className="btn-secondary" disabled={busy || closed} onClick={() => setNoteOpen(open => !open)}>
          <StickyNote size={16} /> Note
        </button>
        <button type="button" className="btn-secondary" disabled={busy || closed} onClick={onMoreToDo}>
          <Clock size={16} /> More to do
        </button>
        <button type="button" className="btn-primary" disabled={busy || closed} onClick={onAllDone}>
          <Check size={16} /> All done
        </button>
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="sr-only"
        onChange={e => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (file) onPhoto(file);
        }}
      />
      {noteOpen ? (
        <div className="mt-3 space-y-2">
          <textarea
            value={note}
            onChange={e => setNote(e.target.value)}
            rows={3}
            className="form-input w-full"
            placeholder="What happened on site?"
          />
          <button type="button" className="btn-primary w-full" disabled={!note.trim() || busy} onClick={submitNote}>
            Save note
          </button>
        </div>
      ) : null}
    </div>
  );
}

import { useRef, useState, type FormEvent } from 'react';
import { Mic } from 'lucide-react';
import {
  browserSpeechRecognition,
  isSpeechPermissionDenied,
  transcriptFromSpeechEvent,
  type QuickBookSpeech,
} from '../../lib/quickBook';

export type ScheduleVoiceJobPick = {
  id: string;
  title?: string | null;
  client_name?: string | null;
};

export function ScheduleBookByVoice({
  onApply,
  applying = false,
  hints,
  jobPicks = [],
  onPickJob,
}: {
  onApply: (phrase: string) => void;
  applying?: boolean;
  hints?: { job?: string | null; client?: string | null; crew?: string | null };
  jobPicks?: ScheduleVoiceJobPick[];
  onPickJob?: (jobId: string) => void;
}) {
  const [phrase, setPhrase] = useState('');
  const [listening, setListening] = useState(false);
  const [micDenied, setMicDenied] = useState(false);
  const speechRef = useRef<QuickBookSpeech | null>(null);
  const Speech = browserSpeechRecognition();

  function applyPhrase(raw: string) {
    const next = raw.trim();
    if (!next || applying) return;
    onApply(next);
  }

  function startVoice() {
    if (!Speech) return;
    speechRef.current?.stop();
    const rec = new Speech();
    rec.lang = 'en-AU';
    rec.interimResults = false;
    rec.continuous = false;
    rec.onresult = ev => {
      const spoken = transcriptFromSpeechEvent(ev);
      if (!spoken) return;
      setPhrase(spoken);
      applyPhrase(spoken);
    };
    rec.onend = () => setListening(false);
    rec.onerror = ev => {
      setListening(false);
      if (isSpeechPermissionDenied(ev?.error)) setMicDenied(true);
    };
    speechRef.current = rec;
    setListening(true);
    setMicDenied(false);
    rec.start();
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    applyPhrase(phrase);
  }

  const hint = [hints?.job, hints?.client, hints?.crew].filter(Boolean).join(' ');

  return (
    <div className="hub-schedule-voice" data-schedule-voice="1">
      <form className="hub-schedule-voice-form" onSubmit={onSubmit}>
        <label className="hub-schedule-voice-label" htmlFor="hub-schedule-voice-text">
          Book by voice
        </label>
        <input
          id="hub-schedule-voice-text"
          className="form-input"
          value={phrase}
          onChange={e => setPhrase(e.target.value)}
          placeholder="Smith job Thursday 7am with Dave"
          aria-label="Type a booking"
          disabled={applying}
        />
        {Speech ? (
          <button
            type="button"
            className={`hub-schedule-voice-mic${listening ? ' is-on' : ''}`}
            aria-label={listening ? 'Stop voice' : 'Speak a booking'}
            onClick={() => {
              if (listening) {
                speechRef.current?.stop();
                return;
              }
              startVoice();
            }}
            disabled={applying}
          >
            <Mic size={16} />
          </button>
        ) : null}
        <button
          type="submit"
          className="hub-schedule-voice-go"
          disabled={applying || !phrase.trim()}
        >
          Prefill
        </button>
      </form>
      {micDenied ? (
        <p className="hub-schedule-voice-hint">Microphone is blocked. Type the booking instead.</p>
      ) : !Speech ? (
        <p className="hub-schedule-voice-hint">Type a booking — this browser has no voice.</p>
      ) : null}
      {hint ? <p className="hub-schedule-voice-hint">{hint}</p> : null}
      {jobPicks.length > 0 ? (
        <ul className="hub-schedule-voice-picks">
          {jobPicks.map(job => (
            <li key={job.id}>
              <button
                type="button"
                className="hub-schedule-voice-pick"
                onClick={() => onPickJob?.(job.id)}
              >
                {[job.title, job.client_name].filter(Boolean).join(' · ') || 'Job'}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

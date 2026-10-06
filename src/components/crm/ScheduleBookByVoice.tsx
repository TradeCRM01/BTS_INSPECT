import { useRef, useState, type FormEvent } from 'react';
import { Mic } from 'lucide-react';
import {
  browserSpeechRecognition,
  transcriptFromSpeechEvent,
  type QuickBookSpeech,
} from '../../lib/quickBook';
import {
  isActiveSpeechRecognition,
  speechRecognitionErrorHint,
  stopSpeechRecognitionByUser,
} from '../../lib/speechHints';

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
  const [micHint, setMicHint] = useState<string | null>(null);
  const speechRef = useRef<QuickBookSpeech | null>(null);
  const Speech = browserSpeechRecognition();

  const speechStatus = micHint ?? '';

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
      if (!isActiveSpeechRecognition(rec, speechRef)) return;
      const spoken = transcriptFromSpeechEvent(ev);
      if (!spoken) return;
      setPhrase(spoken);
      applyPhrase(spoken);
    };
    rec.onend = () => {
      if (!isActiveSpeechRecognition(rec, speechRef)) return;
      setListening(false);
    };
    rec.onerror = ev => {
      if (!isActiveSpeechRecognition(rec, speechRef)) return;
      setListening(false);
      const hint = speechRecognitionErrorHint(ev?.error);
      setMicHint(hint);
    };
    speechRef.current = rec;
    setListening(true);
    setMicHint(null);
    rec.start();
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    applyPhrase(phrase);
  }

  const hintLines = [hints?.job, hints?.client].filter((line): line is string => !!line);

  return (
    <div className="hub-schedule-voice" data-schedule-voice="1">
      <form className="hub-schedule-voice-form" onSubmit={onSubmit}>
        <label className="hub-schedule-voice-label" htmlFor="hub-schedule-voice-text">
          Quick book
        </label>
        <div className="hub-schedule-voice-row">
          <input
            id="hub-schedule-voice-text"
            className="form-input"
            value={phrase}
            onChange={e => {
              setPhrase(e.target.value);
              setMicHint(null);
            }}
            placeholder="Job, day, time, crew"
            aria-label="Type a booking"
            disabled={applying}
          />
          {Speech ? (
            <button
              type="button"
              className={`hub-schedule-voice-mic${listening ? ' is-on' : ''}`}
              aria-label={listening ? 'Stop voice' : 'Speak a booking'}
              aria-pressed={listening}
              onClick={() => {
                if (listening) {
                  setListening(false);
                  stopSpeechRecognitionByUser(speechRef);
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
        </div>
      </form>
      <p className="hub-speech-status hub-schedule-speech-status" role="status">
        {speechStatus}
      </p>
      {hintLines.map(line => (
        <p key={line} className="hub-schedule-voice-hint">{line}</p>
      ))}
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

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  isActiveSpeechRecognition,
  isSpeechPermissionDenied,
  speechRecognitionErrorHint,
} from './speechHints';

function src(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8');
}

describe('speechRecognitionErrorHint', () => {
  it('maps speech recognition errors to honest mic hints for booking and job copy', () => {
    expect(speechRecognitionErrorHint('not-allowed', 'booking')).toBe(
      'Microphone is blocked. Type the booking instead.',
    );
    expect(speechRecognitionErrorHint('service-not-allowed', 'booking')).toBe(
      'Microphone is blocked. Type the booking instead.',
    );
    expect(speechRecognitionErrorHint('not-allowed', 'job')).toBe(
      'Microphone is blocked. Type the job instead.',
    );
    expect(speechRecognitionErrorHint('audio-capture', 'job')).toBe('No microphone found. Type instead.');
    expect(speechRecognitionErrorHint('no-speech', 'booking')).toBe(
      'Didn\'t catch that. Try again or type it.',
    );
    expect(speechRecognitionErrorHint('network', 'job')).toBe(
      'Didn\'t catch that. Try again or type it.',
    );
    expect(speechRecognitionErrorHint(undefined, 'job')).toBe(
      'Didn\'t catch that. Try again or type it.',
    );
  });

  it('returns no hint for deliberate stop (aborted)', () => {
    expect(speechRecognitionErrorHint('aborted', 'job')).toBeNull();
    expect(speechRecognitionErrorHint('aborted', 'booking')).toBeNull();
  });

  it('detects permission denial', () => {
    expect(isSpeechPermissionDenied('not-allowed')).toBe(true);
    expect(isSpeechPermissionDenied('service-not-allowed')).toBe(true);
    expect(isSpeechPermissionDenied('no-speech')).toBe(false);
  });
});

describe('speech mic UI wiring', () => {
  it('clears hints when the user types', () => {
    const voice = src('src/components/crm/ScheduleBookByVoice.tsx');
    const quotes = src('src/pages/QuotesPage.tsx');
    expect(voice).toMatch(/onChange=\{e => \{[\s\S]*setMicHint\(null\)/);
    expect(quotes).toMatch(/onChange=\{e => \{[\s\S]*setQuickMicHint\(null\)/);
  });

  it('ignores stale recognition session callbacks', () => {
    const voice = src('src/components/crm/ScheduleBookByVoice.tsx');
    const quotes = src('src/pages/QuotesPage.tsx');
    expect(voice).toContain('isActiveSpeechRecognition(rec, speechRef)');
    expect(voice).toContain('rec.onend');
    expect(voice).toContain('rec.onerror');
    expect(quotes).toContain('isActiveSpeechRecognition(rec, quickSpeechRef)');
    expect(quotes).toContain('rec.onend');
    expect(quotes).toContain('rec.onerror');
  });

  it('exposes mic hints as status for screen readers', () => {
    expect(src('src/components/crm/ScheduleBookByVoice.tsx')).toContain('role="status"');
    expect(src('src/pages/QuotesPage.tsx')).toContain('role="status"');
    expect(src('src/pages/QuotesPage.tsx')).toContain('hub-speech-hint');
    expect(src('src/pages/QuotesPage.tsx')).not.toContain('hub-schedule-voice-hint');
  });

  it('keeps quick-quote mic at 44px and reserves hint space below the row', () => {
    const css = src('src/index.css');
    expect(css).toContain('.hub-quick-quote-mic {\n    flex: 0 0 44px;');
    expect(css).toContain('.hub-quick-quote-hint-slot');
  });
});

describe('isActiveSpeechRecognition', () => {
  it('only accepts the current recognition instance', () => {
    const active: { current: { id: number } | null } = { current: { id: 1 } };
    expect(isActiveSpeechRecognition(active.current!, active)).toBe(true);
    expect(isActiveSpeechRecognition({ id: 2 }, active)).toBe(false);
    active.current = null;
    expect(isActiveSpeechRecognition({ id: 1 }, active)).toBe(false);
  });
});

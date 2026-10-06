import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  isActiveSpeechRecognition,
  isSpeechPermissionDenied,
  SPEECH_MIC_BLOCKED_HINT,
  speechRecognitionErrorHint,
  stopSpeechRecognitionByUser,
} from './speechHints';

function src(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8');
}

function applyRecognitionError(
  rec: object,
  activeRef: { current: object | null },
  error: string | undefined,
): string | null {
  if (!isActiveSpeechRecognition(rec, activeRef)) return null;
  return speechRecognitionErrorHint(error);
}

describe('speechRecognitionErrorHint', () => {
  it('maps speech recognition errors to honest mic hints (Coach C1 blocked copy)', () => {
    expect(SPEECH_MIC_BLOCKED_HINT).toBe(
      'Microphone is blocked. Allow it for grafter.com.au in your browser settings, or type instead.',
    );
    expect(speechRecognitionErrorHint('not-allowed')).toBe(SPEECH_MIC_BLOCKED_HINT);
    expect(speechRecognitionErrorHint('service-not-allowed')).toBe(SPEECH_MIC_BLOCKED_HINT);
    expect(speechRecognitionErrorHint('audio-capture')).toBe('No microphone found. Type instead.');
    expect(speechRecognitionErrorHint('no-speech')).toBe(
      'Didn\'t catch that. Try again or type it.',
    );
    expect(speechRecognitionErrorHint('network')).toBe(
      'Didn\'t catch that. Try again or type it.',
    );
    expect(speechRecognitionErrorHint(undefined)).toBe(
      'Didn\'t catch that. Try again or type it.',
    );
  });

  it('returns no hint for deliberate stop (aborted)', () => {
    expect(speechRecognitionErrorHint('aborted')).toBeNull();
  });

  it('detects permission denial', () => {
    expect(isSpeechPermissionDenied('not-allowed')).toBe(true);
    expect(isSpeechPermissionDenied('service-not-allowed')).toBe(true);
    expect(isSpeechPermissionDenied('no-speech')).toBe(false);
  });
});

describe('stopSpeechRecognitionByUser', () => {
  it('detaches before stop so late no-speech does not surface a hint', () => {
    const rec = { stop: vi.fn() };
    const activeRef: { current: object | null } = { current: rec };
    stopSpeechRecognitionByUser(activeRef as { current: { stop(): void } | null });
    expect(activeRef.current).toBeNull();
    expect(rec.stop).toHaveBeenCalledOnce();
    expect(applyRecognitionError(rec, activeRef, 'no-speech')).toBeNull();
    expect(applyRecognitionError(rec, activeRef, 'aborted')).toBeNull();
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

  it('nulls the ref before stop on deliberate user stop', () => {
    const voice = src('src/components/crm/ScheduleBookByVoice.tsx');
    const quotes = src('src/pages/QuotesPage.tsx');
    expect(voice).toContain('stopSpeechRecognitionByUser(speechRef)');
    expect(quotes).toContain('stopSpeechRecognitionByUser(quickSpeechRef)');
    expect(voice).toMatch(/setListening\(false\);[\s\S]*stopSpeechRecognitionByUser/);
    expect(quotes).toMatch(/setQuickListening\(false\);[\s\S]*stopSpeechRecognitionByUser/);
  });

  it('uses one always-mounted status region per surface', () => {
    const voice = src('src/components/crm/ScheduleBookByVoice.tsx');
    const quotes = src('src/pages/QuotesPage.tsx');
    expect(voice).toContain('hub-schedule-speech-status');
    expect(voice).toContain('role="status"');
    expect(voice).not.toMatch(/micHint \? \([\s\S]*role="status"/);
    expect(quotes).toContain('hub-quick-quote-speech-status');
    expect(quotes).not.toContain('aria-live');
    expect(quotes).not.toContain('hub-quick-quote-hint-slot');
  });

  it('hides the mic when speech recognition is unavailable', () => {
    const voice = src('src/components/crm/ScheduleBookByVoice.tsx');
    const quotes = src('src/pages/QuotesPage.tsx');
    expect(voice).toContain('{Speech ? (');
    expect(voice).not.toContain('Voice isn');
    expect(quotes).toContain('{Speech ? (');
  });

  it('quotes mic exposes Stop voice and aria-pressed while listening', () => {
    const quotes = src('src/pages/QuotesPage.tsx');
    expect(quotes).toContain("aria-label={quickListening ? 'Stop voice' : 'Voice note'}");
    expect(quotes).toContain('aria-pressed={quickListening}');
  });

  it('renders speech hints in normal flow under the control row', () => {
    const css = src('src/index.css');
    expect(css).toContain('.hub-quick-quote-mic {\n    flex: 0 0 44px;');
    expect(css).toContain('.hub-quick-quote-speech-status:not(:empty)');
    expect(css).toContain('.hub-schedule-speech-status:not(:empty)');
    expect(css).not.toMatch(/hub-quick-quote-speech-status[\s\S]{0,200}position:\s*absolute/);
    expect(css).not.toMatch(/hub-schedule-speech-status[\s\S]{0,200}position:\s*absolute/);
  });

  it('puts quotes desktop hints in head row 2 via grid without margin calc', () => {
    const css = src('src/index.css');
    expect(css).toContain('.hub-quotes .ops-page-head');
    expect(css).toContain('display: grid');
    expect(css).toContain('display: contents');
    expect(css).toContain('grid-column: 2');
    expect(css).toContain('grid-row: 2');
    expect(css).not.toContain('margin-top: calc(13px * 1.5');
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

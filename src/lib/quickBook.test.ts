import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  browserSpeechRecognition,
  isSpeechPermissionDenied,
  matchNamed,
  matchQuickBookJobs,
  parseQuickBook,
  parseQuickBookDate,
  parseQuickBookTime,
  resolveQuickBook,
  speechRecognitionCtor,
  transcriptFromSpeechEvent,
  unmatchedHint,
} from './quickBook';

function src(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8');
}

const NOW = new Date(2026, 9, 6, 12, 0, 0);

const jobs = [
  { id: 'job-hot', title: 'Hot water', client_name: 'Smith Plumbing', job_number: 51 },
  { id: 'job-lights', title: 'Warehouse lights', client_name: 'PWD Group', job_number: 48 },
  { id: 'job-fit', title: 'Kitchen fit', client_name: 'Smith', job_number: 52 },
];

const crew = [
  { id: 'crew-dave', name: 'Dave Hale' },
  { id: 'crew-sam', name: 'Sam Ortiz' },
];

describe('quickBook parser', () => {
  it('parses a weekday + time + crew phrase into unresolved tokens', () => {
    const parsed = parseQuickBook('Smith job Thursday 7am with Dave', NOW);
    expect(parsed.subjectToken).toBe('Smith');
    expect(parsed.crewToken).toBe('Dave');
    expect(parsed.date).toBe('2026-10-08');
    expect(parsed.startTime).toBe('07:00');
    expect(src('src/lib/quickBook.ts')).not.toMatch(/from ['"].*supabase|useQuery|useState/);
  });

  it('keeps a client or job name token after stripping job/book filler', () => {
    expect(parseQuickBook('Smith job Thursday 7am with Dave', NOW).subjectToken).toBe('Smith');
    expect(parseQuickBook('Hot water tomorrow 2pm', NOW).subjectToken).toBe('Hot water');
    expect(parseQuickBook('warehouse lights today 7:30am with Sam', NOW).subjectToken).toBe('warehouse lights');
  });

  it('parses today, tomorrow, and Thursday-style dates from a fixed now', () => {
    expect(parseQuickBookDate('today', NOW)).toBe('2026-10-06');
    expect(parseQuickBookDate('tomorrow', NOW)).toBe('2026-10-07');
    expect(parseQuickBookDate('Thursday', NOW)).toBe('2026-10-08');
    expect(parseQuickBookDate('thu', NOW)).toBe('2026-10-08');
    expect(parseQuickBookDate('this Friday', NOW)).toBe('2026-10-09');
    expect(parseQuickBook('book today 9am', NOW).date).toBe('2026-10-06');
    expect(parseQuickBook('book tomorrow 9am', NOW).date).toBe('2026-10-07');
  });

  it('parses am/pm and 24h start times', () => {
    expect(parseQuickBookTime('7am')).toBe('07:00');
    expect(parseQuickBookTime('7 am')).toBe('07:00');
    expect(parseQuickBookTime('7:30am')).toBe('07:30');
    expect(parseQuickBookTime('7 pm')).toBe('19:00');
    expect(parseQuickBookTime('7:30 pm')).toBe('19:30');
    expect(parseQuickBookTime('12am')).toBe('00:00');
    expect(parseQuickBookTime('12pm')).toBe('12:00');
    expect(parseQuickBookTime('14:00')).toBe('14:00');
    expect(parseQuickBook('Smith Thursday 7PM with Dave', NOW).startTime).toBe('19:00');
  });

  it('matches a unique job or client name and never silently picks among many', () => {
    expect(matchQuickBookJobs('warehouse lights', jobs)).toMatchObject({
      kind: 'one',
      items: [{ id: 'job-lights' }],
    });
    expect(matchQuickBookJobs('Smith', jobs).kind).toBe('many');
    expect(matchQuickBookJobs('Smith', jobs).items.map(job => job.id)).toEqual(['job-hot', 'job-fit']);
    expect(matchQuickBookJobs('no-such-job', jobs)).toMatchObject({ kind: 'none', items: [] });
    expect(matchNamed('Dave', crew)).toMatchObject({ kind: 'one', items: [{ id: 'crew-dave' }] });
    expect(matchNamed('Dave', [
      { id: 'crew-dave', name: 'Dave Hale' },
      { id: 'crew-dave-2', name: 'Dave Chen' },
    ]).kind).toBe('many');
  });

  it('leaves unmatched crew empty with a Couldn\'t match hint', () => {
    const resolved = resolveQuickBook('Smith job Thursday 7am with Dave', {
      jobs: [jobs[1]],
      crew: [{ id: 'crew-sam', name: 'Sam Ortiz' }],
      clients: [{ id: 'cli-pwd', name: 'PWD Group' }],
    }, NOW);
    expect(resolved.parse.crewToken).toBe('Dave');
    expect(resolved.crew.kind).toBe('none');
    expect(resolved.prefill.crewId).toBeNull();
    expect(resolved.hints.crew).toBe(unmatchedHint('crew', 'Dave'));
    expect(resolved.hints.crew).toContain('Couldn\'t match crew');
  });

  it('prefills date, time, and unique crew without guessing a job among many', () => {
    const resolved = resolveQuickBook('Smith job Thursday 7am with Dave', {
      jobs,
      crew,
      clients: [
        { id: 'cli-smith', name: 'Smith Plumbing' },
        { id: 'cli-smith-2', name: 'Smith' },
      ],
    }, NOW);
    expect(resolved.jobs.kind).toBe('many');
    expect(resolved.prefill).toEqual({
      date: '2026-10-08',
      startTime: '07:00',
      crewId: 'crew-dave',
    });
    expect(resolved.hints.job).toContain('A few jobs match');
    expect(resolved.hints.crew).toBeNull();
  });
});

describe('quickBook speech helper and Schedule wire', () => {
  it('uses the free en-AU SpeechRecognition ctor and treats not-allowed as denied', () => {
    expect(speechRecognitionCtor({})).toBeNull();
    class FakeSpeech {
      lang = '';
      interimResults = false;
      continuous = false;
      onresult = null;
      onend = null;
      onerror = null;
      start() {}
      stop() {}
    }
    expect(speechRecognitionCtor({ webkitSpeechRecognition: FakeSpeech })).toBe(FakeSpeech);
    expect(transcriptFromSpeechEvent({
      results: [[{ transcript: '  Smith job Thursday 7am with Dave  ' }]],
    })).toBe('Smith job Thursday 7am with Dave');
    expect(isSpeechPermissionDenied('not-allowed')).toBe(true);
    expect(isSpeechPermissionDenied('service-not-allowed')).toBe(true);
    expect(isSpeechPermissionDenied('no-speech')).toBe(false);
    expect(browserSpeechRecognition()).toBeNull();
  });

  it('wires Book by voice into the existing Schedule this job sheet, confirm to save only', () => {
    const page = src('src/pages/SchedulePage.tsx');
    const sheet = src('src/components/crm/ScheduleJobSheet.tsx');
    const voice = src('src/components/crm/ScheduleBookByVoice.tsx');
    expect(page).toContain('ScheduleBookByVoice');
    expect(page).toContain('resolveQuickBook');
    expect(page).toContain('scheduleFromSheet.mutate');
    expect(page).not.toMatch(/from\('jobs'\)\.insert/);
    expect(voice).toContain('Book by voice');
    expect(voice).toContain("lang = 'en-AU'");
    expect(voice).toContain('browserSpeechRecognition');
    expect(voice).toContain('{Speech ? (');
    expect(voice).toContain('Microphone is blocked. Type the booking instead.');
    expect(voice).toContain('hub-schedule-voice-hint');
    expect(src('src/lib/quickBook.ts')).toContain('Couldn\'t match');
    expect(sheet).toContain('prefill');
    expect(sheet).toContain('matchHints');
    expect(sheet).toContain('EditorStickyFooter');
    expect(sheet).toContain('saveLabel="Save"');
    expect(src('src/index.css')).toContain('.hub-schedule-voice');
    expect(src('src/index.css')).toContain('min-height: 44px');
  });
});

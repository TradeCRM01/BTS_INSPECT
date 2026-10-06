import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  browserSpeechRecognition,
  instantInBrisbane,
  isSpeechPermissionDenied,
  matchNamed,
  matchQuickBookCrew,
  matchQuickBookJobs,
  parseQuickBook,
  parseQuickBookDate,
  parseQuickBookTime,
  resolveQuickBook,
  speechRecognitionCtor,
  spokenSheetFields,
  transcriptFromSpeechEvent,
  unmatchedHint,
} from './quickBook';

function src(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8');
}

const NOW = instantInBrisbane(2026, 10, 6, 12, 0);

const jobs = [
  { id: 'job-hot', title: 'Hot water', client_name: 'Smith Plumbing', job_number: 51 },
  { id: 'job-lights', title: 'Warehouse lights', client_name: 'PWD Group', job_number: 48 },
  { id: 'job-fit', title: 'Kitchen fit', client_name: 'Smith', job_number: 52 },
];

const crew = [
  { id: 'crew-dave', name: 'Dave Hale' },
  { id: 'crew-sam', name: 'Sam Ortiz' },
  { id: 'crew-jordan', name: 'Jordan Lee' },
];

const tradesJobs = [
  { id: 'j-plumb', title: 'Blocked drain', client_name: 'River House', job_number: 101 },
  { id: 'j-spark', title: 'Switchboard', client_name: 'Harbour Trade', job_number: 102 },
  { id: 'j-chip', title: 'Kitchen fit', client_name: 'Oak Street', job_number: 103 },
  { id: 'j-paint', title: 'Hall paint', client_name: 'Ash Grove', job_number: 104 },
  { id: 'j-air', title: 'Split system', client_name: 'Breeze Co', job_number: 105 },
  { id: 'j-land', title: 'Garden beds', client_name: 'Green Edge', job_number: 106 },
  { id: 'j-tile', title: 'Bathroom tile', client_name: 'Tile House', job_number: 107 },
  { id: 'j-roof', title: 'Roof leak', client_name: 'Ridge Run', job_number: 108 },
  { id: 'j-clean', title: 'Office clean', client_name: 'Clear Floors', job_number: 109 },
  { id: 'j-handy', title: 'Door latch', client_name: 'Handy Stop', job_number: 110 },
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
    expect(parseQuickBook("Smith's job Thursday 7am with Dave", NOW).subjectToken).toBe('Smith');
    expect(parseQuickBook('Hot water tomorrow 2pm', NOW).subjectToken).toBe('Hot water');
    expect(parseQuickBook('warehouse lights today 7:30am with Sam', NOW).subjectToken).toBe('warehouse lights');
  });

  it('parses today, tomorrow, Thursday, next Monday, and on the 14th in Australia/Brisbane', () => {
    expect(src('src/lib/quickBook.ts')).toContain('Australia/Brisbane');
    expect(parseQuickBookDate('today', NOW)).toBe('2026-10-06');
    expect(parseQuickBookDate('tomorrow', NOW)).toBe('2026-10-07');
    expect(parseQuickBookDate('Thursday', NOW)).toBe('2026-10-08');
    expect(parseQuickBookDate('thu', NOW)).toBe('2026-10-08');
    expect(parseQuickBookDate('thurday', NOW)).toBe('2026-10-08');
    expect(parseQuickBookDate('this Friday', NOW)).toBe('2026-10-09');
    expect(parseQuickBookDate('on the 14th', NOW)).toBe('2026-10-14');
    expect(parseQuickBook('book today 9am', NOW).date).toBe('2026-10-06');
    expect(parseQuickBook('book tomorrow 9am', NOW).date).toBe('2026-10-07');
    const mondayMorning = instantInBrisbane(2026, 10, 5, 9, 0);
    expect(parseQuickBook('next Monday 7am', mondayMorning).date).toBe('2026-10-12');
    expect(parseQuickBook('Monday 7am', instantInBrisbane(2026, 10, 5, 8, 0)).date).toBe('2026-10-12');
    expect(parseQuickBook('Monday 7am', instantInBrisbane(2026, 10, 5, 6, 0)).date).toBe('2026-10-05');
    expect(parseQuickBookDate('today', new Date('2026-10-06T16:00:00.000Z'))).toBe('2026-10-07');
  });

  it('parses am/pm, spoken clocks, and strips time words from the job token', () => {
    expect(parseQuickBookTime('7am')).toBe('07:00');
    expect(parseQuickBookTime('7 am')).toBe('07:00');
    expect(parseQuickBookTime('7:30am')).toBe('07:30');
    expect(parseQuickBookTime('7.30am')).toBe('07:30');
    expect(parseQuickBookTime('7 pm')).toBe('19:00');
    expect(parseQuickBookTime('7:30 pm')).toBe('19:30');
    expect(parseQuickBookTime('12am')).toBe('00:00');
    expect(parseQuickBookTime('12pm')).toBe('12:00');
    expect(parseQuickBookTime('14:00')).toBe('14:00');
    expect(parseQuickBookTime('half past 7')).toBe('07:30');
    expect(parseQuickBookTime('at 7')).toBe('07:00');
    expect(parseQuickBookTime("7 o'clock")).toBe('07:00');
    expect(parseQuickBookTime('seven am')).toBe('07:00');
    expect(parseQuickBookTime('midday')).toBe('12:00');
    expect(parseQuickBookTime('noon')).toBe('12:00');
    expect(parseQuickBook('Smith Thursday 7PM with Dave', NOW).startTime).toBe('19:00');
    expect(parseQuickBook("Hot water Thursday 7 o'clock", NOW).subjectToken).toBe('Hot water');
    expect(parseQuickBook("Hot water Thursday 7 o'clock", NOW).subjectToken).not.toMatch(/7|o['’]?clock/i);
  });

  it('parses date and time before a with in the job title', () => {
    const parsed = parseQuickBook('Meeting with client Thursday 7am with Dave', NOW);
    expect(parsed.date).toBe('2026-10-08');
    expect(parsed.startTime).toBe('07:00');
    expect(parsed.crewToken).toBe('Dave');
    expect(parsed.subjectToken).toBe('Meeting with client');
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

  it('does not silently pick Jordan from Dan, and asks when two crew are spoken', () => {
    expect(matchNamed('Dan', crew).kind).toBe('none');
    expect(matchNamed('Dan', crew).items).toEqual([]);
    const two = parseQuickBook('Switchboard Thursday 7am with Dave and Sam', NOW);
    expect(two.crewTokens).toEqual(['Dave', 'Sam']);
    const resolved = resolveQuickBook('Switchboard Thursday 7am with Dave and Sam', {
      jobs: [jobs[1]],
      crew,
    }, NOW);
    expect(resolved.crew.kind).toBe('many');
    expect(resolved.prefill.crewId).toBeUndefined();
    expect(resolved.hints.crew).toContain('A few crew match');
    expect(matchQuickBookCrew(['Dave', 'Sam'], crew).kind).toBe('many');
  });

  it('leaves unmatched crew empty with a pick-one hint and does not clear other fields', () => {
    const resolved = resolveQuickBook('Warehouse lights Thursday 7am with Dave', {
      jobs: [jobs[1]],
      crew: [{ id: 'crew-sam', name: 'Sam Ortiz' }],
      clients: [{ id: 'cli-pwd', name: 'PWD Group' }],
    }, NOW);
    expect(resolved.parse.crewToken).toBe('Dave');
    expect(resolved.crew.kind).toBe('none');
    expect(resolved.prefill.crewId).toBeUndefined();
    expect(resolved.prefill.date).toBe('2026-10-08');
    expect(resolved.hints.crew).toBe(unmatchedHint('crew', 'Dave'));
    expect(resolved.hints.crew).toContain('No crew matches');
  });

  it('prefills only spoken fields and never guesses a job among many', () => {
    const resolved = resolveQuickBook('Smith job Thursday 7am with Dave', {
      jobs,
      crew,
      clients: [
        { id: 'cli-smith', name: 'Smith Plumbing' },
        { id: 'cli-smith-2', name: 'Smith' },
      ],
    }, NOW);
    expect(resolved.jobs.kind).toBe('many');
    expect(spokenSheetFields(resolved)).toEqual({
      date: '2026-10-08',
      startTime: '07:00',
      crewId: 'crew-dave',
    });
    expect(resolved.hints.job).toContain('A few jobs match');
    expect(resolved.hints.crew).toBeNull();
    const noCrew = resolveQuickBook('Warehouse lights Thursday 7am', {
      jobs: [jobs[1]],
      crew,
    }, NOW);
    expect(noCrew.prefill).toEqual({
      date: '2026-10-08',
      startTime: '07:00',
    });
    expect('crewId' in noCrew.prefill).toBe(false);
  });

  it('says unmatched job once with a real next step, not pick-one-below', () => {
    const resolved = resolveQuickBook('Nguyen tomorrow 7am', {
      jobs,
      crew,
      clients: [],
    }, NOW);
    expect(resolved.jobs.kind).toBe('none');
    expect(resolved.hints.job).toBe(unmatchedHint('job', 'Nguyen'));
    expect(resolved.hints.client).toBeNull();
    expect(resolved.hints.job).toContain('Search above or start a New job');
    expect(resolved.hints.job).not.toContain('Pick one below');
  });

  it('resolves ten all-trades Brisbane phrases dated this week', () => {
    const phrases = [
      { text: 'Blocked drain Thursday 7am with Dave', job: 'j-plumb', date: '2026-10-08', time: '07:00', crew: 'crew-dave' },
      { text: 'Switchboard tomorrow 7.30am with Sam', job: 'j-spark', date: '2026-10-07', time: '07:30', crew: 'crew-sam' },
      { text: 'Kitchen fit Friday half past 7 with Dave', job: 'j-chip', date: '2026-10-09', time: '07:30', crew: 'crew-dave' },
      { text: 'Hall paint on the 9th at 7 with Sam', job: 'j-paint', date: '2026-10-09', time: '07:00', crew: 'crew-sam' },
      { text: 'Split system Saturday midday', job: 'j-air', date: '2026-10-10', time: '12:00' },
      { text: "Garden beds Wednesday 7 o'clock with Dave", job: 'j-land', date: '2026-10-07', time: '07:00', crew: 'crew-dave' },
      { text: 'Bathroom tile seven am Thursday', job: 'j-tile', date: '2026-10-08', time: '07:00' },
      { text: 'Roof leak today noon', job: 'j-roof', date: '2026-10-06', time: '12:00' },
      { text: 'Office clean Friday 8am', job: 'j-clean', date: '2026-10-09', time: '08:00' },
      { text: 'Door latch Thursday 7am', job: 'j-handy', date: '2026-10-08', time: '07:00' },
    ];
    for (const row of phrases) {
      const resolved = resolveQuickBook(row.text, { jobs: tradesJobs, crew }, NOW);
      expect(resolved.jobs.kind, row.text).toBe('one');
      expect(resolved.jobs.items[0]?.id, row.text).toBe(row.job);
      expect(resolved.prefill.date, row.text).toBe(row.date);
      expect(resolved.prefill.startTime, row.text).toBe(row.time);
      if (row.crew) expect(resolved.prefill.crewId, row.text).toBe(row.crew);
      else expect(resolved.prefill.crewId, row.text).toBeUndefined();
    }
    const page = src('src/pages/SchedulePage.tsx');
    const voice = src('src/components/crm/ScheduleBookByVoice.tsx');
    const sheet = src('src/components/crm/ScheduleJobSheet.tsx');
    expect(`${page}\n${voice}\n${sheet}`).not.toMatch(/electrician-only|sparky only|BTS-only/i);
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

  it('wires Book by voice under search, keeps blanks, and only saves from the sheet', () => {
    const page = src('src/pages/SchedulePage.tsx');
    const sheet = src('src/components/crm/ScheduleJobSheet.tsx');
    const voice = src('src/components/crm/ScheduleBookByVoice.tsx');
    const chrome = page.slice(
      page.indexOf('<div className="hub-schedule-chrome">'),
      page.indexOf('</div>', page.indexOf('<div className="hub-schedule-chrome">')) + 6,
    );
    expect(chrome).not.toContain('ScheduleBookByVoice');
    expect(page.lastIndexOf('<ScheduleBookByVoice')).toBeGreaterThan(page.indexOf('data-schedule-search="1"'));
    expect(page).toContain('spokenSheetFields');
    expect(page).toContain('scheduleFromSheet.mutate');
    expect(page).not.toMatch(/from\('jobs'\)\.insert/);
    expect(page).not.toContain("startTime: resolved.prefill.startTime ?? ''");
    expect(page).not.toContain('crewId: resolved.prefill.crewId,');
    expect(voice).toContain('Book by voice');
    expect(voice).toContain('Type a booking');
    expect(voice).toContain('Speak a booking');
    expect(voice).toContain("lang = 'en-AU'");
    expect(voice).toContain('Microphone is blocked. Type the booking instead.');
    expect(sheet).toContain('From your booking');
    expect(sheet).toContain("'crewId' in prefill && prefill.crewId");
    expect(sheet).toContain('EditorStickyFooter');
    expect(sheet).toContain('saveLabel="Save"');
    expect(src('src/lib/quickBook.ts')).toContain('No job matches');
    expect(src('src/index.css')).toContain('.hub-week-document .hub-schedule-voice');
    expect(src('src/index.css')).toContain('padding: 8px 16px 12px');
  });
});

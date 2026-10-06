import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  assumedTradeClockLabel,
  assumedTradeTag,
  browserSpeechRecognition,
  checkDateTag,
  instantInBrisbane,
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
    expect(resolved.hints.crew).toContain('Several crew match');
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
      dateSource: 'spoken',
      startTime: '07:00',
      startTimeSource: 'spoken',
      crewId: 'crew-dave',
    });
    expect(resolved.hints.job).toContain('Several jobs match');
    expect(resolved.hints.crew).toBeNull();
    const noCrew = resolveQuickBook('Warehouse lights Thursday 7am', {
      jobs: [jobs[1]],
      crew,
    }, NOW);
    expect(noCrew.prefill).toEqual({
      date: '2026-10-08',
      dateSource: 'spoken',
      startTime: '07:00',
      startTimeSource: 'spoken',
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

  it('matches real company titles without the suffix, plus client and crew prefixes', () => {
    const G = '8fac7109-aafa-4edb-afed-563db6553bfa';
    const row = (
      n: number,
      id: string,
      title: string,
      client: string | null,
      assigned: string[],
    ) => ({ id, job_number: n, title, client_name: client, assigned_team: assigned });
    const realJobs = [
      row(1, 'f41afe9a', '290 data prove A — delete ok', null, []),
      row(2, '1f7dc3b5', '290 data prove B — delete ok', null, []),
      row(3, '88960c3b', '286 prove 2 — delete ok', 'CoS 286 Client — delete ok', [G]),
      row(4, 'd49a3427', '286 prove 3 — delete ok', 'CoS 286 Client — delete ok', [G]),
      row(5, 'e64e0a97', '286 prove 5 — delete ok', 'CoS 286 Client — delete ok', [G]),
      row(6, '25eec76d', '286 prove 4 — delete ok', 'CoS 286 Client — delete ok', [G]),
      row(7, '08e6e714', '291 prove 6 — delete ok', 'CoS 286 Client — delete ok', [G]),
      row(11, 'c09c49d4', '274 client 1280 — delete ok', 'CoS 286 Client — delete ok', []),
      row(12, '5d012de9', '274 client 390 — delete ok', 'CoS 286 Client — delete ok', []),
      row(13, 'de4bad8e', '27', null, []),
      row(14, '30d71e4f', '274 no client — delete ok', null, []),
      row(20, 'fix-tap', 'Fix tap with leak', 'River House', []),
    ];
    const realCrew = [
      { id: G, name: 'Grafter CoS Test' },
      { id: 'ada57004', name: 'CoS Invitee Test' },
      { id: 'crew-jordan', name: 'Jordan Lee' },
    ];
    const realClients = [{ id: 'c286', name: 'CoS 286 Client — delete ok' }];
    const phrases = [
      { text: '291 prove 6 Friday 7am with Invitee', job: 7, date: '2026-10-09', time: '07:00', crew: 'ada57004' },
      { text: '286 prove 2 tomorrow half past 7 with Grafter', job: 3, date: '2026-10-07', time: '07:30', crew: G },
      { text: '286 prove 3 Thursday 7.30am', job: 4, date: '2026-10-08', time: '07:30' },
      { text: '286 prove 4 this Saturday midday with Invitee', job: 6, date: '2026-10-10', time: '12:00', crew: 'ada57004' },
      { text: '286 prove 5 Wednesday 2pm with Grafter', job: 5, date: '2026-10-07', time: '14:00', crew: G },
      { text: '274 client 390 thurday 3pm', job: 12, date: '2026-10-08', time: '15:00' },
      { text: '274 no client today 4pm with Invitee', job: 14, date: '2026-10-06', time: '16:00', crew: 'ada57004' },
      { text: '290 data prove A Sunday seven am', job: 1, date: '2026-10-11', time: '07:00' },
      { text: '290 data prove B on the 9th 8am with Grafter', job: 2, date: '2026-10-09', time: '08:00', crew: G },
      { text: "291 prove 6 Friday 7 o'clock with CoS Invitee", job: 7, date: '2026-10-09', time: '07:00', crew: 'ada57004' },
    ];
    for (const item of phrases) {
      const resolved = resolveQuickBook(item.text, {
        jobs: realJobs,
        crew: realCrew,
        clients: realClients,
      }, NOW);
      expect(resolved.jobs.kind, item.text).toBe('one');
      expect(resolved.jobs.items[0]?.job_number, item.text).toBe(item.job);
      expect(resolved.prefill.date, item.text).toBe(item.date);
      expect(resolved.prefill.startTime, item.text).toBe(item.time);
      if (item.crew) expect(resolved.prefill.crewId, item.text).toBe(item.crew);
      else expect(resolved.prefill.crewId, item.text).toBeUndefined();
    }
    expect(matchQuickBookJobs('291 prove 6', realJobs).kind).toBe('one');
    expect(matchNamed('CoS Invitee', realCrew)).toMatchObject({ kind: 'one', items: [{ id: 'ada57004' }] });
    expect(matchNamed('Dan', realCrew).kind).toBe('none');
    expect(parseQuickBook('290 data prove A Sunday seven am', NOW).subjectToken).toBe('290 data prove A');
  });

  it('does not auto-pick a Jordan Pty client job from Dan', () => {
    const jordanJob = {
      id: 'job-jordan',
      title: 'Switchboard',
      client_name: 'Jordan Pty',
      job_number: 88,
    };
    expect(matchQuickBookJobs('Dan', [jordanJob]).kind).not.toBe('one');
    const resolved = resolveQuickBook('Dan tomorrow 7am', {
      jobs: [jordanJob],
      crew,
    }, NOW);
    expect(resolved.parse.subjectToken).toBe('Dan');
    expect(['none', 'many']).toContain(resolved.jobs.kind);
    expect(resolved.hints.job).toBeTruthy();
    expect(resolved.hints.job).not.toMatch(/Pick one\. Pick one/);
  });

  it('asks to tap a single closest job match and keeps Several for two or more', () => {
    const one = {
      id: 'job-1280',
      title: '274 client 1280 — delete ok',
      client_name: 'CoS 286 Client — delete ok',
      job_number: 12,
    };
    const other = {
      id: 'job-280b',
      title: 'Store 280b — delete ok',
      client_name: null,
      job_number: 21,
    };
    expect(matchQuickBookJobs('280', [one]).kind).toBe('many');
    expect(matchQuickBookJobs('280', [one]).items).toHaveLength(1);
    const closest = resolveQuickBook('280 tomorrow 7am', { jobs: [one], crew }, NOW);
    expect(closest.jobs.kind).not.toBe('one');
    expect(closest.hints.job).toBe('Closest match for “280”. Tap to use it.');
    expect(closest.hints.job).not.toContain('Several');
    const several = resolveQuickBook('280 tomorrow 7am', { jobs: [one, other], crew }, NOW);
    expect(several.jobs.items.length).toBeGreaterThan(1);
    expect(several.hints.job).toBe('Several jobs match “280”.');
  });

  it('resolves next Friday from Tuesday to next week and tags Check date until Date is edited', () => {
    expect(parseQuickBookDate('next Friday', NOW)).toBe('2026-10-16');
    expect(parseQuickBook('next Friday 7am', NOW).date).toBe('2026-10-16');
    expect(parseQuickBook('next Friday 7am', NOW).dateSource).toBe('next');
    expect(parseQuickBookDate('next Sunday', NOW)).toBe('2026-10-18');
    expect(parseQuickBook('next Sunday 7am', NOW).date).toBe('2026-10-18');
    expect(parseQuickBook('next week Thursday', NOW).date).toBe('2026-10-15');
    expect(parseQuickBook('next week Thursday 7am', NOW).dateSource).toBe('next');
    expect(parseQuickBook('Hot water next week Thursday 7am', NOW).subjectToken).toBe('Hot water');
    expect(parseQuickBookDate('this Friday', NOW)).toBe('2026-10-09');
    expect(parseQuickBook('Friday 7am', NOW).date).toBe('2026-10-09');
    expect(parseQuickBook('Friday 7am', NOW).dateSource).toBe('spoken');
    const resolved = resolveQuickBook('Hot water next Friday 7am', {
      jobs: [jobs[0]],
      crew,
    }, NOW);
    expect(resolved.prefill.date).toBe('2026-10-16');
    expect(resolved.prefill.dateSource).toBe('next');
    expect(checkDateTag(true, false)).toBe('Check date');
    expect(checkDateTag(true, true)).toBeNull();
    expect(checkDateTag(false, false)).toBeNull();
  });

  it('parses at 7 pm, tags bare 3 as trade hours, and does not rewrite Munday', () => {
    expect(parseQuickBookTime('at 7 pm')).toBe('19:00');
    expect(parseQuickBookTime('at 7 p.m.')).toBe('19:00');
    expect(parseQuickBook('job at 7 pm', NOW).startTimeSource).toBe('spoken');
    expect(parseQuickBookTime('at 3')).toBe('15:00');
    expect(parseQuickBookTime('half past 3')).toBe('15:30');
    expect(parseQuickBook('job at 3', NOW).startTimeSource).toBe('trade');
    expect(parseQuickBookTime('at 3')).not.toBe('03:00');
    expect(assumedTradeClockLabel('15:00')).toBe('Assumed 3 pm — check');
    expect(assumedTradeClockLabel('07:00')).toBe('Assumed 7 am — check');
    expect(assumedTradeTag(true, '15:00', false)).toBe('Assumed 3 pm — check');
    expect(assumedTradeTag(true, '15:00', true)).toBeNull();
    expect(assumedTradeTag(true, '15:00', true)).not.toBe(assumedTradeClockLabel('09:00'));
    expect(assumedTradeTag(false, '15:00', false)).toBeNull();
    const munday = parseQuickBook('Munday job Thursday 7am', NOW);
    expect(munday.subjectToken).toContain('Munday');
    expect(munday.date).toBe('2026-10-08');
    const leak = resolveQuickBook('Fix tap with leak tomorrow 7am', {
      jobs: [{ id: 'fix-tap', title: 'Fix tap with leak', client_name: 'River House', job_number: 20 }],
      crew,
    }, NOW);
    expect(leak.jobs.kind).toBe('one');
    expect(leak.jobs.items[0]?.id).toBe('fix-tap');
    expect(leak.parse.crewToken).toBeNull();
    expect(leak.prefill.crewId).toBeUndefined();
  });

  it('prefills a new job from ten unmatched all-trades phrases, including new clients and an address', () => {
    const namedClients = [
      { id: 'cli-river', name: 'River House' },
      { id: 'cli-harbour', name: 'Harbour Trade' },
      { id: 'cli-oak', name: 'Oak Street' },
      { id: 'cli-breeze', name: 'Breeze Co' },
      { id: 'cli-tile', name: 'Tile House' },
      { id: 'cli-green', name: 'Green Edge' },
      { id: 'cli-ash', name: 'Ash Grove' },
    ];
    const phrases = [
      { text: 'Blocked drain, River House, Thursday 7am, Dave', title: 'Blocked drain', date: '2026-10-08', time: '07:00', crew: 'crew-dave', client: 'cli-river', create: false },
      { text: 'Switchboard, Harbour Trade, tomorrow 7.30am, Sam', title: 'Switchboard', date: '2026-10-07', time: '07:30', crew: 'crew-sam', client: 'cli-harbour', create: false },
      { text: 'Kitchen fit, Oak Street, Friday half past 7, Dave', title: 'Kitchen fit', date: '2026-10-09', time: '07:30', crew: 'crew-dave', client: 'cli-oak', create: false },
      { text: 'Split system, Breeze Co, Saturday midday', title: 'Split system', date: '2026-10-10', time: '12:00', create: false, client: 'cli-breeze' },
      { text: 'Bathroom tile, Tile House, Thursday 7am, Sam', title: 'Bathroom tile', date: '2026-10-08', time: '07:00', crew: 'crew-sam', client: 'cli-tile', create: false },
      { text: 'Garden beds, Green Edge, Wednesday 7am, Dave', title: 'Garden beds', date: '2026-10-07', time: '07:00', crew: 'crew-dave', client: 'cli-green', create: false },
      { text: 'Hall paint, Ash Grove, on the 9th at 7, Sam', title: 'Hall paint', date: '2026-10-09', time: '07:00', crew: 'crew-sam', client: 'cli-ash', create: false },
      { text: 'Hot water, Smith, Thursday 7am, Dave', title: 'Hot water', date: '2026-10-08', time: '07:00', crew: 'crew-dave', clientToken: 'Smith', create: true },
      { text: 'Roof leak, Nguyen, today noon', title: 'Roof leak', date: '2026-10-06', time: '12:00', clientToken: 'Nguyen', create: true },
      { text: 'Door latch, Patel, Thursday 7am at 12 Smith St with Dave', title: 'Door latch', date: '2026-10-08', time: '07:00', crew: 'crew-dave', clientToken: 'Patel', create: true, address: '12 Smith St' },
    ];
    for (const row of phrases) {
      const resolved = resolveQuickBook(row.text, { jobs: [], crew, clients: namedClients }, NOW);
      expect(resolved.jobs.kind, row.text).toBe('none');
      expect(resolved.newJob, row.text).toBeTruthy();
      expect(resolved.newJob?.title, row.text).toBe(row.title);
      expect(resolved.prefill.date, row.text).toBe(row.date);
      expect(resolved.prefill.startTime, row.text).toBe(row.time);
      if (row.crew) expect(resolved.prefill.crewId, row.text).toBe(row.crew);
      else expect(resolved.prefill.crewId, row.text).toBeUndefined();
      expect(resolved.newJob?.createClient, row.text).toBe(row.create);
      if (row.client) expect(resolved.newJob?.clientId, row.text).toBe(row.client);
      else expect(resolved.newJob?.clientId, row.text).toBeUndefined();
      if (row.clientToken) expect(resolved.newJob?.clientToken, row.text).toBe(row.clientToken);
      if (row.address) expect(resolved.parse.address, row.text).toBe(row.address);
    }
    expect(parseQuickBook('Door latch Thursday 7am at 12 Smith St with Dave', NOW).address).toBe('12 Smith St');
    const matched = resolveQuickBook('Hot water, Smith, Thursday 7am, Dave', {
      jobs,
      crew,
      clients: namedClients,
    }, NOW);
    expect(matched.jobs.kind).toBe('one');
    expect(matched.jobs.items[0]?.id).toBe('job-hot');
    expect(matched.newJob).toBeNull();
    const page = src('src/pages/SchedulePage.tsx');
    const voice = src('src/components/crm/ScheduleBookByVoice.tsx');
    const form = src('src/components/crm/JobFormModal.tsx');
    expect(voice).toContain('New job from this');
    expect(voice).toContain('onNewJob');
    expect(page).toContain('voiceNewJob');
    expect(page).not.toMatch(/applyQuickBook[\s\S]{0,400}from\('jobs'\)\.insert/);
    expect(form).toContain('Create client');
    expect(form).toContain('presetName');
    expect(form).toContain('FromBooking');
    expect(`${page}\n${voice}\n${form}`).not.toMatch(/electrician-only|sparky only|BTS-only/i);
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
    expect(browserSpeechRecognition()).toBeNull();
  });

  it('wires Quick book under search, keeps blanks, and only saves from the sheet', () => {
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
    expect(voice).toContain('Quick book');
    expect(voice).not.toContain('Book by voice');
    expect(voice).toContain('Type a booking');
    expect(voice).toContain('Speak a booking');
    expect(voice).toContain('hub-schedule-voice-row');
    expect(voice).toContain("lang = 'en-AU'");
    expect(voice).toContain('speechRecognitionErrorHint');
    expect(voice).toContain('isActiveSpeechRecognition');
    expect(voice).toContain('hub-schedule-speech-status');
    expect(voice).toContain('speechStatus');
    expect(voice).toContain('Job, day, time, crew');
    expect(voice).not.toContain('Smith job Thursday 7am with Dave');
    expect(voice).not.toContain('hints?.crew');
    expect(sheet).toContain('FromBooking');
    expect(src('src/components/crm/FromBooking.tsx')).toContain('From your booking');
    expect(sheet).toContain("'crewId' in prefill && prefill.crewId");
    expect(sheet).toContain('EditorStickyFooter');
    expect(sheet).toContain('saveLabel="Save"');
    expect(src('src/lib/quickBook.ts')).toContain('No job matches');
    expect(src('src/lib/quickBook.ts')).toContain('Pick one below.');
    expect(src('src/lib/quickBook.ts')).toContain('Several jobs match');
    expect(src('src/lib/quickBook.ts')).toContain('Change crew below if needed.');
    expect(src('src/lib/quickBook.ts')).not.toContain('Pick one above');
    expect(src('src/index.css')).toContain('.hub-week-document .hub-schedule-voice');
    expect(src('src/index.css')).toContain('flex: 0 0 auto');
    expect(src('src/index.css')).toContain('padding: 8px 16px 12px');
    expect(src('src/index.css')).toContain('.hub-schedule-voice-row');
    expect(src('src/index.css')).toContain('flex-wrap: nowrap');
    expect(src('src/index.css')).not.toMatch(/\.hub-schedule-job-sheet-hint \{\s*margin: -4px/);
    expect(src('src/index.css')).not.toMatch(/\.hub-schedule-voice \.form-input \{[\s\S]{0,80}flex: 1 1 100%/);
    expect(sheet).toContain('scheduleDayKey(job.scheduled_date)');
    expect(sheet).toContain('assumedTradeTag');
    expect(sheet).toContain('checkDateTag');
    expect(sheet).toContain('setStartEdited(true)');
    expect(sheet).toContain('setDateEdited(true)');
    expect(sheet).not.toContain('Trade hours');
    expect(page).toContain('dateCheck: spoken.dateSource === \'next\'');
    expect(page).toContain('setVoiceHints(null)');
    expect(page).toContain('setVoiceJobPicks([])');
    expect(page).not.toContain('setJobQuery(parsed.subjectToken)');
    expect(voice).toContain('New job from this');
    expect(voice).toContain('hub-schedule-voice-new');
    expect(src('src/index.css')).toContain('.hub-schedule-voice-new');
    expect(src('src/index.css')).toContain('hub-schedule-voice-new');
    expect(src('src/lib/quickBook.ts')).toContain('Closest match for');
    expect(src('src/index.css')).toMatch(/\.hub-schedule-voice-form \{[\s\S]{0,80}flex-direction: row/);
    expect(src('src/index.css')).toMatch(/flex-direction: column/);
  });
});

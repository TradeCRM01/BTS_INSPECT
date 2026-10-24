import { afterAll, describe, expect, it } from 'vitest';
import {
  CONTRAST, EMPTY_COPY, FADE, FOCUS, FROZEN_NOW_PLUS_1, IN_PROGRESS, JOB_REF, KILLS, NOW, PALETTE, PHONE_BOARD_BREAKPOINT, PHONE_TABS, ROWS, SAME_COLOUR,
  SHEET, TAP_MIN, TODAY, TRACK_PROBE, UNTIMED, WEEK, channelGap, isAmber, isNavy, killTitle, rgbOf,
  type KillId, type Measure, type Offender, type Stroke,
} from './matrix.ts';
import { JOBS, JOB_IDS, MALFORMED_CREW_IDS, PROFILE, SAM, SCHEDULE_FIXTURE } from './fixture.ts';
import {
  MORE_JOBS_THIS_WEEK,
  SCHEDULE_BOARD_COLUMNS,
  SCHEDULE_BOARD_LIMIT,
  jobsColumnsFromMigrations,
  scheduleBoardColumnList,
} from '../../lib/scheduleBoard';
import { STATUS_FALLBACK } from '../../lib/scheduleInvoiceStatus';
import { bundleReport, closeHarness, measure, measureAll, measureMockup1280, openState, token, writeCapture } from './harness.ts';
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

// The only scroller whose children may extend past innerWidth (Coach ruling on finding 7).
// The brief kill title is "a real wheel scrolls the day track sideways": .hub-day-track is the
// signed horizontal scroller (overflow-x:auto, sw>cw, track.right stays on screen). Children past
// innerWidth are skipped only when they live inside that scroller. Labels inside it must still
// fit their card. Any new skip reason needs a Coach ruling.
const SOLE_SCROLLER = '.hub-day-track';
const TOLERANCE_PX = 0.5;
const SKIP_REASONS = new Set(['sole-allowlisted-scroller', 'ellipsis-self', 'clip-inside-allowlisted-scroller']);

const states = (id: KillId) => measureAll(KILLS[id].states);
const exempt = (o: Offender, iw: number) =>
  o.scroller !== null && o.scroller.classes.includes(SOLE_SCROLLER.slice(1)) && o.scroller.right <= iw + TOLERANCE_PX;
const firstFieldItem = (m: Measure) => m.menu?.[0] ?? null;
const same = (a: string, b: string) => channelGap(a.slice(0, 7), b) <= SAME_COLOUR;
const painted = (s: Stroke | null) => !!s && s.w >= 1 && s.a > 0 && s.style !== 'none' && s.style !== 'hidden';
const text = (m: Measure, words: string) => m.texts.find(t => t.text === words);
const UNTIMED_JOBS = JOBS.filter(j => j.scheduled_date && !j.start_time && j.status !== 'cancelled').length;

describe('P2 Schedule on the built dist', () => {
  afterAll(async () => {
    const dir = process.env.P2_CAPTURE_DIR;
    if (dir) await writeCapture(dir);
    await closeHarness();
  });

  it(killTitle('P2-palette'), async () => {
    for (const m of await states('P2-palette')) {
      for (const p of m.palette) {
        expect.soft(p.scannedPx / p.framePx, `${m.id} ${p.shot} scanned share`).toBeGreaterThan(PALETTE.minScannedShare);
        expect.soft(p.navyPx, `${m.id} ${p.shot} navy px`).toBe(0);
        expect.soft(p.creamPx, `${m.id} ${p.shot} cream px`).toBe(0);
      }
    }
  });

  it(killTitle('P2-contrast'), async () => {
    const all = await states('P2-contrast');
    expect.soft(all.some(m => m.texts.some(t => t.role === 'chip')), 'some state paints chip text').toBe(true);
    for (const m of all) {
      for (const t of m.texts) {
        expect.soft(t.ratio, `${m.id} ${t.role} "${t.text}" ${t.fg} on ${t.bg} (${t.cls})`).toBeGreaterThanOrEqual(CONTRAST[t.role]);
      }
    }
  });

  it(killTitle('P2-taps'), async () => {
    const day = await measure('day-1280');
    expect.soft(day.taps.some(t => t.cls.includes('hub-day-resize') || t.label.startsWith('Drag to change')), 'day-1280 renders resize handles').toBe(true);
    for (const m of await states('P2-taps')) {
      for (const t of m.taps) {
        expect.soft(t.w, `${m.id} "${t.label}" ${t.cls} hit width`).toBeGreaterThanOrEqual(TAP_MIN);
        expect.soft(t.h, `${m.id} "${t.label}" ${t.cls} hit height`).toBeGreaterThanOrEqual(TAP_MIN);
      }
    }
  });

  it(killTitle('P2-lines'), async () => {
    for (const m of await states('P2-lines')) {
      expect.soft(m.rows.length, `${m.id} agenda rows`).toBeGreaterThan(0);
      if (m.id === 'lineprobe-375') continue;
      m.rows.forEach((row, i) => {
        expect.soft(row.meta.lines.length, `${m.id} row ${i} meta lines`).toBeLessThanOrEqual(ROWS.maxMetaLines);
        expect.soft(row.meta.lines.join(' '), `${m.id} row ${i} meta keeps a dot`).toMatch(/·/);
        for (const line of row.meta.lines.slice(0, -1)) {
          expect.soft(line, `${m.id} row ${i} meta breaks only after a dot`).toMatch(/·$/);
        }
      });
    }
  });

  it(killTitle('P2-m2'), async () => {
    for (const m of await states('P2-m2')) {
      expect.soft(m.rows.length, `${m.id} agenda rows`).toBeGreaterThan(0);
      m.rows.forEach((row, i) => {
        const at = `${m.id} row ${i}`;
        if (m.iw < ROWS.stackBelow) {
          expect.soft(Math.abs(row.time.left - row.title.left), `${at} time.left vs title.left`).toBeLessThanOrEqual(ROWS.alignPx);
          expect.soft(row.title.top, `${at} title below time`).toBeGreaterThan(row.time.top);
          expect.soft(row.meta.top, `${at} meta below title`).toBeGreaterThan(row.title.top);
          if (row.pill) {
            expect.soft(row.pill.top, `${at} pill below meta`).toBeGreaterThan(row.meta.top);
            expect.soft(row.pill.width, `${at} pill not stretched`).toBeLessThan(row.columnWidth - 1);
          }
        } else {
          expect.soft(row.title.left, `${at} title in its own column`).toBeGreaterThan(row.time.left + ROWS.alignPx);
          expect.soft(Math.abs(row.time.left - m.rows[0].time.left), `${at} time column vs row 0`).toBeLessThanOrEqual(ROWS.alignPx);
          expect.soft(Math.abs(row.title.left - m.rows[0].title.left), `${at} title column vs row 0`).toBeLessThanOrEqual(ROWS.alignPx);
        }
      });
      const untimed = m.rows.filter(r => UNTIMED.test(r.time.lines.join(' ').replace(/\s+/g, ' ')));
      expect.soft(untimed.length, `${m.id} untimed rows carry the Add a time line`).toBe(UNTIMED_JOBS);
      untimed.forEach(row => {
        const at = `${m.id} untimed "${row.title.lines[0] ?? ''}"`;
        const line = row.time.lines.join(' ').replace(/\s+/g, ' ');
        expect.soft(row.timeInk, `${at} Add a time ink`).toBe(token('g-ink-muted'));
        expect.soft(line, `${at} keeps Add a time`).toMatch(/Add a time/);
        if (/Quoted crewless/.test(row.title.lines.join(' '))) {
          expect.soft(line, `${at} unknown/need-crew omits Booked`).not.toMatch(/^Booked /);
        } else if (m.iw < ROWS.stackBelow) {
          expect.soft(row.time.lines[0], `${at} Booked line is the first line`).toMatch(/^Booked /);
          expect.soft(Math.abs(row.time.width - row.title.width), `${at} Booked line spans the title width, no column of its own`).toBeLessThanOrEqual(ROWS.alignPx);
        }
      });
    }
  });

  it(killTitle('P2-dark'), async () => {
    for (const m of await states('P2-dark')) {
      expect.soft(m.darkChangedPx, `${m.id} forced dark changed px`).toBe(0);
    }
  });

  const textPastInner = (m: Measure) => (m.chrome.textPast ?? []).filter(hit => hit.right > m.iw);

  it(killTitle('P2-overflow'), async () => {
    for (const m of await states('P2-overflow')) {
      expect.soft(m.docSW, `${m.id} documentElement.scrollWidth`).toBeLessThanOrEqual(m.iw);
      expect.soft(m.bodySW, `${m.id} body.scrollWidth`).toBeLessThanOrEqual(m.iw);
      const outside = m.offenders.filter(o => !exempt(o, m.iw));
      const outsideRight = outside.reduce((max, o) => Math.max(max, o.right), 0);
      expect.soft(outside, `${m.id} elements past innerWidth outside ${SOLE_SCROLLER}`).toEqual([]);
      expect.soft(outsideRight, `${m.id} max unexempted rect.right`).toBeLessThanOrEqual(m.iw + TOLERANCE_PX);
      for (const b of m.buttons) {
        expect.soft(b.sw, `${m.id} button "${b.label}" scrollWidth`).toBeLessThanOrEqual(b.cw);
      }
      const clipOutside = m.clips.filter(c => c.right > m.iw + TOLERANCE_PX && !c.clip.includes(SOLE_SCROLLER.slice(1)));
      expect.soft(clipOutside, `${m.id} clipped past innerWidth by a non-allowlisted ancestor`).toEqual([]);
      for (const skip of m.overflowSkips) {
        expect.soft(SKIP_REASONS.has(skip.reason), `${m.id} skip ${skip.el} @${skip.right} reason ${skip.reason}`).toBe(true);
      }
      if (m.dayTrack) {
        expect.soft(['auto', 'scroll'].includes(m.dayTrack.overflowX), `${m.id} ${SOLE_SCROLLER} overflow-x is a scroller`).toBe(true);
        expect.soft(m.dayTrack.left, `${m.id} ${SOLE_SCROLLER} left stays in the viewport`).toBeGreaterThanOrEqual(-TOLERANCE_PX);
        expect.soft(m.dayTrack.right, `${m.id} ${SOLE_SCROLLER} stays on screen`).toBeLessThanOrEqual(m.iw + TOLERANCE_PX);
        expect.soft(m.dayTrack.top, `${m.id} ${SOLE_SCROLLER} top stays in the viewport`).toBeGreaterThanOrEqual(-TOLERANCE_PX);
        if (m.iw < PHONE_BOARD_BREAKPOINT && m.id.startsWith('day-')) {
          expect.soft(m.dayTrack.sw, `${m.id} ${SOLE_SCROLLER} scrollWidth`).toBeGreaterThan(m.dayTrack.cw);
        }
      }
      const chromeRight = [
        ['page', m.chrome.pageRight],
        ['header', m.chrome.headerRight],
        ['toolbar', m.chrome.toolbarBoxRight],
        ['tray', m.chrome.trayRight],
      ] as const;
      for (const [name, right] of chromeRight) {
        if (right < 0) continue;
        expect.soft(right, `${m.id} ${name} rect.right stays ≤ innerWidth`).toBeLessThanOrEqual(m.iw + TOLERANCE_PX);
      }
      const cardTexts = m.trackLabels.filter(lab => lab.card.includes('chip') || lab.card.includes('agenda-row') || lab.card.includes('schedule-job') || lab.card.includes('untimed') || lab.card.includes('rail-job'));
      if (/^(week|day|tray|rail)-/.test(m.id)) {
        expect.soft(cardTexts.length, `${m.id} card text descendants measured`).toBeGreaterThan(0);
      }
      for (const lab of m.trackLabels) {
        expect.soft(lab.fitsCard, `${m.id} track label "${lab.text}" past card ${lab.card}`).toBe(true);
        expect.soft(lab.fitsClip, `${m.id} track label "${lab.text}" clipped by ${lab.clipEl || 'viewport'}`).toBe(true);
      }
      const dayClocks = m.clocks.filter(clock => clock.board === 'day' && clock.cls.includes('hub-week-chip-clock'));
      if (m.id.startsWith('day-')) {
        expect.soft(dayClocks.length, `${m.id} day-board clocks measured`).toBeGreaterThan(0);
        for (const c of dayClocks) {
          expect.soft(c.ownFits, `${m.id} day-board clock "${c.text}" scrollWidth <= clientWidth`).toBe(true);
          expect.soft(c.fitsRect, `${m.id} day-board clock "${c.text}" rect inside ${c.clipEl || 'viewport'}`).toBe(true);
        }
      }
      for (const c of m.clocks.filter(clock => clock.cls.includes('hub-week-chip-clock'))) {
        expect.soft(c.ownFits, `${m.id} clock "${c.text}" scrollWidth fits its own box`).toBe(true);
        expect.soft(c.fits, `${m.id} clock "${c.text}" clipped by ${c.clipEl || 'viewport'} ${c.textRight}>${c.clipRight}`).toBe(true);
      }
      if (/^(week|day|tray)-/.test(m.id) && !m.sheet) {
        const longest = m.trackLabels.filter(lab => /Add a time/.test(lab.text) || /Booked /.test(lab.text));
        if (m.id.startsWith('week-') || m.id.startsWith('day-')) {
          expect.soft(longest.length, `${m.id} longest status-plus-date string measured`).toBeGreaterThan(0);
        }
      }
    }
  });

  it(killTitle('P2-text'), async () => {
    for (const m of await states('P2-text')) {
      expect.soft(textPastInner(m), `${m.id} text rect past innerWidth`).toEqual([]);
      expect.soft(m.chrome.rangeShort, `${m.id} week range short`).toBe('19 Oct \u2013 25 Oct');
      expect.soft(m.chrome.rangeShortPast, `${m.id} range-short text node rect past innerWidth`).toEqual([]);
    }
  });

  it(killTitle('P2-webkit'), async () => {
    let version = '';
    let launched = 0;
    const wanted = KILLS['P2-webkit'].states;
    expect(wanted.length, 'WebKit states planned').toBeGreaterThanOrEqual(6);
    for (const id of wanted) {
      const opened = await openState(id, 'branch', undefined, { engine: 'webkit' });
      launched += 1;
      try {
        version = opened.page.context().browser()?.version() ?? version;
        await opened.page.evaluate(() => window.__p2.settleForWalk());
        const m = await opened.page.evaluate(() => window.__p2.measureDom());
        expect.soft(m.docSW, `webkit ${id} documentElement.scrollWidth`).toBeLessThanOrEqual(m.iw);
        expect.soft(m.bodySW, `webkit ${id} body.scrollWidth`).toBeLessThanOrEqual(m.iw);
        const outside = m.offenders.filter(o => !exempt(o, m.iw));
        const outsideRight = outside.reduce((max, o) => Math.max(max, o.right), 0);
        expect.soft(outside, `webkit ${id} elements past innerWidth outside ${SOLE_SCROLLER}`).toEqual([]);
        expect.soft(outsideRight, `webkit ${id} max unexempted rect.right`).toBeLessThanOrEqual(m.iw + TOLERANCE_PX);
        expect.soft((m.chrome.textPast ?? []).filter(hit => hit.right > m.iw), `webkit ${id} text rect past innerWidth`).toEqual([]);
        expect.soft(m.chrome.rangeShort, `webkit ${id} week range short`).toBe('19 Oct \u2013 25 Oct');
        expect.soft(m.chrome.rangeShortPast, `webkit ${id} range-short text node rect past innerWidth`).toEqual([]);
      } finally {
        await opened.close();
      }
    }
    expect(launched, 'WebKit states run, never skipped').toBe(wanted.length);
    expect(launched, 'WebKit ran at least one state').toBeGreaterThan(0);
    console.log(`P2-webkit version=${version || 'launch-failed'} tests=${launched} skipped=0`);
  });

  it(killTitle('P2-day-track'), async () => {
    for (const m of await states('P2-day-track')) {
      const t = m.track;
      expect.soft(t, `${m.id} renders the day track`).not.toBeNull();
      if (!t) continue;
      expect.soft(t.classes, `${m.id} wheel target is ${SOLE_SCROLLER}`).toContain(SOLE_SCROLLER.slice(1));
      expect.soft(['auto', 'scroll'].includes(t.overflowX), `${m.id} ${SOLE_SCROLLER} overflow-x`).toBe(true);
      expect.soft(t.sw, `${m.id} track scrollWidth over clientWidth`).toBeGreaterThan(t.cw);
      expect.soft(t.right, `${m.id} track right edge`).toBeLessThanOrEqual(m.iw + TOLERANCE_PX);
      expect.soft(t.wheelX.trackLeft, `${m.id} horizontal wheel scrolls the track`).toBeGreaterThan(0);
      expect.soft(t.wheelY.deltaY, `${m.id} page can scroll at ${TRACK_PROBE.viewportH}px tall`).not.toBe(0);
      expect.soft(t.wheelY.pageMoved, `${m.id} vertical wheel over the track scrolls the page`).toBeGreaterThan(0);
      expect.soft(t.wheelY.trackTop, `${m.id} track keeps scrollTop 0`).toBe(0);
    }
  });

  it(killTitle('P2-nav-phone'), async () => {
    for (const m of await states('P2-nav-phone')) {
      expect.soft(m.tabs, `${m.id} phone tabs`).toEqual([...PHONE_TABS]);
      expect.soft(m.path, `${m.id} path after one tap from /`).toBe('/schedule');
    }
  });

  it('P2-nav-desktop-read: the Field menu opens and its items are read at 768 and 1280', async () => {
    for (const m of await states('P2-nav-desktop')) {
      expect.soft(m.menu?.length ?? 0, `${m.id} Field menu items`).toBeGreaterThan(0);
    }
  });

  it(killTitle('P2-nav-desktop'), async () => {
    for (const m of await states('P2-nav-desktop')) {
      expect.soft(firstFieldItem(m), `${m.id} first Field item`).toBe('Schedule');
    }
  });

  it(killTitle('P2-mocks'), async () => {
    expect.soft((await bundleReport()).supabaseInputs, 'bundle inputs from @supabase').toEqual([]);
    for (const m of await states('P2-mocks')) {
      expect.soft(m.blocked, `${m.id} blocked requests`).toEqual([]);
      expect.soft(m.websockets, `${m.id} websockets`).toEqual([]);
      expect.soft(m.unmocked, `${m.id} unmocked supabase calls`).toEqual([]);
      expect.soft(m.pageErrors, `${m.id} page errors`).toEqual([]);
      const writes = m.writes.map(w => `${w.table}.${w.op}`);
      if (m.id === 'save-390') expect.soft(writes, 'save-390 Save reaches the ledger').toContain('jobs.update');
      else expect.soft(writes, `${m.id} writes`).toEqual([]);
    }
  });

  it(killTitle('P2-tracker'), async () => {
    for (const m of await states('P2-tracker')) {
      const t = m.tracker;
      expect.soft(m.texts.filter(x => EMPTY_COPY.test(x.text)).map(x => x.text), `${m.id} empty-state copy`).toEqual([]);
      if (m.id.startsWith('week')) {
        expect.soft(t.days.map(d => d.date), `${m.id} every week day drawn`).toEqual([...WEEK]);
        if (m.iw < PHONE_BOARD_BREAKPOINT) {
          for (const d of t.days) expect.soft(d.h, `${m.id} ${d.date} agenda day height`).toBeGreaterThanOrEqual(TAP_MIN);
        } else {
          expect.soft(t.crews, `${m.id} crew rows`).toBeGreaterThan(0);
          expect.soft(t.cells, `${m.id} cells drawn for every crew and day`).toBe(t.crews * WEEK.length);
        }
      } else {
        expect.soft(t.hours?.head ?? 0, `${m.id} hour columns in the head`).toBeGreaterThan(0);
        expect.soft(t.hours?.lanes.length ?? 0, `${m.id} crew lanes`).toBeGreaterThan(0);
        (t.hours?.lanes ?? []).forEach((n, i) => expect.soft(n, `${m.id} lane ${i} hour rules drawn`).toBe(t.hours?.head));
      }
    }
  });

  it(killTitle('P2-chip'), async () => {
    const all = await states('P2-chip');
    expect.soft(all.some(m => m.chips.some(c => c.board === 'week')), 'some state paints week chips').toBe(true);
    expect.soft(all.some(m => m.chips.some(c => c.desc?.truncated)), 'some chip description is long enough to truncate').toBe(true);
    for (const m of all) {
      const measured = m.texts.filter(t => t.role === 'chip');
      expect.soft(measured.length, `${m.id} chip texts measured for contrast vs chip text nodes`).toBe(m.chips.reduce((n, c) => n + c.textNodes, 0));
      for (const t of measured) expect.soft(t.ratio, `${m.id} chip "${t.text}" ${t.fg} on ${t.bg}`).toBeGreaterThanOrEqual(CONTRAST.chip);
      m.chips.forEach((c, i) => {
        const at = `${m.id} ${c.board} chip ${i}`;
        expect.soft((c.ref.split(' · ').pop() ?? ''), `${at} ref is a whole job ref`).toMatch(JOB_REF);
        expect.soft(c.refLines, `${at} ref lines`).toBe(1);
        expect.soft(c.refEllipsis, `${at} ref ellipsis`).toBe(false);
        expect.soft(c.refFits, `${at} ref run painted inside the chip with no clipping`).toBe(true);
        if (c.desc) {
          expect.soft(c.desc.ellipsis, `${at} description owns the ellipsis`).toBe(true);
          expect.soft(c.desc.inside, `${at} description inside the chip`).toBe(true);
        }
      });
    }
  });

  it(killTitle('P2-focus'), async () => {
    const inverse = token('g-inverse');
    for (const m of await states('P2-focus')) {
      expect.soft(m.focus.map(f => f.label), `${m.id} track buttons in tab order`).toEqual([...FOCUS.labels]);
      for (const f of m.focus) {
        const at = `${m.id} "${f.label}"`;
        expect.soft(f.reached, `${at} reached by Tab`).toBe(true);
        expect.soft(f.sides.length, `${at} ring sides measured`).toBeGreaterThanOrEqual(FOCUS.minSides);
        for (const s of f.sides) {
          expect.soft(s.width, `${at} ${s.side} ring width px`).toBeCloseTo(FOCUS.ringPx, 0);
          if (s.width >= 1) expect.soft(s.offset, `${at} ${s.side} ring offset px`).toBeCloseTo(FOCUS.offsetPx, 0);
        }
        expect.soft(same(f.fill, inverse), `${at} inverse fill only when on`).toBe(f.label === FOCUS.on);
        expect.soft(Math.min(f.hit.w, f.hit.h), `${at} hit area`).toBeGreaterThanOrEqual(TAP_MIN);
      }
    }
  });

  it(killTitle('P2-now'), async () => {
    const accent = token('g-accent');
    for (const m of await states('P2-now')) {
      const n = m.now;
      expect.soft(n, `${m.id} now probe`).not.toBeNull();
      if (!n) continue;
      expect.soft(n.animations, `${m.id} animations on the Today marker and now-line, reduced and full motion`).toEqual({ reduce: 0, motion: 0 });
      if (m.id.startsWith('day')) {
        expect.soft(n.lines.length, `${m.id} now-lines measured`).toBeGreaterThan(0);
        for (const w of n.lines) expect.soft(w, `${m.id} now-line painted width px`).toBeCloseTo(NOW.linePx, 0);
        expect.soft(n.dots.length, `${m.id} now dots`).toBeGreaterThan(0);
        for (const d of n.dots) expect.soft(same(d, accent), `${m.id} now dot is accent`).toBe(true);
      } else if (m.iw < PHONE_BOARD_BREAKPOINT) {
        expect.soft(n.agenda.map(a => a.date), `${m.id} agenda Today marker`).toEqual([TODAY]);
        for (const a of n.agenda) expect.soft(same(a.ink, accent), `${m.id} Today marker ink is accent`).toBe(true);
      } else {
        expect.soft(m.layout.now, `${m.id} Today Now label`).toBe('Now 13:40');
        expect.soft(m.layout.weekDays.includes(TODAY), `${m.id} today column drawn`).toBe(true);
      }
    }
  });

  it(killTitle('P2-day-board'), async () => {
    const papers = [token('g-bg'), token('g-surface')].sort();
    for (const m of await states('P2-day-board')) {
      const d = m.dayBoard;
      expect.soft(d, `${m.id} day board`).not.toBeNull();
      if (!d) continue;
      expect.soft(d.hourLines, `${m.id} hour rule colours`).toEqual([token('g-line')]);
      expect.soft([...new Set(d.lanes.map(l => l.bg))].sort(), `${m.id} zebra lane papers`).toEqual(papers);
      d.lanes.forEach((l, i) => expect.soft(l.lockBg, `${m.id} lane ${i} crew cell matches its lane`).toBe(l.bg));
      for (const [part, s] of [['rail', d.rail], ['outline', d.outline]] as const) {
        expect.soft(painted(s), `${m.id} unassigned ${part} painted`).toBe(true);
        if (s) expect.soft(isNavy(...rgbOf(s.color)), `${m.id} unassigned ${part} is navy`).toBe(false);
      }
    }
    const h = (await measure('day-1280')).hovers.find(x => x.target.includes('hub-day-resize'));
    expect.soft(h?.before.bgA, 'day-1280 resize handle alpha at rest').toBe(0);
    expect.soft(h?.after.bgA ?? 0, 'day-1280 resize handle alpha under hover').toBeGreaterThan(0);
    expect.soft(h?.after.bg, 'day-1280 resize handle hover colour').toBe(token('g-accent'));
  });

  it(killTitle('P2-scroller'), async () => {
    for (const m of await states('P2-scroller')) {
      const cut = m.track?.cutHourPx;
      expect.soft(cut?.shown ?? 0, `${m.id} cut edge shows part of the next hour column`).toBeGreaterThanOrEqual(TRACK_PROBE.minCutPx);
      expect.soft(cut?.hidden ?? 0, `${m.id} cut edge hides part of that hour column`).toBeGreaterThanOrEqual(TRACK_PROBE.minCutPx);
      const f = m.fade;
      expect.soft(f?.found, `${m.id} edge fade found`).toBe(true);
      if (!f?.found) continue;
      const cols = f.alphas.filter(a => a > FADE.minAlpha).length;
      expect.soft(Math.abs(cols - FADE.widthPx), `${m.id} fade width vs ${FADE.widthPx}px`).toBeLessThanOrEqual(FADE.tolPx);
      expect.soft(f.alphas[cols - 1] ?? 1, `${m.id} fade starts transparent`).toBeLessThanOrEqual(FADE.startMax);
      expect.soft(Math.round((1 - f.alphas[0]) * 255), `${m.id} fade edge gap to surface`).toBeLessThanOrEqual(FADE.edgeGap);
      expect.soft(f.hitThrough, `${m.id} a tap under the fade reaches the track`).toBe(true);
      expect.soft(Math.max(...f.endAlphas), `${m.id} fade alpha at the track end`).toBeLessThanOrEqual(FADE.endMax);
    }
  });

  it(killTitle('P2-sheet'), async () => {
    const [surface, ink, inverse, inverseInk, line] = ['g-surface', 'g-ink', 'g-inverse', 'g-inverse-ink', 'g-line'].map(token);
    expect.soft((await measure('sheet-390')).sheet, 'sheet-390 opens the quick book sheet').not.toBeNull();
    for (const m of await states('P2-sheet')) {
      const s = m.sheet;
      if (!s) {
        const prefill = text(m, 'Prefill');
        expect.soft(prefill && [prefill.fg, prefill.bg], `${m.id} Prefill ink on paper`).toEqual([inverseInk, inverse]);
        continue;
      }
      const save = text(m, 'Save');
      const cancel = text(m, 'Cancel');
      expect.soft(s.scrim, `${m.id} scrim`).toEqual(SHEET.scrim);
      expect.soft(s.scrimCovers, `${m.id} scrim covers the viewport`).toBe(true);
      expect.soft(s.bg, `${m.id} sheet paper`).toBe(surface);
      expect.soft(s.hairline, `${m.id} sheet top hairline`).toEqual({ color: line, a: 1, style: 'solid', w: 1 });
      expect.soft(s.shadows, `${m.id} sheet shadow layers`).toBe(1);
      expect.soft(save && [save.fg, save.bg], `${m.id} Save ink on paper`).toEqual([inverseInk, inverse]);
      expect.soft(cancel && [cancel.fg, cancel.bg], `${m.id} Cancel ink on paper`).toEqual([ink, surface]);
      expect.soft(s.cancel && [s.cancel.color, s.cancel.style], `${m.id} Cancel border`).toEqual([line, 'solid']);
      expect.soft(s.cancel?.w ?? 0, `${m.id} Cancel border width`).toBeGreaterThanOrEqual(1);
      const gap = m.safeArea ?? { plain: -1, inset: -1 };
      expect.soft(gap.plain, `${m.id} Save gap to the screen bottom`).toBeGreaterThanOrEqual(SHEET.minGapPx);
      expect.soft(gap.inset, `${m.id} Save gap with a ${SHEET.safeAreaPx}px safe area`).toBeGreaterThanOrEqual(SHEET.safeAreaPx);
      expect.soft(gap.inset, `${m.id} footer grows with the safe area`).toBeGreaterThan(gap.plain);
    }
  });

  it(killTitle('P2-tray'), async () => {
    for (const m of await states('P2-tray')) {
      const t = m.tray;
      expect.soft(t?.before, `${m.id} tray before any tap`).toMatchObject({ expanded: false, listShown: false });
      expect.soft(t?.after, `${m.id} tray after one tap`).toMatchObject({ expanded: true, listShown: true, cards: Number(/\d+/.exec(t?.before.label ?? '')?.[0] ?? -1) });
      const chip = m.taps.find(x => x.cls.includes('hub-phone-unscheduled-chip'));
      expect.soft(chip ? Math.min(chip.w, chip.h) : 0, `${m.id} tray chip hit`).toBeGreaterThanOrEqual(TAP_MIN);
      expect.soft(m.taps.filter(x => x.cls.includes('hub-schedule-set-date')).length, `${m.id} Set a date stays off the tray card`).toBe(0);
    }
  });

  it(killTitle('P2-status'), async () => {
    expect.soft([token('g-warn'), token('g-warn-bg')].map(isAmber), 'the amber test sees the warn tokens').toEqual([true, true]);
    for (const m of await states('P2-status')) {
      for (const t of m.texts) {
        if (t.role === 'chip' || ![t.fg, t.bg].some(isAmber)) continue;
        expect.soft(t.role === 'pill' && t.text === IN_PROGRESS, `${m.id} amber "${t.text}" (${t.cls}) is an In Progress pill`).toBe(true);
      }
      const pills = m.texts.filter(t => t.cls.includes(ROWS.pill.slice(1)));
      if (m.rows.length && !m.sheet) expect.soft(pills.length, `${m.id} agenda status pills`).toBeGreaterThan(0);
      for (const p of pills) {
        expect.soft(p.ratio, `${m.id} pill "${p.text}" contrast`).toBeGreaterThanOrEqual(CONTRAST.pill);
      }
    }
  });

  it(killTitle('K1'), async () => {
    const week = await measure('week-1280');
    const day = await measure('day-1280');
    expect.soft(week.layout.h1, 'week h1').toEqual(['Schedule']);
    expect.soft(day.layout.h1, 'day h1').toEqual(['Schedule']);
    expect.soft(week.layout.eyebrow, 'week eyebrow').toBe('Week of 19 October');
    expect.soft(day.layout.eyebrow, 'day eyebrow').toBe('Monday 19 October');
    expect.soft(week.layout.whisper, 'S3 whisper').toBe(SCHEDULE_FIXTURE.whisper);
    expect.soft(week.layout.newJob, 'one New job').toBe(1);
    const before = week.writes.length;
    const opened = await openState('week-1280');
    await opened.page.getByRole('button', { name: 'New job' }).first().click();
    await opened.page.waitForSelector('[data-schedule-section="quickbook"][data-open="1"]');
    expect.soft(await opened.page.locator('[data-schedule-quickbook-existing]').count(), 'Quick book keeps schedule existing').toBeGreaterThan(0);
    expect.soft(await opened.page.locator('[data-schedule-quickbook-new]').count(), 'Quick book keeps New job').toBeGreaterThan(0);
    expect.soft(await opened.page.locator('.hub-schedule-voice-mic').count(), 'Quick book keeps the mic').toBeGreaterThan(0);
    await opened.page.locator('[data-schedule-quickbook-new]').click();
    await opened.page.waitForSelector('.hub-ops-form-sheet');
    expect.soft(await opened.page.locator('.hub-ops-form-sheet').count(), 'New job choice opens a modal').toBeGreaterThan(0);
    await opened.close();
    expect.soft(before, 'New job is a local modal, not a write').toBe(0);
  });

  it(killTitle('K2'), async () => {
    const search = await measure('search-1280');
    expect.soft(search.reads.filter(r => r.table === 'jobs').length, 'search records a jobs read').toBeGreaterThan(0);
    const o = await openState('week-1280');
    const before = await o.page.locator('.hub-week-range-full').innerText();
    await o.page.getByRole('button', { name: 'Next week' }).click();
    await o.page.waitForFunction(prev => {
      const el = document.querySelector('.hub-week-range-full');
      return !!el && (el.textContent ?? '').trim() !== prev;
    }, before);
    const after = await o.page.locator('.hub-week-range-full').innerText();
    expect.soft(after.includes('26 to 1 Nov'), 'next week moves the range by 7 days').toBe(true);
    await o.page.locator('main').getByRole('button', { name: 'Today' }).click();
    await o.page.waitForFunction(() => (document.querySelector('[data-schedule-eyebrow]')?.textContent ?? '').includes('19 October'));
    await o.page.locator('.hub-week-seg-btn', { hasText: 'Day' }).click();
    await o.page.waitForFunction(() => document.querySelectorAll('[data-day-board]').length > 0);
    expect.soft(await o.page.locator('[data-day-board]').count(), 'Day seg swaps the board').toBeGreaterThan(0);
    await o.close();
  });

  it(killTitle('K3'), async () => {
    for (const m of await states('K3')) {
      expect.soft(m.layout.weekDays, `${m.id} Mon-Sun`).toEqual([...WEEK]);
      expect.soft(m.layout.lanes.length, `${m.id} crew lanes plus Unassigned`).toBe(5);
      expect.soft(m.layout.cells, `${m.id} every lane × day`).toBe(m.layout.lanes.length * 7);
      expect.soft(m.taps.filter(t => t.cls.includes('hub-week-cell') && t.w > 0 && t.h >= 32).length, `${m.id} cells have size`).toBeGreaterThan(0);
    }
  });

  it(killTitle('K4'), async () => {
    const m = await measure('week-1280');
    expect.soft(m.layout.lanes.map(l => l.name), 'RPC order then Unassigned').toEqual([
      'Dean Walsh', 'Maya Chen', 'Chris Ng', 'Sam Patel', 'Unassigned',
    ]);
    const dean = m.layout.lanes.find(l => l.name === 'Dean Walsh');
    const unassigned = m.layout.lanes[m.layout.lanes.length - 1];
    expect.soft(dean?.count.includes('job'), 'Dean count says jobs').toBe(true);
    expect.soft(unassigned, 'Unassigned last').toMatchObject({ name: 'Unassigned', count: '4 need crew' });
    expect.soft(m.layout.whisper, 'whisper keeps cancelled out of need crew').toBe(SCHEDULE_FIXTURE.whisper);
    const two = m.layout.cards.find(c => c.ref === SCHEDULE_FIXTURE.twoCrewRef);
    expect.soft(two?.lanes.length, '#0036 counts in both lanes').toBe(2);
  });

  it(killTitle('K5'), async () => {
    const m = await measure('week-1280');
    const two = m.layout.cards.find(c => c.ref === SCHEDULE_FIXTURE.twoCrewRef);
    const long = m.layout.cards.find(c => c.ref === SCHEDULE_FIXTURE.longRef);
    expect.soft(two?.line1, '#0036 line 1').toBe(`${SCHEDULE_FIXTURE.clock} · ${SCHEDULE_FIXTURE.twoCrewRef}`);
    expect.soft(two?.lanes.length, '#0036 in two lanes').toBe(2);
    expect.soft(long?.ref, '#0141.A stays whole').toBe(SCHEDULE_FIXTURE.longRef);
    const chip = m.chips.find(c => c.ref.includes('0141'));
    expect.soft(chip?.refEllipsis, '#0141.A ref is not ellipsised').toBe(false);
    expect.soft(chip?.refFits, '#0141.A ref fits').toBe(true);
  });

  it(killTitle('K6'), async () => {
    const m = await measure('week-1280');
    const byId = new Map(m.layout.cards.map(c => [c.id, c]));
    expect.soft(byId.get(JOB_IDS.ready)?.pill, 'void-only completed').toBe('Ready to invoice');
    expect.soft(byId.get(JOB_IDS.done)?.pill, 'draft invoice').toBe('Done');
    expect.soft(byId.get(JOB_IDS.child)?.pill, 'child rolls up').toBe('Done');
    expect.soft(byId.get(JOB_IDS.progress)?.pill, 'in progress').toBe('In progress');
    const invoices = m.reads.filter(r => r.table === 'invoices');
    expect.soft(invoices.length, 'Q-S1 call count').toBe(1);
    expect.soft(invoices[0]?.columns, 'Q-S1 columns').toBe('id, job_id, status');
    expect.soft(invoices[0]?.filters.some(f => f.startsWith('company_id=')), 'company_id').toBe(true);
    expect.soft(invoices[0]?.filters.some(f => f.includes('status!=void') || f.includes('status !=')), 'neq void').toBe(true);
  });

  it(killTitle('K7'), async () => {
    const m = await measure('week-1280');
    const two = m.layout.cards.find(c => c.ref === SCHEDULE_FIXTURE.twoCrewRef);
    const untimed = m.layout.cards.find(c => c.id === JOB_IDS.untimed);
    expect.soft(two?.trackStored, '#0036 has a span').toBe(true);
    expect.soft(two?.trackLeft ?? -1, 'span left 07:00 of 06-20').toBeCloseTo((60) / (15 * 60), 2);
    expect.soft(two?.trackWidth ?? -1, 'span width 3.5h').toBeCloseTo((3.5 * 60) / (15 * 60), 2);
    expect.soft(untimed?.trackStored, 'untimed track drawn with no span').toBe(false);
    const unassigned = m.layout.lanes[m.layout.lanes.length - 1];
    expect.soft(unassigned?.id, 'unassigned id').toBeTruthy();
  });

  it(killTitle('K8'), async () => {
    const m = await measure('week-1280');
    expect.soft(m.layout.now, 'frozen Now').toBe('Now 13:40');
    const o = await openState('week-1280');
    await o.page.clock.setFixedTime(new Date(FROZEN_NOW_PLUS_1));
    await o.page.waitForFunction(() => (document.querySelector('.hub-week-now')?.textContent ?? '').includes('13:41'));
    expect.soft(await o.page.locator('.hub-week-now').innerText(), 'advanced Now').toBe('Now 13:41');
    await o.close();
  });

  it(killTitle('K9'), async () => {
    const o = await openState('week-1280');
    await o.page.evaluate(ids => {
      const card = document.querySelector(`[data-week-chip="${ids.job}"]`);
      const cell = document.querySelector(`[data-week-cell="${ids.cell}"]`);
      if (!card || !cell) return;
      const dt = {
        dropEffect: 'move',
        effectAllowed: 'move',
        files: [],
        items: [],
        types: ['text/plain'],
        setData() {},
        clearData() {},
        setDragImage() {},
        getData: () => ids.job,
      };
      const fire = (el: Element, type: string) => {
        const ev = new DragEvent(type, { bubbles: true, cancelable: true });
        Object.defineProperty(ev, 'dataTransfer', { value: dt });
        el.dispatchEvent(ev);
      };
      fire(card, 'dragstart');
      fire(cell, 'dragover');
      fire(cell, 'drop');
    }, { job: JOB_IDS.fillA, cell: `${SAM}:2026-10-21` });
    await o.page.waitForFunction(() => window.__p2.ledger().writes.some(w => w.table === 'jobs' && w.op === 'update')).catch(() => {});
    const writes = await o.page.evaluate(() => window.__p2.ledger().writes);
    expect.soft(writes.some(w => w.table === 'jobs' && w.op === 'update'), 'drag writes jobs.update').toBe(true);
    await o.page.locator('[data-week-day="2026-10-20"]').click();
    await o.page.waitForFunction(() => document.querySelectorAll('[data-day-board]').length > 0);
    expect.soft(await o.page.locator('[data-day-board]').count(), 'head click opens day').toBeGreaterThan(0);
    await o.close();
  });

  it(killTitle('K10'), async () => {
    const day = await measure('day-1280');
    expect.soft(day.tracker.hours?.head ?? 0, 'hours 06-20').toBeGreaterThanOrEqual(14);
    expect.soft(day.tracker.hours, 'day hours drawn').not.toBeNull();
    const phone = await measure('day-390');
    expect.soft(phone.track, 'phone track').not.toBeNull();
    expect.soft((phone.track?.sw ?? 0) > (phone.track?.cw ?? 0), 'phone track overflows').toBe(true);
    expect.soft((phone.track?.wheelX.trackLeft ?? 0) > 0, 'phone track scrolls sideways').toBe(true);
    const o = await openState('day-1280');
    const handle = o.page.locator('.hub-day-board:not([data-day-phone]) .hub-day-resize-end').first();
    if (await handle.count() && await handle.isVisible()) {
      const box = await handle.boundingBox();
      if (box) {
        await o.page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await o.page.mouse.down();
        await o.page.mouse.move(box.x + 80, box.y + box.height / 2);
        await o.page.mouse.up();
        await o.page.waitForFunction(() => window.__p2.ledger().writes.some(w => w.table === 'jobs'), undefined, { timeout: 8_000 }).catch(() => {});
      }
    }
    const writes = await o.page.evaluate(() => window.__p2.ledger().writes);
    expect.soft(writes.some(w => w.table === 'jobs' && w.op === 'update'), 'resize writes end_time').toBe(true);
    await o.close();
  });

  it(killTitle('K11'), async () => {
    const rail = await measure('rail-1280');
    expect.soft(rail.layout.trayHeading, 'tray heading').toBe('Unscheduled');
    expect.soft(rail.layout.traySub.includes('3'), 'tray sub has N').toBe(true);
    expect.soft(rail.layout.trayCards.length, 'one card per needsDate').toBe(3);
    expect.soft(rail.layout.trayCards.some(c => c.meta.includes('#0048') && c.meta.includes('Luke Ferris')), 'ref · client · suburb').toBe(true);
    for (const card of rail.layout.trayCards) {
      expect.soft(card.pill, `rail card "${card.meta}" pill`).toBe('No date');
      expect.soft(card.text, `rail card "${card.meta}" keeps No date`).toMatch(/No date/);
      expect.soft(card.text, `rail card "${card.meta}" keeps Set a date off the card`).not.toMatch(/Set a date/);
    }
    const tray = await measure('tray-390');
    expect.soft(tray.tray?.after.listShown, 'phone tray opens').toBe(true);
    for (const card of tray.layout.trayCards) {
      expect.soft(card.pill, `tray card "${card.meta}" pill`).toBe('No date');
      expect.soft(card.text, `tray card "${card.meta}" keeps No date`).toMatch(/No date/);
      expect.soft(card.text, `tray card "${card.meta}" keeps Set a date off the card`).not.toMatch(/Set a date/);
    }
    const sheet = await measure('sheet-390');
    expect.soft(sheet.layout.setDate.some(label => label === 'Set a date'), 'sheet owns Set a date').toBe(true);
  });

  it(killTitle('K12'), async () => {
    for (const m of await states('K12')) {
      expect.soft(m.layout.agendaDays.map(d => d.date), `${m.id} 7 days`).toEqual([...WEEK]);
      const empty = m.layout.agendaDays.filter(d => d.empty);
      expect.soft(empty.length, `${m.id} empty days drawn`).toBeGreaterThan(0);
      for (const d of empty) expect.soft(d.h, `${m.id} empty strip height`).toBeGreaterThan(8);
      expect.soft(m.texts.some(t => t.text === 'Nothing booked'), `${m.id} Nothing booked`).toBe(true);
      if (m.rows[0]) {
        expect.soft(m.rows[0].time.top, `${m.id} line1 above title`).toBeLessThan(m.rows[0].title.top);
        expect.soft(Math.abs(m.rows[0].time.left - m.rows[0].title.left), `${m.id} no time column`).toBeLessThanOrEqual(ROWS.alignPx + 2);
      }
    }
  });

  it(killTitle('K13'), async () => {
    for (const id of ['week-390', 'week-768', 'week-1280'] as const) {
      const m = await measure(id);
      expect.soft(m.layout.quickBook, `${id} Quick book control`).toBe(true);
    }
    const prefill = await measure('prefill-390');
    expect.soft(prefill.sheet ?? text(prefill, 'Prefill'), 'Prefill opens the sheet or stays on the control').toBeTruthy();
  });

  it(killTitle('K14'), async () => {
    for (const m of await states('K14')) {
      const today = m.taps.find(t => t.label === 'Today');
      const allCrews = m.layout.allCrews;
      expect.soft(today ? Math.min(today.w, today.h) : 0, `${m.id} Today hit`).toBeGreaterThanOrEqual(TAP_MIN);
      expect.soft(allCrews, `${m.id} All crews reachable`).toBe(true);
      for (const t of m.taps.filter(x => ['Today', 'Week', 'Day', 'New job'].includes(x.label) || x.label.startsWith('Previous') || x.label.startsWith('Next'))) {
        expect.soft(Math.min(t.w, t.h), `${m.id} ${t.label}`).toBeGreaterThanOrEqual(TAP_MIN);
      }
    }
  });

  it(killTitle('K15'), async () => {
    const schema = JSON.parse(readFileSync(resolve(process.cwd(), 'docs/schema/p2-columns.json'), 'utf8')) as Record<string, string[]>;
    const m = await measure('week-1280');
    for (const read of m.reads) {
      const allowed = new Set(schema[read.table] ?? []);
      const cols = read.columns === '*' ? [] : read.columns.split(',').map(c => c.trim()).filter(Boolean);
      for (const col of cols) expect.soft(allowed.has(col), `${read.table}.${col} in schema`).toBe(true);
      for (const filter of read.filters) {
        const col = filter.split(/[=!<> ~]| in | is /)[0];
        if (col && col !== 'or' && !col.startsWith('or(')) {
          expect.soft(allowed.has(col) || col === 'id', `${read.table} filter ${filter}`).toBe(true);
        }
      }
    }
    const datedJobs = m.reads.filter(r => r.table === 'jobs' && r.filters.some(f => f.startsWith('scheduled_date>=')));
    expect.soft(datedJobs.length, 'week-1280 records a dated jobs board read').toBeGreaterThan(0);
    for (const read of datedJobs) {
      expect.soft(read.columns, 'jobs board columns').toBe(SCHEDULE_BOARD_COLUMNS);
      expect.soft(read.columns, 'jobs board never selects *').not.toBe('*');
      expect.soft(read.filters, 'jobs board company_id').toContain(`company_id=${String(PROFILE.company_id)}`);
      expect.soft(read.filters, 'jobs board week start').toContain('scheduled_date>=2026-10-19');
      expect.soft(read.filters, 'jobs board week end').toContain('scheduled_date<=2026-10-25');
      expect.soft(read.limit, 'jobs board limit').toBe(SCHEDULE_BOARD_LIMIT);
    }
    const undatedJobs = m.reads.filter(r => r.table === 'jobs' && r.filters.some(f => f === 'scheduled_date is null'));
    expect.soft(undatedJobs.length, 'week-1280 records an undated jobs board read').toBeGreaterThan(0);
    for (const read of undatedJobs) {
      expect.soft(read.columns, 'undated jobs board columns').toBe(SCHEDULE_BOARD_COLUMNS);
      expect.soft(read.columns, 'undated jobs never selects *').not.toBe('*');
      expect.soft(read.filters, 'undated jobs company_id').toContain(`company_id=${String(PROFILE.company_id)}`);
      expect.soft(read.limit, 'undated jobs limit').toBe(SCHEDULE_BOARD_LIMIT);
    }
    const migDir = resolve(process.cwd(), 'supabase/migrations');
    const live = jobsColumnsFromMigrations(
      readdirSync(migDir).filter(name => name.endsWith('.sql')).sort()
        .map(name => readFileSync(join(migDir, name), 'utf8')).join('\n'),
    );
    for (const col of scheduleBoardColumnList()) {
      expect.soft(live.includes(col), `jobs.${col} exists in supabase/migrations`).toBe(true);
    }
    const moreBoard = async (id: 'week-1280' | 'week-390', opts: { boardCap?: number; undatedCap?: number }) => {
      const opened = await openState(id, 'branch', undefined, opts);
      try {
        return await opened.page.evaluate(() => {
          const m = window.__p2.measureDom();
          return {
            moreJobs: m.chrome.moreJobs,
            moreJobsHref: m.chrome.moreJobsHref,
            whisper: m.layout.whisper,
            trayCards: m.layout.trayCards.length,
            unscheduledChip: m.chrome.unscheduledChip,
            undatedCardCount: m.chrome.undatedCardCount,
          };
        });
      } finally {
        await opened.close();
      }
    };
    const atCap = await moreBoard('week-1280', { boardCap: 200 });
    expect.soft(atCap.moreJobs, '200 dated rows hide the more-jobs line').toBe('');
    const over = await moreBoard('week-1280', { boardCap: 201 });
    expect.soft(over.moreJobs, '201 dated rows show the more-jobs line').toBe(MORE_JOBS_THIS_WEEK);
    expect.soft(over.moreJobsHref, 'more-jobs line links to Jobs').toBe('/jobs');
    const undatedAtCap = await moreBoard('week-1280', { undatedCap: 200 });
    expect.soft(undatedAtCap.moreJobs, '200 undated rows hide the more-jobs line').toBe('');
    expect.soft(undatedAtCap.whisper, '200 undated whisper count').toMatch(/200 without a date/);
    expect.soft(undatedAtCap.trayCards, '200 undated rail cards').toBe(200);
    const undatedOver = await moreBoard('week-1280', { undatedCap: 201 });
    expect.soft(undatedOver.moreJobs, '201 undated rows show the more-jobs line').toBe(MORE_JOBS_THIS_WEEK);
    expect.soft(undatedOver.moreJobsHref, 'undated more-jobs line links to Jobs').toBe('/jobs');
    expect.soft(undatedOver.whisper, '201 undated whisper stays at cap').toMatch(/200 without a date/);
    expect.soft(undatedOver.whisper, '201 undated whisper never counts the dropped row').not.toMatch(/201 without a date/);
    expect.soft(undatedOver.trayCards, '201 undated rail cards stay at cap').toBe(200);
    const phoneUndatedAtCap = await moreBoard('week-390', { undatedCap: 200 });
    expect.soft(phoneUndatedAtCap.moreJobs, '390 / 200 undated hides the more-jobs line').toBe('');
    expect.soft(phoneUndatedAtCap.unscheduledChip, '390 / 200 undated chip').toBe('Unscheduled · 200');
    const phoneUndatedOver = await moreBoard('week-390', { undatedCap: 201 });
    expect.soft(phoneUndatedOver.moreJobs, '390 / 201 undated shows the more-jobs line').toBe(MORE_JOBS_THIS_WEEK);
    expect.soft(phoneUndatedOver.unscheduledChip, '390 / 201 undated chip stays at cap').toBe('Unscheduled · 200');
  });

  it(killTitle('K16'), async () => {
    for (const m of await states('K16')) {
      expect.soft(m.docSW, `${m.id} no overflow`).toBeLessThanOrEqual(m.iw);
      expect.soft(m.bodySW, `${m.id} body.scrollWidth`).toBeLessThanOrEqual(m.iw);
      expect.soft(m.darkChangedPx, `${m.id} dark 0px`).toBe(0);
      for (const p of m.palette) expect.soft(p.navyPx + p.creamPx, `${m.id} ${p.shot} navy+cream`).toBe(0);
    }
  });

  it(killTitle('K17'), async () => {
    for (const m of await states('K17')) {
      const wanted = ['header', 'tools', 'board', 'tray'];
      const seen = [...new Set(m.layout.sections.filter(s => wanted.includes(s.id)).sort((a, b) => a.top - b.top).map(s => s.id))];
      expect.soft(seen, `${m.id} section order`).toEqual(wanted);
    }
  });

  it(killTitle('K18'), async () => {
    const empty = await measure('empty-1280');
    expect.soft(empty.layout.whisper, 'empty whisper').toBe('0 on the board');
    expect.soft(empty.layout.weekDays, 'empty days drawn').toEqual([...WEEK]);
    expect.soft(empty.layout.traySub, 'empty tray').toMatch(/No unscheduled jobs/);
    expect.soft(empty.pageErrors, 'empty has no page errors').toEqual([]);
    const err = await measure('error-1280');
    expect.soft(err.layout.pageError, 'jobs error').toBe('Could not load schedule');
  });

  it(killTitle('K19'), async () => {
    const m = await measure('needcrew-1280');
    expect.soft(m.layout.whisper, 'undated in_progress plus one dated crewless').toBe(
      '1 on the board · 1 need crew · 1 without a date',
    );
  });

  it(killTitle('K20'), async () => {
    for (const m of await states('K20')) {
      const clocks = m.clocks.filter(c => c.cls.includes('hub-week-chip-clock'));
      expect.soft(clocks.length, `${m.id} laptop clocks`).toBeGreaterThan(0);
      for (const c of clocks) {
        expect.soft(c.fits, `${m.id} "${c.text}" clipped by ${c.clipEl || 'viewport'} ${c.textRight}>${c.clipRight}`).toBe(true);
        expect.soft(c.ownFits, `${m.id} "${c.text}" own scrollWidth fits`).toBe(true);
      }
    }
  });

  it(killTitle('K21'), async () => {
    for (const m of await states('K21')) {
      if (m.iw <= 390) {
        expect.soft(m.reach.agenda.height, `${m.id} agenda height`).toBeGreaterThan(0);
        expect.soft(m.reach.agenda.visible, `${m.id} agenda visible height`).toBeGreaterThan(0);
        expect.soft(m.reach.agendaFirst.height, `${m.id} agenda first day height`).toBeGreaterThan(0);
        expect.soft(m.reach.agendaFirst.visible, `${m.id} agenda first day visible height`).toBeGreaterThan(0);
        expect.soft(m.layout.agendaDays.length, `${m.id} agenda days painted`).toBeGreaterThan(0);
        const first = m.layout.agendaDays[0];
        expect.soft(first?.h ?? 0, `${m.id} first agenda day layout height`).toBeGreaterThan(0);
      } else {
        expect.soft(m.reach.tray.visible, `${m.id} tray visible after scroll-to-end`).toBeGreaterThan(0);
        expect.soft(m.reach.lastLane.visible, `${m.id} last lane visible after scroll-to-end`).toBeGreaterThan(0);
      }
    }
  });

  it(killTitle('K22'), async () => {
    const m = await measure('week-1280');
    const quoted = m.layout.cards.find(c => c.id === JOB_IDS.quotedOpen);
    const space = m.layout.cards.find(c => c.id === JOB_IDS.spaceCrew);
    expect.soft(quoted?.pill, '#0202 dated crewless quoted').toBe('Needs crew');
    expect.soft(`${quoted?.clock} ${quoted?.line1}`, '#0202 never Booked').not.toMatch(/Booked/);
    expect.soft(quoted?.pill, '#0202 never Scheduled').not.toBe('Scheduled');
    expect.soft(space?.pill, "[' '] counts as no crew").toBe('Needs crew');
  });

  it(killTitle('K23'), async () => {
    const m = await measure('week-1280');
    const quoted = m.layout.cards.find(c => c.id === JOB_IDS.quotedCrew);
    expect.soft(quoted?.pill, '#0206 quoted with crew').toBe('Quoted');
    expect.soft(quoted?.pill, '#0206 never Scheduled').not.toBe('Scheduled');
    expect.soft(quoted?.pill, '#0206 never Booked').not.toBe('Booked');
    expect.soft(`${quoted?.clock} ${quoted?.line1}`, '#0206 clock never Booked').not.toMatch(/Booked/);
  });

  it(killTitle('K24'), async () => {
    // Do not call measure()/openState('malformed-1280'): both run __p2.ready(), which throws
    // "p2 page never settled" after ~15s when a render crash leaves the spinner. Timeouts
    // are not kills. Donor week-1280 only supplies the built file URL and a Playwright context.
    const donor = await openState('week-1280');
    const url = donor.page.url();
    const page = await donor.page.context().newPage();
    const pageErrors: string[] = [];
    const consoleErrors: string[] = [];
    const malformedPills: { id: string; kind: string; pill: string }[] = [
      { id: JOB_IDS.crewListNum, kind: 'null', pill: 'Needs crew' },
      { id: JOB_IDS.crewString, kind: 'string', pill: 'Needs crew' },
      { id: JOB_IDS.crewObject, kind: 'object', pill: 'Needs crew' },
      { id: JOB_IDS.crewNumber, kind: 'number', pill: 'Needs crew' },
      { id: JOB_IDS.crewListObj, kind: 'whitespace', pill: 'Needs crew' },
      { id: JOB_IDS.crewListOne, kind: '[1]', pill: 'Needs crew' },
      { id: JOB_IDS.crewListEmptyObj, kind: '[{}]', pill: 'Needs crew' },
    ];
    try {
      page.on('pageerror', err => { pageErrors.push(err.message); });
      page.on('console', msg => {
        if (msg.type() === 'error') consoleErrors.push(msg.text());
      });
      await page.addInitScript((boot: { path: string; malformedCrew: boolean }) => {
        window.__P2_BOOT__ = boot;
        class FakeSpeechRecognition {
          lang = '';
          interimResults = false;
          continuous = false;
          onresult: ((ev: unknown) => void) | null = null;
          onend: (() => void) | null = null;
          onerror: ((ev: unknown) => void) | null = null;
          start() {}
          stop() {}
          abort() {}
        }
        Object.defineProperty(window, 'SpeechRecognition', { configurable: true, value: FakeSpeechRecognition });
        Object.defineProperty(window, 'webkitSpeechRecognition', { configurable: true, value: FakeSpeechRecognition });
      }, { path: '/schedule', malformedCrew: true });
      await page.goto(url);
      await page.waitForFunction(() => !!window.__p2, { timeout: 4_000 }).catch(() => {});
      const until = Date.now() + 3_000;
      while (Date.now() < until) {
        const ok = await page.evaluate(() => {
          const main = document.querySelector('main');
          const spin = document.querySelector('.animate-spin');
          return !!window.__p2 && !!main && !spin;
        }).catch(() => false);
        if (ok) break;
        await page.waitForTimeout(80);
      }
      const rendered = await page.evaluate(() => {
        const whisper = (document.querySelector('[data-schedule-whisper]')?.textContent ?? '').trim();
        const h1 = (document.querySelector('h1')?.textContent ?? '').trim();
        const cards = [...document.querySelectorAll('[data-schedule-job]')].length;
        return { whisper, h1, cards };
      }).catch(() => ({ whisper: '', h1: '', cards: 0 }));
      expect(rendered.h1, 'K24 still renders Schedule (AssertionError, not only pageerror)').toBe('Schedule');
      expect(rendered.cards, 'K24 malformed crew jobs still render as cards').toBeGreaterThan(0);
      expect(pageErrors, `malformed assigned_team pageerror: ${pageErrors.join(' | ') || 'none'}`).toEqual([]);
      expect(consoleErrors, `malformed assigned_team console error: ${consoleErrors.join(' | ') || 'none'}`).toEqual([]);
      const cards = await page.evaluate(ids => {
        const layout = window.__p2.measureDom().layout;
        return ids.map(id => {
          const card = layout.cards.find(c => c.id === id);
          return { id, pill: card?.pill ?? '', line1: card?.line1 ?? '' };
        });
      }, MALFORMED_CREW_IDS.slice()).catch(() => [] as { id: string; pill: string; line1: string }[]);
      expect(cards.length, 'all five malformed crew jobs render').toBe(malformedPills.length);
      for (const want of malformedPills) {
        const card = cards.find(c => c.id === want.id);
        expect.soft(card?.pill, `malformed ${want.kind} crew card ${card?.line1 || want.id} pill`).toBe(want.pill);
      }
      expect(await page.locator('h1').first().textContent(), 'K24 h1 Schedule').toBe('Schedule');
      expect((await page.locator('[data-schedule-whisper]').textContent())?.trim(), 'K24 board count').toBe('7 on the board · 7 need crew');
      const domCards = await page.evaluate(ids => [...document.querySelectorAll<HTMLElement>('[data-schedule-job]')].filter(el => {
        const id = el.dataset.scheduleJob ?? '';
        return (ids as string[]).includes(id) && el.getBoundingClientRect().width > 1;
      }).map(el => ({
        id: el.dataset.scheduleJob ?? '',
        pill: (el.querySelector('.hub-schedule-pill')?.textContent ?? '').trim(),
      })), MALFORMED_CREW_IDS.slice());
      expect(domCards.length, 'all seven malformed crew jobs render as DOM cards').toBe(7);
      for (const want of malformedPills) {
        const card = domCards.find(c => c.id === want.id);
        expect.soft(card?.pill, `DOM card ${want.kind} pill`).toBe(want.pill);
      }
    } finally {
      await page.close().catch(() => {});
      await donor.close();
    }
  });

  it(killTitle('K25'), async () => {
    const mock = await measureMockup1280();
    const week = await measure('week-1280');
    const c = week.chrome;
    expect.soft(c.headerLeft < c.newJobLeft, 'New job sits to the right of the header').toBe(true);
    expect.soft(c.h1Left, `Schedule h1 left ${c.h1Left} vs fixture ${mock.h1Left} (page ${c.pageLeft} pad ${c.pagePadLeft} parent ${c.h1ParentLeft})`).toBe(mock.h1Left);
    expect.soft(c.eyebrowLeft, `eyebrow left ${c.eyebrowLeft} vs fixture ${mock.eyebrowLeft}`).toBe(mock.eyebrowLeft);
    expect.soft(c.segPainted, 'pill seg paints a border').toBeGreaterThanOrEqual(4);
    expect.soft(c.segCornerCut, 'pill seg radius cuts the corner').toBe(true);
    expect.soft(c.navPainted, 'boxed ‹ › paint a border').toBeGreaterThanOrEqual(4);
    expect.soft(c.navCornerCut, 'nav boxes keep a radius').toBe(true);
    expect.soft(c.range, 'week range').toBe('19 to 25 Oct');
    expect.soft(c.segW, 'seg track width').toBe(138);
    expect.soft(c.rangeW, 'range row width').toBe(209);
    expect.soft(c.searchWidth, `search width ${c.searchWidth} vs fixture ${mock.searchW}`).toBe(mock.searchW);
    expect.soft(Math.abs(c.todayRight - c.toolbarRight), `Today.right ${c.todayRight} vs toolbar.right ${c.toolbarRight}`).toBeLessThanOrEqual(1);
    expect.soft(c.crewToolbarShown, 'Crew is not a toolbar label').toBe(0);
    expect.soft(c.todayPainted, `Today painted stroke ${c.todayPainted} vs fixture ${mock.todayPainted}`).toBe(mock.todayPainted);
    expect.soft(c.todayCornerCut, 'Today keeps a radius').toBe(true);
    expect.soft(Math.abs(c.toolbarBottom - c.boardTop), `toolbar.bottom ${c.toolbarBottom} vs board.top ${c.boardTop}`).toBeLessThanOrEqual(1);
    expect.soft(c.dayHeadShortShown, 'day headers one left-aligned line').toBe(7);
    expect.soft(c.dayHeadFullShown, 'month-long heads hidden at 1280').toBe(0);
    expect.soft(c.dayHeadLines, 'day heads stay one line').toBeLessThanOrEqual(1);
    expect.soft(c.dayHeadText.some(t => /Mon\s*19/.test(t) && !/Oct/.test(t)), `day head is Mon 19 (${c.dayHeadText.join(' | ')})`).toBe(true);
    expect.soft(c.line1_0036, 'card line 1').toBe('07:00–10:30 · #0036');
    expect.soft(c.titleLines, 'titles wrap to 2 lines').toBe(2);
    expect.soft(c.weekCrewLines, 'week crew names stay one line').toBe(1);
    expect.soft(c.h1Weight, 'h1 weight vs fixture').toBe(mock.h1Weight);
    expect.soft(c.h1Size, 'h1 size vs fixture').toBe(mock.h1Size);
    expect.soft(c.h1Lh, 'h1 line-height vs fixture').toBe(mock.h1Lh);
    expect.soft(c.whisperWeight, 'sub-line weight vs fixture').toBe(mock.subWeight);
    expect.soft(c.whisperSize, 'sub-line size vs fixture').toBe(mock.subSize);
    expect.soft(c.whisperLh, 'sub-line line-height vs fixture').toBe(mock.subLh);
    expect.soft(c.eyebrowPaint, 'eyebrow painted vs fixture').toBe(mock.eyebrowPaint);
    expect.soft(c.eyebrowTransform, 'eyebrow transform vs fixture').toBe(mock.eyebrowTransform);
    expect.soft(c.eyebrowLetterSpacing, 'eyebrow letter-spacing vs fixture').toBe(mock.eyebrowLetterSpacing);
    expect.soft(c.newJobW, 'New job width vs fixture').toBe(mock.newJobW);
    expect.soft(c.newJobH, 'New job height vs fixture').toBe(mock.newJobH);
    expect.soft(c.eyebrowLh, 'eyebrow line-height vs fixture').toBe(mock.eyebrowLh);
    expect.soft(c.newJobY, 'New job y vs fixture').toBe(mock.newJobY);
    expect.soft(c.segTrackPaint, 'Week/Day track painted vs fixture').toBe(mock.segTrackPaint);
    expect.soft(c.segActivePaint, 'Week/Day active fill painted vs fixture').toBe(mock.segActivePaint);
    expect.soft(c.segActiveInk, 'Week/Day active ink painted vs fixture').toBe(mock.segActiveInk);
    expect.soft(c.geistCheck, 'Geist 16px after fonts.ready').toBe(true);
    expect.soft(mock.geistCheck, 'fixture Geist 16px after fonts.ready').toBe(true);
    expect.soft(c.searchH, 'search height vs fixture').toBe(mock.searchH);
    expect.soft(c.todayW, 'Today width vs fixture').toBe(mock.todayW);
    expect.soft(c.todayH, 'Today height vs fixture').toBe(mock.todayH);
    expect.soft(c.todayFill, 'Today fill painted vs fixture').toBe(mock.todayFill);
    expect.soft(c.boardLeft, 'board left vs fixture').toBe(mock.boardLeft);
    expect.soft(c.boardRight, 'board right vs fixture').toBe(mock.boardRight);
    expect.soft(c.trayWeight, 'tray heading weight vs fixture').toBe(mock.trayWeight);
    expect.soft(c.traySize, 'tray heading size vs fixture').toBe(mock.traySize);
    expect.soft(c.trayLh, 'tray heading line-height vs fixture').toBe(mock.trayLh);

    const rail = await measure('rail-1280');
    expect.soft(rail.chrome.trayHeadingH, `tray heading ${rail.chrome.trayHeadingH} vs fixture ${mock.trayH}`).toBe(mock.trayH);
    expect.soft(rail.chrome.trayHeadingText, 'tray heading').toBe('Unscheduled');
    expect.soft(rail.chrome.trayCols, 'tray 3 compact columns').toBe(3);

    const day = await measure('day-1280');
    expect.soft(day.chrome.dayUntimedWidth, 'untimed card has a width').toBeGreaterThan(0);
    expect.soft(day.chrome.dayUntimedWidth < day.chrome.dayTrackWidth * 0.55, 'untimed card does not span the track').toBe(true);
    expect.soft(day.chrome.dayCrewLines, 'day crew names stay one line').toBe(1);

    const phone = await measure('week-390');
    expect.soft(phone.chrome.headerTop, '390 header not clipped at the top').toBeGreaterThanOrEqual(0);
    expect.soft(Math.abs(phone.chrome.todayTop - phone.chrome.rangeTop), 'Today on the range row').toBeLessThanOrEqual(24);
    expect.soft(phone.docSW, '390 documentElement.scrollWidth').toBeLessThanOrEqual(phone.iw);
    expect.soft(phone.bodySW, '390 body.scrollWidth').toBeLessThanOrEqual(phone.iw);
    const phoneOutside = phone.offenders.filter(o => !exempt(o, phone.iw));
    expect.soft(phoneOutside, '390 elements past innerWidth outside the sole scroller').toEqual([]);
    expect.soft(phoneOutside.reduce((max, o) => Math.max(max, o.right), 0), '390 max unexempted rect.right').toBeLessThanOrEqual(phone.iw + TOLERANCE_PX);
    expect.soft(Math.abs(phone.chrome.dayGroupLeft - 16), `390 day-group left ${phone.chrome.dayGroupLeft}`).toBeLessThanOrEqual(1);
    expect.soft(Math.abs(phone.chrome.cardLeft - 16), `390 card left ${phone.chrome.cardLeft}`).toBeLessThanOrEqual(1);
    const gutters: Record<string, Awaited<ReturnType<typeof measure>>> = { 'week-390': phone };
    for (const id of ['week-375', 'week-390', 'week-768'] as const) {
      const g = id === 'week-390' ? phone : await measure(id);
      gutters[id] = g;
      expect.soft(Math.abs(g.chrome.headerLeft - 16), `${id} header-block left ${g.chrome.headerLeft}`).toBeLessThanOrEqual(1);
      expect.soft(Math.abs(g.chrome.listLeft - 16), `${id} list left ${g.chrome.listLeft}`).toBeLessThanOrEqual(1);
      expect.soft(Math.abs(g.chrome.headerLeft - g.chrome.listLeft), `${id} header-block left = list left`).toBeLessThanOrEqual(1);
      expect.soft(Math.abs(g.chrome.searchLeft - g.chrome.headerLeft), `${id} search left ${g.chrome.searchLeft} vs header ${g.chrome.headerLeft}`).toBeLessThanOrEqual(1);
      expect.soft(Math.abs(g.chrome.searchRight - (g.iw - 16)), `${id} search right ${g.chrome.searchRight} vs ${g.iw - 16}`).toBeLessThanOrEqual(1);
    }
    expect.soft(gutters['week-768'].chrome.headerLeft, '768 header left equals list left exactly').toBe(gutters['week-768'].chrome.listLeft);

    const opened = await openState('week-1280');
    await opened.page.getByRole('button', { name: 'New job' }).first().click();
    const qb = opened.page.locator('[data-schedule-section="quickbook"][data-open="1"]');
    await qb.waitFor({ timeout: 4_000 }).catch(() => {});
    expect.soft(await qb.count(), 'header New job opens Quick book').toBeGreaterThan(0);
    expect.soft(await opened.page.locator('[data-schedule-quickbook-existing]').count(), 'header New job opens schedule existing').toBeGreaterThan(0);
    expect.soft(await opened.page.locator('[data-schedule-quickbook-new]').count(), 'header New job opens New job choice').toBeGreaterThan(0);
    expect.soft(await opened.page.locator('.hub-schedule-voice-mic').count(), 'header New job opens the mic').toBeGreaterThan(0);
    const existingChoice = opened.page.locator('[data-schedule-quickbook-existing]').first();
    const newChoice = opened.page.locator('[data-schedule-quickbook-new]').first();
    expect.soft(await existingChoice.evaluate(el => el.tagName), 'schedule existing is a labelled choice').toBe('BUTTON');
    expect.soft((await existingChoice.textContent())?.trim(), 'schedule existing label').toBe('Schedule existing');
    expect.soft(await newChoice.evaluate(el => el.tagName), 'New job is a labelled choice').toBe('BUTTON');
    expect.soft(await newChoice.evaluate(el => (el.getAttribute('aria-label') || el.textContent || '').replace(/\s+/g, ' ').trim()), 'New job choice accessible name').toBe('New job');
    expect.soft(await existingChoice.isVisible(), 'schedule existing option visible').toBe(true);
    expect.soft(await newChoice.isVisible(), 'New job option visible').toBe(true);
    await opened.close();
  });

  it(killTitle('K26'), async () => {
    const m = await measure('status-1280');
    expect(m.pageErrors, 'non-string status/date must not throw').toEqual([]);
    const byId = new Map(m.layout.cards.map(c => [c.id, c]));
    const nullStatus = byId.get(JOB_IDS.statusNull);
    const numStatus = byId.get(JOB_IDS.statusNum);
    const objStatus = byId.get(JOB_IDS.statusObj);
    expect.soft(nullStatus?.pill, 'null status crewed dated').toBe(STATUS_FALLBACK);
    expect.soft(nullStatus?.pill, 'null status never Scheduled').not.toBe('Scheduled');
    expect.soft(`${nullStatus?.clock} ${nullStatus?.line1}`, 'null status never Booked').not.toMatch(/Booked/);
    expect.soft(numStatus?.pill, 'number status crewed').toBe(STATUS_FALLBACK);
    expect.soft(numStatus?.pill, 'number status never Scheduled').not.toBe('Scheduled');
    expect.soft(`${numStatus?.clock} ${numStatus?.line1}`, 'number status never Booked').not.toMatch(/Booked/);
    expect.soft(objStatus?.pill, 'object status dated crewless').toBe('Needs crew');
    expect.soft(objStatus?.pill, 'object status never Scheduled').not.toBe('Scheduled');
    const dateNum = m.layout.trayCards.find(c => c.id === JOB_IDS.dateNum)
      ?? m.layout.trayCards.find(c => c.text.includes('#0304') || c.text.includes('#304'))
      ?? m.layout.cards.find(c => c.id === JOB_IDS.dateNum);
    const dateObj = m.layout.trayCards.find(c => c.id === JOB_IDS.dateObj)
      ?? m.layout.cards.find(c => c.id === JOB_IDS.dateObj);
    const dateArr = m.layout.trayCards.find(c => c.id === JOB_IDS.dateArr)
      ?? m.layout.cards.find(c => c.id === JOB_IDS.dateArr);
    expect.soft(dateNum?.pill, 'non-string scheduled_date is undated').toBe('No date');
    expect.soft(dateNum?.pill, 'number scheduled_date never Scheduled').not.toBe('Scheduled');
    expect.soft(dateNum?.pill, 'number scheduled_date never Booked').not.toMatch(/Booked/);
    expect.soft(dateObj?.pill, 'object scheduled_date is undated').toBe('No date');
    expect.soft(dateObj?.pill, 'object scheduled_date never Scheduled').not.toBe('Scheduled');
    expect.soft(dateObj?.pill, 'object scheduled_date never Booked').not.toMatch(/Booked/);
    expect.soft(dateArr?.pill, 'array scheduled_date is undated').toBe('No date');
    expect.soft(dateArr?.pill, 'array scheduled_date never Scheduled').not.toBe('Scheduled');
    expect.soft(dateArr?.pill, 'array scheduled_date never Booked').not.toMatch(/Booked/);
  });
});

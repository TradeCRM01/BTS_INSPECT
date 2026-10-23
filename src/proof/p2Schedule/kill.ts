import { afterAll, describe, expect, it } from 'vitest';
import {
  CONTRAST, EMPTY_COPY, FADE, FOCUS, IN_PROGRESS, JOB_REF, KILLS, NOW, PALETTE, PHONE_BOARD_BREAKPOINT, PHONE_TABS, ROWS, SAME_COLOUR,
  SHEET, TAP_MIN, TODAY, TRACK_PROBE, UNTIMED, WEEK, channelGap, isAmber, isNavy, killTitle, rgbOf,
  type KillId, type Measure, type Offender, type Stroke,
} from './matrix.ts';
import { JOBS } from './fixture.ts';
import { bundleReport, closeHarness, measure, measureAll, token, writeCapture } from './harness.ts';

// The only scroller whose children may extend past innerWidth (Coach ruling on finding 7).
// Any new entry needs a Coach ruling.
const SOLE_SCROLLER = '.hub-day-track';
const TOLERANCE_PX = 0.5;

const states = (id: KillId) => measureAll(KILLS[id].states);
const exempt = (o: Offender, iw: number) =>
  o.scroller !== null && o.scroller.classes.includes(SOLE_SCROLLER.slice(1)) && o.scroller.right <= iw + TOLERANCE_PX;
const firstFieldItem = (m: Measure) => m.menu?.[0] ?? null;
const same = (a: string, b: string) => channelGap(a.slice(0, 7), b) <= SAME_COLOUR;
const painted = (s: Stroke | null) => !!s && s.w >= 1 && s.a > 0 && s.style !== 'none' && s.style !== 'hidden';
const text = (m: Measure, words: string) => m.texts.find(t => t.text === words);
const UNTIMED_JOBS = JOBS.filter(j => j.scheduled_date && !j.start_time).length;

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
      const main = await measure(m.id, 'main');
      expect.soft(m.rows.length, `${m.id} agenda rows`).toBeGreaterThan(0);
      expect.soft(m.rows.length, `${m.id} row count vs main`).toBe(main.rows.length);
      m.rows.forEach((row, i) => {
        for (const part of ['time', 'title', 'meta'] as const) {
          expect.soft(row[part].lines.length, `${m.id} row ${i} ${part} lines vs main ${JSON.stringify(main.rows[i][part].lines)}`)
            .toBeLessThanOrEqual(main.rows[i][part].lines.length);
        }
        expect.soft(row.meta.lines.length, `${m.id} row ${i} meta lines`).toBeLessThanOrEqual(ROWS.maxMetaLines);
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
      expect.soft(untimed.length, `${m.id} untimed rows carry the Booked · Add a time line`).toBe(UNTIMED_JOBS);
      untimed.forEach(row => {
        const at = `${m.id} untimed "${row.title.lines[0] ?? ''}"`;
        expect.soft(row.timeInk, `${at} Booked line ink`).toBe(token('g-ink-muted'));
        if (m.iw < ROWS.stackBelow) {
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

  it(killTitle('P2-overflow'), async () => {
    for (const m of await states('P2-overflow')) {
      expect.soft(m.docSW, `${m.id} documentElement.scrollWidth`).toBeLessThanOrEqual(m.iw);
      expect.soft(m.bodySW, `${m.id} body.scrollWidth`).toBeLessThanOrEqual(m.iw);
      const outside = m.offenders.filter(o => !exempt(o, m.iw));
      expect.soft(outside, `${m.id} elements past innerWidth outside ${SOLE_SCROLLER}`).toEqual([]);
    }
  });

  it(killTitle('P2-day-track'), async () => {
    for (const m of await states('P2-day-track')) {
      const t = m.track;
      expect.soft(t, `${m.id} renders the day track`).not.toBeNull();
      if (!t) continue;
      expect.soft(t.classes, `${m.id} wheel target is ${SOLE_SCROLLER}`).toContain(SOLE_SCROLLER.slice(1));
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

  it.fails(killTitle('P2-nav-desktop'), async () => {
    for (const m of await states('P2-nav-desktop')) {
      expect(firstFieldItem(m), `${m.id} first Field item`).toBe('Schedule');
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
        expect.soft(c.board === 'week' ? c.ref : c.ref.split(' · ').pop(), `${at} ref is a whole job ref`).toMatch(JOB_REF);
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
        const marked = n.heads.filter(h => h.bar >= NOW.barPx / 2);
        expect.soft(marked.map(h => h.date), `${m.id} heads with an accent bar`).toEqual([TODAY]);
        for (const h of marked) expect.soft(h.bar, `${m.id} ${h.date} accent bar px`).toBeCloseTo(NOW.barPx, 0);
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
      const dates = m.taps.filter(x => x.cls.includes('hub-schedule-set-date'));
      expect.soft(chip ? Math.min(chip.w, chip.h) : 0, `${m.id} tray chip hit`).toBeGreaterThanOrEqual(TAP_MIN);
      expect.soft(dates.length, `${m.id} Set a date buttons measured`).toBeGreaterThan(0);
      for (const d of dates) expect.soft(Math.min(d.w, d.h), `${m.id} Set a date hit`).toBeGreaterThanOrEqual(TAP_MIN);
    }
  });

  it(killTitle('P2-status'), async () => {
    const [well, ink] = [token('g-surface-2'), token('g-ink')];
    expect.soft([token('g-warn'), token('g-warn-bg')].map(isAmber), 'the amber test sees the warn tokens').toEqual([true, true]);
    for (const m of await states('P2-status')) {
      for (const t of m.texts) {
        if (t.role === 'chip' || ![t.fg, t.bg].some(isAmber)) continue;
        expect.soft(t.role === 'pill' && t.text === IN_PROGRESS, `${m.id} amber "${t.text}" (${t.cls}) is an In Progress pill`).toBe(true);
      }
      const pills = m.texts.filter(t => t.cls.includes(ROWS.pill.slice(1)));
      if (m.rows.length && !m.sheet) expect.soft(pills.length, `${m.id} agenda status pills`).toBeGreaterThan(0);
      for (const p of pills) {
        if (p.text !== IN_PROGRESS) expect.soft([p.fg, p.bg], `${m.id} pill "${p.text}" ink on the well`).toEqual([ink, well]);
      }
    }
  });
});

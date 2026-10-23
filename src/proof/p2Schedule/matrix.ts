// Pure data shared by the browser probes, the kill file, the harness and scripts/p2-schedule.mjs.
// No runtime imports and erasable syntax only, so Node type stripping can load it from the script.

export const BASE_SHA = '30cb09d96410c1d05171c8bc13bbbd998e4cda77';
export const FROZEN_NOW = '2026-10-19T13:40:00+10:00';
export const TIMEZONE = 'Australia/Brisbane';
export const BEFORE_DIR = '/tmp/p2-proofs/before';
export const BASELINE_VITEST_LOG = '/tmp/p2-baseline/vitest-built.log';

export const WIDTHS = [375, 390, 768, 1024, 1280] as const;
export type Width = (typeof WIDTHS)[number];
export const PHONE_BOARD_BREAKPOINT = 1024;
export const viewportHeight = (w: Width): number => (w < 768 ? 812 : 900);
export const isTouch = (w: Width): boolean => w < 1024;

export type View = 'week' | 'day';
export type Recipe = 'none' | 'lineprobe' | 'tray' | 'rail' | 'sheet' | 'prefill' | 'more' | 'save' | 'tab' | 'field' | 'empty' | 'jobserror' | 'search';
export type Shot = 'top' | 'scrolled' | 'dark' | 'empty' | 'chips' | 'focus' | 'middle' | 'end';
export type Frames = Readonly<Partial<Record<Shot, string>>>;

export type StateSpec = {
  readonly path: string;
  readonly w: Width;
  readonly recipe: Recipe;
  readonly frames: Frames;
};

const board = (view: View, w: Width, extra: Frames = {}): StateSpec => ({
  path: view === 'day' ? '/schedule?view=day' : '/schedule',
  w,
  recipe: 'none',
  frames: {
    top: `schedule-${view}-${w}-top.png`,
    scrolled: `schedule-${view}-${w}-scrolled.png`,
    ...extra,
  },
});

export const STATES = {
  'week-375': board('week', 375),
  'week-390': board('week', 390, { dark: 'forced-dark-week-390.png', empty: 'schedule-week-390-empty-day.png' }),
  'week-768': board('week', 768),
  'week-1024': board('week', 1024, { chips: 'schedule-week-1024-chips.png' }),
  'week-1280': board('week', 1280, { focus: 'schedule-week-1280-seg-focus.png' }),
  'day-375': board('day', 375),
  'day-390': board('day', 390, { middle: 'schedule-day-390-track-middle.png', end: 'schedule-day-390-track-end.png' }),
  'day-768': board('day', 768),
  'day-1024': board('day', 1024),
  'day-1280': board('day', 1280),
  'tray-390': { path: '/schedule', w: 390, recipe: 'tray', frames: { top: 'schedule-unscheduled-tray-390.png' } },
  'sheet-390': { path: '/schedule', w: 390, recipe: 'sheet', frames: { top: 'schedule-quickbook-sheet-390.png' } },
  'rail-1280': { path: '/schedule', w: 1280, recipe: 'rail', frames: { top: 'schedule-needs-date-rail-1280.png' } },
  'prefill-390': { path: '/schedule', w: 390, recipe: 'prefill', frames: { top: 'schedule-quickbook-prefill-390.png' } },
  'prefill-1280': { path: '/schedule', w: 1280, recipe: 'prefill', frames: { top: 'schedule-quickbook-prefill-1280.png' } },
  'more-390': { path: '/schedule', w: 390, recipe: 'more', frames: { top: 'schedule-more-menu-390.png' } },
  'more-1280': { path: '/schedule', w: 1280, recipe: 'more', frames: { top: 'schedule-more-menu-1280.png' } },
  'tabs-375': { path: '/', w: 375, recipe: 'tab', frames: {} },
  'tabs-390': { path: '/', w: 390, recipe: 'tab', frames: { top: 'schedule-phone-tabs-390.png' } },
  'nav-768': { path: '/schedule', w: 768, recipe: 'field', frames: { top: 'schedule-nav-768.png' } },
  'nav-1280': { path: '/schedule', w: 1280, recipe: 'field', frames: { top: 'schedule-nav-1280.png' } },
  'save-390': { path: '/schedule', w: 390, recipe: 'save', frames: {} },
  'lineprobe-375': { path: '/schedule', w: 375, recipe: 'lineprobe', frames: {} },
  'empty-1280': { path: '/schedule', w: 1280, recipe: 'empty', frames: {} },
  'error-1280': { path: '/schedule', w: 1280, recipe: 'jobserror', frames: {} },
  'search-1280': { path: '/schedule', w: 1280, recipe: 'search', frames: {} },
} as const satisfies Record<string, StateSpec>;
export type StateId = keyof typeof STATES;
export const STATE_IDS = Object.keys(STATES) as StateId[];
export type Build = 'branch' | 'main';

const BOARD: readonly StateId[] = [
  'week-375', 'week-390', 'week-768', 'week-1024', 'week-1280',
  'day-375', 'day-390', 'day-768', 'day-1024', 'day-1280',
];
const OVERLAYS: readonly StateId[] = ['tray-390', 'sheet-390', 'rail-1280', 'prefill-390', 'prefill-1280', 'more-390', 'more-1280'];
const SCHEDULE: readonly StateId[] = [...BOARD, ...OVERLAYS];
const AGENDA: readonly StateId[] = [
  ...WIDTHS.filter(w => w < PHONE_BOARD_BREAKPOINT).map(w => `week-${w}` as StateId),
  'lineprobe-375',
];

const TRACKS: readonly StateId[] = ['week-390', 'week-1280', 'day-390', 'day-1280'];
const PHONE_DAY: readonly StateId[] = ['day-375', 'day-390', 'day-768'];

export type KillId =
  | 'P2-palette' | 'P2-contrast' | 'P2-taps' | 'P2-lines' | 'P2-m2' | 'P2-dark'
  | 'P2-overflow' | 'P2-day-track' | 'P2-nav-phone' | 'P2-nav-desktop' | 'P2-mocks'
  | 'P2-tracker' | 'P2-chip' | 'P2-focus' | 'P2-now' | 'P2-day-board' | 'P2-scroller' | 'P2-sheet' | 'P2-tray' | 'P2-status'
  | 'K1' | 'K2' | 'K3' | 'K4' | 'K5' | 'K6' | 'K7' | 'K8' | 'K9' | 'K10'
  | 'K11' | 'K12' | 'K13' | 'K14' | 'K15' | 'K16' | 'K17' | 'K18';

export const KILLS: Readonly<Record<KillId, { readonly title: string; readonly states: readonly StateId[] }>> = {
  'P2-palette': { title: 'no navy or cream pixels outside data colour', states: [...BOARD, 'sheet-390'] },
  'P2-contrast': { title: 'text 7 to 1, CTA chip pill and link 4.5 to 1', states: SCHEDULE },
  'P2-taps': { title: 'every effective hit area is 44 by 44', states: SCHEDULE },
  'P2-lines': { title: 'agenda lines within main and meta breaks only after a dot', states: AGENDA },
  'P2-m2': { title: 'stacked rows below 640 and one shared track at 640 and up, the untimed Booked line leads in muted ink', states: AGENDA },
  'P2-dark': { title: 'forced dark changes 0 px', states: SCHEDULE },
  'P2-overflow': { title: 'no overflow outside the sole allowlisted scroller', states: SCHEDULE },
  'P2-day-track': { title: 'a real wheel scrolls the day track sideways and never traps vertical scroll', states: PHONE_DAY },
  'P2-nav-phone': { title: 'phone tabs reach Schedule in one tap', states: ['tabs-375', 'tabs-390'] },
  'P2-nav-desktop': { title: 'Schedule is first in Field at 768 and up', states: ['nav-768', 'nav-1280'] },
  'P2-mocks': { title: 'no network, no unmocked calls, writes only in the ledger', states: STATE_IDS },
  'P2-tracker': { title: 'week and day tracks keep every day and hour drawn with no empty-state copy', states: TRACKS },
  'P2-chip': { title: 'chip refs paint whole on one line, descriptions own the ellipsis, every chip text is measured', states: BOARD },
  'P2-focus': { title: 'seg, quiet and Today buttons ring 2px accent at 2px offset, paint on and off, hit 44', states: ['week-390', 'week-1280'] },
  'P2-now': { title: 'Today carries the accent marker and a 2px now-line with no animation', states: TRACKS },
  'P2-day-board': { title: 'line hour rules, zebra lanes, non-navy unassigned rail and outline, accent resize hover', states: ['day-390', 'day-1280'] },
  'P2-scroller': { title: 'the day track cuts an hour and fades 24px to surface, clicks pass through, no fade at the end', states: PHONE_DAY },
  'P2-sheet': { title: 'quick book scrim, surface sheet, hairline, one shadow, inverse Save and Prefill, line Cancel, safe-area footer', states: ['sheet-390', 'prefill-390', 'prefill-1280'] },
  'P2-tray': { title: 'the unscheduled tray starts collapsed and one tap opens it, chip and Set a date hit 44', states: ['tray-390'] },
  'P2-status': { title: 'status pills are ink on the well and amber marks only an In Progress pill', states: SCHEDULE },
  K1: { title: 'one Schedule header, week/day eyebrow, S3 whisper, one New job', states: ['week-1280', 'day-1280'] },
  K2: { title: 'seg, next, Today and search move the board with one recorded call', states: ['week-1280', 'search-1280'] },
  K3: { title: 'week grid draws 8 columns and every lane × day cell', states: ['week-1024', 'week-1280'] },
  K4: { title: 'lanes follow RPC order, full names, jobs counts, Unassigned last', states: ['week-1280'] },
  K5: { title: 'card line 1 keeps the whole ref, #0036 sits in two lanes', states: ['week-1280'] },
  K6: { title: 'D1 pills and one Q-S1 invoices read with company_id and not void', states: ['week-1280'] },
  K7: { title: 'rail is lane colour and the time track follows D2', states: ['week-1280'] },
  K8: { title: 'today head says Now 13:40 and advances one minute', states: ['week-1280'] },
  K9: { title: 'drag, unassign, empty cell and day head keep the existing mutations', states: ['week-1280'] },
  K10: { title: 'day hours 06-20, resize writes end_time, phone track scrolls', states: ['day-390', 'day-1280'] },
  K11: { title: 'tray lists every undated job with Set a date, Open and drag', states: ['tray-390', 'rail-1280'] },
  K12: { title: 'agenda draws 7 days and a Nothing booked strip on empty days', states: ['week-375', 'week-390'] },
  K13: { title: 'Quick book is reachable at every width and Prefill opens the sheet', states: ['week-390', 'week-768', 'week-1280', 'prefill-390'] },
  K14: { title: 'every tools-row action including All crews and Today hits 44', states: ['week-390', 'week-768', 'week-1280'] },
  K15: { title: 'recorded select and filter columns sit in docs/schema/p2-columns.json', states: ['week-1280'] },
  K16: { title: 'the colour bar still holds on the rebuilt layout', states: [...BOARD] },
  K17: { title: 'section order is header, tools, quickbook, board, tray', states: ['week-390', 'week-768', 'week-1280'] },
  K18: { title: 'empty company draws the board and a jobs error shows PageError', states: ['empty-1280', 'error-1280'] },
};
export const killTitle = (id: KillId): string => `${id}: ${KILLS[id].title}`;

export const PALETTE = {
  navy: { maxL: 35, hue: [235, 285], minChroma: 12 },
  cream: { minL: 88, b: [2.5, 12] },
  minScannedShare: 0.5,
  // Data colour and brand marks, from main's markup: job chips, crew dot, crew rail, photo or avatar, logo.
  masks: [
    { sel: '.hub-week-chip', part: 'box' },
    { sel: '.hub-schedule-pill', part: 'box' },
    { sel: '.hub-day-now-dot', part: 'box' },
    { sel: '.hub-day-now-line', part: 'box' },
    { sel: '.hub-day-now', part: 'box' },
    { sel: '.ops-crew-mark', part: 'box' },
    { sel: '[data-crew-drop]', part: 'border-left' },
    { sel: 'img', part: 'box' },
    { sel: '[data-shell-switcher-avatar]', part: 'box' },
    { sel: 'header a[href="/"]', part: 'box' },
  ],
} as const;
export type MaskPart = 'box' | 'border-left';

export function lab(r: number, g: number, b: number): [number, number, number] {
  const lin = (v: number) => {
    const s = v / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  const R = lin(r);
  const G = lin(g);
  const B = lin(b);
  const f = (t: number) => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116);
  const fx = f((0.4124 * R + 0.3576 * G + 0.1805 * B) / 0.95047);
  const fy = f(0.2126 * R + 0.7152 * G + 0.0722 * B);
  const fz = f((0.0193 * R + 0.1192 * G + 0.9505 * B) / 1.08883);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}
const lch = (r: number, g: number, b: number) => {
  const [L, A, B] = lab(r, g, b);
  return { L, B, C: Math.hypot(A, B), h: (Math.atan2(B, A) * 180 / Math.PI + 360) % 360 };
};
export const rgbOf = (hex: string): [number, number, number] => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];
export const isNavy = (r: number, g: number, b: number): boolean => {
  const c = lch(r, g, b);
  return c.L < PALETTE.navy.maxL && c.C >= PALETTE.navy.minChroma && c.h >= PALETTE.navy.hue[0] && c.h <= PALETTE.navy.hue[1];
};
export const isCream = (r: number, g: number, b: number): boolean => {
  const c = lch(r, g, b);
  return c.L > PALETTE.cream.minL && c.B >= PALETTE.cream.b[0] && c.B <= PALETTE.cream.b[1];
};
export const AMBER = { hue: [45, 95], minChroma: 8 } as const;
export const isAmber = (hex: string): boolean => {
  const c = lch(...rgbOf(hex));
  return c.C >= AMBER.minChroma && c.h >= AMBER.hue[0] && c.h <= AMBER.hue[1];
};
/** Largest per-channel gap between two #rrggbb colours. */
export const channelGap = (a: string, b: string): number => {
  const x = rgbOf(a);
  const y = rgbOf(b);
  return Math.max(...x.map((v, i) => Math.abs(v - y[i])));
};
export const SAME_COLOUR = 8;

export const CONTRAST = { text: 7, cta: 4.5, chip: 4.5, pill: 4.5, link: 4.5 } as const;
export type TextRole = keyof typeof CONTRAST;
export const ROOTS = 'main, [role="dialog"]';
export const TAP_MIN = 44;
export const TRACK_PROBE = { selector: '.hub-day-track', hourCells: '.hub-day-hours-head > *', viewportH: 480, wheelPx: 240, minCutPx: 2 } as const;
export const ROWS = {
  row: '.hub-week-agenda-row',
  time: '.hub-week-agenda-time',
  title: '.hub-week-agenda-title',
  meta: '.hub-week-agenda-meta',
  pill: '.hub-schedule-pill',
  stackBelow: 1024,
  maxMetaLines: 2,
  alignPx: 1,
} as const;
export const PHONE_TABS = ['Today', 'Schedule', 'Jobs', 'More'] as const;
export const QUICK_BOOK_PHRASE = 'Leaking tap tomorrow 9am Dean';
export const WEEK = ['2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23', '2026-10-24', '2026-10-25'] as const;
export const TODAY = '2026-10-19';
export const EMPTY_COPY = /\b(nothing scheduled|no jobs|no bookings)\b/i;
export const JOB_REF = /^#\d{4}(\.\S+)?$/;
export const IN_PROGRESS = 'In progress';
export const UNTIMED = /^Booked (Mon|Tue|Wed|Thu|Fri|Sat|Sun) \d{1,2} (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) · Add a time/;
export const FOCUS = { labels: ['Week', 'Day', 'Previous week', 'Next week', 'Today'], on: 'Week', ringPx: 2, offsetPx: 2, minSides: 3, runPx: 8, maxTabs: 80 } as const;
export const NOW = { linePx: 2, barPx: 2, runPx: 8 } as const;
export const FADE = { widthPx: 24, tolPx: 1, startMax: 0.1, edgeGap: 8, endMax: 0.015, bandPx: 40, minAlpha: 0.015, probeInsetPx: 6 } as const;
export const SHEET = { scrim: { hex: '#0a0a0b', a: 0.4 }, safeAreaPx: 34, minGapPx: 16 } as const;
export const HOVERS: Readonly<Partial<Record<StateId, string>>> = {
  'more-1280': '.hub-schedule-crew-menu .hub-week-quiet',
  'day-1280': '.hub-day-resize',
  'week-1280': '.hub-week-board .hub-week-chip',
};

export type Box = { x: number; y: number; w: number; h: number };
export type PaletteCount = { shot: 'top' | 'scrolled'; framePx: number; scannedPx: number; navyPx: number; creamPx: number };
export type TextProbe = { text: string; role: TextRole; ratio: number; fg: string; bg: string; cls: string };
export type TapProbe = { label: string; tag: string; w: number; h: number; cls: string };
export type PartProbe = { left: number; top: number; width: number; lines: string[] };
export type RowProbe = { time: PartProbe; title: PartProbe; meta: PartProbe; pill: PartProbe | null; columnWidth: number; timeInk: string };
export type Stroke = { color: string; a: number; style: string; w: number };
export type ChipProbe = {
  board: 'week' | 'day';
  ref: string;
  refLines: number;
  refEllipsis: boolean;
  refFits: boolean;
  desc: { ellipsis: boolean; truncated: boolean; inside: boolean } | null;
  textNodes: number;
};
export type TrackerProbe = { days: { date: string; h: number }[]; crews: number; cells: number; hours: { head: number; lanes: number[] } | null };
export type DayBoardProbe = { hourLines: string[]; lanes: { bg: string; lockBg: string }[]; rail: Stroke | null; outline: Stroke | null };
export type SheetProbe = { scrim: { hex: string; a: number } | null; scrimCovers: boolean; bg: string; hairline: Stroke; shadows: number; cancel: Stroke | null };
export type Paint = { bg: string; bgA: number; shadow: string; color: string };
export type HoverProbe = { target: string; label: string; before: Paint; after: Paint };
export type FocusSide = { side: 'left' | 'right' | 'top' | 'bottom'; width: number; offset: number };
export type FocusProbe = { label: string; reached: boolean; fill: string; hit: { w: number; h: number }; sides: FocusSide[]; skipped: string[] };
export type FadeProbe = { found: boolean; alphas: number[]; endAlphas: number[]; hitThrough: boolean; hit: string };
export type NowProbe = { lines: number[]; dots: string[]; heads: { date: string; bar: number }[]; agenda: { date: string; ink: string }[]; animations: { reduce: number; motion: number } };
export type TrayState = { label: string; expanded: boolean; listShown: boolean; cards: number };
export type TrayProbe = { before: TrayState; after: TrayState };
export type Offender = { el: string; right: number; scroller: { classes: string[]; right: number } | null };
export type TrackProbe = {
  classes: string[];
  sw: number;
  cw: number;
  right: number;
  cutHourPx: { shown: number; hidden: number };
  wheelAt: string;
  wheelX: { trackLeft: number };
  wheelY: { deltaY: number; pageMoved: number; trackTop: number };
};
export type TrackShape = Pick<TrackProbe, 'classes' | 'sw' | 'cw' | 'right' | 'cutHourPx'>;
export type DomMeasure = {
  iw: number;
  docSW: number;
  bodySW: number;
  maxRight: number;
  maxEl: string;
  offenders: Offender[];
  texts: TextProbe[];
  taps: TapProbe[];
  rows: RowProbe[];
  chips: ChipProbe[];
  tracker: TrackerProbe;
  dayBoard: DayBoardProbe | null;
  sheet: SheetProbe | null;
  pageBg: string;
  docH: number;
  tabs: string[];
  menu: string[] | null;
  path: string;
  layout: LayoutProbe;
};
export type LedgerWrite = { table: string; op: string; filters: string[] };
export type LedgerRead = { table: string; columns: string; filters: string[] };
export type LayoutLane = { id: string; name: string; count: string };
export type LayoutCard = {
  id: string;
  ref: string;
  clock: string;
  line1: string;
  pill: string;
  lanes: string[];
  trackStored: boolean;
  trackLeft: number;
  trackWidth: number;
  rail: string;
};
export type LayoutProbe = {
  h1: string[];
  eyebrow: string;
  whisper: string;
  newJob: number;
  now: string | null;
  sections: { id: string; top: number }[];
  lanes: LayoutLane[];
  weekDays: string[];
  cells: number;
  weekendJobs: string | null;
  cards: LayoutCard[];
  agendaDays: { date: string; empty: boolean; h: number }[];
  trayHeading: string;
  traySub: string;
  trayCards: { meta: string; pill: string }[];
  allCrews: boolean;
  quickBook: boolean;
  pageError: string;
};
export type Measure = DomMeasure & {
  id: StateId;
  build: Build;
  palette: PaletteCount[];
  darkChangedPx: number;
  track: TrackProbe | null;
  hovers: HoverProbe[];
  focus: FocusProbe[];
  fade: FadeProbe | null;
  now: NowProbe | null;
  tray: TrayProbe | null;
  safeArea: { plain: number; inset: number } | null;
  blocked: string[];
  websockets: string[];
  writes: LedgerWrite[];
  reads: LedgerRead[];
  unmocked: string[];
  pageErrors: string[];
};

type MutantEdit =
  | { readonly file: 'src/index.css'; readonly rule?: string }
  | { readonly file: string; readonly rule?: never };

export type MutantSpec = MutantEdit & {
  readonly id: string;
  readonly kill: KillId;
  readonly find: string;
  readonly replace: string;
  readonly brief: string;
};

const DARK_RULE = '  @media (prefers-color-scheme: dark) { .hub-board-cal { background: #0A0A0B; } }\n';
const FAKE_SCROLLER = '  .hub-week-agenda { overflow-x: auto; }\n  .hub-week-agenda-list { min-width: 520px; }\n';
const HIDE_EMPTY = '  .hub-week-agenda-day:not(:has(.hub-week-agenda-row)),\n  .hub-week-cell.is-empty,\n  [data-crew-lane]:not(:has(.hub-week-chip)) [data-day-grid] > .border-r { display: none !important; }\n';
const NOW_PULSE = '  .hub-day-now-dot { animation: p2-now-pulse 1s infinite; }\n  @keyframes p2-now-pulse { 50% { opacity: 0.4; } }\n';
const FLAT_ZEBRA = '  .hub-week-document .hub-day-board .bg-zebra { background: var(--g-surface) !important; }\n';
const CSS_ANCHOR = '  .hub-week-agenda-meta-part {';
const css = (id: string, kill: MutantSpec['kill'], rule: string, find: string, replace: string, brief: string): MutantSpec =>
  ({ id, kill, file: 'src/index.css', rule, find, replace, brief });
const inject = (id: string, kill: MutantSpec['kill'], rule: string, brief: string): MutantSpec =>
  ({ id, kill, file: 'src/index.css', find: CSS_ANCHOR, replace: `${rule}${CSS_ANCHOR}`, brief });
const BOARD_VIEWS = 'src/components/crm/BoardViews.tsx';

export const MUTANTS: readonly MutantSpec[] = [
  { id: 'cream-page', kill: 'P2-palette', file: 'src/index.css', rule: '.hub-board-cal.is-week-doc.ops-page {', find: 'background: var(--g-bg);', replace: 'background: #F5F0E6;', brief: 'restore :6569 cream' },
  { id: 'navy-save', kill: 'P2-palette', file: 'src/index.css', rule: '.hub-schedule-job-sheet .btn-primary.hub-editor-sticky-save {', find: 'background: var(--g-inverse);', replace: 'background: #0A2540;', brief: 'restore :7810 navy Save' },
  { id: 'whisper-5b6b7c', kill: 'P2-contrast', file: 'src/index.css', rule: '.hub-schedule-eyebrow {', find: 'color: var(--g-ink-muted);', replace: 'color: #5B6B7C;', brief: 'restore #5B6B7C on the eyebrow' },
  { id: 'chip-ink-threshold', kill: 'P2-contrast', file: 'src/index.css', rule: '.hub-week-chip-ref {', find: 'color: var(--g-ink);', replace: 'color: #C8C8C8;', brief: 'low-contrast chip refs on white cards' },
  { id: 'quiet-24', kill: 'P2-taps', file: 'src/index.css', rule: '.hub-week-quiet {', find: 'min-height: 44px;', replace: 'min-height: 24px;', brief: 'min-height 24px at :6965' },
  { id: 'seg-32', kill: 'P2-taps', file: 'src/index.css', rule: '.hub-week-seg-btn {', find: 'min-height: 44px;', replace: 'min-height: 32px;', brief: 'min-height 32px at :6933' },
  { id: 'meta-normal', kill: 'P2-lines', file: BOARD_VIEWS, find: "{[suburb, scheduleCrewLabel(job.assigned_team, teamMembers)].filter(Boolean).join(' · ')}", replace: "{[suburb, scheduleCrewLabel(job.assigned_team, teamMembers)].filter(Boolean).join(' ')}", brief: 'agenda meta drops the dots' },
  { id: 'flex-2col', kill: 'P2-m2', file: 'src/index.css', rule: '.hub-week-agenda-row {', find: 'display: grid;', replace: 'display: flex;', brief: 'restore the flex 2-column row' },
  { id: 'unguarded-dark', kill: 'P2-dark', file: 'src/index.css', find: CSS_ANCHOR, replace: `${DARK_RULE}${CSS_ANCHOR}`, brief: 'an unguarded prefers-color-scheme rule' },
  { id: 'agenda-min-width', kill: 'P2-overflow', file: 'src/index.css', rule: '.hub-week-agenda-row {', find: 'width: 100%;', replace: 'width: 100%;\n    min-width: 420px;', brief: 'min-width on .hub-week-agenda-row' },
  { id: 'fake-scroller', kill: 'P2-overflow', file: 'src/index.css', find: CSS_ANCHOR, replace: `${FAKE_SCROLLER}${CSS_ANCHOR}`, brief: 'non-allowlisted element past innerWidth inside a fake overflow-x:auto wrapper' },
  { id: 'track-no-scroll', kill: 'P2-day-track', file: 'src/index.css', rule: '.hub-day-track {', find: 'overflow-x: auto;', replace: 'overflow-x: hidden;', brief: 'the day track stops scrolling sideways' },
  { id: 'track-trap', kill: 'P2-day-track', file: 'src/index.css', rule: '.hub-day-track {', find: 'overflow-y: hidden;', replace: 'overflow-y: auto;\n    max-height: 160px;\n    overscroll-behavior: contain;', brief: 'the day track traps vertical scroll' },
  { id: 'phone-tab-to', kill: 'P2-nav-phone', file: 'src/components/layout/appShellPhoneNav.ts', find: "{ id: 'schedule', label: NAV_WORDS.schedule, to: '/schedule' },", replace: "{ id: 'schedule', label: NAV_WORDS.schedule, to: '/jobs' },", brief: 'reorder in a copy of the tab config' },
  { id: 'field-order', kill: 'P2-nav-desktop', file: 'src/components/layout/AppShell.tsx', find: "    { to: '/schedule', label: NAV_WORDS.schedule, icon: Calendar },\n    { to: '/inspections', label: 'Inspections', icon: ClipboardList },", replace: "    { to: '/inspections', label: 'Inspections', icon: ClipboardList },\n    { to: '/schedule', label: NAV_WORDS.schedule, icon: Calendar },", brief: 'Inspections ahead of Schedule in a copy of the Field config' },
  { id: 'fetch-leak', kill: 'P2-mocks', file: BOARD_VIEWS, find: 'export const PhoneWeekList = memo(function PhoneWeekList({', replace: "void fetch('https://grafter.com.au/p2-leak');\nexport const PhoneWeekList = memo(function PhoneWeekList({", brief: 'a live request from the Schedule bundle' },
  inject('empty-days-hidden', 'P2-tracker', HIDE_EMPTY, 'empty agenda days, week cells and lane hours stop drawing'),
  { id: 'chip-ref-clock', kill: 'P2-chip', file: BOARD_VIEWS, find: '<span className="hub-week-chip-clock">{clock}</span>\n        {\' · \'}\n        <span className="hub-week-chip-ref">{chip.ref}</span>', replace: '<span className="hub-week-chip-clock">{clock}</span>\n        {\' · \'}\n        <span className="hub-week-chip-ref">{`${clock} · ${chip.ref}`}</span>', brief: 'the week chip ref carries the clock' },
  css('ring-offset-0', 'P2-focus', '.hub-week-seg-btn:focus-visible,', 'outline-offset: 2px;', 'outline-offset: 0;', 'focus ring offset 0'),
  css('ring-none', 'P2-focus', '.hub-week-seg-btn:focus-visible,', 'outline: 2px solid var(--g-accent);', 'outline: none;', 'no focus ring'),
  css('seg-on-unfilled', 'P2-focus', '.hub-week-seg-btn.is-on {', 'background: var(--g-inverse);', 'background: none;', 'the on seg loses its inverse fill'),
  css('now-1px', 'P2-now', '.hub-day-now {', '    width: 2px;', '    width: 1px;', 'a 1px now-line'),
  inject('now-pulse', 'P2-now', NOW_PULSE, 'the now dot pulses'),
  { id: 'today-unmarked', kill: 'P2-now', file: BOARD_VIEWS, find: '{today ? <span className="hub-week-now">Now {scheduleNowMark(now)}</span> : null}', replace: '{today ? null : null}', brief: 'the Today column drops the Now label' },
  css('hour-lines-cream', 'P2-day-board', '.hub-week-document .hub-day-board .border-rule {', 'border-color: var(--g-line);', 'border-color: #E2D9CC;', 'cream hour rules'),
  inject('zebra-flat', 'P2-day-board', FLAT_ZEBRA, 'every lane flat surface'),
  { id: 'unassigned-navy', kill: 'P2-day-board', file: BOARD_VIEWS, find: "borderLeft: painted.isUnassigned ? '3px dashed var(--g-line-strong)'", replace: "borderLeft: painted.isUnassigned ? '3px dashed #0A2540'", brief: 'a navy unassigned rail' },
  css('resize-hover-none', 'P2-day-board', '.hub-board-cal .hub-day-resize:hover {', 'background: color-mix(in srgb, var(--g-accent) 16%, transparent);', 'background: transparent;', 'no resize hover paint'),
  css('fade-pointer', 'P2-scroller', '.hub-week-document .hub-day-board::after {', 'pointer-events: none;', 'pointer-events: auto;', 'the fade swallows clicks'),
  css('fade-at-end', 'P2-scroller', '.hub-week-document .hub-day-board.is-track-end::after {', 'opacity: 0;\n      background: none;', 'opacity: 1;\n      background: linear-gradient(to right, transparent, var(--g-surface));', 'the fade stays at the track end'),
  css('scrim-bg', 'P2-sheet', '.overlay-backdrop:has(.hub-schedule-job-sheet) {', 'background: rgba(10, 10, 11, 0.4) !important;', 'background: var(--g-bg) !important;', 'an opaque bg scrim'),
  css('footer-no-safe-area', 'P2-sheet', '.hub-schedule-job-sheet .hub-editor-sticky-footer {', 'padding: 12px 16px max(16px, env(safe-area-inset-bottom));', 'padding: 12px 16px 16px;', 'the footer ignores the safe area'),
  { id: 'tray-noop', kill: 'P2-tray', file: BOARD_VIEWS, find: 'setExpanded(open => !open);', replace: 'setExpanded(open => open);', brief: 'the tray chip toggle does nothing' },
  css('agenda-time-ink', 'P2-m2', '.hub-week-agenda-time {', 'color: var(--g-ink-muted);', 'color: var(--g-ink);', 'the agenda time line in full ink'),
  css('pill-amber', 'P2-status', '.hub-schedule-pill[data-kind="scheduled"] {', 'background: var(--g-sched-bg);', 'background: var(--g-warn-bg);', 'amber scheduled pills'),
  { id: 'hide-header', kill: 'K1', file: 'src/index.css', rule: '.hub-board-cal .ops-page-head {', find: 'max-width: 1400px;', replace: 'display: none;\n    max-width: 1400px;', brief: 'hide the live header (restore F1)' },
  { id: 'need-crew-all', kill: 'K1', file: 'src/lib/scheduleNeedCrew.ts', find: 'if (asTeamIds(job.assigned_team).length > 0) return false;', replace: 'if (false && asTeamIds(job.assigned_team).length > 0) return false;', brief: 'count crewed jobs as need-crew' },
  { id: 'next-backwards', kill: 'K2', file: 'src/pages/SchedulePage.tsx', find: 'addWeeks(currentDate, 1)', replace: 'addWeeks(currentDate, -1)', brief: 'next week walks backwards' },
  { id: 'skip-empty-cells', kill: 'K3', file: 'src/lib/scheduleBoard.ts', find: 'cells: days.map(date => {', replace: 'cells: days.filter(date => jobsForCrewOnDay(visible, crew.id, date).length > 0).map(date => {', brief: 'skip cells with no jobs' },
  { id: 'count-days', kill: 'K4', file: 'src/lib/scheduleBoard.ts', find: "return count === 1 ? '1 job' : `${count} jobs`;", replace: "return count === 1 ? '1 booking' : `${count} bookings`;", brief: 'lane counts say bookings' },
  { id: 'ref-ellipsis', kill: 'K5', file: 'src/index.css', rule: '.hub-week-chip-ref {', find: 'overflow: visible;', replace: 'overflow: hidden;\n    max-width: 4ch;\n    text-overflow: ellipsis;', brief: 'ellipsis on the ref span' },
  { id: 'first-crew-only', kill: 'K5', file: 'src/lib/scheduleBoard.ts', find: 'return team.includes(crewId);', replace: 'return team[0] === crewId;', brief: 'jobOnCrewRow checks only team[0]' },
  { id: 'invoice-no-void', kill: 'K6', file: 'src/pages/SchedulePage.tsx', find: ".neq('status', 'void');", replace: ';', brief: 'drop status <> void' },
  { id: 'invoice-no-company', kill: 'K6', file: 'src/pages/SchedulePage.tsx', find: ".eq('company_id', profile!.company_id)", replace: '', brief: 'drop the company_id filter' },
  { id: 'track-14h', kill: 'K7', file: 'src/lib/scheduleBoard.ts', find: 'const span = DAY_HOUR_COUNT * 60;', replace: 'const span = 14 * 60;', brief: 'divide the day by 14h' },
  { id: 'now-12h', kill: 'K8', file: 'src/lib/scheduleBoard.ts', find: "return format(now, 'HH:mm');", replace: "return format(now, 'hh:mm');", brief: 'format Now as 12-hour hh:mm' },
  { id: 'drop-keeps-date', kill: 'K9', file: BOARD_VIEWS, find: 'onDrop={e => handleDrop(e, cell.date, row.crewId)}', replace: 'onDrop={e => e.preventDefault()}', brief: 'drop handler writes nothing' },
  { id: 'hide-empty-hours', kill: 'K10', file: BOARD_VIEWS, find: '<div className="hub-day-hours-head flex border-b border-rule">\n            {hours.map(h => (', replace: '<div className="hub-day-hours-head flex border-b border-rule">\n            {hours.filter(h => paintedRows.some(p => p.rowJobs.some(j => (j.start_time ?? "").startsWith(String(h).padStart(2, "0"))))).map(h => (', brief: 'hide hours with no jobs' },
  { id: 'track-overflow-hidden', kill: 'K10', file: 'src/index.css', rule: '.hub-day-track {', find: 'overflow-x: auto;', replace: 'overflow-x: hidden;', brief: 'the day track stops scrolling sideways' },
  { id: 'fade-auto-k10', kill: 'K10', file: BOARD_VIEWS, find: '{!phone && onJobResize && plot.stored ? (', replace: '{false && !phone && onJobResize && plot.stored ? (', brief: 'resize handles never mount' },
  { id: 'tray-slice', kill: 'K11', file: BOARD_VIEWS, find: 'function UnscheduledJobCards({\n  jobs, teamMembers, onJobClick, onDragStart, selectedId = null, onOpenJob, onSetScheduleDate,\n  invoicedJobIds = NO_INVOICED,\n}: UnscheduledRailProps) {\n  return (\n    <>\n      {jobs.map(job => {', replace: 'function UnscheduledJobCards({\n  jobs, teamMembers, onJobClick, onDragStart, selectedId = null, onOpenJob, onSetScheduleDate,\n  invoicedJobIds = NO_INVOICED,\n}: UnscheduledRailProps) {\n  return (\n    <>\n      {jobs.slice(0, 2).map(job => {', brief: 'needsDate.slice(0,2)' },
  { id: 'hide-empty-agenda', kill: 'K12', file: BOARD_VIEWS, find: '{days.map(day => {\n        const date = parseISO(`${day.date}T00:00:00`);', replace: '{days.filter(day => day.jobs.length > 0).map(day => {\n        const date = parseISO(`${day.date}T00:00:00`);', brief: 'filter out zero-job days' },
  { id: 'quickbook-desk-only', kill: 'K13', file: 'src/index.css', rule: '.hub-week-quiet.hub-schedule-quickbook-toggle {', find: 'display: none;', replace: 'display: none !important;', brief: 'hide the phone Quick book toggle' },
  { id: 'drop-today', kill: 'K14', file: 'src/pages/SchedulePage.tsx', find: '<button type="button" className="hub-week-quiet" onClick={() => applySchedule(viewMode, new Date())}>\n          Today\n        </button>', replace: '', brief: 'delete Today from the tools row' },
  { id: 'invoice-paid-at', kill: 'K15', file: 'src/pages/SchedulePage.tsx', find: ".select('id, job_id, status')", replace: ".select('id, job_id, status, paid_at')", brief: 'add invoices.paid_at to Q-S1' },
  { id: 'swap-tray-board', kill: 'K17', file: 'src/pages/SchedulePage.tsx', find: '<div data-schedule-section="board">', replace: '<div data-schedule-section="tray">', brief: 'label the board section as tray' },
  { id: 'hardcode-count', kill: 'K18', file: 'src/lib/scheduleBoard.ts', find: '`${parts.onBoard} on the board`', replace: '`14 on the board`', brief: 'hardcode a fallback board count' },
];

export const SCOPE = {
  forbidden: [
    'src/components/layout/AppShell.tsx',
    'src/components/layout/appShellPhoneNav.ts',
    'src/components/layout/appShellNavLabels.kill.test.tsx',
    'src/components/layout/appShellNavOrder.test.ts',
    'src/components/layout/appShellPhoneNav.test.ts',
    'src/components/layout/p1Dashboard.chromium.entry.tsx',
    'src/components/layout/p1Dashboard.chromium.kill.tsx',
    'src/components/layout/s2Shell.chromium.mocks.ts',
    'src/pages/DashboardPage.tsx',
    'src/pages/RemindersLook.test.ts',
    'src/pages/dashboardLaptopLook.test.ts',
    'src/pages/dashboardPage.test.ts',
    'src/pages/sheetWidthLaptopLook.test.ts',
    'src/widgets/IntelligenceWidgets.tsx',
    'src/widgets/WidgetComponents.tsx',
    'src/lib/brand.ts',
    'supabase/functions/_shared/brand.ts',
    'src/pr378TemplateGuard.test.tsx',
    'vitest.s2-shell.config.ts',
    'scripts/capture-p1-dashboard-look.mjs',
  ],
  forbiddenDirs: ['docs/look/p1/'],
  cssFile: 'src/index.css',
  cssBaseRanges: [[6088, 8600]],
  exactLine: { file: 'src/pages/SchedulePage.tsx', line: 221, text: "  const lookParam = searchParams.get('look');" },
  lookParamText: "  const lookParam = searchParams.get('look');",
  tscMax: 180,
  mustStayGreen: ['src/pages/schedulePage.test.ts', 'src/pages/scheduleDesktop1280.test.ts'],
} as const;

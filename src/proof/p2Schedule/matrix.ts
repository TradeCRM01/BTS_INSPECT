// Pure data shared by the browser probes, the kill file, the harness and scripts/p2-schedule.mjs.
// No runtime imports and erasable syntax only, so Node type stripping can load it from the script.

export const BASE_SHA = '7e5394dfedf263abdc835f89c8bdb9c70e4449b3';
export const FROZEN_NOW = '2026-10-23T15:40:00+10:00';
export const TIMEZONE = 'Australia/Brisbane';
export const BEFORE_DIR = '/tmp/p2-proofs/before';
export const BASELINE_VITEST_LOG = '/tmp/p2-baseline/vitest-built.log';

export const WIDTHS = [375, 390, 768, 1024, 1280] as const;
export type Width = (typeof WIDTHS)[number];
export const PHONE_BOARD_BREAKPOINT = 1024;
export const viewportHeight = (w: Width): number => (w < 768 ? 812 : 900);
export const isTouch = (w: Width): boolean => w < 1024;

export type View = 'week' | 'day';
export type Recipe = 'none' | 'lineprobe' | 'tray' | 'rail' | 'sheet' | 'prefill' | 'more' | 'save' | 'tab' | 'field';
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
  | 'P2-tracker' | 'P2-chip' | 'P2-focus' | 'P2-now' | 'P2-day-board' | 'P2-scroller' | 'P2-sheet' | 'P2-tray' | 'P2-status';

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
  'P2-nav-desktop': { title: 'Schedule is first in Field at 768 and up, expected red until #398', states: ['nav-768', 'nav-1280'] },
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
};
export const killTitle = (id: KillId): string => `${id}: ${KILLS[id].title}`;

export const PALETTE = {
  navy: { maxL: 35, hue: [235, 285], minChroma: 12 },
  cream: { minL: 88, b: [2.5, 12] },
  minScannedShare: 0.5,
  // Data colour and brand marks, from main's markup: job chips, crew dot, crew rail, photo or avatar, logo.
  masks: [
    { sel: '.hub-week-chip', part: 'box' },
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
  pill: '.hub-jobs-phone-status',
  stackBelow: 640,
  maxMetaLines: 2,
  alignPx: 1,
} as const;
export const PHONE_TABS = ['Today', 'Schedule', 'Jobs', 'More'] as const;
export const QUICK_BOOK_PHRASE = 'Hours test Friday 9am Grafter';
export const WEEK = ['2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23', '2026-10-24', '2026-10-25'] as const;
export const TODAY = '2026-10-23';
export const EMPTY_COPY = /\b(nothing booked|nothing scheduled|no jobs|no bookings)\b/i;
export const JOB_REF = /^#\d{4}(\.\S+)?$/;
export const IN_PROGRESS = 'In Progress';
export const UNTIMED = /^Booked (Mon|Tue|Wed|Thu|Fri|Sat|Sun) \d{1,2} (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) · Add a time$/;
export const FOCUS = { labels: ['Week', 'Day', 'Today', 'Previous week', 'Next week'], on: 'Week', ringPx: 2, offsetPx: 2, minSides: 3, runPx: 8, maxTabs: 80 } as const;
export const NOW = { linePx: 2, barPx: 2, runPx: 8 } as const;
export const FADE = { widthPx: 24, tolPx: 1, startMax: 0.1, edgeGap: 8, endMax: 0.015, bandPx: 40, minAlpha: 0.015, probeInsetPx: 6 } as const;
export const SHEET = { scrim: { hex: '#0a0a0b', a: 0.4 }, safeAreaPx: 34, minGapPx: 16 } as const;
export const HOVERS: Readonly<Partial<Record<StateId, string>>> = {
  'more-1280': '.hub-week-crew-opt',
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
};
export type LedgerWrite = { table: string; op: string; filters: string[] };
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
  unmocked: string[];
  pageErrors: string[];
};

type MutantEdit =
  | { readonly file: 'src/index.css'; readonly rule?: string }
  | { readonly file: string; readonly rule?: never };

export type MutantSpec = MutantEdit & {
  readonly id: string;
  readonly kill: Exclude<KillId, 'P2-nav-desktop'>;
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
  { id: 'whisper-5b6b7c', kill: 'P2-contrast', file: 'src/index.css', rule: '.hub-week-status-whisper {', find: 'color: var(--g-ink-muted);', replace: 'color: #5B6B7C;', brief: 'restore #5B6B7C at :6812' },
  { id: 'chip-ink-threshold', kill: 'P2-contrast', file: 'src/lib/jobColors.ts', find: "return inkContrast >= whiteContrast ? '#0A0A0B' : '#FFFFFF';", replace: "return (0.299 * parseInt(hex.slice(1, 3), 16) + 0.587 * parseInt(hex.slice(3, 5), 16) + 0.114 * parseInt(hex.slice(5, 7), 16)) / 255 > 0.55 ? '#1A1A1A' : '#FFFFFF';", brief: 'restore the getReadableText threshold' },
  { id: 'quiet-24', kill: 'P2-taps', file: 'src/index.css', rule: '.hub-week-quiet {', find: 'min-height: 44px;', replace: 'min-height: 24px;', brief: 'min-height 24px at :6965' },
  { id: 'seg-32', kill: 'P2-taps', file: 'src/index.css', rule: '.hub-week-seg-btn {', find: 'min-height: 44px;', replace: 'min-height: 32px;', brief: 'min-height 32px at :6933' },
  { id: 'meta-normal', kill: 'P2-lines', file: 'src/index.css', rule: '.hub-week-agenda-meta-part {', find: 'white-space: nowrap;', replace: 'white-space: normal;', brief: 'meta white-space normal' },
  { id: 'flex-2col', kill: 'P2-m2', file: 'src/index.css', rule: '.hub-week-agenda-row {', find: 'display: grid;', replace: 'display: flex;', brief: 'restore the flex 2-column row' },
  { id: 'unguarded-dark', kill: 'P2-dark', file: 'src/index.css', find: CSS_ANCHOR, replace: `${DARK_RULE}${CSS_ANCHOR}`, brief: 'an unguarded prefers-color-scheme rule' },
  { id: 'agenda-min-width', kill: 'P2-overflow', file: 'src/index.css', rule: '.hub-week-agenda-row {', find: 'width: 100%;', replace: 'width: 100%;\n    min-width: 420px;', brief: 'min-width on .hub-week-agenda-row' },
  { id: 'fake-scroller', kill: 'P2-overflow', file: 'src/index.css', find: CSS_ANCHOR, replace: `${FAKE_SCROLLER}${CSS_ANCHOR}`, brief: 'non-allowlisted element past innerWidth inside a fake overflow-x:auto wrapper' },
  { id: 'track-no-scroll', kill: 'P2-day-track', file: 'src/index.css', rule: '.hub-day-track {', find: 'overflow-x: auto;', replace: 'overflow-x: hidden;', brief: 'the day track stops scrolling sideways' },
  { id: 'track-trap', kill: 'P2-day-track', file: 'src/index.css', rule: '.hub-day-track {', find: 'overflow-y: hidden;', replace: 'overflow-y: auto;\n    max-height: 160px;\n    overscroll-behavior: contain;', brief: 'the day track traps vertical scroll' },
  { id: 'phone-tab-to', kill: 'P2-nav-phone', file: 'src/components/layout/appShellPhoneNav.ts', find: "{ id: 'schedule', label: 'Schedule', to: '/schedule' },", replace: "{ id: 'schedule', label: 'Schedule', to: '/jobs' },", brief: 'reorder in a copy of the tab config' },
  { id: 'fetch-leak', kill: 'P2-mocks', file: BOARD_VIEWS, find: 'export const PhoneWeekList = memo(function PhoneWeekList({', replace: "void fetch('https://grafter.com.au/p2-leak');\nexport const PhoneWeekList = memo(function PhoneWeekList({", brief: 'a live request from the Schedule bundle' },
  inject('empty-days-hidden', 'P2-tracker', HIDE_EMPTY, 'empty agenda days, week cells and lane hours stop drawing'),
  { id: 'chip-ref-clock', kill: 'P2-chip', file: BOARD_VIEWS, find: '<span className="hub-week-chip-ref">{chip.ref}</span>', replace: '<span className="hub-week-chip-ref">{`${clock} · ${chip.ref}`}</span>', brief: 'the week chip ref carries the clock' },
  css('ring-offset-0', 'P2-focus', '.hub-week-seg-btn:focus-visible,', 'outline-offset: 2px;', 'outline-offset: 0;', 'focus ring offset 0'),
  css('ring-none', 'P2-focus', '.hub-week-seg-btn:focus-visible,', 'outline: 2px solid var(--g-accent);', 'outline: none;', 'no focus ring'),
  css('seg-on-unfilled', 'P2-focus', '.hub-week-seg-btn.is-on {', 'background: var(--g-inverse);', 'background: none;', 'the on seg loses its inverse fill'),
  css('now-1px', 'P2-now', '.hub-day-now-line {', 'width: 2px;', 'width: 1px;', 'a 1px now-line'),
  inject('now-pulse', 'P2-now', NOW_PULSE, 'the now dot pulses'),
  css('today-unmarked', 'P2-now', '.hub-week-head.is-today {', 'box-shadow: inset 0 -2px 0 var(--g-accent);', 'box-shadow: none;', 'the Today head loses its accent bar'),
  css('hour-lines-cream', 'P2-day-board', '.hub-week-document .hub-day-board .border-rule {', 'border-color: var(--g-line);', 'border-color: #E2D9CC;', 'cream hour rules'),
  inject('zebra-flat', 'P2-day-board', FLAT_ZEBRA, 'every lane flat surface'),
  { id: 'unassigned-navy', kill: 'P2-day-board', file: BOARD_VIEWS, find: "borderLeft: painted.isUnassigned ? '3px dashed var(--g-line-strong)'", replace: "borderLeft: painted.isUnassigned ? '3px dashed #0A2540'", brief: 'a navy unassigned rail' },
  css('resize-hover-none', 'P2-day-board', '.hub-board-cal .hub-day-resize:hover {', 'background: color-mix(in srgb, var(--g-accent) 16%, transparent);', 'background: transparent;', 'no resize hover paint'),
  css('fade-pointer', 'P2-scroller', '.hub-week-document .hub-day-board::after {', 'pointer-events: none;', 'pointer-events: auto;', 'the fade swallows clicks'),
  css('fade-at-end', 'P2-scroller', '.hub-week-document .hub-day-board.is-track-end::after {', 'opacity: 0;', 'opacity: 1;', 'the fade stays at the track end'),
  css('scrim-bg', 'P2-sheet', '.overlay-backdrop:has(.hub-schedule-job-sheet) {', 'background: rgba(10, 10, 11, 0.4) !important;', 'background: var(--g-bg) !important;', 'an opaque bg scrim'),
  css('footer-no-safe-area', 'P2-sheet', '.hub-schedule-job-sheet .hub-editor-sticky-footer {', 'padding: 12px 16px max(16px, env(safe-area-inset-bottom));', 'padding: 12px 16px 16px;', 'the footer ignores the safe area'),
  { id: 'tray-noop', kill: 'P2-tray', file: BOARD_VIEWS, find: 'setExpanded(open => !open);', replace: 'setExpanded(open => open);', brief: 'the tray chip toggle does nothing' },
  css('agenda-time-ink', 'P2-m2', '.hub-week-agenda-time {', 'color: var(--g-ink-muted);', 'color: var(--g-ink);', 'the agenda time line in full ink'),
  css('pill-amber', 'P2-status', '.hub-week-agenda .hub-jobs-phone-status {', 'background: var(--g-well);', 'background: var(--g-warn-bg);', 'amber agenda pills'),
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
    'src/pages/SchedulePage.tsx',
  ],
  forbiddenDirs: ['docs/look/p1/'],
  cssFile: 'src/index.css',
  cssBaseRanges: [[6088, 8286], [8975, 8975]],
  exactLine: { file: 'src/pages/SchedulePage.tsx', line: 390, text: "  const lookParam = searchParams.get('look');" },
  tscMax: 180,
  mustStayGreen: ['src/pages/schedulePage.test.ts', 'src/pages/scheduleDesktop1280.test.ts'],
} as const;

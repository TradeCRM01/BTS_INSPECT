import { useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SchedulePage } from '../../pages/SchedulePage';
import { AppShell } from '../../components/layout/AppShell';
import { ToastProvider } from '../../components/ui/Toast';
import { ledger } from './mocks.ts';
import {
  FADE, PALETTE, ROOTS, ROWS, TAP_MIN, TRACK_PROBE, isCream, isNavy,
  type Box, type ChipProbe, type ClockProbe, type ClipProbe, type DayBoardProbe, type DomMeasure, type MaskPart, type Offender, type PaletteCount, type Paint,
  type ChromeProbe, type DayTrackInfo, type LayoutProbe, type OverflowSkip, type PartProbe, type ReachBox, type ReachProbe, type RowProbe, type SheetProbe, type Stroke, type TapProbe, type TextProbe, type TextRole, type TrackLabel,
  type TrackShape, type TrackerProbe, type TrayState,
} from './matrix.ts';
import { FOCUS } from './matrix.ts';

type Rgba = { r: number; g: number; b: number; a: number };
type ScrollState = { mainTop: number; docTop: number; trackTop: number; trackLeft: number; roomDown: number; roomUp: number };
type WheelPoint = { x: number; y: number; hit: string };
type Point = { x: number; y: number };
export type Run = Point & { dx: number; dy: number; n: number; bg?: string };
export type Mark = { label: string; box: Box; hit: { w: number; h: number } };
export type FadeGeometry = { right: number; top: number; bottom: number; laneY: number };
export type NowPoints = {
  lines: Run[];
  dots: Point[];
  heads: (Run & { date: string })[];
  agenda: { date: string; ink: string }[];
};

export type P2Probe = {
  ready(): Promise<void>;
  settleForWalk(): Promise<void>;
  masks(): Box[];
  scrollPage(): number;
  restoreScroll(): void;
  measureDom(): DomMeasure;
  trackShape(): TrackShape | null;
  prepTrack(): WheelPoint | null;
  scrollState(): ScrollState;
  resetTrack(): void;
  palette(png: string, masks: Box[], shot: PaletteCount['shot']): Promise<PaletteCount>;
  changedPx(a: string, b: string): Promise<number>;
  runs(png: string, base: string | null, list: Run[], ink: string): Promise<(number[] | null)[]>;
  pixels(png: string, points: Point[]): Promise<string[]>;
  paintOf(el: Element): Paint;
  chromePaint(png: string, chrome: ChromeProbe): Promise<ChromeProbe>;
  tray(): TrayState;
  nowPrep(): void;
  nowPoints(): NowPoints;
  nowAnimations(): number;
  focusMark(): Mark[];
  focusRing(shown: boolean): void;
  showEmptyDay(): string;
  chipCrop(): { x: number; y: number; width: number; height: number } | null;
  fadeFind(): FadeGeometry | null;
  trackTo(where: 'middle' | 'end'): void;
  fadePattern(on: boolean): void;
  fadeAlphas(png: string, g: FadeGeometry, surface: string): Promise<number[]>;
  fadeHit(g: FadeGeometry): { hitThrough: boolean; hit: string };
  saveGap(): number;
  ledger(): typeof ledger;
  path(): string;
};

declare global {
  interface Window { __P2_BOOT__: { path: string; empty?: boolean; jobsError?: boolean; needCrewPair?: boolean; malformedCrew?: boolean; statusRules?: boolean; boardCap?: number; undatedCap?: number }; __p2: P2Probe }
}

const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
let currentPath = '';

function PathProbe() {
  const location = useLocation();
  useEffect(() => {
    currentPath = location.pathname;
  }, [location.pathname]);
  return null;
}

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('p2 harness missing #root');
createRoot(rootEl).render(
  <QueryClientProvider client={client}>
    <ToastProvider>
      <MemoryRouter initialEntries={[window.__P2_BOOT__.path]}>
        <PathProbe />
        <Routes>
          <Route path="/schedule" element={<SchedulePage />} />
          <Route path="*" element={<AppShell><div data-p2-home="1" /></AppShell>} />
        </Routes>
      </MemoryRouter>
    </ToastProvider>
  </QueryClientProvider>,
);

const sleep = (ms: number) => new Promise<void>(resolve => { window.setTimeout(resolve, ms); });
const frame = () => new Promise<void>(resolve => { requestAnimationFrame(() => resolve()); });

const swatch = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
const colorCache = new Map<string, Rgba>();
function rgba(css: string): Rgba {
  const hit = colorCache.get(css);
  if (hit) return hit;
  let out: Rgba;
  const rgb = css.match(/^rgba?\(([^)]+)\)$/);
  const srgb = css.match(/^color\(srgb ([^)]+)\)$/);
  if (rgb) {
    const p = rgb[1].split(/[\s,/]+/).filter(Boolean).map(Number);
    out = { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
  } else if (srgb) {
    const p = srgb[1].split(/[\s/]+/).filter(Boolean).map(Number);
    out = { r: p[0] * 255, g: p[1] * 255, b: p[2] * 255, a: p.length > 3 ? p[3] : 1 };
  } else if (swatch) {
    swatch.clearRect(0, 0, 1, 1);
    swatch.fillStyle = css;
    swatch.fillRect(0, 0, 1, 1);
    const d = swatch.getImageData(0, 0, 1, 1).data;
    out = { r: d[0], g: d[1], b: d[2], a: d[3] / 255 };
  } else {
    out = { r: 0, g: 0, b: 0, a: 0 };
  }
  colorCache.set(css, out);
  return out;
}

const over = (top: Rgba, bottom: Rgba): Rgba => ({
  r: top.r * top.a + bottom.r * (1 - top.a),
  g: top.g * top.a + bottom.g * (1 - top.a),
  b: top.b * top.a + bottom.b * (1 - top.a),
  a: 1,
});
const WHITE: Rgba = { r: 255, g: 255, b: 255, a: 1 };
const hex = (c: Rgba) => `#${[c.r, c.g, c.b].map(v => Math.round(v).toString(16).padStart(2, '0')).join('')}`;

function luminance(c: Rgba): number {
  const f = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
}
const contrast = (a: Rgba, b: Rgba) => {
  const x = luminance(a);
  const y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
};

function usedBg(el: Element | null): Rgba {
  const stack: Rgba[] = [];
  for (let node = el; node; node = node.parentElement) {
    const c = rgba(getComputedStyle(node).backgroundColor);
    if (c.a > 0) {
      stack.push(c);
      if (c.a >= 1) break;
    }
  }
  let out = WHITE;
  while (stack.length) out = over(stack.pop()!, out);
  return out;
}

function opacityChain(el: Element | null): number {
  let o = 1;
  for (let node = el; node; node = node.parentElement) o *= Number(getComputedStyle(node).opacity);
  return o;
}

function visible(el: Element): boolean {
  const r = el.getBoundingClientRect();
  if (r.width <= 1 || r.height <= 1) return false;
  const s = getComputedStyle(el);
  return s.visibility !== 'hidden' && s.display !== 'none' && opacityChain(el) > 0;
}

function inkOf(el: Element): Rgba {
  const raw = rgba(getComputedStyle(el).color);
  return over({ ...raw, a: raw.a * opacityChain(el) }, usedBg(el));
}
const round = (v: number, p = 10) => Math.round(v * p) / p;
const paintHex = (css: string) => {
  const c = rgba(css);
  return c.a < 1 ? `${hex(c)}/${round(c.a, 100)}` : hex(c);
};
const stroke = (color: string, style: string, width: string): Stroke => {
  const c = rgba(color);
  return { color: hex(c), a: round(c.a, 100), style, w: parseFloat(width) || 0 };
};
const layers = (shadow: string) => (shadow === 'none' ? 0 : shadow.split(/,(?![^(]*\))/).length);
const label = (el: Element) => (el.getAttribute('aria-label') || el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 40);
const within = (a: { left: number; top: number; right: number; bottom: number }, b: { left: number; top: number; right: number; bottom: number }) =>
  a.left >= b.left - 0.5 && a.top >= b.top - 0.5 && a.right <= b.right + 0.5 && a.bottom <= b.bottom + 0.5;

const describe = (el: Element) => {
  const cls = typeof el.className === 'string' ? el.className.trim().split(/\s+/).filter(Boolean).slice(0, 4).join('.') : '';
  return cls ? `${el.tagName.toLowerCase()}.${cls}` : el.tagName.toLowerCase();
};
const classesOf = (el: Element) => (typeof el.className === 'string' ? el.className.trim().split(/\s+/).filter(Boolean) : []);
const roots = () => {
  const modal = [...document.querySelectorAll('[role="dialog"][aria-modal="true"]')].filter(visible);
  return modal.length ? modal : [...document.querySelectorAll(ROOTS)];
};
const OVERLAY = '.overlay-backdrop, [role="dialog"], .hub-week-more-menu, details[open]';
const main = () => document.querySelector('main');

function textRole(el: Element): TextRole {
  if (el.closest('.hub-week-chip')) return 'chip';
  if (el.closest(`${ROWS.pill}, .ops-status`)) return 'pill';
  const ctl = el.closest('button, a[href], summary, [role="button"]');
  if (ctl) {
    const own = rgba(getComputedStyle(ctl).backgroundColor);
    const behind = usedBg(ctl.parentElement);
    if (own.a >= 1 && hex(own) !== hex(behind)) return 'cta';
    if (ctl.tagName === 'A') return 'link';
  }
  return 'text';
}

function texts(): TextProbe[] {
  const out: TextProbe[] = [];
  const seen = new Set<Node>();
  const range = document.createRange();
  for (const root of roots()) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const text = (node.textContent ?? '').replace(/\s+/g, ' ').trim();
      const el = node.parentElement;
      if (!text || !el || seen.has(node)) continue;
      seen.add(node);
      if (el.closest('[disabled], [aria-disabled="true"], svg')) continue;
      range.selectNodeContents(node);
      const box = range.getBoundingClientRect();
      if (box.width <= 1 || box.height <= 1 || !visible(el)) continue;
      const bg = usedBg(el);
      const fg = inkOf(el);
      out.push({
        text: text.slice(0, 48),
        role: textRole(el),
        ratio: Math.round(contrast(fg, bg) * 100) / 100,
        fg: hex(fg),
        bg: hex(bg),
        cls: describe(el),
      });
    }
  }
  return out;
}

const TAP_TARGETS = 'a[href], button, summary, input:not([type="hidden"]), select, textarea, [role="button"], [role="separator"], [role="tab"], [tabindex]:not([tabindex="-1"])';

type Saved = { el: Element; top: number; left: number }[];
function saveScroll(): Saved {
  const out: Saved = [{ el: document.scrollingElement ?? document.documentElement, top: 0, left: 0 }];
  for (const el of document.querySelectorAll('*')) {
    if (el.scrollTop || el.scrollLeft) out.push({ el, top: el.scrollTop, left: el.scrollLeft });
  }
  out[0].top = out[0].el.scrollTop;
  out[0].left = out[0].el.scrollLeft;
  return out;
}
function restore(saved: Saved) {
  for (const el of document.querySelectorAll('*')) {
    if (el.scrollTop || el.scrollLeft) {
      el.scrollTop = 0;
      el.scrollLeft = 0;
    }
  }
  for (const s of saved) {
    s.el.scrollTop = s.top;
    s.el.scrollLeft = s.left;
  }
}

function taps(): TapProbe[] {
  const saved = saveScroll();
  const out: TapProbe[] = [];
  const targets = new Set<Element>();
  for (const root of roots()) for (const el of root.querySelectorAll(TAP_TARGETS)) targets.add(el);
  for (const el of targets) {
    if (!visible(el) || el.closest('details:not([open]) > :not(summary)')) continue;
    el.scrollIntoView({ block: 'center', inline: 'center' });
    const r = el.getBoundingClientRect();
    const coveredByOpenLayer = [...document.querySelectorAll(OVERLAY)].some(layer => {
      if (!visible(layer) || layer.contains(el)) return false;
      const x = layer.getBoundingClientRect();
      return Math.min(r.right, x.right) > Math.max(r.left, x.left)
        && Math.min(r.bottom, x.bottom) > Math.max(r.top, x.top);
    });
    if (coveredByOpenLayer) continue;
    const top = document.elementFromPoint(Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2));
    const cover = top && top !== el && !el.contains(top) ? top.closest(OVERLAY) : null;
    if (cover && !cover.contains(el)) continue;
    out.push({ label: label(el), tag: el.tagName.toLowerCase(), ...hitSize(el), cls: describe(el) });
  }
  restore(saved);
  return out;
}

/** Hit-tested size around the centre, each arm capped at TAP_MIN, 0 by 0 when the centre lands elsewhere. */
function hitSize(el: Element): { w: number; h: number } {
  const r = el.getBoundingClientRect();
  const cx = Math.round(r.left + r.width / 2);
  const cy = Math.round(r.top + r.height / 2);
  const hit = (x: number, y: number) => {
    const t = document.elementFromPoint(x, y);
    return !!t && (t === el || el.contains(t));
  };
  const run = (dx: number, dy: number) => {
    let n = 0;
    while (n < TAP_MIN && hit(cx + dx * (n + 1), cy + dy * (n + 1))) n += 1;
    return n;
  };
  const probed = hit(cx, cy) ? { w: 1 + run(1, 0) + run(-1, 0), h: 1 + run(0, 1) + run(0, -1) } : { w: 0, h: 0 };
  if (r.width >= TAP_MIN && r.height >= TAP_MIN && r.bottom > 8 && r.top < window.innerHeight - 8) {
    return {
      w: Math.max(probed.w, Math.min(TAP_MIN, Math.round(r.width))),
      h: Math.max(probed.h, Math.min(TAP_MIN, Math.round(r.height))),
    };
  }
  return probed;
}

function lines(el: Element): string[] {
  const out: { top: number; text: string }[] = [];
  const range = document.createRange();
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const s = node.textContent ?? '';
    for (let i = 0; i < s.length; i += 1) {
      range.setStart(node, i);
      range.setEnd(node, i + 1);
      const r = range.getClientRects()[0];
      const last = out[out.length - 1];
      if (!r || r.width === 0) {
        if (last) last.text += s[i];
        continue;
      }
      const top = Math.round(r.top);
      if (last && Math.abs(last.top - top) <= 3) last.text += s[i];
      else out.push({ top, text: s[i] });
    }
  }
  return out.map(l => l.text.replace(/\s+/g, ' ').trim()).filter(Boolean);
}

function part(el: Element): PartProbe {
  const r = el.getBoundingClientRect();
  return { left: Math.round(r.left * 10) / 10, top: Math.round(r.top * 10) / 10, width: Math.round(r.width), lines: lines(el) };
}

function boxedAncestor(el: Element): Element {
  for (let node = el.parentElement; node; node = node.parentElement) {
    if (getComputedStyle(node).display !== 'contents') return node;
  }
  return document.body;
}

function rows(): RowProbe[] {
  const out: RowProbe[] = [];
  for (const row of document.querySelectorAll(ROWS.row)) {
    if (!visible(row)) continue;
    const time = row.querySelector(ROWS.time);
    const title = row.querySelector(ROWS.title);
    const meta = row.querySelector(ROWS.meta);
    const pill = row.querySelector(ROWS.pill);
    if (!time || !title || !meta) continue;
    let columnWidth = 0;
    if (pill) {
      const host = boxedAncestor(pill);
      const s = getComputedStyle(host);
      columnWidth = Math.round(host.getBoundingClientRect().width - parseFloat(s.paddingLeft) - parseFloat(s.paddingRight));
    }
    out.push({ time: part(time), title: part(title), meta: part(meta), pill: pill ? part(pill) : null, columnWidth, timeInk: hex(inkOf(time)) });
  }
  return out;
}

function textBox(el: Element): DOMRect | null {
  const range = document.createRange();
  range.selectNodeContents(el);
  const r = range.getBoundingClientRect();
  return r.width > 0 && r.height > 0 ? r : null;
}

/** The chip box narrowed by every clipping box between el and the chip, el included. */
function chipClip(el: Element, chip: Element) {
  const r = chip.getBoundingClientRect();
  const out = { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
  for (let node: Element | null = el; node && node !== chip; node = node.parentElement) {
    const s = getComputedStyle(node);
    if (s.overflowX === 'visible' && s.overflowY === 'visible') continue;
    const b = node.getBoundingClientRect();
    out.left = Math.max(out.left, b.left);
    out.top = Math.max(out.top, b.top);
    out.right = Math.min(out.right, b.right);
    out.bottom = Math.min(out.bottom, b.bottom);
  }
  return out;
}

function chips(): ChipProbe[] {
  const out: ChipProbe[] = [];
  const boards = [...document.querySelectorAll('.hub-day-board, .hub-week-board')].filter(visible);
  const roots = boards.length ? boards : [document];
  for (const chip of roots.flatMap(root => [...root.querySelectorAll('.hub-week-chip')])) {
    if (!visible(chip)) continue;
    const ref = chip.querySelector('.hub-week-chip-ref');
    const desc = chip.querySelector('.hub-week-chip-desc');
    const refBox = ref ? textBox(ref) : null;
    // The text range is the font's content area, taller than a tight line box, so only the run across is compared.
    const clip = ref ? chipClip(ref, chip) : null;
    const walker = document.createTreeWalker(chip, NodeFilter.SHOW_TEXT);
    let textNodes = 0;
    for (let node = walker.nextNode(); node; node = walker.nextNode()) if ((node.textContent ?? '').trim()) textNodes += 1;
    out.push({
      board: chip.closest('.hub-day-board') ? 'day' : 'week',
      ref: (ref?.textContent ?? '').replace(/\s+/g, ' ').trim(),
      refLines: ref ? lines(ref).length : 0,
      refEllipsis: !!ref && getComputedStyle(ref).textOverflow === 'ellipsis',
      refFits: !!refBox && !!clip && refBox.left >= clip.left - 0.5 && refBox.right <= clip.right + 0.5,
      desc: desc ? {
        ellipsis: getComputedStyle(desc).textOverflow === 'ellipsis',
        truncated: desc.scrollWidth > desc.clientWidth || desc.scrollHeight > desc.clientHeight,
        inside: within(desc.getBoundingClientRect(), chipClip(desc.parentElement ?? chip, chip)),
      } : null,
      textNodes,
    });
  }
  return out;
}

// Day view mounts a hidden board next to the shown one, so probes take the first visible match.
const firstVisible = (sel: string, root: ParentNode = document) => [...root.querySelectorAll(sel)].find(visible) ?? null;

function tracker(): TrackerProbe {
  const board = firstVisible('.hub-day-board');
  const head = board && firstVisible('.hub-day-hours-head', board);
  return {
    days: [...document.querySelectorAll('[data-week-day], [data-agenda-day]')].filter(visible).map(el => ({
      date: el.getAttribute('data-week-day') ?? el.getAttribute('data-agenda-day') ?? '',
      h: Math.round(el.getBoundingClientRect().height),
    })),
    crews: [...document.querySelectorAll('[data-week-crew]')].filter(visible).length,
    cells: [...document.querySelectorAll('[data-week-cell]')].filter(visible).length,
    hours: board && head ? {
      head: [...head.children].filter(visible).length,
      lanes: [...board.querySelectorAll('[data-crew-lane]')].map(lane => [...lane.querySelectorAll('[data-day-grid] > .border-r')].filter(visible).length),
    } : null,
  };
}

function dayBoard(): DayBoardProbe | null {
  const board = firstVisible('.hub-day-board');
  if (!board) return null;
  const rules = new Set<string>();
  for (const el of board.querySelectorAll('[data-day-grid] > .border-r, .hub-day-hours-head > .border-r')) {
    const s = getComputedStyle(el);
    if (parseFloat(s.borderRightWidth) > 0) rules.add(paintHex(s.borderRightColor));
  }
  const lock = board.querySelector('[data-unassigned-lock]');
  const mark = lock?.querySelector('.ops-crew-mark');
  const ls = lock ? getComputedStyle(lock) : null;
  const ms = mark ? getComputedStyle(mark) : null;
  return {
    hourLines: [...rules],
    lanes: [...board.querySelectorAll('[data-crew-lane]')].map(lane => ({
      bg: hex(usedBg(lane)),
      lockBg: hex(usedBg(board.querySelector(`[data-crew-drop="${CSS.escape(lane.getAttribute('data-crew-lane') ?? '')}"]`))),
    })),
    rail: ls ? stroke(ls.borderLeftColor, ls.borderLeftStyle, ls.borderLeftWidth) : null,
    outline: ms ? stroke(ms.outlineColor, ms.outlineStyle, ms.outlineWidth) : null,
  };
}

function sheet(): SheetProbe | null {
  const el = document.querySelector('.hub-schedule-job-sheet');
  if (!el || !visible(el)) return null;
  const s = getComputedStyle(el);
  const back = el.closest('.overlay-backdrop');
  const scrim = back ? rgba(getComputedStyle(back).backgroundColor) : null;
  const br = back?.getBoundingClientRect();
  const cancel = el.querySelector('.hub-editor-sticky-cancel');
  const cs = cancel ? getComputedStyle(cancel) : null;
  return {
    scrim: scrim ? { hex: hex(scrim), a: round(scrim.a, 100) } : null,
    scrimCovers: !!br && br.left <= 0 && br.top <= 0 && br.right >= window.innerWidth && br.bottom >= window.innerHeight,
    bg: paintHex(s.backgroundColor),
    hairline: stroke(s.borderTopColor, s.borderTopStyle, s.borderTopWidth),
    shadows: layers(s.boxShadow),
    cancel: cs ? stroke(cs.borderTopColor, cs.borderTopStyle, cs.borderTopWidth) : null,
  };
}

function clipBox(el: Element, includeSelf = false) {
  let left = -Infinity;
  let top = -Infinity;
  let right = Infinity;
  let bottom = Infinity;
  let clipEl = '';
  for (let node: Element | null = includeSelf ? el : el.parentElement; node; node = node.parentElement) {
    const s = getComputedStyle(node);
    if (s.overflowX === 'visible' && s.overflowY === 'visible') continue;
    const b = node.getBoundingClientRect();
    left = Math.max(left, b.left);
    top = Math.max(top, b.top);
    right = Math.min(right, b.right);
    bottom = Math.min(bottom, b.bottom);
    if (!clipEl) clipEl = describe(node);
    if (classesOf(node).includes(TRACK_PROBE.selector.slice(1))) break;
  }
  return { left, top, right, bottom, clipEl };
}

function intersectBox(el: Element | null): ReachBox {
  if (!el) return { top: 0, bottom: 0, height: 0, visible: 0 };
  const r = el.getBoundingClientRect();
  const top = Math.max(0, r.top);
  const bottom = Math.min(window.innerHeight, r.bottom);
  return { top: r.top, bottom: r.bottom, height: r.height, visible: Math.max(0, bottom - top) };
}

function clocks(): ClockProbe[] {
  const out: ClockProbe[] = [];
  for (const el of document.querySelectorAll('.hub-week-chip-clock, .hub-week-agenda-time')) {
    if (!visible(el)) continue;
    const textR = textBox(el) ?? el.getBoundingClientRect();
    const selfClip = clipBox(el, true);
    const ancestorClip = clipBox(el, false);
    const ownFits = (el as HTMLElement).scrollWidth <= (el as HTMLElement).clientWidth + 0.5;
    const ancestorFits = textR.left >= selfClip.left - 0.5 && textR.right <= selfClip.right + 0.5;
    const fitsRect = textR.left >= ancestorClip.left - 0.5
      && textR.right <= ancestorClip.right + 0.5
      && textR.top >= ancestorClip.top - 0.5
      && textR.bottom <= ancestorClip.bottom + 0.5;
    const board = el.closest('.hub-day-board, [data-day-board]')
      ? 'day'
      : el.classList.contains('hub-week-agenda-time') || el.closest('.hub-week-agenda')
        ? 'agenda'
        : 'week';
    out.push({
      text: (el.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 48),
      cls: describe(el),
      textRight: Math.round(textR.right * 10) / 10,
      clipRight: Number.isFinite(ancestorClip.right) ? Math.round(ancestorClip.right * 10) / 10 : textR.right,
      clipEl: ancestorClip.clipEl,
      ownFits,
      fits: ancestorFits && ownFits,
      board,
      lines: lineCount(el),
      fitsRect: fitsRect && ownFits,
    });
  }
  return out;
}

function reach(): ReachProbe {
  const agendas = [...document.querySelectorAll('.hub-week-agenda')].filter(visible);
  const agenda = intersectBox(agendas[0] ?? document.querySelector('.hub-week-agenda'));
  const agendaFirst = intersectBox(document.querySelector('[data-agenda-day]'));
  const saved = saveScroll();
  const root = document.scrollingElement ?? document.documentElement;
  root.scrollTop = root.scrollHeight;
  const m = main();
  if (m) m.scrollTop = m.scrollHeight;
  for (const el of document.querySelectorAll('.hub-week-sheet-body, .hub-board-cal, .hub-week-document, .hub-phone-week-list')) {
    if (['auto', 'scroll'].includes(getComputedStyle(el).overflowY)) (el as HTMLElement).scrollTop = el.scrollHeight;
  }
  const trays = [...document.querySelectorAll('[data-schedule-rail], [data-schedule-section="tray"], [data-schedule-phone-unscheduled]')];
  const tray = trays.find(visible) ?? trays[0] ?? null;
  const lanes = [...document.querySelectorAll('[data-week-crew], [data-crew-lane]')].filter(visible);
  const lastLane = lanes.length ? lanes[lanes.length - 1] : null;
  tray?.scrollIntoView({ block: 'end' });
  lastLane?.scrollIntoView({ block: 'end' });
  root.scrollTop = root.scrollHeight;
  if (m) m.scrollTop = m.scrollHeight;
  const out = {
    tray: intersectBox(tray),
    lastLane: intersectBox(lastLane),
    agenda,
    agendaFirst,
    vh: window.innerHeight,
  };
  restore(saved);
  return out;
}

function overflow(): Pick<DomMeasure, 'iw' | 'ih' | 'docSW' | 'bodySW' | 'maxRight' | 'maxEl' | 'offenders' | 'buttons' | 'clips' | 'overflowSkips'> {
  const iw = window.innerWidth;
  const ih = window.innerHeight;
  let maxRight = 0;
  let maxEl = '';
  const offenders: Offender[] = [];
  const clips: ClipProbe[] = [];
  const overflowSkips: OverflowSkip[] = [];
  const trackClass = TRACK_PROBE.selector.slice(1);
  for (const el of document.body.querySelectorAll('*')) {
    const r = el.getBoundingClientRect();
    if (r.width <= 1 || r.height <= 1) continue;
    if (getComputedStyle(el).visibility === 'hidden') continue;
    if (r.right > maxRight) {
      maxRight = r.right;
      maxEl = describe(el);
    }
    const own = getComputedStyle(el);
    const clip = clipBox(el, false);
    const pastClip = Number.isFinite(clip.right) && r.right > clip.right + 0.5;
    if (pastClip && own.textOverflow === 'ellipsis') {
      overflowSkips.push({ el: describe(el), right: Math.round(r.right * 10) / 10, reason: 'ellipsis-self' });
    } else if (pastClip && (clip.clipEl.includes(trackClass) || !!el.closest(TRACK_PROBE.selector))) {
      overflowSkips.push({ el: describe(el), right: Math.round(r.right * 10) / 10, reason: 'clip-inside-allowlisted-scroller' });
    } else if (pastClip) {
      clips.push({
        el: describe(el),
        right: Math.round(r.right * 10) / 10,
        clip: clip.clipEl,
        clipRight: Math.round(clip.right * 10) / 10,
      });
    }
    if (r.right <= iw + 0.5) continue;
    let scroller: Offender['scroller'] = null;
    for (let node = el.parentElement; node && node !== document.body; node = node.parentElement) {
      if (getComputedStyle(node).overflowX === 'visible') continue;
      const found = { classes: classesOf(node), right: Math.round(node.getBoundingClientRect().right * 10) / 10 };
      if (!scroller) scroller = found;
      if (found.classes.includes(trackClass)) {
        scroller = found;
        break;
      }
    }
    const insideTrack = !!scroller && scroller.classes.includes(trackClass) && scroller.right <= iw + 0.5;
    if (insideTrack) {
      overflowSkips.push({ el: describe(el), right: Math.round(r.right * 10) / 10, reason: 'sole-allowlisted-scroller' });
      continue;
    }
    offenders.push({ el: describe(el), right: Math.round(r.right * 10) / 10, scroller });
  }
  offenders.sort((a, b) => b.right - a.right);
  const chrome = document.querySelectorAll<HTMLElement>([
    '.ops-page-head button',
    '.ops-page-head [role="button"]',
    '.hub-week-page-tools button',
    '.hub-week-tools button',
    '.hub-week-quiet',
    '.hub-week-seg-btn',
    '.shell-header button',
    '.shell-tabbar button',
    '[role="dialog"] .hub-editor-sticky-footer button',
  ].join(', '));
  const buttons = [...chrome]
    .filter(el => {
      const r = el.getBoundingClientRect();
      return r.width > 1 && r.height > 1 && getComputedStyle(el).visibility !== 'hidden';
    })
    .map(el => ({
      label: (el.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 40),
      sw: el.scrollWidth,
      cw: el.clientWidth,
    }));
  return {
    iw,
    ih,
    docSW: document.documentElement.scrollWidth,
    bodySW: document.body.scrollWidth,
    maxRight: Math.round(maxRight * 10) / 10,
    maxEl,
    offenders: offenders.slice(0, 60),
    buttons,
    clips: clips.slice(0, 40),
    overflowSkips: overflowSkips.slice(0, 80),
  };
}

function dayTrackInfo(): DayTrackInfo | null {
  const el = track();
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return {
    overflowX: getComputedStyle(el).overflowX,
    sw: el.scrollWidth,
    cw: el.clientWidth,
    left: Math.round(r.left * 10) / 10,
    right: Math.round(r.right * 10) / 10,
    top: Math.round(r.top * 10) / 10,
    bottom: Math.round(r.bottom * 10) / 10,
  };
}

function trackLabels(): TrackLabel[] {
  const hosts = [...document.querySelectorAll('.hub-week-board, .hub-day-board, .hub-week-agenda, .hub-phone-week-list, [data-schedule-section="tray"], [data-schedule-rail], [data-schedule-unscheduled-list], .hub-phone-unscheduled')];
  const out: TrackLabel[] = [];
  const push = (el: Element, card: Element) => {
    if (!visible(el)) return;
    if (!(el.textContent ?? '').trim()) return;
    const own = getComputedStyle(el);
    const clamp = (own.getPropertyValue('-webkit-line-clamp') || 'none') !== 'none' || own.textOverflow === 'ellipsis';
    const clipsOwn = clamp || own.overflowX !== 'visible' || own.overflowY !== 'visible';
    const boxR = el.getBoundingClientRect();
    const textR = clipsOwn ? boxR : (textBox(el) ?? boxR);
    const cardR = card.getBoundingClientRect();
    const clip = clipBox(el, true);
    const clipIsTrack = clip.clipEl.includes(TRACK_PROBE.selector.slice(1));
    let clipOnCard = clipIsTrack;
    let node: Element | null = el;
    while (node && node !== card.parentElement) {
      const s = getComputedStyle(node);
      if (s.overflowX !== 'visible' || s.overflowY !== 'visible') {
        clipOnCard = card === node || card.contains(node) || clipIsTrack;
        break;
      }
      node = node.parentElement;
    }
    const fitsClip = clamp || clipOnCard || !Number.isFinite(clip.right)
      || (textR.left >= clip.left - 0.5 && textR.right <= clip.right + 0.5);
    out.push({
      el: describe(el),
      text: (el.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 48),
      card: describe(card),
      fitsCard: textR.right <= cardR.right + 0.5,
      fitsClip,
      clipEl: clip.clipEl,
    });
  };
  for (const host of hosts) {
    for (const card of host.querySelectorAll('.hub-week-chip, .hub-week-agenda-row, [data-untimed-chip], [data-schedule-rail-job], [data-schedule-job]')) {
      if (!card.matches('.hub-week-chip, .hub-week-agenda-row') && card.querySelector('.hub-week-chip, .hub-week-agenda-row')) continue;
      for (const el of card.querySelectorAll('*')) push(el, card);
    }
  }
  return out;
}

function boxOf(el: Element | null): { x: number; y: number; w: number; h: number } | null {
  if (!el || !visible(el)) return null;
  const r = el.getBoundingClientRect();
  return { x: r.x, y: r.y, w: r.width, h: r.height };
}

function lineCount(el: Element | null): number {
  if (!el || !visible(el)) return 0;
  const lh = parseFloat(getComputedStyle(el).lineHeight);
  const h = el.getBoundingClientRect().height;
  if (!lh) return 0;
  return Math.round(h / lh);
}

function chrome(): ChromeProbe {
  const header = document.querySelector('.ops-page-head');
  const page = document.querySelector('.hub-board-cal.ops-page');
  const h1 = document.querySelector('.ops-page-head .ops-page-title, .ops-page-head h1');
  const eyebrow = document.querySelector('[data-schedule-eyebrow], .hub-schedule-eyebrow');
  const newJob = [...document.querySelectorAll('button')].find(el => visible(el) && (el.textContent ?? '').includes('New job')) ?? null;
  const seg = document.querySelector('.hub-week-seg');
  const navs = [...document.querySelectorAll('.hub-week-nav-box')].filter(visible);
  const range = [...document.querySelectorAll('.hub-week-range-full, .hub-week-range-short')].find(visible) ?? null;
  const rangeShortEl = document.querySelector('.hub-week-track .hub-week-range-short');
  const search = [...document.querySelectorAll('.hub-week-search')].find(visible) ?? null;
  const dayGroup = [...document.querySelectorAll('.hub-week-agenda-head')].find(visible) ?? null;
  const card = [...document.querySelectorAll('.hub-week-agenda-row')].find(visible) ?? null;
  const bar = document.querySelector('.shell-header');
  const today = [...document.querySelectorAll('.hub-week-today')].find(visible) ?? null;
  const toolbar = document.querySelector('.hub-week-track');
  const board = document.querySelector('[data-schedule-section="board"]');
  const list = [...document.querySelectorAll('.hub-week-agenda')].find(visible)
    ?? [...document.querySelectorAll('[data-schedule-phone-section="booked"]')].find(visible)
    ?? board;
  const toolbarPadRight = toolbar ? parseFloat(getComputedStyle(toolbar).paddingRight) || 0 : 0;
  const crewOnToolbar = [...document.querySelectorAll('.hub-week-track .hub-schedule-crew-filter > summary')].filter(visible);
  const fulls = [...document.querySelectorAll('.hub-week-head-full')].filter(visible);
  const shorts = [...document.querySelectorAll('.hub-week-head-short')].filter(visible);
  const heads = [...document.querySelectorAll('.hub-week-head')].filter(visible);
  const two = [...document.querySelectorAll('[data-schedule-job].hub-week-chip')].find(el =>
    (el.querySelector('.hub-week-chip-ref')?.textContent ?? '').includes('#0036'),
  ) ?? null;
  const desc = two?.querySelector('.hub-week-chip-desc') ?? document.querySelector('.hub-week-chip-desc');
  const trays = [...document.querySelectorAll('[data-schedule-rail], [data-schedule-unscheduled-list]')];
  const tray = trays.find(visible) ?? trays[0] ?? null;
  const kicker = tray?.querySelector('.ops-card-kicker') ?? null;
  const cards = tray?.querySelector('.hub-schedule-tray-cards') ?? null;
  const untimed = [...document.querySelectorAll('[data-untimed-chip]')].find(visible) ?? null;
  const trackEl = track();
  const dayCrew = [...document.querySelectorAll('.hub-day-crew-lock .hub-schedule-crew-name')].find(visible) ?? null;
  const weekCrew = [...document.querySelectorAll('.hub-week-crew .hub-schedule-crew-name')].find(visible) ?? null;
  const quick = [...document.querySelectorAll('[data-schedule-quickbook-toggle], [data-schedule-section="quickbook"]')].find(visible) ?? null;
  const tools = document.querySelector('.hub-week-tools');
  const whisper = document.querySelector('[data-schedule-whisper]');
  const typeOf = (el: Element | null) => {
    if (!el) return { weight: 0, size: 0, lh: 0 };
    const s = getComputedStyle(el);
    return { weight: parseFloat(s.fontWeight) || 0, size: parseFloat(s.fontSize) || 0, lh: parseFloat(s.lineHeight) || 0 };
  };
  const h1Type = typeOf(h1);
  const whisperType = typeOf(whisper);
  const trayType = typeOf(kicker);
  const newJobR = newJob?.getBoundingClientRect();
  const searchR = search?.getBoundingClientRect();
  const todayR = today?.getBoundingClientRect();
  const boardR = board?.getBoundingClientRect();
  const headLine = shorts[0] ?? fulls[0] ?? heads[0] ?? null;
  const lh = headLine ? parseFloat(getComputedStyle(headLine).lineHeight) || 16 : 16;
  return {
    headerAlign: header ? getComputedStyle(header).textAlign : '',
    headerLeft: header?.getBoundingClientRect().left ?? -1,
    headerRight: header?.getBoundingClientRect().right ?? -1,
    headerTop: header?.getBoundingClientRect().top ?? -1,
    h1Left: h1?.getBoundingClientRect().left ?? -1,
    eyebrowLeft: eyebrow?.getBoundingClientRect().left ?? -1,
    h1ParentLeft: (h1?.parentElement ?? header)?.getBoundingClientRect().left ?? -1,
    pageLeft: page?.getBoundingClientRect().left ?? -1,
    pageRight: page?.getBoundingClientRect().right ?? -1,
    pagePadLeft: page ? parseFloat(getComputedStyle(page).paddingLeft) || 0 : 0,
    toolbarBoxRight: toolbar?.getBoundingClientRect().right ?? -1,
    trayRight: tray?.getBoundingClientRect().right ?? -1,
    newJobLeft: newJob?.getBoundingClientRect().left ?? -1,
    newJobRight: newJob?.getBoundingClientRect().right ?? -1,
    segPainted: 0,
    segCornerCut: false,
    navPainted: 0,
    navCornerCut: false,
    range: (range?.textContent ?? '').replace(/\s+/g, ' ').trim(),
    searchWidth: search?.getBoundingClientRect().width ?? 0,
    todayRight: today?.getBoundingClientRect().right ?? -1,
    toolbarRight: toolbar ? toolbar.getBoundingClientRect().right - toolbarPadRight : -1,
    toolbarBottom: toolbar?.getBoundingClientRect().bottom ?? -1,
    boardTop: board?.getBoundingClientRect().top ?? -1,
    crewToolbarShown: crewOnToolbar.length,
    todayPainted: 0,
    todayCornerCut: false,
    dayHeadFullShown: fulls.length,
    dayHeadShortShown: shorts.length,
    dayHeadAlign: heads[0] ? getComputedStyle(heads[0]).textAlign : '',
    dayHeadLines: (() => {
      if (!headLine) return 0;
      const kids = [...headLine.children].map(el => el.getBoundingClientRect().height);
      const unit = Math.max(lh, ...kids, 1);
      return Math.round(headLine.getBoundingClientRect().height / unit);
    })(),
    dayHeadText: (shorts.length ? shorts : heads).map(el => {
      const now = el.parentElement?.querySelector('.hub-week-now');
      const bits = [el, now].filter((n): n is Element => !!n && visible(n)).map(n => (n.textContent ?? '').replace(/\s+/g, ' ').trim());
      return bits.join(' ').replace(/\s+/g, ' ').trim();
    }),
    line1_0036: (two?.querySelector('.hub-week-chip-line1')?.textContent ?? '').replace(/\s+/g, ' ').trim(),
    titleLines: lineCount(desc),
    weekCrewLines: lineCount(weekCrew),
    dayCrewLines: lineCount(dayCrew),
    trayHeadingH: kicker?.getBoundingClientRect().height ?? 0,
    trayHeadingText: (kicker?.textContent ?? '').replace(/\s+/g, ' ').trim(),
    trayCols: cards ? getComputedStyle(cards).gridTemplateColumns.split(' ').filter(Boolean).length : 0,
    dayUntimedWidth: untimed?.getBoundingClientRect().width ?? 0,
    dayTrackWidth: trackEl ? trackEl.clientWidth : 0,
    quickBookTop: quick?.getBoundingClientRect().top ?? -1,
    rangeTop: range?.getBoundingClientRect().top ?? -1,
    todayTop: today?.getBoundingClientRect().top ?? -1,
    quickBookWidth: quick?.getBoundingClientRect().width ?? 0,
    toolsWidth: tools?.getBoundingClientRect().width ?? 0,
    sameRangeRow: !!(today && range && today.closest('.hub-week-range-row') && today.closest('.hub-week-range-row') === range.closest('.hub-week-range-row')),
    segBox: boxOf(seg),
    todayBox: boxOf(today),
    navBoxes: navs.map(el => boxOf(el)).filter((b): b is NonNullable<typeof b> => !!b),
    h1Weight: h1Type.weight,
    h1Size: h1Type.size,
    h1Lh: h1Type.lh,
    whisperWeight: whisperType.weight,
    whisperSize: whisperType.size,
    whisperLh: whisperType.lh,
    eyebrowPaint: '',
    newJobW: newJobR?.width ?? 0,
    newJobH: newJobR?.height ?? 0,
    newJobBottom: newJobR?.bottom ?? -1,
    segTrackPaint: '',
    segActivePaint: '',
    searchH: searchR?.height ?? 0,
    todayW: todayR?.width ?? 0,
    todayH: todayR?.height ?? 0,
    todayFill: '',
    boardLeft: boardR?.left ?? -1,
    boardRight: boardR?.right ?? -1,
    trayWeight: trayType.weight,
    traySize: trayType.size,
    trayLh: trayType.lh,
    listLeft: (list ?? board)?.getBoundingClientRect().left ?? -1,
    geistCheck: document.fonts.check('16px Geist'),
    eyebrowTransform: eyebrow ? getComputedStyle(eyebrow).textTransform : '',
    eyebrowLetterSpacing: eyebrow ? getComputedStyle(eyebrow).letterSpacing : '',
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    tzOffset: new Date().getTimezoneOffset(),
    segActiveInk: '',
    searchLeft: searchR?.left ?? -1,
    searchRight: searchR?.right ?? -1,
    dayGroupLeft: dayGroup?.getBoundingClientRect().left ?? -1,
    cardLeft: card?.getBoundingClientRect().left ?? -1,
    barBottom: bar?.getBoundingClientRect().bottom ?? -1,
    eyebrowTop: eyebrow?.getBoundingClientRect().top ?? -1,
    eyebrowLh: typeOf(eyebrow).lh,
    newJobY: newJobR?.y ?? -1,
    segW: seg?.getBoundingClientRect().width ?? 0,
    rangeW: document.querySelector('.hub-week-range-row')?.getBoundingClientRect().width ?? 0,
    moreJobs: (document.querySelector('[data-schedule-more-jobs]')?.textContent ?? '').replace(/\s+/g, ' ').trim(),
    moreJobsHref: document.querySelector('[data-schedule-more-jobs] a')?.getAttribute('href') ?? '',
    unscheduledChip: (document.querySelector('[data-schedule-unscheduled-chip]')?.textContent ?? '').replace(/\s+/g, ' ').trim(),
    undatedCardCount: document.querySelectorAll('[data-schedule-rail-job], [data-schedule-unscheduled-list] [data-schedule-job]').length,
    textPast: textPastViewport(),
    rangeShort: rangeShortEl ? (rangeShortEl.textContent ?? '').replace(/\s+/g, ' ').trim() : '',
    rangeShortPast: textRectsRaw(rangeShortEl).filter(hit => hit.right > window.innerWidth),
  };
}

function clipTextRight(el: Element | null, right: number): number {
  let node = el;
  while (node && node !== document.documentElement) {
    const ox = getComputedStyle(node).overflowX;
    if (ox === 'hidden' || ox === 'auto' || ox === 'scroll' || ox === 'clip') {
      right = Math.min(right, node.getBoundingClientRect().right);
    }
    node = node.parentElement;
  }
  return right;
}

function textRectsRaw(root: Element | null): { text: string; right: number }[] {
  if (!root) return [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const hits: { text: string; right: number }[] = [];
  const range = document.createRange();
  let node = walker.nextNode();
  while (node) {
    const raw = node.textContent ?? '';
    if (raw.trim()) {
      range.selectNodeContents(node);
      for (const rect of range.getClientRects()) {
        hits.push({ text: raw.replace(/\s+/g, ' ').trim().slice(0, 80), right: rect.right });
      }
    }
    node = walker.nextNode();
  }
  return hits;
}

function textPastViewport(): { text: string; right: number }[] {
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const hits: { text: string; right: number }[] = [];
  const range = document.createRange();
  let node = walker.nextNode();
  while (node) {
    const raw = node.textContent ?? '';
    const parent = node.parentElement;
    if (raw.trim() && parent && visible(parent)) {
      range.selectNodeContents(node);
      for (const rect of range.getClientRects()) {
        const right = clipTextRight(parent, rect.right);
        if (right > window.innerWidth) {
          hits.push({ text: raw.replace(/\s+/g, ' ').trim().slice(0, 80), right });
        }
      }
    }
    node = walker.nextNode();
  }
  return hits;
}

function pageScroller(): Element | null {
  const m = main();
  if (!m) return null;
  let best: Element | null = null;
  let area = 0;
  for (const el of [m, ...m.querySelectorAll('*')]) {
    if (el.scrollHeight <= el.clientHeight + 4) continue;
    const oy = getComputedStyle(el).overflowY;
    if (oy !== 'auto' && oy !== 'scroll') continue;
    const a = el.clientWidth * el.clientHeight;
    if (a > area) {
      area = a;
      best = el;
    }
  }
  return best;
}

let scrolledBy: { el: Element; top: number } | null = null;

function track(): HTMLElement | null {
  return (firstVisible(TRACK_PROBE.selector) as HTMLElement | null) ?? null;
}

async function decode(png: string): Promise<ImageData> {
  const bin = atob(png);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
  const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/png' }), { colorSpaceConversion: 'none', premultiplyAlpha: 'none' });
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('p2 harness has no 2d context');
  ctx.drawImage(bitmap, 0, 0);
  return ctx.getImageData(0, 0, bitmap.width, bitmap.height);
}

const paletteClass = new Map<number, 0 | 1 | 2>();
function classify(r: number, g: number, b: number): 0 | 1 | 2 {
  const key = (r << 16) | (g << 8) | b;
  const hit = paletteClass.get(key);
  if (hit !== undefined) return hit;
  const out = isNavy(r, g, b) ? 1 : isCream(r, g, b) ? 2 : 0;
  paletteClass.set(key, out);
  return out;
}

const px = (d: ImageData, x: number, y: number): Rgba => {
  const i = (y * d.width + x) * 4;
  return { r: d.data[i], g: d.data[i + 1], b: d.data[i + 2], a: 1 };
};
const gap = (a: Rgba, b: Rgba) => Math.hypot(a.r - b.r, a.g - b.g, a.b - b.b);
const STROKE_GAP = 18;

function strokeOf(img: ImageData, box: { x: number; y: number; w: number; h: number } | null): { painted: number; cornerCut: boolean } {
  if (!box || box.w < 8 || box.h < 8) return { painted: 0, cornerCut: false };
  const x0 = Math.max(1, Math.round(box.x));
  const y0 = Math.max(1, Math.round(box.y));
  const x1 = Math.min(img.width - 2, Math.round(box.x + box.w) - 1);
  const y1 = Math.min(img.height - 2, Math.round(box.y + box.h) - 1);
  if (x1 - x0 < 6 || y1 - y0 < 6) return { painted: 0, cornerCut: false };
  let painted = 0;
  const xSteps = Math.max(6, Math.floor((x1 - x0) / 3));
  const ySteps = Math.max(6, Math.floor((y1 - y0) / 3));
  for (let i = 1; i < xSteps; i += 1) {
    const x = x0 + Math.round(((x1 - x0) * i) / xSteps);
    const edge = [px(img, x, y0), px(img, x, y0 + 1), px(img, x, y0 + 2)];
    const inward = px(img, x, Math.min(y1 - 2, y0 + 8));
    if (edge.some(p => gap(p, inward) >= STROKE_GAP)) painted += 1;
  }
  for (let i = 1; i < ySteps; i += 1) {
    const y = y0 + Math.round(((y1 - y0) * i) / ySteps);
    const edge = [px(img, x0, y), px(img, x0 + 1, y), px(img, x0 + 2, y)];
    const inward = px(img, Math.min(x1 - 2, x0 + 8), y);
    if (edge.some(p => gap(p, inward) >= STROKE_GAP)) painted += 1;
  }
  const outside = px(img, Math.max(0, x0 - 3), Math.max(0, y0 - 3));
  let pagePx = 0;
  for (let y = y0; y < y0 + 6 && y < img.height; y += 1) {
    for (let x = x0; x < x0 + 6 && x < img.width; x += 1) {
      if (gap(px(img, x, y), outside) < 12) pagePx += 1;
    }
  }
  return { painted, cornerCut: pagePx >= 6 };
}
// Below this distance the background is too close to the ink to tell coverage apart.
const MIN_INK_SPAN = 60;

function toggleStyle(id: string, css: string, on: boolean) {
  document.getElementById(id)?.remove();
  if (!on) return;
  const style = document.createElement('style');
  style.id = id;
  style.textContent = css;
  document.head.append(style);
}

function nowScope(): Element[] {
  const lines = [...document.querySelectorAll('.hub-day-now-line, .hub-day-now-dot')].map(el => el.closest('.pointer-events-none') ?? el);
  return [...lines, ...document.querySelectorAll('.hub-week-head.is-today, .hub-week-agenda-day.is-today')];
}

function inView(x: number, y: number) {
  return x >= 0 && y >= 0 && x < window.innerWidth && y < window.innerHeight;
}

function chromeCovers(x: number, y: number) {
  return document.elementsFromPoint(x, y).some(el => el.closest('.shell-bottom-nav, .shell-header'));
}

function layoutProbe(): LayoutProbe {
  const css = (el: Element | null, prop: string) => (el ? getComputedStyle(el).getPropertyValue(prop).trim() : '');
  const cards = [...document.querySelectorAll<HTMLElement>('[data-schedule-job].hub-week-chip')].filter(visible).map(el => {
    const ref = (el.querySelector('.hub-week-chip-ref')?.textContent ?? '').replace(/\s+/g, ' ').trim();
    const clock = (el.querySelector('.hub-week-chip-clock')?.textContent ?? el.getAttribute('data-chip-clock') ?? '').trim();
    const line1 = (el.querySelector('.hub-week-chip-line1')?.textContent ?? '').replace(/\s+/g, ' ').trim();
    const pill = (el.querySelector('.hub-schedule-pill')?.textContent ?? '').trim();
    const cell = el.closest<HTMLElement>('[data-week-cell]');
    const cellLane = (cell?.dataset.weekCell ?? '').split(':')[0];
    const lane = el.closest('[data-week-crew], [data-crew-drop], [data-crew-lane]');
    const laneId = cellLane
      || (lane as HTMLElement | null)?.dataset.weekCrew
      || (lane as HTMLElement | null)?.dataset.crewDrop
      || (lane as HTMLElement | null)?.dataset.crewLane
      || '';
    const track = el.querySelector<HTMLElement>('.hub-week-chip-span');
    const host = el.querySelector('.hub-week-chip-track');
    const hostW = host?.getBoundingClientRect().width || 1;
    const trackR = track?.getBoundingClientRect();
    const hostR = host?.getBoundingClientRect();
    return {
      id: el.dataset.scheduleJob ?? el.dataset.weekChip ?? '',
      ref,
      clock,
      line1,
      pill,
      lanes: laneId ? [laneId] : [],
      trackStored: el.querySelector('.hub-week-chip-track')?.getAttribute('data-stored') === '1',
      trackLeft: trackR && hostR ? (trackR.left - hostR.left) / hostW : 0,
      trackWidth: trackR && hostR ? trackR.width / hostW : 0,
      rail: css(el.querySelector('.hub-week-chip-rail'), 'background-color'),
    };
  });
  const byId = new Map<string, typeof cards[number]>();
  for (const card of cards) {
    const prev = byId.get(card.id);
    if (prev) prev.lanes.push(...card.lanes);
    else byId.set(card.id, { ...card, lanes: [...card.lanes] });
  }
  const trays = [...document.querySelectorAll('[data-schedule-rail], [data-schedule-unscheduled-list], [data-schedule-phone-unscheduled]')];
  const tray = trays.find(visible) ?? trays[0] ?? null;
  return {
    h1: [...document.querySelectorAll('h1')].filter(visible).map(el => (el.textContent ?? '').trim()),
    eyebrow: (document.querySelector('[data-schedule-eyebrow]')?.textContent ?? '').trim(),
    whisper: (document.querySelector('[data-schedule-whisper]')?.textContent ?? '').trim(),
    newJob: [...document.querySelectorAll('button')].filter(el => visible(el) && (el.textContent ?? '').includes('New job')).length,
    now: (document.querySelector('.hub-week-now')?.textContent ?? '').trim() || null,
    sections: [...document.querySelectorAll<HTMLElement>('[data-schedule-section]')].filter(visible).map(el => ({
      id: el.dataset.scheduleSection ?? '',
      top: Math.round(el.getBoundingClientRect().top),
    })),
    lanes: [...document.querySelectorAll<HTMLElement>('[data-week-crew]')].filter(visible).map(el => ({
      id: el.dataset.weekCrew ?? '',
      name: (el.querySelector('[data-week-crew-label], .hub-schedule-crew-name')?.textContent ?? '').trim(),
      count: (el.querySelector('.ops-meta')?.textContent ?? '').trim(),
    })),
    weekDays: [...document.querySelectorAll<HTMLElement>('[data-week-day]')].filter(visible).map(el => el.dataset.weekDay ?? ''),
    cells: [...document.querySelectorAll('[data-week-cell]')].filter(visible).length,
    weekendJobs: document.querySelector<HTMLElement>('.hub-week-grid')?.dataset.weekendJobs ?? null,
    cards: [...byId.values()],
    agendaDays: [...document.querySelectorAll<HTMLElement>('[data-agenda-day]')].filter(visible).map(el => ({
      date: el.dataset.agendaDay ?? '',
      empty: !!el.querySelector('[data-agenda-empty]'),
      h: el.getBoundingClientRect().height,
    })),
    trayHeading: (tray?.querySelector('.ops-card-kicker')?.textContent ?? '').trim(),
    traySub: (tray?.querySelector('.ops-tray-head .ops-meta')?.textContent ?? '').trim(),
    trayCards: [...(tray?.querySelectorAll('[data-schedule-rail-job]') ?? [])].map(el => ({
      id: (el as HTMLElement).dataset.scheduleRailJob ?? '',
      meta: (el.querySelector('.hub-schedule-ref')?.textContent ?? '').trim(),
      pill: (el.querySelector('.hub-schedule-pill')?.textContent ?? '').trim(),
      text: (el.textContent ?? '').replace(/\s+/g, ' ').trim(),
    })),
    setDate: [...document.querySelectorAll('[data-schedule-set-date]')].filter(visible).map(el => (el.textContent ?? '').replace(/\s+/g, ' ').trim()),
    allCrews: !!document.querySelector('[data-schedule-all-crews]'),
    quickBook: [...document.querySelectorAll('[data-schedule-section="quickbook"], [data-schedule-quickbook-toggle]')].some(visible),
    pageError: (document.querySelector('main')?.textContent ?? '').includes('Could not load schedule')
      ? 'Could not load schedule'
      : '',
  };
}

window.__p2 = {
  async ready() {
    await document.fonts.ready;
    for (let i = 0; ; i += 1) {
      const busy = client.isFetching() + client.isMutating();
      if (!busy && main() && !document.querySelector('.animate-spin')) break;
      if (i > 300) throw new Error(`p2 page never settled: fetching ${client.isFetching()}, mutating ${client.isMutating()}`);
      await sleep(50);
    }
    await sleep(250);
    await frame();
    await frame();
  },

  async settleForWalk() {
    if (document.fonts?.ready) await document.fonts.ready;
    await frame();
    await frame();
    await new Promise<void>(resolve => {
      let timer = window.setTimeout(done, 500);
      const ro = new ResizeObserver(() => {
        window.clearTimeout(timer);
        timer = window.setTimeout(done, 500);
      });
      ro.observe(document.documentElement);
      function done() {
        ro.disconnect();
        resolve();
      }
    });
  },

  masks() {
    const out: Box[] = [];
    for (const m of PALETTE.masks) {
      for (const el of document.querySelectorAll(m.sel)) {
        if (!visible(el)) continue;
        const r = el.getBoundingClientRect();
        const part: MaskPart = m.part;
        const w = part === 'border-left' ? parseFloat(getComputedStyle(el).borderLeftWidth) : r.width;
        out.push({ x: r.left - 4, y: r.top - 4, w: w + 8, h: r.height + 8 });
      }
    }
    return out;
  },

  scrollPage() {
    const el = pageScroller();
    if (!el) return 0;
    const top = el.scrollTop;
    el.scrollTop = top + el.clientHeight;
    scrolledBy = { el, top };
    return el.scrollTop - top;
  },

  restoreScroll() {
    if (scrolledBy) scrolledBy.el.scrollTop = scrolledBy.top;
    scrolledBy = null;
  },

  measureDom() {
    const board = document.querySelector('.hub-board-cal') ?? document.body;
    const menu = document.querySelector('.shell-menu');
    return {
      ...overflow(),
      texts: texts(),
      taps: taps(),
      rows: rows(),
      chips: chips(),
      tracker: tracker(),
      dayBoard: dayBoard(),
      sheet: sheet(),
      pageBg: getComputedStyle(board).backgroundColor,
      docH: document.documentElement.scrollHeight,
      tabs: [...document.querySelectorAll('[data-phone-tab]')].filter(visible).map(el => (el.textContent ?? '').trim()),
      menu: menu ? [...menu.querySelectorAll('a, button')].filter(visible).map(el => (el.textContent ?? '').trim()) : null,
      path: currentPath,
      layout: layoutProbe(),
      clocks: clocks(),
      reach: reach(),
      trackLabels: trackLabels(),
      dayTrack: dayTrackInfo(),
      chrome: chrome(),
    };
  },

  trackShape() {
    const el = track();
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const inner = r.left + el.clientLeft + el.clientWidth;
    const cut = [...el.querySelectorAll(TRACK_PROBE.hourCells)].map(c => c.getBoundingClientRect())
      .find(c => c.left < inner && c.right > inner);
    return {
      classes: classesOf(el),
      sw: el.scrollWidth,
      cw: el.clientWidth,
      right: Math.round(r.right * 10) / 10,
      overflowX: getComputedStyle(el).overflowX,
      cutHourPx: cut ? { shown: Math.round(inner - cut.left), hidden: Math.round(cut.right - inner) } : { shown: 0, hidden: 0 },
    };
  },

  prepTrack() {
    const el = track();
    const m = main();
    if (!el || !m) return null;
    el.scrollLeft = 0;
    el.scrollTop = 0;
    m.scrollTop = 0;
    m.scrollTop = el.getBoundingClientRect().top - m.getBoundingClientRect().top - 8;
    const r = el.getBoundingClientRect();
    // The wheel lands wherever the pointer is, so pick a point the hit test proves is inside the track.
    for (let fy = 0.5; fy > 0; fy -= 0.1) {
      for (let fx = 0.5; fx > 0.05; fx -= 0.1) {
        const x = Math.round(r.left + r.width * fx);
        const y = Math.round(Math.max(r.top, 0) + (Math.min(r.bottom, window.innerHeight) - Math.max(r.top, 0)) * fy);
        const hit = document.elementFromPoint(x, y);
        if (hit && el.contains(hit)) return { x, y, hit: describe(hit) };
      }
    }
    return null;
  },

  scrollState() {
    const el = track();
    const m = main();
    return {
      mainTop: m?.scrollTop ?? 0,
      docTop: document.scrollingElement?.scrollTop ?? 0,
      trackTop: el?.scrollTop ?? 0,
      trackLeft: el?.scrollLeft ?? 0,
      roomDown: m ? Math.max(0, m.scrollHeight - m.clientHeight - m.scrollTop) : 0,
      roomUp: m?.scrollTop ?? 0,
    };
  },

  resetTrack() {
    const el = track();
    if (el) {
      el.scrollLeft = 0;
      el.scrollTop = 0;
    }
  },

  async palette(png, masks, shot) {
    const img = await decode(png);
    const { width, height, data } = img;
    const masked = new Uint8Array(width * height);
    for (const m of masks) {
      const x0 = Math.max(0, Math.floor(m.x));
      const y0 = Math.max(0, Math.floor(m.y));
      const x1 = Math.min(width, Math.ceil(m.x + m.w));
      const y1 = Math.min(height, Math.ceil(m.y + m.h));
      for (let y = y0; y < y1; y += 1) masked.fill(1, y * width + x0, y * width + Math.max(x0, x1));
    }
    let scannedPx = 0;
    let navyPx = 0;
    let creamPx = 0;
    for (let i = 0; i < width * height; i += 1) {
      if (masked[i]) continue;
      scannedPx += 1;
      const c = classify(data[i * 4], data[i * 4 + 1], data[i * 4 + 2]);
      if (c === 1) navyPx += 1;
      else if (c === 2) creamPx += 1;
    }
    return { shot, framePx: width * height, scannedPx, navyPx, creamPx };
  },

  async changedPx(a, b) {
    const x = await decode(a);
    const y = await decode(b);
    if (x.width !== y.width || x.height !== y.height) return x.width * x.height;
    let n = 0;
    for (let i = 0; i < x.data.length; i += 4) {
      if (x.data[i] !== y.data[i] || x.data[i + 1] !== y.data[i + 1] || x.data[i + 2] !== y.data[i + 2]) n += 1;
    }
    return n;
  },

  /** Ink coverage along each run, 1 where the pixel is the ink, 0 where it is the background. */
  async runs(png, base, list, ink) {
    const img = await decode(png);
    const ref = base ? await decode(base) : null;
    const k = rgba(ink);
    return list.map(r => {
      const out: number[] = [];
      for (let i = 0; i < r.n; i += 1) {
        const x = r.x + r.dx * i;
        const y = r.y + r.dy * i;
        if (x < 0 || y < 0 || x >= img.width || y >= img.height) {
          out.push(0);
          continue;
        }
        const bg = ref ? px(ref, x, y) : rgba(r.bg ?? '#ffffff');
        const span = gap(bg, k);
        if (span < MIN_INK_SPAN) return null;
        out.push(round(Math.max(0, Math.min(1, 1 - gap(px(img, x, y), k) / span)), 100));
      }
      return out;
    });
  },

  async pixels(png, points) {
    const img = await decode(png);
    return points.map(p => hex(px(img, Math.round(p.x), Math.round(p.y))));
  },

  paintOf(el) {
    const s = getComputedStyle(el);
    const bg = rgba(s.backgroundColor);
    return { bg: hex(bg), bgA: round(bg.a, 100), shadow: s.boxShadow, color: hex(rgba(s.color)) };
  },

  async chromePaint(png, chrome) {
    await document.fonts.ready;
    const img = await decode(png);
    const dpr = window.devicePixelRatio || img.width / Math.max(1, window.innerWidth);
    const scale = (b: { x: number; y: number; w: number; h: number } | null) =>
      b ? { x: b.x * dpr, y: b.y * dpr, w: b.w * dpr, h: b.h * dpr } : null;
    const rgbAt = (x: number, y: number) => {
      const p = px(img, Math.max(0, Math.min(img.width - 1, Math.round(x))), Math.max(0, Math.min(img.height - 1, Math.round(y))));
      return `rgb(${p.r}, ${p.g}, ${p.b})`;
    };
    const inkOf = (b: { x: number; y: number; w: number; h: number } | null) => {
      if (!b || b.w < 2 || b.h < 2) return '';
      let best = { r: 255, g: 255, b: 255, lum: 999 };
      const x0 = Math.max(0, Math.round(b.x));
      const y0 = Math.max(0, Math.round(b.y));
      const x1 = Math.min(img.width - 1, Math.round(b.x + b.w));
      const y1 = Math.min(img.height - 1, Math.round(b.y + b.h));
      for (let y = y0; y < y1; y += 2) {
        for (let x = x0; x < x1; x += 2) {
          const p = px(img, x, y);
          const lum = 0.2126 * p.r + 0.7152 * p.g + 0.0722 * p.b;
          if (lum < best.lum) best = { r: p.r, g: p.g, b: p.b, lum };
        }
      }
      return `rgb(${best.r}, ${best.g}, ${best.b})`;
    };
    const fillOf = (b: { x: number; y: number; w: number; h: number } | null) => {
      if (!b || b.w < 4 || b.h < 4) return '';
      return rgbAt(b.x + b.w / 2, b.y + b.h / 2);
    };
    const trackOf = (b: { x: number; y: number; w: number; h: number } | null) => {
      if (!b || b.w < 12 || b.h < 12) return '';
      return rgbAt(b.x + b.w - 3, b.y + b.h / 2);
    };
    const pillFillOf = (b: { x: number; y: number; w: number; h: number } | null) => {
      if (!b || b.w < 8 || b.h < 8) return '';
      return rgbAt(b.x + 4, b.y + 3);
    };
    const seg = strokeOf(img, scale(chrome.segBox));
    const today = strokeOf(img, scale(chrome.todayBox));
    const navs = chrome.navBoxes.map(b => strokeOf(img, scale(b)));
    const eyebrow = document.querySelector('[data-schedule-eyebrow], .hub-schedule-eyebrow, .s-head .eyebrow');
    const segOn = document.querySelector('.hub-week-seg-btn.is-on, .segc [aria-current]');
    const eyebrowBox = eyebrow ? scale(boxOf(eyebrow)) : null;
    const segOnBox = segOn ? scale(boxOf(segOn)) : null;
    return {
      ...chrome,
      segPainted: seg.painted,
      segCornerCut: seg.cornerCut,
      todayPainted: today.painted,
      todayCornerCut: today.cornerCut,
      navPainted: navs.reduce((n, s) => n + s.painted, 0),
      navCornerCut: navs.filter(s => s.cornerCut).length >= 2,
      eyebrowPaint: inkOf(eyebrowBox),
      segTrackPaint: trackOf(scale(chrome.segBox)),
      segActivePaint: pillFillOf(segOnBox),
      segActiveInk: inkOf(segOnBox),
      todayFill: fillOf(scale(chrome.todayBox)),
      geistCheck: document.fonts.check('16px Geist'),
    };
  },

  tray() {
    const chip = document.querySelector('[data-schedule-unscheduled-chip]');
    const list = document.querySelector('[data-schedule-unscheduled-list]');
    return {
      label: chip ? label(chip) : '',
      expanded: chip?.getAttribute('aria-expanded') === 'true',
      listShown: !!list && visible(list),
      cards: list ? list.querySelectorAll('[data-schedule-rail-job]').length : 0,
    };
  },

  nowPrep() {
    const host = [...document.querySelectorAll<HTMLElement>('.hub-day-now')].find(visible);
    const trackEl = track();
    if (!host || !trackEl) return;
    const hr = host.getBoundingClientRect();
    const tr = trackEl.getBoundingClientRect();
    if (hr.left < tr.left + 8 || hr.right > tr.right - 8) {
      trackEl.scrollLeft += hr.left - tr.left - tr.width / 2;
    }
  },

  nowPoints() {
    const lines: Run[] = [];
    for (const line of document.querySelectorAll('.hub-day-now-line')) {
      const r = line.getBoundingClientRect();
      // visible() drops boxes 1px wide, and a thin now-line is exactly what this run has to measure.
      if (r.width <= 0 || r.height <= 1 || opacityChain(line) === 0) continue;
      if (!inView(r.left + r.width / 2, r.top + 12)) continue;
      const grid = line.closest('[data-day-grid]');
      // A clean run needs lane paper on both sides of the line, so skip heights where a chip sits under it.
      for (let y = Math.round(r.top + 8); y < r.bottom - 8; y += 6) {
        if (!inView(r.left, y) || chromeCovers(r.left + 1, y) || document.elementsFromPoint(r.left + 1, y).some(el => el.closest('.hub-week-chip, .hub-day-resize'))) continue;
        lines.push({ x: Math.floor(r.left) - 3, y, dx: 1, dy: 0, n: 8, bg: hex(usedBg(grid)) });
        break;
      }
    }
    const dots = [...document.querySelectorAll('.hub-day-now')].filter(visible).map(el => {
      const r = el.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + 6 };
    }).filter(p => inView(p.x, p.y) && !chromeCovers(p.x, p.y) && !document.elementsFromPoint(p.x, p.y).some(el => el.closest('.hub-week-chip')));
    const heads = [...document.querySelectorAll<HTMLElement>('[data-week-day]')].filter(visible).map(el => {
      const r = el.getBoundingClientRect();
      return { date: el.dataset.weekDay ?? '', x: Math.round(r.left + r.width * 0.15), y: Math.ceil(r.bottom) - 1, dx: 0, dy: -1, n: 8, bg: hex(usedBg(el)) };
    });
    const agenda = [...document.querySelectorAll<HTMLElement>('[data-agenda-day]')].flatMap(el => {
      const today = el.querySelector('.hub-week-agenda-today');
      return today && visible(today) ? [{ date: el.dataset.agendaDay ?? '', ink: hex(inkOf(today)) }] : [];
    });
    return { lines, dots, heads, agenda };
  },

  nowAnimations() {
    const scope = nowScope();
    return document.getAnimations().filter(a => {
      const target = a.effect instanceof KeyframeEffect ? a.effect.target : null;
      return !!target && scope.some(s => s === target || s.contains(target));
    }).length;
  },

  focusMark() {
    const want = new Set<string>(FOCUS.labels);
    return [...document.querySelectorAll('[data-week-track] button')].filter(el => visible(el) && want.has(label(el))).map((el, i) => {
      el.setAttribute('data-p2-focus', String(i));
      const r = el.getBoundingClientRect();
      return { label: label(el), box: { x: r.left, y: r.top, w: r.width, h: r.height }, hit: hitSize(el) };
    });
  },

  focusRing(shown) {
    toggleStyle('p2-ring-off', '[data-p2-focus] { outline: none !important; }', !shown);
  },

  showEmptyDay() {
    const day = [...document.querySelectorAll('[data-agenda-day]')].find(el => visible(el) && !el.querySelector(ROWS.row));
    let el = day?.parentElement ?? null;
    while (el && !(el.scrollHeight > el.clientHeight + 4 && ['auto', 'scroll'].includes(getComputedStyle(el).overflowY))) el = el.parentElement;
    if (!day || !el) return '';
    scrolledBy = { el, top: el.scrollTop };
    el.scrollTop += day.getBoundingClientRect().top - el.getBoundingClientRect().top - 8;
    return day.getAttribute('data-agenda-day') ?? '';
  },

  chipCrop() {
    const rs = [...document.querySelectorAll('.hub-week-board .hub-week-chip')].filter(visible).map(el => el.getBoundingClientRect());
    if (!rs.length) return null;
    const x = Math.max(0, Math.floor(Math.min(...rs.map(r => r.left)) - 8));
    const y = Math.max(0, Math.floor(Math.min(...rs.map(r => r.top)) - 8));
    const right = Math.min(window.innerWidth, Math.ceil(Math.max(...rs.map(r => r.right)) + 8));
    const bottom = Math.min(window.innerHeight, Math.ceil(Math.max(...rs.map(r => r.bottom)) + 8));
    return right > x && bottom > y ? { x, y, width: right - x, height: bottom - y } : null;
  },

  /** Finds the gradient pseudo-element that fades the track edge and marks its host. */
  fadeFind() {
    const el = track();
    if (!el) return null;
    el.scrollIntoView({ block: 'nearest' });
    for (let node: Element | null = el; node && node !== main(); node = node.parentElement) {
      for (const pseudo of ['::after', '::before']) {
        const s = getComputedStyle(node, pseudo);
        if (s.content === 'none' || s.content === 'normal' || !/gradient/.test(s.backgroundImage)) continue;
        node.setAttribute('data-p2-fade', pseudo);
        const host = node.getBoundingClientRect();
        const r = el.getBoundingClientRect();
        const lane = document.querySelector('[data-crew-lane]')?.getBoundingClientRect() ?? r;
        return {
          right: host.right - parseFloat(getComputedStyle(node).borderRightWidth),
          top: Math.max(0, r.top),
          bottom: Math.min(window.innerHeight, r.bottom),
          laneY: Math.round(Math.max(0, Math.min(window.innerHeight - 1, lane.top + lane.height / 2))),
        };
      }
    }
    return null;
  },

  trackTo(where) {
    const el = track();
    if (!el) return;
    el.scrollLeft = where === 'end' ? el.scrollWidth : Math.round((el.scrollWidth - el.clientWidth) / 2);
    el.closest('.hub-day-board')?.classList.toggle('is-track-end', where === 'end');
  },

  fadePattern(on) {
    toggleStyle('p2-fade-pattern', '[data-p2-fade], [data-p2-fade] * { background: #000 !important; color: #000 !important; border-color: #000 !important; outline-color: #000 !important; box-shadow: none !important; }', on);
  },

  /** Fade alpha per column counted in from the host's inner right edge, read over a black pattern. */
  async fadeAlphas(png, g, surface) {
    const img = await decode(png);
    const s = rgba(surface);
    const full = (s.r + s.g + s.b) / 3;
    const out: number[] = [];
    for (let k = 1; k <= FADE.bandPx; k += 1) {
      const x = Math.floor(g.right) - k;
      const column: number[] = [];
      for (let y = Math.ceil(g.top) + 1; y < Math.floor(g.bottom) - 1; y += 1) {
        const p = px(img, x, y);
        column.push((p.r + p.g + p.b) / 3 / full);
      }
      column.sort((a, b) => a - b);
      out.push(column.length ? round(column[column.length >> 1], 1000) : 0);
    }
    return out;
  },

  fadeHit(g) {
    const hit = document.elementFromPoint(Math.floor(g.right) - FADE.probeInsetPx, g.laneY);
    const host = document.querySelector('[data-p2-fade]');
    return { hitThrough: !!hit && hit !== host && !!track()?.contains(hit), hit: hit ? describe(hit) : 'none' };
  },

  saveGap() {
    const save = document.querySelector('[role="dialog"] .hub-editor-sticky-save');
    return save ? Math.round(window.innerHeight - save.getBoundingClientRect().bottom) : -1;
  },

  ledger: () => ledger,
  path: () => currentPath,
};

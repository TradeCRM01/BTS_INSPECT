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
  type Box, type ChipProbe, type DayBoardProbe, type DomMeasure, type MaskPart, type Offender, type PaletteCount, type Paint,
  type PartProbe, type RowProbe, type SheetProbe, type Stroke, type TapProbe, type TextProbe, type TextRole, type TrackShape,
  type TrackerProbe, type TrayState,
} from './matrix.ts';

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
  interface Window { __P2_BOOT__: { path: string }; __p2: P2Probe }
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
  return hit(cx, cy) ? { w: 1 + run(1, 0) + run(-1, 0), h: 1 + run(0, 1) + run(0, -1) } : { w: 0, h: 0 };
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
  for (const chip of document.querySelectorAll('.hub-week-chip')) {
    if (!visible(chip)) continue;
    const ref = chip.querySelector('.hub-week-chip-ref');
    const desc = chip.querySelector('.hub-week-chip-desc');
    const refBox = ref ? textBox(ref) : null;
    const walker = document.createTreeWalker(chip, NodeFilter.SHOW_TEXT);
    let textNodes = 0;
    for (let node = walker.nextNode(); node; node = walker.nextNode()) if ((node.textContent ?? '').trim()) textNodes += 1;
    out.push({
      board: chip.closest('.hub-day-board') ? 'day' : 'week',
      ref: (ref?.textContent ?? '').replace(/\s+/g, ' ').trim(),
      refLines: ref ? lines(ref).length : 0,
      refEllipsis: !!ref && getComputedStyle(ref).textOverflow === 'ellipsis',
      refFits: !!ref && !!refBox && within(refBox, chipClip(ref, chip)),
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

function overflow(): Pick<DomMeasure, 'iw' | 'docSW' | 'bodySW' | 'maxRight' | 'maxEl' | 'offenders'> {
  const iw = window.innerWidth;
  let maxRight = 0;
  let maxEl = '';
  const offenders: Offender[] = [];
  for (const el of document.body.querySelectorAll('*')) {
    const r = el.getBoundingClientRect();
    if (r.width <= 1 || r.height <= 1) continue;
    if (getComputedStyle(el).visibility === 'hidden') continue;
    if (r.right > maxRight) {
      maxRight = r.right;
      maxEl = describe(el);
    }
    if (r.right <= iw + 0.5) continue;
    let scroller: Offender['scroller'] = null;
    for (let node = el.parentElement; node && node !== document.body; node = node.parentElement) {
      if (getComputedStyle(node).overflowX !== 'visible') {
        scroller = { classes: classesOf(node), right: Math.round(node.getBoundingClientRect().right * 10) / 10 };
        break;
      }
    }
    offenders.push({ el: describe(el), right: Math.round(r.right * 10) / 10, scroller });
  }
  offenders.sort((a, b) => b.right - a.right);
  return {
    iw,
    docSW: document.documentElement.scrollWidth,
    bodySW: document.body.scrollWidth,
    maxRight: Math.round(maxRight * 10) / 10,
    maxEl,
    offenders: offenders.slice(0, 60),
  };
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
  const el = document.querySelector<HTMLElement>(TRACK_PROBE.selector);
  return el && visible(el) ? el : null;
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

  masks() {
    const out: Box[] = [];
    for (const m of PALETTE.masks) {
      for (const el of document.querySelectorAll(m.sel)) {
        if (!visible(el)) continue;
        const r = el.getBoundingClientRect();
        const part: MaskPart = m.part;
        const w = part === 'border-left' ? parseFloat(getComputedStyle(el).borderLeftWidth) : r.width;
        out.push({ x: r.left - 1, y: r.top - 1, w: w + 2, h: r.height + 2 });
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
    [...document.querySelectorAll('.hub-day-now-line')].find(visible)?.scrollIntoView({ block: 'center', inline: 'center' });
  },

  nowPoints() {
    const lines: Run[] = [];
    for (const line of document.querySelectorAll('.hub-day-now-line')) {
      if (!visible(line)) continue;
      const r = line.getBoundingClientRect();
      const grid = line.closest('[data-day-grid]');
      // A clean run needs lane paper on both sides of the line, so skip heights where a chip sits under it.
      for (let y = Math.round(r.top + 8); y < r.bottom - 8; y += 6) {
        if (!inView(r.left, y) || document.elementsFromPoint(r.left + 1, y).some(el => el.closest('.hub-week-chip, .hub-day-resize'))) continue;
        lines.push({ x: Math.floor(r.left) - 3, y, dx: 1, dy: 0, n: 8, bg: hex(usedBg(grid)) });
        break;
      }
    }
    const dots = [...document.querySelectorAll('.hub-day-now-dot')].filter(visible).map(el => el.getBoundingClientRect())
      .map(r => ({ x: r.left + r.width / 2, y: r.top + r.height / 2 })).filter(p => inView(p.x, p.y));
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
    return [...document.querySelectorAll('[data-week-track] button')].filter(visible).map((el, i) => {
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
    const el = pageScroller();
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
    if (el) el.scrollLeft = where === 'end' ? el.scrollWidth : Math.round((el.scrollWidth - el.clientWidth) / 2);
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

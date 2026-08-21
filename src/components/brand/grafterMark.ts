/** Signed Grafter software mark — three left-aligned speed-bar capsules. */

export const GRAFTER_NAVY = '#0A2540';
export const GRAFTER_BLUE = '#2E75B6';
export const GRAFTER_CREAM = '#F5F0E6';

export const GRAFTER_MARK_VIEWBOX = 32;
export const GRAFTER_ICON_RX = 7;
export const GRAFTER_TILE_RX = 6;

export const GRAFTER_BAR_X = 5;
export const GRAFTER_BAR_HEIGHT = 5;
export const GRAFTER_BAR_SLANT = 4;
export const GRAFTER_BAR_WIDTHS = { top: 16, middle: 22, bottom: 16 } as const;
export const GRAFTER_BAR_YS = { top: 7.5, middle: 13.5, bottom: 19.5 } as const;

export type GrafterSurface = 'light' | 'icon';
export type GrafterBarId = 'top' | 'middle' | 'bottom';

export type GrafterBar = {
  id: GrafterBarId;
  x: number;
  y: number;
  width: number;
  height: number;
  slant: number;
  fill: string;
};

export function grafterBars(surface: GrafterSurface): GrafterBar[] {
  const outer = surface === 'icon' ? GRAFTER_CREAM : GRAFTER_NAVY;
  return [
    {
      id: 'top',
      x: GRAFTER_BAR_X,
      y: GRAFTER_BAR_YS.top,
      width: GRAFTER_BAR_WIDTHS.top,
      height: GRAFTER_BAR_HEIGHT,
      slant: GRAFTER_BAR_SLANT,
      fill: outer,
    },
    {
      id: 'middle',
      x: GRAFTER_BAR_X,
      y: GRAFTER_BAR_YS.middle,
      width: GRAFTER_BAR_WIDTHS.middle,
      height: GRAFTER_BAR_HEIGHT,
      slant: GRAFTER_BAR_SLANT,
      fill: GRAFTER_BLUE,
    },
    {
      id: 'bottom',
      x: GRAFTER_BAR_X,
      y: GRAFTER_BAR_YS.bottom,
      width: GRAFTER_BAR_WIDTHS.bottom,
      height: GRAFTER_BAR_HEIGHT,
      slant: GRAFTER_BAR_SLANT,
      fill: outer,
    },
  ];
}

/** Rounded left capsule, diagonally cut right end (speed-bar / motion cut). */
export function grafterBarPath(bar: Pick<GrafterBar, 'x' | 'y' | 'width' | 'height' | 'slant'>): string {
  const r = bar.height / 2;
  const left = bar.x + r;
  const top = bar.y;
  const bot = bar.y + bar.height;
  const rightTop = bar.x + bar.width - bar.slant;
  const rightBot = bar.x + bar.width;
  return `M${left} ${top} L${rightTop} ${top} L${rightBot} ${bot} L${left} ${bot} A${r} ${r} 0 0 1 ${left} ${top} Z`;
}

export function grafterIconSvg(size: number): string {
  const bars = grafterBars('icon');
  const paths = bars
    .map((bar) => `  <path d="${grafterBarPath(bar)}" fill="${bar.fill}"/>`)
    .join('\n');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${GRAFTER_MARK_VIEWBOX} ${GRAFTER_MARK_VIEWBOX}" width="${size}" height="${size}">
  <rect width="${GRAFTER_MARK_VIEWBOX}" height="${GRAFTER_MARK_VIEWBOX}" rx="${GRAFTER_ICON_RX}" fill="${GRAFTER_NAVY}"/>
${paths}
</svg>
`;
}

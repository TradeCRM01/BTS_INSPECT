import {
  GRAFTER_CREAM,
  GRAFTER_MARK_VIEWBOX,
  GRAFTER_NAVY,
  GRAFTER_TILE_RX,
  GRAFTER_ICON_RX,
  grafterBarPath,
  grafterBars,
  type GrafterSurface,
} from './grafterMark';

interface BtsMarkProps {
  size?: number;
  className?: string;
  /** light = navy+blue bars on cream (sidebar / lockup). icon = cream+blue on navy squircle. */
  surface?: GrafterSurface;
  /** When false, bars sit on the parent cream ground with no tile. */
  framed?: boolean;
}

/**
 * Signed Grafter software mark: three left-aligned speed-bar capsules
 * with cut right ends. Not for customer invoices, quotes, or reports.
 */
export function BtsMark({ size = 32, className, surface = 'light', framed = true }: BtsMarkProps) {
  const bars = grafterBars(surface);
  const ground = surface === 'icon' ? GRAFTER_NAVY : GRAFTER_CREAM;
  const rx = surface === 'icon' ? GRAFTER_ICON_RX : GRAFTER_TILE_RX;

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${GRAFTER_MARK_VIEWBOX} ${GRAFTER_MARK_VIEWBOX}`}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden
      data-grafter-mark={surface}
    >
      {framed ? (
        <rect width={GRAFTER_MARK_VIEWBOX} height={GRAFTER_MARK_VIEWBOX} rx={rx} fill={ground} />
      ) : null}
      {bars.map((bar) => (
        <path key={bar.id} d={grafterBarPath(bar)} fill={bar.fill} data-grafter-bar={bar.id} />
      ))}
    </svg>
  );
}

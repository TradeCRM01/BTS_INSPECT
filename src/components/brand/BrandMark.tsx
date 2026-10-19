import { MITRE_PATH, MITRE_VIEWBOX } from './grafterMark';

export const BRAND_MARK_SIZES = [16, 24, 32, 48] as const;
export type BrandMarkSize = (typeof BRAND_MARK_SIZES)[number];

export function BrandMark(props: { size?: BrandMarkSize; className?: string; title?: string }) {
  const size = props.size ?? 24;
  const a11y = props.title
    ? { role: 'img' as const, 'aria-label': props.title }
    : { 'aria-hidden': true, focusable: 'false' as const };
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox={MITRE_VIEWBOX}
      width={size}
      height={size}
      className={props.className}
      data-grafter-mark="mitre"
      {...a11y}
    >
      <path d={MITRE_PATH} fill="currentColor" />
    </svg>
  );
}

import { BRAND_NAME } from '../../lib/brand';

export type WordmarkSize = 'header' | 'auth' | 'marketing';

const WORDMARK_BASE = 'font-semibold tracking-tighter';
const WORDMARK_SIZE: Record<WordmarkSize, string> = {
  marketing: 'text-navy text-[15px]',
  header: 'text-white text-[13px] sm:text-sm truncate',
  auth: 'text-navy text-2xl',
};

export function Wordmark(props: { size?: WordmarkSize; className?: string }) {
  const size = props.size ?? 'header';
  const cls = [WORDMARK_BASE, WORDMARK_SIZE[size], props.className].filter(Boolean).join(' ');
  return (
    <span className={cls} data-grafter-wordmark={size}>
      {BRAND_NAME}
    </span>
  );
}

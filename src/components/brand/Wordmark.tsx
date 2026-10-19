import { BRAND_NAME } from '../../lib/brand';

export type WordmarkSize = 'header' | 'auth' | 'marketing';
export type WordmarkTone = 'ink' | 'onDark' | 'current';

const WORDMARK_SIZE: Record<WordmarkSize, string> = {
  marketing: 'text-[15px]',
  header: 'text-[13px] sm:text-sm truncate',
  auth: 'text-2xl',
};

const WORDMARK_TONE: Record<WordmarkTone, string> = {
  ink: 'text-[color:var(--g-ink)]',
  onDark: 'text-[color:var(--g-nav-ink)]',
  current: 'text-current',
};

export function Wordmark(props: {
  size?: WordmarkSize;
  tone?: WordmarkTone;
  className?: string;
}) {
  const size = props.size ?? 'header';
  const tone = props.tone ?? (size === 'header' ? 'onDark' : 'ink');
  const cls = ['font-semibold', 'uppercase', 'tracking-[0.16em]', WORDMARK_SIZE[size], WORDMARK_TONE[tone], props.className]
    .filter(Boolean)
    .join(' ');
  return (
    <span
      className={cls}
      data-grafter-wordmark={size}
      data-grafter-tone={tone}
      aria-label={BRAND_NAME}
      style={{ fontFamily: 'var(--g-font-sans)', fontWeight: 600 }}
    >
      {BRAND_NAME}
    </span>
  );
}

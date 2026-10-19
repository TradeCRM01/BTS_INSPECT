import { BRAND_NAME } from '../../lib/brand';

export type WordmarkSize = 'header' | 'auth' | 'marketing';
export type WordmarkTone = 'ink' | 'onDark';

const WORDMARK_SIZE: Record<WordmarkSize, string> = {
  marketing: 'text-[15px]',
  header: 'text-[13px] sm:text-sm truncate',
  auth: 'text-2xl',
};

const WORDMARK_TONE: Record<WordmarkTone, string> = {
  ink: 'text-navy',
  onDark: 'text-white',
};

export function Wordmark(props: {
  size?: WordmarkSize;
  tone?: WordmarkTone;
  className?: string;
}) {
  const size = props.size ?? 'header';
  const tone = props.tone ?? (size === 'header' ? 'onDark' : 'ink');
  const cls = ['font-semibold', WORDMARK_SIZE[size], WORDMARK_TONE[tone], props.className]
    .filter(Boolean)
    .join(' ');
  return (
    <span
      className={cls}
      data-grafter-wordmark={size}
      data-grafter-tone={tone}
      style={{ fontFamily: 'var(--g-font-sans)', fontWeight: 600, letterSpacing: '-0.02em' }}
    >
      {BRAND_NAME}
    </span>
  );
}

import { BrandMark } from './BrandMark';
import { Wordmark } from './Wordmark';

interface BrandLockupProps {
  size?: 'header' | 'auth' | 'marketing';
  tagline?: string;
}

export function BrandLockup({ size = 'header', tagline }: BrandLockupProps) {
  if (size === 'marketing') {
    return (
      <span
        className="flex items-center gap-2 min-w-0 text-navy"
        data-grafter-lockup="marketing"
      >
        <BrandMark size={32} className="shrink-0" />
        <Wordmark size="marketing" tone="ink" />
      </span>
    );
  }

  if (size === 'header') {
    return (
      <span
        className="flex items-center gap-2 min-w-0"
        style={{ color: 'var(--g-nav-ink)' }}
        data-grafter-lockup="header"
      >
        <BrandMark size={24} className="shrink-0" />
        <Wordmark size="header" tone="current" />
      </span>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center gap-2">
      <div
        className="flex items-center gap-3"
        data-grafter-lockup="auth"
      >
        <BrandMark size={48} className="shrink-0 text-navy" />
        <Wordmark size="auth" tone="ink" />
      </div>
      {tagline ? (
        <p className="text-sm mt-0 tracking-tight" style={{ color: 'var(--g-ink-muted)' }}>{tagline}</p>
      ) : null}
    </div>
  );
}

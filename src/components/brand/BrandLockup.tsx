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
        className="flex items-center gap-2 min-w-0"
        data-grafter-lockup="marketing"
      >
        <span className="inline-flex items-center justify-center size-[28px] rounded-md shrink-0">
          <BrandMark size={28} surface="icon" />
        </span>
        <Wordmark size="marketing" />
      </span>
    );
  }

  if (size === 'header') {
    return (
      <span
        className="flex items-center gap-2 min-w-0"
        data-grafter-lockup="header"
      >
        <span className="inline-flex items-center justify-center size-[26px] rounded-md bg-cream shrink-0">
          <BrandMark size={18} framed={false} />
        </span>
        <Wordmark size="header" />
      </span>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center gap-2">
      <div
        className="flex items-center gap-3 rounded-xl px-4 py-3 bg-cream"
        data-grafter-lockup="auth"
      >
        <BrandMark size={40} framed={false} />
        <Wordmark size="auth" />
      </div>
      {tagline ? (
        <p className="text-sm text-[#5B6B7C] mt-0 tracking-tight">{tagline}</p>
      ) : null}
    </div>
  );
}

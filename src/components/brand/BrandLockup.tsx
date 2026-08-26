import { BtsMark } from './BtsMark';

interface BrandLockupProps {
  size?: 'header' | 'auth' | 'marketing';
  tagline?: string;
}

const wordmarkClass = 'font-semibold tracking-tighter';

export function BrandLockup({ size = 'header', tagline }: BrandLockupProps) {
  if (size === 'marketing') {
    return (
      <span
        className="flex items-center gap-2 min-w-0"
        data-grafter-lockup="marketing"
      >
        <span className="inline-flex items-center justify-center size-[28px] rounded-md shrink-0">
          <BtsMark size={28} surface="icon" />
        </span>
        <span className={`${wordmarkClass} text-navy text-[15px]`}>Grafter</span>
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
          <BtsMark size={18} framed={false} />
        </span>
        <span className={`${wordmarkClass} text-white text-[13px] sm:text-sm truncate`}>Grafter</span>
      </span>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center gap-2">
      <div
        className="flex items-center gap-3 rounded-xl px-4 py-3 bg-cream"
        data-grafter-lockup="auth"
      >
        <BtsMark size={40} framed={false} />
        <span className={`${wordmarkClass} text-navy text-2xl`}>Grafter</span>
      </div>
      {tagline ? (
        <p className="text-sm text-[#5B6B7C] mt-0 tracking-tight">{tagline}</p>
      ) : null}
    </div>
  );
}

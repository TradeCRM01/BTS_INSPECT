import { BtsMark } from './BtsMark';

interface BrandLockupProps {
  size?: 'header' | 'auth';
  tagline?: string;
}

const wordmarkClass = 'font-semibold tracking-tighter text-navy';

export function BrandLockup({ size = 'header', tagline }: BrandLockupProps) {
  if (size === 'header') {
    return (
      <span
        className="flex items-center gap-2 min-w-0 rounded-md px-2 py-1 bg-cream"
        data-grafter-lockup="header"
      >
        <BtsMark size={22} framed={false} />
        <span className={`${wordmarkClass} text-[13px] sm:text-sm truncate`}>Grafter</span>
      </span>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center gap-3 mb-8">
      <div
        className="flex items-center gap-3 rounded-md px-4 py-3 bg-cream"
        data-grafter-lockup="auth"
      >
        <BtsMark size={40} framed={false} />
        <span className={`${wordmarkClass} text-2xl`}>Grafter</span>
      </div>
      {tagline ? (
        <p className="text-sm text-white/55 mt-0 tracking-tight">{tagline}</p>
      ) : null}
    </div>
  );
}

import { BtsMark } from './BtsMark';

interface BrandLockupProps {
  size?: 'header' | 'auth';
  tagline?: string;
}

export function BrandLockup({ size = 'header', tagline }: BrandLockupProps) {
  if (size === 'header') {
    return (
      <span className="flex items-center gap-2.5 min-w-0">
        <BtsMark size={28} />
        <span className="font-semibold text-[13px] sm:text-sm tracking-tight text-white truncate">
          BTS Inspect
        </span>
      </span>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center gap-3 mb-8">
      <BtsMark size={56} />
      <div className="text-center">
        <span className="text-2xl font-semibold text-white tracking-tight">BTS Inspect</span>
        {tagline ? (
          <p className="text-sm text-white/55 mt-1 tracking-tight">{tagline}</p>
        ) : null}
      </div>
    </div>
  );
}

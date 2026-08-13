import type { ReactNode } from 'react';
import { HelpCircle } from 'lucide-react';

/** Plain-English help for facilities managers — native title tooltip, compact. */
export function HelpTip({ text, children }: { text: string; children?: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1">
      {children}
      <span title={text} className="text-[#9CA3AF] hover:text-[#2E75B6] cursor-help inline-flex" aria-label={text}>
        <HelpCircle size={13} />
      </span>
    </span>
  );
}

export function Field({
  label,
  help,
  children,
}: {
  label: string;
  help?: string;
  children: ReactNode;
}) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-medium text-[#4A5568] flex items-center gap-1">
        {help ? <HelpTip text={help}>{label}</HelpTip> : label}
      </span>
      {children}
    </label>
  );
}

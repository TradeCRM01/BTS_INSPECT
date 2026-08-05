import type { ReactNode } from 'react';

interface SummaryCardProps {
  label: string;
  value: ReactNode;
  subtext?: ReactNode;
  icon?: ReactNode;
  accentColor?: string;
}

export function SummaryCard({ label, value, subtext, icon, accentColor = '#2E75B6' }: SummaryCardProps) {
  return (
    <div className="card-accent p-4">
      <div className="flex items-center gap-1.5 text-xs font-medium text-[#4A5568] uppercase tracking-wide">
        {icon}
        {label}
      </div>
      <p className="text-2xl font-bold text-[#1A1A1A] mt-1">{value}</p>
      {subtext && <p className="text-sm text-[#4A5568] mt-0.5">{subtext}</p>}
      <div className="mt-2 h-1 rounded-full" style={{ backgroundColor: accentColor, opacity: 0.2 }} />
    </div>
  );
}

interface SummaryCardMoneyProps {
  label: string;
  amount: number;
  color?: string;
  icon?: ReactNode;
  formatMoney: (n: number) => string;
}

export function SummaryCardMoney({ label, amount, color = 'text-[#1A1A1A]', icon, formatMoney }: SummaryCardMoneyProps) {
  return (
    <div className="card p-4">
      <div className="flex items-center gap-1.5 text-xs font-medium text-[#4A5568] uppercase tracking-wide">
        {icon}
        {label}
      </div>
      <p className={`text-xl font-bold mt-1 ${color}`}>{formatMoney(amount)}</p>
    </div>
  );
}

import type { ReactNode } from 'react';

interface PageHeaderProps {
  title: string;
  subtitle?: ReactNode;
  action?: ReactNode;
}

export function PageHeader({ title, subtitle, action }: PageHeaderProps) {
  return (
    <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
      <div className="min-w-0">
        <h1 className="text-xl font-semibold text-[#1A1A1A] tracking-tight">{title}</h1>
        {subtitle && (
          <p className="text-sm text-[#4A5568] mt-0.5">{subtitle}</p>
        )}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

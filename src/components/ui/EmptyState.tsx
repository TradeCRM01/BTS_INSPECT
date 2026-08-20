import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  message?: string;
  action?: ReactNode;
}

export function EmptyState({ icon: Icon, title, message, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
      <Icon size={22} className="text-muted mb-3" strokeWidth={1.5} />
      <p className="ops-section-title">{title}</p>
      {message && <p className="ops-meta mt-1 max-w-sm">{message}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}

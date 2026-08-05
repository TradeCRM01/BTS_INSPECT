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
    <div className="flex flex-col items-center justify-center py-20 px-4">
      <div className="w-16 h-16 rounded-full bg-[#F3F4F6] flex items-center justify-center mb-4">
        <Icon size={28} className="text-[#9CA3AF]" />
      </div>
      <p className="text-sm font-medium text-[#1A1A1A] mb-1">{title}</p>
      {message && <p className="text-sm text-[#4A5568] mb-4 text-center max-w-xs">{message}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

import type { ReactNode } from 'react';
import { EmptyState } from './EmptyState';
import { LoadingSpinner } from './LoadingSpinner';
import { PageError } from './PageError';
import type { LucideIcon } from 'lucide-react';

export function QueryState({
  loading,
  error,
  empty,
  filteredEmpty,
  onRetry,
  emptyIcon,
  emptyTitle,
  emptyMessage,
  filteredTitle,
  filteredMessage,
  children,
}: {
  loading: boolean;
  error: boolean;
  empty: boolean;
  filteredEmpty?: boolean;
  onRetry?: () => void;
  emptyIcon?: LucideIcon;
  emptyTitle?: string;
  emptyMessage?: string;
  filteredTitle?: string;
  filteredMessage?: string;
  children: ReactNode;
}) {
  if (loading) {
    return <div className="flex justify-center py-16"><LoadingSpinner size="lg" /></div>;
  }
  if (error) {
    return <PageError message="Couldn’t load these records. Try again." onRetry={onRetry} />;
  }
  if (empty) {
    return emptyIcon ? (
      <EmptyState icon={emptyIcon} title={emptyTitle ?? 'Nothing here yet'} message={emptyMessage} />
    ) : null;
  }
  if (filteredEmpty) {
    return emptyIcon ? (
      <EmptyState
        icon={emptyIcon}
        title={filteredTitle ?? 'No matching records'}
        message={filteredMessage ?? 'Try another filter or search.'}
      />
    ) : null;
  }
  return <>{children}</>;
}

export function queryCountWhisper(args: {
  filterLabel: string;
  count: number;
  loading: boolean;
  error: boolean;
  noun: string;
}): string {
  if (args.loading) return `${args.filterLabel} · Loading…`;
  if (args.error) return `${args.filterLabel} · Couldn’t load`;
  const countLabel = args.count === 1 ? `1 ${args.noun}` : `${args.count} ${args.noun}s`;
  return `${args.filterLabel} · ${countLabel}`;
}

import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { LucideIcon } from 'lucide-react';

export function JobRelatedSection({
  title,
  icon: Icon,
  count,
  action,
  emptyTitle,
  emptyAction,
  children,
}: {
  title: string;
  icon: LucideIcon;
  count: number;
  action?: ReactNode;
  emptyTitle: string;
  emptyAction?: ReactNode;
  children: ReactNode;
}) {
  const items = Array.isArray(children) ? children : children ? [children] : [];
  const visible = items.filter(Boolean);

  return (
    <section className="card overflow-hidden">
      <div className="flex items-center justify-between gap-2 px-3.5 py-2.5 border-b border-[#F3F4F6]">
        <h2 className="text-xs font-semibold text-[#4A5568] uppercase tracking-wide flex items-center gap-1.5">
          <Icon size={13} className="text-[#0A2540]" />
          {title}
          <span className="normal-case font-medium text-[#9CA3AF]">{count}</span>
        </h2>
        {action}
      </div>
      {visible.length === 0 ? (
        <div className="px-3.5 py-4">
          <p className="text-sm text-[#1A1A1A]">{emptyTitle}</p>
          {emptyAction && <div className="mt-2">{emptyAction}</div>}
        </div>
      ) : (
        <div className="divide-y divide-[#F3F4F6]">{children}</div>
      )}
    </section>
  );
}

export function JobRelatedRow({
  href,
  icon: Icon,
  title,
  meta,
  trailing,
}: {
  href?: string;
  icon: LucideIcon;
  title: string;
  meta?: string;
  trailing?: ReactNode;
}) {
  const inner = (
    <>
      <Icon size={15} className="text-[#2E75B6] shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-[#1A1A1A] truncate">{title}</p>
        {meta && <p className="text-xs text-[#9CA3AF] truncate">{meta}</p>}
      </div>
      {trailing}
    </>
  );

  const className = 'flex items-center gap-2.5 px-3.5 py-2.5 hover:bg-[#F9FAFB] transition-colors';
  if (href) {
    return (
      <Link to={href} className={className}>
        {inner}
      </Link>
    );
  }
  return <div className={className}>{inner}</div>;
}

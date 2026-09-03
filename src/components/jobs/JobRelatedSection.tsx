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
    <section className="ops-tray">
      <div className="ops-tray-head">
        <h2 className="ops-section-title flex items-center gap-1.5 min-w-0">
          <Icon size={14} className="text-navy shrink-0" />
          <span className="truncate">{title}</span>
          <span className="ops-meta font-normal">{count}</span>
        </h2>
        {action}
      </div>
      {visible.length === 0 ? (
        <div className="ops-tray-empty">
          <p className="text-sm text-navy">{emptyTitle}</p>
          {emptyAction && <div className="ops-tray-empty-act">{emptyAction}</div>}
        </div>
      ) : (
        <div className="ops-related-list">{children}</div>
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
  action,
  rowClassName,
}: {
  href?: string;
  icon: LucideIcon;
  title: string;
  meta?: string;
  trailing?: ReactNode;
  action?: ReactNode;
  rowClassName?: string;
}) {
  const inner = (
    <>
      <Icon size={15} className="text-accent shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="ops-related-title text-sm font-semibold text-navy truncate">{title}</p>
        {meta && <p className="ops-meta truncate">{meta}</p>}
      </div>
      {trailing}
    </>
  );

  const className = 'ops-related-main flex items-center gap-2.5 px-3 py-2.5 hover:bg-zebra transition-colors';
  return (
    <div className={['ops-related-row flex items-center gap-2 pr-2', rowClassName].filter(Boolean).join(' ')}>
      {href ? (
        <Link to={href} className={`${className} min-w-0 flex-1`}>
          {inner}
        </Link>
      ) : (
        <div className={`${className} min-w-0 flex-1`}>{inner}</div>
      )}
      {action}
    </div>
  );
}

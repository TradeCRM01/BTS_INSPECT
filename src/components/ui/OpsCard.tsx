import type { ReactNode } from 'react';
import { MapPin } from 'lucide-react';

/** First non-empty line for the navy header site row — same language as the job card. */
export function opsSiteLabel(...parts: Array<string | null | undefined>): string {
  for (const part of parts) {
    const trimmed = part?.trim();
    if (trimmed) return trimmed;
  }
  return 'No site address';
}

export function OpsCardHeader({
  kicker,
  site,
  title,
  size = 'card',
}: {
  kicker: string;
  site: string;
  title?: string;
  size?: 'card' | 'hub';
}) {
  const hub = size === 'hub';
  return (
    <div className={hub ? 'ops-card-header ops-card-header-lg' : 'ops-card-header'}>
      <p className={hub ? 'ops-card-kicker ops-card-kicker-lg' : 'ops-card-kicker'}>{kicker}</p>
      <p className={hub ? 'ops-hub-site' : 'ops-card-site'}>
        <MapPin size={hub ? 18 : 14} className="ops-card-site-icon mt-0.5" />
        <span className="min-w-0">{site}</span>
      </p>
      {title ? (
        hub ? (
          <p className="mt-1 text-sm font-medium text-white/75">{title}</p>
        ) : (
          <p className="ops-card-sub">{title}</p>
        )
      ) : null}
    </div>
  );
}

export function OpsStatus({ className, children }: { className: string; children: ReactNode }) {
  return <span className={`ops-status ${className}`}>{children}</span>;
}

export function NextBanner({ detail, className = '' }: { detail: string; className?: string }) {
  return (
    <div className={`ops-next ${className}`.trim()}>
      <p className="ops-next-label">Next</p>
      <p className="ops-next-detail">{detail}</p>
    </div>
  );
}

export function actionClass(recommended: boolean) {
  return recommended ? 'ops-next-control' : 'btn-secondary';
}

export function ActionButton({
  recommended,
  onClick,
  disabled,
  children,
}: {
  recommended: boolean;
  onClick: () => void;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} className={actionClass(recommended)}>
      {children}
    </button>
  );
}

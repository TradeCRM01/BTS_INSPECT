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
  title,
  site,
  size = 'card',
}: {
  kicker: string;
  title: string;
  site: string;
  size?: 'card' | 'hub';
}) {
  const hub = size === 'hub';
  return (
    <div className={hub ? 'ops-card-header ops-card-header-lg' : 'ops-card-header'}>
      <p className={hub ? 'ops-card-kicker ops-card-kicker-lg' : 'ops-card-kicker'}>{kicker}</p>
      {hub ? (
        <h1 className="text-xl font-semibold tracking-tight text-white">{title}</h1>
      ) : (
        <h3 className="ops-card-title">{title}</h3>
      )}
      <p className={hub ? 'ops-hub-site' : 'ops-card-site'}>
        <MapPin size={hub ? 16 : 11} className="ops-card-site-icon" />
        {site}
      </p>
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
  return recommended ? 'btn-primary' : 'btn-secondary';
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

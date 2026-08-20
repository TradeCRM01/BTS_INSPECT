import type { ReactNode } from 'react';
import { MapPin, Phone } from 'lucide-react';

/** First non-empty line for the field-card site title. */
export function opsSiteLabel(...parts: Array<string | null | undefined>): string {
  for (const part of parts) {
    const trimmed = part?.trim();
    if (trimmed) return trimmed;
  }
  return 'No site address';
}

export function mapsSearchUrl(query: string): string {
  return `https://maps.google.com/?q=${encodeURIComponent(query)}`;
}

export function OpsCardHeader({
  kicker,
  trailing,
  size = 'card',
}: {
  kicker: string;
  trailing?: ReactNode;
  size?: 'card' | 'hub';
}) {
  const hub = size === 'hub';
  return (
    <div className={hub ? 'ops-card-header ops-card-header-lg' : 'ops-card-header'}>
      <div className="flex items-center justify-between gap-2">
        <p className={hub ? 'ops-card-kicker ops-card-kicker-lg' : 'ops-card-kicker'}>{kicker}</p>
        {trailing}
      </div>
    </div>
  );
}

export function OpsSiteRow({
  site,
  phone,
  mapsQuery,
  hub = false,
}: {
  site: string;
  phone?: string | null;
  mapsQuery?: string | null;
  hub?: boolean;
}) {
  const hasMaps = !!mapsQuery && mapsQuery !== 'No site address';
  return (
    <div className="flex items-start gap-0.5">
      <p className={hub ? 'ops-hub-site' : 'ops-card-site'}>{site}</p>
      {phone ? (
        <a
          href={`tel:${phone}`}
          className="ops-hit"
          aria-label="Call site"
          onClick={e => e.stopPropagation()}
        >
          <Phone size={18} />
        </a>
      ) : null}
      {hasMaps ? (
        <a
          href={mapsSearchUrl(mapsQuery)}
          target="_blank"
          rel="noreferrer"
          className="ops-hit"
          aria-label="Open map"
          onClick={e => e.stopPropagation()}
        >
          <MapPin size={18} />
        </a>
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
  return recommended ? 'ops-next-control-block' : 'btn-secondary';
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

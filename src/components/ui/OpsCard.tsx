import type { ReactNode } from 'react';
import { Camera, Mail, MapPin, Phone } from 'lucide-react';
import { mailtoHref, telHref } from '../../lib/clientRecords';

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

export function OpsPhotoStamp({
  src,
  hub = false,
  status,
  identity,
  money,
}: {
  src?: string | null;
  hub?: boolean;
  status?: ReactNode;
  identity?: string;
  money?: string;
}) {
  return (
    <div className={hub ? 'ops-tile ops-tile-hub' : 'ops-tile'}>
      {src ? (
        <img src={src} alt="" className="ops-stamp-img" />
      ) : (
        <div className="ops-stamp-empty">
          <Camera size={hub ? 28 : 22} strokeWidth={1.5} />
        </div>
      )}
      {status ? <div className="ops-tile-status">{status}</div> : null}
      {(identity || money) ? (
        <div className="ops-tile-identity">
          {identity ? <p className="ops-tile-line">{identity}</p> : null}
          {money ? <p className="ops-tile-money">{money}</p> : null}
        </div>
      ) : null}
    </div>
  );
}

export function OpsDocHead({
  kind,
  id,
  meta,
  trailing,
  onClose,
}: {
  kind: string;
  id: string;
  meta?: string;
  trailing?: ReactNode;
  onClose?: () => void;
}) {
  return (
    <div className="ops-doc-head">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="ops-doc-label">{kind}</p>
          <p className="ops-doc-id">{id}</p>
          {meta ? <p className="ops-doc-meta">{meta}</p> : null}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {trailing}
          {onClose ? (
            <button
              type="button"
              onClick={onClose}
              className="w-8 h-8 flex items-center justify-center rounded-md hover:bg-white/10 text-white/70"
              aria-label="Close"
            >
              ×
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function OpsFromTo({
  fromName,
  fromDetail,
  toName,
  toDetail,
}: {
  fromName: string;
  fromDetail?: string | null;
  toName: string;
  toDetail?: string | null;
}) {
  return (
    <div className="ops-fromto">
      <div className="min-w-0">
        <p className="ops-fromto-label">From</p>
        <p className="ops-fromto-name truncate">{fromName}</p>
        {fromDetail ? <p className="ops-meta mt-0.5 truncate">{fromDetail}</p> : null}
      </div>
      <div className="min-w-0">
        <p className="ops-fromto-label">To</p>
        <p className="ops-fromto-name truncate">{toName}</p>
        {toDetail ? <p className="ops-meta mt-0.5 truncate">{toDetail}</p> : null}
      </div>
    </div>
  );
}

export function OpsSiteRow({
  site,
  phone,
  email,
  mapsQuery,
  hub = false,
}: {
  site: string;
  phone?: string | null;
  email?: string | null;
  mapsQuery?: string | null;
  hub?: boolean;
}) {
  const callHref = telHref(phone);
  const mailHref = mailtoHref(email);
  const hasMaps = !!mapsQuery && mapsQuery !== 'No site address';
  return (
    <div className="flex items-start gap-0.5">
      <p className={hub ? 'ops-hub-site' : 'ops-card-site'}>{site}</p>
      {callHref ? (
        <a
          href={callHref}
          className="ops-hit"
          aria-label="Call"
          onClick={e => e.stopPropagation()}
        >
          <Phone size={18} />
        </a>
      ) : null}
      {mailHref ? (
        <a
          href={mailHref}
          className="ops-hit"
          aria-label="Email"
          onClick={e => e.stopPropagation()}
        >
          <Mail size={18} />
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

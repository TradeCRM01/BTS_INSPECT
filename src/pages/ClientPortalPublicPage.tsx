import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { format, parseISO } from 'date-fns';
import { Download, FileText, Receipt, Wrench, Building2, AlertCircle } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { LoadingSpinner } from '../components/ui/LoadingSpinner';
import { formatMoney, QUOTE_STATUS_LABELS } from '../types/fsm';
import { usePublicDocumentHead } from '../lib/publicSeo';

export const PORTAL_QUOTE_ACCEPT_ACTION = 'accept_quote';

export function canAcceptPortalQuote(status: string): boolean {
  return status === 'sent';
}

export function portalQuoteAcceptBody(token: string, quoteId: string) {
  return { token, action: PORTAL_QUOTE_ACCEPT_ACTION, quoteId };
}

type PortalPayload =
  | {
      kind: 'report';
      company: { name: string; logoUrl?: string | null; phone?: string | null; email?: string | null; website?: string | null } | null;
      report: {
        inspectionId: string;
        reportNumber: string | null;
        templateName: string | null;
        siteName: string | null;
        siteAddress: string | null;
        clientName: string | null;
        jobNumber: string | null;
        status: string | null;
        completedAt: string | null;
        docVersion: number;
        amendmentReason: string | null;
        pdfUrl: string | null;
        issuedAt: string | null;
      };
    }
  | {
      kind: 'portal';
      company: { name: string; logoUrl?: string | null; phone?: string | null; email?: string | null; website?: string | null } | null;
      client: { name: string; email?: string | null; phone?: string | null; address?: string | null } | null;
      quotes: Array<{ id: string; quote_number: string; status: string; total: number; validity_date: string | null; updated_at: string }>;
      invoices: Array<{ id: string; invoice_number: string; status: string; total: number; due_date: string | null; updated_at: string }>;
      jobs: Array<{ id: string; title: string; status: string; scheduled_date: string | null; job_number: number | null; address: string | null; updated_at: string }>;
      reports: Array<{
        inspectionId: string;
        reportNumber: string | null;
        templateName: string | null;
        siteName: string | null;
        status: string;
        completedAt: string | null;
        docVersion: number;
        pdfUrl: string | null;
        issuedAt: string | null;
      }>;
    };

async function fetchPortal(token: string): Promise<PortalPayload> {
  const { data, error } = await supabase.functions.invoke('client-portal', {
    body: { token },
  });
  if (error) throw new Error(error.message || 'Could not load portal');
  if (data?.error) throw new Error(String(data.error));
  return data as PortalPayload;
}

function portalQuoteStatusLabel(status: string): string {
  return QUOTE_STATUS_LABELS[status as keyof typeof QUOTE_STATUS_LABELS] ?? status;
}

function PortalFrame({ children }: { children: React.ReactNode }) {
  return (
    <div id="client-portal">
      <div className="portal-doc">{children}</div>
    </div>
  );
}

function CompanyHeader({
  company,
}: {
  company: {
    name: string;
    logoUrl?: string | null;
    phone?: string | null;
    email?: string | null;
    website?: string | null;
  } | null;
}) {
  if (!company) return null;
  return (
    <div className="portal-brand">
      {company.logoUrl ? (
        <img src={company.logoUrl} alt="" className="portal-brand-logo" />
      ) : (
        <div className="portal-brand-mark">
          <Building2 size={18} />
        </div>
      )}
      <div>
        <p className="portal-brand-name">{company.name}</p>
        <p className="portal-brand-muted">Client portal</p>
      </div>
    </div>
  );
}

export function ClientPortalPublicPage() {
  usePublicDocumentHead('portal');
  const [params] = useSearchParams();
  const token = useMemo(() => (params.get('t') || params.get('token') || '').trim(), [params]);
  const [acceptingId, setAcceptingId] = useState<string | null>(null);
  const [acceptError, setAcceptError] = useState<string | null>(null);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['client-portal-public', token],
    queryFn: () => fetchPortal(token),
    enabled: !!token,
    retry: 1,
  });

  const acceptQuote = async (quoteId: string) => {
    setAcceptingId(quoteId);
    setAcceptError(null);
    try {
      const { data: result, error: acceptErr } = await supabase.functions.invoke('client-portal', {
        body: portalQuoteAcceptBody(token, quoteId),
      });
      if (acceptErr) throw new Error(acceptErr.message || 'Could not accept quote');
      if (result?.error) throw new Error(String(result.error));
      await refetch();
    } catch (err) {
      setAcceptError(err instanceof Error ? err.message : 'Could not accept quote');
    } finally {
      setAcceptingId(null);
    }
  };

  if (!token) {
    return (
      <PortalFrame>
        <div className="portal-state">
          <div className="portal-sheet portal-state-card">
            <AlertCircle className="portal-state-icon" size={28} />
            <p className="portal-state-title">Missing portal link</p>
            <p className="portal-muted">Open the full link you were sent (it includes a secure token).</p>
          </div>
        </div>
      </PortalFrame>
    );
  }

  if (isLoading) {
    return (
      <PortalFrame>
        <div className="portal-state">
          <LoadingSpinner size="lg" />
        </div>
      </PortalFrame>
    );
  }

  if (isError || !data) {
    return (
      <PortalFrame>
        <div className="portal-state">
          <div className="portal-sheet portal-state-card">
            <AlertCircle className="portal-state-icon is-error" size={28} />
            <p className="portal-state-title">Unable to open portal</p>
            <p className="portal-muted">{error instanceof Error ? error.message : 'Invalid or expired link'}</p>
            <button type="button" onClick={() => refetch()} className="portal-quiet-link">Try again</button>
          </div>
        </div>
      </PortalFrame>
    );
  }

  if (data.kind === 'report') {
    const r = data.report;
    return (
      <PortalFrame>
        <CompanyHeader company={data.company} />
        <div className="portal-sheet portal-report">
          <div className="portal-report-head">
            <div>
              <p className="portal-kicker">Inspection report</p>
              <h1 className="portal-title">{r.siteName ?? 'Report'}</h1>
              {r.reportNumber && <p className="portal-mono">{r.reportNumber}</p>}
              {r.docVersion > 1 && (
                <p className="portal-muted">Version {r.docVersion}{r.amendmentReason ? ` — ${r.amendmentReason}` : ''}</p>
              )}
            </div>
            {r.pdfUrl && (
              <a
                href={r.pdfUrl}
                target="_blank"
                rel="noreferrer"
                className="portal-quiet-link"
              >
                <Download size={15} /> Download PDF
              </a>
            )}
          </div>
          <dl className="portal-dl">
            {r.clientName && <div><dt className="portal-muted">Client</dt><dd>{r.clientName}</dd></div>}
            {r.siteAddress && <div><dt className="portal-muted">Address</dt><dd>{r.siteAddress}</dd></div>}
            {r.templateName && <div><dt className="portal-muted">Template</dt><dd>{r.templateName}</dd></div>}
            {r.jobNumber && <div><dt className="portal-muted">Job #</dt><dd>{r.jobNumber}</dd></div>}
          </dl>
          {r.pdfUrl ? (
            <iframe title="Report PDF" src={r.pdfUrl} className="portal-report-frame" />
          ) : (
            <p className="portal-muted">PDF is not available yet. Ask the contractor to generate the report.</p>
          )}
        </div>
      </PortalFrame>
    );
  }

  return (
    <PortalFrame>
      <CompanyHeader company={data.company} />
      <div className="portal-letterhead">
        <h1 className="portal-title">{data.client?.name ?? 'Your account'}</h1>
        <p className="portal-muted">Quotes, invoices, jobs, and inspection reports</p>
      </div>

      <Section title="Quotes" icon={<FileText size={16} />} empty="No quotes" count={data.quotes.length}>
        {acceptError && (
          <p className="portal-quote-error">{acceptError}</p>
        )}
        {data.quotes.map(q => (
          <div key={q.id} className="portal-quote">
            <div className="portal-quote-meta">
              <div>
                <p className="portal-row-ref">{q.quote_number}</p>
                <p className="portal-muted">{portalQuoteStatusLabel(q.status)}</p>
              </div>
              <p className="portal-quote-total">{formatMoney(q.total)}</p>
            </div>
            {canAcceptPortalQuote(q.status) && (
              <button
                type="button"
                onClick={() => void acceptQuote(q.id)}
                disabled={acceptingId === q.id}
                className="portal-quote-accept"
              >
                {acceptingId === q.id ? 'Accepting...' : 'Accept'}
              </button>
            )}
          </div>
        ))}
      </Section>

      <Section title="Invoices" icon={<Receipt size={16} />} empty="No invoices" count={data.invoices.length}>
        {data.invoices.map(inv => (
          <div key={inv.id} className="portal-row portal-row-split">
            <div>
              <p className="portal-row-ref">{inv.invoice_number}</p>
              <p className="portal-muted">{inv.status}</p>
            </div>
            <p className="portal-quote-total">{formatMoney(inv.total)}</p>
          </div>
        ))}
      </Section>

      <Section title="Jobs" icon={<Wrench size={16} />} empty="No jobs" count={data.jobs.length}>
        {data.jobs.map(j => (
          <div key={j.id} className="portal-row">
            <p className="portal-row-ref">{j.title}</p>
            <p className="portal-muted">
              {j.status}
              {j.job_number != null ? ` · #${String(j.job_number).padStart(4, '0')}` : ''}
              {j.scheduled_date ? ` · ${format(parseISO(j.scheduled_date), 'dd MMM yyyy')}` : ''}
            </p>
          </div>
        ))}
      </Section>

      <Section title="Inspection reports" icon={<FileText size={16} />} empty="No issued reports yet" count={data.reports.length}>
        {data.reports.map(r => (
          <div key={r.inspectionId} className="portal-row">
            <div className="portal-row-main">
              <p className="portal-row-ref">{r.siteName ?? r.templateName ?? 'Report'}</p>
              <p className="portal-muted">
                {r.reportNumber ?? '—'}
                {r.issuedAt ? ` · ${format(parseISO(r.issuedAt), 'dd MMM yyyy')}` : ''}
                {r.docVersion > 1 ? ` · v${r.docVersion}` : ''}
              </p>
            </div>
            {r.pdfUrl && (
              <a href={r.pdfUrl} target="_blank" rel="noreferrer" className="portal-quiet-link">
                <Download size={13} /> PDF
              </a>
            )}
          </div>
        ))}
      </Section>
    </PortalFrame>
  );
}

function Section({
  title,
  icon,
  empty,
  children,
  count,
}: {
  title: string;
  icon: React.ReactNode;
  empty: string;
  children: React.ReactNode;
  count: number;
}) {
  return (
    <div className="portal-sheet">
      <div className="portal-sheet-head">
        <span className="portal-sheet-icon">{icon}</span>
        <h2 className="portal-sheet-title">{title}</h2>
      </div>
      {count === 0 ? (
        <p className="portal-empty">{empty}</p>
      ) : (
        <div>{children}</div>
      )}
    </div>
  );
}

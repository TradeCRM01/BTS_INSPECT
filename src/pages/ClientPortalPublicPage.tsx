import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { format, parseISO } from 'date-fns';
import { Check, Download, FileText, Receipt, Wrench, Building2, AlertCircle } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { LoadingSpinner } from '../components/ui/LoadingSpinner';
import { formatMoney } from '../types/fsm';

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
    <div className="flex items-center gap-3 mb-6">
      {company.logoUrl ? (
        <img src={company.logoUrl} alt="" className="h-10 w-auto object-contain" />
      ) : (
        <div className="w-10 h-10 rounded-lg bg-[#0A2540] text-white flex items-center justify-center">
          <Building2 size={18} />
        </div>
      )}
      <div>
        <p className="text-lg font-semibold text-[#1A1A1A]">{company.name}</p>
        <p className="text-xs text-[#6B7280]">Client portal</p>
      </div>
    </div>
  );
}

export function ClientPortalPublicPage() {
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
      <div className="min-h-screen bg-[#F8FAFC] flex items-center justify-center px-4">
        <div className="max-w-md w-full bg-white border border-[#E5E7EB] rounded-xl p-6 text-center">
          <AlertCircle className="mx-auto text-amber-500 mb-2" size={28} />
          <p className="font-medium text-[#1A1A1A]">Missing portal link</p>
          <p className="text-sm text-[#6B7280] mt-1">Open the full link you were sent (it includes a secure token).</p>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#F8FAFC] flex items-center justify-center">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="min-h-screen bg-[#F8FAFC] flex items-center justify-center px-4">
        <div className="max-w-md w-full bg-white border border-[#E5E7EB] rounded-xl p-6 text-center">
          <AlertCircle className="mx-auto text-red-500 mb-2" size={28} />
          <p className="font-medium text-[#1A1A1A]">Unable to open portal</p>
          <p className="text-sm text-[#6B7280] mt-1">{error instanceof Error ? error.message : 'Invalid or expired link'}</p>
          <button onClick={() => refetch()} className="mt-4 text-sm text-[#2E75B6] hover:underline">Try again</button>
        </div>
      </div>
    );
  }

  if (data.kind === 'report') {
    const r = data.report;
    return (
      <div className="min-h-screen bg-[#F8FAFC]">
        <div className="max-w-3xl mx-auto px-4 py-8">
          <CompanyHeader company={data.company} />
          <div className="bg-white border border-[#E5E7EB] rounded-xl p-5 shadow-sm">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div>
                <p className="text-xs uppercase tracking-wide text-[#6B7280] font-semibold">Inspection report</p>
                <h1 className="text-xl font-semibold text-[#1A1A1A] mt-1">{r.siteName ?? 'Report'}</h1>
                {r.reportNumber && <p className="text-sm font-mono text-[#4A5568] mt-1">{r.reportNumber}</p>}
                {r.docVersion > 1 && (
                  <p className="text-xs text-amber-700 mt-1">Version {r.docVersion}{r.amendmentReason ? ` — ${r.amendmentReason}` : ''}</p>
                )}
              </div>
              {r.pdfUrl && (
                <a
                  href={r.pdfUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 bg-[#0A2540] text-white px-3 py-2 rounded-md text-sm font-medium hover:bg-[#0d2f4e]"
                >
                  <Download size={15} /> Download PDF
                </a>
              )}
            </div>
            <dl className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
              {r.clientName && <div><dt className="text-[#6B7280] text-xs">Client</dt><dd className="text-[#1A1A1A]">{r.clientName}</dd></div>}
              {r.siteAddress && <div><dt className="text-[#6B7280] text-xs">Address</dt><dd className="text-[#1A1A1A]">{r.siteAddress}</dd></div>}
              {r.templateName && <div><dt className="text-[#6B7280] text-xs">Template</dt><dd className="text-[#1A1A1A]">{r.templateName}</dd></div>}
              {r.jobNumber && <div><dt className="text-[#6B7280] text-xs">Job #</dt><dd className="text-[#1A1A1A]">{r.jobNumber}</dd></div>}
            </dl>
            {r.pdfUrl ? (
              <iframe title="Report PDF" src={r.pdfUrl} className="mt-5 w-full h-[70vh] rounded-lg border border-[#E5E7EB] bg-white" />
            ) : (
              <p className="mt-4 text-sm text-[#6B7280]">PDF is not available yet. Ask the contractor to generate the report.</p>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      <div className="max-w-4xl mx-auto px-4 py-8">
        <CompanyHeader company={data.company} />
        <div className="mb-6">
          <h1 className="text-xl font-semibold text-[#1A1A1A]">{data.client?.name ?? 'Your account'}</h1>
          <p className="text-sm text-[#6B7280] mt-0.5">Quotes, invoices, jobs, and inspection reports</p>
        </div>

        <Section title="Inspection reports" icon={<FileText size={16} />} empty="No issued reports yet" count={data.reports.length}>
          {data.reports.map(r => (
            <div key={r.inspectionId} className="flex items-center justify-between gap-3 px-4 py-3 border-b border-[#F3F4F6] last:border-0">
              <div className="min-w-0">
                <p className="text-sm font-medium text-[#1A1A1A] truncate">{r.siteName ?? r.templateName ?? 'Report'}</p>
                <p className="text-xs text-[#6B7280]">
                  {r.reportNumber ?? '—'}
                  {r.issuedAt ? ` · ${format(parseISO(r.issuedAt), 'dd MMM yyyy')}` : ''}
                  {r.docVersion > 1 ? ` · v${r.docVersion}` : ''}
                </p>
              </div>
              {r.pdfUrl && (
                <a href={r.pdfUrl} target="_blank" rel="noreferrer" className="text-xs font-medium text-[#2E75B6] hover:underline shrink-0 flex items-center gap-1">
                  <Download size={13} /> PDF
                </a>
              )}
            </div>
          ))}
        </Section>

        <Section title="Jobs" icon={<Wrench size={16} />} empty="No jobs" count={data.jobs.length}>
          {data.jobs.map(j => (
            <div key={j.id} className="px-4 py-3 border-b border-[#F3F4F6] last:border-0">
              <p className="text-sm font-medium text-[#1A1A1A]">{j.title}</p>
              <p className="text-xs text-[#6B7280]">
                {j.status}
                {j.job_number != null ? ` · #${String(j.job_number).padStart(4, '0')}` : ''}
                {j.scheduled_date ? ` · ${format(parseISO(j.scheduled_date), 'dd MMM yyyy')}` : ''}
              </p>
            </div>
          ))}
        </Section>

        <Section title="Quotes" icon={<FileText size={16} />} empty="No quotes" count={data.quotes.length}>
          {acceptError && (
            <p className="text-xs text-red-600 px-4 pt-3">{acceptError}</p>
          )}
          {data.quotes.map(q => (
            <div key={q.id} className="flex justify-between gap-3 px-4 py-3 border-b border-[#F3F4F6] last:border-0">
              <div className="min-w-0">
                <p className="text-sm font-medium text-[#1A1A1A]">{q.quote_number}</p>
                <p className="text-xs text-[#6B7280]">{q.status}</p>
              </div>
              <div className="shrink-0 text-right">
                <p className="text-sm font-medium text-[#1A1A1A]">{formatMoney(q.total)}</p>
                {canAcceptPortalQuote(q.status) && (
                  <button
                    type="button"
                    onClick={() => void acceptQuote(q.id)}
                    disabled={acceptingId === q.id}
                    className="mt-2 inline-flex items-center justify-center gap-1.5 min-h-[44px] px-3 py-2 rounded-md text-sm font-medium bg-[#0A2540] text-white hover:bg-[#0d2f4e] disabled:opacity-60"
                  >
                    <Check size={15} />
                    {acceptingId === q.id ? 'Accepting...' : 'Accept'}
                  </button>
                )}
              </div>
            </div>
          ))}
        </Section>

        <Section title="Invoices" icon={<Receipt size={16} />} empty="No invoices" count={data.invoices.length}>
          {data.invoices.map(inv => (
            <div key={inv.id} className="flex justify-between gap-3 px-4 py-3 border-b border-[#F3F4F6] last:border-0">
              <div>
                <p className="text-sm font-medium text-[#1A1A1A]">{inv.invoice_number}</p>
                <p className="text-xs text-[#6B7280]">{inv.status}</p>
              </div>
              <p className="text-sm font-medium text-[#1A1A1A]">{formatMoney(inv.total)}</p>
            </div>
          ))}
        </Section>
      </div>
    </div>
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
    <div className="bg-white border border-[#E5E7EB] rounded-xl shadow-sm mb-4 overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-[#E5E7EB] bg-[#F9FAFB]">
        <span className="text-[#0A2540]">{icon}</span>
        <h2 className="text-sm font-semibold text-[#1A1A1A]">{title}</h2>
      </div>
      {count === 0 ? (
        <p className="text-sm text-[#6B7280] px-4 py-6 text-center">{empty}</p>
      ) : (
        <div>{children}</div>
      )}
    </div>
  );
}

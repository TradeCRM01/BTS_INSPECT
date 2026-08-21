import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Mail, User } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { supabase } from '../../lib/supabase';
import {
  decideReportSend,
  REPORT_SEND_CLIENT_COLUMNS,
  resolveReportClientId,
  type ReportSendBundle,
  type ReportSendClient,
  type ReportSendCompany,
  type ReportSendDecision,
} from '../../lib/sendReport';
import { deliverReport, loadReportSendBundle } from '../../lib/sendReportDeliver';
import { jobClientEmailRow, saveJobClientEmail } from '../../lib/saveJobClientEmail';
import {
  REPORT_CLIENT_ATTACH_NO_CLIENTS,
  attachReportClient,
  reportClientAttachRow,
} from '../../lib/attachReportClient';

/** Honest no_email miss — write the address on this dialog. */
export const REPORT_SEND_NO_EMAIL_FIELD =
  'This client has no email. Add one below before you send.';

export function ReportSendDialog({
  reportId,
  company,
  onClose,
  onSent,
}: {
  reportId: string;
  company: ReportSendCompany & { id: string };
  onClose: () => void;
  onSent: (to: string, message?: string) => void;
}) {
  const queryClient = useQueryClient();
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [savingEmail, setSavingEmail] = useState(false);
  const [bundle, setBundle] = useState<ReportSendBundle | null>(null);
  const [decision, setDecision] = useState<ReportSendDecision | null>(null);
  const [err, setErr] = useState('');
  const [clientEmailDraft, setClientEmailDraft] = useState('');
  const [clientAttachDraft, setClientAttachDraft] = useState('');
  const [savingAttach, setSavingAttach] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setErr('');
      try {
        const loaded = await loadReportSendBundle(reportId, company);
        if (cancelled) return;
        setBundle(loaded);
        setDecision(decideReportSend(loaded));
        setClientEmailDraft(loaded.client?.email ?? '');
        setClientAttachDraft('');
      } catch (e) {
        if (!cancelled) setErr(e instanceof Error ? e.message : 'Could not load this report.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  // Company identity is the send scope; latest company fields are used on each load.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reportId, company.id]);

  const reportClientId = resolveReportClientId(bundle?.inspection, bundle?.job);
  const emailRow = jobClientEmailRow({
    clientId: reportClientId,
    client: bundle?.client ?? null,
  });
  const noEmailMiss = decision != null && !decision.ok && decision.blocker === 'no_email';
  const noClientMiss = decision != null && !decision.ok && decision.blocker === 'no_client';
  const smtpMiss = decision != null && !decision.ok && decision.blocker === 'no_smtp';
  const showEmailEditor = !loading && noEmailMiss && emailRow.kind === 'edit';

  const attachClientsQuery = useQuery<{ id: string; name: string }[]>({
    queryKey: ['report-attach-clients', company.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('clients')
        .select('id, name')
        .eq('archived', false)
        .eq('company_id', company.id)
        .order('name', { ascending: true });
      if (error) throw error;
      return (data ?? []) as { id: string; name: string }[];
    },
    enabled: !loading && noClientMiss && !!company.id,
  });

  const attachRow = reportClientAttachRow({
    reportClientId,
    companyClients: reportClientId
      ? []
      : attachClientsQuery.isFetched
        ? (attachClientsQuery.data ?? [])
        : null,
  });

  const handleAttach = async () => {
    if (!bundle || attachRow.kind !== 'pick') return;
    setSavingAttach(true);
    setErr('');
    try {
      const result = await attachReportClient({
        jobId: bundle.job?.id,
        inspectionId: bundle.inspection?.id,
        reportClientId,
        clientId: clientAttachDraft,
        companyClients: attachClientsQuery.data ?? [],
      });
      const clientRes = await supabase
        .from('clients')
        .select(REPORT_SEND_CLIENT_COLUMNS)
        .eq('id', result.clientId)
        .maybeSingle();
      if (clientRes.error) throw clientRes.error;
      const attached = (clientRes.data ?? null) as ReportSendClient | null;
      const picked = attachRow.clients.find(c => c.id === result.clientId);
      const next: ReportSendBundle = {
        ...bundle,
        job: result.target === 'job' && bundle.job
          ? { ...bundle.job, client_id: result.clientId }
          : bundle.job,
        inspection: result.target === 'inspection' && bundle.inspection
          ? { ...bundle.inspection, client_id: result.clientId }
          : bundle.inspection,
        client: attached ?? (picked
          ? { id: picked.id, name: picked.name, email: null, phone: null }
          : null),
      };
      setBundle(next);
      setDecision(decideReportSend(next));
      setClientEmailDraft(next.client?.email ?? '');
      setClientAttachDraft('');
      void queryClient.invalidateQueries({ queryKey: ['job-client', result.clientId] });
      void queryClient.invalidateQueries({ queryKey: ['job'] });
      void queryClient.invalidateQueries({ queryKey: ['inspections'] });
      void queryClient.invalidateQueries({ queryKey: ['inspection'] });
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not attach the client.');
    } finally {
      setSavingAttach(false);
    }
  };

  const handleSaveEmail = async () => {
    if (emailRow.kind !== 'edit' || !bundle) return;
    setSavingEmail(true);
    setErr('');
    try {
      const result = await saveJobClientEmail({
        clientId: emailRow.clientId,
        email: clientEmailDraft,
      });
      const next: ReportSendBundle = {
        ...bundle,
        client: bundle.client ? { ...bundle.client, email: result.email } : bundle.client,
      };
      setBundle(next);
      setDecision(decideReportSend(next));
      setClientEmailDraft(result.email ?? '');
      void queryClient.invalidateQueries({ queryKey: ['job-client', result.clientId] });
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not save the email.');
    } finally {
      setSavingEmail(false);
    }
  };

  const handleSend = async () => {
    setSending(true);
    setErr('');
    try {
      const result = await deliverReport({ reportId, company });
      if (!result.ok) {
        setErr(result.message);
        return;
      }
      onSent(result.to, result.message);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not send the report.');
    } finally {
      setSending(false);
    }
  };

  const ready = decision?.ok === true;
  const blockerHref = decision && !decision.ok ? decision.href : undefined;
  const blockerMessage = noEmailMiss
    ? REPORT_SEND_NO_EMAIL_FIELD
    : (decision && !decision.ok ? decision.message : '');
  const reportLabel = bundle?.report?.report_number
    ? `Report ${bundle.report.report_number}`
    : '';
  const pdfName = ready && decision.ok
    ? (bundle?.existingPdf?.filename ?? decision.filename)
    : '';
  const showSend = !loading && (ready || (noEmailMiss && !!reportClientId) || noClientMiss);
  const showSmtpSettings = !loading && smtpMiss && !!blockerHref;

  return (
    <Modal open onClose={onClose} size="md">
      <div className="hub-invoice-send">
        <div className="hub-invoice-send-head">
          <div className="min-w-0">
            <h2 className="hub-invoice-send-title">Send report</h2>
            {reportLabel ? <p className="hub-invoice-muted mt-1">{reportLabel}</p> : null}
          </div>
        </div>

        <div className="hub-invoice-send-body">
          {loading && <p className="hub-invoice-muted">Loading send details…</p>}

          {!loading && ready && decision.ok && (
            <>
              <div className="hub-invoice-send-tos">
                <div className="hub-invoice-send-field">
                  <p className="hub-invoice-kicker">To</p>
                  <p className="hub-invoice-send-value">{decision.to}</p>
                  <p className="hub-invoice-muted">{decision.toName} — already on this job.</p>
                </div>
                <div className="hub-invoice-send-field">
                  <p className="hub-invoice-kicker">SMS To</p>
                  <p className={`hub-invoice-send-value tabular-nums${decision.smsTo ? '' : ' is-miss'}`}>
                    {decision.smsTo || 'No client phone'}
                  </p>
                  {decision.smsTo ? null : (
                    <p className="hub-invoice-muted">{decision.smsMessage}</p>
                  )}
                </div>
              </div>
              <div className="hub-invoice-send-field">
                <p className="hub-invoice-kicker">Subject</p>
                <p className="hub-invoice-send-value">{decision.subject}</p>
              </div>
              <div className="hub-invoice-send-field">
                <p className="hub-invoice-kicker">PDF</p>
                <p className="hub-invoice-pdf">{pdfName}</p>
              </div>
            </>
          )}

          {!loading && !ready && (
            <>
              <p className="hub-invoice-err">{blockerMessage || err || 'This report cannot be sent yet.'}</p>
              {noClientMiss && attachRow.kind === 'pick' && (
                <form
                  className="job-client-attach"
                  onSubmit={e => {
                    e.preventDefault();
                    void handleAttach();
                  }}
                >
                  <User size={13} />
                  <select
                    value={clientAttachDraft}
                    onChange={e => setClientAttachDraft(e.target.value)}
                    className="form-input-sm"
                    aria-label="Attach client"
                  >
                    <option value="">Client</option>
                    {attachRow.clients.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                  <button
                    type="submit"
                    className="job-client-attach-save"
                    disabled={savingAttach || !clientAttachDraft}
                  >
                    Save
                  </button>
                </form>
              )}
              {noClientMiss && attachRow.kind === 'miss' && (
                <p className="hub-invoice-muted">{REPORT_CLIENT_ATTACH_NO_CLIENTS}</p>
              )}
              {showEmailEditor && emailRow.kind === 'edit' && (
                <form
                  className="job-client-email"
                  onSubmit={e => {
                    e.preventDefault();
                    void handleSaveEmail();
                  }}
                >
                  <Mail size={13} />
                  <input
                    type="email"
                    value={clientEmailDraft}
                    onChange={e => setClientEmailDraft(e.target.value)}
                    placeholder="Email"
                    className="form-input-sm"
                    aria-label="Client email"
                    autoComplete="email"
                  />
                  <button
                    type="submit"
                    className="job-client-email-save"
                    disabled={savingEmail}
                  >
                    Save
                  </button>
                </form>
              )}
            </>
          )}

          {err && ready && <p className="hub-invoice-err">{err}</p>}
          {err && !ready && blockerMessage && err !== blockerMessage && (
            <p className="hub-invoice-err">{err}</p>
          )}
        </div>

        <div className="hub-invoice-send-foot">
          <button type="button" onClick={onClose} className="ops-link shrink-0">
            Cancel
          </button>
          {showSend && (
            <button type="button" onClick={() => void handleSend()} disabled={sending || !ready} className="btn-primary">
              {sending ? 'Sending…' : 'Send report'}
            </button>
          )}
          {showSmtpSettings && blockerHref && (
            <Link to={blockerHref} className="btn-primary" onClick={onClose}>
              Company settings
            </Link>
          )}
        </div>
      </div>
    </Modal>
  );
}

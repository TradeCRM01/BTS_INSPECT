import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Mail } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { generateCommercialPdf } from '../../reports/commercial/generateCommercialPdf';
import {
  commercialPdfDataForInvoice,
  decideInvoiceSend,
  padInvoiceNumber,
  type InvoiceSendBundle,
  type InvoiceSendCompany,
  type InvoiceSendDecision,
} from '../../lib/sendInvoice';
import { deliverInvoice, loadInvoiceSendBundle } from '../../lib/sendInvoiceDeliver';
import { invoiceSendXeroMissLine } from '../../lib/xeroAccounting';
import { jobClientEmailRow, saveJobClientEmail } from '../../lib/saveJobClientEmail';

/** Honest no_email miss — write the address on this dialog. */
export const INVOICE_SEND_NO_EMAIL_FIELD =
  'This client has no email. Add one below before you send.';

export function InvoiceSendDialog({
  invoiceId,
  company,
  onClose,
  onSent,
}: {
  invoiceId: string;
  company: InvoiceSendCompany & { id: string };
  onClose: () => void;
  onSent: (to: string, message?: string, opts?: { keepOpen?: boolean }) => void;
}) {
  const queryClient = useQueryClient();
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [savingEmail, setSavingEmail] = useState(false);
  const [bundle, setBundle] = useState<InvoiceSendBundle | null>(null);
  const [decision, setDecision] = useState<InvoiceSendDecision | null>(null);
  const [err, setErr] = useState('');
  const [xeroMiss, setXeroMiss] = useState('');
  const [clientEmailDraft, setClientEmailDraft] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setErr('');
      try {
        const loaded = await loadInvoiceSendBundle(invoiceId, company);
        if (cancelled) return;
        setBundle(loaded);
        setDecision(decideInvoiceSend(loaded));
        setClientEmailDraft(loaded.client?.email ?? '');
      } catch (e) {
        if (!cancelled) setErr(e instanceof Error ? e.message : 'Could not load this invoice.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  // Company identity is the send scope; latest company fields are used on each load.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invoiceId, company.id]);

  const invoiceClientId = bundle?.invoice?.client_id ?? null;
  const emailRow = jobClientEmailRow({
    clientId: invoiceClientId,
    client: bundle?.client ?? null,
  });
  const noEmailMiss = decision != null && !decision.ok && decision.blocker === 'no_email';
  const smtpMiss = decision != null && !decision.ok && decision.blocker === 'no_smtp';
  const showEmailEditor = !loading && noEmailMiss && emailRow.kind === 'edit';

  const handleSaveEmail = async () => {
    if (emailRow.kind !== 'edit' || !bundle) return;
    setSavingEmail(true);
    setErr('');
    try {
      const result = await saveJobClientEmail({
        clientId: emailRow.clientId,
        email: clientEmailDraft,
      });
      const next: InvoiceSendBundle = {
        ...bundle,
        client: bundle.client ? { ...bundle.client, email: result.email } : bundle.client,
      };
      setBundle(next);
      setDecision(decideInvoiceSend(next));
      setClientEmailDraft(result.email ?? '');
      void queryClient.invalidateQueries({ queryKey: ['invoices'] });
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
    setXeroMiss('');
    try {
      const result = await deliverInvoice({
        invoiceId,
        company,
        buildPdf: async (loaded) => {
          const data = commercialPdfDataForInvoice(loaded);
          if (!data) throw new Error('Could not build the invoice PDF.');
          return generateCommercialPdf(data);
        },
      });
      if (!result.ok) {
        setErr(result.message);
        return;
      }
      const miss = invoiceSendXeroMissLine(result.xero);
      if (miss) {
        setXeroMiss(miss);
        onSent(result.to, result.message, { keepOpen: true });
        return;
      }
      onSent(result.to, result.message);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not send the invoice.');
    } finally {
      setSending(false);
    }
  };

  const ready = decision?.ok === true;
  const blockerHref = decision && !decision.ok ? decision.href : undefined;
  const blockerMessage = noEmailMiss
    ? INVOICE_SEND_NO_EMAIL_FIELD
    : (decision && !decision.ok ? decision.message : '');
  const invoiceLabel = bundle?.invoice
    ? `Invoice #${padInvoiceNumber(bundle.invoice.invoice_number)}`
    : '';
  const chaseCopy = ready && decision.ok && /overdue/i.test(decision.subject);
  const pdfName = ready && decision.ok
    ? (bundle?.existingPdf?.filename ?? decision.filename)
    : '';
  const showSend = !loading && (ready || (noEmailMiss && emailRow.kind === 'edit'));
  const showSmtpSettings = !loading && smtpMiss && !!blockerHref;
  const showOpenClient = !loading && !ready && !showEmailEditor && !smtpMiss && !!blockerHref;

  return (
    <Modal open onClose={onClose} size="md">
      <div className="hub-invoice-send">
        <div className="hub-invoice-send-head">
          <div className="min-w-0">
            <h2 className="hub-invoice-send-title">Send invoice</h2>
            {invoiceLabel ? (
              <p className="hub-invoice-muted mt-1">
                {invoiceLabel}{chaseCopy ? ' · Overdue' : ''}
              </p>
            ) : null}
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
                  <p className="hub-invoice-muted">{decision.toName} — already on the invoice.</p>
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
              {xeroMiss ? (
                <p className="hub-invoice-send-xero-miss">{xeroMiss}</p>
              ) : null}
            </>
          )}

          {!loading && !ready && (
            <>
              <p className="hub-invoice-err">{blockerMessage || err || 'This invoice cannot be sent yet.'}</p>
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
              {sending ? 'Sending…' : 'Send invoice'}
            </button>
          )}
          {showSmtpSettings && blockerHref && (
            <Link to={blockerHref} className="btn-primary" onClick={onClose}>
              Company settings
            </Link>
          )}
          {showOpenClient && blockerHref && (
            <Link to={blockerHref} className="btn-primary" onClick={onClose}>
              Open client
            </Link>
          )}
        </div>
      </div>
    </Modal>
  );
}

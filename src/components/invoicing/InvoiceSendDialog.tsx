import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
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

export function InvoiceSendDialog({
  invoiceId,
  company,
  onClose,
  onSent,
}: {
  invoiceId: string;
  company: InvoiceSendCompany & { id: string };
  onClose: () => void;
  onSent: (to: string) => void;
}) {
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [bundle, setBundle] = useState<InvoiceSendBundle | null>(null);
  const [decision, setDecision] = useState<InvoiceSendDecision | null>(null);
  const [err, setErr] = useState('');

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

  const handleSend = async () => {
    if (!decision?.ok) return;
    setSending(true);
    setErr('');
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
      onSent(result.to);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not send the invoice.');
    } finally {
      setSending(false);
    }
  };

  const ready = decision?.ok === true;
  const blockerHref = decision && !decision.ok ? decision.href : undefined;
  const blockerMessage = decision && !decision.ok ? decision.message : '';
  const invoiceLabel = bundle?.invoice
    ? `Invoice #${padInvoiceNumber(bundle.invoice.invoice_number)}`
    : '';

  return (
    <Modal
      open
      onClose={onClose}
      size="md"
      title="Send invoice"
      subtitle={invoiceLabel || undefined}
      footer={(
        <div className="flex items-center justify-between gap-2">
          <button type="button" onClick={onClose} className="ops-link shrink-0">
            Cancel
          </button>
          {ready && (
            <button type="button" onClick={() => void handleSend()} disabled={sending} className="btn-primary">
              {sending ? 'Sending…' : 'Send invoice'}
            </button>
          )}
          {!ready && blockerHref && !loading && (
            <Link to={blockerHref} className="btn-primary" onClick={onClose}>
              {decision && !decision.ok && decision.blocker === 'no_smtp' ? 'Company settings' : 'Open client'}
            </Link>
          )}
        </div>
      )}
    >
      <div className="px-5 py-4 space-y-3">
        {loading && <p className="ops-meta">Loading send details…</p>}

        {!loading && ready && decision.ok && (
          <>
            <label className="block">
              <span className="ops-field-label">To</span>
              <input
                type="email"
                readOnly
                value={decision.to}
                className="form-input"
                aria-label="Invoice recipient"
              />
              <p className="ops-meta mt-1">{decision.toName} — already on the invoice.</p>
            </label>
            <div>
              <p className="ops-field-label">Subject</p>
              <p className="text-sm text-navy">{decision.subject}</p>
            </div>
            <div>
              <p className="ops-field-label">PDF</p>
              <p className="ops-meta">
                {bundle?.existingPdf?.filename
                  ? `${bundle.existingPdf.filename} (already on file)`
                  : decision.filename}
              </p>
            </div>
          </>
        )}

        {!loading && !ready && (
          <p className="text-sm text-fail">{blockerMessage || err || 'This invoice cannot be sent yet.'}</p>
        )}

        {err && ready && <p className="text-sm text-fail">{err}</p>}
      </div>
    </Modal>
  );
}

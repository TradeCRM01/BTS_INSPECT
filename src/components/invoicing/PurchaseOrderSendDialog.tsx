import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Modal } from '../ui/Modal';
import { generateCommercialPdf } from '../../reports/commercial/generateCommercialPdf';
import {
  commercialPdfDataForPurchaseOrder,
  decidePurchaseOrderSend,
  padPurchaseOrderNumber,
  type PurchaseOrderSendBundle,
  type PurchaseOrderSendCompany,
  type PurchaseOrderSendDecision,
} from '../../lib/sendPurchaseOrder';
import { deliverPurchaseOrder, loadPurchaseOrderSendBundle } from '../../lib/sendPurchaseOrderDeliver';

export function PurchaseOrderSendDialog({
  purchaseOrderId,
  company,
  onClose,
  onSent,
}: {
  purchaseOrderId: string;
  company: PurchaseOrderSendCompany & { id: string };
  onClose: () => void;
  onSent: (to: string, message?: string) => void;
}) {
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [bundle, setBundle] = useState<PurchaseOrderSendBundle | null>(null);
  const [decision, setDecision] = useState<PurchaseOrderSendDecision | null>(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setErr('');
      try {
        const loaded = await loadPurchaseOrderSendBundle(purchaseOrderId, company);
        if (cancelled) return;
        setBundle(loaded);
        setDecision(decidePurchaseOrderSend(loaded));
      } catch (e) {
        if (!cancelled) setErr(e instanceof Error ? e.message : 'Could not load this purchase order.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  // Company identity is the send scope; latest company fields are used on each load.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [purchaseOrderId, company.id]);

  const handleSend = async () => {
    setSending(true);
    setErr('');
    try {
      const result = await deliverPurchaseOrder({
        purchaseOrderId,
        company,
        buildPdf: async (loaded) => {
          const data = commercialPdfDataForPurchaseOrder(loaded);
          if (!data) throw new Error('Could not build the purchase order PDF.');
          return generateCommercialPdf(data);
        },
      });
      if (!result.ok) {
        setErr(result.message);
        return;
      }
      onSent(result.to, result.message);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not send the purchase order.');
    } finally {
      setSending(false);
    }
  };

  const ready = decision?.ok === true;
  const blockerHref = decision && !decision.ok ? decision.href : undefined;
  const blockerMessage = decision && !decision.ok ? decision.message : '';
  const poLabel = bundle?.po ? `PO #${padPurchaseOrderNumber(bundle.po.po_number)}` : '';
  const pdfName = ready && decision.ok ? decision.filename : '';
  const smtpMiss = decision != null && !decision.ok && decision.blocker === 'no_smtp';
  const showSend = !loading && ready;
  const showSmtpSettings = !loading && smtpMiss && !!blockerHref;
  const showSupplierLink = !loading && !ready && !smtpMiss && !!blockerHref;

  return (
    <Modal open onClose={onClose} size="md">
      <div className="hub-invoice-send">
        <div className="hub-invoice-send-head">
          <div className="min-w-0">
            <h2 className="hub-invoice-send-title">Send purchase order</h2>
            {poLabel ? <p className="hub-invoice-muted mt-1">{poLabel}</p> : null}
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
                  <p className="hub-invoice-muted">{decision.toName} — already on the purchase order.</p>
                </div>
                <div className="hub-invoice-send-field">
                  <p className="hub-invoice-kicker">SMS To</p>
                  <p className={`hub-invoice-send-value tabular-nums${decision.smsTo ? '' : ' is-miss'}`}>
                    {decision.smsTo || 'No supplier phone'}
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
            <p className="hub-invoice-err">{blockerMessage || err || 'This purchase order cannot be sent yet.'}</p>
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
              {sending ? 'Sending…' : 'Send PO'}
            </button>
          )}
          {showSmtpSettings && blockerHref && (
            <Link to={blockerHref} className="btn-primary" onClick={onClose}>
              Company settings
            </Link>
          )}
          {showSupplierLink && blockerHref && (
            <Link to={blockerHref} className="btn-primary" onClick={onClose}>
              Supplier record
            </Link>
          )}
        </div>
      </div>
    </Modal>
  );
}

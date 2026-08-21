import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Modal } from '../ui/Modal';
import { generateCommercialPdf } from '../../reports/commercial/generateCommercialPdf';
import { padQuoteNumber } from '../../lib/quoteJobFields';
import {
  commercialPdfDataForQuote,
  decideQuoteSend,
  type QuoteSendBundle,
  type QuoteSendCompany,
  type QuoteSendDecision,
} from '../../lib/sendQuote';
import { deliverQuote, loadQuoteSendBundle } from '../../lib/sendQuoteDeliver';

export function QuoteSendDialog({
  quoteId,
  company,
  onClose,
  onSent,
}: {
  quoteId: string;
  company: QuoteSendCompany & { id: string };
  onClose: () => void;
  onSent: (to: string) => void;
}) {
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [bundle, setBundle] = useState<QuoteSendBundle | null>(null);
  const [decision, setDecision] = useState<QuoteSendDecision | null>(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setErr('');
      try {
        const loaded = await loadQuoteSendBundle(quoteId, company);
        if (cancelled) return;
        setBundle(loaded);
        setDecision(decideQuoteSend(loaded));
      } catch (e) {
        if (!cancelled) setErr(e instanceof Error ? e.message : 'Could not load this quote.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  // Company identity is the send scope; latest company fields are used on each load.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quoteId, company.id]);

  const handleSend = async () => {
    if (!decision?.ok) return;
    setSending(true);
    setErr('');
    try {
      const result = await deliverQuote({
        quoteId,
        company,
        buildPdf: async (loaded) => {
          const data = commercialPdfDataForQuote(loaded);
          if (!data) throw new Error('Could not build the quote PDF.');
          return generateCommercialPdf(data);
        },
      });
      if (!result.ok) {
        setErr(result.message);
        return;
      }
      onSent(result.to);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not send the quote.');
    } finally {
      setSending(false);
    }
  };

  const ready = decision?.ok === true;
  const blockerHref = decision && !decision.ok ? decision.href : undefined;
  const blockerMessage = decision && !decision.ok ? decision.message : '';
  const quoteLabel = bundle?.quote ? `Quote #${padQuoteNumber(bundle.quote.quote_number)}` : '';

  return (
    <Modal open onClose={onClose} size="md">
      <div className="hub-quote-send">
        <div className="hub-quote-send-head">
          <div className="min-w-0">
            <h2 className="hub-quote-send-title">Send quote</h2>
            {quoteLabel ? <p className="hub-quote-muted mt-1">{quoteLabel}</p> : null}
          </div>
        </div>

        <div className="hub-quote-send-body">
          {loading && <p className="hub-quote-muted">Loading send details…</p>}

          {!loading && ready && decision.ok && (
            <>
              <div className="hub-quote-send-field">
                <p className="hub-quote-kicker">To</p>
                <p className="hub-quote-send-value">{decision.to}</p>
                <p className="hub-quote-muted">{decision.toName} — already on the quote.</p>
              </div>
              <div className="hub-quote-send-field">
                <p className="hub-quote-kicker">Subject</p>
                <p className="hub-quote-send-value">{decision.subject}</p>
              </div>
              <div className="hub-quote-send-field">
                <p className="hub-quote-kicker">PDF</p>
                <p className="hub-quote-pdf">{decision.filename}</p>
              </div>
            </>
          )}

          {!loading && !ready && (
            <p className="text-sm text-fail">{blockerMessage || err || 'This quote cannot be sent yet.'}</p>
          )}

          {err && ready && <p className="text-sm text-fail">{err}</p>}
        </div>

        <div className="hub-quote-send-foot">
          <button type="button" onClick={onClose} className="ops-link shrink-0">
            Cancel
          </button>
          {ready && (
            <button type="button" onClick={() => void handleSend()} disabled={sending} className="btn-primary">
              {sending ? 'Sending…' : 'Send quote'}
            </button>
          )}
          {!ready && blockerHref && !loading && (
            <Link to={blockerHref} className="btn-primary" onClick={onClose}>
              {decision && !decision.ok && decision.blocker === 'no_smtp' ? 'Company settings' : 'Open client'}
            </Link>
          )}
        </div>
      </div>
    </Modal>
  );
}

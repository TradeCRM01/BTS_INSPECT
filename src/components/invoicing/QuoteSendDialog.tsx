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
  onSent: (to: string, message?: string) => void;
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
      onSent(result.to, result.message);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not send the quote.');
    } finally {
      setSending(false);
    }
  };

  const ready = decision?.ok === true;
  const blockerHref = decision && !decision.ok ? decision.href : undefined;
  const smtpMiss = decision != null && !decision.ok && decision.blocker === 'no_smtp';
  const noEmailMiss = decision != null && !decision.ok && decision.blocker === 'no_email';
  const blockerMessage = decision && !decision.ok ? decision.message : '';
  const quoteLabel = bundle?.quote ? `Quote #${padQuoteNumber(bundle.quote.quote_number)}` : '';
  const pdfName = ready && decision.ok ? decision.filename : '';
  const showSend = !loading && ready;
  const showSmtpSettings = !loading && smtpMiss && !!blockerHref;
  const showOpenClient = !loading && noEmailMiss && !!blockerHref;

  return (
    <Modal open onClose={onClose} size="md">
      <div className="hub-invoice-send">
        <div className="hub-invoice-send-head">
          <div className="min-w-0">
            <h2 className="hub-invoice-send-title">Send quote</h2>
            {quoteLabel ? <p className="hub-invoice-muted mt-1">{quoteLabel}</p> : null}
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
                  <p className="hub-invoice-muted">{decision.toName} — already on the quote.</p>
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
            <p className="hub-invoice-err">{blockerMessage || err || 'This quote cannot be sent yet.'}</p>
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
              {sending ? 'Sending…' : 'Send quote'}
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

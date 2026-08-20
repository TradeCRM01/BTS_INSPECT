import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Mail, Paperclip } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { generateCommercialPdf } from '../../reports/commercial/generateCommercialPdf';
import { padQuoteNumber } from '../../lib/quoteJobFields';
import {
  commercialPdfDataForQuote,
  decideQuoteSend,
  deliverQuote,
  loadQuoteSendBundle,
  type QuoteSendBundle,
  type QuoteSendCompany,
  type QuoteSendDecision,
} from '../../lib/sendQuote';

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

  return (
    <Modal
      open
      onClose={onClose}
      size="md"
      title="Send quote"
      subtitle={bundle?.quote ? `#${padQuoteNumber(bundle.quote.quote_number)}` : undefined}
      footer={
        <div className="flex items-center gap-2">
          <button type="button" onClick={onClose} className="btn-ghost ml-auto">Cancel</button>
          {ready && (
            <button type="button" onClick={() => void handleSend()} disabled={sending} className="btn-primary">
              <Mail size={14} /> {sending ? 'Sending…' : 'Send'}
            </button>
          )}
          {!ready && blockerHref && !loading && (
            <Link to={blockerHref} className="btn-primary" onClick={onClose}>
              {decision && !decision.ok && decision.blocker === 'no_smtp' ? 'Company settings' : 'Open client'}
            </Link>
          )}
        </div>
      }
    >
      <div className="p-5 space-y-3">
        {loading && <p className="ops-meta">Loading send details…</p>}

        {!loading && ready && decision.ok && (
          <>
            <Field label="To">
              <input
                readOnly
                value={decision.to}
                className="form-input bg-zebra"
                aria-label="To"
              />
              <p className="ops-meta mt-1">{decision.toName} — already on the quote. No retype.</p>
            </Field>
            <Field label="Subject">
              <input readOnly value={decision.subject} className="form-input bg-zebra" aria-label="Subject" />
            </Field>
            <div className="flex items-center gap-2 ops-meta">
              <Paperclip size={14} />
              <span>{decision.filename} attached</span>
            </div>
          </>
        )}

        {!loading && !ready && (
          <p className="text-sm text-red-600">{blockerMessage || err || 'This quote cannot be sent yet.'}</p>
        )}

        {err && ready && <p className="text-sm text-red-600">{err}</p>}
      </div>
    </Modal>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block ops-meta font-medium mb-1">{label}</label>
      {children}
    </div>
  );
}

import { useEffect, useState } from 'react';
import { Modal } from '../ui/Modal';
import { padQuoteNumber } from '../../lib/quoteJobFields';
import { documentShareOrigin, quoteChaseCopyText } from '../../lib/documentShare';
import {
  copyShareText,
  ensureClientPortalUrl,
  type ShareCopyResult,
} from '../../lib/documentShareDeliver';
import {
  QUOTE_CHASE_COPY_DISABLED,
  quoteChaseCopyDisabledReason,
  quoteChaseMarkPatch,
} from '../../lib/nudges';
import { supabase } from '../../lib/supabase';
import { formatMoney } from '../../types/fsm';

export type QuoteChaseTarget = {
  id: string;
  quote_number: number | null;
  status: string;
  client_id: string | null;
  client_name?: string | null;
  total: number;
  chased_at?: string | null;
};

export function QuoteChaseDialog({
  quote,
  company,
  onClose,
  onChased,
}: {
  quote: QuoteChaseTarget;
  company: { id: string; name: string };
  onClose: () => void;
  onChased: () => void;
}) {
  const [portalUrl, setPortalUrl] = useState<string | null>(null);
  const [portalBusy, setPortalBusy] = useState(!!quote.client_id);
  const [copying, setCopying] = useState(false);
  const [marking, setMarking] = useState(false);
  const [copy, setCopy] = useState<ShareCopyResult | null>(null);
  const [err, setErr] = useState('');

  const preview = portalUrl
    ? quoteChaseCopyText({
        clientName: quote.client_name,
        companyName: company.name,
        quoteNumber: quote.quote_number,
        total: quote.total,
        portalUrl,
      })
    : '';
  const copyBlocked = quoteChaseCopyDisabledReason({
    clientId: quote.client_id,
    portalUrl,
  });
  const markPatch = quoteChaseMarkPatch(quote, new Date());

  useEffect(() => {
    let cancelled = false;
    const clientId = (quote.client_id ?? '').trim();
    if (!clientId) {
      setPortalUrl(null);
      setPortalBusy(false);
      return;
    }
    setPortalBusy(true);
    setErr('');
    (async () => {
      try {
        const url = await ensureClientPortalUrl({
          companyId: company.id,
          clientId,
          origin: documentShareOrigin(
            typeof window !== 'undefined' ? window.location.origin : '',
          ),
        });
        if (!cancelled) setPortalUrl(url);
      } catch (e) {
        if (!cancelled) {
          setPortalUrl(null);
          setErr(e instanceof Error ? e.message : QUOTE_CHASE_COPY_DISABLED);
        }
      } finally {
        if (!cancelled) setPortalBusy(false);
      }
    })();
    return () => { cancelled = true; };
  }, [company.id, quote.client_id]);

  async function handleCopy() {
    if (copyBlocked || !preview) return;
    setCopying(true);
    setErr('');
    try {
      const result = await copyShareText(async () => preview);
      setCopy(result);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not copy the chase message.');
    } finally {
      setCopying(false);
    }
  }

  async function handleMarkChased() {
    const patch = quoteChaseMarkPatch(quote, new Date());
    if (!patch) return;
    setMarking(true);
    setErr('');
    try {
      const { error } = await supabase
        .from('quotes')
        .update(patch)
        .eq('id', quote.id)
        .eq('status', 'sent');
      if (error) throw error;
      onChased();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not mark this quote chased.');
    } finally {
      setMarking(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      size="md"
      closeOnEscape
      title={`Chase quote #${padQuoteNumber(quote.quote_number)}`}
      subtitle={quote.client_name?.trim() || 'No client'}
    >
      <div className="hub-quote-chase">
        <p className="hub-quote-chase-kicker">Chase message</p>
        {portalBusy ? (
          <p className="hub-quote-chase-preview is-wait">Preparing the portal link…</p>
        ) : preview ? (
          <p className="hub-quote-chase-preview">{preview}</p>
        ) : (
          <p className="hub-quote-chase-preview is-miss">{QUOTE_CHASE_COPY_DISABLED}</p>
        )}
        <p className="hub-quote-chase-meta">
          {formatMoney(Number(quote.total ?? 0))} inc GST · status stays sent
        </p>
        {copy?.kind === 'copied' ? (
          <p className="hub-quote-chase-ok">Copied. Mark chased when you have followed up.</p>
        ) : null}
        {copy?.kind === 'manual' ? (
          <textarea className="hub-quote-chase-manual" readOnly value={copy.text} />
        ) : null}
        {err ? <p className="hub-quote-chase-err">{err}</p> : null}
        <div className="hub-quote-chase-actions">
          <button
            type="button"
            className="btn-primary"
            disabled={!!copyBlocked || portalBusy || copying || !preview}
            title={copyBlocked ?? undefined}
            onClick={() => { void handleCopy(); }}
          >
            {copying ? 'Copying…' : 'Copy chase message'}
          </button>
          <button
            type="button"
            className="hub-quote-chase-mark"
            disabled={!markPatch || marking}
            onClick={() => { void handleMarkChased(); }}
          >
            {marking ? 'Saving…' : 'Mark chased'}
          </button>
        </div>
        {copyBlocked ? (
          <p className="hub-quote-chase-reason">{copyBlocked}</p>
        ) : null}
      </div>
    </Modal>
  );
}

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Mail, Phone } from 'lucide-react';
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
import { jobClientEmailRow, saveJobClientEmail } from '../../lib/saveJobClientEmail';
import { jobClientPhoneRow, saveJobClientPhone } from '../../lib/saveJobClientPhone';

/** Honest no_email miss — write the address on this dialog. */
export const QUOTE_SEND_NO_EMAIL_FIELD =
  'This client has no email. Add one below before you send.';

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
  const queryClient = useQueryClient();
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [savingEmail, setSavingEmail] = useState(false);
  const [savingPhone, setSavingPhone] = useState(false);
  const [bundle, setBundle] = useState<QuoteSendBundle | null>(null);
  const [decision, setDecision] = useState<QuoteSendDecision | null>(null);
  const [err, setErr] = useState('');
  const [clientEmailDraft, setClientEmailDraft] = useState('');
  const [clientPhoneDraft, setClientPhoneDraft] = useState('');

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
        setClientEmailDraft(loaded.client?.email ?? '');
        setClientPhoneDraft(loaded.client?.phone ?? '');
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

  const quoteClientId = bundle?.quote?.client_id ?? null;
  const emailRow = jobClientEmailRow({
    clientId: quoteClientId,
    client: bundle?.client ?? null,
  });
  const phoneRow = jobClientPhoneRow({
    clientId: quoteClientId,
    client: bundle?.client ?? null,
  });
  const noEmailMiss = decision != null && !decision.ok && decision.blocker === 'no_email';
  const noClientMiss = decision != null && !decision.ok && decision.blocker === 'no_client';
  const smtpMiss = decision != null && !decision.ok && decision.blocker === 'no_smtp';
  const showEmailEditor = !loading && noEmailMiss && emailRow.kind === 'edit';
  const showPhoneEditor = !loading && !smtpMiss && !noClientMiss && phoneRow.kind === 'edit';
  const showPhoneInkOnMiss = !loading && noEmailMiss && phoneRow.kind === 'tel';

  const handleSaveEmail = async () => {
    if (emailRow.kind !== 'edit' || !bundle) return;
    setSavingEmail(true);
    setErr('');
    try {
      const result = await saveJobClientEmail({
        clientId: emailRow.clientId,
        email: clientEmailDraft,
      });
      const next: QuoteSendBundle = {
        ...bundle,
        client: bundle.client ? { ...bundle.client, email: result.email } : bundle.client,
      };
      setBundle(next);
      setDecision(decideQuoteSend(next));
      setClientEmailDraft(result.email ?? '');
      void queryClient.invalidateQueries({ queryKey: ['quotes'] });
      void queryClient.invalidateQueries({ queryKey: ['job-client', result.clientId] });
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not save the email.');
    } finally {
      setSavingEmail(false);
    }
  };

  const handleSavePhone = async () => {
    if (phoneRow.kind !== 'edit' || !bundle) return;
    setSavingPhone(true);
    setErr('');
    try {
      const result = await saveJobClientPhone({
        clientId: phoneRow.clientId,
        phone: clientPhoneDraft,
      });
      const next: QuoteSendBundle = {
        ...bundle,
        client: bundle.client ? { ...bundle.client, phone: result.phone } : bundle.client,
      };
      setBundle(next);
      setDecision(decideQuoteSend(next));
      setClientPhoneDraft(result.phone ?? '');
      void queryClient.invalidateQueries({ queryKey: ['quotes'] });
      void queryClient.invalidateQueries({ queryKey: ['job-client', result.clientId] });
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not save the phone.');
    } finally {
      setSavingPhone(false);
    }
  };

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
  const blockerMessage = noEmailMiss
    ? QUOTE_SEND_NO_EMAIL_FIELD
    : (decision && !decision.ok ? decision.message : '');
  const quoteLabel = bundle?.quote ? `Quote #${padQuoteNumber(bundle.quote.quote_number)}` : '';
  const pdfName = ready && decision.ok ? decision.filename : '';
  const showSend = !loading && (ready || (noEmailMiss && emailRow.kind === 'edit'));
  const showSmtpSettings = !loading && smtpMiss && !!blockerHref;

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
                  {showPhoneEditor && phoneRow.kind === 'edit' ? (
                    <form
                      className="job-client-phone"
                      onSubmit={e => {
                        e.preventDefault();
                        void handleSavePhone();
                      }}
                    >
                      <Phone size={13} />
                      <input
                        type="tel"
                        value={clientPhoneDraft}
                        onChange={e => setClientPhoneDraft(e.target.value)}
                        placeholder="Phone"
                        className="form-input-sm"
                        aria-label="Client phone"
                        autoComplete="tel"
                        inputMode="tel"
                      />
                      <button
                        type="submit"
                        className="job-client-phone-save"
                        disabled={savingPhone}
                      >
                        Save
                      </button>
                    </form>
                  ) : (
                    <>
                      <p className={`hub-invoice-send-value tabular-nums${decision.smsTo ? '' : ' is-miss'}`}>
                        {decision.smsTo || 'No client phone'}
                      </p>
                      {decision.smsTo ? null : (
                        <p className="hub-invoice-muted">{decision.smsMessage}</p>
                      )}
                    </>
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
              <p className="hub-invoice-err">{blockerMessage || err || 'This quote cannot be sent yet.'}</p>
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
              {showPhoneInkOnMiss && phoneRow.kind === 'tel' && (
                <a href={`tel:${phoneRow.phone}`} className="job-client-phone-num">
                  <Phone size={13} /> {phoneRow.phone}
                </a>
              )}
              {showPhoneEditor && noEmailMiss && phoneRow.kind === 'edit' && (
                <form
                  className="job-client-phone"
                  onSubmit={e => {
                    e.preventDefault();
                    void handleSavePhone();
                  }}
                >
                  <Phone size={13} />
                  <input
                    type="tel"
                    value={clientPhoneDraft}
                    onChange={e => setClientPhoneDraft(e.target.value)}
                    placeholder="Phone"
                    className="form-input-sm"
                    aria-label="Client phone"
                    autoComplete="tel"
                    inputMode="tel"
                  />
                  <button
                    type="submit"
                    className="job-client-phone-save"
                    disabled={savingPhone}
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
              {sending ? 'Sending…' : 'Send quote'}
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

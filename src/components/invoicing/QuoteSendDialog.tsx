import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Mail, Phone, User } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { generateCommercialPdf } from '../../reports/commercial/generateCommercialPdf';
import { padQuoteNumber } from '../../lib/quoteJobFields';
import { supabase } from '../../lib/supabase';
import {
  commercialPdfDataForQuote,
  decideQuoteSend,
  QUOTE_SEND_CLIENT_COLUMNS,
  type QuoteSendBundle,
  type QuoteSendClient,
  type QuoteSendCompany,
  type QuoteSendDecision,
} from '../../lib/sendQuote';
import { deliverQuote, loadQuoteSendBundle } from '../../lib/sendQuoteDeliver';
import { jobClientEmailRow, saveJobClientEmail } from '../../lib/saveJobClientEmail';
import { jobClientPhoneRow, saveJobClientPhone } from '../../lib/saveJobClientPhone';
import {
  QUOTE_CLIENT_ATTACH_NO_CLIENTS,
  attachQuoteClient,
  quoteClientAttachRow,
} from '../../lib/attachQuoteClient';

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
  const [clientAttachDraft, setClientAttachDraft] = useState('');
  const [savingAttach, setSavingAttach] = useState(false);

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

  const attachClientsQuery = useQuery<{ id: string; name: string }[]>({
    queryKey: ['quote-attach-clients', company.id],
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

  const attachRow = quoteClientAttachRow({
    quoteClientId,
    companyClients: quoteClientId
      ? []
      : attachClientsQuery.isFetched
        ? (attachClientsQuery.data ?? [])
        : null,
  });
  const noClientsNamedMiss = noClientMiss && attachRow.kind === 'miss';

  const handleAttach = async () => {
    if (!bundle?.quote || attachRow.kind !== 'pick') return;
    setSavingAttach(true);
    setErr('');
    try {
      const result = await attachQuoteClient({
        quoteId: bundle.quote.id,
        quoteClientId,
        clientId: clientAttachDraft,
        companyClients: attachClientsQuery.data ?? [],
      });
      const clientRes = await supabase
        .from('clients')
        .select(QUOTE_SEND_CLIENT_COLUMNS)
        .eq('id', result.clientId)
        .maybeSingle();
      if (clientRes.error) throw clientRes.error;
      const attached = (clientRes.data ?? null) as QuoteSendClient | null;
      const picked = attachRow.clients.find(c => c.id === result.clientId);
      const next: QuoteSendBundle = {
        ...bundle,
        quote: { ...bundle.quote, client_id: result.clientId },
        client: attached ?? (picked
          ? { id: picked.id, name: picked.name, email: null, phone: null, address: null }
          : null),
      };
      setBundle(next);
      setDecision(decideQuoteSend(next));
      setClientEmailDraft(next.client?.email ?? '');
      setClientPhoneDraft(next.client?.phone ?? '');
      setClientAttachDraft('');
      void queryClient.invalidateQueries({ queryKey: ['quotes'] });
      void queryClient.invalidateQueries({ queryKey: ['job-client', result.clientId] });
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
    : noClientsNamedMiss
      ? QUOTE_CLIENT_ATTACH_NO_CLIENTS
      : (decision && !decision.ok ? decision.message : '');
  const quoteLabel = bundle?.quote ? `Quote #${padQuoteNumber(bundle.quote.quote_number)}` : '';
  const pdfName = ready && decision.ok ? decision.filename : '';
  const showSend = !loading && (ready || (noEmailMiss && emailRow.kind === 'edit') || noClientMiss);
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

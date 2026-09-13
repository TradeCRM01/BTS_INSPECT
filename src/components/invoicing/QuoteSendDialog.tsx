import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Mail, Phone, User } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { generateCommercialPdf } from '../../reports/commercial/generateCommercialPdf';
import { padQuoteNumber } from '../../lib/quoteJobFields';
import { quoteHasChargeableLines } from '../../lib/quoteNextAction';
import { supabase } from '../../lib/supabase';
import {
  decideQuoteShare,
  documentShareOrigin,
  quoteShareAfterPortalUrl,
  type DocumentShareExport,
} from '../../lib/documentShare';
import {
  copyShareText,
  ensureClientPortalUrl,
  loadActiveClientPortalUrl,
  markQuoteSentForShare,
  openDocumentShareMailto,
  triggerBrowserDownload,
  type ShareCopyResult,
} from '../../lib/documentShareDeliver';
import {
  commercialPdfDataForQuote,
  QUOTE_SEND_CLIENT_COLUMNS,
  type QuoteSendBundle,
  type QuoteSendClient,
  type QuoteSendCompany,
} from '../../lib/sendQuote';
import { loadQuoteSendBundle } from '../../lib/sendQuoteDeliver';
import { jobClientEmailRow, saveJobClientEmail } from '../../lib/saveJobClientEmail';
import { jobClientPhoneRow, saveJobClientPhone } from '../../lib/saveJobClientPhone';
import {
  QUOTE_CLIENT_ATTACH_NO_CLIENTS,
  attachQuoteClient,
  quoteClientAttachRow,
} from '../../lib/attachQuoteClient';

/** Honest no_email miss — write the address on this dialog for mailto. */
export const QUOTE_SEND_NO_EMAIL_FIELD =
  'This client has no email. Add one below before you send.';

function quoteShareFromBundle(
  bundle: QuoteSendBundle,
  portalUrl: string | null,
): DocumentShareExport {
  const quote = bundle.quote;
  return decideQuoteShare({
    status: quote?.status ?? 'draft',
    hasClient: !!quote?.client_id,
    hasLines: quoteHasChargeableLines(quote?.line_items),
    quoteNumber: quote?.quote_number,
    companyName: bundle.company.name,
    clientEmail: bundle.client?.email,
    portalUrl,
  });
}

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
  const [busy, setBusy] = useState('');
  const [savingEmail, setSavingEmail] = useState(false);
  const [savingPhone, setSavingPhone] = useState(false);
  const [bundle, setBundle] = useState<QuoteSendBundle | null>(null);
  const [share, setShare] = useState<DocumentShareExport | null>(null);
  const [portalUrl, setPortalUrl] = useState<string | null>(null);
  const [err, setErr] = useState('');
  const [copy, setCopy] = useState<ShareCopyResult | null>(null);
  const [clientEmailDraft, setClientEmailDraft] = useState('');
  const [clientPhoneDraft, setClientPhoneDraft] = useState('');
  const [clientAttachDraft, setClientAttachDraft] = useState('');
  const [savingAttach, setSavingAttach] = useState(false);
  const emailInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setErr('');
      try {
        const loaded = await loadQuoteSendBundle(quoteId, company);
        if (cancelled) return;
        const origin = documentShareOrigin(
          typeof window !== 'undefined' ? window.location.origin : '',
        );
        let url: string | null = null;
        if (loaded.quote?.client_id) {
          url = await loadActiveClientPortalUrl({
            companyId: company.id,
            clientId: loaded.quote.client_id,
            origin,
          });
        }
        if (cancelled) return;
        setBundle(loaded);
        setPortalUrl(url);
        setShare(quoteShareFromBundle(loaded, url));
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
  const noClientMiss = !!bundle?.quote && !bundle.quote.client_id;
  const noEmailMiss = !!share && share.canCopyLink && !share.to;
  const showEmailEditor = !loading && noEmailMiss && emailRow.kind === 'edit';
  const showPhoneEditor = !loading && !noClientMiss && phoneRow.kind === 'edit';
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

  const applyBundle = (next: QuoteSendBundle, url = portalUrl) => {
    setBundle(next);
    setShare(quoteShareFromBundle(next, url));
    setClientEmailDraft(next.client?.email ?? '');
    setClientPhoneDraft(next.client?.phone ?? '');
  };

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
      applyBundle(next);
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
      applyBundle(next);
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
      applyBundle(next);
      void queryClient.invalidateQueries({ queryKey: ['quotes'] });
      void queryClient.invalidateQueries({ queryKey: ['job-client', result.clientId] });
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not save the phone.');
    } finally {
      setSavingPhone(false);
    }
  };

  const origin = documentShareOrigin(
    typeof window !== 'undefined' ? window.location.origin : '',
  );

  const prepareShare = async (): Promise<{ url: string; status: string }> => {
    if (!bundle?.quote?.client_id) throw new Error('Pick a client before you can copy a portal link.');
    const url = await ensureClientPortalUrl({
      companyId: company.id,
      clientId: bundle.quote.client_id,
      origin,
    });
    const marked = await markQuoteSentForShare({
      quoteId,
      status: bundle.quote.status,
    });
    const nextQuote = { ...bundle.quote, status: marked.status };
    const nextBundle = { ...bundle, quote: nextQuote };
    setPortalUrl(url);
    setBundle(nextBundle);
    setShare(quoteShareAfterPortalUrl(
      quoteShareFromBundle(nextBundle, url),
      url,
      nextBundle.company.name,
      nextQuote.quote_number,
    ));
    if (marked.markedSent) {
      void queryClient.invalidateQueries({ queryKey: ['quotes'] });
    }
    return { url, status: marked.status };
  };

  const handleDownload = async () => {
    if (!bundle || !share?.canDownloadPdf) return;
    setBusy('download');
    setErr('');
    try {
      const data = commercialPdfDataForQuote(bundle);
      if (!data) throw new Error('Could not build the quote PDF.');
      const pdf = await generateCommercialPdf(data);
      triggerBrowserDownload(pdf, share.filename);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not download the quote PDF.');
    } finally {
      setBusy('');
    }
  };

  const handleCopyLink = async () => {
    if (!share?.canCopyLink) return;
    setBusy('copy');
    setErr('');
    setCopy(null);
    try {
      const result = await copyShareText(async () => (await prepareShare()).url);
      setCopy(result);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not copy the portal link.');
    } finally {
      setBusy('');
    }
  };

  const handleMailto = async () => {
    setBusy('mailto');
    setErr('');
    try {
      const prepared = await prepareShare();
      const next = quoteShareAfterPortalUrl(
        quoteShareFromBundle({
          ...bundle!,
          quote: bundle!.quote ? { ...bundle!.quote, status: prepared.status } : bundle!.quote,
        }, prepared.url),
        prepared.url,
        bundle!.company.name,
        bundle!.quote?.quote_number,
      );
      if (!next.mailtoHref) {
        setErr(QUOTE_SEND_NO_EMAIL_FIELD);
        emailInputRef.current?.focus();
        return;
      }
      openDocumentShareMailto(next.mailtoHref);
      onSent(next.to || 'client', 'Mail draft opened with the accept link.');
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not open a mail draft.');
    } finally {
      setBusy('');
    }
  };

  const handleMarkSent = async () => {
    if (!bundle?.quote) return;
    setBusy('sent');
    setErr('');
    try {
      const marked = await markQuoteSentForShare({
        quoteId,
        status: bundle.quote.status,
      });
      const nextQuote = { ...bundle.quote, status: marked.status };
      applyBundle({ ...bundle, quote: nextQuote }, portalUrl);
      if (marked.markedSent) {
        void queryClient.invalidateQueries({ queryKey: ['quotes'] });
        onSent(share?.to || 'client', 'Quote marked sent. The portal Accept button is live.');
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not mark this quote sent.');
    } finally {
      setBusy('');
    }
  };

  const blockerMessage = noClientsNamedMiss
    ? QUOTE_CLIENT_ATTACH_NO_CLIENTS
    : noClientMiss
      ? 'Pick a client before you can copy a portal link.'
      : noEmailMiss
        ? QUOTE_SEND_NO_EMAIL_FIELD
        : '';
  const quoteLabel = bundle?.quote ? `Quote #${padQuoteNumber(bundle.quote.quote_number)}` : '';
  const showShare = !loading && !!share && (share.canDownloadPdf || share.canCopyLink);
  const ready = showShare && !!share && share.canCopyLink && share.canDownloadPdf;

  return (
    <Modal open onClose={onClose} size="md">
      <div className="hub-invoice-send hub-quote-send">
        <div className="hub-invoice-send-head">
          <div className="min-w-0">
            <h2 className="hub-invoice-send-title">Send quote</h2>
            {quoteLabel ? <p className="hub-invoice-muted mt-1">{quoteLabel}</p> : null}
          </div>
        </div>

        <div className="hub-invoice-send-body">
          {loading && <p className="hub-invoice-muted">Loading send details…</p>}

          {!loading && share && ready && (
            <>
              <div className="hub-invoice-send-tos">
                <div className="hub-invoice-send-field">
                  <p className="hub-invoice-kicker">To</p>
                  {showEmailEditor && emailRow.kind === 'edit' ? (
                    <form
                      className="job-client-email"
                      onSubmit={e => {
                        e.preventDefault();
                        void handleSaveEmail();
                      }}
                    >
                      <Mail size={13} />
                      <input
                        ref={emailInputRef}
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
                  ) : (
                    <>
                      <p className={`hub-invoice-send-value${share.to ? '' : ' is-miss'}`}>
                        {share.to || 'No client email'}
                      </p>
                      <p className="hub-invoice-muted">
                        {share.to ? 'Already on the quote. Used only for the mail draft.' : QUOTE_SEND_NO_EMAIL_FIELD}
                      </p>
                    </>
                  )}
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
                    <p className="hub-invoice-send-value tabular-nums">
                      {phoneRow.kind === 'tel' ? phoneRow.phone : 'No client phone'}
                    </p>
                  )}
                </div>
              </div>
              <div className="hub-invoice-send-field">
                <p className="hub-invoice-kicker">Subject</p>
                <p className="hub-invoice-send-value">{share.subject}</p>
              </div>
              <div className="hub-invoice-send-field">
                <p className="hub-invoice-kicker">PDF</p>
                <p className="hub-invoice-pdf">{share.filename}</p>
              </div>
              <div className="hub-invoice-send-field">
                <p className="hub-invoice-kicker">Portal link</p>
                {copy?.kind === 'manual' ? (
                  <>
                    <input
                      type="text"
                      readOnly
                      value={copy.text}
                      onFocus={e => e.currentTarget.select()}
                      onClick={e => e.currentTarget.select()}
                      className="form-input-sm"
                      aria-label="Portal link"
                    />
                    <p className="hub-invoice-send-value">Hold the link to copy it.</p>
                  </>
                ) : (
                  <p className="hub-invoice-send-value">
                    {share.portalUrl || 'Copy link creates one the client can Accept.'}
                  </p>
                )}
              </div>
            </>
          )}

          {!loading && !ready && (
            <>
              <p className="hub-invoice-err">{blockerMessage || err || 'This quote cannot be shared yet.'}</p>
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
                    ref={emailInputRef}
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
          {showShare && share?.canDownloadPdf && (
            <button
              type="button"
              onClick={() => void handleDownload()}
              disabled={busy === 'download'}
              className="ops-link shrink-0"
            >
              {busy === 'download' ? 'Downloading…' : 'Download PDF'}
            </button>
          )}
          {showShare && share?.canCopyLink && (
            <button
              type="button"
              onClick={() => void handleCopyLink()}
              disabled={!!busy}
              className="ops-link shrink-0"
            >
              {busy === 'copy' ? 'Copying…' : copy?.kind === 'copied' ? 'Copied' : 'Copy link'}
            </button>
          )}
          {showShare && share?.canMarkSent && (
            <button
              type="button"
              onClick={() => void handleMarkSent()}
              disabled={!!busy}
              className="ops-link shrink-0"
            >
              {busy === 'sent' ? 'Marking…' : 'Mark sent'}
            </button>
          )}
          {showShare && share?.canMailto && (
            <button
              type="button"
              onClick={() => void handleMailto()}
              disabled={!!busy}
              className="btn-primary"
            >
              {busy === 'mailto' ? 'Opening…' : 'Open mail draft'}
            </button>
          )}
          {showShare && !share?.canMailto && noEmailMiss && emailRow.kind === 'edit' && (
            <button
              type="button"
              className="btn-primary"
              onClick={() => emailInputRef.current?.focus()}
            >
              Fix email
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
}

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Mail, Phone, User } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { generateCommercialPdf } from '../../reports/commercial/generateCommercialPdf';
import { supabase } from '../../lib/supabase';
import {
  commercialPdfDataForPurchaseOrder,
  decidePurchaseOrderSend,
  padPurchaseOrderNumber,
  PURCHASE_ORDER_SEND_SUPPLIER_COLUMNS,
  type PurchaseOrderSendBundle,
  type PurchaseOrderSendCompany,
  type PurchaseOrderSendDecision,
  type PurchaseOrderSendSupplier,
} from '../../lib/sendPurchaseOrder';
import { deliverPurchaseOrder, loadPurchaseOrderSendBundle } from '../../lib/sendPurchaseOrderDeliver';
import { saveSupplierEmail, supplierEmailRow } from '../../lib/saveSupplierEmail';
import { saveSupplierPhone, supplierPhoneRow } from '../../lib/saveSupplierPhone';
import {
  PO_SUPPLIER_ATTACH_NO_SUPPLIERS,
  attachPoSupplier,
  poSupplierAttachRow,
} from '../../lib/attachPoSupplier';

/** Honest no_email miss — write the address on this dialog. */
export const PO_SEND_NO_EMAIL_FIELD =
  'This supplier has no email. Add one below before you send.';

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
  const queryClient = useQueryClient();
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [savingEmail, setSavingEmail] = useState(false);
  const [savingPhone, setSavingPhone] = useState(false);
  const [savingAttach, setSavingAttach] = useState(false);
  const [bundle, setBundle] = useState<PurchaseOrderSendBundle | null>(null);
  const [decision, setDecision] = useState<PurchaseOrderSendDecision | null>(null);
  const [err, setErr] = useState('');
  const [supplierEmailDraft, setSupplierEmailDraft] = useState('');
  const [supplierPhoneDraft, setSupplierPhoneDraft] = useState('');
  const [supplierAttachDraft, setSupplierAttachDraft] = useState('');

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
        setSupplierEmailDraft(loaded.supplier?.email ?? '');
        setSupplierPhoneDraft(loaded.supplier?.phone ?? '');
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

  const poSupplierId = bundle?.po?.supplier_id ?? null;
  const emailRow = supplierEmailRow({
    supplierId: poSupplierId,
    supplier: bundle?.supplier ?? null,
  });
  const phoneRow = supplierPhoneRow({
    supplierId: poSupplierId,
    supplier: bundle?.supplier ?? null,
  });
  const noEmailMiss = decision != null && !decision.ok && decision.blocker === 'no_email';
  const noSupplierMiss = decision != null && !decision.ok && decision.blocker === 'no_supplier';
  const smtpMiss = decision != null && !decision.ok && decision.blocker === 'no_smtp';
  const showEmailEditor = !loading && noEmailMiss && emailRow.kind === 'edit';
  const showPhoneEditor = !loading && !smtpMiss && !noSupplierMiss && phoneRow.kind === 'edit';
  const showPhoneInkOnMiss = !loading && noEmailMiss && phoneRow.kind === 'tel';

  const attachSuppliersQuery = useQuery<{ id: string; name: string }[]>({
    queryKey: ['po-attach-suppliers', company.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('suppliers')
        .select('id, name')
        .eq('archived', false)
        .eq('company_id', company.id)
        .order('name', { ascending: true });
      if (error) throw error;
      return (data ?? []) as { id: string; name: string }[];
    },
    enabled: !loading && noSupplierMiss && !!company.id,
  });

  const attachRow = poSupplierAttachRow({
    poSupplierId,
    companySuppliers: poSupplierId
      ? []
      : attachSuppliersQuery.isFetched
        ? (attachSuppliersQuery.data ?? [])
        : null,
  });
  const noSuppliersNamedMiss = noSupplierMiss && attachRow.kind === 'miss';

  const handleAttach = async () => {
    if (!bundle?.po || attachRow.kind !== 'pick') return;
    setSavingAttach(true);
    setErr('');
    try {
      const result = await attachPoSupplier({
        purchaseOrderId: bundle.po.id,
        poSupplierId,
        supplierId: supplierAttachDraft,
        companySuppliers: attachSuppliersQuery.data ?? [],
      });
      const supplierRes = await supabase
        .from('suppliers')
        .select(PURCHASE_ORDER_SEND_SUPPLIER_COLUMNS)
        .eq('id', result.supplierId)
        .maybeSingle();
      if (supplierRes.error) throw supplierRes.error;
      const attached = (supplierRes.data ?? null) as PurchaseOrderSendSupplier | null;
      const picked = attachRow.suppliers.find(s => s.id === result.supplierId);
      const next: PurchaseOrderSendBundle = {
        ...bundle,
        po: { ...bundle.po, supplier_id: result.supplierId },
        supplier: attached ?? (picked
          ? { id: picked.id, name: picked.name, email: null, phone: null, address: null }
          : null),
      };
      setBundle(next);
      setDecision(decidePurchaseOrderSend(next));
      setSupplierEmailDraft(next.supplier?.email ?? '');
      setSupplierPhoneDraft(next.supplier?.phone ?? '');
      setSupplierAttachDraft('');
      void queryClient.invalidateQueries({ queryKey: ['purchase-orders'] });
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not attach the supplier.');
    } finally {
      setSavingAttach(false);
    }
  };

  const handleSaveEmail = async () => {
    if (emailRow.kind !== 'edit' || !bundle) return;
    setSavingEmail(true);
    setErr('');
    try {
      const result = await saveSupplierEmail({
        supplierId: emailRow.supplierId,
        email: supplierEmailDraft,
      });
      const next: PurchaseOrderSendBundle = {
        ...bundle,
        supplier: bundle.supplier ? { ...bundle.supplier, email: result.email } : bundle.supplier,
      };
      setBundle(next);
      setDecision(decidePurchaseOrderSend(next));
      setSupplierEmailDraft(result.email ?? '');
      void queryClient.invalidateQueries({ queryKey: ['purchase-orders'] });
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
      const result = await saveSupplierPhone({
        supplierId: phoneRow.supplierId,
        phone: supplierPhoneDraft,
      });
      const next: PurchaseOrderSendBundle = {
        ...bundle,
        supplier: bundle.supplier ? { ...bundle.supplier, phone: result.phone } : bundle.supplier,
      };
      setBundle(next);
      setDecision(decidePurchaseOrderSend(next));
      setSupplierPhoneDraft(result.phone ?? '');
      void queryClient.invalidateQueries({ queryKey: ['purchase-orders'] });
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
  const blockerMessage = noEmailMiss
    ? PO_SEND_NO_EMAIL_FIELD
    : noSuppliersNamedMiss
      ? PO_SUPPLIER_ATTACH_NO_SUPPLIERS
      : (decision && !decision.ok ? decision.message : '');
  const poLabel = bundle?.po ? `PO #${padPurchaseOrderNumber(bundle.po.po_number)}` : '';
  const pdfName = ready && decision.ok ? decision.filename : '';
  const showSend = !loading && (ready || (noEmailMiss && emailRow.kind === 'edit') || noSupplierMiss);
  const showSmtpSettings = !loading && smtpMiss && !!blockerHref;

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
                        value={supplierPhoneDraft}
                        onChange={e => setSupplierPhoneDraft(e.target.value)}
                        placeholder="Phone"
                        className="form-input-sm"
                        aria-label="Supplier phone"
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
                        {decision.smsTo || 'No supplier phone'}
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
              <p className="hub-invoice-err">{blockerMessage || err || 'This purchase order cannot be sent yet.'}</p>
              {noSupplierMiss && attachRow.kind === 'pick' && (
                <form
                  className="job-client-attach"
                  onSubmit={e => {
                    e.preventDefault();
                    void handleAttach();
                  }}
                >
                  <User size={13} />
                  <select
                    value={supplierAttachDraft}
                    onChange={e => setSupplierAttachDraft(e.target.value)}
                    className="form-input-sm"
                    aria-label="Attach supplier"
                  >
                    <option value="">Supplier</option>
                    {attachRow.suppliers.map(s => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                  <button
                    type="submit"
                    className="job-client-attach-save"
                    disabled={savingAttach || !supplierAttachDraft}
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
                    value={supplierEmailDraft}
                    onChange={e => setSupplierEmailDraft(e.target.value)}
                    placeholder="Email"
                    className="form-input-sm"
                    aria-label="Supplier email"
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
                    value={supplierPhoneDraft}
                    onChange={e => setSupplierPhoneDraft(e.target.value)}
                    placeholder="Phone"
                    className="form-input-sm"
                    aria-label="Supplier phone"
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
              {sending ? 'Sending…' : 'Send PO'}
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

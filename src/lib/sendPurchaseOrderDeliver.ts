import { supabase } from './supabase';
import {
  applyPurchaseOrderSendScope,
  blobToBase64,
  commercialPdfDataForPurchaseOrder,
  decidePurchaseOrderSend,
  pickPurchaseOrderPdfAttachment,
  purchaseOrderAttachmentOrMiss,
  purchaseOrderPdfFilename,
  purchaseOrderSendJobQuery,
  purchaseOrderSendQueries,
  purchaseOrderSendSupplierQuery,
  type PurchaseOrderPdfAttachment,
  type PurchaseOrderSendBundle,
  type PurchaseOrderSendCompany,
} from './sendPurchaseOrder';
import { type SmtpSettingsRow } from './sendInvoice';
import { formatEmailAndSmsMessage, type SmsSendResult } from './jobReminder';
import { generateCommercialPdf } from '../reports/commercial/generateCommercialPdf';
import { getAuditPurchaseOrderSendBundle } from './devFieldAuditDocs';

export type DeliverPurchaseOrderResult =
  | { ok: true; to: string; markedSent: true; message: string; sms: SmsSendResult | null }
  | { ok: false; message: string; markedSent: false; href?: string };

export type PurchaseOrderPdfBuilder = (bundle: PurchaseOrderSendBundle) => Promise<Blob>;

export async function defaultPurchaseOrderPdfBuilder(bundle: PurchaseOrderSendBundle): Promise<Blob> {
  const data = commercialPdfDataForPurchaseOrder(bundle);
  if (!data) throw new Error('Could not build the purchase order PDF.');
  return generateCommercialPdf(data);
}

export async function loadPurchaseOrderSendBundle(
  purchaseOrderId: string,
  company: PurchaseOrderSendCompany & { id: string },
): Promise<PurchaseOrderSendBundle> {
  const mock = getAuditPurchaseOrderSendBundle(purchaseOrderId, company);
  if (mock) return mock;
  const scopes = purchaseOrderSendQueries({ companyId: company.id, purchaseOrderId });
  const poRes = await applyPurchaseOrderSendScope(supabase.from(scopes.po.table), scopes.po).maybeSingle();
  if (poRes.error) throw poRes.error;
  const po = (poRes.data ?? null) as PurchaseOrderSendBundle['po'];

  const supplierScope = purchaseOrderSendSupplierQuery(po?.supplier_id);
  const jobScope = purchaseOrderSendJobQuery(po?.job_id);
  const smtpScope = scopes.smtp;

  const [supplierRes, jobRes, smtpRes] = await Promise.all([
    supplierScope
      ? applyPurchaseOrderSendScope(supabase.from(supplierScope.table), supplierScope).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    jobScope
      ? applyPurchaseOrderSendScope(supabase.from(jobScope.table), jobScope).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    applyPurchaseOrderSendScope(supabase.from(smtpScope.table), smtpScope).maybeSingle(),
  ]);
  if (supplierRes.error) throw supplierRes.error;
  if (jobRes.error) throw jobRes.error;
  if (smtpRes.error) throw smtpRes.error;

  return {
    po,
    supplier: (supplierRes.data ?? null) as PurchaseOrderSendBundle['supplier'],
    jobAddress: (jobRes.data as { address?: string | null } | null)?.address ?? null,
    smtp: (smtpRes.data ?? null) as SmtpSettingsRow | null,
    company,
  };
}

async function readFunctionError(error: { context?: unknown }): Promise<{ error?: string; message?: string; href?: string } | null> {
  const ctx = error.context;
  if (!ctx || typeof ctx !== 'object' || !('json' in ctx) || typeof (ctx as Response).json !== 'function') {
    return null;
  }
  try {
    return await (ctx as Response).json() as { error?: string; message?: string; href?: string };
  } catch {
    return null;
  }
}

/**
 * Email the purchase order through the job-reminder Resend pipe, then treat
 * sent as true only if that function reports delivery.
 * Callers must not flip status themselves on a failed result.
 * Attaches the existing commercial purchase order PDF.
 */
export async function deliverPurchaseOrder(args: {
  purchaseOrderId: string;
  company: PurchaseOrderSendCompany & { id: string };
  buildPdf: PurchaseOrderPdfBuilder;
}): Promise<DeliverPurchaseOrderResult> {
  const bundle = await loadPurchaseOrderSendBundle(args.purchaseOrderId, args.company);
  const decision = decidePurchaseOrderSend(bundle);
  if (!decision.ok) {
    return { ok: false, message: decision.message, markedSent: false, href: decision.href };
  }

  let generated: PurchaseOrderPdfAttachment | null = null;
  try {
    const pdf = await args.buildPdf(bundle);
    generated = {
      filename: decision.filename || purchaseOrderPdfFilename(bundle.po?.po_number),
      content: await blobToBase64(pdf),
      contentType: 'application/pdf',
    };
  } catch {
    generated = null;
  }

  const picked = purchaseOrderAttachmentOrMiss(pickPurchaseOrderPdfAttachment({
    existing: bundle.existingPdf,
    generated,
  }));
  if (!picked.ok) {
    return { ok: false, message: picked.message, markedSent: false };
  }

  const { data, error } = await supabase.functions.invoke('job-reminder', {
    body: {
      purchaseOrderId: args.purchaseOrderId,
      appUrl: typeof window !== 'undefined' ? window.location.origin : '',
      attachment: picked.attachment,
    },
  });

  if (error) {
    const fromBody = await readFunctionError(error);
    return {
      ok: false,
      message: fromBody?.error || fromBody?.message || error.message || 'Could not send the purchase order.',
      markedSent: false,
      href: fromBody?.href,
    };
  }
  if (data?.error) {
    return {
      ok: false,
      message: String(data.error),
      markedSent: false,
      href: data.href,
    };
  }
  if (data?.sent === false) {
    return {
      ok: false,
      message: String(data.message ?? data.results?.[0]?.message ?? 'Purchase order was not sent.'),
      markedSent: false,
      href: data.href,
    };
  }
  if (!data?.sent) {
    return { ok: false, message: 'Purchase order was not sent.', markedSent: false };
  }

  const to = String(data.to ?? decision.to);
  const sms = (data?.sms ?? null) as SmsSendResult | null;
  const message = String(data.message ?? '').trim()
    || formatEmailAndSmsMessage(`Purchase order sent to ${to}`, sms);
  return { ok: true, to, markedSent: true, message, sms };
}

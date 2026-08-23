import { format, parseISO } from 'date-fns';
import { quoteClientDetailFromClient } from './clientRecords';
import { type CommercialLine, type CommercialPdfData } from '../reports/commercial/CommercialDocumentPdf';
import { companyDocumentLogoUrl, companyReportTheme } from './companyLogo';
import type { POLineItem, POStatus } from '../types/fsm';
import {
  COMPANY_EMAIL_SETTINGS_HREF,
  blobToBase64,
  clientEmailForSend,
  clientPhoneForSms,
  invoiceHasChargeableLines,
  isSmtpReady,
  type SmtpSettingsRow,
} from './sendInvoice';

export {
  COMPANY_EMAIL_SETTINGS_HREF,
  blobToBase64,
  clientEmailForSend,
  clientPhoneForSms,
  isSmtpReady,
};

export type PurchaseOrderSendBlocker =
  | 'not_found'
  | 'no_supplier'
  | 'no_email'
  | 'no_smtp'
  | 'no_lines'
  | 'no_pdf';

export type PurchaseOrderSendQueryTable = 'purchase_orders' | 'suppliers' | 'email_settings' | 'jobs';

export type PurchaseOrderSendQueryScope = {
  table: PurchaseOrderSendQueryTable;
  columns: string;
  eq: Record<string, string>;
};

export type PurchaseOrderSendDecision =
  | {
      ok: true;
      to: string;
      toName: string;
      subject: string;
      filename: string;
      smsTo: string | null;
      smsMessage: string | null;
    }
  | {
      ok: false;
      blocker: PurchaseOrderSendBlocker;
      message: string;
      href?: string;
    };

export type PurchaseOrderSendCompany = {
  name: string;
  abn?: string | null;
  licence_number?: string | null;
  phone?: string | null;
  email?: string | null;
  website?: string | null;
  logo_url?: string | null;
  report_theme?: Record<string, unknown> | null;
};

export type PurchaseOrderSendPo = {
  id: string;
  company_id: string;
  po_number: number | null;
  supplier_id: string | null;
  job_id: string | null;
  status: string;
  line_items: POLineItem[] | null;
  subtotal: number;
  tax_rate: number;
  tax_amount: number;
  total: number;
  expected_delivery_date: string | null;
  notes: string | null;
};

export type PurchaseOrderSendSupplier = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
};

export type PurchaseOrderPdfAttachment = {
  filename: string;
  content: string;
  contentType?: string;
};

export type PurchaseOrderSendBundle = {
  po: PurchaseOrderSendPo | null;
  supplier: PurchaseOrderSendSupplier | null;
  jobAddress: string | null;
  smtp: SmtpSettingsRow | null;
  company: PurchaseOrderSendCompany;
  existingPdf?: PurchaseOrderPdfAttachment | null;
};

export const PURCHASE_ORDER_SEND_PO_COLUMNS =
  'id, company_id, po_number, supplier_id, job_id, status, line_items, subtotal, tax_rate, tax_amount, total, expected_delivery_date, notes';

export const PURCHASE_ORDER_SEND_SUPPLIER_COLUMNS = 'id, name, email, phone, address';
export const PURCHASE_ORDER_SEND_SMTP_COLUMNS = 'smtp_host, smtp_pass, from_name, from_email';
export const PURCHASE_ORDER_SEND_JOB_COLUMNS = 'id, address';

export const NO_EMAIL_MESSAGE = 'This supplier has no email. Add one on the supplier record before you send.';
export const NO_SMTP_MESSAGE = 'Email is not set up. Add SMTP in Company settings — there is a test send there.';
export const NO_LINES_MESSAGE = 'Add the goods so the purchase order has a price.';
export const NO_SUPPLIER_MESSAGE = 'Pick a supplier before you can send this purchase order.';
export const NO_PDF_MESSAGE = 'The purchase order PDF could not be attached — purchase order was not sent.';
export const NO_PHONE_SMS_MESSAGE = 'This supplier has no phone — SMS was not sent.';

/**
 * Same pipe as quote / invoice / report Send on main.
 * One PO by id + company → email_settings + Resend → sent only on 2xx.
 */
export const PURCHASE_ORDER_SEND_PIPE = [
  'supabase.functions.invoke job-reminder',
  'purchaseOrderId (one purchase order, company_id scoped — not the ledger)',
  'email_settings where Resend is ready (companies without SMTP are not mailed)',
  'To = suppliers.email (never invented)',
  'attach generated commercial purchase order PDF (generateCommercialPdf)',
  'POST https://api.resend.com/emails with email_settings.smtp_pass',
  'SMS beside: suppliers.phone via Twilio edge secrets on job-reminder (email status unchanged if SMS misses)',
  'UPDATE purchase_orders.status = sent only when Resend returns 2xx (draft only)',
] as const;

export function padPurchaseOrderNumber(n: number | null | undefined): string {
  return String(n ?? 0).padStart(4, '0');
}

export function purchaseOrderSendSubject(
  poNumber: number | null | undefined,
  companyName: string,
): string {
  const who = companyName.trim() || 'your contractor';
  return `Purchase order #${padPurchaseOrderNumber(poNumber)} from ${who}`;
}

export function purchaseOrderPdfFilename(poNumber: number | null | undefined): string {
  return `purchase-order-${padPurchaseOrderNumber(poNumber)}.pdf`;
}

export function purchaseOrderSmsBody(opts: {
  companyName: string;
  poNumber: number | null | undefined;
  totalLabel: string;
  expectedLabel: string | null;
}): string {
  const who = opts.companyName.trim() || 'your contractor';
  const expected = opts.expectedLabel ? ` Expected ${opts.expectedLabel}.` : '';
  return `${who} sent purchase order #${padPurchaseOrderNumber(opts.poNumber)}. Total (inc GST): ${opts.totalLabel}.${expected} The PDF is in your email.`;
}

export function purchaseOrderExpectedLabel(expectedDate: string | null | undefined): string | null {
  const day = (expectedDate ?? '').trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  return format(parseISO(day), 'd MMM yyyy');
}

export function purchaseOrderSendHtml(opts: {
  supplierName: string;
  companyName: string;
  poNumber: number | null | undefined;
  totalLabel: string;
  expectedLabel: string | null;
}): string {
  const supplier = escapeHtml(opts.supplierName.trim() || 'there');
  const company = escapeHtml(opts.companyName.trim() || 'us');
  const number = escapeHtml(`#${padPurchaseOrderNumber(opts.poNumber)}`);
  const total = escapeHtml(opts.totalLabel);
  const expected = opts.expectedLabel
    ? `<p style="color:#4A5568;font-size:15px;line-height:1.6;">Expected <strong>${escapeHtml(opts.expectedLabel)}</strong>.</p>`
    : '';
  return `
      <div style="font-family:Segoe UI,Arial,sans-serif;max-width:560px;margin:0 auto;color:#1A1A1A">
        <div style="background:#0A2540;color:#fff;padding:20px 24px;border-radius:8px 8px 0 0">
          <div style="font-size:12px;opacity:.7;letter-spacing:1px;text-transform:uppercase">Purchase order</div>
          <h1 style="margin:8px 0 0;font-size:20px">${number}</h1>
        </div>
        <div style="border:1px solid #E5E7EB;border-top:none;padding:24px;border-radius:0 0 8px 8px">
          <p>Hi ${supplier},</p>
          <p>${company} has sent you purchase order ${number}.</p>
          <p style="color:#4A5568;font-size:15px;line-height:1.6;">Total (inc GST): <strong>${total}</strong></p>
          ${expected}
          <p>The purchase order PDF is attached. Reply to this email if you need to change the order.</p>
        </div>
      </div>`;
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Status write after a send attempt. Failure must not flip draft → sent. */
export function purchaseOrderStatusAfterSend(sendSucceeded: boolean, currentStatus: string): string {
  if (sendSucceeded && currentStatus === 'draft') return 'sent';
  return currentStatus;
}

export function purchaseOrderStatusPatchAfterSend(sendSucceeded: boolean): { status: 'sent' } | null {
  return sendSucceeded ? { status: 'sent' } : null;
}

export function shouldRecordPurchaseOrderSent(sendOk: boolean, currentStatus: string): boolean {
  return sendOk === true && currentStatus === 'draft';
}

/** Local save must not pretend the PO was emailed. */
export function poStatusOnSave(requested: POStatus, current: POStatus | null | undefined): POStatus {
  if (requested === 'sent' && current !== 'sent') {
    return current ?? 'draft';
  }
  return requested;
}

export function purchaseOrderByIdQuery(args: {
  companyId: string;
  purchaseOrderId: string;
}): PurchaseOrderSendQueryScope | null {
  const companyId = args.companyId.trim();
  const purchaseOrderId = args.purchaseOrderId.trim();
  if (!companyId || !purchaseOrderId) return null;
  return {
    table: 'purchase_orders',
    columns: PURCHASE_ORDER_SEND_PO_COLUMNS,
    eq: { id: purchaseOrderId, company_id: companyId },
  };
}

export function purchaseOrderSendQueries(args: { companyId: string; purchaseOrderId: string }): {
  po: PurchaseOrderSendQueryScope;
  smtp: PurchaseOrderSendQueryScope;
} {
  return {
    po: {
      table: 'purchase_orders',
      columns: PURCHASE_ORDER_SEND_PO_COLUMNS,
      eq: { id: args.purchaseOrderId, company_id: args.companyId },
    },
    smtp: {
      table: 'email_settings',
      columns: PURCHASE_ORDER_SEND_SMTP_COLUMNS,
      eq: { company_id: args.companyId },
    },
  };
}

export function purchaseOrderSendSupplierQuery(
  supplierId: string | null | undefined,
): PurchaseOrderSendQueryScope | null {
  const id = (supplierId ?? '').trim();
  if (!id) return null;
  return { table: 'suppliers', columns: PURCHASE_ORDER_SEND_SUPPLIER_COLUMNS, eq: { id } };
}

export function purchaseOrderSendJobQuery(jobId: string | null | undefined): PurchaseOrderSendQueryScope | null {
  const id = (jobId ?? '').trim();
  if (!id) return null;
  return { table: 'jobs', columns: PURCHASE_ORDER_SEND_JOB_COLUMNS, eq: { id } };
}

export function isPurchaseOrderSendScoped(scope: PurchaseOrderSendQueryScope): boolean {
  if (scope.table === 'purchase_orders') return !!scope.eq.id && !!scope.eq.company_id;
  if (scope.table === 'suppliers' || scope.table === 'jobs') return !!scope.eq.id;
  if (scope.table === 'email_settings') return !!scope.eq.company_id;
  return false;
}

/** True when a fetch would read more than this one PO / its supplier / company SMTP. */
export function wouldScanLedgerToSendPurchaseOrder(scope: PurchaseOrderSendQueryScope | null): boolean {
  if (scope == null) return false;
  return !isPurchaseOrderSendScoped(scope);
}

type FilterBuilder = {
  eq: (column: string, value: string) => FilterBuilder;
  maybeSingle: () => Promise<{ data: unknown; error: { message: string } | null }>;
};

export function applyPurchaseOrderSendScope<T>(
  fromBuilder: { select: (columns: string) => T },
  scope: PurchaseOrderSendQueryScope,
): T & FilterBuilder {
  let q = fromBuilder.select(scope.columns) as T & FilterBuilder;
  for (const [column, value] of Object.entries(scope.eq)) {
    q = q.eq(column, value) as typeof q;
  }
  return q;
}

export function purchaseOrderSendCompanyFrom(company: {
  id?: string | null;
  name?: string | null;
  abn?: string | null;
  licence_number?: string | null;
  phone?: string | null;
  email?: string | null;
  website?: string | null;
  logo_url?: string | null;
  report_theme?: Record<string, unknown> | null;
} | null | undefined): (PurchaseOrderSendCompany & { id: string }) | null {
  const id = (company?.id ?? '').trim();
  if (!id) return null;
  return {
    id,
    name: (company?.name ?? '').trim() || 'your contractor',
    abn: company?.abn ?? null,
    licence_number: company?.licence_number ?? null,
    phone: company?.phone ?? null,
    email: company?.email ?? null,
    website: company?.website ?? null,
    logo_url: companyDocumentLogoUrl(company),
    report_theme: companyReportTheme(company),
  };
}

export function decidePurchaseOrderSend(bundle: PurchaseOrderSendBundle): PurchaseOrderSendDecision {
  const po = bundle.po;
  if (!po) {
    return { ok: false, blocker: 'not_found', message: 'Purchase order not found.' };
  }
  if (!po.supplier_id) {
    return { ok: false, blocker: 'no_supplier', message: NO_SUPPLIER_MESSAGE };
  }
  if (!invoiceHasChargeableLines(po.line_items)) {
    return { ok: false, blocker: 'no_lines', message: NO_LINES_MESSAGE };
  }
  if (!isSmtpReady(bundle.smtp)) {
    return {
      ok: false,
      blocker: 'no_smtp',
      message: NO_SMTP_MESSAGE,
      href: COMPANY_EMAIL_SETTINGS_HREF,
    };
  }
  const to = clientEmailForSend(bundle.supplier?.email);
  if (!to) {
    return {
      ok: false,
      blocker: 'no_email',
      message: NO_EMAIL_MESSAGE,
      href: po.supplier_id ? `/suppliers/${po.supplier_id}` : undefined,
    };
  }
  const smsTo = clientPhoneForSms(bundle.supplier?.phone);
  return {
    ok: true,
    to,
    toName: (bundle.supplier?.name ?? '').trim() || 'Supplier',
    subject: purchaseOrderSendSubject(po.po_number, bundle.company.name),
    filename: purchaseOrderPdfFilename(po.po_number),
    smsTo,
    smsMessage: smsTo ? null : NO_PHONE_SMS_MESSAGE,
  };
}

export function pickPurchaseOrderPdfAttachment(args: {
  existing?: PurchaseOrderPdfAttachment | null;
  generated?: PurchaseOrderPdfAttachment | null;
}): PurchaseOrderPdfAttachment | null {
  if (args.existing?.content && args.existing.filename) {
    return {
      filename: args.existing.filename,
      content: args.existing.content,
      contentType: args.existing.contentType || 'application/pdf',
    };
  }
  if (args.generated?.content && args.generated.filename) {
    return {
      filename: args.generated.filename,
      content: args.generated.content,
      contentType: args.generated.contentType || 'application/pdf',
    };
  }
  return null;
}

export function purchaseOrderAttachmentOrMiss(
  attachment: PurchaseOrderPdfAttachment | null | undefined,
): { ok: true; attachment: PurchaseOrderPdfAttachment } | { ok: false; reason: 'no_pdf'; message: string } {
  if (!attachment?.content || !attachment.filename) {
    return { ok: false, reason: 'no_pdf', message: NO_PDF_MESSAGE };
  }
  return {
    ok: true,
    attachment: {
      filename: attachment.filename,
      content: attachment.content,
      contentType: attachment.contentType || 'application/pdf',
    },
  };
}

export function linesFromPoItems(items: POLineItem[] | null | undefined): CommercialLine[] {
  return (items ?? []).map(li => ({
    description: li.description,
    quantity: li.quantity,
    unit_price: li.unit_cost,
    unit_cost: li.unit_cost,
  }));
}

export function commercialPdfDataForPurchaseOrder(
  bundle: PurchaseOrderSendBundle,
  now = new Date(),
): CommercialPdfData | null {
  const po = bundle.po;
  if (!po) return null;
  const lines = (po.line_items ?? []).filter(
    li => (li.description ?? '').trim() && Number(li.quantity) > 0,
  );
  return {
    kind: 'purchase_order',
    title: 'Ordered items',
    docNumber: po.po_number != null ? `#${padPurchaseOrderNumber(po.po_number)}` : 'Draft',
    dateLabel: 'Date',
    dateValue: format(now, 'd MMM yyyy'),
    secondaryLabel: 'Expected',
    secondaryValue: po.expected_delivery_date
      ? format(parseISO(po.expected_delivery_date), 'd MMM yyyy')
      : '—',
    clientName: bundle.supplier?.name ?? '—',
    clientDetail: quoteClientDetailFromClient(bundle.supplier, bundle.jobAddress),
    company: {
      name: bundle.company.name,
      abn: bundle.company.abn ?? null,
      licence_number: bundle.company.licence_number ?? null,
      phone: bundle.company.phone ?? null,
      email: bundle.company.email ?? null,
      website: bundle.company.website ?? null,
      logo_url: companyDocumentLogoUrl(bundle.company),
      report_theme: companyReportTheme(bundle.company),
    },
    inclusions: [],
    exclusions: [],
    description: null,
    scopeOfWorks: null,
    lines: linesFromPoItems(lines),
    subtotal: Number(po.subtotal) || 0,
    taxRate: Number(po.tax_rate) || 0,
    taxAmount: Number(po.tax_amount) || 0,
    total: Number(po.total) || 0,
    notes: po.notes?.trim() || null,
  };
}

import { invoiceSendCompanyFrom, type InvoiceSendCompany } from './sendInvoice';
import {
  defaultInvoicePdfBuilder,
  deliverInvoice,
  type DeliverInvoiceResult,
  type InvoicePdfBuilder,
} from './sendInvoiceDeliver';
import { pickJobDraftToSend, type JobInvoiceNextRow } from './jobNextAction';
import { invoiceSendXeroMissLine } from './xeroAccounting';

/** Same not-found copy as decideInvoiceSend / missOverdueChaseMessage('no_invoice'). */
const NO_INVOICE_SEND_MESSAGE = 'Invoice not found.';

export type SendJobDraftInvoiceInput = {
  invoices: Array<JobInvoiceNextRow & { id: string }>;
  company: Parameters<typeof invoiceSendCompanyFrom>[0];
  deliver?: (
    args: {
      invoiceId: string;
      company: InvoiceSendCompany & { id: string };
      buildPdf: InvoicePdfBuilder;
    },
  ) => Promise<DeliverInvoiceResult>;
  buildPdf?: InvoicePdfBuilder;
};

/**
 * Job-sheet Send of the existing draft. Same deliverInvoice / job-reminder
 * invoiceId pipe as the invoice-sheet Send. Does not insert a draft, open a
 * dialog, or chase an already-sent invoice.
 */
export async function sendJobDraftInvoice(
  input: SendJobDraftInvoiceInput,
): Promise<DeliverInvoiceResult> {
  const draft = pickJobDraftToSend(input.invoices);
  const company = invoiceSendCompanyFrom(input.company);
  if (!draft || !company) {
    return { ok: false, message: NO_INVOICE_SEND_MESSAGE, markedSent: false };
  }
  const deliver = input.deliver ?? deliverInvoice;
  return deliver({
    invoiceId: draft.id,
    company,
    buildPdf: input.buildPdf ?? defaultInvoicePdfBuilder,
  });
}

/** Toast after job-sheet Send. Reuses invoice-sheet miss / Xero-on-send copy. */
export function jobDraftSendToast(
  result: DeliverInvoiceResult,
): { message: string; kind: 'success' | 'info' } {
  if (!result.ok) return { message: result.message, kind: 'info' };
  const xeroMiss = invoiceSendXeroMissLine(result.xero);
  if (xeroMiss) return { message: xeroMiss, kind: 'info' };
  return { message: result.message, kind: 'success' };
}

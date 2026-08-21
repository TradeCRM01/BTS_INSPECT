import { supabase } from './supabase';
import {
  JOB_CLIENT_ATTACH_NO_CLIENTS,
  JOB_CLIENT_ATTACH_NO_SELECTION,
  JOB_CLIENT_ATTACH_SAVED,
  JOB_CLIENT_ATTACH_UNKNOWN,
  companyClientsForAttach,
  jobClientAttachRow,
  jobClientAttachToast,
  type JobClientAttachRow,
} from './attachJobClient';

/** Named miss when this company has nobody to pick. Does not invent a client. */
export const INVOICE_CLIENT_ATTACH_NO_CLIENTS = JOB_CLIENT_ATTACH_NO_CLIENTS;
export const INVOICE_CLIENT_ATTACH_NO_INVOICE = 'This invoice is missing.';
export const INVOICE_CLIENT_ATTACH_ALREADY = 'This invoice already has a client.';
export const INVOICE_CLIENT_ATTACH_NO_SELECTION = JOB_CLIENT_ATTACH_NO_SELECTION;
export const INVOICE_CLIENT_ATTACH_UNKNOWN = JOB_CLIENT_ATTACH_UNKNOWN;
export const INVOICE_CLIENT_ATTACH_SAVED = JOB_CLIENT_ATTACH_SAVED;

export { companyClientsForAttach };
export type InvoiceClientAttachRow = JobClientAttachRow;

/**
 * Picker lives on this invoice's existing Bill-to only.
 * Already has client_id → signed Bill-to (no picker).
 * No company clients → named miss (no fake picker).
 */
export function invoiceClientAttachRow(input: {
  invoiceClientId: string | null | undefined;
  companyClients: { id: string; name: string; archived?: boolean | null }[] | null | undefined;
}): InvoiceClientAttachRow {
  return jobClientAttachRow({
    jobClientId: input.invoiceClientId,
    companyClients: input.companyClients,
  });
}

export type InvoiceClientAttachDecision =
  | { action: 'miss'; reason: 'no_invoice'; message: typeof INVOICE_CLIENT_ATTACH_NO_INVOICE }
  | { action: 'miss'; reason: 'already_linked'; message: typeof INVOICE_CLIENT_ATTACH_ALREADY }
  | { action: 'miss'; reason: 'no_clients'; message: typeof INVOICE_CLIENT_ATTACH_NO_CLIENTS }
  | { action: 'miss'; reason: 'no_selection'; message: typeof INVOICE_CLIENT_ATTACH_NO_SELECTION }
  | { action: 'miss'; reason: 'unknown_client'; message: typeof INVOICE_CLIENT_ATTACH_UNKNOWN }
  | { action: 'write'; invoiceId: string; clientId: string };

export function decideInvoiceClientAttach(input: {
  invoiceId: string | null | undefined;
  invoiceClientId: string | null | undefined;
  clientId: string | null | undefined;
  companyClients: { id: string; name: string; archived?: boolean | null }[] | null | undefined;
}): InvoiceClientAttachDecision {
  if (!input.invoiceId) {
    return { action: 'miss', reason: 'no_invoice', message: INVOICE_CLIENT_ATTACH_NO_INVOICE };
  }
  if (input.invoiceClientId) {
    return { action: 'miss', reason: 'already_linked', message: INVOICE_CLIENT_ATTACH_ALREADY };
  }
  const clients = companyClientsForAttach(input.companyClients);
  if (clients.length === 0) {
    return { action: 'miss', reason: 'no_clients', message: INVOICE_CLIENT_ATTACH_NO_CLIENTS };
  }
  const clientId = (input.clientId ?? '').trim();
  if (!clientId) {
    return { action: 'miss', reason: 'no_selection', message: INVOICE_CLIENT_ATTACH_NO_SELECTION };
  }
  if (!clients.some(c => c.id === clientId)) {
    return { action: 'miss', reason: 'unknown_client', message: INVOICE_CLIENT_ATTACH_UNKNOWN };
  }
  return { action: 'write', invoiceId: input.invoiceId, clientId };
}

export function invoiceClientAttachToast(): { message: string; kind: 'success' } {
  return jobClientAttachToast();
}

export type AttachInvoiceClientResult = {
  invoiceId: string;
  clientId: string;
};

/**
 * Write invoices.client_id on this invoice only.
 * Selects from existing company clients — does not invent a client or send.
 */
export async function attachInvoiceClient(input: {
  invoiceId: string | null | undefined;
  invoiceClientId: string | null | undefined;
  clientId: string | null | undefined;
  companyClients: { id: string; name: string; archived?: boolean | null }[] | null | undefined;
}): Promise<AttachInvoiceClientResult> {
  const decision = decideInvoiceClientAttach(input);
  if (decision.action === 'miss') throw new Error(decision.message);
  const { error } = await supabase
    .from('invoices')
    .update({ client_id: decision.clientId, updated_at: new Date().toISOString() })
    .eq('id', decision.invoiceId);
  if (error) throw error;
  return { invoiceId: decision.invoiceId, clientId: decision.clientId };
}

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
export const QUOTE_CLIENT_ATTACH_NO_CLIENTS = JOB_CLIENT_ATTACH_NO_CLIENTS;
export const QUOTE_CLIENT_ATTACH_NO_QUOTE = 'This quote is missing.';
export const QUOTE_CLIENT_ATTACH_ALREADY = 'This quote already has a client.';
export const QUOTE_CLIENT_ATTACH_NO_SELECTION = JOB_CLIENT_ATTACH_NO_SELECTION;
export const QUOTE_CLIENT_ATTACH_UNKNOWN = JOB_CLIENT_ATTACH_UNKNOWN;
export const QUOTE_CLIENT_ATTACH_SAVED = JOB_CLIENT_ATTACH_SAVED;

export { companyClientsForAttach };
export type QuoteClientAttachRow = JobClientAttachRow;

/**
 * Picker lives on this quote's existing Client field only.
 * Already has client_id → signed Client row (no picker).
 * No company clients → named miss (no fake picker).
 */
export function quoteClientAttachRow(input: {
  quoteClientId: string | null | undefined;
  companyClients: { id: string; name: string; archived?: boolean | null }[] | null | undefined;
}): QuoteClientAttachRow {
  return jobClientAttachRow({
    jobClientId: input.quoteClientId,
    companyClients: input.companyClients,
  });
}

export type QuoteClientAttachDecision =
  | { action: 'miss'; reason: 'no_quote'; message: typeof QUOTE_CLIENT_ATTACH_NO_QUOTE }
  | { action: 'miss'; reason: 'already_linked'; message: typeof QUOTE_CLIENT_ATTACH_ALREADY }
  | { action: 'miss'; reason: 'no_clients'; message: typeof QUOTE_CLIENT_ATTACH_NO_CLIENTS }
  | { action: 'miss'; reason: 'no_selection'; message: typeof QUOTE_CLIENT_ATTACH_NO_SELECTION }
  | { action: 'miss'; reason: 'unknown_client'; message: typeof QUOTE_CLIENT_ATTACH_UNKNOWN }
  | { action: 'write'; quoteId: string; clientId: string };

export function decideQuoteClientAttach(input: {
  quoteId: string | null | undefined;
  quoteClientId: string | null | undefined;
  clientId: string | null | undefined;
  companyClients: { id: string; name: string; archived?: boolean | null }[] | null | undefined;
}): QuoteClientAttachDecision {
  if (!input.quoteId) {
    return { action: 'miss', reason: 'no_quote', message: QUOTE_CLIENT_ATTACH_NO_QUOTE };
  }
  if (input.quoteClientId) {
    return { action: 'miss', reason: 'already_linked', message: QUOTE_CLIENT_ATTACH_ALREADY };
  }
  const clients = companyClientsForAttach(input.companyClients);
  if (clients.length === 0) {
    return { action: 'miss', reason: 'no_clients', message: QUOTE_CLIENT_ATTACH_NO_CLIENTS };
  }
  const clientId = (input.clientId ?? '').trim();
  if (!clientId) {
    return { action: 'miss', reason: 'no_selection', message: QUOTE_CLIENT_ATTACH_NO_SELECTION };
  }
  if (!clients.some(c => c.id === clientId)) {
    return { action: 'miss', reason: 'unknown_client', message: QUOTE_CLIENT_ATTACH_UNKNOWN };
  }
  return { action: 'write', quoteId: input.quoteId, clientId };
}

export function quoteClientAttachToast(): { message: string; kind: 'success' } {
  return jobClientAttachToast();
}

export type AttachQuoteClientResult = {
  quoteId: string;
  clientId: string;
};

/**
 * Write quotes.client_id on this quote only.
 * Selects from existing company clients — does not invent a client or send.
 */
export async function attachQuoteClient(input: {
  quoteId: string | null | undefined;
  quoteClientId: string | null | undefined;
  clientId: string | null | undefined;
  companyClients: { id: string; name: string; archived?: boolean | null }[] | null | undefined;
}): Promise<AttachQuoteClientResult> {
  const decision = decideQuoteClientAttach(input);
  if (decision.action === 'miss') throw new Error(decision.message);
  const { error } = await supabase
    .from('quotes')
    .update({ client_id: decision.clientId, updated_at: new Date().toISOString() })
    .eq('id', decision.quoteId);
  if (error) throw error;
  return { quoteId: decision.quoteId, clientId: decision.clientId };
}

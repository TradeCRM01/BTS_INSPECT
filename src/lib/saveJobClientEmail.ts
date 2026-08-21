import { supabase } from './supabase';
import { clientEmailForSend } from './sendInvoice';

/** Named miss when there is no existing client to write. Does not invent a client. */
export const JOB_CLIENT_EMAIL_NO_CLIENT = 'This job has no client.';
export const JOB_CLIENT_EMAIL_SAVED = 'Client email saved';
export const JOB_CLIENT_EMAIL_CLEARED = 'Client email cleared';

/** Trim to store. Blank stays empty — never invent an address. */
export function jobClientEmailToStore(email: string | null | undefined): string | null {
  const trimmed = (email ?? '').trim();
  return trimmed || null;
}

export type JobClientEmailRow =
  | { kind: 'none' }
  | { kind: 'mailto'; clientId: string; email: string }
  | { kind: 'edit'; clientId: string; email: string };

/**
 * Email write lives on this job's existing client row only.
 * No client_id / no client row → no editor (do not invent a client).
 * Sendable email → show the saved address. Empty / invalid → write field.
 */
export function jobClientEmailRow(input: {
  clientId: string | null | undefined;
  client: { id: string; email: string | null } | null | undefined;
}): JobClientEmailRow {
  if (!input.clientId || !input.client) return { kind: 'none' };
  const sendable = clientEmailForSend(input.client.email);
  if (sendable) {
    return { kind: 'mailto', clientId: input.client.id, email: sendable };
  }
  return { kind: 'edit', clientId: input.client.id, email: input.client.email ?? '' };
}

export type JobClientEmailSaveDecision =
  | { action: 'miss'; reason: 'no_client'; message: typeof JOB_CLIENT_EMAIL_NO_CLIENT }
  | { action: 'write'; clientId: string; email: string | null };

export function decideJobClientEmailSave(input: {
  clientId: string | null | undefined;
  email: string | null | undefined;
}): JobClientEmailSaveDecision {
  if (!input.clientId) {
    return { action: 'miss', reason: 'no_client', message: JOB_CLIENT_EMAIL_NO_CLIENT };
  }
  return {
    action: 'write',
    clientId: input.clientId,
    email: jobClientEmailToStore(input.email),
  };
}

export function jobClientEmailSaveToast(email: string | null): {
  message: string;
  kind: 'success' | 'info';
} {
  if (email) return { message: JOB_CLIENT_EMAIL_SAVED, kind: 'success' };
  return { message: JOB_CLIENT_EMAIL_CLEARED, kind: 'info' };
}

export type SaveJobClientEmailResult = {
  clientId: string;
  email: string | null;
};

/**
 * Write clients.email on this job's existing client_id.
 * Does not send, invent a client, or change Next.
 */
export async function saveJobClientEmail(input: {
  clientId: string | null | undefined;
  email: string | null | undefined;
}): Promise<SaveJobClientEmailResult> {
  const decision = decideJobClientEmailSave(input);
  if (decision.action === 'miss') throw new Error(decision.message);
  const { error } = await supabase
    .from('clients')
    .update({ email: decision.email })
    .eq('id', decision.clientId);
  if (error) throw error;
  return { clientId: decision.clientId, email: decision.email };
}

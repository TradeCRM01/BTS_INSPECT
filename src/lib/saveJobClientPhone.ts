import { supabase } from './supabase';
import { clientPhoneForSms } from './sendInvoice';

/** Named miss when there is no existing client to write. Does not invent a client. */
export const JOB_CLIENT_PHONE_NO_CLIENT = 'This job has no client.';
export const JOB_CLIENT_PHONE_SAVED = 'Client phone saved';
export const JOB_CLIENT_PHONE_CLEARED = 'Client phone cleared';

/** Trim to store. Blank stays empty — never invent a number. */
export function jobClientPhoneToStore(phone: string | null | undefined): string | null {
  const trimmed = (phone ?? '').trim();
  return trimmed || null;
}

export type JobClientPhoneRow =
  | { kind: 'none' }
  | { kind: 'tel'; clientId: string; phone: string }
  | { kind: 'edit'; clientId: string; phone: string };

/**
 * Phone write lives on this job's existing client row only.
 * No client_id / no client row → no editor (do not invent a client).
 * Sendable phone → show the saved number. Empty / invalid → write field.
 */
export function jobClientPhoneRow(input: {
  clientId: string | null | undefined;
  client: { id: string; phone: string | null } | null | undefined;
}): JobClientPhoneRow {
  if (!input.clientId || !input.client) return { kind: 'none' };
  const sendable = clientPhoneForSms(input.client.phone);
  if (sendable) {
    const stored = (input.client.phone ?? '').trim();
    return { kind: 'tel', clientId: input.client.id, phone: stored || sendable };
  }
  return { kind: 'edit', clientId: input.client.id, phone: input.client.phone ?? '' };
}

export type JobClientPhoneSaveDecision =
  | { action: 'miss'; reason: 'no_client'; message: typeof JOB_CLIENT_PHONE_NO_CLIENT }
  | { action: 'write'; clientId: string; phone: string | null };

export function decideJobClientPhoneSave(input: {
  clientId: string | null | undefined;
  phone: string | null | undefined;
}): JobClientPhoneSaveDecision {
  if (!input.clientId) {
    return { action: 'miss', reason: 'no_client', message: JOB_CLIENT_PHONE_NO_CLIENT };
  }
  return {
    action: 'write',
    clientId: input.clientId,
    phone: jobClientPhoneToStore(input.phone),
  };
}

export function jobClientPhoneSaveToast(phone: string | null): {
  message: string;
  kind: 'success' | 'info';
} {
  if (phone) return { message: JOB_CLIENT_PHONE_SAVED, kind: 'success' };
  return { message: JOB_CLIENT_PHONE_CLEARED, kind: 'info' };
}

export type SaveJobClientPhoneResult = {
  clientId: string;
  phone: string | null;
};

/**
 * Write clients.phone on this job's existing client_id.
 * Does not send, SMS, invent a client, or change Next.
 */
export async function saveJobClientPhone(input: {
  clientId: string | null | undefined;
  phone: string | null | undefined;
}): Promise<SaveJobClientPhoneResult> {
  const decision = decideJobClientPhoneSave(input);
  if (decision.action === 'miss') throw new Error(decision.message);
  const { error } = await supabase
    .from('clients')
    .update({ phone: decision.phone })
    .eq('id', decision.clientId);
  if (error) throw error;
  return { clientId: decision.clientId, phone: decision.phone };
}

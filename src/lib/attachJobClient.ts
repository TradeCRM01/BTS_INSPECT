import { supabase } from './supabase';

/** Named miss when this company has nobody to pick. Does not invent a client. */
export const JOB_CLIENT_ATTACH_NO_CLIENTS = 'No clients to attach';
export const JOB_CLIENT_ATTACH_NO_JOB = 'This job is missing.';
export const JOB_CLIENT_ATTACH_ALREADY = 'This job already has a client.';
export const JOB_CLIENT_ATTACH_NO_SELECTION = 'Pick a client.';
export const JOB_CLIENT_ATTACH_UNKNOWN = 'That client is not on this company.';
export const JOB_CLIENT_ATTACH_SAVED = 'Client attached';

export type CompanyClientOption = {
  id: string;
  name: string;
};

export type JobClientAttachRow =
  | { kind: 'linked' }
  | { kind: 'pending' }
  | { kind: 'pick'; clients: CompanyClientOption[] }
  | { kind: 'miss'; reason: 'no_clients'; message: typeof JOB_CLIENT_ATTACH_NO_CLIENTS };

/**
 * Existing company clients only. Drops archived / nameless rows.
 * Does not invent a placeholder client.
 */
export function companyClientsForAttach(
  clients: { id: string; name: string; archived?: boolean | null }[] | null | undefined,
): CompanyClientOption[] {
  return (clients ?? [])
    .filter(c => c.id && !(c.archived ?? false) && c.name.trim())
    .map(c => ({ id: c.id, name: c.name.trim() }));
}

/**
 * Picker lives on this job's existing client row only.
 * Already has client_id → signed row (no picker).
 * No company clients → named miss (no fake picker).
 */
export function jobClientAttachRow(input: {
  jobClientId: string | null | undefined;
  companyClients: { id: string; name: string; archived?: boolean | null }[] | null | undefined;
}): JobClientAttachRow {
  if (input.jobClientId) return { kind: 'linked' };
  if (input.companyClients == null) return { kind: 'pending' };
  const clients = companyClientsForAttach(input.companyClients);
  if (clients.length === 0) {
    return { kind: 'miss', reason: 'no_clients', message: JOB_CLIENT_ATTACH_NO_CLIENTS };
  }
  return { kind: 'pick', clients };
}

export type JobClientAttachDecision =
  | { action: 'miss'; reason: 'no_job'; message: typeof JOB_CLIENT_ATTACH_NO_JOB }
  | { action: 'miss'; reason: 'already_linked'; message: typeof JOB_CLIENT_ATTACH_ALREADY }
  | { action: 'miss'; reason: 'no_clients'; message: typeof JOB_CLIENT_ATTACH_NO_CLIENTS }
  | { action: 'miss'; reason: 'no_selection'; message: typeof JOB_CLIENT_ATTACH_NO_SELECTION }
  | { action: 'miss'; reason: 'unknown_client'; message: typeof JOB_CLIENT_ATTACH_UNKNOWN }
  | { action: 'write'; jobId: string; clientId: string };

export function decideJobClientAttach(input: {
  jobId: string | null | undefined;
  jobClientId: string | null | undefined;
  clientId: string | null | undefined;
  companyClients: { id: string; name: string; archived?: boolean | null }[] | null | undefined;
}): JobClientAttachDecision {
  if (!input.jobId) {
    return { action: 'miss', reason: 'no_job', message: JOB_CLIENT_ATTACH_NO_JOB };
  }
  if (input.jobClientId) {
    return { action: 'miss', reason: 'already_linked', message: JOB_CLIENT_ATTACH_ALREADY };
  }
  const clients = companyClientsForAttach(input.companyClients);
  if (clients.length === 0) {
    return { action: 'miss', reason: 'no_clients', message: JOB_CLIENT_ATTACH_NO_CLIENTS };
  }
  const clientId = (input.clientId ?? '').trim();
  if (!clientId) {
    return { action: 'miss', reason: 'no_selection', message: JOB_CLIENT_ATTACH_NO_SELECTION };
  }
  if (!clients.some(c => c.id === clientId)) {
    return { action: 'miss', reason: 'unknown_client', message: JOB_CLIENT_ATTACH_UNKNOWN };
  }
  return { action: 'write', jobId: input.jobId, clientId };
}

export function jobClientAttachToast(): { message: string; kind: 'success' } {
  return { message: JOB_CLIENT_ATTACH_SAVED, kind: 'success' };
}

export type AttachJobClientResult = {
  jobId: string;
  clientId: string;
};

/**
 * Write jobs.client_id on this job only.
 * Selects from existing company clients — does not invent a client,
 * send, or invoice.
 */
export async function attachJobClient(input: {
  jobId: string | null | undefined;
  jobClientId: string | null | undefined;
  clientId: string | null | undefined;
  companyClients: { id: string; name: string; archived?: boolean | null }[] | null | undefined;
}): Promise<AttachJobClientResult> {
  const decision = decideJobClientAttach(input);
  if (decision.action === 'miss') throw new Error(decision.message);
  const { error } = await supabase
    .from('jobs')
    .update({ client_id: decision.clientId, updated_at: new Date().toISOString() })
    .eq('id', decision.jobId);
  if (error) throw error;
  return { jobId: decision.jobId, clientId: decision.clientId };
}

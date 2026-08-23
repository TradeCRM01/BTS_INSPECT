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

export const CONTRACT_CLIENT_ATTACH_NO_CLIENTS = JOB_CLIENT_ATTACH_NO_CLIENTS;
export const CONTRACT_CLIENT_ATTACH_NO_CONTRACT = 'This contract is missing.';
export const CONTRACT_CLIENT_ATTACH_ALREADY = 'This contract already has a client.';
export const CONTRACT_CLIENT_ATTACH_NO_SELECTION = JOB_CLIENT_ATTACH_NO_SELECTION;
export const CONTRACT_CLIENT_ATTACH_UNKNOWN = JOB_CLIENT_ATTACH_UNKNOWN;
export const CONTRACT_CLIENT_ATTACH_SAVED = JOB_CLIENT_ATTACH_SAVED;

export { companyClientsForAttach };
export type ContractClientAttachRow = JobClientAttachRow;

export function contractClientAttachRow(input: {
  contractClientId: string | null | undefined;
  companyClients: { id: string; name: string; archived?: boolean | null }[] | null | undefined;
}): ContractClientAttachRow {
  return jobClientAttachRow({
    jobClientId: input.contractClientId,
    companyClients: input.companyClients,
  });
}

export type ContractClientAttachDecision =
  | { action: 'miss'; reason: 'no_contract'; message: typeof CONTRACT_CLIENT_ATTACH_NO_CONTRACT }
  | { action: 'miss'; reason: 'already_linked'; message: typeof CONTRACT_CLIENT_ATTACH_ALREADY }
  | { action: 'miss'; reason: 'no_clients'; message: typeof CONTRACT_CLIENT_ATTACH_NO_CLIENTS }
  | { action: 'miss'; reason: 'no_selection'; message: typeof CONTRACT_CLIENT_ATTACH_NO_SELECTION }
  | { action: 'miss'; reason: 'unknown_client'; message: typeof CONTRACT_CLIENT_ATTACH_UNKNOWN }
  | { action: 'write'; contractId: string; clientId: string };

export function decideContractClientAttach(input: {
  contractId: string | null | undefined;
  contractClientId: string | null | undefined;
  clientId: string | null | undefined;
  companyClients: { id: string; name: string; archived?: boolean | null }[] | null | undefined;
}): ContractClientAttachDecision {
  if (!input.contractId) {
    return { action: 'miss', reason: 'no_contract', message: CONTRACT_CLIENT_ATTACH_NO_CONTRACT };
  }
  if (input.contractClientId) {
    return { action: 'miss', reason: 'already_linked', message: CONTRACT_CLIENT_ATTACH_ALREADY };
  }
  const clients = companyClientsForAttach(input.companyClients);
  if (clients.length === 0) {
    return { action: 'miss', reason: 'no_clients', message: CONTRACT_CLIENT_ATTACH_NO_CLIENTS };
  }
  const clientId = (input.clientId ?? '').trim();
  if (!clientId) {
    return { action: 'miss', reason: 'no_selection', message: CONTRACT_CLIENT_ATTACH_NO_SELECTION };
  }
  if (!clients.some(c => c.id === clientId)) {
    return { action: 'miss', reason: 'unknown_client', message: CONTRACT_CLIENT_ATTACH_UNKNOWN };
  }
  return { action: 'write', contractId: input.contractId, clientId };
}

export function contractClientAttachToast(): { message: string; kind: 'success' } {
  return jobClientAttachToast();
}

export type AttachContractClientResult = {
  contractId: string;
  clientId: string;
};

/** Write service_contracts.client_id. Does not invent a client or send. */
export async function attachContractClient(input: {
  contractId: string | null | undefined;
  contractClientId: string | null | undefined;
  clientId: string | null | undefined;
  companyClients: { id: string; name: string; archived?: boolean | null }[] | null | undefined;
}): Promise<AttachContractClientResult> {
  const decision = decideContractClientAttach(input);
  if (decision.action === 'miss') throw new Error(decision.message);
  const { error } = await supabase
    .from('service_contracts')
    .update({ client_id: decision.clientId, updated_at: new Date().toISOString() })
    .eq('id', decision.contractId);
  if (error) throw error;
  return { contractId: decision.contractId, clientId: decision.clientId };
}

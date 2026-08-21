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
export const REPORT_CLIENT_ATTACH_NO_CLIENTS = JOB_CLIENT_ATTACH_NO_CLIENTS;
export const REPORT_CLIENT_ATTACH_NO_TARGET = 'This report has nothing to attach a client to.';
export const REPORT_CLIENT_ATTACH_ALREADY = 'This report already has a client.';
export const REPORT_CLIENT_ATTACH_NO_SELECTION = JOB_CLIENT_ATTACH_NO_SELECTION;
export const REPORT_CLIENT_ATTACH_UNKNOWN = JOB_CLIENT_ATTACH_UNKNOWN;
export const REPORT_CLIENT_ATTACH_SAVED = JOB_CLIENT_ATTACH_SAVED;

export { companyClientsForAttach };
export type ReportClientAttachRow = JobClientAttachRow;

/**
 * Picker lives on the existing report-send no_client miss only.
 * Already has a resolved client → signed #44 path (no picker).
 * No company clients → named miss (no fake picker).
 */
export function reportClientAttachRow(input: {
  reportClientId: string | null | undefined;
  companyClients: { id: string; name: string; archived?: boolean | null }[] | null | undefined;
}): ReportClientAttachRow {
  return jobClientAttachRow({
    jobClientId: input.reportClientId,
    companyClients: input.companyClients,
  });
}

export type ReportClientAttachDecision =
  | { action: 'miss'; reason: 'no_target'; message: typeof REPORT_CLIENT_ATTACH_NO_TARGET }
  | { action: 'miss'; reason: 'already_linked'; message: typeof REPORT_CLIENT_ATTACH_ALREADY }
  | { action: 'miss'; reason: 'no_clients'; message: typeof REPORT_CLIENT_ATTACH_NO_CLIENTS }
  | { action: 'miss'; reason: 'no_selection'; message: typeof REPORT_CLIENT_ATTACH_NO_SELECTION }
  | { action: 'miss'; reason: 'unknown_client'; message: typeof REPORT_CLIENT_ATTACH_UNKNOWN }
  | { action: 'write'; target: 'job'; jobId: string; clientId: string }
  | { action: 'write'; target: 'inspection'; inspectionId: string; clientId: string };

/**
 * Job bound to this report → write jobs.client_id.
 * Else write inspections.client_id.
 * Does not invent a client.
 */
export function decideReportClientAttach(input: {
  jobId: string | null | undefined;
  inspectionId: string | null | undefined;
  reportClientId: string | null | undefined;
  clientId: string | null | undefined;
  companyClients: { id: string; name: string; archived?: boolean | null }[] | null | undefined;
}): ReportClientAttachDecision {
  const jobId = (input.jobId ?? '').trim();
  const inspectionId = (input.inspectionId ?? '').trim();
  if (!jobId && !inspectionId) {
    return { action: 'miss', reason: 'no_target', message: REPORT_CLIENT_ATTACH_NO_TARGET };
  }
  if (input.reportClientId) {
    return { action: 'miss', reason: 'already_linked', message: REPORT_CLIENT_ATTACH_ALREADY };
  }
  const clients = companyClientsForAttach(input.companyClients);
  if (clients.length === 0) {
    return { action: 'miss', reason: 'no_clients', message: REPORT_CLIENT_ATTACH_NO_CLIENTS };
  }
  const clientId = (input.clientId ?? '').trim();
  if (!clientId) {
    return { action: 'miss', reason: 'no_selection', message: REPORT_CLIENT_ATTACH_NO_SELECTION };
  }
  if (!clients.some(c => c.id === clientId)) {
    return { action: 'miss', reason: 'unknown_client', message: REPORT_CLIENT_ATTACH_UNKNOWN };
  }
  if (jobId) {
    return { action: 'write', target: 'job', jobId, clientId };
  }
  return { action: 'write', target: 'inspection', inspectionId, clientId };
}

export function reportClientAttachToast(): { message: string; kind: 'success' } {
  return jobClientAttachToast();
}

export type AttachReportClientResult =
  | { target: 'job'; jobId: string; clientId: string }
  | { target: 'inspection'; inspectionId: string; clientId: string };

/**
 * Write jobs.client_id when a job is bound to this report.
 * Else write inspections.client_id.
 * Selects from existing company clients — does not invent a client or send.
 */
export async function attachReportClient(input: {
  jobId: string | null | undefined;
  inspectionId: string | null | undefined;
  reportClientId: string | null | undefined;
  clientId: string | null | undefined;
  companyClients: { id: string; name: string; archived?: boolean | null }[] | null | undefined;
}): Promise<AttachReportClientResult> {
  const decision = decideReportClientAttach(input);
  if (decision.action === 'miss') throw new Error(decision.message);
  if (decision.target === 'job') {
    const { error } = await supabase
      .from('jobs')
      .update({ client_id: decision.clientId, updated_at: new Date().toISOString() })
      .eq('id', decision.jobId);
    if (error) throw error;
    return { target: 'job', jobId: decision.jobId, clientId: decision.clientId };
  }
  if (decision.target === 'inspection') {
    const { error } = await supabase
      .from('inspections')
      .update({ client_id: decision.clientId })
      .eq('id', decision.inspectionId);
    if (error) throw error;
    return {
      target: 'inspection',
      inspectionId: decision.inspectionId,
      clientId: decision.clientId,
    };
  }
  throw new Error(REPORT_CLIENT_ATTACH_NO_TARGET);
}

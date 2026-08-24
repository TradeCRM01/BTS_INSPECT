import { supabase } from './supabase';
import { getAuditContractVisitReminderBundle } from './devFieldAuditDocs';
import {
  applyContractVisitReminderScope,
  contractVisitReminderClientQuery,
  contractVisitReminderQueries,
  decideContractVisitReminder,
  type ContractVisitReminderBundle,
  type ContractVisitReminderClient,
  type ContractVisitReminderCompany,
  type ContractVisitReminderContract,
} from './contractVisitReminder';
import { type SmtpSettingsRow } from './sendInvoice';
import { formatEmailAndSmsMessage, type SmsSendResult } from './jobReminder';

export type DeliverContractVisitReminderResult =
  | { ok: true; to: string; markedSent: true; message: string; sms: SmsSendResult | null }
  | { ok: false; message: string; markedSent: false; href?: string };

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

export async function loadContractVisitReminderBundle(
  contractId: string,
  company: ContractVisitReminderCompany & { id: string },
): Promise<ContractVisitReminderBundle> {
  const mock = getAuditContractVisitReminderBundle(contractId, company);
  if (mock) return mock;
  const scopes = contractVisitReminderQueries({ companyId: company.id, contractId });
  const contractRes = await applyContractVisitReminderScope(supabase.from(scopes.contract.table), scopes.contract).maybeSingle();
  if (contractRes.error) throw contractRes.error;
  const contract = (contractRes.data ?? null) as ContractVisitReminderContract | null;

  const clientScope = contractVisitReminderClientQuery(contract?.client_id);
  const smtpScope = scopes.smtp;
  const [clientRes, smtpRes] = await Promise.all([
    clientScope
      ? applyContractVisitReminderScope(supabase.from(clientScope.table), clientScope).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    applyContractVisitReminderScope(supabase.from(smtpScope.table), smtpScope).maybeSingle(),
  ]);
  if (clientRes.error) throw clientRes.error;
  if (smtpRes.error) throw smtpRes.error;

  return {
    contract,
    client: (clientRes.data ?? null) as ContractVisitReminderClient | null,
    smtp: (smtpRes.data ?? null) as SmtpSettingsRow | null,
    company,
  };
}

/**
 * Email the contract visit reminder through job-reminder.
 * Callers must not stamp sent themselves on a failed result.
 */
export async function deliverContractVisitReminder(args: {
  contractId: string;
  company: ContractVisitReminderCompany & { id: string };
}): Promise<DeliverContractVisitReminderResult> {
  const bundle = await loadContractVisitReminderBundle(args.contractId, args.company);
  const decision = decideContractVisitReminder({
    bundle,
    companyId: args.company.id,
    mode: 'manual',
  });
  if (!decision.ok) {
    return { ok: false, message: decision.message, markedSent: false, href: decision.href };
  }

  const { data, error } = await supabase.functions.invoke('job-reminder', {
    body: {
      contractId: args.contractId,
      appUrl: typeof window !== 'undefined' ? window.location.origin : '',
    },
  });

  if (error) {
    const fromBody = await readFunctionError(error);
    return {
      ok: false,
      message: fromBody?.error || fromBody?.message || error.message || 'Could not send the reminder.',
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
      message: String(data.message ?? data.results?.[0]?.message ?? 'Reminder was not sent.'),
      markedSent: false,
      href: data.href,
    };
  }
  if (!data?.sent) {
    return { ok: false, message: 'Reminder was not sent.', markedSent: false };
  }

  const to = String(data.to ?? decision.to);
  const sms = (data?.sms ?? null) as SmsSendResult | null;
  const message = String(data.message ?? '').trim()
    || formatEmailAndSmsMessage(`Reminder sent to ${to}`, sms);
  return { ok: true, to, markedSent: true, message, sms };
}

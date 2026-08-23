import {
  COMPANY_TIME_ZONE,
  dateOnly,
  escapeHtml,
  formatJobDate,
  missSmsMessage,
  todayYmd,
  type ReminderEmailSettings,
} from './jobReminder';
import {
  COMPANY_EMAIL_SETTINGS_HREF,
  clientEmailForSend,
  clientPhoneForSms,
  isSmtpReady,
  type SmtpSettingsRow,
} from './sendInvoice';
import { isContractActive } from './createContractServiceJob';

export {
  COMPANY_EMAIL_SETTINGS_HREF,
  clientEmailForSend,
  clientPhoneForSms,
  dateOnly,
  isSmtpReady,
  todayYmd,
};

export const CONTRACT_VISIT_REMINDER_COLUMNS =
  'id, company_id, client_id, title, description, contract_number, status, end_date, service_frequency, next_service_date, last_service_date, auto_generate_jobs, service_reminder_sent_at, service_reminder_sent_for_date';

export const CONTRACT_VISIT_REMINDER_CLIENT_COLUMNS = 'id, name, email, phone, contact_person, address';

export const CONTRACT_VISIT_REMINDER_PIPE = [
  'supabase.functions.invoke job-reminder contractId',
  'To = clients.email (never invented)',
  'SMS To = clients.phone beside email — miss does not stamp sent-at',
  'POST https://api.resend.com/emails with email_settings.smtp_pass',
  'UPDATE service_reminder_sent_at / service_reminder_sent_for_date only when Resend returns 2xx',
] as const;

/**
 * How auto-fire actually runs — same Perth cron as the 24h job ping.
 * No tray click. No new notify module. No new cron stack.
 * pg_cron job-client-reminder-* → invoke_job_client_reminders() → job-reminder due=contract.
 */
export const CONTRACT_VISIT_AUTO_FIRE_PATH = [
  'pg_cron job-client-reminder-perth-morning (0 23 * * * UTC = 07:00 Australia/Perth)',
  'pg_cron job-client-reminder-perth-afternoon (0 8 * * * UTC = 16:00 Australia/Perth)',
  'SELECT public.invoke_job_client_reminders()',
  'pg_net POST /functions/v1/job-reminder due=contract source=cron',
  'perth_today = (timezone(Australia/Perth, now()))::date',
  'email_settings where Resend is ready (companies without SMTP are not scanned)',
  'service_contracts where next_service_date = perth_today and status = active',
  'skip already_sent for this next_service_date; skip no client email; skip no due date',
  'POST https://api.resend.com/emails with email_settings.smtp_pass',
  'POST https://api.twilio.com SMS beside email — miss does not flip sent-at',
  'UPDATE service_reminder_sent_at / service_reminder_sent_for_date only when Resend returns 2xx',
] as const;

export type ContractVisitReminderBlocker =
  | 'not_found'
  | 'not_active'
  | 'no_client'
  | 'no_email'
  | 'no_smtp'
  | 'no_next_date'
  | 'not_due'
  | 'past_end'
  | 'wrong_company'
  | 'already_sent';

export type ContractVisitReminderContract = {
  id: string;
  company_id: string;
  client_id: string | null;
  title: string;
  description: string | null;
  contract_number: string | null;
  status: string;
  end_date: string | null;
  service_frequency: string;
  next_service_date: string | null;
  last_service_date?: string | null;
  auto_generate_jobs?: boolean;
  service_reminder_sent_at?: string | null;
  service_reminder_sent_for_date?: string | null;
};

export type ContractVisitReminderClient = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  contact_person?: string | null;
  address?: string | null;
};

export type ContractVisitReminderCompany = {
  name: string;
  email?: string | null;
  phone?: string | null;
};

export type ContractVisitReminderBundle = {
  contract: ContractVisitReminderContract | null;
  client: ContractVisitReminderClient | null;
  smtp: SmtpSettingsRow | ReminderEmailSettings | null;
  company: ContractVisitReminderCompany;
};

export type ContractVisitReminderQueryScope = {
  table: 'service_contracts' | 'clients' | 'email_settings';
  columns: string;
  eq: Record<string, string>;
};

export type ContractVisitReminderDecision =
  | {
      ok: true;
      to: string;
      toName: string;
      subject: string;
      smsTo: string | null;
      smsMessage: string | null;
      dueOn: string;
    }
  | {
      ok: false;
      blocker: ContractVisitReminderBlocker;
      message: string;
      href?: string;
    };

type FilterBuilder = {
  eq: (column: string, value: string) => FilterBuilder;
};

export function missContractVisitReminderMessage(reason: ContractVisitReminderBlocker): string {
  switch (reason) {
    case 'not_found':
      return 'Contract not found.';
    case 'not_active':
      return 'Only active contracts can send a visit reminder.';
    case 'no_client':
      return 'Pick a client before you can remind them.';
    case 'no_email':
      return 'This client has no email — reminder was not sent.';
    case 'no_smtp':
      return 'Email is not set up. Add SMTP in Company settings — there is a test send there.';
    case 'no_next_date':
      return 'This contract has no next service date — reminder was not sent.';
    case 'not_due':
      return 'Reminder is for visits due today.';
    case 'past_end':
      return 'Next service is after the contract end date — reminder was not sent.';
    case 'wrong_company':
      return 'This contract is not in this company.';
    case 'already_sent':
      return 'Already reminded for this visit date.';
  }
}

export function alreadyRemindedForVisit(row: {
  next_service_date?: string | null;
  service_reminder_sent_at?: string | null;
  service_reminder_sent_for_date?: string | null;
}, dueDate?: string | null): boolean {
  const day = dateOnly(dueDate ?? row.next_service_date);
  if (!day || !row.service_reminder_sent_at) return false;
  const sentFor = dateOnly(row.service_reminder_sent_for_date);
  if (sentFor) return sentFor === day;
  return true;
}

export function contractVisitDuePhrase(dueOn: string, now = new Date()): string {
  const today = todayYmd(now);
  if (dueOn < today) return 'is overdue';
  return 'is due today';
}

export function contractVisitLabel(contract: Pick<ContractVisitReminderContract, 'title' | 'contract_number'>): string {
  const title = contract.title.trim() || 'Service visit';
  const number = contract.contract_number?.trim();
  return number ? `${title} (${number})` : title;
}

export function contractVisitReminderSubject(args: {
  contract: Pick<ContractVisitReminderContract, 'title' | 'contract_number'>;
  dueOn: string;
  now?: Date;
}): string {
  const when = formatJobDate(args.dueOn);
  const phrase = contractVisitDuePhrase(args.dueOn, args.now);
  return `Reminder: ${contractVisitLabel(args.contract)} ${phrase} (${when})`;
}

export function contractVisitReminderSmsBody(args: {
  contract: Pick<ContractVisitReminderContract, 'title' | 'contract_number'>;
  company: ContractVisitReminderCompany;
  dueOn: string;
  site?: string | null;
  now?: Date;
}): string {
  const when = formatJobDate(args.dueOn);
  const label = contractVisitLabel(args.contract);
  const phrase = contractVisitDuePhrase(args.dueOn, args.now);
  const site = (args.site ?? '').trim();
  const companyPhone = (args.company.phone ?? '').trim();
  return [
    `Reminder: ${label} ${phrase} (${when}).`,
    site ? `Site: ${site}.` : null,
    `Reply to book it in${companyPhone ? ` or call ${companyPhone}` : ''}.`,
  ].filter((line): line is string => line !== null).join(' ');
}

export function contractVisitReminderHtml(args: {
  greeting: string;
  companyName: string;
  label: string;
  when: string;
  site: string;
  companyPhone: string;
  duePhrase: string;
}): string {
  return `
      <div style="font-family:Segoe UI,Arial,sans-serif;max-width:560px;margin:0 auto;color:#1A1A1A">
        <div style="background:#0A2540;color:#fff;padding:20px 24px;border-radius:8px 8px 0 0">
          <div style="font-size:12px;opacity:.7;letter-spacing:1px;text-transform:uppercase">${escapeHtml(args.companyName)}</div>
          <h1 style="margin:8px 0 0;font-size:20px">Service visit due</h1>
        </div>
        <div style="border:1px solid #E5E7EB;border-top:none;padding:24px;border-radius:0 0 8px 8px">
          <p>Hi ${escapeHtml(args.greeting)},</p>
          <p>${escapeHtml(args.companyName)} — your <strong>${escapeHtml(args.label)}</strong> ${escapeHtml(args.duePhrase)}.</p>
          <div style="margin:20px 0;padding:16px;background:#F9FAFB;border-radius:8px">
            <p style="margin:0;color:#4A5568;font-size:14px;line-height:1.6">
              <strong>Visit:</strong> ${escapeHtml(args.label)}<br/>
              <strong>Due:</strong> ${escapeHtml(args.when)}
              ${args.site ? `<br/><strong>Site:</strong> ${escapeHtml(args.site)}` : ''}
            </p>
          </div>
          <p>Reply to book it in — the visit is already on the contract.</p>
          ${args.companyPhone ? `<p style="font-size:13px;color:#6B7280">Or call ${escapeHtml(args.companyPhone)}.</p>` : ''}
          <p style="font-size:12px;color:#6B7280">You're receiving this because this service visit is due on the contract.</p>
        </div>
      </div>`;
}

export function contractVisitReminderSuccessPatch(
  dueOn: string,
  sentAt = new Date(),
): { service_reminder_sent_at: string; service_reminder_sent_for_date: string | null } {
  return {
    service_reminder_sent_at: sentAt.toISOString(),
    service_reminder_sent_for_date: dateOnly(dueOn),
  };
}

export function shouldRecordContractVisitReminderSent(sendOk: boolean): boolean {
  return sendOk === true;
}

export function decideContractVisitReminder(args: {
  bundle: ContractVisitReminderBundle;
  companyId: string;
  now?: Date;
  mode?: 'auto' | 'manual';
}): ContractVisitReminderDecision {
  const { bundle, companyId } = args;
  const now = args.now ?? new Date();
  const mode = args.mode ?? 'manual';
  const contract = bundle.contract;
  if (!contract) {
    return { ok: false, blocker: 'not_found', message: missContractVisitReminderMessage('not_found') };
  }
  if ((contract.company_id ?? '').trim() !== companyId.trim()) {
    return { ok: false, blocker: 'wrong_company', message: missContractVisitReminderMessage('wrong_company') };
  }
  if (!isContractActive(contract.status)) {
    return { ok: false, blocker: 'not_active', message: missContractVisitReminderMessage('not_active') };
  }
  const clientId = (contract.client_id ?? '').trim();
  if (!clientId || !bundle.client) {
    return { ok: false, blocker: 'no_client', message: missContractVisitReminderMessage('no_client') };
  }
  const dueOn = dateOnly(contract.next_service_date);
  if (!dueOn) {
    return { ok: false, blocker: 'no_next_date', message: missContractVisitReminderMessage('no_next_date') };
  }
  const end = dateOnly(contract.end_date);
  if (end && dueOn > end) {
    return { ok: false, blocker: 'past_end', message: missContractVisitReminderMessage('past_end') };
  }
  const today = todayYmd(now);
  if (mode === 'auto' && dueOn !== today) {
    return { ok: false, blocker: 'not_due', message: missContractVisitReminderMessage('not_due') };
  }
  if (mode === 'manual' && dueOn > today) {
    return { ok: false, blocker: 'not_due', message: missContractVisitReminderMessage('not_due') };
  }
  if (mode === 'auto' && alreadyRemindedForVisit(contract, dueOn)) {
    return { ok: false, blocker: 'already_sent', message: missContractVisitReminderMessage('already_sent') };
  }
  const to = clientEmailForSend(bundle.client.email);
  if (!to) {
    return { ok: false, blocker: 'no_email', message: missContractVisitReminderMessage('no_email') };
  }
  if (!isSmtpReady(bundle.smtp)) {
    return {
      ok: false,
      blocker: 'no_smtp',
      message: missContractVisitReminderMessage('no_smtp'),
      href: COMPANY_EMAIL_SETTINGS_HREF,
    };
  }
  const smsTo = clientPhoneForSms(bundle.client.phone);
  return {
    ok: true,
    to,
    toName: (bundle.client.contact_person || bundle.client.name || 'Client').trim(),
    subject: contractVisitReminderSubject({ contract, dueOn, now }),
    smsTo,
    smsMessage: smsTo ? null : missSmsMessage('no_phone'),
    dueOn,
  };
}

export function buildContractVisitReminderEmail(args: {
  contract: ContractVisitReminderContract;
  client: ContractVisitReminderClient;
  company: ContractVisitReminderCompany;
  to: string;
  dueOn: string;
  now?: Date;
}): { to: string; subject: string; html: string; text: string } {
  const when = formatJobDate(args.dueOn);
  const label = contractVisitLabel(args.contract);
  const site = (args.client.address ?? '').trim();
  const companyName = (args.company.name ?? '').trim() || 'us';
  const companyPhone = (args.company.phone ?? '').trim();
  const greeting = (args.client.contact_person || args.client.name || 'there').trim();
  const duePhrase = contractVisitDuePhrase(args.dueOn, args.now);
  const subject = contractVisitReminderSubject({
    contract: args.contract,
    dueOn: args.dueOn,
    now: args.now,
  });
  const text = [
    `Hi ${greeting},`,
    '',
    `${companyName} — your ${label} ${duePhrase}.`,
    `Due: ${when}`,
    site ? `Site: ${site}` : null,
    '',
    'Reply to book it in — the visit is already on the contract.',
    companyPhone ? `Call: ${companyPhone}` : null,
  ].filter((line): line is string => line !== null).join('\n');
  const html = contractVisitReminderHtml({
    greeting,
    companyName,
    label,
    when,
    site,
    companyPhone,
    duePhrase,
  });
  return { to: args.to, subject, html, text };
}

export function contractVisitByIdQuery(args: {
  companyId: string;
  contractId: string;
}): ContractVisitReminderQueryScope | null {
  const companyId = args.companyId.trim();
  const contractId = args.contractId.trim();
  if (!companyId || !contractId) return null;
  return {
    table: 'service_contracts',
    columns: CONTRACT_VISIT_REMINDER_COLUMNS,
    eq: { id: contractId, company_id: companyId },
  };
}

export function contractVisitReminderQueries(args: {
  companyId: string;
  contractId: string;
}): { contract: ContractVisitReminderQueryScope; smtp: ContractVisitReminderQueryScope } {
  return {
    contract: contractVisitByIdQuery(args)!,
    smtp: {
      table: 'email_settings',
      columns: 'smtp_host, smtp_pass, from_name, from_email',
      eq: { company_id: args.companyId.trim() },
    },
  };
}

export function contractVisitReminderClientQuery(clientId: string | null | undefined): ContractVisitReminderQueryScope | null {
  const id = (clientId ?? '').trim();
  if (!id) return null;
  return {
    table: 'clients',
    columns: CONTRACT_VISIT_REMINDER_CLIENT_COLUMNS,
    eq: { id },
  };
}

export function applyContractVisitReminderScope<T>(
  fromBuilder: { select: (columns: string) => T },
  scope: ContractVisitReminderQueryScope,
): T & FilterBuilder {
  let q = fromBuilder.select(scope.columns) as T & FilterBuilder;
  for (const [column, value] of Object.entries(scope.eq)) {
    q = q.eq(column, value) as typeof q;
  }
  return q;
}

export function wouldScanLedgerToRemindContract(scope: ContractVisitReminderQueryScope | null): boolean {
  if (scope == null) return true;
  if (scope.table === 'service_contracts') return !scope.eq.id || !scope.eq.company_id;
  if (scope.table === 'clients') return !scope.eq.id;
  return !scope.eq.company_id;
}

export function selectDueContractVisits(
  contracts: ContractVisitReminderContract[],
  clients: Map<string, ContractVisitReminderClient> | ContractVisitReminderClient[],
  settings: ReminderEmailSettings | SmtpSettingsRow | null | undefined,
  companyId: string,
  now = new Date(),
): {
  selected: Array<{ contract: ContractVisitReminderContract; client: ContractVisitReminderClient; to: string; dueOn: string }>;
  missed: Array<{ contract: ContractVisitReminderContract; blocker: ContractVisitReminderBlocker; message: string }>;
} {
  const clientMap = clients instanceof Map ? clients : new Map(clients.map(c => [c.id, c]));
  const selected: Array<{ contract: ContractVisitReminderContract; client: ContractVisitReminderClient; to: string; dueOn: string }> = [];
  const missed: Array<{ contract: ContractVisitReminderContract; blocker: ContractVisitReminderBlocker; message: string }> = [];
  const company = { name: '' };

  for (const contract of contracts) {
    const client = contract.client_id ? clientMap.get(contract.client_id) ?? null : null;
    const decision = decideContractVisitReminder({
      bundle: { contract, client, smtp: settings ?? null, company },
      companyId,
      now,
      mode: 'auto',
    });
    if (!decision.ok) {
      if (decision.blocker === 'wrong_company' || decision.blocker === 'not_found') continue;
      missed.push({ contract, blocker: decision.blocker, message: decision.message });
      continue;
    }
    selected.push({ contract, client: client!, to: decision.to, dueOn: decision.dueOn });
  }
  return { selected, missed };
}

export function perthTodaySqlDate(now = new Date()): string {
  return todayYmd(now, COMPANY_TIME_ZONE);
}

export function todayContractVisitQuery(args: {
  companyId: string;
  now?: Date;
}): ContractVisitReminderQueryScope | null {
  const companyId = args.companyId.trim();
  if (!companyId) return null;
  return {
    table: 'service_contracts',
    columns: CONTRACT_VISIT_REMINDER_COLUMNS,
    eq: {
      company_id: companyId,
      next_service_date: perthTodaySqlDate(args.now),
      status: 'active',
    },
  };
}

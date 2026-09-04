import {
  VAN_TIME_ZONE,
  dateOnly,
  emailSettingsReady,
  escapeHtml,
  formatJobDate,
  todayYmd,
  type ReminderEmailSettings,
} from './jobReminder';
import { MEMBER_TICKET_COLUMNS, trimTicketField, type MemberTicket } from './teamMemberTickets';

export {
  VAN_TIME_ZONE,
  dateOnly,
  emailSettingsReady,
  formatJobDate,
  todayYmd,
};

export const TICKET_DUE_COLUMNS = MEMBER_TICKET_COLUMNS;

export const TICKET_DUE_MEMBER_COLUMNS = 'id, company_id, name, email';

/**
 * How auto-fire actually runs — same Perth cron as inspection-due / 24h pre-job.
 * No tray click. No new notify module. No new cron stack.
 * pg_cron → invoke_job_client_reminders() → job-reminder due=tickets.
 * Due-soon and expired both send (Resend 2xx), not a badge-only fake.
 */
export const TICKET_DUE_AUTO_FIRE_PATH = [
  'pg_cron job-client-reminder-perth-morning (0 23 * * * UTC = 07:00 Australia/Perth)',
  'pg_cron job-client-reminder-perth-afternoon (0 8 * * * UTC = 16:00 Australia/Perth)',
  'SELECT public.invoke_job_client_reminders()',
  'pg_net POST /functions/v1/job-reminder due=tickets source=cron',
  'van_today = (timezone(Australia/Brisbane, now()))::date',
  'email_settings where Resend is ready (companies without SMTP are not scanned)',
  'member_tickets where company_id = settings.company_id and expires_on <= van_today',
  'kind = expired when expires_on < van_today; kind = due_soon when expires_on = van_today',
  'skip already_sent for this expires_on + kind; skip no member email; skip no expiry',
  'POST https://api.resend.com/emails with email_settings.smtp_pass',
  'POST https://api.twilio.com SMS beside email — miss does not flip sent-at',
  'UPDATE reminder_sent_at / reminder_sent_for_date / reminder_kind only when Resend returns 2xx',
] as const;

export type TicketReminderKind = 'due_soon' | 'expired';

export type TicketDueMissReason =
  | 'no_email'
  | 'no_expiry'
  | 'not_due'
  | 'no_smtp'
  | 'wrong_company'
  | 'no_ticket'
  | 'already_sent';

export type TicketDueMember = {
  id: string;
  company_id: string;
  name?: string | null;
  email?: string | null;
};

export type TicketDueDecision =
  | {
      ok: true;
      send: true;
      to: string;
      kind: TicketReminderKind;
      expiresOn: string;
      subject: string;
    }
  | {
      ok: false;
      send: false;
      reason: TicketDueMissReason;
      message: string;
      kind?: TicketReminderKind | null;
      expiresOn?: string | null;
      to?: string | null;
    };

export function vanTodayTicketDate(now = new Date()): string {
  return todayYmd(now, VAN_TIME_ZONE);
}

export function ticketReminderKind(
  expiresOn: string | null | undefined,
  today: string,
): TicketReminderKind | null {
  const day = dateOnly(expiresOn);
  if (!day) return null;
  if (day < today) return 'expired';
  if (day === today) return 'due_soon';
  return null;
}

export function missTicketDueMessage(reason: TicketDueMissReason): string {
  switch (reason) {
    case 'no_email':
      return 'This team member has no email — reminder was not sent.';
    case 'no_expiry':
      return 'This ticket has no expiry — reminder was not sent.';
    case 'not_due':
      return 'Reminder is for tickets due today or already expired.';
    case 'no_smtp':
      return 'Email is not set up — reminder was not sent.';
    case 'wrong_company':
      return 'This ticket is not in this company.';
    case 'no_ticket':
      return 'Ticket not found.';
    case 'already_sent':
      return 'Already reminded for this ticket date.';
  }
}

export function alreadyRemindedForTicket(
  row: Pick<MemberTicket, 'reminder_sent_at' | 'reminder_sent_for_date' | 'reminder_kind' | 'expires_on'>,
  kind: TicketReminderKind,
  expiresOn?: string | null,
): boolean {
  if (!row.reminder_sent_at) return false;
  const day = dateOnly(expiresOn ?? row.expires_on);
  const sentFor = dateOnly(row.reminder_sent_for_date);
  const sentKind = trimTicketField(row.reminder_kind);
  if (kind === 'expired') {
    return sentKind === 'expired';
  }
  if (!day) return sentKind === 'due_soon';
  if (sentKind === 'due_soon' && sentFor) return sentFor === day;
  return sentKind === 'due_soon';
}

export function ticketDueLabel(ticket: Pick<MemberTicket, 'name' | 'ticket_number'>): string {
  const name = trimTicketField(ticket.name) || 'Ticket';
  const number = trimTicketField(ticket.ticket_number);
  return number ? `${name} (${number})` : name;
}

export function ticketDuePhrase(kind: TicketReminderKind): string {
  return kind === 'expired' ? 'has expired' : 'expires today';
}

export function ticketDueSubject(args: {
  ticket: Pick<MemberTicket, 'name' | 'ticket_number'>;
  kind: TicketReminderKind;
  expiresOn: string;
}): string {
  const when = formatJobDate(args.expiresOn);
  return `Reminder: ${ticketDueLabel(args.ticket)} ${ticketDuePhrase(args.kind)} (${when})`;
}

export function ticketDueSmsBody(args: {
  ticket: Pick<MemberTicket, 'name' | 'ticket_number'>;
  memberName?: string | null;
  kind: TicketReminderKind;
  expiresOn: string;
  companyPhone?: string | null;
}): string {
  const when = formatJobDate(args.expiresOn);
  const who = trimTicketField(args.memberName) || 'A team member';
  const phone = trimTicketField(args.companyPhone);
  return [
    `Reminder: ${who} — ${ticketDueLabel(args.ticket)} ${ticketDuePhrase(args.kind)} (${when}).`,
    phone ? `Call ${phone}.` : null,
  ].filter((line): line is string => line !== null).join(' ');
}

export function ticketDueHtml(args: {
  greeting: string;
  companyName: string;
  memberName: string;
  label: string;
  when: string;
  kind: TicketReminderKind;
  companyPhone: string;
}): string {
  const phrase = ticketDuePhrase(args.kind);
  const heading = args.kind === 'expired' ? 'Ticket expired' : 'Ticket due soon';
  return `
      <div style="font-family:Segoe UI,Arial,sans-serif;max-width:560px;margin:0 auto;color:#1A1A1A">
        <div style="background:#0A2540;color:#fff;padding:20px 24px;border-radius:8px 8px 0 0">
          <div style="font-size:12px;opacity:.7;letter-spacing:1px;text-transform:uppercase">${escapeHtml(args.companyName)}</div>
          <h1 style="margin:8px 0 0;font-size:20px">${escapeHtml(heading)}</h1>
        </div>
        <div style="border:1px solid #E5E7EB;border-top:none;padding:24px;border-radius:0 0 8px 8px">
          <p>Hi ${escapeHtml(args.greeting)},</p>
          <p>${escapeHtml(args.memberName)} — <strong>${escapeHtml(args.label)}</strong> ${escapeHtml(phrase)}.</p>
          <div style="margin:20px 0;padding:16px;background:#F9FAFB;border-radius:8px">
            <p style="margin:0;color:#4A5568;font-size:14px;line-height:1.6">
              <strong>Ticket:</strong> ${escapeHtml(args.label)}<br/>
              <strong>Expiry:</strong> ${escapeHtml(args.when)}
            </p>
          </div>
          <p>Renew or replace this ticket and keep a copy on the team person sheet.</p>
          ${args.companyPhone ? `<p style="font-size:13px;color:#6B7280">Or call ${escapeHtml(args.companyPhone)}.</p>` : ''}
        </div>
      </div>`;
}

export function buildTicketDueEmail(args: {
  ticket: MemberTicket;
  member: TicketDueMember;
  company: { name?: string | null; phone?: string | null };
  to: string;
  kind: TicketReminderKind;
  expiresOn: string;
}): { to: string; subject: string; html: string; text: string } {
  const when = formatJobDate(args.expiresOn);
  const label = ticketDueLabel(args.ticket);
  const companyName = trimTicketField(args.company.name) || 'your company';
  const memberName = trimTicketField(args.member.name) || 'Team member';
  const subject = ticketDueSubject({ ticket: args.ticket, kind: args.kind, expiresOn: args.expiresOn });
  const text = [
    `Hi ${memberName},`,
    '',
    `${memberName} — ${label} ${ticketDuePhrase(args.kind)}.`,
    `Expiry: ${when}`,
    '',
    'Renew or replace this ticket and keep a copy on the team person sheet.',
  ].join('\n');
  return {
    to: args.to,
    subject,
    html: ticketDueHtml({
      greeting: memberName,
      companyName,
      memberName,
      label,
      when,
      kind: args.kind,
      companyPhone: trimTicketField(args.company.phone),
    }),
    text,
  };
}

export function ticketDueSuccessPatch(
  kind: TicketReminderKind,
  expiresOn: string,
  sentAt = new Date(),
): { reminder_sent_at: string; reminder_sent_for_date: string | null; reminder_kind: TicketReminderKind } {
  return {
    reminder_sent_at: sentAt.toISOString(),
    reminder_sent_for_date: dateOnly(expiresOn),
    reminder_kind: kind,
  };
}

export function shouldRecordTicketDueSent(sendOk: boolean): boolean {
  return sendOk === true;
}

export function prefillTicketMemberTo(member: TicketDueMember | null | undefined): string {
  const email = trimTicketField(member?.email);
  if (!email || !email.includes('@')) return '';
  return email;
}

export function decideTicketDueSend(args: {
  ticket: MemberTicket | null | undefined;
  member: TicketDueMember | null | undefined;
  settings: ReminderEmailSettings | null | undefined;
  companyId: string;
  now?: Date;
}): TicketDueDecision {
  const ticket = args.ticket;
  if (!ticket) {
    return { ok: false, send: false, reason: 'no_ticket', message: missTicketDueMessage('no_ticket') };
  }
  if (trimTicketField(ticket.company_id) !== trimTicketField(args.companyId)) {
    return { ok: false, send: false, reason: 'wrong_company', message: missTicketDueMessage('wrong_company') };
  }
  const today = vanTodayTicketDate(args.now);
  const expiresOn = dateOnly(ticket.expires_on);
  if (!expiresOn) {
    return { ok: false, send: false, reason: 'no_expiry', message: missTicketDueMessage('no_expiry') };
  }
  const kind = ticketReminderKind(expiresOn, today);
  if (!kind) {
    return {
      ok: false,
      send: false,
      reason: 'not_due',
      message: missTicketDueMessage('not_due'),
      expiresOn,
    };
  }
  if (alreadyRemindedForTicket(ticket, kind, expiresOn)) {
    return {
      ok: false,
      send: false,
      reason: 'already_sent',
      message: missTicketDueMessage('already_sent'),
      kind,
      expiresOn,
    };
  }
  const to = prefillTicketMemberTo(args.member);
  if (!to) {
    return {
      ok: false,
      send: false,
      reason: 'no_email',
      message: missTicketDueMessage('no_email'),
      kind,
      expiresOn,
      to: null,
    };
  }
  if (!emailSettingsReady(args.settings)) {
    return {
      ok: false,
      send: false,
      reason: 'no_smtp',
      message: missTicketDueMessage('no_smtp'),
      kind,
      expiresOn,
      to,
    };
  }
  return {
    ok: true,
    send: true,
    to,
    kind,
    expiresOn,
    subject: ticketDueSubject({ ticket, kind, expiresOn }),
  };
}

export type TicketDuePick = {
  selected: Array<{
    ticket: MemberTicket;
    member: TicketDueMember;
    to: string;
    kind: TicketReminderKind;
    expiresOn: string;
    subject: string;
  }>;
  missed: Array<{
    ticket: MemberTicket;
    reason: TicketDueMissReason;
    message: string;
    kind?: TicketReminderKind | null;
  }>;
};

/**
 * Cron auto-select. SMTP must be ready or nothing is mailed.
 * Defence in depth: only this company's tickets that are due soon or expired.
 */
export function selectDueTickets(
  tickets: MemberTicket[],
  members: Map<string, TicketDueMember> | TicketDueMember[],
  settings: ReminderEmailSettings | null | undefined,
  companyId: string,
  now = new Date(),
): TicketDuePick {
  const memberMap = members instanceof Map ? members : new Map(members.map(m => [m.id, m]));
  const selected: TicketDuePick['selected'] = [];
  const missed: TicketDuePick['missed'] = [];

  for (const ticket of tickets) {
    if (trimTicketField(ticket.company_id) !== trimTicketField(companyId)) continue;
    const member = memberMap.get(ticket.profile_id) ?? null;
    const decision = decideTicketDueSend({ ticket, member, settings, companyId, now });
    if (decision.ok && decision.send) {
      selected.push({
        ticket,
        member: member!,
        to: decision.to,
        kind: decision.kind,
        expiresOn: decision.expiresOn,
        subject: decision.subject,
      });
      continue;
    }
    if (decision.reason === 'wrong_company') continue;
    missed.push({
      ticket,
      reason: decision.reason,
      message: decision.message,
      kind: decision.kind,
    });
  }

  return { selected, missed };
}

export function ticketDueQuery(args: {
  companyId: string;
  now?: Date;
}): { table: 'member_tickets'; columns: string; eq: { company_id: string }; lte: { expires_on: string } } | null {
  const companyId = trimTicketField(args.companyId);
  if (!companyId) return null;
  return {
    table: 'member_tickets',
    columns: TICKET_DUE_COLUMNS,
    eq: { company_id: companyId },
    lte: { expires_on: vanTodayTicketDate(args.now) },
  };
}

export function resolveTicketDueCaller(args: {
  hasUser: boolean;
  userCompanyId?: string | null;
  cronAuthorized: boolean;
  due?: string;
}): { ok: true; caller: { kind: 'user'; companyId: string } | { kind: 'cron' } } | { ok: false; error: string } {
  const due = trimTicketField(args.due);
  if (due !== 'tickets') return { ok: false, error: 'due=tickets is required' };
  if (args.cronAuthorized) return { ok: true, caller: { kind: 'cron' } };
  if (args.hasUser && args.userCompanyId) {
    return { ok: true, caller: { kind: 'user', companyId: args.userCompanyId } };
  }
  return { ok: false, error: 'Unauthorized' };
}

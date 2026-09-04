import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { MemberTicket } from './teamMemberTickets';
import {
  TICKET_DUE_AUTO_FIRE_PATH,
  VAN_TIME_ZONE,
  alreadyRemindedForTicket,
  decideTicketDueSend,
  selectDueTickets,
  shouldRecordTicketDueSent,
  ticketDueSuccessPatch,
  ticketReminderKind,
  vanTodayTicketDate,
  type TicketDueMember,
} from './ticketDueReminder';
import { COMPANY_TIME_ZONE, type ReminderEmailSettings } from './jobReminder';

function src(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8');
}

/** 18:00 Friday 21 Aug 2026 in Australia/Brisbane (08:00 UTC). Same calendar day in Perth. */
const now = new Date('2026-08-21T08:00:00.000Z');
const today = '2026-08-21';
const yesterday = '2026-08-20';
const tomorrow = '2026-08-22';
/** 01:00 Saturday 22 Aug Brisbane. Perth is still Friday 21 Aug 23:00. */
const brisbaneRolled = new Date('2026-08-21T15:00:00.000Z');

const smtp: ReminderEmailSettings = {
  smtp_host: 'smtp.resend.com',
  smtp_pass: 're_test',
  from_name: 'Northside Trade',
  from_email: 'office@northside.example',
};

const member: TicketDueMember = {
  id: 'm-alex',
  company_id: 'co-1',
  name: 'Alex Nguyen',
  email: 'alex@northside.example',
};

function ticket(over: Partial<MemberTicket> = {}): MemberTicket {
  return {
    id: 't-1',
    company_id: 'co-1',
    profile_id: 'm-alex',
    name: 'White Card',
    ticket_number: 'WC-1001',
    expires_on: today,
    notes: null,
    storage_bucket: 'uploaded-pdfs',
    storage_path: 'co-1/tickets/m-alex/t-1-whitecard.pdf',
    file_name: 'whitecard.pdf',
    reminder_sent_at: null,
    reminder_sent_for_date: null,
    reminder_kind: null,
    ...over,
  };
}

describe('G5 due-soon and expired are real notify decisions — Brisbane TZ', () => {
  it('uses Australia/Brisbane today, not leftover Perth or the runtime calendar', () => {
    expect(VAN_TIME_ZONE).toBe('Australia/Brisbane');
    expect(COMPANY_TIME_ZONE).toBe('Australia/Perth');
    expect(vanTodayTicketDate(now)).toBe(today);
    expect(ticketReminderKind(today, today)).toBe('due_soon');
    expect(ticketReminderKind(yesterday, today)).toBe('expired');
    expect(ticketReminderKind(tomorrow, today)).toBeNull();
  });

  it('after midnight Brisbane, leftover Perth is still yesterday — tickets use Brisbane today', () => {
    expect(brisbaneRolled.toISOString().slice(0, 10)).toBe('2026-08-21');
    expect(vanTodayTicketDate(brisbaneRolled)).toBe(tomorrow);
    expect(ticketReminderKind(tomorrow, vanTodayTicketDate(brisbaneRolled))).toBe('due_soon');
    expect(ticketReminderKind(today, vanTodayTicketDate(brisbaneRolled))).toBe('expired');
  });

  it('sends due_soon when the ticket expires today and SMTP + member email are ready', () => {
    const decision = decideTicketDueSend({
      ticket: ticket(),
      member,
      settings: smtp,
      companyId: 'co-1',
      now,
    });
    expect(decision.ok).toBe(true);
    if (!decision.ok) return;
    expect(decision.send).toBe(true);
    expect(decision.kind).toBe('due_soon');
    expect(decision.to).toBe('alex@northside.example');
    expect(decision.expiresOn).toBe(today);
    expect(decision.subject).toMatch(/White Card/);
    expect(decision.subject).toMatch(/expires today/);
  });

  it('sends expired when the ticket expiry is before Brisbane today', () => {
    const decision = decideTicketDueSend({
      ticket: ticket({ expires_on: yesterday }),
      member,
      settings: smtp,
      companyId: 'co-1',
      now,
    });
    expect(decision.ok).toBe(true);
    if (!decision.ok) return;
    expect(decision.send).toBe(true);
    expect(decision.kind).toBe('expired');
    expect(decision.subject).toMatch(/has expired/);
  });

  it('does not send a future ticket, a missing email, or a missing SMTP', () => {
    const future = decideTicketDueSend({
      ticket: ticket({ expires_on: tomorrow }),
      member,
      settings: smtp,
      companyId: 'co-1',
      now,
    });
    expect(future.ok).toBe(false);
    if (!future.ok) expect(future.reason).toBe('not_due');

    const noEmail = decideTicketDueSend({
      ticket: ticket(),
      member: { ...member, email: '' },
      settings: smtp,
      companyId: 'co-1',
      now,
    });
    expect(noEmail.ok).toBe(false);
    if (!noEmail.ok) expect(noEmail.reason).toBe('no_email');

    const noSmtp = decideTicketDueSend({
      ticket: ticket(),
      member,
      settings: { smtp_host: '', smtp_pass: '', from_email: '' },
      companyId: 'co-1',
      now,
    });
    expect(noSmtp.ok).toBe(false);
    if (!noSmtp.ok) expect(noSmtp.reason).toBe('no_smtp');

    const otherCo = decideTicketDueSend({
      ticket: ticket({ company_id: 'co-other' }),
      member,
      settings: smtp,
      companyId: 'co-1',
      now,
    });
    expect(otherCo.ok).toBe(false);
    if (!otherCo.ok) expect(otherCo.reason).toBe('wrong_company');
  });

  it('skips already-sent due_soon, then still sends expired the next kind', () => {
    const sentSoon = ticket({
      reminder_sent_at: '2026-08-21T00:00:00.000Z',
      reminder_sent_for_date: today,
      reminder_kind: 'due_soon',
    });
    expect(alreadyRemindedForTicket(sentSoon, 'due_soon', today)).toBe(true);
    const again = decideTicketDueSend({
      ticket: sentSoon,
      member,
      settings: smtp,
      companyId: 'co-1',
      now,
    });
    expect(again.ok).toBe(false);
    if (!again.ok) expect(again.reason).toBe('already_sent');

    const nowExpired = {
      ...sentSoon,
      expires_on: yesterday,
    };
    expect(alreadyRemindedForTicket(nowExpired, 'expired', yesterday)).toBe(false);
    const expired = decideTicketDueSend({
      ticket: nowExpired,
      member,
      settings: smtp,
      companyId: 'co-1',
      now,
    });
    expect(expired.ok).toBe(true);
    if (expired.ok) expect(expired.kind).toBe('expired');
  });

  it('selectDueTickets picks this company only and records sent only after email 2xx', () => {
    const pick = selectDueTickets(
      [
        ticket(),
        ticket({ id: 't-expired', expires_on: yesterday }),
        ticket({ id: 't-other', company_id: 'co-other' }),
        ticket({ id: 't-later', expires_on: tomorrow }),
      ],
      [member],
      smtp,
      'co-1',
      now,
    );
    expect(pick.selected.map(s => s.kind).sort()).toEqual(['due_soon', 'expired']);
    expect(pick.selected.every(s => s.to === 'alex@northside.example')).toBe(true);
    expect(pick.selected.some(s => s.ticket.company_id === 'co-other')).toBe(false);
    expect(shouldRecordTicketDueSent(true)).toBe(true);
    expect(shouldRecordTicketDueSent(false)).toBe(false);
    const patch = ticketDueSuccessPatch('due_soon', today, new Date('2026-08-21T08:00:00.000Z'));
    expect(patch.reminder_kind).toBe('due_soon');
    expect(patch.reminder_sent_for_date).toBe(today);
    expect(patch.reminder_sent_at).toBe('2026-08-21T08:00:00.000Z');
  });
});

describe('G5 rides job-reminder due=tickets — not a new reminder product', () => {
  const hop = src('supabase/migrations/20260904080000_075_member_tickets.sql');
  const edge = src('supabase/functions/job-reminder/index.ts');

  it('same Perth invoke posts due=tickets — no new cron stack', () => {
    expect(hop).toContain('CREATE OR REPLACE FUNCTION public.invoke_job_client_reminders()');
    expect(hop).toContain('{"due":"tomorrow","source":"cron"}');
    expect(hop).toContain('{"due":"today","source":"cron"}');
    expect(hop).toContain('{"due":"tickets","source":"cron"}');
    expect(hop).toContain('/functions/v1/job-reminder');
    expect(hop).not.toContain('cron.schedule');
    expect(hop).not.toContain('send-ticket');
    expect(hop).not.toContain('ticket-reminder');
    expect(edge).toContain('due === "tickets"');
    expect(edge).toContain('deliverTicketDue');
    expect(TICKET_DUE_AUTO_FIRE_PATH.join(' ')).toMatch(/due=tickets/);
    expect(TICKET_DUE_AUTO_FIRE_PATH.join(' ')).toMatch(/invoke_job_client_reminders/);
    expect(TICKET_DUE_AUTO_FIRE_PATH.join(' ')).toMatch(/Australia\/Brisbane/);
    expect(TICKET_DUE_AUTO_FIRE_PATH.join(' ')).toMatch(/api\.resend\.com/);
  });

  it('edge due=tickets actually POSTs Resend and stamps only on 2xx', () => {
    const start = edge.indexOf('if (due === "tickets")');
    const end = edge.indexOf('if (due === "today")');
    const block = edge.slice(start, end);
    expect(block).toContain('vanTodayYmd');
    expect(block).not.toContain('todayYmd()');
    expect(block).toContain('from("member_tickets")');
    expect(block).toContain('deliverTicketDue');
    expect(block).toContain('.lte("expires_on", today)');

    const deliverStart = edge.indexOf('async function deliverTicketDue');
    const deliverEnd = edge.indexOf('async function deliverInspectionDue');
    const deliver = edge.slice(deliverStart, deliverEnd);
    expect(deliver).toContain('https://api.resend.com/emails');
    expect(deliver).toContain('decideTicketDueKind');
    expect(deliver.indexOf('if (!res.ok)')).toBeLessThan(deliver.indexOf('reminder_sent_at: sentAt'));
    expect(deliver).toContain('reminder_kind');
    expect(deliver).not.toContain('sms.sent');
  });

  it('does not invent a notify specialist or electrical-only copy', () => {
    const due = src('src/lib/ticketDueReminder.ts');
    expect(due).not.toContain('send-ticket-reminder');
    expect(due).not.toContain('electrical');
    expect(due).not.toContain('energised');
    expect(edge).not.toContain('send-ticket-reminder');
  });
});

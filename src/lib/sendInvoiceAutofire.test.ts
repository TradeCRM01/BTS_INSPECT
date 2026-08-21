import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { INSPECTION_DUE_AUTO_FIRE_PATH } from './inspectionDueReminder';
import { AUTO_FIRE_CLICK_PATH } from './jobReminder';
import {
  alreadyChasedInvoice,
  applyOverdueInvoiceScope,
  applyOverdueStampScope,
  invoiceChasedAtPatchAfterSend,
  invoiceOverdueForAutofire,
  invoiceOverdueStampPatch,
  invoiceStatusAfterOverdueStamp,
  missOverdueChaseMessage,
  OVERDUE_INVOICE_AUTO_FIRE_PATH,
  overdueInvoiceCompanyFilter,
  overdueInvoiceStampQuery,
  overdueUnchasedInvoiceQuery,
  resolveOverdueInvoiceCaller,
  selectAutoFireOverdueInvoices,
  selectInvoicesToStampOverdue,
  selectOverdueUnchasedInvoices,
  shouldStampInvoiceStatusOverdue,
  shouldWriteInvoiceChasedAt,
  wouldScanLedgerToChaseOverdue,
  wouldScanLedgerToStampOverdue,
  type InvoiceSendClient,
  type InvoiceSendInvoice,
  type OverdueInvoiceQueryScope,
  type OverdueStampQueryScope,
} from './sendInvoice';

const smtp = {
  smtp_host: 'smtp.resend.com',
  smtp_pass: 're_test',
  from_name: 'BTS Electrical',
  from_email: 'invoices@btselectrical.com.au',
};

const now = new Date('2026-08-21T01:00:00.000Z'); // 21 Aug 2026 09:00 Perth

function invoice(over: Partial<InvoiceSendInvoice> = {}): InvoiceSendInvoice {
  return {
    id: 'inv-1',
    company_id: 'co-1',
    invoice_number: 18,
    client_id: 'c1',
    job_id: 'job-1',
    status: 'sent',
    line_items: [{ description: 'Switchboard test', quantity: 2, unit_price: 220 }],
    subtotal: 440,
    tax_rate: 10,
    tax_amount: 44,
    total: 484,
    payment_terms: 'Net 30',
    due_date: '2026-08-20',
    notes: null,
    inclusions: [],
    exclusions: [],
    chased_at: null,
    ...over,
  };
}

const client: InvoiceSendClient = {
  id: 'c1',
  name: 'Acme Plumbing',
  email: 'jane@acme.com.au',
  phone: '0412 345 678',
  address: '12 Smith St',
};

describe('overdue auto-fire (cron, not Send again)', () => {
  it('fires on the same Perth cron as the 24h job ping — no new module, no tray click', () => {
    expect(OVERDUE_INVOICE_AUTO_FIRE_PATH[0]).toBe(AUTO_FIRE_CLICK_PATH[0]);
    expect(OVERDUE_INVOICE_AUTO_FIRE_PATH[1]).toBe(AUTO_FIRE_CLICK_PATH[1]);
    expect(OVERDUE_INVOICE_AUTO_FIRE_PATH[0]).toBe(INSPECTION_DUE_AUTO_FIRE_PATH[0]);
    expect(OVERDUE_INVOICE_AUTO_FIRE_PATH[1]).toBe(INSPECTION_DUE_AUTO_FIRE_PATH[1]);
    expect(OVERDUE_INVOICE_AUTO_FIRE_PATH[0]).toMatch(/job-client-reminder-perth-morning/);
    expect(OVERDUE_INVOICE_AUTO_FIRE_PATH[1]).toMatch(/job-client-reminder-perth-afternoon/);
    expect(OVERDUE_INVOICE_AUTO_FIRE_PATH.join(' → ')).toMatch(/invoke_job_client_reminders/);
    expect(OVERDUE_INVOICE_AUTO_FIRE_PATH.join(' ')).toMatch(/due=overdue/);
    expect(OVERDUE_INVOICE_AUTO_FIRE_PATH.join(' ')).toMatch(/functions\/v1\/job-reminder/);
    expect(OVERDUE_INVOICE_AUTO_FIRE_PATH.join(' ')).toMatch(/status=overdue/);
    expect(OVERDUE_INVOICE_AUTO_FIRE_PATH.join(' ')).toMatch(/status=sent and due_date < perth_today/);
    expect(OVERDUE_INVOICE_AUTO_FIRE_PATH.join(' ')).toMatch(/api\.resend\.com/);
    expect(OVERDUE_INVOICE_AUTO_FIRE_PATH.join(' ')).toMatch(/api\.twilio\.com/);
    expect(OVERDUE_INVOICE_AUTO_FIRE_PATH.join(' ')).toMatch(/chased_at/);
    expect(OVERDUE_INVOICE_AUTO_FIRE_PATH.join(' ')).not.toMatch(/send_due_/);
    expect(OVERDUE_INVOICE_AUTO_FIRE_PATH.join(' ')).not.toMatch(/invoice-chase-perth/);
    expect(OVERDUE_INVOICE_AUTO_FIRE_PATH.join(' ')).not.toMatch(/tray/i);
    expect(OVERDUE_INVOICE_AUTO_FIRE_PATH.join(' ')).not.toMatch(/Send again/);
    const stampStep = OVERDUE_INVOICE_AUTO_FIRE_PATH.findIndex(step => step.includes('UPDATE invoices.status=overdue'));
    const chaseStep = OVERDUE_INVOICE_AUTO_FIRE_PATH.findIndex(step => step.includes('chased_at is null'));
    expect(stampStep).toBeGreaterThan(OVERDUE_INVOICE_AUTO_FIRE_PATH.findIndex(step => step.includes('due=overdue')));
    expect(chaseStep).toBeGreaterThan(stampStep);
  });

  it('auto-selects Perth-overdue unchased invoices with email when SMTP is ready', () => {
    const pick = selectAutoFireOverdueInvoices(
      [
        invoice(),
        invoice({ id: 'due-today', due_date: '2026-08-21' }),
        invoice({ id: 'future', due_date: '2026-08-22' }),
      ],
      [client],
      smtp,
      'co-1',
      now,
    );
    expect(pick.selected.map(s => s.invoice.id)).toEqual(['inv-1']);
    expect(pick.selected[0]?.to).toBe('jane@acme.com.au');
    expect(pick.missed.map(m => m.invoice.id).sort()).toEqual(['due-today', 'future']);
    expect(pick.missed.every(m => m.reason === 'not_overdue')).toBe(true);
  });

  it('does not send without SMTP — and does not scan other companies', () => {
    const pick = selectAutoFireOverdueInvoices(
      [invoice(), invoice({ id: 'other', company_id: 'co-2' })],
      [client],
      null,
      'co-1',
      now,
    );
    expect(pick.selected).toEqual([]);
    expect(pick.missed).toHaveLength(1);
    expect(pick.missed[0]).toMatchObject({ reason: 'no_smtp', invoice: { id: 'inv-1' } });
    expect(pick.missed[0]?.message).toMatch(/not set up/i);
  });

  it('skips already-chased invoices — does not double-send', () => {
    const pick = selectAutoFireOverdueInvoices(
      [invoice({ chased_at: '2026-08-21T01:00:00.000Z' })],
      [client],
      smtp,
      'co-1',
      now,
    );
    expect(pick.selected).toEqual([]);
    expect(pick.missed[0]?.reason).toBe('already_chased');
    expect(pick.missed[0]?.message).toMatch(/already chased/i);
    expect(alreadyChasedInvoice({ chased_at: '2026-08-21T01:00:00.000Z' })).toBe(true);
    expect(alreadyChasedInvoice({ chased_at: null })).toBe(false);
    expect(alreadyChasedInvoice({ chased_at: '  ' })).toBe(false);
  });

  it('names honest misses — no email, no client, no lines, paid, no due date', () => {
    const noEmail = selectOverdueUnchasedInvoices(
      [invoice()],
      [{ ...client, email: null }],
      smtp,
      'co-1',
      now,
    );
    expect(noEmail.selected).toEqual([]);
    expect(noEmail.missed[0]?.reason).toBe('no_email');
    expect(noEmail.missed[0]?.message).toMatch(/no email/i);

    const noClient = selectOverdueUnchasedInvoices(
      [invoice({ client_id: null })],
      [client],
      smtp,
      'co-1',
      now,
    );
    expect(noClient.missed[0]?.reason).toBe('no_client');

    const noLines = selectOverdueUnchasedInvoices(
      [invoice({ line_items: [{ description: 'Labour', quantity: 0, unit_price: 10 }] })],
      [client],
      smtp,
      'co-1',
      now,
    );
    expect(noLines.missed[0]?.reason).toBe('no_lines');

    const paid = selectOverdueUnchasedInvoices(
      [invoice({ status: 'paid' })],
      [client],
      smtp,
      'co-1',
      now,
    );
    expect(paid.missed[0]?.reason).toBe('paid');

    const draft = selectOverdueUnchasedInvoices(
      [invoice({ status: 'draft' })],
      [client],
      smtp,
      'co-1',
      now,
    );
    expect(draft.missed[0]?.reason).toBe('not_overdue');

    const noDue = selectOverdueUnchasedInvoices(
      [invoice({ due_date: null })],
      [client],
      smtp,
      'co-1',
      now,
    );
    expect(noDue.missed[0]?.reason).toBe('no_due_date');
    expect(missOverdueChaseMessage('no_phone')).toMatch(/no phone/i);
  });

  it('keeps the auto query scoped to company + Perth overdue + unchased', () => {
    const filter = overdueInvoiceCompanyFilter('co-1', now);
    expect(filter).toEqual({
      table: 'invoices',
      company_id: 'co-1',
      due_before: '2026-08-21',
      status: ['sent', 'overdue'],
      chased_at: null,
      timeZone: 'Australia/Perth',
    });
    expect(overdueInvoiceCompanyFilter('')).toBeNull();
    const scope = overdueUnchasedInvoiceQuery({ companyId: 'co-1', now });
    expect(wouldScanLedgerToChaseOverdue(scope)).toBe(false);
    expect(scope?.eq).toEqual({ company_id: 'co-1' });
    expect(scope?.lt).toEqual({ due_date: '2026-08-21' });
    expect(scope?.isNull).toEqual(['chased_at']);
    expect(scope?.inFilters.status).toEqual(['sent', 'overdue']);
    expect(wouldScanLedgerToChaseOverdue({
      table: 'invoices',
      columns: 'id, status',
      eq: { company_id: 'co-1' },
      inFilters: {},
    })).toBe(true);
    expect(overdueUnchasedInvoiceQuery({ companyId: '' })).toBeNull();
  });
});

describe('Perth hop stamps sent + past-due before chase', () => {
  it('stamps only sent past Perth today — already overdue / no due_date / draft / paid stay put', () => {
    expect(shouldStampInvoiceStatusOverdue({ status: 'sent', due_date: '2026-08-20' }, now)).toBe(true);
    expect(invoiceOverdueStampPatch({ status: 'sent', due_date: '2026-08-20' }, now)).toEqual({ status: 'overdue' });
    expect(invoiceStatusAfterOverdueStamp({ status: 'sent', due_date: '2026-08-20' }, now)).toBe('overdue');

    expect(shouldStampInvoiceStatusOverdue({ status: 'overdue', due_date: '2026-08-20' }, now)).toBe(false);
    expect(invoiceOverdueStampPatch({ status: 'overdue', due_date: '2026-08-20' }, now)).toBeNull();
    expect(invoiceStatusAfterOverdueStamp({ status: 'overdue', due_date: '2026-08-20' }, now)).toBe('overdue');

    expect(shouldStampInvoiceStatusOverdue({ status: 'sent', due_date: '2026-08-21' }, now)).toBe(false);
    expect(shouldStampInvoiceStatusOverdue({ status: 'sent', due_date: null }, now)).toBe(false);
    expect(shouldStampInvoiceStatusOverdue({ status: 'sent', due_date: '' }, now)).toBe(false);
    expect(shouldStampInvoiceStatusOverdue({ status: 'sent', due_date: 'not-a-date' }, now)).toBe(false);
    expect(invoiceStatusAfterOverdueStamp({ status: 'sent', due_date: null }, now)).toBe('sent');

    expect(shouldStampInvoiceStatusOverdue({ status: 'draft', due_date: '2026-08-01' }, now)).toBe(false);
    expect(invoiceStatusAfterOverdueStamp({ status: 'draft', due_date: '2026-08-01' }, now)).toBe('draft');
    expect(shouldStampInvoiceStatusOverdue({ status: 'paid', due_date: '2026-08-01' }, now)).toBe(false);
    expect(invoiceStatusAfterOverdueStamp({ status: 'paid', due_date: '2026-08-01' }, now)).toBe('paid');
  });

  it('uses Australia/Perth when UTC is still the previous evening', () => {
    const perthNextDay = new Date('2026-08-20T16:30:00.000Z'); // 21 Aug 00:30 Perth
    expect(shouldStampInvoiceStatusOverdue({ status: 'sent', due_date: '2026-08-20' }, perthNextDay)).toBe(true);
    const perthSameDay = new Date('2026-08-20T15:30:00.000Z'); // 20 Aug 23:30 Perth
    expect(shouldStampInvoiceStatusOverdue({ status: 'sent', due_date: '2026-08-20' }, perthSameDay)).toBe(false);
  });

  it('stamps already-chased sent rows so stored overdue is honest — chase still skips them', () => {
    const chased = invoice({ chased_at: '2026-08-21T01:00:00.000Z' });
    expect(shouldStampInvoiceStatusOverdue(chased, now)).toBe(true);
    expect(alreadyChasedInvoice(chased)).toBe(true);
    const pick = selectAutoFireOverdueInvoices([chased], [client], smtp, 'co-1', now);
    expect(pick.selected).toEqual([]);
    expect(pick.missed[0]?.reason).toBe('already_chased');
  });

  it('does not invent overdue across companies on a user hop, and cron stamps every company', () => {
    const rows = [
      invoice(),
      invoice({ id: 'draft', status: 'draft' }),
      invoice({ id: 'paid', status: 'paid' }),
      invoice({ id: 'already', status: 'overdue' }),
      invoice({ id: 'no-due', due_date: null }),
      invoice({ id: 'other', company_id: 'co-2' }),
    ];
    expect(selectInvoicesToStampOverdue(rows, now).map(r => r.id).sort()).toEqual(['inv-1', 'other']);
    expect(selectInvoicesToStampOverdue(rows, now, 'co-1').map(r => r.id)).toEqual(['inv-1']);
    expect(selectInvoicesToStampOverdue(rows, now, 'co-2').map(r => r.id)).toEqual(['other']);
  });

  it('stamp query is status=sent + due_date < Perth today — not a ledger walk, not chased_at', () => {
    const cronScope = overdueInvoiceStampQuery({ now, caller: { kind: 'cron' } });
    expect(cronScope).toEqual({
      table: 'invoices',
      patch: { status: 'overdue' },
      eq: { status: 'sent' },
      lt: { due_date: '2026-08-21' },
      notNull: ['due_date'],
    });
    expect(wouldScanLedgerToStampOverdue(cronScope)).toBe(false);
    expect(cronScope.eq).not.toHaveProperty('company_id');

    const userScope = overdueInvoiceStampQuery({ now, caller: { kind: 'user', companyId: 'co-1' } });
    expect(userScope.eq).toEqual({ status: 'sent', company_id: 'co-1' });
    expect(wouldScanLedgerToStampOverdue(userScope)).toBe(false);
    expect(overdueInvoiceStampQuery({ now, caller: { kind: 'user', companyId: '  ' } }).eq)
      .toEqual({ status: 'sent' });
  });

  it('applies a single UPDATE — status sent, due_date present and past, no chased_at filter', () => {
    const calls: string[] = [];
    const builder = {
      update(patch: { status: 'overdue' }) {
        calls.push(`update:${patch.status}`);
        return this;
      },
      eq(column: string, value: string) {
        calls.push(`eq:${column}:${value}`);
        return this;
      },
      lt(column: string, value: string) {
        calls.push(`lt:${column}:${value}`);
        return this;
      },
      not(column: string, op: string, value: null) {
        calls.push(`not:${column}:${op}:${value}`);
        return this;
      },
    };
    const scope = overdueInvoiceStampQuery({ now, caller: { kind: 'user', companyId: 'co-1' } }) as OverdueStampQueryScope;
    applyOverdueStampScope(builder, scope);
    expect(calls[0]).toBe('update:overdue');
    expect(calls).toContain('eq:status:sent');
    expect(calls).toContain('eq:company_id:co-1');
    expect(calls).toContain('not:due_date:is:null');
    expect(calls).toContain('lt:due_date:2026-08-21');
    expect(calls.some(call => call.includes('chased_at'))).toBe(false);
    expect(calls.some(call => call.includes('draft'))).toBe(false);
    expect(calls.some(call => call.startsWith('eq:id:'))).toBe(false);
  });
});

describe('invoiceOverdueForAutofire follows Perth, not UTC', () => {
  it('treats sent past Perth today as overdue', () => {
    expect(invoiceOverdueForAutofire({ status: 'sent', due_date: '2026-08-20' }, now)).toBe(true);
    expect(invoiceOverdueForAutofire({ status: 'overdue', due_date: '2026-08-20' }, now)).toBe(true);
    expect(invoiceOverdueForAutofire({ status: 'sent', due_date: '2026-08-21' }, now)).toBe(false);
    expect(invoiceOverdueForAutofire({ status: 'draft', due_date: '2026-08-01' }, now)).toBe(false);
    expect(invoiceOverdueForAutofire({ status: 'paid', due_date: '2026-08-01' }, now)).toBe(false);
    expect(invoiceOverdueForAutofire({ status: 'sent', due_date: null }, now)).toBe(false);
  });

  it('uses Australia/Perth when UTC is still the previous evening', () => {
    const perthNextDay = new Date('2026-08-20T16:30:00.000Z'); // 21 Aug 00:30 Perth
    expect(invoiceOverdueForAutofire({ status: 'sent', due_date: '2026-08-20' }, perthNextDay)).toBe(true);
    const perthSameDay = new Date('2026-08-20T15:30:00.000Z'); // 20 Aug 23:30 Perth
    expect(invoiceOverdueForAutofire({ status: 'sent', due_date: '2026-08-20' }, perthSameDay)).toBe(false);
  });
});

describe('chased_at write rules stay Resend 2xx only', () => {
  const sentAt = new Date('2026-08-21T01:00:00.000Z');

  it('writes chased_at only after a successful chase — never on fail or first-send', () => {
    expect(invoiceChasedAtPatchAfterSend(true, 'chase', sentAt)).toEqual({
      chased_at: '2026-08-21T01:00:00.000Z',
    });
    expect(invoiceChasedAtPatchAfterSend(false, 'chase', sentAt)).toBeNull();
    expect(invoiceChasedAtPatchAfterSend(true, 'first', sentAt)).toBeNull();
    expect(shouldWriteInvoiceChasedAt(true, 'chase')).toBe(true);
    expect(shouldWriteInvoiceChasedAt(false, 'chase')).toBe(false);
  });
});

describe('override auth — auto-fire does not use invoiceId', () => {
  it('auto-fire is the job-reminder due=overdue hop', () => {
    expect(OVERDUE_INVOICE_AUTO_FIRE_PATH.join(' ')).toMatch(/due=overdue/);
    expect(resolveOverdueInvoiceCaller({
      hasUser: false,
      cronAuthorized: true,
      due: 'overdue',
    })).toEqual({ ok: true, caller: { kind: 'cron' } });
    expect(resolveOverdueInvoiceCaller({
      hasUser: false,
      cronAuthorized: false,
      due: 'overdue',
    }).ok).toBe(false);
  });

  it('single-invoiceId override still requires a logged-in member', () => {
    expect(resolveOverdueInvoiceCaller({
      hasUser: false,
      cronAuthorized: true,
      invoiceId: 'inv-1',
    })).toEqual({ ok: false, error: 'Unauthorized' });
    expect(resolveOverdueInvoiceCaller({
      hasUser: true,
      userCompanyId: 'co-1',
      cronAuthorized: false,
      invoiceId: 'inv-1',
    })).toEqual({ ok: true, caller: { kind: 'user', companyId: 'co-1' } });
  });
});

describe('scoped query — not a ledger scan', () => {
  it('filters invoices by company, past due, and null chased_at', () => {
    const calls: string[] = [];
    const builder = {
      select(columns: string) {
        calls.push(`select:${columns}`);
        return this;
      },
      eq(column: string, value: string) {
        calls.push(`eq:${column}:${value}`);
        return this;
      },
      in(column: string, values: readonly string[]) {
        calls.push(`in:${column}:${values.join(',')}`);
        return this;
      },
      lt(column: string, value: string) {
        calls.push(`lt:${column}:${value}`);
        return this;
      },
      is(column: string, value: null) {
        calls.push(`is:${column}:${value}`);
        return this;
      },
    };
    const scope = overdueUnchasedInvoiceQuery({ companyId: 'co-1', now }) as OverdueInvoiceQueryScope;
    applyOverdueInvoiceScope(builder, scope);
    expect(calls[0]).toMatch(/^select:/);
    expect(calls).toContain('eq:company_id:co-1');
    expect(calls).toContain('in:status:sent,overdue');
    expect(calls).toContain('lt:due_date:2026-08-21');
    expect(calls).toContain('is:chased_at:null');
    expect(calls.some(call => call.startsWith('eq:id:'))).toBe(false);
  });
});

describe('performance — overdue unchased, not a ledger walk', () => {
  it('stamp filter does not walk a mixed ledger by id', () => {
    const mixed: InvoiceSendInvoice[] = [];
    for (let i = 0; i < 4000; i++) {
      mixed.push(invoice({ id: `other-${i}`, company_id: 'co-other', status: i % 2 === 0 ? 'draft' : 'paid' }));
    }
    mixed.push(invoice());
    const started = performance.now();
    const stamped = selectInvoicesToStampOverdue(mixed, now, 'co-1');
    const elapsed = performance.now() - started;
    expect(stamped.map(row => row.id)).toEqual(['inv-1']);
    expect(elapsed).toBeLessThan(80);
  });

  it('does not walk other companies even when handed a mixed ledger', () => {
    const mixed: InvoiceSendInvoice[] = [];
    for (let i = 0; i < 4000; i++) {
      mixed.push(invoice({ id: `other-${i}`, company_id: 'co-other' }));
    }
    mixed.push(invoice());
    const started = performance.now();
    const pick = selectOverdueUnchasedInvoices(mixed, [client], smtp, 'co-1', now);
    const elapsed = performance.now() - started;
    expect(pick.selected.map(s => s.invoice.id)).toEqual(['inv-1']);
    expect(elapsed).toBeLessThan(80);
  });
});

describe('Perth overdue auto-fire source lock', () => {
  const hop = readFileSync(
    resolve(process.cwd(), 'supabase/migrations/20260821210000_063_overdue_invoice_chase_autofire.sql'),
    'utf8',
  );
  const columnOnly = readFileSync(
    resolve(process.cwd(), 'supabase/migrations/20260821190000_061_invoice_chased_at.sql'),
    'utf8',
  );
  const perth = readFileSync(
    resolve(process.cwd(), 'supabase/migrations/20260821200000_062_job_reminder_edge_autofire.sql'),
    'utf8',
  );
  const edge = readFileSync(
    resolve(process.cwd(), 'supabase/functions/job-reminder/index.ts'),
    'utf8',
  );
  const page = readFileSync(resolve(process.cwd(), 'src/pages/InvoicesPage.tsx'), 'utf8');
  const dialog = readFileSync(resolve(process.cwd(), 'src/components/invoicing/InvoiceSendDialog.tsx'), 'utf8');
  const nextAction = readFileSync(resolve(process.cwd(), 'src/lib/invoiceNextAction.ts'), 'utf8');
  const xero = readFileSync(resolve(process.cwd(), 'src/lib/xeroAccounting.ts'), 'utf8');
  const quotesPage = readFileSync(resolve(process.cwd(), 'src/pages/QuotesPage.tsx'), 'utf8');
  const css = readFileSync(resolve(process.cwd(), 'src/index.css'), 'utf8');
  const quoteNext = readFileSync(resolve(process.cwd(), 'src/lib/quoteNextAction.ts'), 'utf8');

  it('063 is a thin hop — 061 stays column-only, 062 Perth times stay signed', () => {
    expect(hop).toContain('{"due":"overdue","source":"cron"}');
    expect(hop).not.toContain('cron.schedule');
    expect(columnOnly).toContain('ADD COLUMN IF NOT EXISTS chased_at timestamptz');
    expect(columnOnly).not.toContain('invoke_job_client_reminders');
    expect(perth).toContain('job-client-reminder-perth-morning');
    expect(perth).toContain('0 23 * * *');
    expect(perth).toContain('0 8 * * *');
    expect(perth).toContain("SELECT public.invoke_job_client_reminders()");
  });

  it('Send again / Mark paid / Xero / quotes stay as signed', () => {
    expect(page).toContain('Send again');
    expect(page).toContain('invoiceOverflowPaidAction');
    expect(nextAction).toContain("label: 'Send again'");
    expect(nextAction).toContain('invoiceOverflowPaidAction');
    expect(dialog).toContain('Send invoice');
    expect(dialog).not.toContain('due=overdue');
    expect(page).not.toContain('due=overdue');
    expect(xero).toContain('pushInvoiceToXeroAfterSend');
    expect(xero).toContain('attachXeroPaymentAfterMarkPaid');
    expect(quotesPage).not.toContain('due=overdue');
    expect(quotesPage).not.toContain('chased_at');
    expect(edge).not.toContain('from("quotes")');
    expect(edge).not.toContain('send-quote');
  });

  it('stamps sent + past-due before chase on the same due=overdue hop — no new cron or column', () => {
    const overdueStart = edge.indexOf('if (due === "overdue")');
    const overdue = edge.slice(overdueStart, edge.indexOf('if (invoiceId)'));
    expect(overdue).toContain('stampSentPastDueOverdue');
    expect(overdue.indexOf('stampSentPastDueOverdue')).toBeLessThan(overdue.indexOf('companyIds.length === 0'));
    expect(overdue.indexOf('stampSentPastDueOverdue')).toBeLessThan(overdue.indexOf('.in("status", ["sent", "overdue"])'));
    expect(overdue.indexOf('stampSentPastDueOverdue')).toBeLessThan(overdue.indexOf('deliverInvoiceSend'));
    expect(overdue).toContain('todayYmd()');
    expect(overdue).not.toContain('cron.schedule');
    expect(overdue).not.toContain('CREATE TABLE');
    expect(overdue).not.toContain('ADD COLUMN');
    expect(overdue).not.toContain('from("quotes")');
    expect(overdue).not.toContain('purpose: "receipt"');

    const stampStart = edge.indexOf('async function stampSentPastDueOverdue');
    const stampFn = edge.slice(stampStart, edge.indexOf('const invoiceMissText'));
    expect(stampFn).toContain('.update({ status: "overdue"');
    expect(stampFn).toContain('.eq("status", "sent")');
    expect(stampFn).toContain('.not("due_date", "is", null)');
    expect(stampFn).toContain('.lt("due_date", today)');
    expect(stampFn).not.toContain('chased_at');
    expect(stampFn).not.toContain('from("quotes")');
    expect(stampFn).not.toContain('cron.schedule');

    expect(hop).not.toContain('CREATE TABLE');
    expect(hop).not.toContain('ADD COLUMN');
    expect(hop).not.toContain('cron.schedule');

    expect(page).toContain("chasePrimary ? 'btn-primary' : 'hub-next'");
    expect(page).toContain('hub-invoice-more');
    expect(css).toContain('.hub-invoices .btn-primary');
    expect(css).toMatch(/\.hub-invoices \.btn-primary[\s\S]*min-height:\s*44px/);
    expect(css).toMatch(/\.hub-invoices \.btn-primary[\s\S]*height:\s*44px/);

    expect(quotesPage).not.toContain('stampSentPastDueOverdue');
    expect(quotesPage).not.toContain('shouldStampInvoiceStatusOverdue');
    expect(quoteNext).not.toContain('stampSentPastDueOverdue');
    expect(quoteNext).not.toContain('due=overdue');
  });
});

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { COMPANY_EMAIL_SETTINGS_HREF } from './sendInvoice';
import { recommendJobAction } from './jobNextAction';
import { jobClientEmailRow } from './saveJobClientEmail';
import {
  JOB_CLIENT_ATTACH_ALREADY,
  JOB_CLIENT_ATTACH_NO_CLIENTS,
  JOB_CLIENT_ATTACH_NO_JOB,
  JOB_CLIENT_ATTACH_NO_SELECTION,
  JOB_CLIENT_ATTACH_SAVED,
  JOB_CLIENT_ATTACH_UNKNOWN,
  companyClientsForAttach,
  decideJobClientAttach,
  jobClientAttachRow,
  jobClientAttachToast,
} from './attachJobClient';

function src(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8');
}

const acme = { id: 'c1', name: 'Acme Electrical' };
const brooks = { id: 'c2', name: 'Brooks Plumbing' };

const invoiceReady = {
  status: 'completed' as const,
  scheduledDate: '2026-08-20',
  crewCount: 1,
  jhaCount: 1,
  inspectionCount: 1,
  invoiceCount: 0,
  hasDraftInvoice: false,
  hasIssuedInvoice: false,
  hasAcceptedQuote: false,
  hasBillLines: true,
  clockedOn: true,
};

const sendReady = {
  ...invoiceReady,
  invoiceCount: 1,
  hasDraftInvoice: true,
  hasIssuedInvoice: false,
};

describe('companyClientsForAttach', () => {
  it('lists existing company clients only — no invented placeholder', () => {
    expect(companyClientsForAttach([
      acme,
      { id: 'c-arch', name: 'Old Co', archived: true },
      { id: 'c-blank', name: '   ' },
      { id: '', name: 'Ghost' },
      brooks,
    ])).toEqual([acme, brooks]);
    expect(companyClientsForAttach([])).toEqual([]);
    expect(companyClientsForAttach(null)).toEqual([]);
    expect(companyClientsForAttach(undefined)).toEqual([]);
  });
});

describe('jobClientAttachRow', () => {
  it('keeps the signed client row when this job already has client_id', () => {
    expect(jobClientAttachRow({
      jobClientId: 'c1',
      companyClients: [acme, brooks],
    })).toEqual({ kind: 'linked' });
    expect(jobClientAttachRow({
      jobClientId: 'c1',
      companyClients: [],
    }).kind).toBe('linked');
  });

  it('lets the operator pick when this job has no client_id and company clients exist', () => {
    expect(jobClientAttachRow({
      jobClientId: null,
      companyClients: [acme, brooks],
    })).toEqual({ kind: 'pick', clients: [acme, brooks] });
    expect(jobClientAttachRow({
      jobClientId: '',
      companyClients: [acme],
    }).kind).toBe('pick');
  });

  it('names the miss when there are no clients to pick — no fake picker', () => {
    expect(jobClientAttachRow({
      jobClientId: null,
      companyClients: [],
    })).toEqual({
      kind: 'miss',
      reason: 'no_clients',
      message: JOB_CLIENT_ATTACH_NO_CLIENTS,
    });
    expect(jobClientAttachRow({
      jobClientId: null,
      companyClients: [{ id: 'c-arch', name: 'Old Co', archived: true }],
    }).kind).toBe('miss');
    expect(JOB_CLIENT_ATTACH_NO_CLIENTS).toBe('No clients to attach');
  });

  it('stays quiet while the company list is still loading', () => {
    expect(jobClientAttachRow({
      jobClientId: null,
      companyClients: null,
    })).toEqual({ kind: 'pending' });
    expect(jobClientAttachRow({
      jobClientId: undefined,
      companyClients: undefined,
    }).kind).toBe('pending');
  });
});

describe('decideJobClientAttach', () => {
  it('writes jobs.client_id on this job from an existing company client', () => {
    expect(decideJobClientAttach({
      jobId: 'job-1',
      jobClientId: null,
      clientId: 'c1',
      companyClients: [acme, brooks],
    })).toEqual({ action: 'write', jobId: 'job-1', clientId: 'c1' });
  });

  it('does not invent a client — unknown, blank, or empty list miss', () => {
    expect(decideJobClientAttach({
      jobId: 'job-1',
      jobClientId: null,
      clientId: 'invented',
      companyClients: [acme],
    })).toEqual({
      action: 'miss',
      reason: 'unknown_client',
      message: JOB_CLIENT_ATTACH_UNKNOWN,
    });
    expect(decideJobClientAttach({
      jobId: 'job-1',
      jobClientId: null,
      clientId: '',
      companyClients: [acme],
    })).toMatchObject({ action: 'miss', reason: 'no_selection', message: JOB_CLIENT_ATTACH_NO_SELECTION });
    expect(decideJobClientAttach({
      jobId: 'job-1',
      jobClientId: null,
      clientId: 'c1',
      companyClients: [],
    })).toMatchObject({ action: 'miss', reason: 'no_clients', message: JOB_CLIENT_ATTACH_NO_CLIENTS });
    expect(decideJobClientAttach({
      jobId: 'job-1',
      jobClientId: null,
      clientId: 'c-arch',
      companyClients: [{ id: 'c-arch', name: 'Old Co', archived: true }],
    })).toMatchObject({ action: 'miss', reason: 'no_clients' });
  });

  it('does not clobber a job that already has client_id', () => {
    expect(decideJobClientAttach({
      jobId: 'job-1',
      jobClientId: 'c1',
      clientId: 'c2',
      companyClients: [acme, brooks],
    })).toEqual({
      action: 'miss',
      reason: 'already_linked',
      message: JOB_CLIENT_ATTACH_ALREADY,
    });
  });

  it('misses without a job id', () => {
    expect(decideJobClientAttach({
      jobId: null,
      jobClientId: null,
      clientId: 'c1',
      companyClients: [acme],
    })).toEqual({
      action: 'miss',
      reason: 'no_job',
      message: JOB_CLIENT_ATTACH_NO_JOB,
    });
  });
});

describe('after attach — signed email field / Next unchanged', () => {
  it('reuses the #40 email field when the attached client has no sendable email', () => {
    expect(jobClientAttachRow({
      jobClientId: 'c1',
      companyClients: [acme],
    }).kind).toBe('linked');
    expect(jobClientEmailRow({
      clientId: 'c1',
      client: { id: 'c1', email: null },
    })).toEqual({ kind: 'edit', clientId: 'c1', email: '' });
    expect(jobClientEmailRow({
      clientId: 'c1',
      client: { id: 'c1', email: '  ' },
    }).kind).toBe('edit');
  });

  it('shows the saved address when the attached client already has email', () => {
    expect(jobClientEmailRow({
      clientId: 'c1',
      client: { id: 'c1', email: 'jane@acme.com.au' },
    })).toEqual({ kind: 'mailto', clientId: 'c1', email: 'jane@acme.com.au' });
  });

  it('does not move Next off Invoice or Send — no auto-send, no auto-invoice', () => {
    expect(recommendJobAction(invoiceReady)).toMatchObject({ key: 'invoice', label: 'Invoice' });
    expect(recommendJobAction(sendReady)).toMatchObject({ key: 'send', label: 'Send' });
    expect(jobClientAttachToast()).toEqual({
      message: JOB_CLIENT_ATTACH_SAVED,
      kind: 'success',
    });
    expect(JOB_CLIENT_ATTACH_SAVED).not.toMatch(/sent/i);
    expect(JOB_CLIENT_ATTACH_SAVED).not.toMatch(/invoice/i);
  });
});

describe('job-sheet attach client — wiring', () => {
  it('writes jobs.client_id on this job and does not invent a client', () => {
    const attach = src('src/lib/attachJobClient.ts');
    const page = src('src/pages/JobDetailPage.tsx');
    const handleStart = page.indexOf('const attachClient = useMutation');
    const handleEnd = page.indexOf('const saveClientEmail');
    expect(handleStart).toBeGreaterThan(-1);
    expect(handleEnd).toBeGreaterThan(handleStart);
    const handle = page.slice(handleStart, handleEnd);

    expect(attach).toContain("from('jobs')");
    expect(attach).toContain('update({ client_id:');
    expect(attach).toContain('.eq(\'id\', decision.jobId)');
    expect(attach).toContain('decideJobClientAttach');
    expect(attach).toContain('companyClientsForAttach');
    expect(attach).not.toContain('insert({');
    expect(attach).not.toContain("from('clients')");
    expect(attach).not.toContain('CREATE TABLE');
    expect(attach).not.toContain('ALTER TABLE');
    expect(attach).not.toContain('cron.schedule');
    expect(attach).not.toContain('sendJobDraftInvoice');
    expect(attach).not.toContain('createInvoiceFromJobBill');
    expect(attach).not.toContain('deliverInvoice');
    expect(attach).not.toContain('InvoiceSendDialog');
    expect(attach).not.toContain('decideInvoiceSend');
    expect(attach).not.toContain('job-reminder');

    expect(page).toContain('attachJobClient');
    expect(page).toContain('jobClientAttachRow');
    expect(page).toContain('jobClientAttachToast');
    expect(page).toContain('attachClient.mutate()');
    expect(page).toContain('job-client-attach');
    expect(page).toContain('job-client-attach-save');
    expect(page).toContain('aria-label="Attach client"');
    expect(page).toContain("kind === 'pick'");
    expect(page).toContain("kind === 'miss'");
    expect(page).toContain('JOB_CLIENT_ATTACH_NO_CLIENTS');
    expect(page).toContain("from('clients')");
    expect(page).toContain("eq('archived', false)");
    expect(page).toContain("eq('company_id', profile.company_id)");
    expect(page).toContain("queryKey: ['job-attach-clients'");
    expect(page).toContain('jobClientAttachRow({');
    expect(page).toContain('jobClientId: job.client_id');
    expect(page).not.toContain('ClientAttachDialog');
    expect(page).not.toContain('AttachClientDialog');
    expect(page).not.toContain('Create client');
    expect(page).not.toContain('AU_EMAIL_PLACEHOLDER');
    expect(page).not.toContain('No client (walk-up)');
    expect(page).not.toContain('InvoiceSendDialog');
    expect(page).not.toContain('QuoteSendDialog');

    expect(handle).toContain('attachJobClient');
    expect(handle).toContain('job?.id');
    expect(handle).toContain('job?.client_id');
    expect(handle).toContain('clientAttachDraft');
    expect(handle).toContain("invalidateQueries({ queryKey: ['job', id] })");
    expect(handle).toContain("invalidateQueries({ queryKey: ['job-client'");
    expect(handle).not.toContain('sendJobDraftInvoice');
    expect(handle).not.toContain('sendJobDraft.mutate');
    expect(handle).not.toContain('createInvoiceFromJobBill');
    expect(handle).not.toContain('invoiceFromJobBill');
    expect(handle).not.toContain('deliverInvoice');
    expect(handle).not.toContain('insert({');
    expect(handle).not.toContain('navigate(');
  });

  it('reuses the signed #40 email field after attach — does not invent a second editor', () => {
    const page = src('src/pages/JobDetailPage.tsx');
    expect(page).toContain('jobClientEmailRow({ clientId: job.client_id, client: client ?? null })');
    expect(page).toContain("emailRow.kind === 'edit'");
    expect(page).toContain("emailRow.kind === 'mailto'");
    expect(page).toContain('job-client-email');
    expect(page).toContain('job-client-email-save');
    expect(page).toContain('saveJobClientEmail');
    expect(page).toContain('saveClientEmail.mutate()');
    expect(page.match(/job-client-email-save/g)?.length).toBeGreaterThanOrEqual(1);
    expect(page).not.toContain('job-client-attach-email');
    expect(page).not.toContain('ClientEmailDialog');
  });

  it('does not add a second 44px primary — Next Invoice / Send stays the one primary', () => {
    const page = src('src/pages/JobDetailPage.tsx');
    const css = src('src/index.css');
    const clientCssStart = css.indexOf('.job-cal-host .job-client-email');
    expect(clientCssStart).toBeGreaterThan(-1);
    const clientCss = css.slice(clientCssStart, css.indexOf('.job-cal-act'));

    expect(page).toContain('ops-next-control-block');
    expect(page).toContain("next.key === 'invoice'");
    expect(page).toContain("next.key === 'send'");
    expect(page).toContain('job-client-attach-save');
    expect(page).not.toContain('className="ops-next-control-block job-client-attach-save"');
    expect(page).not.toContain('className="btn-primary job-client-attach-save"');
    expect(clientCss).toContain('.job-client-attach');
    expect(clientCss).toContain('.job-client-attach-save');
    expect(clientCss).not.toContain('min-height: 44px');
    expect(clientCss).not.toContain('min-h-[44px]');
    expect(clientCss).not.toContain('ops-next-control');
    expect(clientCss).toContain('font-size: 12px');
    expect(clientCss).toContain('#D5DCE3');
    expect(clientCss).toContain('gap: 8px');
    expect(clientCss).toContain('#5B6B7C');
    expect(clientCss).toContain('#0A2540');
    expect(clientCss).toMatch(/\.job-client-attach-save[\s\S]*color: #5B6B7C/);
  });

  it('leaves Invoice-sheet Send / Send again / Mark paid / Xero / receipt and SMTP Company settings as signed', () => {
    const page = src('src/pages/JobDetailPage.tsx');
    const invoicesPage = src('src/pages/InvoicesPage.tsx');
    const dialog = src('src/components/invoicing/InvoiceSendDialog.tsx');
    const invoiceNext = src('src/lib/invoiceNextAction.ts');
    const send = src('src/lib/sendInvoice.ts');
    const deliver = src('src/lib/sendInvoiceDeliver.ts');

    expect(page).not.toContain('Mark paid');
    expect(page).not.toContain('Send again');
    expect(page).not.toContain('InvoiceSendDialog');
    expect(invoicesPage).not.toContain('attachJobClient');
    expect(invoicesPage).not.toContain('jobClientAttachRow');
    expect(invoicesPage).toContain('InvoiceSendDialog');
    expect(invoicesPage).toContain('Send again');
    expect(invoicesPage).toContain('Mark paid');
    expect(dialog).toContain('deliverInvoice');
    expect(dialog).not.toContain('attachJobClient');
    expect(invoiceNext).toContain("label: 'Send again'");
    expect(invoiceNext).toContain('invoiceOverflowPaidAction');
    expect(invoiceNext).toContain('COMPANY_EMAIL_SETTINGS_HREF');
    expect(send).toContain('NO_SMTP_MESSAGE');
    expect(send).toContain('COMPANY_EMAIL_SETTINGS_HREF');
    expect(send).toContain(COMPANY_EMAIL_SETTINGS_HREF);
    expect(send).not.toContain('attachJobClient');
    expect(deliver).toContain('export async function deliverInvoice');
    expect(deliver).not.toContain('attachJobClient');

    const startSend = invoicesPage.indexOf('const startSend');
    const startSendFn = invoicesPage.slice(startSend, invoicesPage.indexOf('const editorMoney'));
    const patchPaid = invoicesPage.indexOf('const patchPaid');
    const patchPaidFn = invoicesPage.slice(patchPaid, invoicesPage.indexOf('let primary'));
    const finishPaid = invoicesPage.indexOf('const finishPaid');
    const finishPaidFn = invoicesPage.slice(finishPaid, invoicesPage.indexOf('const id = savedId'));
    expect(startSendFn).not.toContain('attachJobClient');
    expect(startSendFn).toContain('onRequestSend');
    expect(patchPaidFn).not.toContain('attachJobClient');
    expect(finishPaidFn).not.toContain('attachJobClient');
  });

  it('keeps Flameboy look shots for pick, after-attach no-email, no-clients, and linked', () => {
    const shots = [
      'docs/look/job-attach-client-pick-desktop.png',
      'docs/look/job-attach-client-pick-ute.png',
      'docs/look/job-attach-client-no-email-desktop.png',
      'docs/look/job-attach-client-no-email-ute.png',
      'docs/look/job-attach-client-no-clients-desktop.png',
      'docs/look/job-attach-client-no-clients-ute.png',
      'docs/look/job-attach-client-linked-desktop.png',
      'docs/look/job-attach-client-linked-ute.png',
    ];
    for (const shot of shots) {
      expect(existsSync(resolve(process.cwd(), shot)), shot).toBe(true);
    }
  });

  it('leaves quote convert / PR #17 off this control', () => {
    const attach = src('src/lib/attachJobClient.ts');
    const quoteConvert = src('src/lib/convertQuoteToInvoice.ts');
    const quotesPage = src('src/pages/QuotesPage.tsx');
    const quoteNext = src('src/lib/quoteNextAction.ts');
    expect(attach).not.toContain('convertQuoteToInvoice');
    expect(attach).not.toContain('sendQuote');
    expect(attach).not.toContain('QuoteSendDialog');
    expect(quoteConvert).not.toContain('attachJobClient');
    expect(quotesPage).not.toContain('attachJobClient');
    expect(quoteNext).not.toContain('attachJobClient');
  });
});

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { jobClientEmailRow, jobClientEmailToStore } from './saveJobClientEmail';
import {
  decideReportSend,
  resolveReportClientId,
  type ReportSendBundle,
  type ReportSendReport,
} from './sendReport';
import {
  REPORT_CLIENT_ATTACH_ALREADY,
  REPORT_CLIENT_ATTACH_NO_CLIENTS,
  REPORT_CLIENT_ATTACH_NO_SELECTION,
  REPORT_CLIENT_ATTACH_NO_TARGET,
  REPORT_CLIENT_ATTACH_SAVED,
  REPORT_CLIENT_ATTACH_UNKNOWN,
  companyClientsForAttach,
  decideReportClientAttach,
  reportClientAttachRow,
  reportClientAttachToast,
} from './attachReportClient';

function src(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8');
}

const acme = { id: 'c1', name: 'Acme Electrical' };
const brooks = { id: 'c2', name: 'Brooks Plumbing' };

const smtp = {
  smtp_host: 'smtp.resend.com',
  smtp_pass: 're_test',
  from_name: 'BTS Electrical',
  from_email: 'reports@btselectrical.com.au',
};

const company = { name: 'BTS Electrical', email: 'office@btselectrical.com.au' };

const report: ReportSendReport = {
  id: 'rep-1',
  company_id: 'co1',
  inspection_id: 'insp-1',
  report_number: 'BTS-260821-1234',
  pdf_storage_path: 'insp-1/Site - BTS-260821-1234.pdf',
  sent_at: null,
};

const inspection = {
  id: 'insp-1',
  client_id: null as string | null,
  crm_job_id: 'job-1',
  status: 'issued',
  meta: { siteName: 'Plant A' },
  template_snapshot: { name: 'Switchboard test' },
};

const job = {
  id: 'job-1',
  client_id: null as string | null,
  address: 'Warehouse B',
  title: 'Shutdown',
  job_number: 18,
};

function bundle(over: Partial<ReportSendBundle> = {}): ReportSendBundle {
  return {
    report,
    inspection,
    client: null,
    job,
    smtp,
    company,
    existingPdf: { filename: 'Warehouse B - BTS-260821-1234.pdf', content: 'PDFBYTES' },
    ...over,
  };
}

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

describe('reportClientAttachRow', () => {
  it('keeps the signed #44 path when this report already has a client', () => {
    expect(reportClientAttachRow({
      reportClientId: 'c1',
      companyClients: [acme, brooks],
    })).toEqual({ kind: 'linked' });
    expect(reportClientAttachRow({
      reportClientId: 'c1',
      companyClients: [],
    }).kind).toBe('linked');
  });

  it('lets the operator pick when this report has no client and company clients exist', () => {
    expect(reportClientAttachRow({
      reportClientId: null,
      companyClients: [acme, brooks],
    })).toEqual({ kind: 'pick', clients: [acme, brooks] });
    expect(reportClientAttachRow({
      reportClientId: '',
      companyClients: [acme],
    }).kind).toBe('pick');
  });

  it('names the miss when there are no clients to pick — no fake picker', () => {
    expect(reportClientAttachRow({
      reportClientId: null,
      companyClients: [],
    })).toEqual({
      kind: 'miss',
      reason: 'no_clients',
      message: REPORT_CLIENT_ATTACH_NO_CLIENTS,
    });
    expect(reportClientAttachRow({
      reportClientId: null,
      companyClients: [{ id: 'c-arch', name: 'Old Co', archived: true }],
    }).kind).toBe('miss');
    expect(REPORT_CLIENT_ATTACH_NO_CLIENTS).toBe('No clients to attach');
  });

  it('stays quiet while the company list is still loading', () => {
    expect(reportClientAttachRow({
      reportClientId: null,
      companyClients: null,
    })).toEqual({ kind: 'pending' });
    expect(reportClientAttachRow({
      reportClientId: undefined,
      companyClients: undefined,
    }).kind).toBe('pending');
  });
});

describe('decideReportClientAttach', () => {
  it('writes jobs.client_id when a job is bound to this report', () => {
    expect(decideReportClientAttach({
      jobId: 'job-1',
      inspectionId: 'insp-1',
      reportClientId: null,
      clientId: 'c1',
      companyClients: [acme, brooks],
    })).toEqual({ action: 'write', target: 'job', jobId: 'job-1', clientId: 'c1' });
  });

  it('writes inspections.client_id when no job is bound', () => {
    expect(decideReportClientAttach({
      jobId: null,
      inspectionId: 'insp-1',
      reportClientId: null,
      clientId: 'c1',
      companyClients: [acme, brooks],
    })).toEqual({ action: 'write', target: 'inspection', inspectionId: 'insp-1', clientId: 'c1' });
  });

  it('does not invent a client — unknown, blank, or empty list miss', () => {
    expect(decideReportClientAttach({
      jobId: 'job-1',
      inspectionId: 'insp-1',
      reportClientId: null,
      clientId: 'invented',
      companyClients: [acme],
    })).toEqual({
      action: 'miss',
      reason: 'unknown_client',
      message: REPORT_CLIENT_ATTACH_UNKNOWN,
    });
    expect(decideReportClientAttach({
      jobId: 'job-1',
      inspectionId: 'insp-1',
      reportClientId: null,
      clientId: '',
      companyClients: [acme],
    })).toMatchObject({ action: 'miss', reason: 'no_selection', message: REPORT_CLIENT_ATTACH_NO_SELECTION });
    expect(decideReportClientAttach({
      jobId: 'job-1',
      inspectionId: 'insp-1',
      reportClientId: null,
      clientId: 'c1',
      companyClients: [],
    })).toMatchObject({ action: 'miss', reason: 'no_clients', message: REPORT_CLIENT_ATTACH_NO_CLIENTS });
    expect(decideReportClientAttach({
      jobId: 'job-1',
      inspectionId: 'insp-1',
      reportClientId: null,
      clientId: 'c-arch',
      companyClients: [{ id: 'c-arch', name: 'Old Co', archived: true }],
    })).toMatchObject({ action: 'miss', reason: 'no_clients' });
  });

  it('does not clobber a report that already has a client', () => {
    expect(decideReportClientAttach({
      jobId: 'job-1',
      inspectionId: 'insp-1',
      reportClientId: 'c1',
      clientId: 'c2',
      companyClients: [acme, brooks],
    })).toEqual({
      action: 'miss',
      reason: 'already_linked',
      message: REPORT_CLIENT_ATTACH_ALREADY,
    });
  });

  it('misses without a job or inspection to write', () => {
    expect(decideReportClientAttach({
      jobId: null,
      inspectionId: null,
      reportClientId: null,
      clientId: 'c1',
      companyClients: [acme],
    })).toEqual({
      action: 'miss',
      reason: 'no_target',
      message: REPORT_CLIENT_ATTACH_NO_TARGET,
    });
  });
});

describe('after attach — signed #44 email field / Send unchanged', () => {
  it('reuses the #44 email field when the attached client has no sendable email', () => {
    expect(reportClientAttachRow({
      reportClientId: 'c1',
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

    const afterAttachNoEmail = decideReportSend(bundle({
      job: { ...job, client_id: 'c1' },
      client: { id: 'c1', name: 'Acme Electrical', email: null, phone: null },
    }));
    expect(afterAttachNoEmail.ok).toBe(false);
    if (!afterAttachNoEmail.ok) expect(afterAttachNoEmail.blocker).toBe('no_email');
  });

  it('enables Send report after attach when that client already has a sendable email — no auto-send', () => {
    expect(jobClientEmailRow({
      clientId: 'c1',
      client: { id: 'c1', email: 'jane@acme.com.au' },
    })).toEqual({ kind: 'mailto', clientId: 'c1', email: 'jane@acme.com.au' });

    const before = decideReportSend(bundle());
    expect(before.ok).toBe(false);
    if (!before.ok) expect(before.blocker).toBe('no_client');

    const afterAttach = decideReportSend(bundle({
      job: { ...job, client_id: 'c1' },
      client: { id: 'c1', name: 'Acme Electrical', email: 'jane@acme.com.au', phone: null },
    }));
    expect(afterAttach.ok).toBe(true);
    if (!afterAttach.ok) return;
    expect(afterAttach.to).toBe('jane@acme.com.au');
    expect(reportClientAttachToast()).toEqual({
      message: REPORT_CLIENT_ATTACH_SAVED,
      kind: 'success',
    });
    expect(REPORT_CLIENT_ATTACH_SAVED).not.toMatch(/sent/i);
    expect(REPORT_CLIENT_ATTACH_SAVED).not.toMatch(/email/i);
  });

  it('writes the bound job — inspection snapshot client does not count as already linked', () => {
    expect(resolveReportClientId({ client_id: 'c-insp' }, { client_id: null })).toBeNull();
    expect(decideReportClientAttach({
      jobId: 'job-1',
      inspectionId: 'insp-1',
      reportClientId: resolveReportClientId({ client_id: 'c-insp' }, { client_id: null }),
      clientId: 'c1',
      companyClients: [acme],
    })).toEqual({ action: 'write', target: 'job', jobId: 'job-1', clientId: 'c1' });
  });

  it('falls back to the inspection write when no job is bound, then #44 email if needed', () => {
    const attached = decideReportClientAttach({
      jobId: null,
      inspectionId: 'insp-1',
      reportClientId: null,
      clientId: 'c1',
      companyClients: [acme],
    });
    expect(attached).toEqual({ action: 'write', target: 'inspection', inspectionId: 'insp-1', clientId: 'c1' });
    const after = decideReportSend(bundle({
      job: null,
      inspection: { ...inspection, crm_job_id: null, client_id: 'c1' },
      client: { id: 'c1', name: 'Acme Electrical', email: jobClientEmailToStore(''), phone: null },
    }));
    expect(after.ok).toBe(false);
    if (!after.ok) expect(after.blocker).toBe('no_email');
  });
});

describe('report-send attach client — wiring', () => {
  it('writes jobs.client_id or inspections.client_id and does not invent a client', () => {
    const attach = src('src/lib/attachReportClient.ts');
    const dialog = src('src/components/inspection/ReportSendDialog.tsx');
    const handleStart = dialog.indexOf('const handleAttach');
    const handleEnd = dialog.indexOf('const handleSaveEmail');
    expect(handleStart).toBeGreaterThan(-1);
    expect(handleEnd).toBeGreaterThan(handleStart);
    const handle = dialog.slice(handleStart, handleEnd);

    expect(attach).toContain("from('jobs')");
    expect(attach).toContain("from('inspections')");
    expect(attach).toContain('update({ client_id:');
    expect(attach).toContain('.eq(\'id\', decision.jobId)');
    expect(attach).toContain('.eq(\'id\', decision.inspectionId)');
    expect(attach).toContain('decideReportClientAttach');
    expect(attach).toContain('companyClientsForAttach');
    expect(attach).toContain("target === 'job'");
    expect(attach).toContain("target === 'inspection'");
    expect(attach).not.toContain('insert({');
    expect(attach).not.toContain("from('clients')");
    expect(attach).not.toContain('CREATE TABLE');
    expect(attach).not.toContain('ALTER TABLE');
    expect(attach).not.toContain('cron.schedule');
    expect(attach).not.toContain('deliverReport');
    expect(attach).not.toContain('ReportSendDialog');
    expect(attach).not.toContain('decideReportSend');
    expect(attach).not.toContain('saveJobClientEmail');
    expect(attach).not.toContain('sent_at');

    expect(dialog).toContain('attachReportClient');
    expect(dialog).toContain('reportClientAttachRow');
    expect(dialog).toContain('handleAttach()');
    expect(dialog).toContain('job-client-attach');
    expect(dialog).toContain('job-client-attach-save');
    expect(dialog).toContain('aria-label="Attach client"');
    expect(dialog).toContain("kind === 'pick'");
    expect(dialog).toContain("kind === 'miss'");
    expect(dialog).toContain('REPORT_CLIENT_ATTACH_NO_CLIENTS');
    expect(dialog).toContain("from('clients')");
    expect(dialog).toContain("eq('archived', false)");
    expect(dialog).toContain("eq('company_id', company.id)");
    expect(dialog).toContain("queryKey: ['report-attach-clients'");
    expect(dialog).toContain('reportClientAttachRow({');
    expect(dialog).toContain('reportClientId');
    expect(dialog).toContain("blocker === 'no_client'");
    expect(dialog).not.toContain('ClientAttachDialog');
    expect(dialog).not.toContain('AttachClientDialog');
    expect(dialog).not.toContain('ReportClientAttachDialog');
    expect(dialog).not.toContain('Create client');
    expect(dialog).not.toContain('AU_EMAIL_PLACEHOLDER');
    expect(dialog).not.toContain('No client (walk-up)');
    expect(dialog).not.toContain('QuoteSendDialog');

    expect(handle).toContain('attachReportClient');
    expect(handle).toContain('bundle.job?.id');
    expect(handle).toContain('bundle.inspection?.id');
    expect(handle).toContain('clientAttachDraft');
    expect(handle).toContain('decideReportSend(next)');
    expect(handle).toContain("invalidateQueries({ queryKey: ['job-client'");
    expect(handle).not.toContain('deliverReport');
    expect(handle).not.toContain('handleSend');
    expect(handle).not.toContain('onSent');
    expect(handle).not.toContain('insert({');
    expect(handle).not.toContain('sent_at');
    expect(handle).not.toContain('saveJobClientEmail');
  });

  it('reuses the signed #44 email field after attach — does not invent a second editor', () => {
    const dialog = src('src/components/inspection/ReportSendDialog.tsx');
    expect(dialog).toContain('jobClientEmailRow({');
    expect(dialog).toContain('clientId: reportClientId');
    expect(dialog).toContain("emailRow.kind === 'edit'");
    expect(dialog).toContain('job-client-email');
    expect(dialog).toContain('job-client-email-save');
    expect(dialog).toContain('saveJobClientEmail');
    expect(dialog).toContain('handleSaveEmail()');
    expect(dialog).toContain("blocker === 'no_email'");
    expect(dialog.match(/job-client-email-save/g)?.length).toBeGreaterThanOrEqual(1);
    expect(dialog).not.toContain('job-client-attach-email');
    expect(dialog).not.toContain('report-client-attach-email');
    expect(dialog).not.toContain('ClientEmailDialog');
    expect(dialog).not.toContain('ReportClientEmailDialog');
  });

  it('does not add a second 44px — Save is muted on the miss, primary stays Send report', () => {
    const dialog = src('src/components/inspection/ReportSendDialog.tsx');
    const css = src('src/index.css');
    const sendCssStart = css.indexOf('.hub-invoice-send .job-client-attach');
    expect(sendCssStart).toBeGreaterThan(-1);
    const sendCss = css.slice(sendCssStart, css.indexOf('.hub-invoice-send-xero-miss'));

    expect(dialog).toContain('className="btn-primary"');
    expect(dialog).toContain('Send report');
    expect(dialog).toContain('job-client-attach-save');
    expect(dialog).toContain('showSend');
    expect(dialog).toContain('disabled={sending || !ready}');
    expect(dialog).toContain('noClientMiss');
    expect(dialog).not.toContain('Open client');
    expect(dialog).not.toContain('Add a client');
    expect(dialog).not.toContain('className="btn-primary job-client-attach-save"');
    expect(dialog).not.toContain('className="ops-next-control-block job-client-attach-save"');
    expect(sendCss).toContain('.job-client-attach-save');
    expect(sendCss).not.toContain('min-height: 44px');
    expect(sendCss).not.toContain('min-h-[44px]');
    expect(sendCss).not.toContain('ops-next-control');
    expect(sendCss).not.toContain('btn-primary');
    expect(sendCss).toContain('font-size: 12px');
    expect(sendCss).toContain('#D5DCE3');
    expect(sendCss).toContain('gap: 8px');
    expect(sendCss).toContain('white-space: nowrap');
    expect(sendCss).toContain('text-overflow: clip');
    expect(sendCss).not.toContain('ellipsis');
    expect(sendCss).toContain('#5B6B7C');
    expect(sendCss).toContain('#0A2540');
    expect(sendCss).toContain('#2E75B6');
    expect(sendCss).toMatch(/\.job-client-attach-save[\s\S]*color: #5B6B7C/);

    const primaryCss = css.slice(
      css.indexOf('.hub-invoice-send .btn-primary'),
      css.indexOf('.hub-invoices-chrome'),
    );
    expect(primaryCss).toContain('.btn-primary:disabled');
    expect(primaryCss).toContain('.btn-primary:disabled:hover');
    expect(primaryCss).toContain('opacity: 0.45');
    expect(primaryCss).toContain('cursor: not-allowed');
    expect(dialog).not.toContain('indigo-500');
    expect(dialog).not.toContain('sky-500');
    expect(sendCss).not.toContain('indigo-500');
    expect(sendCss).not.toContain('sky-500');
  });

  it('disables Send report on no_client until attach (and a sendable email if needed) — no auto-send', () => {
    const dialog = src('src/components/inspection/ReportSendDialog.tsx');
    const handleAttach = dialog.slice(dialog.indexOf('const handleAttach'), dialog.indexOf('const handleSaveEmail'));
    const handleSave = dialog.slice(dialog.indexOf('const handleSaveEmail'), dialog.indexOf('const handleSend'));
    const handleSendFn = dialog.slice(dialog.indexOf('const handleSend'), dialog.indexOf('const ready'));
    const sendBtn = dialog.slice(dialog.indexOf('{showSend &&'), dialog.indexOf('{showSmtpSettings'));

    expect(dialog).toContain('disabled={sending || !ready}');
    expect(dialog).toContain('|| noClientMiss');
    expect(sendBtn).toContain('Send report');
    expect(sendBtn).toContain('disabled={sending || !ready}');
    expect(handleAttach).toContain('decideReportSend(next)');
    expect(handleAttach).not.toContain('deliverReport');
    expect(handleAttach).not.toContain('onSent');
    expect(handleSave).toContain('saveJobClientEmail');
    expect(handleSave).not.toContain('deliverReport');
    expect(handleSendFn).toContain('deliverReport');
    expect(handleSendFn).not.toContain('attachReportClient');
    expect(handleSendFn).not.toContain('if (!decision?.ok) return');
  });

  it('already-linked reports keep the signed #44 path — email field if needed, no picker', () => {
    const dialog = src('src/components/inspection/ReportSendDialog.tsx');
    expect(dialog).toContain("blocker === 'no_email'");
    expect(dialog).toContain('REPORT_SEND_NO_EMAIL_FIELD');
    expect(dialog).toContain('job-client-email');
    expect(dialog).toContain('noClientMiss && attachRow.kind === \'pick\'');
    expect(resolveReportClientId({ client_id: 'c1' }, null)).toBe('c1');
    expect(reportClientAttachRow({
      reportClientId: 'c1',
      companyClients: [acme, brooks],
    }).kind).toBe('linked');
    const linkedNoEmail = decideReportSend(bundle({
      job: { ...job, client_id: 'c1' },
      client: { id: 'c1', name: 'Acme Electrical', email: null, phone: null },
    }));
    expect(linkedNoEmail.ok).toBe(false);
    if (!linkedNoEmail.ok) expect(linkedNoEmail.blocker).toBe('no_email');
  });

  it('leaves sendReport / PDF / SMS beside / sent_at and SMTP Company settings as signed', () => {
    const dialog = src('src/components/inspection/ReportSendDialog.tsx');
    const send = src('src/lib/sendReport.ts');
    const deliver = src('src/lib/sendReportDeliver.ts');
    const invoiceDialog = src('src/components/invoicing/InvoiceSendDialog.tsx');

    expect(dialog).toContain('Company settings');
    expect(dialog).toContain("blocker === 'no_smtp'");
    expect(dialog).toContain('SMS To');
    expect(dialog).toContain('deliverReport');
    expect(dialog).toContain('Send report');
    expect(send).toContain('NO_SMTP_MESSAGE');
    expect(send).toContain('clientEmailForSend');
    expect(send).toContain('COMPANY_EMAIL_SETTINGS_HREF');
    expect(send).toContain('href: COMPANY_EMAIL_SETTINGS_HREF');
    expect(send).toContain('resolveReportClientId');
    expect(send).toContain('sent_at');
    expect(send).toContain('smsTo');
    expect(send).toContain('pickReportPdfAttachment');
    expect(send).not.toContain('attachReportClient');
    expect(send).not.toContain('reportClientAttachRow');
    expect(deliver).toContain('export async function deliverReport');
    expect(deliver).toContain('sent_at');
    expect(deliver).not.toContain('attachReportClient');
    expect(deliver).not.toContain('saveJobClientEmail');
    expect(invoiceDialog).not.toContain('attachReportClient');
    expect(invoiceDialog).toContain('Open client');
    expect(invoiceDialog).toContain('Company settings');
    expect(send).toContain('href: COMPANY_EMAIL_SETTINGS_HREF');
  });

  it('keeps Flameboy look shots for pick, after-attach no-email, no-clients, and linked', () => {
    const shots = [
      'docs/look/report-send-attach-client-pick-desktop.png',
      'docs/look/report-send-attach-client-pick-ute.png',
      'docs/look/report-send-attach-client-no-email-desktop.png',
      'docs/look/report-send-attach-client-no-email-ute.png',
      'docs/look/report-send-attach-client-no-clients-desktop.png',
      'docs/look/report-send-attach-client-no-clients-ute.png',
      'docs/look/report-send-attach-client-linked-desktop.png',
      'docs/look/report-send-attach-client-linked-ute.png',
    ];
    for (const shot of shots) {
      expect(existsSync(resolve(process.cwd(), shot)), shot).toBe(true);
    }
  });

  it('leaves quote convert / PR #17 off this control', () => {
    const attach = src('src/lib/attachReportClient.ts');
    const dialog = src('src/components/inspection/ReportSendDialog.tsx');
    const quoteConvert = src('src/lib/convertQuoteToInvoice.ts');
    const quotesPage = src('src/pages/QuotesPage.tsx');
    const quoteNext = src('src/lib/quoteNextAction.ts');
    expect(attach).not.toContain('convertQuoteToInvoice');
    expect(attach).not.toContain('sendQuote');
    expect(attach).not.toContain('QuoteSendDialog');
    expect(quoteConvert).not.toContain('attachReportClient');
    expect(quotesPage).not.toContain('attachReportClient');
    expect(quoteNext).not.toContain('attachReportClient');
    expect(dialog).not.toContain('QuoteSendDialog');
    expect(dialog).not.toContain('sendQuote');
    expect(dialog).not.toContain('sendQuoteDeliver');
    expect(dialog).not.toContain('convertQuoteToInvoice');
  });
});

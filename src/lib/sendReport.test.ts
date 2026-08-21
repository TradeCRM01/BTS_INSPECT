import { describe, expect, it } from 'vitest';
import {
  applyReportSendScope,
  clientEmailForSend,
  clientPhoneForSms,
  decideReportSend,
  decideReportSms,
  inspectionDisplayStatus,
  isReportSendScoped,
  isSmtpReady,
  NO_PDF_MESSAGE,
  NO_REPORT_MESSAGE,
  pickReportByIdAndCompany,
  pickReportPdfAttachment,
  reportAttachmentOrMiss,
  reportByIdQuery,
  reportIsSent,
  reportPdfFilename,
  reportSendClientQuery,
  reportSendHtml,
  reportSendInspectionQuery,
  reportSendJobQuery,
  reportSendQueries,
  reportSendSubject,
  reportSendSurface,
  reportSentAtAfterSend,
  reportSmsBody,
  reportStatusPatchAfterSend,
  REPORT_SEND_PIPE,
  reportsForInspectionsQuery,
  resolveReportClientId,
  shouldRecordReportSent,
  wouldScanLedgerToSendReport,
  type ReportSendBundle,
  type ReportSendReport,
} from './sendReport';

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
  client_id: 'c1',
  crm_job_id: 'job-1',
  status: 'issued',
  meta: { siteName: 'Plant A' },
  template_snapshot: { name: 'Switchboard test' },
};

const client = {
  id: 'c1',
  name: 'Acme Plumbing',
  email: 'jane@acme.com.au',
  phone: '0412 345 678',
  address: '12 Smith St',
};

const job = {
  id: 'job-1',
  client_id: 'c1',
  address: 'Warehouse B',
  title: 'Shutdown',
  job_number: 18,
};

function bundle(over: Partial<ReportSendBundle> = {}): ReportSendBundle {
  return {
    report,
    inspection,
    client,
    job,
    smtp,
    company,
    existingPdf: { filename: 'Plant A - BTS-260821-1234.pdf', content: 'PDFBYTES' },
    ...over,
  };
}

describe('client To for report send', () => {
  it('prefills To from the client email and rejects empty / invalid', () => {
    expect(clientEmailForSend('jane@acme.com.au')).toBe('jane@acme.com.au');
    expect(clientEmailForSend('')).toBeNull();
    expect(clientEmailForSend('not-an-email')).toBeNull();
  });
});

describe('isSmtpReady', () => {
  it('needs the wired Resend host, key, and from address', () => {
    expect(isSmtpReady(smtp)).toBe(true);
    expect(isSmtpReady(null)).toBe(false);
  });
});

describe('decideReportSend', () => {
  it('prefills To from the job/inspection client and is ready when SMTP is set', () => {
    expect(decideReportSend(bundle())).toEqual({
      ok: true,
      to: 'jane@acme.com.au',
      toName: 'Acme Plumbing',
      subject: 'Inspection Report — Warehouse B — BTS-260821-1234 from BTS Electrical',
      filename: 'Warehouse B - BTS-260821-1234.pdf',
      smsTo: '+61412345678',
      smsMessage: null,
    });
  });

  it('does not pretend it sent when there is no report', () => {
    const decision = decideReportSend(bundle({ report: null, existingPdf: null }));
    expect(decision.ok).toBe(false);
    if (decision.ok) return;
    expect(decision.blocker).toBe('no_report');
    expect(decision.message).toBe(NO_REPORT_MESSAGE);
  });

  it('does not invent a PDF when the stored report has no file', () => {
    const decision = decideReportSend(bundle({
      report: { ...report, pdf_storage_path: '' },
      existingPdf: null,
    }));
    expect(decision.ok).toBe(false);
    if (decision.ok) return;
    expect(decision.blocker).toBe('no_pdf');
    expect(decision.message).toBe(NO_PDF_MESSAGE);
  });

  it('does not pretend it sent when the client has no email', () => {
    const decision = decideReportSend(bundle({ client: { ...client, email: null } }));
    expect(decision.ok).toBe(false);
    if (decision.ok) return;
    expect(decision.blocker).toBe('no_email');
    expect(decision.message).toMatch(/no email/i);
    expect(decision.href).toBe('/clients/c1');
  });

  it('does not pretend it sent when SMTP is missing', () => {
    const decision = decideReportSend(bundle({ smtp: null }));
    expect(decision.ok).toBe(false);
    if (decision.ok) return;
    expect(decision.blocker).toBe('no_smtp');
    expect(decision.message).toMatch(/not set up/i);
    expect(decision.href).toBe('/settings/company');
  });

  it('blocks send when there is no client on the inspection or job', () => {
    expect(decideReportSend(bundle({
      inspection: { ...inspection, client_id: null },
      job: { ...job, client_id: null },
    })).ok).toBe(false);
  });

  it('falls back to the job client when the inspection has none', () => {
    const decision = decideReportSend(bundle({
      inspection: { ...inspection, client_id: null },
    }));
    expect(decision.ok).toBe(true);
    if (!decision.ok) return;
    expect(decision.to).toBe('jane@acme.com.au');
  });

  it('names Send from the live job site, not a stale inspections.meta.siteName', () => {
    const decision = decideReportSend(bundle({
      inspection: { ...inspection, meta: { siteName: 'Stale plant' } },
    }));
    expect(decision.ok).toBe(true);
    if (!decision.ok) return;
    expect(decision.subject).toContain('Warehouse B');
    expect(decision.subject).not.toContain('Stale plant');
    expect(decision.filename).toContain('Warehouse B');
  });

  it('does not invent a site when the bound job has no address', () => {
    const decision = decideReportSend(bundle({
      job: { ...job, address: '', title: '' },
    }));
    expect(decision.ok).toBe(true);
    if (!decision.ok) return;
    expect(decision.subject).toContain('Inspection Report — Site —');
    expect(decision.subject).not.toContain('Plant A');
  });

  it('uses the inspection snapshot only when no job is bound', () => {
    const decision = decideReportSend(bundle({ job: null }));
    expect(decision.ok).toBe(true);
    if (!decision.ok) return;
    expect(decision.subject).toContain('Plant A');
  });

  it('blocks send when the bound job has no client, even if the inspection snapshot does', () => {
    const decision = decideReportSend(bundle({
      job: { ...job, client_id: null },
    }));
    expect(decision.ok).toBe(false);
    if (decision.ok) return;
    expect(decision.blocker).toBe('no_client');
  });

  it('still allows a resend of an already-sent report', () => {
    const decision = decideReportSend(bundle({ report: { ...report, sent_at: '2026-08-21T01:00:00.000Z' } }));
    expect(decision.ok).toBe(true);
  });

  it('still emails when the client has no phone — SMS is an honest miss, not a blocker', () => {
    const decision = decideReportSend(bundle({ client: { ...client, phone: null } }));
    expect(decision.ok).toBe(true);
    if (!decision.ok) return;
    expect(decision.smsTo).toBeNull();
    expect(decision.smsMessage).toMatch(/no phone/i);
  });
});

describe('report SMS beside email', () => {
  it('prefills SMS To from clients.phone', () => {
    expect(clientPhoneForSms('0412 345 678')).toBe('+61412345678');
    expect(clientPhoneForSms('')).toBeNull();
  });

  it('does not block email when SMS credentials are missing', () => {
    const sms = decideReportSms({ phone: '0412 345 678', credentials: null });
    expect(sms.send).toBe(false);
    expect(decideReportSend(bundle()).ok).toBe(true);
  });

  it('names the SMS from the report number and site — no portal', () => {
    const body = reportSmsBody({
      companyName: 'BTS Electrical',
      reportNumber: 'BTS-260821-1234',
      siteName: 'Plant A',
    });
    expect(body).toContain('BTS-260821-1234');
    expect(body).toContain('Plant A');
    expect(body).toMatch(/PDF is in your email/);
    expect(body).not.toContain('portal');
    expect(body).not.toContain('quote');
  });
});

describe('reportSentAtAfterSend', () => {
  it('marks sent only when delivery succeeded', () => {
    expect(reportSentAtAfterSend(false, null)).toBeNull();
    expect(reportSentAtAfterSend(false, '2026-08-20T00:00:00.000Z')).toBe('2026-08-20T00:00:00.000Z');
    const now = new Date('2026-08-21T05:00:00.000Z');
    expect(reportSentAtAfterSend(true, null, now)).toBe(now.toISOString());
    expect(reportStatusPatchAfterSend(false)).toBeNull();
    expect(reportStatusPatchAfterSend(true, now)).toEqual({ sent_at: now.toISOString() });
    expect(shouldRecordReportSent(true)).toBe(true);
    expect(shouldRecordReportSent(false)).toBe(false);
    expect(reportIsSent(null)).toBe(false);
    expect(reportIsSent('2026-08-21T05:00:00.000Z')).toBe(true);
  });
});

describe('report send copy / document name', () => {
  it('names the PDF and subject from the site and report number', () => {
    expect(reportPdfFilename({ siteName: 'Plant A', reportNumber: 'BTS-260821-1234' }))
      .toBe('Plant A - BTS-260821-1234.pdf');
    expect(reportSendSubject({
      siteName: 'Plant A',
      reportNumber: 'BTS-260821-1234',
      companyName: 'BTS Electrical',
    })).toBe('Inspection Report — Plant A — BTS-260821-1234 from BTS Electrical');
  });

  it('mentions the attached PDF and does not invent a portal', () => {
    const html = reportSendHtml({
      clientName: 'Jane',
      companyName: 'BTS Electrical',
      reportNumber: 'BTS-260821-1234',
      siteName: 'Plant A',
      attachedPdf: true,
    });
    expect(html).toContain('Jane');
    expect(html).toContain('BTS-260821-1234');
    expect(html).toContain('Plant A');
    expect(html).toContain('PDF is attached');
    expect(html).not.toContain('portal');
    expect(html).not.toContain('quote');
    expect(html).not.toContain('mailto:');
  });
});

describe('pickReportPdfAttachment', () => {
  it('attaches the existing PDF and refuses to invent one', () => {
    const existing = { filename: 'Plant A - BTS-260821-1234.pdf', content: 'EXISTING' };
    expect(pickReportPdfAttachment({ existing })?.content).toBe('EXISTING');
    expect(pickReportPdfAttachment({ existing: null })).toBeNull();
    expect(reportAttachmentOrMiss(null)).toEqual({ ok: false, reason: 'no_pdf', message: NO_PDF_MESSAGE });
    expect(reportAttachmentOrMiss(existing).ok).toBe(true);
  });
});

describe('report send surface — honest empty', () => {
  it('offers Send only when a report already exists', () => {
    expect(reportSendSurface(null)).toEqual({ kind: 'empty', message: NO_REPORT_MESSAGE });
    expect(reportSendSurface({ id: 'rep-1', sent_at: null })).toEqual({
      kind: 'send',
      reportId: 'rep-1',
      sent: false,
    });
    expect(reportSendSurface({ id: 'rep-1', sent_at: '2026-08-21T01:00:00.000Z' }).kind).toBe('send');
    expect(inspectionDisplayStatus('issued', null)).toBe('issued');
    expect(inspectionDisplayStatus('issued', '2026-08-21T01:00:00.000Z')).toBe('sent');
  });
});

describe('REPORT_SEND_PIPE', () => {
  it('uses the job-reminder Resend pipe — not send-quote or mailto', () => {
    const pipe = REPORT_SEND_PIPE.join(' ');
    expect(pipe).toMatch(/job-reminder/);
    expect(pipe).toMatch(/reportId/);
    expect(pipe).toMatch(/api\.resend\.com/);
    expect(pipe).toMatch(/email_settings/);
    expect(pipe).toMatch(/2xx/);
    expect(pipe).toMatch(/Twilio/);
    expect(pipe).toMatch(/clients\.phone/);
    expect(pipe).not.toMatch(/send-quote/);
    expect(pipe).not.toMatch(/mailto/);
  });
});

describe('report send query scope', () => {
  it('loads one report by id + company, not the drive ledger', () => {
    const scopes = reportSendQueries({ companyId: 'co1', reportId: 'rep-1' });
    expect(isReportSendScoped(scopes.report)).toBe(true);
    expect(isReportSendScoped(scopes.smtp)).toBe(true);
    expect(wouldScanLedgerToSendReport(scopes.report)).toBe(false);
    expect(scopes.report.eq).toEqual({ id: 'rep-1', company_id: 'co1' });
    expect(scopes.report.columns).not.toBe('*');
    expect(reportSendInspectionQuery(null)).toBeNull();
    expect(reportSendClientQuery('c1')?.eq).toEqual({ id: 'c1' });
    expect(reportSendJobQuery('job-1')?.eq).toEqual({ id: 'job-1' });
    expect(reportByIdQuery({ companyId: 'co1', reportId: 'rep-1' })?.eq).toEqual({
      id: 'rep-1',
      company_id: 'co1',
    });
    expect(reportByIdQuery({ companyId: '', reportId: 'rep-1' })).toBeNull();
  });

  it('treats an unscoped reports select as a ledger scan', () => {
    expect(wouldScanLedgerToSendReport({
      table: 'reports',
      columns: 'id, report_number',
      eq: { company_id: 'co1' },
    })).toBe(true);
  });

  it('applies id + company_id eq — never an unscoped reports select', () => {
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
    };
    const scopes = reportSendQueries({ companyId: 'co1', reportId: 'rep-1' });
    applyReportSendScope(builder, scopes.report);
    expect(calls[0]).toMatch(/^select:/);
    expect(calls).toContain('eq:id:rep-1');
    expect(calls).toContain('eq:company_id:co1');
  });

  it('scopes job-hub report lookup to this job\'s inspections + company', () => {
    const scope = reportsForInspectionsQuery({ companyId: 'co1', inspectionIds: ['insp-1', 'insp-2'] });
    expect(scope).not.toBeNull();
    expect(scope?.eq).toEqual({ company_id: 'co1' });
    expect(scope?.inFilters).toEqual({ inspection_id: ['insp-1', 'insp-2'] });
    expect(reportsForInspectionsQuery({ companyId: 'co1', inspectionIds: [] })).toBeNull();
  });

  it('does not invent a client id — bound job client wins', () => {
    expect(resolveReportClientId({ client_id: null }, { client_id: null })).toBeNull();
    expect(resolveReportClientId({ client_id: null }, { client_id: 'c1' })).toBe('c1');
    expect(resolveReportClientId({ client_id: 'c2' }, { client_id: 'c1' })).toBe('c1');
    expect(resolveReportClientId({ client_id: 'c2' }, null)).toBe('c2');
    expect(resolveReportClientId({ client_id: 'c2' }, { client_id: null })).toBeNull();
  });
});

describe('performance — one report, not a drive walk', () => {
  it('does not walk other companies even when handed a mixed drive', () => {
    const mixed: Array<{ id: string; company_id: string }> = [];
    for (let i = 0; i < 4000; i++) {
      mixed.push({ id: `other-${i}`, company_id: 'co-other' });
    }
    mixed.push({ id: 'rep-1', company_id: 'co1' });
    const started = performance.now();
    const picked = pickReportByIdAndCompany(mixed, 'rep-1', 'co1');
    const elapsed = performance.now() - started;
    expect(picked).toEqual({ id: 'rep-1', company_id: 'co1' });
    expect(pickReportByIdAndCompany(mixed, 'rep-1', 'co-other')).toBeNull();
    expect(elapsed).toBeLessThan(80);
  });

  it('decides send on one report without scanning the book', () => {
    const started = performance.now();
    for (let i = 0; i < 2000; i++) {
      decideReportSend(bundle());
    }
    const elapsed = performance.now() - started;
    expect(elapsed).toBeLessThan(80);
  });
});

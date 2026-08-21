import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  REPORT_SEND_PIPE,
  reportByIdQuery,
  reportSendQueries,
  wouldScanLedgerToSendReport,
} from './sendReport';

describe('report send deliver path', () => {
  it('invokes job-reminder, not send-quote or a new send-report function', () => {
    const deliver = readFileSync(resolve(process.cwd(), 'src/lib/sendReportDeliver.ts'), 'utf8');
    const dialog = readFileSync(resolve(process.cwd(), 'src/components/inspection/ReportSendDialog.tsx'), 'utf8');
    const page = readFileSync(resolve(process.cwd(), 'src/pages/ReportPage.tsx'), 'utf8');
    const edge = readFileSync(resolve(process.cwd(), 'supabase/functions/job-reminder/index.ts'), 'utf8');

    expect(deliver).toContain("invoke('job-reminder'");
    expect(deliver).toContain('reportId');
    expect(deliver).not.toContain('send-quote');
    expect(deliver).not.toContain('sendQuote');
    expect(deliver).not.toContain("invoke('send-report'");
    expect(deliver).not.toContain('mailto:');
    expect(dialog).not.toContain('QuoteSend');
    expect(dialog).not.toContain('send-quote');
    expect(page).toContain('ReportSendDialog');
    expect(page).toContain('hub-invoice-more');
    expect(page).toContain('btn-primary');
    expect(page).not.toContain('Send again');
    expect(page).not.toContain('mailto:?subject=');
    expect(page).not.toContain('window.location.href = `mailto:');
    expect(dialog).toContain('hub-invoice-send');
    expect(dialog).toContain('Send report');
    expect(dialog).toContain('SMS To');
    expect(dialog).toContain('hub-invoice-send-tos');
    expect(edge).toContain('reportId');
    expect(edge).toContain('from("reports")');
    expect(edge).toContain('api.resend.com/emails');
    expect(edge).toContain('email_settings');
    expect(edge).toContain('sent_at');
    expect(edge).toContain('api.twilio.com');
    expect(edge).toContain('TWILIO_ACCOUNT_SID');
    expect(edge).toContain('client?.phone');
    expect(edge).not.toContain('from("quotes")');
    expect(edge).not.toContain('send-quote');
    expect(REPORT_SEND_PIPE.join(' ')).toMatch(/job-reminder/);
  });

  it('SMS miss does not flip report sent_at — sent follows email 2xx only', () => {
    const edge = readFileSync(resolve(process.cwd(), 'supabase/functions/job-reminder/index.ts'), 'utf8');
    expect(edge).toMatch(/sent_at: sentAt/);
    expect(edge).toMatch(/sendTwilioSms/);
    const reportBlockStart = edge.indexOf('if (reportId)');
    const reportBlock = edge.slice(reportBlockStart, edge.indexOf('if (jobId)', reportBlockStart));
    const emailFail = reportBlock.indexOf('if (!res.ok)');
    const statusWrite = reportBlock.indexOf('sent_at: sentAt');
    expect(emailFail).toBeGreaterThan(-1);
    expect(statusWrite).toBeGreaterThan(emailFail);
    const statusBlock = reportBlock.slice(statusWrite, statusWrite + 280);
    expect(statusBlock).toContain('sent_at');
    expect(statusBlock).not.toContain('sms.sent');
  });

  it('loads the report by id + company before send', () => {
    const scope = reportByIdQuery({ companyId: 'co1', reportId: 'rep-1' });
    expect(scope).not.toBeNull();
    expect(wouldScanLedgerToSendReport(scope)).toBe(false);
    expect(reportSendQueries({ companyId: 'co1', reportId: 'rep-1' }).report.eq).toEqual({
      id: 'rep-1',
      company_id: 'co1',
    });
  });

  it('job hub and inspection list reuse the same dialog and pipe', () => {
    const jobHub = readFileSync(resolve(process.cwd(), 'src/pages/JobDetailPage.tsx'), 'utf8');
    const list = readFileSync(resolve(process.cwd(), 'src/pages/InspectionsPage.tsx'), 'utf8');
    expect(jobHub).toContain('ReportSendDialog');
    expect(jobHub).toContain('No report yet');
    expect(jobHub).not.toContain('mailto:?subject=');
    expect(list).toContain('ReportSendDialog');
    expect(list).toContain('hasReport');
    expect(list).toContain('No report yet');
    expect(list).toContain('ops-next-control-done');
  });
});

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  canClientAcceptQuote,
  clientPortalAcceptBody,
  clientPortalPublicUrl,
  quoteSendHtml,
  quoteSmsBody,
  quoteStatusAfterClientAccept,
} from './sendQuote';
import {
  canAcceptPortalQuote,
  PORTAL_QUOTE_ACCEPT_ACTION,
  portalQuoteAcceptBody,
} from '../pages/ClientPortalPublicPage';

function src(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8');
}

describe('portal quote Accept — same write as office Mark accepted', () => {
  it('sent quotes can Accept; that write is quotes.status = accepted', () => {
    expect(canClientAcceptQuote('sent')).toBe(true);
    expect(canAcceptPortalQuote('sent')).toBe(true);
    expect(canClientAcceptQuote('accepted')).toBe(false);
    expect(canAcceptPortalQuote('draft')).toBe(false);
    expect(quoteStatusAfterClientAccept('sent')).toBe('accepted');
    expect(quoteStatusAfterClientAccept('expired')).toBeNull();
    expect(portalQuoteAcceptBody('tok', 'q1')).toEqual(clientPortalAcceptBody('tok', 'q1'));
    expect(PORTAL_QUOTE_ACCEPT_ACTION).toBe('accept_quote');
  });

  it('rides the existing /p token portal — list Accept, no new route family', () => {
    const page = src('src/pages/ClientPortalPublicPage.tsx');
    const app = src('src/App.tsx');
    const edge = src('supabase/functions/client-portal/index.ts');

    expect(page).toContain("functions.invoke('client-portal'");
    expect(page).toContain('portalQuoteAcceptBody(token, quoteId)');
    expect(page).toContain('canAcceptPortalQuote(q.status)');
    expect(page).toContain('{acceptingId === q.id ? \'Accepting...\' : \'Accept\'}');
    expect(page).not.toContain('path=');
    expect(page).not.toContain('/quote-accept');
    expect(page).not.toContain('How to pay');
    expect(page).not.toContain('Relovi');
    expect(page).not.toContain('Littleloop');

    expect(app).toContain('path="/p"');
    expect(app).toContain('ClientPortalPublicPage');
    expect(app).not.toContain('quote-accept');
    expect(app).not.toContain('/portal/accept');

    expect(edge).toContain('accept_quote');
    expect(edge).toContain('status: "accepted"');
    expect(edge).toContain('.eq("status", "sent")');
    expect(edge).toContain('.eq("client_id", portal.client_id)');
    expect(edge).toContain('.eq("company_id", portal.company_id)');
    expect(edge).toContain('from("quotes")');
    expect(edge).not.toContain('declined');
    expect(edge).not.toContain('How to pay');
  });

  it('G1 Accept inserts one job and sets quotes.status = accepted — Convert is not a second tap', () => {
    const edge = src('supabase/functions/client-portal/index.ts');
    const page = src('src/pages/ClientPortalPublicPage.tsx');
    const convert = src('src/lib/convertQuoteToJob.ts');

    expect(edge).toContain('ensureJobForAcceptedQuote');
    expect(edge).toContain('from("jobs")');
    expect(edge).toContain('.insert({');
    expect(edge).toContain('status: "accepted"');
    expect(edge).toContain('.is("job_id", null)');
    expect(edge).toContain('jobId: ensured.jobId');
    expect(edge.indexOf('status: "accepted"')).toBeLessThan(edge.indexOf('ensureJobForAcceptedQuote(admin'));
    expect(page).toContain('portalQuoteAcceptBody(token, quoteId)');
    expect(page).not.toContain('convertQuoteToJob');
    expect(convert).toContain('if (latest?.job_id) return latest.job_id as string;');
  });

  it('G2 Accept copies quote date and crew onto the job when present', () => {
    const edge = src('supabase/functions/client-portal/index.ts');
    expect(edge).toContain('scheduled_date: scheduledDateFromQuote(quote.scheduled_date)');
    expect(edge).toContain('assigned_team: assignedTeamFromQuote(quote.assigned_team)');
    expect(edge).toContain('...fields');
    expect(edge).toContain('scheduled_date, assigned_team');
  });

  it('G3 Accept still inserts the job with no date or crew', () => {
    const edge = src('supabase/functions/client-portal/index.ts');
    expect(edge).toContain('Date + crew copy when present; otherwise the job still exists');
    expect(edge).not.toContain('CONVERT_QUOTE_NEED_DATE_CREW');
    expect(edge).not.toContain('convertQuoteHasDateAndCrew');
  });

  it('quote send email/SMS include the existing portal link', () => {
    const portalUrl = clientPortalPublicUrl('https://grafter.com.au', 'abc');
    expect(portalUrl).toBe('https://grafter.com.au/p?t=abc');
    const html = quoteSendHtml({
      clientName: 'Sam',
      companyName: 'BTS',
      quoteNumber: 4,
      totalLabel: '$10.00',
      validityLabel: null,
      portalUrl,
    });
    const sms = quoteSmsBody({
      companyName: 'BTS',
      quoteNumber: 4,
      totalLabel: '$10.00',
      validityLabel: null,
      portalUrl,
    });
    expect(html).toContain('/p?t=abc');
    expect(html).toContain('Accept this quote');
    expect(html).toContain('color:#0A2540');
    expect(html).toMatch(/Accept this quote: <a href="https:\/\/grafter\.com\.au\/p\?t=abc" style="color:#2E75B6">/);
    expect(html).not.toContain('Open your client portal');
    expect(sms).toContain('Accept here: https://grafter.com.au/p?t=abc');

    const send = src('src/lib/sendQuote.ts');
    const edge = src('supabase/functions/job-reminder/index.ts');
    const quoteHtmlStart = edge.indexOf('function quoteHtml');
    const quoteHtmlEnd = edge.indexOf('function quoteSmsBody');
    const quoteCopy = edge.slice(quoteHtmlStart, edge.indexOf('async function resolveQuotePortalUrl'));
    expect(send).toContain('portalUrl');
    expect(send).toContain('Accept here:');
    expect(send).toContain('/p?t=');
    expect(quoteCopy).toContain('portalUrl');
    expect(quoteCopy).toContain('Accept this quote');
    expect(quoteCopy).toContain('Accept here:');
    expect(quoteHtmlEnd).toBeGreaterThan(quoteHtmlStart);
  });
});

describe('LOOK — portal Accept is a signed quote sheet, not a leftover CRM button', () => {
  it('uses Looplet document tokens and one 44px #2E75B6 Accept', () => {
    const css = src('src/index.css');
    const page = src('src/pages/ClientPortalPublicPage.tsx');
    const send = src('src/lib/sendQuote.ts');
    const edge = src('supabase/functions/job-reminder/index.ts');
    const quoteHtmlStart = edge.indexOf('function quoteHtml');
    const quoteCopy = edge.slice(quoteHtmlStart, edge.indexOf('async function resolveQuotePortalUrl'));

    expect(css).toContain('#client-portal');
    expect(css).toContain('--portal-page: #F4F6F8');
    expect(css).toContain('--portal-sheet: #FFFFFF');
    expect(css).toContain('--portal-ink: #0A2540');
    expect(css).toContain('--portal-muted: #5B6B7C');
    expect(css).toContain('--portal-line: #D5DCE3');
    expect(css).toContain('--portal-action: #2E75B6');
    expect(css).toContain('--portal-r-ctl: 12px');
    expect(css).toContain('--portal-r-sheet: 16px');
    expect(css).toContain('font-family: Inter, system-ui, sans-serif');
    expect(css).toContain('min-height: 44px');
    expect(css).toContain('.portal-quote-accept');
    expect(css).toContain('background: #2E75B6');
    expect(page).toContain('id="client-portal"');
    expect(page).toContain('className="portal-quote-accept"');
    expect(page).toContain('{acceptingId === q.id ? \'Accepting...\' : \'Accept\'}');
    expect(page).toContain('portalQuoteStatusLabel(q.status)');
    expect(page).not.toContain('bg-[#0A2540]');
    expect(page).not.toContain('<Check');
    expect(send).toContain('quoteSendAcceptLineHtml');
    expect(send).toContain('color:#0A2540');
    expect(send).toContain('style="color:#2E75B6"');
    expect(send).toContain('background:#F4F6F8');
    expect(send).toContain('border:1px solid #D5DCE3');
    expect(send).not.toContain('Open your client portal');
    expect(send).not.toContain('background:#0A2540;color:#fff');
    expect(quoteCopy).toContain('color:#0A2540');
    expect(quoteCopy).toContain('background:#F4F6F8');
    expect(quoteCopy).toContain('Accept this quote:');
    expect(quoteCopy).toContain('Accept here:');
    expect(quoteCopy).not.toContain('Open your client portal');
    expect(quoteCopy).not.toContain('background:#0A2540;color:#fff');
  });

  it('LOOK frames cover sent, accepted, email, and SMS only', () => {
    for (const rel of [
      'docs/look/portal-accept-sent-desktop.png',
      'docs/look/portal-accept-sent-ute.png',
      'docs/look/portal-accept-done-desktop.png',
      'docs/look/portal-accept-done-ute.png',
      'docs/look/portal-accept-email.png',
      'docs/look/portal-accept-sms.png',
    ]) {
      expect(existsSync(resolve(process.cwd(), rel))).toBe(true);
    }
  });
});

describe('G4 G5 — Convert surface sets date and crew on the same tap', () => {
  it('puts date and crew on the existing Convert surface and writes them', () => {
    const quotes = src('src/pages/QuotesPage.tsx');
    const editor = quotes.split('function QuoteEditorModal')[1] ?? '';
    expect(editor).toContain('Field label="Job date"');
    expect(editor).toContain('Field label="Crew"');
    expect(editor).toContain('form.assigned_team');
    expect(editor).toContain('convertQuoteHasDateAndCrew');
    expect(editor).toContain('CONVERT_QUOTE_NEED_DATE_CREW');
    expect(editor).toContain('scheduled_date: form.scheduled_date || null');
    expect(editor).toContain('assigned_team: form.assigned_team');
    expect(editor.indexOf('if (!convertQuoteHasDateAndCrew')).toBeLessThan(editor.indexOf('await convertQuoteToJob'));
    expect(quotes).not.toContain('wayfinder');
  });
});

describe('G6 — fresh tenant, no electrical-only copy', () => {
  it('signup and this slice stay all-trades', () => {
    const signup = src('supabase/functions/signup-user/index.ts');
    const fields = src('src/lib/quoteJobFields.ts');
    const convert = src('src/lib/convertQuoteToJob.ts');
    const edge = src('supabase/functions/client-portal/index.ts');
    const quotes = src('src/pages/QuotesPage.tsx');

    expect(signup).toContain('Each signup is a new tenant');
    expect(signup).not.toMatch(/electrician|switchboard|electrical-only/i);
    expect(signup).not.toContain('from("jobs")');
    expect(signup).not.toContain('from("quotes")');
    expect(fields).not.toMatch(/electrician|Switchboard/);
    expect(convert).not.toMatch(/electrician|Switchboard/);
    expect(edge).not.toMatch(/electrician|Switchboard/);
    expect(quotes).not.toMatch(/electrician-only|Switchboard upgrade/);
  });
});

describe('isolation — stay-off surfaces stay off this change', () => {
  it('does not open a new send pipe, How to pay, job reminder tray, Relovi, or login chrome', () => {
    const page = src('src/pages/ClientPortalPublicPage.tsx');
    const send = src('src/lib/sendQuote.ts');
    const deliver = src('src/lib/sendQuoteDeliver.ts');
    const jobs = src('src/pages/JobsPage.tsx');
    const reminder = src('src/components/jobs/JobClientReminder.tsx');
    const reminderLib = src('src/lib/jobReminder.ts');
    const login = src('src/pages/LoginPage.tsx');
    const landing = src('src/pages/MarketingPage.tsx');
    const appShell = src('src/components/layout/AppShell.tsx');

    expect(page).not.toContain('sendQuoteDeliver');
    expect(page).not.toContain('deliverQuote');
    expect(page).not.toContain('JobClientReminder');
    expect(page).not.toContain('JobsPage');
    expect(page).not.toContain('arriving-shortly');
    expect(send).not.toContain('How to pay');
    expect(send).not.toContain('payment_methods');
    expect(send).not.toContain('Relovi');
    expect(send).not.toContain('Littleloop');
    expect(deliver).not.toContain('portalUrl');
    expect(deliver).not.toContain('accept_quote');
    expect(deliver).not.toContain('client_portal_tokens');
    expect(jobs).not.toContain('accept_quote');
    expect(reminder).not.toContain('accept_quote');
    expect(reminderLib).not.toContain('accept_quote');
    expect(login).not.toContain('accept_quote');
    expect(landing).not.toContain('accept_quote');
    expect(appShell).not.toContain('accept_quote');
  });
});

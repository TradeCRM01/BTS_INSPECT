import { readFileSync } from 'node:fs';
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

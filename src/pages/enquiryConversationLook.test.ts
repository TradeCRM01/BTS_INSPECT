import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function src(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8');
}

describe('enquiry conversation LOOK — existing Client and Job sheets', () => {
  it('mounts a read-only thread on Client and Job, hidden when empty', () => {
    const component = src('src/components/crm/EnquiryConversation.tsx');
    const client = src('src/pages/ClientDetailPage.tsx');
    const job = src('src/pages/JobDetailPage.tsx');
    const css = src('src/index.css');
    expect(component).toContain('data-enquiry-conversation="1"');
    expect(component).toContain('conversationDirectionLabel');
    expect(component).toContain('conversationStateLabel');
    expect(component).toContain('AlertCircle');
    expect(src('src/lib/enquiryConversation.ts')).toContain("'Customer'");
    expect(src('src/lib/enquiryConversation.ts')).toContain("'Auto text'");
    expect(src('src/lib/enquiryConversation.ts')).not.toContain("inbound' ? 'In'");
    expect(css).toContain('.hub-enquiry-conversation-state.is-failed');
    expect(css).toContain('color: #B42318');
    expect(css).toContain('.hub-enquiry-conversation-state.is-cancelled');
    expect(component).toContain('conversationMessageTime');
    expect(component).not.toContain('<textarea');
    expect(component).not.toContain('composer');
    expect(component).not.toContain('Send SMS');
    expect(client).toContain('EnquiryConversation');
    expect(job).toContain('EnquiryConversation');
    expect(client).toContain('useEnquiryConversation');
    expect(job).toContain('useEnquiryConversation');
    expect(client).toContain('conversationLookClientPhone');
    expect(job).toContain('conversationLookClientPhone');
    expect(src('src/lib/enquiryConversation.ts')).toContain('conversationPhonesMatch(callerPhone, ALLOWED_ENQUIRY_PHONE)');
    expect(src('src/lib/devFieldAuditDocs.ts')).toContain('conversationLookClientPhone');
    expect(src('src/lib/enquiryConversation.ts')).toContain('ENQUIRY_SURFACE_LIVE');
    expect(src('src/lib/enquiryConversation.ts')).toContain("if (!import.meta.env.DEV) return null");
    expect(src('src/lib/missedCallEnquiry.ts')).toContain('ENQUIRY_SURFACE_LIVE = false');
    expect(css).toContain('.hub-enquiry-conversation');
    expect(css).toContain('.hub-enquiry-conversation-state.is-failed');
    expect(css).toContain('background: #FFFDF8');
    expect(css).toContain('color: #0A2540');
    expect(client).not.toMatch(/\+614(?!18893602)\d+/);
    expect(job).not.toMatch(/\+614(?!18893602)\d+/);
    expect(src('src/lib/enquiryConversation.ts')).not.toMatch(/\+614(?!18893602)\d+/);
  });
});

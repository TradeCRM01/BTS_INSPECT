import { describe, expect, it } from 'vitest';
import { ALLOWED_ENQUIRY_PHONE, ENQUIRY_SURFACE_LIVE } from './missedCallEnquiry';
import { renderMissedCallAck } from './missedCallSmsCopy';
import {
  CONVERSATION_EMPTY_LOOK,
  CONVERSATION_LOOK,
  conversationDirectionLabel,
  conversationLookClientPhone,
  conversationLookKind,
  conversationLookPhone,
  conversationLookPhoneLabel,
  conversationMessageTime,
  conversationMessagesForLook,
  conversationPhonesMatch,
  conversationStateLabel,
  conversationVisible,
  enquiryPhoneE164,
  lookConversationMessages,
  mapConversationMessages,
  shouldQueryLiveConversation,
} from './enquiryConversation';

describe('enquiry conversation', () => {
  it('shows in, out, and state in the tenant time zone', () => {
    expect(conversationDirectionLabel('inbound')).toBe('In');
    expect(conversationDirectionLabel('outbound')).toBe('Out');
    expect(conversationStateLabel('sent')).toBe('Sent');
    expect(conversationStateLabel('failed')).toBe('Failed');
    expect(conversationStateLabel('cancelled')).toBe('Cancelled');
    expect(conversationMessageTime('2026-10-09T22:16:00.000Z', 'Australia/Brisbane'))
      .toBe('10 Oct 2026, 8:16 am');
    expect(conversationMessageTime('2026-10-09T22:16:00.000Z', 'Australia/Perth'))
      .toBe('10 Oct 2026, 6:16 am');
  });

  it('is hidden when there is no thread', () => {
    expect(conversationVisible([])).toBe(false);
    expect(conversationVisible(null)).toBe(false);
    expect(conversationVisible(lookConversationMessages())).toBe(true);
    expect(conversationLookKind(CONVERSATION_EMPTY_LOOK)).toBe('empty');
    expect(conversationLookKind(CONVERSATION_LOOK)).toBe('thread');
  });

  it('matches a client number only as an AU mobile, allowlisted in fixtures', () => {
    expect(enquiryPhoneE164(ALLOWED_ENQUIRY_PHONE)).toBe(ALLOWED_ENQUIRY_PHONE);
    expect(enquiryPhoneE164('0418 893 602')).toBe(ALLOWED_ENQUIRY_PHONE);
    expect(conversationPhonesMatch(ALLOWED_ENQUIRY_PHONE, '0418893602')).toBe(true);
    expect(conversationPhonesMatch(ALLOWED_ENQUIRY_PHONE, '')).toBe(false);
    expect(conversationPhonesMatch(null, ALLOWED_ENQUIRY_PHONE)).toBe(false);
    expect(conversationLookPhone()).toBe(ALLOWED_ENQUIRY_PHONE);
    expect(conversationLookPhoneLabel()).toBe('0418 893 602');
    expect(lookConversationMessages()[0].body).toBe(renderMissedCallAck('Field Audit Co'));
    expect(lookConversationMessages()[0].body).toBe(
      'Hi, this is Field Audit Co. Sorry we missed your call. Reply with what you need done and your suburb and we will get back to you. Reply STOP to opt out.',
    );
    expect(conversationLookClientPhone(CONVERSATION_LOOK, '0400 111 222')).toBe('0418 893 602');
    expect(conversationLookClientPhone(CONVERSATION_EMPTY_LOOK, '0400 111 222')).toBe('0400 111 222');
    expect(conversationMessagesForLook(CONVERSATION_LOOK, '0400 111 222')).toEqual([]);
    expect(conversationMessagesForLook(CONVERSATION_LOOK, ALLOWED_ENQUIRY_PHONE)?.[0]?.body)
      .toBe(renderMissedCallAck('Field Audit Co'));
    expect(conversationMessagesForLook(CONVERSATION_LOOK, '0418 893 602')?.length).toBeGreaterThan(0);
  });

  it('keeps live conversation off until the enquiry schema is live', () => {
    expect(ENQUIRY_SURFACE_LIVE).toBe(false);
    expect(shouldQueryLiveConversation(null)).toBe(false);
    expect(shouldQueryLiveConversation(CONVERSATION_LOOK)).toBe(false);
  });

  it('maps inbound received and outbound sent, failed, cancelled', () => {
    const rows = mapConversationMessages([
      {
        id: 'out',
        direction: 'outbound',
        state: 'sent',
        body: 'Ack',
        sent_at: '2026-10-09T22:16:00.000Z',
        created_at: '2026-10-09T22:16:00.000Z',
      },
      {
        id: 'in',
        direction: 'inbound',
        state: 'received',
        body: 'Hot water is out, Paddington',
        received_at: '2026-10-09T22:18:00.000Z',
        created_at: '2026-10-09T22:18:00.000Z',
      },
      {
        id: 'fail',
        direction: 'outbound',
        state: 'failed',
        body: 'Help',
        created_at: '2026-10-09T23:10:00.000Z',
      },
      {
        id: 'skip',
        direction: 'sideways',
        state: 'sent',
        body: 'no',
        created_at: '2026-10-09T23:11:00.000Z',
      },
    ]);
    expect(rows.map((row) => row.id)).toEqual(['out', 'in', 'fail']);
    expect(rows[1].direction).toBe('inbound');
    expect(rows[2].state).toBe('failed');
  });
});

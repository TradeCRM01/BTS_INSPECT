import { describe, expect, it } from 'vitest';
import { ENQUIRY_SURFACE_LIVE } from './missedCallEnquiry';
import {
  renderEnquiryThanks,
  renderMissedCallAck,
  renderMissedCallHelp,
  SMS_REPLY_FORBIDDEN,
} from './missedCallSmsCopy';
import {
  SMS_REPLY_DEFAULT_TEMPLATES,
  SMS_REPLY_FITS,
  SMS_REPLY_FORBIDDEN_WORD,
  SMS_REPLY_MISSING_BUSINESS,
  SMS_REPLY_MISSING_STOP,
  SMS_REPLY_TOO_LONG,
  approvedSmsReplyBody,
  renderSmsReplyTemplate,
  shouldQueryLiveSmsReplies,
  smsReplyFitLabel,
  smsReplyTemplateError,
  smsTextbackMemberStatus,
  storedSmsReplyTemplate,
} from './smsReplyTemplates';
import { SMS_SETTINGS_LOOK } from './smsTextbackSettings';

describe('sms reply templates', () => {
  it('renders Jack\'s approved wording from the defaults', () => {
    expect(approvedSmsReplyBody('ack', 'Twenty Character Nam')).toBe(
      renderMissedCallAck('Twenty Character Nam'),
    );
    expect(renderSmsReplyTemplate(SMS_REPLY_DEFAULT_TEMPLATES.ack, 'Twenty Character Nam'))
      .toBe(renderMissedCallAck('Twenty Character Nam'));
    expect(renderSmsReplyTemplate(SMS_REPLY_DEFAULT_TEMPLATES.thanks, 'Twenty Character Nam'))
      .toBe(renderEnquiryThanks('Twenty Character Nam'));
    expect(renderSmsReplyTemplate(SMS_REPLY_DEFAULT_TEMPLATES.help, 'Twenty Character Nam'))
      .toBe(renderMissedCallHelp('Twenty Character Nam'));
    expect(storedSmsReplyTemplate(SMS_REPLY_DEFAULT_TEMPLATES.ack, 'ack')).toBe(null);
  });

  it('requires the business token or name, STOP, one text, and the forbidden-word check', () => {
    expect(smsReplyTemplateError(SMS_REPLY_DEFAULT_TEMPLATES.ack, 'Field Audit Co')).toBe(null);
    expect(smsReplyTemplateError('Hello there. Reply STOP to opt out.', 'Field Audit Co'))
      .toBe(SMS_REPLY_MISSING_BUSINESS);
    expect(smsReplyTemplateError('Hi, this is {Business}. Thanks.', 'Field Audit Co'))
      .toBe(SMS_REPLY_MISSING_STOP);
    expect(smsReplyTemplateError(
      'Hi, this is {Business}. Ask us for a quote. Reply STOP to opt out.',
      'Field Audit Co',
    )).toBe(SMS_REPLY_FORBIDDEN_WORD);
    expect(SMS_REPLY_FORBIDDEN.test('ask us for a quote today')).toBe(true);
    expect(smsReplyFitLabel(SMS_REPLY_DEFAULT_TEMPLATES.ack, 'Field Audit Co')).toBe(SMS_REPLY_FITS);
    expect(smsReplyTemplateError(
      `{Business}. ${'x'.repeat(160)} Reply STOP to opt out.`,
      'Field Audit Co',
    )).toBe(SMS_REPLY_TOO_LONG);
    expect(smsReplyFitLabel(
      `{Business}. ${'x'.repeat(160)} Reply STOP to opt out.`,
      'Field Audit Co',
    )).toBe(SMS_REPLY_TOO_LONG);
  });

  it('keeps live template queries off until the enquiry flag is on', () => {
    expect(ENQUIRY_SURFACE_LIVE).toBe(false);
    expect(shouldQueryLiveSmsReplies(null)).toBe(false);
    expect(shouldQueryLiveSmsReplies(SMS_SETTINGS_LOOK)).toBe(false);
    expect(smsTextbackMemberStatus(true)).toBe(
      'Missed-call texts are on · ask an admin to change',
    );
    expect(smsTextbackMemberStatus(false)).toBe(
      'Missed-call texts are off · ask an admin to change',
    );
  });
});

import { describe, expect, it } from 'vitest';
import { ENQUIRY_SURFACE_LIVE } from './missedCallEnquiry';
import {
  gsm7Length,
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
  SMS_REPLY_NO_CONTACT,
  SMS_REPLY_NOT_GSM7,
  SMS_REPLY_TOO_LONG,
  approvedSmsReplyBody,
  renderSmsReplyTemplate,
  shouldQueryLiveSmsReplies,
  smsReplyDigitRun,
  smsReplyFieldError,
  smsReplyFitLabel,
  smsReplyHasLinkOrPhone,
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
    expect(smsReplyTemplateError(SMS_REPLY_DEFAULT_TEMPLATES.ack, 'Field Audit Co', 'ack')).toBe(null);
    expect(smsReplyTemplateError(SMS_REPLY_DEFAULT_TEMPLATES.thanks, 'Field Audit Co', 'thanks')).toBe(null);
    expect(smsReplyTemplateError(SMS_REPLY_DEFAULT_TEMPLATES.help, 'Field Audit Co', 'help')).toBe(null);
  });

  it('requires the business token or name, STOP ending, one text, and the forbidden-word check', () => {
    expect(smsReplyTemplateError('Hello there. Reply STOP to opt out.', 'Field Audit Co', 'ack'))
      .toBe(SMS_REPLY_MISSING_BUSINESS);
    expect(smsReplyTemplateError('Hi, this is {Business}. Thanks.', 'Field Audit Co', 'ack'))
      .toBe(SMS_REPLY_MISSING_STOP);
    expect(smsReplyTemplateError('Hi {Business}. Reply STOP to opt out. Call us back.', 'Field Audit Co', 'ack'))
      .toBe(SMS_REPLY_MISSING_STOP);
    expect(smsReplyTemplateError('{Business}: text the job. Reply STOP to opt out.', 'Field Audit Co', 'help'))
      .toBe(SMS_REPLY_MISSING_STOP);
    expect(smsReplyTemplateError(
      'Hi, this is {Business}. Ask us for a quote. Reply STOP to opt out.',
      'Field Audit Co',
      'ack',
    )).toBe(SMS_REPLY_FORBIDDEN_WORD);
    expect(SMS_REPLY_FORBIDDEN.test('ask us for a quote today')).toBe(true);
    expect(smsReplyFitLabel(SMS_REPLY_DEFAULT_TEMPLATES.ack, 'Field Audit Co')).toBe(SMS_REPLY_FITS);
    expect(smsReplyTemplateError(
      `{Business}. ${'x'.repeat(160)} Reply STOP to opt out.`,
      'Field Audit Co',
      'ack',
    )).toBe(SMS_REPLY_TOO_LONG);
  });

  it('rejects non-GSM, links, phones, and the literal-X padding exploit', () => {
    expect(smsReplyTemplateError('Hi {Business}. We missed you\u2019s call. Reply STOP to opt out.', 'Field Audit Co', 'ack'))
      .toBe(SMS_REPLY_NOT_GSM7);
    expect(smsReplyTemplateError('Hi {Business}. Sorry \u2014 we missed you. Reply STOP to opt out.', 'Field Audit Co', 'ack'))
      .toBe(SMS_REPLY_NOT_GSM7);
    expect(smsReplyTemplateError('Hi {Business}. Sorry we missed your call \u{1F600} Reply STOP to opt out.', 'Field Audit Co', 'ack'))
      .toBe(SMS_REPLY_NOT_GSM7);
    expect(smsReplyTemplateError('Hi {Business}. See http://x.test Reply STOP to opt out.', 'Field Audit Co', 'ack'))
      .toBe(SMS_REPLY_NO_CONTACT);
    expect(smsReplyTemplateError('Hi {Business}. See www.example.com Reply STOP to opt out.', 'Field Audit Co', 'ack'))
      .toBe(SMS_REPLY_NO_CONTACT);
    expect(smsReplyTemplateError('Hi {Business}. See grafter.com.au Reply STOP to opt out.', 'Field Audit Co', 'ack'))
      .toBe(SMS_REPLY_NO_CONTACT);
    expect(smsReplyTemplateError('Hi {Business}. Call 0412889360 Reply STOP to opt out.', 'Field Audit Co', 'ack'))
      .toBe(SMS_REPLY_NO_CONTACT);
    expect(smsReplyTemplateError('XXXXXXXXXXXXXXXXXXXX Reply STOP to opt out.', '', 'ack'))
      .toBe(SMS_REPLY_MISSING_BUSINESS);
    const name = 'Twenty Character Nam';
    const stop = 'Reply STOP to opt out.';
    const prefix = '{Business} {Business}. ';
    const renderedPrefix = `${name} ${name}. `;
    const pad = 160 - gsm7Length(`${renderedPrefix}${stop}`);
    expect(smsReplyTemplateError(`${prefix}${'x'.repeat(pad)}${stop}`, name, 'ack')).toBe(null);
    expect(smsReplyTemplateError(`${prefix}${'x'.repeat(pad + 1)}${stop}`, name, 'ack')).toBe(SMS_REPLY_TOO_LONG);
    expect(smsReplyFieldError(
      'Hi {Business}, ask us for a quote. Reply STOP to opt out.',
      'Field Audit Co',
      'ack',
    )).toBe(`Missed-call reply: ${SMS_REPLY_FORBIDDEN_WORD}`);
  });

  it('rejects spaced phones and spelled-out domains, and keeps Jack\'s three defaults', () => {
    expect(smsReplyTemplateError(
      'Hi {Business}. Call 0400 111 222 Reply STOP to opt out.',
      'Field Audit Co',
      'ack',
    )).toBe(SMS_REPLY_NO_CONTACT);
    expect(smsReplyTemplateError(
      'Thanks {Business}. Call +61 400 111 222 Reply STOP to opt out.',
      'Field Audit Co',
      'thanks',
    )).toBe(SMS_REPLY_NO_CONTACT);
    expect(smsReplyTemplateError(
      '{Business}: call 0400.111.222 Reply STOP to opt out, START to opt back in.',
      'Field Audit Co',
      'help',
    )).toBe(SMS_REPLY_NO_CONTACT);
    expect(smsReplyTemplateError(
      'Hi {Business}. Call 0400-111-222 Reply STOP to opt out.',
      'Field Audit Co',
      'ack',
    )).toBe(SMS_REPLY_NO_CONTACT);
    expect(smsReplyTemplateError(
      'Hi {Business}. See us at grafter dot co Reply STOP to opt out.',
      'Field Audit Co',
      'ack',
    )).toBe(SMS_REPLY_NO_CONTACT);
    expect(smsReplyTemplateError(
      'Thanks {Business}. See us at grafter DOT COM Reply STOP to opt out.',
      'Field Audit Co',
      'thanks',
    )).toBe(SMS_REPLY_NO_CONTACT);
    expect(smsReplyTemplateError(
      '{Business}: see grafter dot au Reply STOP to opt out, START to opt back in.',
      'Field Audit Co',
      'help',
    )).toBe(SMS_REPLY_NO_CONTACT);
    expect(smsReplyTemplateError(
      'Hi {Business}. See us at grafter Dot Net Reply STOP to opt out.',
      'Field Audit Co',
      'ack',
    )).toBe(SMS_REPLY_NO_CONTACT);
    expect(smsReplyTemplateError(
      'Hi {Business}. Call (04) 001 (11) 222 Reply STOP to opt out.',
      'Field Audit Co',
      'ack',
    )).toBe(SMS_REPLY_NO_CONTACT);
    expect(smsReplyTemplateError(
      'Thanks {Business}. Call 0400/111/222 Reply STOP to opt out.',
      'Field Audit Co',
      'thanks',
    )).toBe(SMS_REPLY_NO_CONTACT);
    expect(smsReplyTemplateError(
      'Hi {Business}. See us at dotcom Reply STOP to opt out.',
      'Field Audit Co',
      'ack',
    )).toBe(SMS_REPLY_NO_CONTACT);
    expect(smsReplyTemplateError(
      'Thanks {Business}. See us at grafter (dot) com Reply STOP to opt out.',
      'Field Audit Co',
      'thanks',
    )).toBe(SMS_REPLY_NO_CONTACT);
    expect(smsReplyTemplateError(
      '{Business}: see grafter[dot]com Reply STOP to opt out, START to opt back in.',
      'Field Audit Co',
      'help',
    )).toBe(SMS_REPLY_NO_CONTACT);
    expect(smsReplyTemplateError(
      'Hi {Business}. See us at grafter d0t com Reply STOP to opt out.',
      'Field Audit Co',
      'ack',
    )).toBe(SMS_REPLY_NO_CONTACT);
    expect(smsReplyTemplateError(
      'Thanks {Business}. See us at grafter dot c o m Reply STOP to opt out.',
      'Field Audit Co',
      'thanks',
    )).toBe(SMS_REPLY_NO_CONTACT);
    expect(smsReplyTemplateError(
      '{Business}: see grafter dot org Reply STOP to opt out, START to opt back in.',
      'Field Audit Co',
      'help',
    )).toBe(SMS_REPLY_NO_CONTACT);
    expect(smsReplyTemplateError(
      'Hi {Business}. Call 0400,111,222 Reply STOP to opt out.',
      'Field Audit Co',
      'ack',
    )).toBe(SMS_REPLY_NO_CONTACT);
    expect(smsReplyHasLinkOrPhone('Thanks {Business}. Call 0400\t\u00A0111\t\u00A0222 Reply STOP to opt out.')).toBe(true);
    expect(smsReplyDigitRun('0400\t\u00A0111\t\u00A0222')).toBe(true);
    expect(smsReplyTemplateError(
      '{Business}: call 0400_111_222 Reply STOP to opt out, START to opt back in.',
      'Field Audit Co',
      'help',
    )).toBe(SMS_REPLY_NO_CONTACT);
    expect(smsReplyTemplateError(
      'Hi {Business}. Call 0400|111|222 Reply STOP to opt out.',
      'Field Audit Co',
      'ack',
    )).toBe(SMS_REPLY_NO_CONTACT);
    expect(smsReplyTemplateError(
      'Thanks {Business}. Call 0400.11.12.22 Reply STOP to opt out.',
      'Field Audit Co',
      'thanks',
    )).toBe(SMS_REPLY_NO_CONTACT);
    expect(smsReplyTemplateError(
      'Hi {Business}. See us at btsdotcom Reply STOP to opt out.',
      'Field Audit Co',
      'ack',
    )).toBe(SMS_REPLY_NO_CONTACT);
    expect(smsReplyTemplateError(
      'Thanks {Business}. See us at bts{dot}com Reply STOP to opt out.',
      'Field Audit Co',
      'thanks',
    )).toBe(SMS_REPLY_NO_CONTACT);
    expect(smsReplyTemplateError(
      '{Business}: see d.o.t com Reply STOP to opt out, START to opt back in.',
      'Field Audit Co',
      'help',
    )).toBe(SMS_REPLY_NO_CONTACT);
    expect(smsReplyTemplateError(
      'Hi {Business}. The dot connection is open Reply STOP to opt out.',
      'Field Audit Co',
      'ack',
    )).toBe(null);
    expect(smsReplyTemplateError(
      'Hi {Business}. The fee is $1500.00 Reply STOP to opt out.',
      'Field Audit Co',
      'ack',
    )).toBe(null);
    expect(smsReplyTemplateError(SMS_REPLY_DEFAULT_TEMPLATES.ack, 'Field Audit Co', 'ack')).toBe(null);
    expect(smsReplyTemplateError(SMS_REPLY_DEFAULT_TEMPLATES.thanks, 'Field Audit Co', 'thanks')).toBe(null);
    expect(smsReplyTemplateError(SMS_REPLY_DEFAULT_TEMPLATES.help, 'Field Audit Co', 'help')).toBe(null);
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

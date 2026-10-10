import { describe, expect, it } from 'vitest';
import { ALLOWED_ENQUIRY_PHONE, ENQUIRY_SURFACE_LIVE } from './missedCallEnquiry';
import { renderMissedCallAck } from './missedCallSmsCopy';
import {
  SMS_SETTINGS_INVALID_LOOK,
  SMS_SETTINGS_LOOK,
  SMS_TEXTBACK_NAME_NOT_GSM7,
  SMS_TEXTBACK_NAME_REQUIRED,
  SMS_TEXTBACK_NAME_TOO_LONG,
  SMS_TEXTBACK_PREVIEW_BLOCKED,
  lookSmsTextbackSettings,
  shouldQueryLiveSmsTextback,
  smsAckPreview,
  smsAckPreviewBlocked,
  smsAckPreviewSegments,
  smsAckSegmentLabel,
  smsDisplayNameCount,
  smsDisplayNameCountOver,
  smsDisplayNameError,
  smsDisplayNameValid,
  smsTextbackCapStatus,
  smsTextbackEnableError,
  smsTextbackLookKind,
  smsTextbackTestStatus,
} from './smsTextbackSettings';

describe('sms text-back settings', () => {
  it('rejects a name over 20 or outside GSM-7 before texts can turn on', () => {
    expect(smsDisplayNameValid('Field Audit Co')).toBe(true);
    expect(smsDisplayNameValid('Twenty Character Nam')).toBe(true);
    expect(smsDisplayNameValid('Twenty Character Name')).toBe(false);
    expect(smsDisplayNameError('Twenty Character Name')).toBe(SMS_TEXTBACK_NAME_TOO_LONG);
    expect(smsDisplayNameError('Name—Dash')).toBe(SMS_TEXTBACK_NAME_NOT_GSM7);
    expect(smsDisplayNameError('Name😀')).toBe(SMS_TEXTBACK_NAME_NOT_GSM7);
    expect(smsTextbackEnableError('')).toBe(SMS_TEXTBACK_NAME_REQUIRED);
    expect(smsTextbackEnableError('Twenty Character Name')).toBe(SMS_TEXTBACK_NAME_TOO_LONG);
  });

  it('previews the ack template and one GSM-7 segment', () => {
    expect(smsAckPreview('Field Audit Co')).toBe(renderMissedCallAck('Field Audit Co'));
    expect(smsAckPreview('Field Audit Co')).toBe(
      'Hi, this is Field Audit Co. Sorry we missed your call. Reply with what you need done and your suburb and we will get back to you. Reply STOP to opt out.',
    );
    expect(smsAckPreviewSegments('Field Audit Co')).toBe(1);
    expect(smsAckSegmentLabel(1)).toBe('1 segment');
    expect(smsDisplayNameCount('Field Audit Co')).toBe('14/20');
    expect(smsDisplayNameCountOver('Field Audit Co')).toBe(false);
    expect(smsDisplayNameCountOver('Twenty Character Nam')).toBe(false);
    expect(smsDisplayNameCount('Twenty Character Name!')).toBe('22/20');
    expect(smsDisplayNameCountOver('Twenty Character Name!')).toBe(true);
    expect(smsAckPreviewBlocked('Twenty Character Name!')).toBe(true);
    expect(smsAckPreview('Twenty Character Name!')).toBe(SMS_TEXTBACK_PREVIEW_BLOCKED);
    expect(smsTextbackTestStatus(true)).toBe('Test mode on');
    expect(smsTextbackCapStatus({
      enabled: false,
      businessName: 'Field Audit Co',
      testMode: true,
      hourlyCap: 10,
      dailyCap: 20,
      monthlyCap: 300,
    })).toBe('Hourly 10 · Daily 20 · Monthly 300');
  });

  it('keeps live settings off and look seeds off the wire', () => {
    expect(ENQUIRY_SURFACE_LIVE).toBe(false);
    expect(shouldQueryLiveSmsTextback(null)).toBe(false);
    expect(shouldQueryLiveSmsTextback(SMS_SETTINGS_LOOK)).toBe(false);
    expect(lookSmsTextbackSettings(SMS_SETTINGS_LOOK)?.businessName).toBe('Field Audit Co');
    expect(lookSmsTextbackSettings(SMS_SETTINGS_INVALID_LOOK)?.businessName).toBe('Twenty Character Name!');
    expect(ALLOWED_ENQUIRY_PHONE).toBe('+61418893602');
  });
});

describe('sms text-back look kinds are DEV-only', () => {
  it('names ready and invalid looks', () => {
    expect(smsTextbackLookKind(SMS_SETTINGS_LOOK) === 'ready'
      || smsTextbackLookKind(SMS_SETTINGS_LOOK) === null).toBe(true);
    expect(smsTextbackLookKind('conversation')).toBe(null);
  });
});

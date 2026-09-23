import { describe, expect, it } from 'vitest';
import {
  emptyTwilioSenderSettings,
  twilioSenderSettingsFromRow,
  twilioSenderSettingsPayload,
  validateTwilioSenderSettings,
} from './twilioSenderSettings';

const valid = {
  phone_e164: '+61400111222',
  provider_account_sid: `AC${'a1'.repeat(16)}`,
  provider_sender_sid: `PN${'b2'.repeat(16)}`,
  active: true,
};

describe('Twilio sender settings', () => {
  it('accepts the provider identifiers and an E.164 number', () => {
    expect(validateTwilioSenderSettings(valid)).toBeNull();
  });

  it.each([
    [{ ...valid, phone_e164: '0400 111 222' }, 'E.164'],
    [{ ...valid, provider_account_sid: `SK${'a1'.repeat(16)}` }, 'Account SID'],
    [{ ...valid, provider_sender_sid: `MG${'b2'.repeat(16)}` }, 'Phone Number SID'],
  ])('rejects an invalid mapping', (settings, message) => {
    expect(validateTwilioSenderSettings(settings)).toContain(message);
  });

  it('trims fields and maps only to the current organisation', () => {
    expect(twilioSenderSettingsPayload('organisation-1', {
      ...valid,
      phone_e164: ` ${valid.phone_e164} `,
      provider_account_sid: ` ${valid.provider_account_sid} `,
      provider_sender_sid: ` ${valid.provider_sender_sid} `,
    })).toEqual({
      organisation_id: 'organisation-1',
      ...valid,
    });
  });

  it('keeps an inactive stored mapping inactive and defaults a missing row', () => {
    expect(twilioSenderSettingsFromRow({ ...valid, active: false }).active).toBe(false);
    expect(twilioSenderSettingsFromRow(null)).toEqual(emptyTwilioSenderSettings);
  });
});

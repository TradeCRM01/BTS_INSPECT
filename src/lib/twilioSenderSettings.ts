export interface TwilioSenderSettings {
  phone_e164: string;
  provider_account_sid: string;
  provider_sender_sid: string;
  active: boolean;
}

export const emptyTwilioSenderSettings: TwilioSenderSettings = {
  phone_e164: '',
  provider_account_sid: '',
  provider_sender_sid: '',
  active: true,
};

const E164 = /^\+[1-9]\d{7,14}$/;
const ACCOUNT_SID = /^AC[a-fA-F0-9]{32}$/;
const PHONE_NUMBER_SID = /^PN[a-fA-F0-9]{32}$/;

export function twilioSenderSettingsFromRow(row: Partial<TwilioSenderSettings> | null): TwilioSenderSettings {
  return {
    phone_e164: row?.phone_e164?.trim() ?? '',
    provider_account_sid: row?.provider_account_sid?.trim() ?? '',
    provider_sender_sid: row?.provider_sender_sid?.trim() ?? '',
    active: row?.active ?? true,
  };
}

export function validateTwilioSenderSettings(settings: TwilioSenderSettings): string | null {
  if (!E164.test(settings.phone_e164.trim())) {
    return 'Enter the Twilio number in E.164 format, for example +61400111222.';
  }
  if (!ACCOUNT_SID.test(settings.provider_account_sid.trim())) {
    return 'Account SID must start with AC followed by 32 hexadecimal characters.';
  }
  if (!PHONE_NUMBER_SID.test(settings.provider_sender_sid.trim())) {
    return 'Phone Number SID must start with PN followed by 32 hexadecimal characters.';
  }
  return null;
}

export function twilioSenderSettingsPayload(
  organisationId: string,
  settings: TwilioSenderSettings,
) {
  return {
    organisation_id: organisationId,
    phone_e164: settings.phone_e164.trim(),
    provider_account_sid: settings.provider_account_sid.trim(),
    provider_sender_sid: settings.provider_sender_sid.trim(),
    active: settings.active,
  };
}

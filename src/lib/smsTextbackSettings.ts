import { supabase } from './supabase';
import { ENQUIRY_SURFACE_LIVE } from './missedCallEnquiry';
import { gsm7Segments, isGsm7, renderMissedCallAck } from './missedCallSmsCopy';

export const SMS_SETTINGS_LOOK = 'sms-settings';
export const SMS_SETTINGS_INVALID_LOOK = 'sms-settings-invalid';

export const SMS_DISPLAY_NAME_MIN = 2;
export const SMS_DISPLAY_NAME_MAX = 20;

export const SMS_TEXTBACK_NAME_TOO_LONG = 'Name must be 20 characters or less.';
export const SMS_TEXTBACK_NAME_TOO_SHORT = 'Name must be at least 2 characters.';
export const SMS_TEXTBACK_NAME_NOT_GSM7 = 'Use GSM-7 characters only.';
export const SMS_TEXTBACK_NAME_REQUIRED = 'Add a valid SMS display name before turning texts on.';
export const SMS_TEXTBACK_PREVIEW_BLOCKED = 'Fix the name to preview';

export type SmsTextbackSettings = {
  enabled: boolean;
  businessName: string;
  testMode: boolean;
  hourlyCap: number;
  dailyCap: number;
  monthlyCap: number;
};

export const emptySmsTextbackSettings: SmsTextbackSettings = {
  enabled: false,
  businessName: '',
  testMode: true,
  hourlyCap: 10,
  dailyCap: 20,
  monthlyCap: 300,
};

export function smsTextbackLookKind(
  look: string | null | undefined,
): 'ready' | 'invalid' | null {
  if (!import.meta.env.DEV) return null;
  if (look === SMS_SETTINGS_LOOK) return 'ready';
  if (look === SMS_SETTINGS_INVALID_LOOK) return 'invalid';
  return null;
}

export function shouldQueryLiveSmsTextback(look?: string | null): boolean {
  if (smsTextbackLookKind(look)) return false;
  return ENQUIRY_SURFACE_LIVE;
}

export function smsDisplayNameValid(name: string): boolean {
  const trimmed = name.trim();
  return (
    trimmed.length >= SMS_DISPLAY_NAME_MIN
    && trimmed.length <= SMS_DISPLAY_NAME_MAX
    && isGsm7(trimmed)
  );
}

export function smsDisplayNameError(name: string): string | null {
  const trimmed = name.trim();
  if (!trimmed) return null;
  if (trimmed.length < SMS_DISPLAY_NAME_MIN) return SMS_TEXTBACK_NAME_TOO_SHORT;
  if (trimmed.length > SMS_DISPLAY_NAME_MAX) return SMS_TEXTBACK_NAME_TOO_LONG;
  if (!isGsm7(trimmed)) return SMS_TEXTBACK_NAME_NOT_GSM7;
  return null;
}

export function smsTextbackEnableError(name: string): string | null {
  if (smsDisplayNameValid(name)) return null;
  return smsDisplayNameError(name) ?? SMS_TEXTBACK_NAME_REQUIRED;
}

export function smsAckPreviewBlocked(name: string): boolean {
  return smsDisplayNameError(name) != null;
}

export function smsDisplayNameCount(name: string): string {
  return `${name.length}/${SMS_DISPLAY_NAME_MAX}`;
}

export function smsDisplayNameCountOver(name: string): boolean {
  return name.length > SMS_DISPLAY_NAME_MAX;
}

export function smsAckPreview(businessName: string): string {
  if (smsAckPreviewBlocked(businessName)) return SMS_TEXTBACK_PREVIEW_BLOCKED;
  return renderMissedCallAck(businessName.trim() || 'Your business');
}

export function smsAckPreviewSegments(businessName: string): number {
  return gsm7Segments(smsAckPreview(businessName));
}

export const SMS_TEXTBACK_NAME_HELP =
  'Up to 20 letters, numbers or simple punctuation (no emoji or curly quotes). Shown on every missed-call text.';

export function smsAckSegmentLabel(segments: number): string {
  return segments === 1 ? 'Fits in 1 text' : 'Too long for 1 text';
}

export function smsTextbackCapStatus(settings: SmsTextbackSettings): string {
  return `Limits: ${settings.hourlyCap} an hour · ${settings.dailyCap} a day · ${settings.monthlyCap} text parts a month`;
}

export function smsTextbackTestStatus(testMode: boolean): string {
  return testMode ? 'Test mode: texts only go to your test number' : 'Test mode off';
}

export function lookSmsTextbackSettings(
  look: string | null | undefined,
): SmsTextbackSettings | null {
  const kind = smsTextbackLookKind(look);
  if (!kind) return null;
  if (kind === 'invalid') {
    return {
      ...emptySmsTextbackSettings,
      businessName: 'Twenty Character Name!',
    };
  }
  return {
    ...emptySmsTextbackSettings,
    businessName: 'Field Audit Co',
  };
}

export function smsTextbackSettingsFromRow(row: {
  enabled?: boolean | null;
  business_name?: string | null;
  test_mode?: boolean | null;
  hourly_message_cap?: number | null;
  daily_message_cap?: number | null;
  monthly_message_cap?: number | null;
} | null): SmsTextbackSettings {
  return {
    enabled: row?.enabled === true,
    businessName: row?.business_name?.trim() ?? '',
    testMode: row?.test_mode !== false,
    hourlyCap: row?.hourly_message_cap ?? 10,
    dailyCap: row?.daily_message_cap ?? 20,
    monthlyCap: row?.monthly_message_cap ?? 300,
  };
}

export async function saveSmsTextbackSettings(input: {
  enabled: boolean;
  businessName: string;
}): Promise<{ settings: SmsTextbackSettings | null; error: string | null }> {
  const enableError = input.enabled ? smsTextbackEnableError(input.businessName) : smsDisplayNameError(input.businessName);
  if (enableError) return { settings: null, error: enableError };
  const { data, error } = await supabase.rpc('save_sms_textback_settings', {
    p_enabled: input.enabled,
    p_business_name: input.businessName.trim(),
  });
  if (error) {
    if (error.code === '42501') return { settings: null, error: 'Only an admin can change text-back settings.' };
    if (error.code === '23514') {
      return { settings: null, error: smsTextbackEnableError(input.businessName) ?? SMS_TEXTBACK_NAME_REQUIRED };
    }
    return { settings: null, error: 'Could not save text-back settings.' };
  }
  const row = Array.isArray(data) ? data[0] : data;
  return { settings: smsTextbackSettingsFromRow(row), error: null };
}

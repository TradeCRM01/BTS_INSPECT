import { supabase } from './supabase';
import { ENQUIRY_SURFACE_LIVE } from './missedCallEnquiry';
import {
  gsm7Length,
  gsm7Segments,
  isGsm7,
  renderEnquiryThanks,
  renderMissedCallAck,
  renderMissedCallHelp,
  SMS_REPLY_BUSINESS_TOKEN,
  SMS_REPLY_FORBIDDEN,
} from './missedCallSmsCopy';
import { smsTextbackLookKind } from './smsTextbackSettings';

export const SMS_REPLIES_LOOK = 'sms-settings';
export const SMS_DISPLAY_NAME_MAX = 20;
export const SMS_REPLY_MAX_LENGTH = 160;

export const SMS_REPLY_KINDS = ['ack', 'thanks', 'help'] as const;
export type SmsReplyKind = (typeof SMS_REPLY_KINDS)[number];

export const SMS_REPLY_LABEL: Record<SmsReplyKind, string> = {
  ack: 'Missed-call reply',
  thanks: 'Thanks',
  help: 'HELP',
};

export const SMS_REPLY_MISSING_BUSINESS = 'Add {Business} or the business name.';
export const SMS_REPLY_MISSING_STOP = 'Keep “Reply STOP to opt out” on the text.';
export const SMS_REPLY_NOT_GSM7 = 'Use letters, numbers or simple punctuation only.';
export const SMS_REPLY_TOO_LONG = 'Too long for 1 text';
export const SMS_REPLY_FORBIDDEN_WORD = 'Remove booked, quote, price, today and the other blocked words.';
export const SMS_REPLY_NO_CONTACT = 'No links or phone numbers';
export const SMS_REPLY_FITS = 'Fits in 1 text';
export const SMS_REPLY_CANT_SEND = "Can't send this text";

export const SMS_REPLY_STOP_END: Record<SmsReplyKind, RegExp> = {
  ack: /Reply STOP to opt out\.?\s*$/,
  thanks: /Reply STOP to opt out\.?\s*$/,
  help: /Reply STOP to opt out, START to opt back in\.\s*$/,
};

export const SMS_REPLY_LINK_OR_PHONE =
  /https?:\/\/|\bwww\.|[a-z0-9][a-z0-9-]*\.[a-z]{2,}|\d{6,}/i;

export type SmsReplyTemplates = {
  ack: string;
  thanks: string;
  help: string;
};

export const SMS_REPLY_DEFAULT_TEMPLATES: SmsReplyTemplates = {
  ack: `Hi, this is ${SMS_REPLY_BUSINESS_TOKEN}. Sorry we missed your call. Reply with what you need done and your suburb and we will get back to you. Reply STOP to opt out.`,
  thanks: `Thanks, got it. We have passed this to the office and someone from ${SMS_REPLY_BUSINESS_TOKEN} will be in touch. Reply STOP to opt out.`,
  help: `${SMS_REPLY_BUSINESS_TOKEN}: reply with the job and your suburb and the office will get back to you. Reply STOP to opt out, START to opt back in.`,
};

export function defaultSmsReplyTemplate(kind: SmsReplyKind): string {
  return SMS_REPLY_DEFAULT_TEMPLATES[kind];
}

export function approvedSmsReplyBody(kind: SmsReplyKind, businessName: string): string {
  if (kind === 'thanks') return renderEnquiryThanks(businessName);
  if (kind === 'help') return renderMissedCallHelp(businessName);
  return renderMissedCallAck(businessName);
}

export function renderSmsReplyTemplate(template: string, businessName: string): string {
  return template.split(SMS_REPLY_BUSINESS_TOKEN).join(businessName);
}

export function smsReplyProbeName(businessName: string): string {
  const trimmed = businessName.trim();
  if (trimmed.length >= SMS_DISPLAY_NAME_MAX) return trimmed.slice(0, SMS_DISPLAY_NAME_MAX);
  if (trimmed.length >= 2) return trimmed.padEnd(SMS_DISPLAY_NAME_MAX, 'X');
  return 'XXXXXXXXXXXXXXXXXXXX';
}

export function smsReplyHasForbiddenWord(body: string): boolean {
  return SMS_REPLY_FORBIDDEN.test(body);
}

export function smsReplyHasLinkOrPhone(body: string): boolean {
  return SMS_REPLY_LINK_OR_PHONE.test(body);
}

export function smsReplyEndsWithStop(template: string, kind: SmsReplyKind): boolean {
  return SMS_REPLY_STOP_END[kind].test(template);
}

export function smsReplyTemplateError(
  template: string,
  businessName: string,
  kind: SmsReplyKind,
): string | null {
  const name = businessName.trim();
  const probe = smsReplyProbeName(name);
  const rendered = renderSmsReplyTemplate(template, probe);
  const hasToken = template.includes(SMS_REPLY_BUSINESS_TOKEN);
  const hasName = Boolean(name) && (rendered.includes(name) || template.includes(name));
  if (!hasToken && !hasName) return SMS_REPLY_MISSING_BUSINESS;
  if (!smsReplyEndsWithStop(template, kind)) return SMS_REPLY_MISSING_STOP;
  if (!isGsm7(rendered)) return SMS_REPLY_NOT_GSM7;
  if (gsm7Length(rendered) > SMS_REPLY_MAX_LENGTH) return SMS_REPLY_TOO_LONG;
  if (smsReplyHasForbiddenWord(rendered)) return SMS_REPLY_FORBIDDEN_WORD;
  if (smsReplyHasLinkOrPhone(template) || smsReplyHasLinkOrPhone(rendered)) {
    return SMS_REPLY_NO_CONTACT;
  }
  return null;
}

export function smsReplyNamedError(kind: SmsReplyKind, error: string): string {
  return `${SMS_REPLY_LABEL[kind]}: ${error}`;
}

export function smsReplyFieldError(
  template: string,
  businessName: string,
  kind: SmsReplyKind,
): string | null {
  const error = smsReplyTemplateError(template, businessName, kind);
  return error ? smsReplyNamedError(kind, error) : null;
}

export function smsReplyPreview(template: string, businessName: string): string {
  return renderSmsReplyTemplate(template, businessName.trim() || 'Your business');
}

export function smsReplyFitLabel(template: string, businessName: string): string {
  const rendered = renderSmsReplyTemplate(template, smsReplyProbeName(businessName));
  return gsm7Segments(rendered) === 1 ? SMS_REPLY_FITS : SMS_REPLY_TOO_LONG;
}

export function smsReplyTemplatesFromRow(row: {
  ack_template?: string | null;
  thanks_template?: string | null;
  help_template?: string | null;
} | null): SmsReplyTemplates {
  return {
    ack: row?.ack_template?.trim() || SMS_REPLY_DEFAULT_TEMPLATES.ack,
    thanks: row?.thanks_template?.trim() || SMS_REPLY_DEFAULT_TEMPLATES.thanks,
    help: row?.help_template?.trim() || SMS_REPLY_DEFAULT_TEMPLATES.help,
  };
}

export function lookSmsReplyTemplates(
  look: string | null | undefined,
): SmsReplyTemplates | null {
  if (!smsTextbackLookKind(look)) return null;
  return { ...SMS_REPLY_DEFAULT_TEMPLATES };
}

export function shouldQueryLiveSmsReplies(look?: string | null): boolean {
  if (smsTextbackLookKind(look)) return false;
  return ENQUIRY_SURFACE_LIVE;
}

export function storedSmsReplyTemplate(template: string, kind: SmsReplyKind): string | null {
  const trimmed = template.trim();
  if (!trimmed || trimmed === SMS_REPLY_DEFAULT_TEMPLATES[kind]) return null;
  return trimmed;
}

export function smsTextbackMemberStatus(enabled: boolean): string {
  return `Missed-call texts are ${enabled ? 'on' : 'off'} · ask an admin to change`;
}

export function smsReplyKindFromNamedError(message: string): SmsReplyKind | null {
  for (const kind of SMS_REPLY_KINDS) {
    if (message.startsWith(`${SMS_REPLY_LABEL[kind]}:`)) return kind;
  }
  return null;
}

function smsReplyKindFromRpcMessage(message: string): SmsReplyKind {
  if (message.includes('thanks')) return 'thanks';
  if (message.includes('help')) return 'help';
  return 'ack';
}

export async function saveSmsReplyTemplates(input: {
  ack: string;
  thanks: string;
  help: string;
  businessName: string;
}): Promise<{ templates: SmsReplyTemplates | null; error: string | null }> {
  for (const kind of SMS_REPLY_KINDS) {
    const error = smsReplyFieldError(input[kind], input.businessName, kind);
    if (error) return { templates: null, error };
  }
  const { data, error } = await supabase.rpc('save_sms_reply_templates', {
    p_ack_template: storedSmsReplyTemplate(input.ack, 'ack'),
    p_thanks_template: storedSmsReplyTemplate(input.thanks, 'thanks'),
    p_help_template: storedSmsReplyTemplate(input.help, 'help'),
  });
  if (error) {
    if (error.code === '42501') return { templates: null, error: 'Only an admin can change text replies.' };
    if (error.code === '23514') {
      const kind = smsReplyKindFromRpcMessage(error.message);
      return { templates: null, error: smsReplyNamedError(kind, SMS_REPLY_MISSING_STOP) };
    }
    return { templates: null, error: 'Could not save text replies.' };
  }
  const row = Array.isArray(data) ? data[0] : data;
  return { templates: smsReplyTemplatesFromRow(row), error: null };
}

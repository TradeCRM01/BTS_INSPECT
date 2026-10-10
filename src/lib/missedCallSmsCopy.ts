export const ACK_TEMPLATE_VERSION = 'ack-v1';
export const THANKS_TEMPLATE_VERSION = 'thanks-v1';
export const HELP_TEMPLATE_VERSION = 'help-v1';

export const SMS_REPLY_BUSINESS_TOKEN = '{Business}';
export const SMS_REPLY_STOP_SUFFIX = 'Reply STOP to opt out';
export const SMS_REPLY_FORBIDDEN =
  /\b(booked|quote|plumber|electrician|carpenter|tomorrow|today|\$|price|hourly)\b/i;

const GSM7_BASIC =
  '@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%&\'()*+,-./0123456789:;<=>?'
  + '¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà';
const GSM7_EXTENDED = new Set(['\f', '^', '{', '}', '\\', '[', '~', ']', '|', '€']);

export function isGsm7(text: string): boolean {
  for (const char of text) {
    if (GSM7_BASIC.includes(char) || GSM7_EXTENDED.has(char)) continue;
    return false;
  }
  return true;
}

export function gsm7Length(text: string): number {
  let length = 0;
  for (const char of text) {
    length += GSM7_EXTENDED.has(char) ? 2 : 1;
  }
  return length;
}

export function gsm7Segments(text: string): number {
  const length = gsm7Length(text);
  if (length <= 160) return 1;
  return Math.ceil(length / 153);
}

export function renderMissedCallAck(businessName: string): string {
  return `Hi, this is ${businessName}. Sorry we missed your call. Reply with what you need done and your suburb and we will get back to you. Reply STOP to opt out.`;
}

export function renderEnquiryThanks(businessName: string): string {
  return `Thanks, got it. We have passed this to the office and someone from ${businessName} will be in touch. Reply STOP to opt out.`;
}

export function renderMissedCallHelp(businessName: string): string {
  return `${businessName}: reply with the job and your suburb and the office will get back to you. Reply STOP to opt out, START to opt back in.`;
}

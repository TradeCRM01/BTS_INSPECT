import { supabase } from './supabase';
import {
  ALLOWED_ENQUIRY_PHONE,
  ENQUIRY_SURFACE_LIVE,
  formatAuMobileDisplay,
} from './missedCallEnquiry';
import { formatEnquiryTime } from './tenantTimeZone';
import { renderEnquiryThanks, renderMissedCallAck, renderMissedCallHelp } from './missedCallSmsCopy';

export const CONVERSATION_LOOK = 'conversation';
export const CONVERSATION_EMPTY_LOOK = 'conversation-empty';

export const SMS_DIRECTIONS = ['inbound', 'outbound'] as const;
export type SmsDirection = (typeof SMS_DIRECTIONS)[number];

export const SMS_STATES = ['received', 'queued', 'claimed', 'sent', 'failed', 'cancelled'] as const;
export type SmsState = (typeof SMS_STATES)[number];

export const SMS_STATE_LABELS: Record<SmsState, string> = {
  received: 'Received',
  queued: 'Queued',
  claimed: 'Sending',
  sent: 'Sent',
  failed: 'Failed',
  cancelled: 'Cancelled',
};

export type ConversationMessage = {
  id: string;
  direction: SmsDirection;
  state: SmsState;
  body: string;
  at: string;
};

export function conversationLookKind(
  look: string | null | undefined,
): 'thread' | 'empty' | null {
  if (!import.meta.env.DEV) return null;
  if (look === CONVERSATION_LOOK) return 'thread';
  if (look === CONVERSATION_EMPTY_LOOK) return 'empty';
  return null;
}

export function shouldQueryLiveConversation(look?: string | null): boolean {
  if (conversationLookKind(look)) return false;
  return ENQUIRY_SURFACE_LIVE;
}

export function conversationVisible(
  messages: ConversationMessage[] | null | undefined,
): boolean {
  return (messages?.length ?? 0) > 0;
}

export function enquiryPhoneE164(phone: string | null | undefined): string | null {
  const digits = (phone ?? '').replace(/\D/g, '');
  if (digits.startsWith('61') && digits.length === 11) return `+${digits}`;
  if (digits.startsWith('04') && digits.length === 10) return `+61${digits.slice(1)}`;
  return null;
}

export function conversationPhonesMatch(
  left: string | null | undefined,
  right: string | null | undefined,
): boolean {
  const a = enquiryPhoneE164(left);
  const b = enquiryPhoneE164(right);
  return Boolean(a && b && a === b);
}

export function conversationMessageTime(
  at: string,
  timeZone?: string | null,
): string {
  return formatEnquiryTime(at, timeZone);
}

export function conversationDirectionLabel(direction: SmsDirection): string {
  return direction === 'inbound' ? 'Customer' : 'Auto text';
}

export function conversationStateLabel(state: SmsState): string {
  return SMS_STATE_LABELS[state];
}

export function mapConversationMessages(
  rows: Array<{
    id: string;
    direction: string;
    state: string;
    body: string | null;
    received_at?: string | null;
    sent_at?: string | null;
    created_at: string;
  }>,
): ConversationMessage[] {
  return rows
    .filter((row): row is typeof row & { direction: SmsDirection; state: SmsState } => (
      SMS_DIRECTIONS.includes(row.direction as SmsDirection)
      && SMS_STATES.includes(row.state as SmsState)
    ))
    .map((row) => ({
      id: row.id,
      direction: row.direction,
      state: row.state,
      body: (row.body ?? '').trim(),
      at: row.received_at || row.sent_at || row.created_at,
    }))
    .sort((left, right) => left.at.localeCompare(right.at));
}

export function lookConversationMessages(): ConversationMessage[] {
  return [
    {
      id: 'look-sms-ack',
      direction: 'outbound',
      state: 'sent',
      body: renderMissedCallAck('Field Audit Co'),
      at: '2026-10-09T22:16:00.000Z',
    },
    {
      id: 'look-sms-in',
      direction: 'inbound',
      state: 'received',
      body: 'Hot water is out, Paddington',
      at: '2026-10-09T22:18:00.000Z',
    },
    {
      id: 'look-sms-thanks',
      direction: 'outbound',
      state: 'sent',
      body: renderEnquiryThanks('Field Audit Co'),
      at: '2026-10-09T22:18:40.000Z',
    },
    {
      id: 'look-sms-failed',
      direction: 'outbound',
      state: 'failed',
      body: renderMissedCallHelp('Field Audit Co'),
      at: '2026-10-09T23:10:00.000Z',
    },
    {
      id: 'look-sms-cancelled',
      direction: 'outbound',
      state: 'cancelled',
      body: renderEnquiryThanks('Field Audit Co'),
      at: '2026-10-09T23:40:00.000Z',
    },
  ];
}

export function conversationMessagesForLook(
  look: string | null | undefined,
  callerPhone?: string | null,
): ConversationMessage[] | null {
  const kind = conversationLookKind(look);
  if (kind === 'empty') return [];
  if (kind !== 'thread') return null;
  if (!conversationPhonesMatch(callerPhone, ALLOWED_ENQUIRY_PHONE)) return [];
  return lookConversationMessages();
}

export function conversationLookClientPhone(
  look: string | null | undefined,
  storedPhone?: string | null,
): string | null | undefined {
  if (conversationLookKind(look) === 'thread') return conversationLookPhoneLabel();
  return storedPhone;
}

export async function loadConversationByCallerPhone(
  organisationId: string,
  callerPhone: string | null | undefined,
): Promise<ConversationMessage[]> {
  const phone = enquiryPhoneE164(callerPhone);
  if (!phone) return [];
  const { data: threads, error: threadError } = await supabase
    .from('missed_call_sms_threads')
    .select('id, caller_phone_e164')
    .eq('organisation_id', organisationId)
    .eq('caller_phone_e164', phone)
    .limit(1);
  if (threadError) throw threadError;
  if (!threads?.length) return [];
  return loadConversationMessages(organisationId, phone);
}

export async function loadConversationByApprovedJob(
  organisationId: string,
  jobId: string | null | undefined,
): Promise<ConversationMessage[]> {
  const id = jobId?.trim() ?? '';
  if (!id) return [];
  const { data: threads, error: threadError } = await supabase
    .from('missed_call_sms_threads')
    .select('id, caller_phone_e164, approved_job_id')
    .eq('organisation_id', organisationId)
    .eq('approved_job_id', id)
    .limit(1);
  if (threadError) throw threadError;
  const phone = threads?.[0]?.caller_phone_e164 ?? null;
  if (!phone) return [];
  return loadConversationMessages(organisationId, phone);
}

async function loadConversationMessages(
  organisationId: string,
  phone: string,
): Promise<ConversationMessage[]> {
  const { data, error } = await supabase
    .from('sms_messages')
    .select('id, direction, state, body, received_at, sent_at, created_at')
    .eq('organisation_id', organisationId)
    .or(`and(direction.eq.inbound,from_phone_e164.eq.${phone}),and(direction.eq.outbound,to_phone_e164.eq.${phone})`)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return mapConversationMessages(data ?? []);
}

export function conversationLookPhone(): string {
  return ALLOWED_ENQUIRY_PHONE;
}

export function conversationLookPhoneLabel(): string {
  return formatAuMobileDisplay(ALLOWED_ENQUIRY_PHONE) ?? ALLOWED_ENQUIRY_PHONE;
}

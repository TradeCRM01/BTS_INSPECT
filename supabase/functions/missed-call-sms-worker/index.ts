import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2.57.4';
import {
  handleTwilioSmsWorker,
  sendTwilioSms,
  type ClaimedSms,
} from '../_shared/twilioSmsWorker.ts';

const db = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  { auth: { persistSession: false, autoRefreshToken: false } },
);

function first(data: unknown): ClaimedSms | null {
  return Array.isArray(data) && data.length > 0 ? data[0] as ClaimedSms : null;
}

async function claim(): Promise<ClaimedSms | null> {
  const { data, error } = await db.rpc('claim_next_sms_message', {
    p_worker_id: Deno.env.get('MISSED_CALL_SMS_WORKER_ID')?.trim() || 'missed-call-sms-worker',
    p_lease_seconds: 60,
  });
  if (error) throw error;
  return first(data);
}

async function authorize(messageId: string, claimToken: string): Promise<ClaimedSms | null> {
  const { data, error } = await db.rpc('authorize_sms_dispatch', {
    p_message_id: messageId,
    p_claim_token: claimToken,
  });
  if (error) throw error;
  return first(data);
}

async function complete(
  messageId: string,
  claimToken: string,
  providerMessageSid: string,
): Promise<boolean> {
  const { data, error } = await db.rpc('complete_sms_dispatch', {
    p_message_id: messageId,
    p_claim_token: claimToken,
    p_provider_message_sid: providerMessageSid,
  });
  if (error) throw error;
  return data === true;
}

async function fail(messageId: string, claimToken: string, message: string): Promise<boolean> {
  const { data, error } = await db.rpc('fail_sms_dispatch', {
    p_message_id: messageId,
    p_claim_token: claimToken,
    p_error: message,
  });
  if (error) throw error;
  return data === true;
}

Deno.serve(async (request: Request) => {
  try {
    return await handleTwilioSmsWorker(request, {
      workerSecret: Deno.env.get('MISSED_CALL_SMS_WORKER_SECRET')?.trim() ?? '',
      authToken: Deno.env.get('TWILIO_AUTH_TOKEN')?.trim() ?? '',
      workerId: Deno.env.get('MISSED_CALL_SMS_WORKER_ID')?.trim() || 'missed-call-sms-worker',
      claim,
      authorize,
      complete,
      fail,
      send: sendTwilioSms,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown worker failure';
    console.error('missed-call-sms-worker', { message });
    return new Response(JSON.stringify({ ok: false, error: 'Worker failed' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});

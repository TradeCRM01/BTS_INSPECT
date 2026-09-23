import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2.57.4';
import {
  handleTwilioVoiceStatusWebhook,
  type TwilioVoiceIngestResult,
  type TwilioVoiceStatusRecord,
} from '../_shared/twilioVoiceStatus.ts';
import type { Database } from '../_shared/database.ts';

const db = createClient<Database>(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  { auth: { persistSession: false, autoRefreshToken: false } },
);

async function ingest(record: TwilioVoiceStatusRecord): Promise<TwilioVoiceIngestResult> {
  const { data, error } = await db.rpc('ingest_twilio_voice_status', {
    p_provider_account_sid: record.providerAccountSid,
    p_provider_call_sid: record.providerCallSid,
    p_from_phone_e164: record.fromPhoneE164,
    p_to_phone_e164: record.toPhoneE164,
    p_call_status: record.callStatus,
    p_direction: record.direction,
  });
  if (error) throw error;
  return data as TwilioVoiceIngestResult;
}

Deno.serve(async (request: Request) => {
  try {
    return await handleTwilioVoiceStatusWebhook(request, {
      authToken: Deno.env.get('TWILIO_AUTH_TOKEN')?.trim() ?? '',
      expectedAccountSid: Deno.env.get('TWILIO_ACCOUNT_SID')?.trim() ?? '',
      publicUrl: Deno.env.get('TWILIO_VOICE_STATUS_WEBHOOK_URL')?.trim() ?? '',
      ingest,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown webhook failure';
    console.error('twilio-voice-status', { message });
    return new Response(JSON.stringify({ ok: false, error: 'Webhook storage failed' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});

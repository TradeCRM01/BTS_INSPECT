import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2.57.4';
import {
  handleTwilioInboundWebhook,
  type TwilioInboundRecord,
  type TwilioIngestResult,
} from '../_shared/twilioInbound.ts';
import type { Database } from '../_shared/database.ts';

const db = createClient<Database>(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  { auth: { persistSession: false, autoRefreshToken: false } },
);

async function ingest(record: TwilioInboundRecord): Promise<TwilioIngestResult> {
  const { data, error } = await db.rpc('ingest_twilio_inbound_sms', {
    p_provider_account_sid: record.providerAccountSid,
    p_provider_message_sid: record.providerMessageSid,
    p_from_phone_e164: record.fromPhoneE164,
    p_to_phone_e164: record.toPhoneE164,
    p_body: record.body,
    p_is_stop: record.isStop,
    p_reply_kind: record.reply.kind,
    p_booking_date: record.reply.kind === 'confirmed_slot' ? record.reply.date : null,
    p_booking_time: record.reply.kind === 'confirmed_slot' ? record.reply.time : null,
  });
  if (error) throw error;
  return data as TwilioIngestResult;
}

Deno.serve(async (request: Request) => {
  try {
    return await handleTwilioInboundWebhook(request, {
      authToken: Deno.env.get('TWILIO_AUTH_TOKEN')?.trim() ?? '',
      expectedAccountSid: Deno.env.get('TWILIO_ACCOUNT_SID')?.trim() ?? '',
      publicUrl: Deno.env.get('TWILIO_WEBHOOK_URL')?.trim() ?? '',
      ingest,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown webhook failure';
    console.error('twilio-inbound', { message });
    return new Response(JSON.stringify({ ok: false, error: 'Webhook storage failed' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});

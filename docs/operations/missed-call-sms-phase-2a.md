# Missed-call SMS Phase 2A operations

Phase 2A records Twilio voice status callbacks and queues one approved text-back
for an inbound `busy`, `canceled`, `failed`, or `no-answer` call. The caller must
already have a company-scoped `consented` preference. An unknown or opted-out
preference creates no outbound message. The worker checks consent again
immediately before sending.

## Webhook URLs

Deploy both functions:

```sh
npx supabase functions deploy twilio-voice-status
npx supabase functions deploy missed-call-sms-worker
```

Set these Edge Function secrets:

```sh
npx supabase secrets set \
  TWILIO_ACCOUNT_SID='AC…' \
  TWILIO_AUTH_TOKEN='…' \
  TWILIO_VOICE_STATUS_WEBHOOK_URL='https://PROJECT_REF.supabase.co/functions/v1/twilio-voice-status' \
  MISSED_CALL_SMS_WORKER_SECRET='A_LONG_RANDOM_SECRET'
```

In Twilio, leave the number's existing voice handler unchanged. Set its voice
status callback to:

```text
POST https://PROJECT_REF.supabase.co/functions/v1/twilio-voice-status
```

The configured URL and `TWILIO_VOICE_STATUS_WEBHOOK_URL` must match
byte-for-byte because Twilio signs that public URL.

Invoke the worker from a trusted scheduler:

```text
POST https://PROJECT_REF.supabase.co/functions/v1/missed-call-sms-worker
Authorization: Bearer A_LONG_RANDOM_SECRET
```

Invoke it repeatedly to drain the outbox. Each request claims at most one row.
The worker stores Twilio's Message SID on `sms_messages.provider_message_sid`.
Do not put the worker secret or Twilio auth token in a `VITE_*` variable.

## Checks

Confirm a callback produced one call and no more than one outbound row:

```sql
select c.provider_call_sid, c.call_status, c.outbound_message_id,
       m.state, m.provider_message_sid
from public.missed_calls c
left join public.sms_messages m on m.id = c.outbound_message_id
where c.provider_call_sid = 'CA…';
```

Send `STOP` to the company number before exercising the worker. The queued row
must become `cancelled`, and the worker must not make a provider request.

# Run missed-call reply booking

Phase 2B accepts replies to a missed-call text thread. The automatic booking
syntax is `BOOK YYYY-MM-DD HH:MM`. Every other reply goes to
`missed_call_office_reviews`. `STOP` also opts the caller out and cancels queued
messages before a worker can send them.

## Configure the reply webhook

Deploy the updated inbound function:

```sh
npx supabase functions deploy twilio-inbound
```

Keep the Twilio number's incoming message webhook set to:

```text
POST https://PROJECT_REF.supabase.co/functions/v1/twilio-inbound
```

Set `TWILIO_WEBHOOK_URL` to that exact URL. Twilio includes the URL in its
signature.

## Run the booking worker

Deploy the worker and set a secret that differs from the SMS sender secret:

```sh
npx supabase functions deploy missed-call-booking-worker
npx supabase secrets set MISSED_CALL_BOOKING_WORKER_SECRET='A_LONG_RANDOM_SECRET'
```

Call the worker from a trusted scheduler:

```text
POST https://PROJECT_REF.supabase.co/functions/v1/missed-call-booking-worker
Authorization: Bearer A_LONG_RANDOM_SECRET
```

Each request processes at most one booking command. The database transaction
creates the job, records `created_via = 'missed_call_sms'`, and queues one
confirmation through the existing SMS dispatcher. Run
`missed-call-sms-worker` to send that confirmation.

The worker sends no confirmation if consent changed, the caller sent `STOP`,
the client is not an exact company-scoped phone match, or the slot conflicts
with an active job. Inspect those cases in `missed_call_office_reviews`.

# Missed-call SMS go-live

This runbook joins the existing Phase 1, 2A, 2B, and 2C operations into one
production path. It provisions a sender mapping and deploys the existing
functions; it does not change the qualification ladder or booking rules.

## 1. Server-side secrets

Set the names read by the deployed functions:

```sh
npx supabase secrets set \
  TWILIO_ACCOUNT_SID='AC…' \
  TWILIO_AUTH_TOKEN='…' \
  TWILIO_WEBHOOK_URL='https://fbtmwpkfyjxamxqjxiaq.supabase.co/functions/v1/twilio-inbound' \
  TWILIO_VOICE_STATUS_WEBHOOK_URL='https://fbtmwpkfyjxamxqjxiaq.supabase.co/functions/v1/twilio-voice-status' \
  MISSED_CALL_SMS_WORKER_SECRET='SMS_WORKER_RANDOM_SECRET' \
  MISSED_CALL_BOOKING_WORKER_SECRET='BOOKING_WORKER_DIFFERENT_RANDOM_SECRET'
```

`MISSED_CALL_SMS_WORKER_ID` and `MISSED_CALL_BOOKING_WORKER_ID` are optional
stable scheduler labels. Their defaults are `missed-call-sms-worker` and
`missed-call-booking-worker`.

Supabase supplies `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` to Edge
Functions. Keep `TWILIO_AUTH_TOKEN`, both worker secrets, and the service-role
key server-side. Never create a `VITE_*` variable for them. Never print tokens,
Authorization headers, request signatures, message bodies, or phone numbers in
application, scheduler, or smoke-test logs.

The sender form stores identifiers only: an `AC…` Account SID and a `PN…`
Incoming Phone Number SID. It does not store the Twilio auth token and makes no
Twilio request from the browser.

## 2. Deploy and configure Twilio callbacks

Deploy the four existing functions:

```sh
npx supabase functions deploy twilio-inbound
npx supabase functions deploy twilio-voice-status
npx supabase functions deploy missed-call-sms-worker
npx supabase functions deploy missed-call-booking-worker
```

On the SMS-capable Twilio number, configure:

| Twilio setting | Method | Exact callback |
| --- | --- | --- |
| Incoming message webhook | `POST` | `https://fbtmwpkfyjxamxqjxiaq.supabase.co/functions/v1/twilio-inbound` |
| Voice status callback | `POST` | `https://fbtmwpkfyjxamxqjxiaq.supabase.co/functions/v1/twilio-voice-status` |

Leave the number's existing voice handler unchanged. The incoming-message URL
must match `TWILIO_WEBHOOK_URL` byte-for-byte, and the status callback must
match `TWILIO_VOICE_STATUS_WEBHOOK_URL` byte-for-byte, including any query
string. Twilio signs those public URLs.

## 3. Map the sender to the current organisation

An admin can open **Settings → Company → Missed-call text-back**, choose
**Configure**, and enter:

- the Twilio number in E.164 format;
- the `AC…` Account SID;
- the `PN…` Phone Number SID; and
- whether the mapping is active.

The form writes only the signed-in admin's current organisation. For an
operator using an administrative SQL connection, the equivalent write is:

```sql
insert into public.organisation_twilio_senders (
  organisation_id,
  phone_e164,
  provider_account_sid,
  provider_sender_sid,
  active
)
values (
  'ORGANISATION_UUID',
  '+61XXXXXXXXX',
  'AC…',
  'PN…',
  true
);
```

The live sender table is `organisation_twilio_senders`, and its tenant key is
`organisation_id`. Do not copy the earlier Phase 1 draft's
`company_twilio_senders` SQL into production. To retire a number without
deleting history:

```sql
update public.organisation_twilio_senders
set active = false, updated_at = now()
where organisation_id = 'ORGANISATION_UUID'
  and provider_sender_sid = 'PN…';
```

## 4. Schedule the two queue workers

Use one trusted scheduler and two jobs. A practical starting pattern is once
per minute for each endpoint:

```text
* * * * *  POST https://fbtmwpkfyjxamxqjxiaq.supabase.co/functions/v1/missed-call-sms-worker
             Authorization: Bearer SMS_WORKER_RANDOM_SECRET

* * * * *  POST https://fbtmwpkfyjxamxqjxiaq.supabase.co/functions/v1/missed-call-booking-worker
             Authorization: Bearer BOOKING_WORKER_DIFFERENT_RANDOM_SECRET
```

Keep the secrets different. Each invocation processes at most one item, so a
backlog needs repeated invocations; do not make concurrent retries for the same
job merely to increase throughput. Configure the scheduler to suppress request
headers and bodies from logs. A `2xx` response completes that tick; retry
transport errors and `5xx` responses on the next tick, not with an unbounded
immediate loop.

The SMS worker sends queued text-backs and booking confirmations. The booking
worker processes qualified `BOOK YYYY-MM-DD HH:MM` commands. Both are existing
Phase 2 workers—do not add another cron stack.

## 5. Smoke the real path

Use a dedicated test caller whose express SMS consent is already recorded for
this organisation. Do not manufacture consent for a real customer merely to
run the smoke.

1. In Company Settings, save the active sender mapping, reload the page, and
   confirm the same E.164 number and active state are shown.
2. Call the mapped Twilio number and let the call reach `no-answer` (or use one
   of the existing eligible statuses: `busy`, `canceled`, or `failed`).
3. Confirm one missed-call row links to no more than one outbound SMS row.
4. Let the SMS scheduler tick until the outbound row is `sent`; confirm the
   test phone receives one text-back.
5. Reply `HELP`; confirm the reply is recorded and one help response is sent.
6. Reply through the four qualification prompts. Confirm a `Qualified
   missed-call enquiry` appears on the existing reminders path.
7. Reply `BOOK YYYY-MM-DD HH:MM` with a valid future slot, let the booking
   worker and then the SMS worker tick, and confirm the existing client gets
   one booked job plus one confirmation.
8. Complete the `STOP` check with a separate consented test caller. Confirm the
   preference is `opted_out` and no queued or claimed message remains
   sendable. Do not continue that caller through qualification or booking
   unless a valid prior consent basis permits the existing `START` flow.

## 6. Row checks

Run these through a protected SQL console. Replace IDs and provider SIDs; do
not paste result sets into public tickets or logs.

Sender mapping:

```sql
select organisation_id, phone_e164, provider_account_sid,
       provider_sender_sid, active, updated_at
from public.organisation_twilio_senders
where organisation_id = 'ORGANISATION_UUID';
```

Voice callback and single outbound:

```sql
select c.organisation_id, c.provider_call_sid, c.call_status,
       c.outbound_message_id, m.state, m.attempts,
       m.provider_message_sid, m.last_error
from public.missed_calls c
left join public.sms_messages m on m.id = c.outbound_message_id
where c.provider_call_sid = 'CA…';
```

Queue health:

```sql
select organisation_id, state, count(*) as messages,
       min(coalesce(next_attempt, created_at)) as oldest_due
from public.sms_messages
where direction = 'outbound'
  and state in ('queued', 'claimed', 'failed')
group by organisation_id, state
order by oldest_due;
```

Inbound reply, qualification, and office handoff:

```sql
select t.organisation_id, t.state, t.qualification_step, t.booked_job_id,
       t.updated_at,
       r.reason, r.created_at as review_created_at
from public.missed_call_sms_threads t
left join public.missed_call_office_reviews r on r.thread_id = t.id
where t.organisation_id = 'ORGANISATION_UUID'
order by t.updated_at desc
limit 10;
```

STOP enforcement:

```sql
select p.organisation_id, p.sms_consent_status, p.consent_basis,
       p.opted_out_at, count(m.id) filter (
         where m.direction = 'outbound'
           and m.state in ('queued', 'claimed')
       ) as still_pending
from public.communication_preferences p
left join public.sms_messages m
  on m.organisation_id = p.organisation_id
 and m.to_phone_e164 = p.phone_e164
where p.organisation_id = 'ORGANISATION_UUID'
  and p.phone_e164 = '+61TESTCALLER'
group by p.organisation_id, p.sms_consent_status, p.consent_basis,
         p.opted_out_at;
```

Expected after `STOP`: `sms_consent_status = 'opted_out'` and
`still_pending = 0`.

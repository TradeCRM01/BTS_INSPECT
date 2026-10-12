# PR-J step 2 — Edge secrets (Coach SIGN)

Docs only. Do not create secrets from this PR. Do not print or paste values
into chat, logs, or PRs. Names only.

Source: `supabase/functions` on `origin/main` at
`796f3b71f6feece170837c6bdd2187103003b40b` (#369). Every `Deno.env.get(...)`
on the missed-call SMS path is listed below with `file:line`.

**Method:** Jack or Coach runs a reviewed `supabase secrets set NAME=...` on
project `ezszahvwwmbuekpedumf`. One SIGN, then the set. Values never logged.
Verify afterwards with `supabase secrets list` (names only). Whether a name is
already set in prod is **unknown** until that list is read.

Auto-booking stays off. Do **not** set `MISSED_CALL_BOOKING_WORKER_SECRET`.
Do **not** set `MISSED_CALL_BOOKING_WORKER_ID`.

`TWILIO_FROM_NUMBER` is not on this path. Do not set it to `+61485064111`.
There is no Messaging Service SID env and no Messaging Service on the number.

Never `VITE_*`.

## Platform-supplied (do not `secrets set`)

Supabase injects these into every Edge Function. Do not put them in
`supabase secrets set`.

| Name | Read at | Purpose |
| --- | --- | --- |
| `SUPABASE_URL` | `twilio-inbound/index.ts:11`, `twilio-voice-status/index.ts:11`, `missed-call-sms-worker/index.ts:11` | Service client URL |
| `SUPABASE_SERVICE_ROLE_KEY` | `twilio-inbound/index.ts:12`, `twilio-voice-status/index.ts:12`, `missed-call-sms-worker/index.ts:12` | Service client key |

## Set these names

| Name | Function(s) | `Deno.env.get` | Purpose | Value comes from | Already in prod |
| --- | --- | --- | --- | --- | --- |
| `TWILIO_AUTH_TOKEN` | `twilio-inbound`, `twilio-voice-status`, `missed-call-sms-worker` | `twilio-inbound/index.ts:35`, `twilio-voice-status/index.ts:32`, `missed-call-sms-worker/index.ts:66` | Validate Twilio request signatures; Basic auth when the SMS worker POSTs `Messages.json` | Twilio console (Account → Auth token) | unknown — `supabase secrets list` (names only) |
| `TWILIO_ACCOUNT_SID` | `twilio-inbound`, `twilio-voice-status` | `twilio-inbound/index.ts:36`, `twilio-voice-status/index.ts:33` | Expected Account SID on inbound and voice-status webhooks | Twilio console (`AC…`) | unknown — `supabase secrets list` (names only) |
| `TWILIO_WEBHOOK_URL` | `twilio-inbound` | `twilio-inbound/index.ts:37` | Public URL Twilio signed; must match the messaging webhook byte-for-byte | Twilio console messaging webhook = `https://ezszahvwwmbuekpedumf.supabase.co/functions/v1/twilio-inbound` | unknown — `supabase secrets list` (names only) |
| `TWILIO_VOICE_STATUS_WEBHOOK_URL` | `twilio-voice-status` | `twilio-voice-status/index.ts:34` | Public URL Twilio signed; must match the voice-status callback byte-for-byte | Twilio console voice status callback = `https://ezszahvwwmbuekpedumf.supabase.co/functions/v1/twilio-voice-status` | unknown — `supabase secrets list` (names only) |
| `MISSED_CALL_SMS_WORKER_SECRET` | `missed-call-sms-worker` | `missed-call-sms-worker/index.ts:65` | Bearer that authorizes the sms-tick Worker POST | Generated random **32+ bytes**. **Same value** as the Cloudflare Worker binding `MISSED_CALL_SMS_WORKER_SECRET` on `grafter-missed-call-sms-tick` (step 3). Do not log it. | unknown — `supabase secrets list` (names only) |

### Optional

| Name | Function | `Deno.env.get` | Purpose | Value comes from | Already in prod |
| --- | --- | --- | --- | --- | --- |
| `MISSED_CALL_SMS_WORKER_ID` | `missed-call-sms-worker` | `missed-call-sms-worker/index.ts:22` and `:67` | Claim `p_worker_id` / worker label. Default if unset: `missed-call-sms-worker` | Optional stable label. Skip unless Coach wants a non-default id | unknown — `supabase secrets list` (names only) |

## Do not set

| Name | Why |
| --- | --- |
| `MISSED_CALL_BOOKING_WORKER_SECRET` | Auto-booking stays off. Booking-tick stays undeployed. Read only by `missed-call-booking-worker/index.ts:29`, which is out of this go-live. |
| `MISSED_CALL_BOOKING_WORKER_ID` | Same. Read at `missed-call-booking-worker/index.ts:15`. |
| `TWILIO_FROM_NUMBER` | Not read by `twilio-inbound`, `twilio-voice-status`, or `missed-call-sms-worker`. The SMS worker sends `From` from the claimed row (`from_phone_e164` on the sender). `job-reminder` reads this name; that is a different path. Never set it to `+61485064111` for this go-live. |
| `TWILIO_PHONE_NUMBER` | Same as above. Not on the missed-call SMS path. |
| Any Messaging Service SID (`MG…`) | No `Deno.env.get` for a Messaging Service. Number SID `PNb67e96dc23fa486ead392be6c92075a3` only. |

`sendTwilioSms` (`_shared/twilioSmsWorker.ts:47-51`) POSTs `To` / `From` /
`Body` only. No Messaging Service field.

## Reviewed set (Jack or Coach)

After Coach SIGN, on `ezszahvwwmbuekpedumf`, names only in the command the
operator types locally. Do not paste values here.

```sh
# Values stay in the operator's terminal. Do not commit. Do not paste into chat.
npx supabase secrets set \
  TWILIO_ACCOUNT_SID= \
  TWILIO_AUTH_TOKEN= \
  TWILIO_WEBHOOK_URL= \
  TWILIO_VOICE_STATUS_WEBHOOK_URL= \
  MISSED_CALL_SMS_WORKER_SECRET=
```

Optional, only if Coach wants a non-default worker id:

```sh
npx supabase secrets set MISSED_CALL_SMS_WORKER_ID=
```

Then names-only verify:

```sh
npx supabase secrets list
```

Expected names present: `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`,
`TWILIO_WEBHOOK_URL`, `TWILIO_VOICE_STATUS_WEBHOOK_URL`,
`MISSED_CALL_SMS_WORKER_SECRET`. Optional: `MISSED_CALL_SMS_WORKER_ID`.
`MISSED_CALL_BOOKING_WORKER_SECRET` must be absent (or left untouched — do not
create it). List output is names only; if a value appears, stop and treat it
as a leak.

Step 3 binds the **same** `MISSED_CALL_SMS_WORKER_SECRET` on
`grafter-missed-call-sms-tick`. Generate once. Set Edge first (this step),
bind the Worker later. Never write the value into wrangler.toml or git.

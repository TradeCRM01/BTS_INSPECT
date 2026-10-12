# PR-J step 2 — Edge secrets (Coach SIGN)

Docs only. Do not create secrets from this PR. Do not print or paste values
into chat, logs, or PRs. Names only.

Source: `supabase/functions` on `origin/main` at
`796f3b71f6feece170837c6bdd2187103003b40b` (#369). Every `Deno.env.get(...)`
on the missed-call SMS path is listed below with `file:line`.

**Method:** Jack or Coach writes names into a mode-600 env file and runs
`npx supabase secrets set --env-file` with `--project-ref ezszahvwwmbuekpedumf`.
Never inline `NAME=value` on the command line, in chat, or in this PR. Verify
with `npx supabase secrets list --project-ref ezszahvwwmbuekpedumf` (names
only). Whether a name is already set in prod is **unknown** until that list
is read.

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
| `TWILIO_AUTH_TOKEN` | `twilio-inbound`, `twilio-voice-status`, `missed-call-sms-worker` | `twilio-inbound/index.ts:35`, `twilio-voice-status/index.ts:32`, `missed-call-sms-worker/index.ts:66` | Validate Twilio request signatures; Basic auth when the SMS worker POSTs `Messages.json` | Twilio console (Account → Auth token) | unknown — `secrets list --project-ref` (names only) |
| `TWILIO_ACCOUNT_SID` | `twilio-inbound`, `twilio-voice-status` | `twilio-inbound/index.ts:36`, `twilio-voice-status/index.ts:33` | Expected Account SID on inbound and voice-status webhooks | Twilio console (`AC…`) | unknown — `secrets list --project-ref` (names only) |
| `TWILIO_WEBHOOK_URL` | `twilio-inbound` | `twilio-inbound/index.ts:37` | Public URL Twilio signed; must match the messaging webhook byte-for-byte | Twilio console messaging webhook = `https://ezszahvwwmbuekpedumf.supabase.co/functions/v1/twilio-inbound` | unknown — `secrets list --project-ref` (names only) |
| `TWILIO_VOICE_STATUS_WEBHOOK_URL` | `twilio-voice-status` | `twilio-voice-status/index.ts:34` | Public URL Twilio signed; must match the voice-status callback byte-for-byte | Twilio console voice status callback = `https://ezszahvwwmbuekpedumf.supabase.co/functions/v1/twilio-voice-status` | unknown — `secrets list --project-ref` (names only) |
| `MISSED_CALL_SMS_WORKER_SECRET` | `missed-call-sms-worker` | `missed-call-sms-worker/index.ts:65` | Bearer that authorizes the sms-tick Worker POST | `openssl rand -hex 32` written straight to `/home/box/.secrets/missed-call-sms-worker.secret` (mode 600, outside git). Never echoed. Same file is the step-3 `wrangler secret put` stdin. | unknown — `secrets list --project-ref` (names only) |

### Optional

| Name | Function | `Deno.env.get` | Purpose | Value comes from | Already in prod |
| --- | --- | --- | --- | --- | --- |
| `MISSED_CALL_SMS_WORKER_ID` | `missed-call-sms-worker` | `missed-call-sms-worker/index.ts:22` and `:67` | Claim `p_worker_id` / worker label. Default if unset: `missed-call-sms-worker` | Optional stable label. Skip unless Coach wants a non-default id | unknown — `secrets list --project-ref` (names only) |

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

After Coach SIGN. Never inline `NAME=value`. `set +x`. Do not `echo` values.
`TWILIO_*` are copied from the box env into `$f` without printing them.
Generate the worker secret with `openssl rand -hex 32` straight into a
mode-600 file. Never echo that output.

```sh
set +x
umask 077
mkdir -p /home/box/.secrets
openssl rand -hex 32 > /home/box/.secrets/missed-call-sms-worker.secret
chmod 600 /home/box/.secrets/missed-call-sms-worker.secret

f=$(mktemp)
{
  printf 'TWILIO_ACCOUNT_SID=%s\n' "$TWILIO_ACCOUNT_SID"
  printf 'TWILIO_AUTH_TOKEN=%s\n' "$TWILIO_AUTH_TOKEN"
  printf 'TWILIO_WEBHOOK_URL=%s\n' "$TWILIO_WEBHOOK_URL"
  printf 'TWILIO_VOICE_STATUS_WEBHOOK_URL=%s\n' "$TWILIO_VOICE_STATUS_WEBHOOK_URL"
  printf 'MISSED_CALL_SMS_WORKER_SECRET='
  cat /home/box/.secrets/missed-call-sms-worker.secret
  printf '\n'
} > "$f"
chmod 600 "$f"

npx supabase secrets set --env-file "$f" --project-ref ezszahvwwmbuekpedumf
shred -u "$f"

npx supabase secrets list --project-ref ezszahvwwmbuekpedumf
```

Do not add `MISSED_CALL_SMS_WORKER_ID` unless Coach asks. If they do, write it
into `$f` the same way (from the box env, no inline `NAME=value`).

Expected names on `secrets list`: `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`,
`TWILIO_WEBHOOK_URL`, `TWILIO_VOICE_STATUS_WEBHOOK_URL`,
`MISSED_CALL_SMS_WORKER_SECRET`. `MISSED_CALL_BOOKING_WORKER_SECRET` must be
absent (do not create it). List is names only; if a value appears, stop and
treat it as a leak.

Keep `/home/box/.secrets/missed-call-sms-worker.secret` (mode 600, outside
git) until step 3. That is the handoff. Do not commit it. Do not paste it.

## Handoff to step 3

Step 3 reads that file on stdin and then deletes it:

```sh
set +x
wrangler secret put MISSED_CALL_SMS_WORKER_SECRET < /home/box/.secrets/missed-call-sms-worker.secret
shred -u /home/box/.secrets/missed-call-sms-worker.secret
```

If the file is lost, regenerate with `openssl rand -hex 32` straight into the
same path (mode 600, never echoed), re-run this step’s `--env-file` set so
Edge matches, then `wrangler secret put` again. Both sides must match. Never
write the value into wrangler.toml or git.

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
| `MISSED_CALL_SMS_WORKER_SECRET` | `missed-call-sms-worker` | `missed-call-sms-worker/index.ts:65` | Bearer that authorizes the sms-tick Worker POST | `openssl rand -hex 32 \| tr -d '\n'` written straight to `/home/box/.secrets/missed-call-sms-worker.secret` (mode 600, outside git, exactly 64 bytes, no newline). Never echoed. Same file is the step-3 `wrangler secret put` stdin. | unknown — `secrets list --project-ref` (names only) |

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

After Coach SIGN. Run in **bash** (needs `pipefail`). Never inline
`NAME=value` on the command line. Do not `echo` values. `TWILIO_ACCOUNT_SID`
and `TWILIO_AUTH_TOKEN` are copied from the box env into `$f` without
printing them. The two webhook URLs are written as **literals** — they are the
exact strings Twilio signs, and the functions read them unmodified apart from
`.trim()`:

- `supabase/functions/twilio-inbound/index.ts:37` —
  `publicUrl: Deno.env.get('TWILIO_WEBHOOK_URL')?.trim() ?? '',`
- `supabase/functions/twilio-voice-status/index.ts:34` —
  `publicUrl: Deno.env.get('TWILIO_VOICE_STATUS_WEBHOOK_URL')?.trim() ?? '',`

`publicUrl` is the signature base (`_shared/twilioInbound.ts:119`,
`payload = publicUrl + …`), so these must equal the Twilio console URLs
byte-for-byte.

```bash
#!/usr/bin/env bash
set -euo pipefail
set +x
umask 077

ref=ezszahvwwmbuekpedumf
names="TWILIO_AUTH_TOKEN TWILIO_ACCOUNT_SID TWILIO_WEBHOOK_URL TWILIO_VOICE_STATUS_WEBHOOK_URL MISSED_CALL_SMS_WORKER_SECRET"
sec=/home/box/.secrets/missed-call-sms-worker.secret

# 1. Worker secret: 64 hex chars, no trailing newline, never echoed.
mkdir -p /home/box/.secrets
openssl rand -hex 32 | tr -d '\n' > "$sec"
chmod 600 "$sec"
[ "$(wc -c < "$sec" | tr -d ' ')" = 64 ] || { echo "worker secret is not 64 bytes" >&2; exit 1; }
if od -An -c "$sec" | grep -q '\\n'; then echo "worker secret contains a newline" >&2; exit 1; fi

# 2. Env file (mode 600). URLs are literals. Values never printed.
f=$(mktemp)
chmod 600 "$f"
trap 'shred -u "$f" 2>/dev/null || rm -f "$f"' EXIT
{
  printf 'TWILIO_ACCOUNT_SID=%s\n' "${TWILIO_ACCOUNT_SID-}"
  printf 'TWILIO_AUTH_TOKEN=%s\n' "${TWILIO_AUTH_TOKEN-}"
  printf 'TWILIO_WEBHOOK_URL=%s\n' 'https://ezszahvwwmbuekpedumf.supabase.co/functions/v1/twilio-inbound'
  printf 'TWILIO_VOICE_STATUS_WEBHOOK_URL=%s\n' 'https://ezszahvwwmbuekpedumf.supabase.co/functions/v1/twilio-voice-status'
  printf 'MISSED_CALL_SMS_WORKER_SECRET=%s\n' "$(cat "$sec")"
} > "$f"

# 3. Every name must be non-empty in the env file. Report names only.
missing=""
for n in $names; do
  v=$(sed -n "s/^${n}=//p" "$f")
  [ -n "$v" ] || missing="$missing $n"
done
unset v
if [ -n "$missing" ]; then
  echo "abort: empty or missing in env file:$missing" >&2
  exit 1
fi

# 4. Set. A failure exits non-zero here (set -e) and nothing below runs.
if ! npx supabase secrets set --env-file "$f" --project-ref "$ref"; then
  echo "abort: supabase secrets set failed" >&2
  exit 1
fi

# 5. Only after a successful set: assert all 5 names are present (names only).
list=$(npx supabase secrets list --project-ref "$ref")
absent=""
for n in $names; do
  printf '%s\n' "$list" | grep -qw -- "$n" || absent="$absent $n"
done
if printf '%s\n' "$list" | grep -qw -- MISSED_CALL_BOOKING_WORKER_SECRET; then
  echo "abort: MISSED_CALL_BOOKING_WORKER_SECRET is present; it must not be" >&2
  exit 1
fi
unset list
if [ -n "$absent" ]; then
  echo "abort: not in secrets list:$absent" >&2
  exit 1
fi
echo "ok: all 5 names present"
```

The script never prints `secrets list` output; it only greps it for names.
`MISSED_CALL_BOOKING_WORKER_SECRET` is not written and must be absent.

Do not add `MISSED_CALL_SMS_WORKER_ID` unless Coach asks. If they do, write it
into `$f` the same way (no inline `NAME=value`).

### Trailing newline and env-file parsing

The CLI (`supabase/cli`, `apps/cli/src/commands/secrets/set/set.handler.ts`)
parses `--env-file` with the `dotenv` package (`parse as parseDotenv`,
`dotenv ^17`). Each line ends at `\n`; unquoted values are trimmed. Checked
with dotenv 17: `A=abc\n`, `A=abc\n\n`, `A=abc`, `A=abc \n` and `A=abc\r\n`
all parse to `abc`. So the line terminators in `$f` never reach the stored
value. Edge also reads every one of these names with `?.trim()`. The real
newline risk is the **Worker** side: `wrangler secret put` reads stdin and we
have not confirmed it strips a trailing `\n`, and the Worker sends the value as
the bearer. That is why the secret file is written
with no newline and checked at exactly 64 bytes.

Keep `/home/box/.secrets/missed-call-sms-worker.secret` (mode 600, outside
git) until step 3. That is the handoff. Do not commit it. Do not paste it.

## Handoff to step 3

Step 3 pipes that file into `wrangler secret put` with `printf '%s'` (no
newline) and then deletes it:

```bash
set -euo pipefail
set +x
sec=/home/box/.secrets/missed-call-sms-worker.secret
[ "$(wc -c < "$sec" | tr -d ' ')" = 64 ] || { echo "worker secret is not 64 bytes" >&2; exit 1; }
printf '%s' "$(cat "$sec")" | wrangler secret put MISSED_CALL_SMS_WORKER_SECRET
shred -u "$sec"
```

If the file is lost, regenerate with `openssl rand -hex 32 | tr -d '\n'`
straight into the same path (mode 600, never echoed), re-run this step's
`--env-file` set so Edge matches, then `wrangler secret put` again. Both sides
must match. Never write the value into wrangler.toml or git.

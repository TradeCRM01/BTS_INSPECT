# PR-J step 3 — Deploy `missed-call-sms-tick` (Coach SIGN)

Docs only. Nothing in this PR deploys, puts a secret, or calls prod. Proof is
**names, HTTP status codes and git sha only** — never a secret value, never an
`Authorization` header, never a response body value.

Source read on this branch (`cursor/lane2-prj-step1-migrations-6ec3`, base
`f82e3def`), code from #369:

- `workers/missed-call-sms-tick/wrangler.toml` — `name = "grafter-missed-call-sms-tick"`,
  `main = "src/index.ts"`, `[triggers] crons = ["* * * * *"]`,
  `[vars] SUPABASE_URL = "https://ezszahvwwmbuekpedumf.supabase.co"`. Comment: wrangler@3 on Node 20.
- `workers/missed-call-sms-tick/src/index.ts` — `scheduled()` calls `postEdgeTick` with
  `functionName: 'missed-call-sms-worker'`, `secretName: 'MISSED_CALL_SMS_WORKER_SECRET'`.
- `workers/_shared/edgeTick.ts` — `POST ${SUPABASE_URL}/functions/v1/missed-call-sms-worker`,
  only header `Authorization: Bearer <secret>`, no body, 15 s abort. Silent on 2xx;
  logs `non-2xx` + status (secret redacted) otherwise. Missing secret or URL → logs and
  does **not** fetch.
- `workers/_shared/describeTickWorker.ts` — tests pin exactly that URL, method and header.

## Scope

- Deploy **only** `workers/missed-call-sms-tick`.
- **Never** deploy `workers/missed-call-booking-tick` (`grafter-missed-call-booking-tick`).
  **Never** `wrangler secret put MISSED_CALL_BOOKING_WORKER_SECRET`. Auto-booking stays off.
- Prereqs: step 1 migrations applied; step 2 Edge secrets set (incl.
  `MISSED_CALL_SMS_WORKER_SECRET` and `TWILIO_AUTH_TOKEN`) from the **same** file
  `/home/box/.secrets/missed-call-sms-worker.secret`; `missed-call-sms-worker` deployed
  with `verify_jwt = false` (`supabase/config.toml`).
- Step 5 (settings row) has **not** run yet. Read "Side effects" before step 3.

## Credentials (names only)

| Env name | Value from |
| --- | --- |
| `CLOUDFLARE_API_TOKEN` | Cloudflare dash → My Profile → API Tokens → custom token |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare dash → Workers & Pages → Account ID |

Token permissions (scope it to this one account):

- **Account → Workers Scripts → Edit** (upload script, set secrets, cron triggers, delete).
- **Account → Account Settings → Read** (wrangler account lookup).
- Optional: **User → User Details → Read** and **User → Memberships → Read** (only
  so `wrangler whoami` works; not needed when `CLOUDFLARE_ACCOUNT_ID` is set).
- No Zone permissions: the worker has no routes. If wrangler tries to enable the
  `workers.dev` subdomain it uses Workers Scripts Edit; the worker has no `fetch`
  handler, so that URL serves nothing useful.

Export both names in the shell from a mode-600 file (e.g. `set -a; . ~/.secrets/cf.env; set +a`).
Never paste values on the command line.

## Ordering: deploy first, then secret put

`wrangler secret put` against a Worker name that does not exist yet does not just
fail: wrangler prompts to create a new (empty) Worker with that name and attach the
secret. Non-interactively that prompt is unreliable and would create a script that is
not ours. So:

1. Deploy first. Until the secret lands, every minute the cron logs
   `missed-call-sms-tick missing secret` and **does not fetch** (`edgeTick.ts`). Harmless.
2. Then `secret put`. On an existing Worker this creates and deploys a new version
   with the secret bound immediately; the next minute's tick uses it.

(Order 1 → 2 below is the file check; 3 → 4 is deploy → put.)

## Side effects of a tick before step 5 — read first

What one authorized call to `missed-call-sms-worker` does
(`supabase/functions/missed-call-sms-worker/index.ts`, `_shared/twilioSmsWorker.ts`,
`claim_next_sms_message` / `authorize_sms_dispatch` / `sms_dispatch_block_reason` in
`supabase/migrations/20261013000000_sms_purpose_copy_consent.sql`):

1. Bearer mismatch → `401`. Missing worker secret or `TWILIO_AUTH_TOKEN` → `503`.
2. Calls `claim_next_sms_message`. For every **due** outbound row
   (`state='queued'` with `next_attempt` null/past, or `claimed` with expired lease)
   it runs `sms_dispatch_block_reason`. With **no `sms_automation_settings` row** for
   the org (or `enabled` not true) the reason is `'disabled'` — checked before test
   mode or the allowlist — and the row is **updated to `state='cancelled'`,
   `last_error='disabled'`** (claim fields cleared). It is not retried later.
3. No row is then claimable, so the function returns **`204`, no body, and sends
   no SMS**. Twilio is never called.

So: **no SMS can go out** with no settings row (and once step 5 sets test mode, only
`+61418893602` on the allowlist can be texted). **But every tick — cron or manual —
permanently cancels any queued outbound backlog.** The cron does this every minute
from deploy onward, so the manual proof adds no new risk beyond the deploy itself.

**Gate before step 3** (read-only, Supabase `execute_sql`, record the count only):

```sql
select count(*) as due_outbound
from public.sms_messages
where direction = 'outbound'
  and ((state = 'queued' and coalesce(next_attempt, now()) <= now())
       or (state = 'claimed' and claim_expires_at <= now()));
```

Expect `0` (inbound webhooks only enqueue once the go-live path is live). If not `0`,
stop: those rows will be cancelled as `disabled`. Coach decides (accept, or do step 5
first). Re-run the same query after the proof and expect `0` again.

## Runbook

Run from the repo root on a clean checkout of the reviewed sha. Every block is bash.

```bash
#!/usr/bin/env bash
set -euo pipefail
set +x

SECRET_FILE=/home/box/.secrets/missed-call-sms-worker.secret
WORKER_DIR=workers/missed-call-sms-tick
EDGE_URL=https://ezszahvwwmbuekpedumf.supabase.co/functions/v1/missed-call-sms-worker

: "${CLOUDFLARE_API_TOKEN:?set CLOUDFLARE_API_TOKEN (name only)}"
: "${CLOUDFLARE_ACCOUNT_ID:?set CLOUDFLARE_ACCOUNT_ID (name only)}"
git rev-parse HEAD                                      # proof: sha
grep -q '^name = "grafter-missed-call-sms-tick"$' "$WORKER_DIR/wrangler.toml"
```

### 1. Check the secret file (64 bytes, no newline)

```bash
test -f "$SECRET_FILE"
[ "$(stat -c %a "$SECRET_FILE")" = "600" ] || { echo "mode not 600"; exit 1; }
[ "$(wc -c < "$SECRET_FILE")" -eq 64 ] || { echo "size not 64"; exit 1; }
[ "$(tr -cd '\n\r' < "$SECRET_FILE" | wc -c)" -eq 0 ] || { echo "has newline"; exit 1; }
grep -Eq '^[0-9a-f]{64}$' "$SECRET_FILE" || { echo "not 64 hex"; exit 1; }
echo "secret file ok (64 bytes, no newline)"
```

### 2. Read-only gate

Run the `due_outbound` query above. Continue only if it is `0` or Coach accepts.

### 3. Deploy (only this worker)

```bash
cd "$WORKER_DIR"
npx --yes wrangler@3 deploy 2>&1 | tee /tmp/sms-tick-deploy.log
grep -F '* * * * *' /tmp/sms-tick-deploy.log          # "schedule: * * * * *"
grep -F 'SUPABASE_URL' /tmp/sms-tick-deploy.log        # "env.SUPABASE_URL (...)" binding
grep -Ei 'Current Version ID|Deployment ID' /tmp/sms-tick-deploy.log
npx --yes wrangler@3 deployments list | head -n 20     # newest version listed
```

Dashboard check: Workers & Pages → `grafter-missed-call-sms-tick` → Settings →
Triggers shows Cron `* * * * *`; Settings → Variables shows `SUPABASE_URL` (plain text).
`grafter-missed-call-booking-tick` must **not** exist in the list.

### 4. Secret put, then bearer proof

```bash
# still in $WORKER_DIR
printf '%s' "$(cat "$SECRET_FILE")" | npx --yes wrangler@3 secret put MISSED_CALL_SMS_WORKER_SECRET
npx --yes wrangler@3 secret list                       # names only; expect MISSED_CALL_SMS_WORKER_SECRET
```

Bearer proof: one call exactly as `edgeTick.ts` makes it (POST, single
`Authorization: Bearer` header, no body). The bearer is read from the file by curl via
a header file on a process substitution, so it never appears in argv, `ps`, or the log.

```bash
BODY=$(mktemp); trap 'rm -f "$BODY"' EXIT
STATUS=$(curl -sS -o "$BODY" -w '%{http_code}' --max-time 15 -X POST \
  -H @<(printf 'Authorization: Bearer %s\n' "$(cat "$SECRET_FILE")") \
  "$EDGE_URL")
echo "status=$STATUS"
if [ -s "$BODY" ]; then
  # summary only: keys and the ok/sent booleans; no values
  python3 -c 'import json,sys; d=json.load(open(sys.argv[1])); print("keys=",sorted(d), "ok=",d.get("ok"), "sent=",d.get("sent"))' "$BODY" \
    || echo "body=non-json ($(wc -c < "$BODY") bytes)"
else
  echo "body=empty"
fi
[ "$STATUS" != "401" ] || { echo "FAIL 401: Edge and Worker secrets differ"; exit 1; }
case "$STATUS" in 2??) echo "bearer proof PASS";; *) echo "FAIL non-2xx"; exit 1;; esac
```

Expected with no settings row: `status=204`, `body=empty`. `503` means an Edge secret
(`MISSED_CALL_SMS_WORKER_SECRET` or `TWILIO_AUTH_TOKEN`) is missing — fix in step 2, do
not shred. `500` means the claim RPC failed (step 1 migrations) — check
`get_logs`/function logs, do not shred.

#### Alternative proof via the Worker's own trigger

- **Real cron + tail (preferred, no extra call):** after the secret put, run
  `npx --yes wrangler@3 tail grafter-missed-call-sms-tick --format pretty` for 2–3
  minutes. Each scheduled event shows `* * * * *` with outcome `ok`. On 2xx the tick logs
  **nothing**; any `missing secret`, `non-2xx` (with `status: 401`) or
  `request failed` line is a fail. Pair with the Edge function logs in Supabase showing
  `POST | 204` for `missed-call-sms-worker`. Proof = status codes only.
- **Local scheduled test:** `npx --yes wrangler@3 dev --test-scheduled` with the secret
  in a mode-600 `.dev.vars`, then `curl "http://localhost:8787/__scheduled?cron=*+*+*+*+*"`.
  This hits the **prod** Edge function from the box (same side effects) and needs a
  second copy of the secret on disk, so prefer tail. Delete `.dev.vars` afterwards.
- There is no manual "run cron now" button for a deployed Worker.

### 5. Shred the secret file — only after the proof passes

```bash
[ "${STATUS:-}" -ge 200 ] && [ "${STATUS:-}" -lt 300 ] || { echo "proof not passed; keep file"; exit 1; }
shred -u "$SECRET_FILE"
test ! -e "$SECRET_FILE" && echo "secret file shredded"
```

The value now exists only as the Edge secret and the Worker secret. Rotation = new
file, `supabase secrets set` (step 2), `wrangler secret put` (this step), re-prove.

### 6. Rollback

Either is fine; neither touches the Edge function or data.

```bash
cd workers/missed-call-sms-tick
# a) stop ticks, keep the script and secret: remove the cron
#    edit wrangler.toml locally to  crons = []  then
npx --yes wrangler@3 deploy
#    (or dashboard → Settings → Triggers → delete the Cron Trigger)
# b) remove the worker entirely (also drops its secret)
npx --yes wrangler@3 delete --name grafter-missed-call-sms-tick
```

After either, the Edge function stays deployed but nothing calls it. Rows already
cancelled as `disabled` are not restored by rollback.

## Proof to record (names, codes, sha only)

- `git rev-parse HEAD` sha deployed.
- Secret file check: `64 bytes, no newline` (no value).
- `due_outbound` count before and after.
- Deploy: worker name `grafter-missed-call-sms-tick`, cron `* * * * *`,
  var name `SUPABASE_URL`, Version/Deployment ID.
- `wrangler secret list`: `MISSED_CALL_SMS_WORKER_SECRET` (name only).
- Bearer proof: `status=204` (or other 2xx), `body=empty` / keys only. Not `401`.
- `secret file shredded`.
- Booking-tick: not deployed, no booking secret put.

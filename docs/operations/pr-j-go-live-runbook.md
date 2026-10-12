# PR-J go-live runbook

Checklist only. Coach SIGN on each prod step before it executes. No `db push`.
This docs PR executes nothing against prod. Never merge from this PR.

Production is `grafter.com.au` on Supabase `ezszahvwwmbuekpedumf`.
Do not point the live SPA or Twilio callbacks at `fbtmwpkfyjxamxqjxiaq`.

Allowlist stays `+61418893602` only. Default texts only. Custom wording needs Jack's OK.
Test mode stays on.

## Coach conditions

- Auto-booking stays **OFF**.
- Deploy **ONLY** `grafter-missed-call-sms-tick`.
- The booking-tick Worker (`grafter-missed-call-booking-tick`) stays **undeployed**.
- Do **not** create or bind `MISSED_CALL_BOOKING_WORKER_SECRET`.

PR-J runs **one prod step at a time**. Each step needs Coach SIGN before it executes:

1. **Migrations** — the ten Lane 2 files in `docs/operations/pr-j-step1-migrations.md`. One file per SIGN. Read-only SELECTs after each apply. Stop if a file fails.
2. **Edge secrets** — `docs/operations/pr-j-step2-edge-secrets.md`. Names only in any log. Values stay in the secret store. Never print tokens.
3. **sms-tick wrangler deploy** — reviewed manual `wrangler deploy` of `grafter-missed-call-sms-tick` only. Not booking-tick. wrangler@3 on Node 20.
4. **Twilio webhooks** — messaging + voice-status on sender `PNb67e96dc23fa486ead392be6c92075a3` (`+61485064111`). No Messaging Service.
5. **Settings row** — one reviewed `INSERT … ON CONFLICT` via `execute_sql`, run once. See step 5.
6. **Flag-on build PR** — `ENQUIRY_SURFACE_LIVE = true` in a separate code PR. Vitest on the flag-on path plus frames of the Jobs **Enquiries** tab and Company Settings **Texting**. Coach SIGN on those frames before the const flip merges.
7. **Smoke** — `+61418893602` **ONLY**: missed call, ack, reply, enquiry appears, STOP, no further texts. Test mode on. Default texts. Allowlist only.

## 0. Before any apply

- [ ] Baseline reconcile r5 is SIGNED. Prod `schema_migrations` matches `docs/operations/baseline-reconcile.md` (CoS proof table).
- [ ] Repair runbook from that doc has been executed (or confirmed unnecessary). PR-J applies only the ten Lane 2 files via `apply_migration`. That records **ten new apply-time** `schema_migrations` rows (count 87 → 97). The 71 same-name / version-mismatch rows are a subset of today’s 87; they stay. Do not `INSERT` into `schema_migrations` by hand. Do not `repair` without Coach review. Do not `db push`.
- [ ] Do **not** apply 053, 056, 057, 058, 060, 062, remap, or phase_2b. Those stay PARKED as NOT-applied. No stubs. No applied marks.
- [ ] `ENQUIRY_SURFACE_LIVE` is still the const `false` in the live build until step 6.
- [ ] No Messaging Service. Number SID `PNb67e96dc23fa486ead392be6c92075a3` (`+61485064111`) only.
- [ ] Prod has `pg_cron` 1.6.4, 0 `cron.job` rows, and no `pg_net`. Do not enable `pg_net`. Do not insert Perth reminder `cron.job` rows.
- [ ] Auto-booking stays off. Do not deploy `grafter-missed-call-booking-tick`. Do not set `MISSED_CALL_BOOKING_WORKER_SECRET`.

## 1. Migrations (Coach SIGN, then one file)

Apply order, sha256, dependencies, and the read-only verification SELECTs live in
`docs/operations/pr-j-step1-migrations.md`.

Apply these ten files in this order. One file per SIGN. Stop if a file fails.
Run that file's SELECTs before the next SIGN.

| Order | File | Notes |
| --- | --- | --- |
| 1 | `20261009000000_missed_call_bootstrap_assert.sql` | Assert only. |
| 2 | `20261010000000_missed_call_autobook_off.sql` | Autobook stays off. |
| 3 | `20261011000000_sms_automation_settings.sql` | PR-C. Settings table and claim guards. |
| 4 | `20261012000000_companies_time_zone.sql` | Tenant time zone. |
| 5 | `20261013000000_sms_purpose_copy_consent.sql` | Adds `sms_is_gsm7`. |
| 6 | `20261014000000_sms_enquiry_help.sql` | PR-E. HELP path. |
| 7 | `20261015000000_missed_call_enquiry_draft.sql` | Enquiry draft. |
| 8 | `20261016000000_sms_textback_admin_write.sql` | PR-I. Depends on PR-C (`20261011`) and PR-E (`20261014`). Also needs `sms_is_gsm7` from `20261013`. Name must be valid before `enabled`. |
| 9 | `20261017000000_sms_reply_templates.sql` | Three default texts. |
| 10 | `20261018000000_sms_reply_filter_hardening.sql` | Phone and `$` guards. The `$` guard rides in PR-J and blocks any `$` in custom replies. |

`apply_migration` records a **new apply-time** `version` per file, not the
author-time prefix in the file name. After file 10 the count is **97**. Newest
`name` matches the file just applied. The 71 figure is the same-name /
version-mismatch subset of today’s 87 rows, not “87 minus ten.” No manual
`INSERT` or `repair` without review.

Do not apply any other repo file in this go-live.

## 2. Edge secrets (Coach SIGN)

Names, readers, and `file:line` cites: `docs/operations/pr-j-step2-edge-secrets.md`.

Jack or Coach uses the `--env-file` procedure in
`docs/operations/pr-j-step2-edge-secrets.md`. Never inline `NAME=value`.
Verify with `npx supabase secrets list --project-ref ezszahvwwmbuekpedumf`
(names only). Already-set in prod is unknown until that list.

- [ ] `TWILIO_ACCOUNT_SID`
- [ ] `TWILIO_AUTH_TOKEN`
- [ ] `TWILIO_WEBHOOK_URL`
- [ ] `TWILIO_VOICE_STATUS_WEBHOOK_URL`
- [ ] `MISSED_CALL_SMS_WORKER_SECRET` — same value as the sms-tick Worker binding
- [ ] optional: `MISSED_CALL_SMS_WORKER_ID`

Do **not** set `MISSED_CALL_BOOKING_WORKER_SECRET`.
Do **not** set `MISSED_CALL_BOOKING_WORKER_ID`.
Do **not** set `TWILIO_FROM_NUMBER` (never `+61485064111`). No Messaging Service SID.

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are supplied by the platform.

## 3. sms-tick wrangler deploy (Coach SIGN)

Reviewed **manual** `wrangler deploy` of `grafter-missed-call-sms-tick` from
Jack's Cloudflare account. wrangler@3 on Node 20 (wrangler 4 needs Node 22).
Not a dashboard Create-Worker click. Not a CI deploy. Not booking-tick.

#369 (PR-W) added the source under `workers/missed-call-sms-tick` and
`workers/missed-call-booking-tick`. Booking-tick source stays in the repo and
stays undeployed.

- [ ] Coach SIGN on this deploy step.
- [ ] `wrangler deploy` for `grafter-missed-call-sms-tick` only.
- [ ] `wrangler secret put MISSED_CALL_SMS_WORKER_SECRET` reading `/home/box/.secrets/missed-call-sms-worker.secret` from stdin, then `shred -u` that file. Never print it. Never `VITE_*`. If the file is lost, regenerate and re-set Edge and the Worker (step 2).
- [ ] Do **not** deploy `grafter-missed-call-booking-tick`.
- [ ] Do **not** bind `MISSED_CALL_BOOKING_WORKER_SECRET`.
- [ ] First tick after SIGN: one SMS worker POST, allowlist only.

Throughput is one item per minute on the sms-tick Worker, which is fine for the
pilot. A `2xx` completes the tick. Retry transport errors and `5xx` on the
**next** minute, not in a tight loop.

### Why not `pg_cron` + `net.http_post`

Catalog capture query 19 (`pg_extension`) lists `pg_cron` 1.6.4 and does **not**
list `pg_net`. Prod has **0** `cron.job` rows. Cloudflare Cron Triggers need
zero catalog, extension, or `cron.job` writes.

## 4. Twilio webhooks (Coach SIGN)

On Incoming Phone Number `PNb67e96dc23fa486ead392be6c92075a3` (`+61485064111`):

| Twilio setting | Method | URL |
| --- | --- | --- |
| Messaging webhook | `POST` | `https://ezszahvwwmbuekpedumf.supabase.co/functions/v1/twilio-inbound` |
| Voice status callback | `POST` | `https://ezszahvwwmbuekpedumf.supabase.co/functions/v1/twilio-voice-status` |

- [ ] No Messaging Service SID.
- [ ] `TWILIO_WEBHOOK_URL` matches the messaging URL byte-for-byte.
- [ ] `TWILIO_VOICE_STATUS_WEBHOOK_URL` matches the voice-status URL byte-for-byte.
- [ ] Existing voice handler is unchanged.
- [ ] `organisation_twilio_senders` has one active row for the live company:
  - `phone_e164` = `+61485064111`
  - `provider_sender_sid` = `PNb67e96dc23fa486ead392be6c92075a3`
  - `active` = true

## 5. Settings row (Coach SIGN)

One reviewed `INSERT … ON CONFLICT` via `execute_sql`. Run **once**. Every
value is set explicitly. Do not rely on table defaults for the allowlist: the
default `test_allowlist` is `'{}'`, which **blocks the smoke test**
(`test_mode_blocked`).

`organisation_id` is derived from `organisation_twilio_senders` where
`provider_sender_sid = 'PNb67e96dc23fa486ead392be6c92075a3'` **and**
`active`. Assert **exactly 1** active row. Do not paste a company UUID.

`business_name` is `<BUSINESS_NAME>` pending Jack's choice: GSM-7, **20
characters or fewer**. The DB check rejects longer names. (CoS floated
Building Technology Solutions; that string is 29 characters and would fail.)
Must be set **before** `enabled` is true (same statement is fine if the name
is already valid). Caps are hourly 10, daily 20, monthly 300.

One `execute_sql` call — assert and insert in a single `DO` block.

```sql
DO $step$
DECLARE
  n integer;
  v_org uuid;
BEGIN
  SELECT count(*), min(organisation_id)
    INTO n, v_org
    FROM public.organisation_twilio_senders
   WHERE provider_sender_sid = 'PNb67e96dc23fa486ead392be6c92075a3'
     AND active;
  IF n <> 1 THEN
    RAISE EXCEPTION
      'expected exactly 1 active organisation_twilio_senders row for PNb67e96dc23fa486ead392be6c92075a3';
  END IF;

  INSERT INTO public.sms_automation_settings (
    organisation_id,
    enabled,
    test_mode,
    test_allowlist,
    forward_from_e164,
    business_name,
    hourly_message_cap,
    daily_message_cap,
    monthly_message_cap,
    ack_ttl_minutes
  ) VALUES (
    v_org,
    true,
    true,
    ARRAY['+61418893602']::text[],
    NULL,
    '<BUSINESS_NAME>',  -- Jack: GSM-7, 20 characters or fewer
    10,
    20,
    300,
    30
  )
  ON CONFLICT (organisation_id) DO UPDATE
  SET
    enabled = EXCLUDED.enabled,
    test_mode = EXCLUDED.test_mode,
    test_allowlist = EXCLUDED.test_allowlist,
    forward_from_e164 = EXCLUDED.forward_from_e164,
    business_name = EXCLUDED.business_name,
    hourly_message_cap = EXCLUDED.hourly_message_cap,
    daily_message_cap = EXCLUDED.daily_message_cap,
    monthly_message_cap = EXCLUDED.monthly_message_cap,
    ack_ttl_minutes = EXCLUDED.ack_ttl_minutes,
    updated_at = now();
END
$step$;
```

- [ ] Coach SIGN on this one `execute_sql`. Jack has confirmed `<BUSINESS_NAME>` (GSM-7, 20 characters or fewer). Caps are 10 / 20 / 300.
- [ ] `test_mode` = true. Stays on.
- [ ] `test_allowlist` = `{+61418893602}` only.
- [ ] Default texts only. Custom ack / thanks / HELP needs Jack's OK. The `$` guard rides in PR-J and blocks any `$` in custom replies.

Do not run this from this docs PR.

## 6. Flag-on build PR (Coach SIGN)

This is a **code PR**, not an env toggle. `ENQUIRY_SURFACE_LIVE` is a `const` in
`src/lib/missedCallEnquiry.ts`. The production build drops the
`|| ENQUIRY_SURFACE_LIVE` OR while the const is `false`. Flipping means changing
that const to `true` and deploying that commit.

Do not flip until the pre-flip proof exists on a flag-on preview build:

- [ ] Vitest on the flag-on path (Enquiries surface and Texting) is green.
- [ ] Flag-on preview frames prove the output: Jobs **Enquiries** tab, and Company Settings **Texting** (missed-call text-back + replies).
- [ ] Coach SIGN on those frames.
- [ ] Then merge the const flip in a reviewed deploy.

Rollback of the flag is the same kind of change: set the const back to `false`
and redeploy.

## 7. Smoke (Coach SIGN) — `+61418893602` ONLY

- [ ] Missed call from `+61418893602` only.
- [ ] Accept one outbound ack to that number only.
- [ ] Reply from that number only.
- [ ] Enquiry appears on the Jobs Enquiries tab.
- [ ] STOP from that number. No further texts.
- [ ] No other destination. Test mode on. Default texts. Allowlist only.

## 8. Rollback

- [ ] Set `sms_automation_settings.enabled` = false.
- [ ] Set the `ENQUIRY_SURFACE_LIVE` const back to `false` and redeploy (code PR; the live build drops the OR while it is false).
- [ ] Pause the Cloudflare Cron Trigger on `grafter-missed-call-sms-tick` only.
- [ ] Set the sender `active` = false.
- [ ] Leave the ten applied files in place unless Coach SIGN asks for a revert of a specific version (`repair --status reverted` then a reviewed follow-up). Do not `db reset` prod.
- [ ] Booking-tick was never deployed. Leave it undeployed.

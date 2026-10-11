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
2. **Edge secrets** — names only in any log. Values stay in the secret store. Never print tokens.
3. **sms-tick wrangler deploy** — reviewed manual `wrangler deploy` of `grafter-missed-call-sms-tick` only. Not booking-tick. wrangler@3 on Node 20.
4. **Twilio webhooks** — messaging + voice-status on sender `PNb67e96dc23fa486ead392be6c92075a3` (`+61485064111`). No Messaging Service.
5. **Flag-on build PR** — `ENQUIRY_SURFACE_LIVE = true` in a separate code PR. Vitest on the flag-on path plus frames of the Jobs **Enquiries** tab and Company Settings **Texting**. Coach SIGN on those frames before the const flip merges.
6. **Smoke** — `+61418893602` **ONLY**: missed call, ack, reply, enquiry appears, STOP, no further texts. Test mode on. Default texts. Allowlist only.

## 0. Before any apply

- [ ] Baseline reconcile r5 is SIGNED. Prod `schema_migrations` matches `docs/operations/baseline-reconcile.md` (CoS proof table).
- [ ] Repair runbook from that doc has been executed (or confirmed unnecessary). PR-J applies only the ten Lane 2 files via `apply_migration` (that records ten new version rows). The 71 old apply-time version rows stay; accept them. Do not `db push`.
- [ ] Do **not** apply 053, 056, 057, 058, 060, 062, remap, or phase_2b. Those stay PARKED as NOT-applied. No stubs. No applied marks.
- [ ] `ENQUIRY_SURFACE_LIVE` is still the const `false` in the live build until step 5.
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

`apply_migration` records each of these ten as a new `schema_migrations` version. It does not replace the 71 old apply-time rows. Accept those 71 rows.

Do not apply any other repo file in this go-live.

## 2. Edge secrets (Coach SIGN)

Set these names on the project. Values stay in the secret store. Never `VITE_*`.
Never print tokens. Names only in any log.

- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`
- `TWILIO_WEBHOOK_URL`
- `TWILIO_VOICE_STATUS_WEBHOOK_URL`
- `MISSED_CALL_SMS_WORKER_SECRET`
- optional: `MISSED_CALL_SMS_WORKER_ID`

Do **not** set `MISSED_CALL_BOOKING_WORKER_SECRET`.
Do **not** set `MISSED_CALL_BOOKING_WORKER_ID`.

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
- [ ] Bind `MISSED_CALL_SMS_WORKER_SECRET` by name. Value stays in the secret store. Never print it. Never `VITE_*`.
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

## 5. Flag-on build PR (Coach SIGN)

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

## 6. Settings row (before smoke)

Insert or update `sms_automation_settings` for the live company.

- [ ] `business_name` set first. GSM-7. 2–20 characters. Jack's approved display name only.
- [ ] Then `enabled`. Do not enable with a null or invalid name.
- [ ] `test_mode` = true. Stays on.
- [ ] `test_allowlist` = `{+61418893602}` only.
- [ ] Caps: hourly `10`, daily `20`, monthly `300`.
- [ ] Default texts only. Custom ack / thanks / HELP needs Jack's OK. The `$` guard rides in PR-J and blocks any `$` in custom replies.

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

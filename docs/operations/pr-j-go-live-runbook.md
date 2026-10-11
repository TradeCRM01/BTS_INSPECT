# PR-J go-live runbook

Checklist only. Coach SIGN on each apply. No `db push`. No prod writes from this PR.

Production is `grafter.com.au` on Supabase `ezszahvwwmbuekpedumf`.
Do not point the live SPA or Twilio callbacks at `fbtmwpkfyjxamxqjxiaq`.

Allowlist stays `+61418893602` only. Default texts only. Custom wording needs Jack's OK.

## 0. Before any apply

- [ ] Baseline reconcile r5 is SIGNED. Prod `schema_migrations` matches `docs/operations/baseline-reconcile.md` (CoS proof table).
- [ ] Repair runbook from that doc has been executed (or confirmed unnecessary). PR-J applies only the ten Lane 2 files via `apply_migration` (that records ten new version rows). The 71 old apply-time version rows stay; accept them. Do not `db push`.
- [ ] Do **not** apply 053, 056, 057, 058, 060, 062, remap, or phase_2b. Those stay pending for Coach (or are no-op stubs). 060 is PARTIAL.
- [ ] `ENQUIRY_SURFACE_LIVE` is still the const `false` in the live build.
- [ ] No Messaging Service. Number SID `PNb67e96dc23fa486ead392be6c92075a3` (`+61485064111`) only.
- [ ] Prod has `pg_cron` 1.6.4, 0 `cron.job` rows, and no `pg_net`. Do not enable `pg_net`. Do not insert Perth reminder `cron.job` rows. Worker ticks are section 5 (Cloudflare Cron Triggers).

## 1. Apply order (one reviewed file, Coach SIGN, `apply_migration`)

Apply these ten files in this order. One file per SIGN. Stop if a file fails.

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

Do not apply any other repo file in this go-live. That includes 053 / 056 / 057 / 058 / 060 (PARTIAL) / 062 (Coach decides apply or stub) and the two organisations-stack no-op stubs.

## 2. Edge secret names only

Set these names on the project. Values stay in the secret store. Never `VITE_*`. Never print tokens.

- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`
- `TWILIO_WEBHOOK_URL`
- `TWILIO_VOICE_STATUS_WEBHOOK_URL`
- `MISSED_CALL_SMS_WORKER_SECRET`
- `MISSED_CALL_BOOKING_WORKER_SECRET`
- optional: `MISSED_CALL_SMS_WORKER_ID`
- optional: `MISSED_CALL_BOOKING_WORKER_ID`

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are supplied by the platform.

## 3. Twilio webhooks

On Incoming Phone Number `PNb67e96dc23fa486ead392be6c92075a3` (`+61485064111`):

| Twilio setting | Method | URL |
| --- | --- | --- |
| Messaging webhook | `POST` | `https://ezszahvwwmbuekpedumf.supabase.co/functions/v1/twilio-inbound` |
| Voice status callback | `POST` | `https://ezszahvwwmbuekpedumf.supabase.co/functions/v1/twilio-voice-status` |

- [ ] No Messaging Service SID.
- [ ] `TWILIO_WEBHOOK_URL` matches the messaging URL byte-for-byte.
- [ ] `TWILIO_VOICE_STATUS_WEBHOOK_URL` matches the voice-status URL byte-for-byte.
- [ ] Existing voice handler is unchanged.

## 4. Sender mapping

- [ ] `organisation_twilio_senders` has one active row for the live company:
  - `phone_e164` = `+61485064111`
  - `provider_sender_sid` = `PNb67e96dc23fa486ead392be6c92075a3`
  - `active` = true
- [ ] No Messaging Service.

## 5. Worker schedules (reviewed step — Coach SIGN)

**Scheduler:** Cloudflare Cron Triggers.  
**Owner:** Jack's Cloudflare account (Pages project `bts-inspect` / `bts-inspect.pages.dev`).

Workers must **not** be dashboard-only. This PR does not add them. After #368 merges, a separate thin PR (**PR-W**) adds source under `workers/missed-call-sms-tick` and `workers/missed-call-booking-tick`. Do not build PR-W yet.

### Why not `pg_cron` + `net.http_post`

Catalog capture query 19 (`pg_extension`) lists `pg_cron` 1.6.4 and does **not** list `pg_net`. Prod has **0** `cron.job` rows. Wiring ticks through `cron.schedule` + `net.http_post` would need:

1. `CREATE EXTENSION pg_net` — explicit reviewed prod write, listed in the apply order if that path is ever chosen
2. Two `cron.schedule` inserts

That is three prod writes. Cloudflare Cron Triggers need **zero** catalog, extension, or `cron.job` writes. Fewest prod changes. GitHub Actions `schedule` is already how Pages deploys (`deploy-pages.yml`) but cannot hold a reliable one-minute cadence, so it is not the worker scheduler.

If Coach later picks `pg_cron` + `net.http_post` instead, stop and add `enable pg_net` as its own SIGN'd apply step before any `cron.schedule`. Do not do that in this go-live.

### PR-W (after #368 merges — do not build in this PR)

A thin follow-up PR. Source plus wrangler config. **No deploy.**

- [ ] `workers/missed-call-sms-tick` and `workers/missed-call-booking-tick`
- [ ] wrangler config with `[triggers] crons = ["* * * * *"]`
- [ ] Secret bindings by name only: `MISSED_CALL_SMS_WORKER_SECRET` and `MISSED_CALL_BOOKING_WORKER_SECRET`
- [ ] `console.error` on 5xx and network failures (do not log `Authorization`, bodies, or phone numbers)
- [ ] Unit tests with a mocked `fetch`
- [ ] No `wrangler deploy` from PR-W

Each tick POSTs one of:

- `https://ezszahvwwmbuekpedumf.supabase.co/functions/v1/missed-call-sms-worker`
- `https://ezszahvwwmbuekpedumf.supabase.co/functions/v1/missed-call-booking-worker`

with `Authorization: Bearer` from that Worker's secret. At most one item per tick (the edge function already enforces that). A `2xx` completes the tick. Retry transport errors and `5xx` on the **next** minute, not in a tight loop.

### PR-J deploy (after PR-W merges — Coach SIGN)

Reviewed **manual** `wrangler deploy` from Jack's Cloudflare account. Not a dashboard Create-Worker click. Not a CI deploy.

- [ ] Coach SIGN on this deploy step.
- [ ] `wrangler deploy` for `missed-call-sms-tick`
- [ ] `wrangler deploy` for `missed-call-booking-tick`
- [ ] Secrets bound by name (`MISSED_CALL_SMS_WORKER_SECRET`, `MISSED_CALL_BOOKING_WORKER_SECRET`). Values stay in the secret store. Never print them. Never `VITE_*`.
- [ ] First ticks after SIGN: one SMS worker POST and one booking worker POST, allowlist only.

## 6. Settings row

Insert or update `sms_automation_settings` for the live company.

- [ ] `business_name` set first. GSM-7. 2–20 characters. Jack's approved display name only.
- [ ] Then `enabled`. Do not enable with a null or invalid name.
- [ ] `test_mode` = true.
- [ ] `test_allowlist` = `{+61418893602}` only.
- [ ] Caps: hourly `10`, daily `20`, monthly `300`.
- [ ] Default texts only. Custom ack / thanks / HELP needs Jack's OK. The `$` guard rides in PR-J and blocks any `$` in custom replies.

## 7. Flag flip (`ENQUIRY_SURFACE_LIVE`)

This is a **code PR**, not an env toggle. `ENQUIRY_SURFACE_LIVE` is a `const` in `src/lib/missedCallEnquiry.ts`. The production build drops the `|| ENQUIRY_SURFACE_LIVE` OR (dead-code elimination while the const is `false`), so the live bundle never takes the flag-on branch. Flipping means changing that const to `true` and deploying that commit.

Do not flip until the pre-flip proof exists on a flag-on preview build (const set `true` in that preview only):

- [ ] Vitest on the flag-on path (Enquiries surface and Texting) is green.
- [ ] Flag-on preview frames prove the output: Jobs **Enquiries** tab, and Company Settings **Texting** (missed-call text-back + replies).
- [ ] Coach SIGN on those frames.
- [ ] Then merge the const flip in a reviewed deploy.

Rollback of the flag is the same kind of change: set the const back to `false` and redeploy.

## 8. Smoke

- [ ] One missed call and one inbound SMS to `+61418893602` only.
- [ ] Confirm one outbound text-back, HELP, and STOP on that number only.
- [ ] No other destination.

## 9. Rollback

- [ ] Set `sms_automation_settings.enabled` = false.
- [ ] Set the `ENQUIRY_SURFACE_LIVE` const back to `false` and redeploy (code PR; the live build drops the OR while it is false).
- [ ] Pause both Cloudflare Cron Triggers (`missed-call-sms-tick` and `missed-call-booking-tick`).
- [ ] Set the sender `active` = false.
- [ ] Leave the ten applied files in place unless Coach SIGN asks for a revert of a specific version (`repair --status reverted` then a reviewed follow-up). Do not `db reset` prod.

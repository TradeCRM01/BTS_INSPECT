# PR-J go-live runbook

Checklist only. Coach SIGN on each apply. No `db push`. No prod writes from this PR.

Production is `grafter.com.au` on Supabase `ezszahvwwmbuekpedumf`.
Do not point the live SPA or Twilio callbacks at `fbtmwpkfyjxamxqjxiaq`.

Allowlist stays `+61418893602` only. Default texts only. Custom wording needs Jack's OK.

## 0. Before any apply

- [ ] Baseline reconcile r3 is SIGNED. Prod `schema_migrations` matches `docs/operations/baseline-reconcile.md` (CoS proof table).
- [ ] Repair runbook from that doc has been executed (or confirmed unnecessary). PR-J still applies only the ten Lane 2 files via `apply_migration`. Do not `db push`.
- [ ] Do **not** apply 053, 056, 057, 058, 062, remap, or phase_2b. Those stay pending for Coach (or are no-op stubs).
- [ ] `ENQUIRY_SURFACE_LIVE` is still the const `false` in the live build.
- [ ] No Messaging Service. Number SID `PNb67e96dc23fa486ead392be6c92075a3` (`+61485064111`) only.
- [ ] Prod `cron.job` is empty (catalog capture query 0). The PR-J worker schedules in section 5 will be the first scheduled jobs. Do not add Perth reminder `pg_cron` rows.

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
| 10 | `20261018000000_sms_reply_filter_hardening.sql` | Phone and `$` guards. |

Do not apply any other repo file in this go-live. That includes 053 / 056 / 057 / 058 / 062 (NOT in prod: Coach decides apply or stub) and the two organisations-stack no-op stubs.

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

## 5. Worker schedules

Prod has zero `cron.job` rows. These two edge-function schedules will be the first jobs on the project. They are not `pg_cron`.

One trusted scheduler. Two jobs. Different secrets. At most one item per tick.

- [ ] `POST https://ezszahvwwmbuekpedumf.supabase.co/functions/v1/missed-call-sms-worker` with `Authorization: Bearer <MISSED_CALL_SMS_WORKER_SECRET>` on a one-minute cadence.
- [ ] `POST https://ezszahvwwmbuekpedumf.supabase.co/functions/v1/missed-call-booking-worker` with `Authorization: Bearer <MISSED_CALL_BOOKING_WORKER_SECRET>` on a one-minute cadence.
- [ ] Scheduler logs omit headers, bodies, and phone numbers.

## 6. Settings row

Insert or update `sms_automation_settings` for the live company.

- [ ] `business_name` set first. GSM-7. 2–20 characters. Jack's approved display name only.
- [ ] Then `enabled`. Do not enable with a null or invalid name.
- [ ] `test_mode` = true.
- [ ] `test_allowlist` = `{+61418893602}` only.
- [ ] Caps: hourly `10`, daily `20`, monthly `300`.
- [ ] Default texts only. Custom ack / thanks / HELP needs Jack's OK.

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
- [ ] Pause both worker schedules.
- [ ] Set the sender `active` = false.
- [ ] Leave the ten applied files in place unless Coach SIGN asks for a revert of a specific version (`repair --status reverted` then a reviewed follow-up). Do not `db reset` prod.

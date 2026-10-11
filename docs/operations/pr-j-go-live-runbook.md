# PR-J go-live runbook

Checklist only. Coach SIGN on each apply. No `db push`. No prod writes from this PR.

Production is `grafter.com.au` on Supabase `ezszahvwwmbuekpedumf`.
Do not point the live SPA or Twilio callbacks at `fbtmwpkfyjxamxqjxiaq`.

Allowlist stays `+61418893602` only. Default texts only. Custom wording needs Jack's OK.

## 0. Before any apply

- [ ] Baseline reconcile is SIGNED. Prod `schema_migrations` matches the table in `docs/operations/baseline-reconcile.md`.
- [ ] Repair runbook from that doc has been executed (or confirmed unnecessary) so apply will see only `20261009`–`20261018`.
- [ ] `ENQUIRY_SURFACE_LIVE` is still `false` in the live build.
- [ ] No Messaging Service. Number SID `PNb67e96dc23fa486ead392be6c92075a3` (`+61485064111`) only.

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

Do not apply any other repo file in this go-live.

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

The live Pages build currently drops the flag-off branch. Do not flip until the pre-flip proof exists.

- [ ] Vitest on the flag-on path (Enquiries surface and Texting chip / replies) is green.
- [ ] Flag-on preview build frames: Enquiries tab, and Company Settings Texting.
- [ ] Coach SIGN on those frames.
- [ ] Then flip `ENQUIRY_SURFACE_LIVE` to `true` in a reviewed deploy.

## 8. Smoke

- [ ] One missed call and one inbound SMS to `+61418893602` only.
- [ ] Confirm one outbound text-back, HELP, and STOP on that number only.
- [ ] No other destination.

## 9. Rollback

- [ ] Set `sms_automation_settings.enabled` = false.
- [ ] Set `ENQUIRY_SURFACE_LIVE` = false and redeploy.
- [ ] Pause both worker schedules.
- [ ] Set the sender `active` = false.
- [ ] Leave the ten applied files in place unless Coach SIGN asks for a revert of a specific version (`repair --status reverted` then a reviewed follow-up). Do not `db reset` prod.

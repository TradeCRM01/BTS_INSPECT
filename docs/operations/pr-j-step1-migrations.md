# PR-J step 1 — Lane 2 migrations

Docs only. Coach SIGN on each file before `apply_migration`. Execute nothing
from this PR. No `db push`. No prod writes. Stop if a file fails.

Hashes are `sha256sum` of the files on `origin/main` at
`796f3b71f6feece170837c6bdd2187103003b40b` (#369). Re-hash the file on disk
before each apply and stop if it differs.

Every verification query below is **read-only**. Do not `SELECT` a worker RPC
(`claim_next_sms_message`, `process_next_missed_call_booking`, the ingest
functions). Catalog only: `to_regclass`, `information_schema.columns`,
`pg_proc`, `pg_policies`, `pg_trigger`, `pg_constraint`, plus the
`schema_migrations` count and newest-name check.

`apply_migration` records a **new apply-time** `version` (the time of the
apply), not the author-time prefix in the file name (`20261009…`). So
`WHERE version = '20261009000000'` (and the other nine author-time prefixes)
returns **0 rows**. Do not treat that as a failed apply. Do **not** insert a
row by hand and do **not** `repair` without Coach review.

### What “71 old rows” means against prod’s 87

Prod has **87** `schema_migrations` rows today.

- **71** of those 87 are the same-name / version-mismatch set: a repo file
  already exists in prod, but prod stored an apply-time timestamp, not the
  author-time 14-digit prefix on the file. Those 71 rows stay. They are not
  “87 minus the ten pending Lane 2 files.”
- The other **16** of 87 are prod-only (9 revert-and-map, 7 keep-applied).

`apply_migration` on the ten Lane 2 files adds **ten new apply-time rows**.
Count goes **87 → 97**. It does not rewrite the 71.

After each file, run this pair. Expected count is 87 + N (88 after file 1,
…, 97 after file 10). Newest `name` matches the file name just applied.

```sql
SELECT count(*) AS n
  FROM supabase_migrations.schema_migrations;

SELECT version, name
  FROM supabase_migrations.schema_migrations
 ORDER BY version DESC
 LIMIT 1;
```

Do not apply 053 / 056 / 057 / 058 / 060 / 062 / remap / phase_2b.

## Order

| # | File | sha256 | Depends on |
| --- | --- | --- | --- |
| 1 | `20261009000000_missed_call_bootstrap_assert.sql` | `77e1777ea670211c0a1509c611853d0b416cc729e07d311851451839b5a1789f` | live `public.companies`; `public.organisations` must be absent |
| 2 | `20261010000000_missed_call_autobook_off.sql` | `20911e51a5eec432809a76329cbb00d75b4ed4b9e4534be08f996c6e412b127f` | file 1; existing `missed_call_sms_threads`, `missed_call_booking_commands`, `missed_calls`, `organisation_twilio_senders`, `ingest_twilio_inbound_sms_ledger`, `communication_preferences`, `communication_preference_events`, `sms_messages`, `missed_call_office_reviews`, `agent_reminders`, `profiles` |
| 3 | `20261011000000_sms_automation_settings.sql` | `a652022ac07a0717565fa0bc865396c267de038559477ef2e202e0e57803437b` | files 1–2; `companies`, `sms_messages`, `profiles`, `is_platform_operator()`, `communication_preferences`, `organisation_twilio_senders`, `agent_reminders` |
| 4 | `20261012000000_companies_time_zone.sql` | `116296377041dd37ee8120d004cf81894a53f0397ddd92691a046d2ee0a423e9` | file 1 (`public.companies`); `pg_timezone_names` |
| 5 | `20261013000000_sms_purpose_copy_consent.sql` | `eafa3edd918278ff8113906eb5876c006e1f63f747e5c51254cb665cdb1e8a53` | files 3 and 4 (`sms_automation_settings`, `companies.time_zone`, `is_iana_time_zone`) |
| 6 | `20261014000000_sms_enquiry_help.sql` | `92ac172edd06de8dd2e590b539bbb25ec8fd5d351c3b202ff8c1d9343491f173` | file 5 (`sms_messages.purpose`, `sms_purpose_allowed`, inbound ingest) |
| 7 | `20261015000000_missed_call_enquiry_draft.sql` | `55d6b398d46db2b96ce91e404264940058fec8f59dad456da1b5fe8a1c6bc921` | file 2 (`missed_call_sms_threads`); `profiles`, `jobs`, `clients` |
| 8 | `20261016000000_sms_textback_admin_write.sql` | `cfe0dcea6cf124ccd90d721f53e2547bf1f3970311db8cd1a87629b70ae146e0` | files 3, 5, 6 (`sms_automation_settings`, `sms_is_gsm7`) |
| 9 | `20261017000000_sms_reply_templates.sql` | `674434bb3b4e4370b6e6946b81718a62d254d0fa0476ea68804bf6249527aa37` | files 5, 6, 8 (`sms_is_gsm7`, `sms_gsm7_length`, display-name save path) |
| 10 | `20261018000000_sms_reply_filter_hardening.sql` | `4ce81a57e41df8b58b777d032fa4f554b8cb08e8baed772b08e1d32e82e59a24` | file 9 (`sms_reply_has_forbidden_word`, `sms_reply_has_link_or_phone`) |

---

## 1. `20261009000000_missed_call_bootstrap_assert.sql`

**sha256:** `77e1777ea670211c0a1509c611853d0b416cc729e07d311851451839b5a1789f`

**Depends on:** live companies stack. Fails if `public.companies` is missing or
`public.organisations` exists.

**Objects:** none created. Assert only.

### SELECTs

```sql
SELECT to_regclass('public.companies') AS companies,
       to_regclass('public.organisations') AS organisations;
```

Expected: `companies` = `companies`. `organisations` = `NULL`.

```sql
SELECT count(*) AS n
  FROM supabase_migrations.schema_migrations;

SELECT version, name
  FROM supabase_migrations.schema_migrations
 ORDER BY version DESC
 LIMIT 1;
```

Expected: `n` = **88**. Newest `name` matches
`20261009000000_missed_call_bootstrap_assert.sql`. `version` is a new
apply-time timestamp, not `20261009000000`.

---

## 2. `20261010000000_missed_call_autobook_off.sql`

**sha256:** `20911e51a5eec432809a76329cbb00d75b4ed4b9e4534be08f996c6e412b127f`

**Depends on:** file 1; existing `public.missed_call_sms_threads`,
`public.missed_call_booking_commands`, `public.missed_calls`,
`public.organisation_twilio_senders`, `public.ingest_twilio_inbound_sms_ledger`,
`public.communication_preferences`, `public.communication_preference_events`,
`public.sms_messages`, `public.missed_call_office_reviews`,
`public.agent_reminders`, `public.profiles`.

**Objects:** default `qualification_required = false`; function
`prevent_missed_call_autobook()`; trigger `prevent_missed_call_autobook` on
`missed_call_booking_commands`; functions `process_next_missed_call_booking(text)`
and `ingest_twilio_inbound_sms(...)` raise or skip auto-book.

### SELECTs

```sql
SELECT column_name, column_default, is_nullable, data_type
  FROM information_schema.columns
 WHERE table_schema = 'public'
   AND table_name = 'missed_call_sms_threads'
   AND column_name = 'qualification_required';
```

Expected: one row. `column_default` is `false`. `is_nullable` = `NO`.
`data_type` = `boolean`.

```sql
SELECT p.proname,
       pg_get_function_identity_arguments(p.oid) AS args
  FROM pg_proc AS p
  JOIN pg_namespace AS n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public'
   AND p.proname IN (
     'prevent_missed_call_autobook',
     'process_next_missed_call_booking',
     'ingest_twilio_inbound_sms'
   )
 ORDER BY p.proname, args;
```

Expected:

| proname | args |
| --- | --- |
| `ingest_twilio_inbound_sms` | `p_provider_account_sid text, p_provider_message_sid text, p_from_phone_e164 text, p_to_phone_e164 text, p_body text, p_is_stop boolean, p_reply_kind text, p_booking_date date, p_booking_time time` |
| `prevent_missed_call_autobook` | `` (empty) |
| `process_next_missed_call_booking` | `p_worker_id text` |

```sql
SELECT pg_get_functiondef(p.oid) AS def
  FROM pg_proc AS p
  JOIN pg_namespace AS n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public'
   AND p.proname IN (
     'prevent_missed_call_autobook',
     'process_next_missed_call_booking'
   );
```

Expected: each `def` contains `auto-book disabled`.

```sql
SELECT t.tgname,
       t.tgrelid::regclass AS table_name,
       pg_get_triggerdef(t.oid) AS definition
  FROM pg_trigger AS t
 WHERE t.tgname = 'prevent_missed_call_autobook'
   AND NOT t.tgisinternal;
```

Expected: one row. `table_name` = `missed_call_booking_commands`.
`definition` is `BEFORE INSERT` … `EXECUTE FUNCTION public.prevent_missed_call_autobook()`.

```sql
SELECT count(*) AS n
  FROM supabase_migrations.schema_migrations;

SELECT version, name
  FROM supabase_migrations.schema_migrations
 ORDER BY version DESC
 LIMIT 1;
```

Expected: `n` = **89**. Newest `name` matches
`20261010000000_missed_call_autobook_off.sql`.

---

## 3. `20261011000000_sms_automation_settings.sql`

**sha256:** `a652022ac07a0717565fa0bc865396c267de038559477ef2e202e0e57803437b`

**Depends on:** files 1–2; `public.companies`, `public.sms_messages`,
`public.profiles`, `public.is_platform_operator()`,
`public.communication_preferences`, `public.organisation_twilio_senders`,
`public.agent_reminders`.

**Objects:** table `sms_automation_settings` (allowlist `+61418893602` only);
index `sms_messages_outbound_cap_idx`; RLS + two policies; functions
`sms_outbound_cap_used(sms_messages, interval)`,
`sms_dispatch_block_reason(sms_messages)`, `sms_dispatch_last_error(text)`,
`maybe_sms_cap_reminder(uuid, text)`, `claim_next_sms_message(text, integer)`,
`authorize_sms_dispatch(uuid, uuid)`. Drops `maybe_sms_cap_reminder(uuid)`.

### SELECTs

```sql
SELECT to_regclass('public.sms_automation_settings');
```

Expected: `sms_automation_settings`.

```sql
SELECT column_name, data_type, column_default, is_nullable
  FROM information_schema.columns
 WHERE table_schema = 'public'
   AND table_name = 'sms_automation_settings'
 ORDER BY ordinal_position;
```

Expected columns, in order: `organisation_id` uuid PK;
`enabled` boolean default `false`; `test_mode` boolean default `true`;
`test_allowlist` ARRAY default `'{}'::text[]`; `forward_from_e164` text null;
`business_name` text null; `daily_message_cap` integer default `20`;
`hourly_message_cap` integer default `10`; `monthly_message_cap` integer default
`300`; `ack_ttl_minutes` integer default `30`; `created_at` / `updated_at`
timestamptz.

```sql
SELECT con.conname, con.contype, pg_get_constraintdef(con.oid) AS definition
  FROM pg_constraint AS con
  JOIN pg_class AS rel ON rel.oid = con.conrelid
  JOIN pg_namespace AS nsp ON nsp.oid = rel.relnamespace
 WHERE nsp.nspname = 'public'
   AND rel.relname = 'sms_automation_settings'
 ORDER BY con.contype, con.conname;
```

Expected names: `sms_automation_settings_pkey` (`p`);
`sms_automation_settings_organisation_id_fkey` (`f`);
`sms_automation_settings_test_allowlist_only` (contains `+61418893602`);
`sms_automation_settings_forward_from_e164_check`;
`sms_automation_settings_business_name_check`;
`sms_automation_settings_caps_positive`.

```sql
SELECT c.relrowsecurity
  FROM pg_class AS c
  JOIN pg_namespace AS n ON n.oid = c.relnamespace
 WHERE n.nspname = 'public'
   AND c.relname = 'sms_automation_settings';
```

Expected: `true`.

```sql
SELECT policyname, cmd, roles
  FROM pg_policies
 WHERE schemaname = 'public'
   AND tablename = 'sms_automation_settings'
 ORDER BY policyname;
```

Expected two rows:

| policyname | cmd |
| --- | --- |
| `Organisation members can view SMS automation settings` | `SELECT` |
| `Platform operators can write SMS automation settings` | `ALL` |

```sql
SELECT indexname, indexdef
  FROM pg_indexes
 WHERE schemaname = 'public'
   AND indexname = 'sms_messages_outbound_cap_idx';
```

Expected: one row on `sms_messages (organisation_id, created_at, id)` with
`direction = 'outbound' AND state IN ('queued', 'claimed', 'sent')`.

```sql
SELECT p.proname,
       pg_get_function_identity_arguments(p.oid) AS args
  FROM pg_proc AS p
  JOIN pg_namespace AS n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public'
   AND p.proname IN (
     'sms_outbound_cap_used',
     'sms_dispatch_block_reason',
     'sms_dispatch_last_error',
     'maybe_sms_cap_reminder',
     'claim_next_sms_message',
     'authorize_sms_dispatch'
   )
 ORDER BY p.proname, args;
```

Expected:

| proname | args |
| --- | --- |
| `authorize_sms_dispatch` | `p_message_id uuid, p_claim_token uuid` |
| `claim_next_sms_message` | `p_worker_id text, p_lease_seconds integer` |
| `maybe_sms_cap_reminder` | `p_organisation_id uuid, p_window text` only — no `(uuid)` leftover |
| `sms_dispatch_block_reason` | `p_message sms_messages` |
| `sms_dispatch_last_error` | `p_reason text` |
| `sms_outbound_cap_used` | `p_message sms_messages, p_window interval` |

```sql
SELECT count(*) AS n
  FROM supabase_migrations.schema_migrations;

SELECT version, name
  FROM supabase_migrations.schema_migrations
 ORDER BY version DESC
 LIMIT 1;
```

Expected: `n` = **90**. Newest `name` matches
`20261011000000_sms_automation_settings.sql`.

---

## 4. `20261012000000_companies_time_zone.sql`

**sha256:** `116296377041dd37ee8120d004cf81894a53f0397ddd92691a046d2ee0a423e9`

**Depends on:** file 1 (`public.companies`); `pg_catalog.pg_timezone_names`.

**Objects:** function `is_iana_time_zone(text)`; column `companies.time_zone`
default `Australia/Brisbane`; constraint `companies_time_zone_iana`.

### SELECTs

```sql
SELECT column_name, data_type, column_default, is_nullable
  FROM information_schema.columns
 WHERE table_schema = 'public'
   AND table_name = 'companies'
   AND column_name = 'time_zone';
```

Expected: `data_type` = `text`. `column_default` contains `Australia/Brisbane`.
`is_nullable` = `NO`. Existing companies receive that default on `ADD COLUMN`.

```sql
SELECT count(*) AS companies,
       count(*) FILTER (WHERE time_zone = 'Australia/Brisbane') AS brisbane,
       count(*) FILTER (WHERE time_zone IS DISTINCT FROM 'Australia/Brisbane') AS other
  FROM public.companies;
```

Expected: `other` = 0. `brisbane` = `companies`. Every existing row is
`Australia/Brisbane`.

```sql
SELECT con.conname, pg_get_constraintdef(con.oid) AS definition
  FROM pg_constraint AS con
  JOIN pg_class AS rel ON rel.oid = con.conrelid
  JOIN pg_namespace AS nsp ON nsp.oid = rel.relnamespace
 WHERE nsp.nspname = 'public'
   AND rel.relname = 'companies'
   AND con.conname = 'companies_time_zone_iana';
```

Expected: one row. `definition` calls `public.is_iana_time_zone(time_zone)`.

```sql
SELECT p.proname,
       pg_get_function_identity_arguments(p.oid) AS args
  FROM pg_proc AS p
  JOIN pg_namespace AS n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public'
   AND p.proname = 'is_iana_time_zone';
```

Expected: one row, args `p_name text`.

```sql
SELECT count(*) AS n
  FROM supabase_migrations.schema_migrations;

SELECT version, name
  FROM supabase_migrations.schema_migrations
 ORDER BY version DESC
 LIMIT 1;
```

Expected: `n` = **91**. Newest `name` matches
`20261012000000_companies_time_zone.sql`.

---

## 5. `20261013000000_sms_purpose_copy_consent.sql`

**sha256:** `eafa3edd918278ff8113906eb5876c006e1f63f747e5c51254cb665cdb1e8a53`

**Depends on:** file 3 (`sms_automation_settings`) and file 4
(`companies.time_zone`, `is_iana_time_zone`).

**Objects:** `sms_messages.purpose` / `segments` / `payload_hash` plus checks;
`sms_is_gsm7` and the ack/thanks/HELP body helpers; tenant-local cap windows;
`sms_outbound_cap_used` re-signed to `(sms_messages, text, timestamptz)`
(interval signature dropped); claim/authorize and inbound ingest **replaced**.
**Creates** `ingest_twilio_voice_status` (absent in prod — this is not a
replace of an existing function).

### SELECTs

```sql
SELECT column_name, data_type, column_default, is_nullable
  FROM information_schema.columns
 WHERE table_schema = 'public'
   AND table_name = 'sms_messages'
   AND column_name IN ('purpose', 'segments', 'payload_hash')
 ORDER BY column_name;
```

Expected:

| column_name | data_type | column_default | is_nullable |
| --- | --- | --- | --- |
| `payload_hash` | `text` | `NULL` | `YES` |
| `purpose` | `text` | `'legacy'::text` | `NO` |
| `segments` | `smallint` | `NULL` | `YES` |

```sql
SELECT con.conname, pg_get_constraintdef(con.oid) AS definition
  FROM pg_constraint AS con
  JOIN pg_class AS rel ON rel.oid = con.conrelid
  JOIN pg_namespace AS nsp ON nsp.oid = rel.relnamespace
 WHERE nsp.nspname = 'public'
   AND rel.relname = 'sms_messages'
   AND con.conname IN (
     'sms_messages_purpose_check',
     'sms_messages_segments_check'
   )
 ORDER BY con.conname;
```

Expected: `purpose` IN (`missed_call_ack`, `enquiry_thanks`, `legacy`).
`segments` IS NULL OR BETWEEN 1 AND 10.

```sql
SELECT con.conname, pg_get_constraintdef(con.oid) AS definition
  FROM pg_constraint AS con
  JOIN pg_class AS rel ON rel.oid = con.conrelid
  JOIN pg_namespace AS nsp ON nsp.oid = rel.relnamespace
 WHERE nsp.nspname = 'public'
   AND rel.relname = 'sms_automation_settings'
   AND con.conname = 'sms_automation_settings_business_name_check';
```

Expected: definition includes `public.sms_is_gsm7(business_name)`.

```sql
SELECT p.proname,
       pg_get_function_identity_arguments(p.oid) AS args
  FROM pg_proc AS p
  JOIN pg_namespace AS n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public'
   AND p.proname IN (
     'sms_tenant_time_zone',
     'sms_payload_hash',
     'sms_gsm7_length',
     'sms_gsm7_segments',
     'sms_is_gsm7',
     'missed_call_ack_body',
     'enquiry_thanks_body',
     'missed_call_help_body',
     'sms_business_name',
     'sms_purpose_allowed',
     'sms_cap_window_bounds',
     'sms_outbound_cap_used',
     'sms_outbound_cap_at',
     'ingest_twilio_voice_status'
   )
 ORDER BY p.proname, args;
```

Expected (interval `sms_outbound_cap_used` is gone):

| proname | args |
| --- | --- |
| `enquiry_thanks_body` | `p_business_name text` |
| `ingest_twilio_voice_status` | `p_provider_account_sid text, p_provider_call_sid text, p_from_phone_e164 text, p_to_phone_e164 text, p_call_status text, p_direction text` |
| `missed_call_ack_body` | `p_business_name text` |
| `missed_call_help_body` | `p_business_name text` |
| `sms_business_name` | `p_organisation_id uuid` |
| `sms_cap_window_bounds` | `p_time_zone text, p_window text, p_now timestamp with time zone` |
| `sms_gsm7_length` | `p_body text` |
| `sms_gsm7_segments` | `p_body text` |
| `sms_is_gsm7` | `p_text text` |
| `sms_outbound_cap_at` | `p_organisation_id uuid, p_window text, p_now timestamp with time zone` |
| `sms_outbound_cap_used` | `p_message sms_messages, p_window text, p_now timestamp with time zone` |
| `sms_payload_hash` | `p_payload text` |
| `sms_purpose_allowed` | `p_message sms_messages` |
| `sms_tenant_time_zone` | `p_organisation_id uuid` |

```sql
SELECT count(*) AS n
  FROM supabase_migrations.schema_migrations;

SELECT version, name
  FROM supabase_migrations.schema_migrations
 ORDER BY version DESC
 LIMIT 1;
```

Expected: `n` = **92**. Newest `name` matches
`20261013000000_sms_purpose_copy_consent.sql`.

---

## 6. `20261014000000_sms_enquiry_help.sql`

**sha256:** `92ac172edd06de8dd2e590b539bbb25ec8fd5d351c3b202ff8c1d9343491f173`

**Depends on:** file 5.

**Objects:** `sms_messages_purpose_check` adds `enquiry_help`;
`sms_purpose_allowed` and `ingest_twilio_inbound_sms` replaced. Does not edit
file 5 on disk.

### SELECTs

```sql
SELECT con.conname, pg_get_constraintdef(con.oid) AS definition
  FROM pg_constraint AS con
  JOIN pg_class AS rel ON rel.oid = con.conrelid
  JOIN pg_namespace AS nsp ON nsp.oid = rel.relnamespace
 WHERE nsp.nspname = 'public'
   AND rel.relname = 'sms_messages'
   AND con.conname = 'sms_messages_purpose_check';
```

Expected: `purpose` IN (`missed_call_ack`, `enquiry_thanks`, `enquiry_help`,
`legacy`).

```sql
SELECT p.proname,
       pg_get_function_identity_arguments(p.oid) AS args
  FROM pg_proc AS p
  JOIN pg_namespace AS n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public'
   AND p.proname IN ('sms_purpose_allowed', 'ingest_twilio_inbound_sms')
 ORDER BY p.proname;
```

Expected: both still present with the same identity arguments as after file 5
(and file 2 for ingest).

```sql
SELECT pg_get_functiondef(p.oid) LIKE '%enquiry_help%' AS mentions_enquiry_help
  FROM pg_proc AS p
  JOIN pg_namespace AS n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public'
   AND p.proname IN ('sms_purpose_allowed', 'ingest_twilio_inbound_sms');
```

Expected: `true` for both.

```sql
SELECT count(*) AS n
  FROM supabase_migrations.schema_migrations;

SELECT version, name
  FROM supabase_migrations.schema_migrations
 ORDER BY version DESC
 LIMIT 1;
```

Expected: `n` = **93**. Newest `name` matches
`20261014000000_sms_enquiry_help.sql`.

---

## 7. `20261015000000_missed_call_enquiry_draft.sql`

**sha256:** `55d6b398d46db2b96ce91e404264940058fec8f59dad456da1b5fe8a1c6bc921`

**Depends on:** file 2 (`missed_call_sms_threads`); `public.profiles`,
`public.jobs`, `public.clients`.

**Objects:** enquiry draft columns on `missed_call_sms_threads`; four
constraints; `approve_missed_call_enquiry(uuid, jsonb, text)` and
`dismiss_missed_call_enquiry(uuid, text, text)` (SECURITY DEFINER, grant to
`authenticated`).

### SELECTs

```sql
SELECT column_name, data_type, column_default, is_nullable
  FROM information_schema.columns
 WHERE table_schema = 'public'
   AND table_name = 'missed_call_sms_threads'
   AND column_name IN (
     'enquiry_status',
     'decided_by',
     'decided_at',
     'dismiss_reason',
     'approved_job_id',
     'decision_idempotency_key'
   )
 ORDER BY column_name;
```

Expected:

| column_name | data_type | column_default | is_nullable |
| --- | --- | --- | --- |
| `approved_job_id` | `uuid` | `NULL` | `YES` |
| `decided_at` | `timestamp with time zone` | `NULL` | `YES` |
| `decided_by` | `uuid` | `NULL` | `YES` |
| `decision_idempotency_key` | `text` | `NULL` | `YES` |
| `dismiss_reason` | `text` | `NULL` | `YES` |
| `enquiry_status` | `text` | `'draft'::text` | `NO` |

```sql
SELECT con.conname, con.contype, pg_get_constraintdef(con.oid) AS definition
  FROM pg_constraint AS con
  JOIN pg_class AS rel ON rel.oid = con.conrelid
  JOIN pg_namespace AS nsp ON nsp.oid = rel.relnamespace
 WHERE nsp.nspname = 'public'
   AND rel.relname = 'missed_call_sms_threads'
   AND con.conname IN (
     'missed_call_sms_threads_enquiry_status_check',
     'missed_call_sms_threads_approved_job_fkey',
     'missed_call_sms_threads_approved_job_id_key',
     'missed_call_sms_threads_decision_idempotency_key_key'
   )
 ORDER BY con.conname;
```

Expected:

| conname | contype | definition contains |
| --- | --- | --- |
| `missed_call_sms_threads_approved_job_fkey` | `f` | `FOREIGN KEY (organisation_id, approved_job_id) REFERENCES jobs(company_id, id)` |
| `missed_call_sms_threads_approved_job_id_key` | `u` | `UNIQUE (approved_job_id)` |
| `missed_call_sms_threads_decision_idempotency_key_key` | `u` | `UNIQUE (decision_idempotency_key)` |
| `missed_call_sms_threads_enquiry_status_check` | `c` | `enquiry_status IN ('draft', 'approved', 'dismissed')` |

```sql
SELECT p.proname,
       pg_get_function_identity_arguments(p.oid) AS args,
       p.prosecdef
  FROM pg_proc AS p
  JOIN pg_namespace AS n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public'
   AND p.proname IN (
     'approve_missed_call_enquiry',
     'dismiss_missed_call_enquiry'
   )
 ORDER BY p.proname;
```

Expected:

| proname | args | prosecdef |
| --- | --- | --- |
| `approve_missed_call_enquiry` | `p_thread_id uuid, p_job jsonb, p_idempotency_key text` | `true` |
| `dismiss_missed_call_enquiry` | `p_thread_id uuid, p_reason text, p_idempotency_key text` | `true` |

```sql
SELECT count(*) AS n
  FROM supabase_migrations.schema_migrations;

SELECT version, name
  FROM supabase_migrations.schema_migrations
 ORDER BY version DESC
 LIMIT 1;
```

Expected: `n` = **94**. Newest `name` matches
`20261015000000_missed_call_enquiry_draft.sql`.

---

## 8. `20261016000000_sms_textback_admin_write.sql`

**sha256:** `cfe0dcea6cf124ccd90d721f53e2547bf1f3970311db8cd1a87629b70ae146e0`

**Depends on:** file 3 (`sms_automation_settings`), file 5 (`sms_is_gsm7`),
file 6 (HELP path already in place; name must be valid before `enabled`).

**Objects:** `sms_display_name_valid(text)`; constraint
`sms_automation_settings_enabled_requires_name`;
`save_sms_textback_settings(boolean, text)`.

### SELECTs

```sql
SELECT p.proname,
       pg_get_function_identity_arguments(p.oid) AS args
  FROM pg_proc AS p
  JOIN pg_namespace AS n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public'
   AND p.proname IN (
     'sms_display_name_valid',
     'save_sms_textback_settings'
   )
 ORDER BY p.proname;
```

Expected:

| proname | args |
| --- | --- |
| `save_sms_textback_settings` | `p_enabled boolean, p_business_name text` |
| `sms_display_name_valid` | `p_name text` |

```sql
SELECT con.conname, pg_get_constraintdef(con.oid) AS definition
  FROM pg_constraint AS con
  JOIN pg_class AS rel ON rel.oid = con.conrelid
  JOIN pg_namespace AS nsp ON nsp.oid = rel.relnamespace
 WHERE nsp.nspname = 'public'
   AND rel.relname = 'sms_automation_settings'
   AND con.conname = 'sms_automation_settings_enabled_requires_name';
```

Expected: one row. `definition` is
`CHECK ((enabled IS NOT TRUE) OR public.sms_display_name_valid(business_name))`.

```sql
SELECT count(*) AS n
  FROM supabase_migrations.schema_migrations;

SELECT version, name
  FROM supabase_migrations.schema_migrations
 ORDER BY version DESC
 LIMIT 1;
```

Expected: `n` = **95**. Newest `name` matches
`20261016000000_sms_textback_admin_write.sql`.

---

## 9. `20261017000000_sms_reply_templates.sql`

**sha256:** `674434bb3b4e4370b6e6946b81718a62d254d0fa0476ea68804bf6249527aa37`

**Depends on:** files 5, 6, and 8 (`sms_is_gsm7`, `sms_gsm7_length`,
`save_sms_textback_settings` path).

**Objects:** columns `ack_template`, `thanks_template`, `help_template` on
`sms_automation_settings`; reply helpers including
`sms_reply_has_forbidden_word` (blocks `$`); `save_sms_reply_templates`;
ingest voice + inbound replaced to use company templates.

### SELECTs

```sql
SELECT column_name, data_type, is_nullable
  FROM information_schema.columns
 WHERE table_schema = 'public'
   AND table_name = 'sms_automation_settings'
   AND column_name IN ('ack_template', 'thanks_template', 'help_template')
 ORDER BY column_name;
```

Expected: three `text` nullable columns.

```sql
SELECT p.proname,
       pg_get_function_identity_arguments(p.oid) AS args
  FROM pg_proc AS p
  JOIN pg_namespace AS n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public'
   AND p.proname IN (
     'sms_reply_has_forbidden_word',
     'sms_reply_has_link_or_phone',
     'sms_reply_ends_with_stop',
     'sms_reply_default_template',
     'sms_reply_render_template',
     'sms_reply_probe_name',
     'sms_reply_template_valid',
     'sms_reply_approved_body',
     'sms_company_reply_body',
     'save_sms_reply_templates'
   )
 ORDER BY p.proname, args;
```

Expected:

| proname | args |
| --- | --- |
| `save_sms_reply_templates` | `p_ack_template text, p_thanks_template text, p_help_template text` |
| `sms_company_reply_body` | `p_organisation_id uuid, p_kind text, p_business_name text` |
| `sms_reply_approved_body` | `p_kind text, p_business_name text` |
| `sms_reply_default_template` | `p_kind text` |
| `sms_reply_ends_with_stop` | `p_template text, p_kind text` |
| `sms_reply_has_forbidden_word` | `p_body text` |
| `sms_reply_has_link_or_phone` | `p_body text` |
| `sms_reply_probe_name` | `p_business_name text` |
| `sms_reply_render_template` | `p_template text, p_business_name text` |
| `sms_reply_template_valid` | `p_template text, p_business_name text, p_kind text` — no leftover `(text, text)` |

```sql
SELECT pg_get_functiondef(p.oid) LIKE '%position(''$'' IN p_body)%' AS blocks_dollar
  FROM pg_proc AS p
  JOIN pg_namespace AS n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public'
   AND p.proname = 'sms_reply_has_forbidden_word';
```

Expected: `true`. The `$` guard rides in PR-J and blocks any `$` in custom replies.

```sql
SELECT count(*) AS n
  FROM supabase_migrations.schema_migrations;

SELECT version, name
  FROM supabase_migrations.schema_migrations
 ORDER BY version DESC
 LIMIT 1;
```

Expected: `n` = **96**. Newest `name` matches
`20261017000000_sms_reply_templates.sql`.

---

## 10. `20261018000000_sms_reply_filter_hardening.sql`

**sha256:** `4ce81a57e41df8b58b777d032fa4f554b8cb08e8baed772b08e1d32e82e59a24`

**Depends on:** file 9.

**Objects:** replaces `sms_reply_has_forbidden_word(text)` (still blocks `$`)
and `sms_reply_has_link_or_phone(text)` (digit count after stripping separators;
spelled-out domains).

### SELECTs

```sql
SELECT p.proname,
       pg_get_function_identity_arguments(p.oid) AS args
  FROM pg_proc AS p
  JOIN pg_namespace AS n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public'
   AND p.proname IN (
     'sms_reply_has_forbidden_word',
     'sms_reply_has_link_or_phone'
   )
 ORDER BY p.proname;
```

Expected: both still `(p_body text)` only.

```sql
SELECT pg_get_functiondef(p.oid) AS def
  FROM pg_proc AS p
  JOIN pg_namespace AS n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public'
   AND p.proname = 'sms_reply_has_forbidden_word';
```

Expected: `def` contains `position('$' IN p_body) > 0`.

```sql
SELECT pg_get_functiondef(p.oid) AS def
  FROM pg_proc AS p
  JOIN pg_namespace AS n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public'
   AND p.proname = 'sms_reply_has_link_or_phone';
```

Expected: `def` contains `regexp_replace` and the spelled-out domain pattern
(`d` / `o0` / `t` … `com|co|au|net|org`).

```sql
SELECT count(*) AS n
  FROM supabase_migrations.schema_migrations;

SELECT version, name
  FROM supabase_migrations.schema_migrations
 ORDER BY version DESC
 LIMIT 1;
```

Expected: `n` = **97**. Newest `name` matches
`20261018000000_sms_reply_filter_hardening.sql`.

---

## After all ten

```sql
SELECT count(*) AS n
  FROM supabase_migrations.schema_migrations;
```

Expected: `n` = **97** (87 today + 10 new apply-time rows). The 71
same-name / version-mismatch rows are still in that 97. The ten author-time
prefixes `20261009`–`20261018` are **not** stored as `version`. No manual
`INSERT` into `schema_migrations` and no `repair` without Coach review.

```sql
SELECT to_regclass('public.organisations') AS organisations;
```

Expected: `NULL`. Live stays on `missed_call_companies_*`.

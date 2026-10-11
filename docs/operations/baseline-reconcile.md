# Baseline reconcile r4

Source of truth: CoS per-file proof (`docs/operations/368-baseline-proof.md`, prod
`ezszahvwwmbuekpedumf`, 2026-10-11 ~21:30 AEST) plus the r3 catalog capture
(`docs/operations/368-catalog-capture.md`, 18 read-only SELECTs). No prod writes. Repair
commands below are a runbook only. Do not execute them from this PR.

r4 is docs only. Migration files are unchanged from r3 (`1d24d49e`). No new RAW log.

## Counts

- Prod rows: 87
- Repo files: 133 (126 + 7 keep-applied catalog stubs; 2 org-stack files are no-op stubs at the same versions)
- Exact version+name match: 7 keep-applied stubs at the prod timestamps
- Same name, version mismatch: 71 (all PROVEN or N/A comment-only). Accept these 71 old prod version rows; `apply_migration` in PR-J only records the ten new Lane 2 versions.
- Same version, name mismatch: 0
- Prod-only: 16 (9 revert-and-map, 7 keep-applied + stub)
- Repo-only non-pending on r1: 45 = **37 PROVEN** + **1 PARTIAL** (060) + **7 MISSING**
- Pending Lane 2 (do not repair): 10 (`20261009`–`20261018`)
- Pending Coach decides (do not repair, do not apply in PR-J): 6 (053 / 056 / 057 / 058 / 060 PARTIAL / 062)
- Pending org-stack no-op stubs (do not repair, do not apply in PR-J): 2 (remap / phase_2b)

## What r2 changed in the repo

- `20260921020000_tradecrm_organisation_remap` and `20260921043000_missed_call_phase_2b` are no-op stubs (`SELECT 1`) at the same versions. Original SQL is in `docs/operations/held-org-stack/`. Why stub in place, not move out: local `db reset` keeps the same timestamp order, and an accidental apply of these versions now runs empty SQL instead of creating organisations-stack objects. Live remains `missed_call_companies_*`.
- Seven keep-applied prod-only versions have repo files at the prod timestamps. r2 bodies were `SELECT 1` marked **PENDING catalog capture**.
- Eighteen `*.sql.sql` files were renamed to `*.sql`. Versions (the leading 14 digits) are unchanged, so `db reset` order does not change.
- `docs/operations/baseline-catalog-queries.sql` is the read-only catalog capture. Includes `cron.job`.

## What r3 changed in the repo

Filled the seven keep-applied stubs from the catalog capture. Definitions are copied, not invented.

- `20260910203517_068_staff_hours` — table, constraints (DO-block guards), 4 policies (`DROP POLICY IF EXISTS` then `CREATE POLICY`), indexes (`CREATE INDEX IF NOT EXISTS`).
- `20260918120319_save_job_dispatch_tables` — `dispatch_*` tables + `jobs.dispatch_ready` / `jobs.dispatch_version` (`ADD COLUMN IF NOT EXISTS`). Earliest version that created those objects.
- `20260918120411_save_job_dispatch` — `save_job_dispatch(jsonb)` from `pg_get_functiondef` verbatim. Earliest version that created the function.
- `20260919114909_save_job_dispatch_clear_times` — `SELECT 1`. Later redefinition; the live body already sits at `20260918120411`.
- `20260919115303_save_job_dispatch_clock_semantics` — `dispatch_json_clock` and `dispatch_time_to_minutes` from `pg_get_functiondef` verbatim.
- `20260911152122_reminders_visibility_tags_tick_only` — `agent_reminders_tagged_tick_only()` plus its trigger, guarded.
- `20260903103230_072_member_tickets_due_invoke` — stays `SELECT 1`. Catalog 5a / 5b / 5c are empty: prod has no ticket function and no `cron.job` row.

## What r4 changed in the repo

Docs only. No SQL.

- PR-J worker schedules named: Cloudflare Cron Triggers on the Pages account. Not `pg_cron` + `pg_net`.
- `060_inspection_due_reminder_autofire` reclassified **PARTIAL** (SQL objects present; Perth `cron.job` rows absent). Coach decision list with 053–062.
- Proof and catalog capture live under `docs/operations/` (no `uploads/` paths).
- GRANTs on the seven stubs were not compared. Read-only check listed below.
- After PR-J, `apply_migration` records the ten new versions; the 71 old apply-time rows stay and are accepted.

## Proof table

`ok` / `sup` / evidence come from the CoS catalog pass. `sup` = object absent but dropped or renamed by a later repo file.

| Class | Repo version | File | Prod version | Status | ok | sup | Missing / evidence |
|---|---|---|---|---|---|---|---|
| version-mismatch | 20260426023532 | 001_companies_and_profiles.sql | 20260806002256 | PROVEN | 6 | 3 |  |
| version-mismatch | 20260426023557 | 002_templates_inspections_photos_reports.sql | 20260806002405 | PROVEN | 13 | 3 |  |
| version-mismatch | 20260426023611 | 003_storage_buckets.sql | 20260806002423 | PROVEN | 1 | 9 |  |
| version-mismatch | 20260426025858 | 004_fix_profiles_rls_recursion.sql | 20260806002504 | PROVEN | 0 | 0 | dropped policy "Company members can view team profiles" absent in prod |
| version-mismatch | 20260427073904 | 005_team_roles_and_permissions.sql | 20260806002524 | PROVEN | 5 | 0 |  |
| version-mismatch | 20260427074427 | 006_allow_admin_role_changes.sql | 20260806002535 | PROVEN | 1 | 0 |  |
| version-mismatch | 20260427101332 | 007_inspections_archived.sql | 20260806002541 | PROVEN | 1 | 0 |  |
| version-mismatch | 20260427115704 | 008_inspection_renderers.sql | 20260806002551 | PROVEN | 5 | 0 |  |
| version-mismatch | 20260427235502 | 009_inspection_job_linking.sql | 20260806002604 | PROVEN | 2 | 0 |  |
| version-mismatch | 20260428003741 | 010_ai_console_sessions.sql | 20260806002622 | PROVEN | 2 | 4 |  |
| version-mismatch | 20260428004712 | 011_admin_query_helpers.sql | 20260806002639 | PROVEN | 0 | 2 |  |
| version-mismatch | 20260428004732 | 012_ai_sessions_all_users.sql | 20260806002647 | PROVEN | 4 | 0 |  |
| version-mismatch | 20260428010331 | 013_ai_settings.sql | 20260806002658 | PROVEN | 4 | 0 |  |
| version-mismatch | 20260428041455 | 014_email_settings.sql | 20260806002709 | PROVEN | 5 | 0 |  |
| version-mismatch | 20260428042802 | 015_profiles_fk_set_null_on_delete.sql | 20260806002719 | PROVEN | 0 | 0 | templates_created_by_fkey / inspections_inspector_id_fkey are ON DELETE SET NULL in prod |
| version-mismatch | 20260428050138 | 016_team_members_with_status.sql | 20260806002728 | PROVEN | 1 | 0 |  |
| version-mismatch | 20260428074645 | 20260428_017_storage_optimization.sql | 20260806002745 | PROVEN | 9 | 0 |  |
| version-mismatch | 20260428075145 | 20260428_018_storage_cleanup_cron.sql | 20260806002752 | PROVEN | 2 | 0 |  |
| version-mismatch | 20260428075224 | 20260428_019_query_optimization.sql | 20260806002759 | PROVEN | 9 | 0 |  |
| version-mismatch | 20260428083004 | 20260428080000_simplify_inspection_rls.sql | 20260806002806 | PROVEN | 3 | 0 |  |
| version-mismatch | 20260428102211 | 20260428_add_inspection_delete_policy.sql | 20260806002811 | PROVEN | 1 | 0 |  |
| version-mismatch | 20260429023020 | fix_reports_fk_cascade_on_delete.sql | 20260806002816 | PROVEN | 0 | 0 | reports_inspection_id_fkey is ON DELETE CASCADE in prod |
| version-mismatch | 20260803092445 | 020_jha_templates_and_documents.sql | 20260806002829 | N/A | 0 | 0 | comment-only file, no DDL |
| version-mismatch | 20260803092510 | 020_jha_templates_and_documents_tables.sql | 20260806002843 | PROVEN | 13 | 0 |  |
| version-mismatch | 20260804043340 | 021_pdf_annotations.sql | 20260806002854 | PROVEN | 7 | 0 |  |
| version-mismatch | 20260804045125 | 022_uploaded_pdfs.sql | 20260806002910 | PROVEN | 16 | 0 |  |
| version-mismatch | 20260804050119 | 023_fix_uploaded_pdfs_storage_policies.sql | 20260806002918 | PROVEN | 0 | 4 |  |
| version-mismatch | 20260804050730 | 024_shared_drive_folders.sql | 20260806002928 | PROVEN | 10 | 0 |  |
| version-mismatch | 20260804051326 | 025_drive_item_positions.sql | 20260806002950 | PROVEN | 6 | 0 |  |
| version-mismatch | 20260804052255 | 026_backup_settings.sql | 20260806002957 | PROVEN | 4 | 0 |  |
| version-mismatch | 20260804053659 | 027_reports_update_policy.sql | 20260806003004 | PROVEN | 1 | 0 |  |
| version-mismatch | 20260804055446 | 028_dashboard_widgets.sql | 20260806003017 | PROVEN | 5 | 0 |  |
| version-mismatch | 20260804063058 | 20260804060000_029_reports_company_id.sql | 20260806003027 | PROVEN | 6 | 0 |  |
| version-mismatch | 20260804074803 | 20260804070000_030_inspections_drive_integration.sql | 20260806003035 | PROVEN | 4 | 0 |  |
| version-mismatch | 20260804090440 | 031_clients_and_jobs.sql | 20260806003054 | PROVEN | 16 | 0 |  |
| version-mismatch | 20260804093515 | 032_job_numbers_and_colors.sql | 20260806003105 | PROVEN | 5 | 0 |  |
| version-mismatch | 20260804231959 | 033_stock_suppliers_pos_quotes_invoices.sql | 20260806003458 | PROVEN | 68 | 0 |  |
| version-mismatch | 20260804233221 | 034_jobs_budget_column.sql | 20260806003513 | PROVEN | 1 | 0 |  |
| version-mismatch | 20260805004607 | 035_simpro_features_assets_contracts_pricebooks_timesheets.sql | 20260806003626 | PROVEN | 52 | 0 |  |
| version-mismatch | 20260805010554 | 036_projects_accounting_portal_barcode_kpi.sql | 20260806003652 | PROVEN | 25 | 0 |  |
| version-mismatch | 20260805040733 | 037_managed_lists.sql | 20260806003708 | PROVEN | 13 | 0 |  |
| version-mismatch | 20260805044108 | 038_compliance_tracker.sql | 20260806003722 | PROVEN | 16 | 0 |  |
| version-mismatch | 20260805045550 | 039_company_default_markup.sql | 20260806003727 | PROVEN | 1 | 0 |  |
| version-mismatch | 20260805051200 | 20260805080000_040_agent_actions_and_reminders.sql | 20260806003739 | PROVEN | 12 | 4 |  |
| version-mismatch | 20260806090000 | 041_seed_lists_on_company_create.sql | 20260806010419 | PROVEN | 2 | 0 |  |
| version-mismatch | 20260821160000 | 059_inspection_due_reminder.sql | 20260910203946 | PROVEN | 12 | 0 |  |
| version-mismatch | 20260821180000 | 060_reports_sent_at.sql | 20261005111149 | PROVEN | 1 | 0 |  |
| version-mismatch | 20260902200000 | 070_public_plan_catalog.sql | 20260903004851 | PROVEN | 0 | 0 | companies_plan_check = crew/company/plant in prod |
| version-mismatch | 20260903040000 | 071_quote_scheduled_date_crew.sql | 20260903033824 | PROVEN | 2 | 0 |  |
| version-mismatch | 20260903123000 | 072_company_owner_admin_lock.sql | 20260903124421 | PROVEN | 12 | 0 |  |
| version-mismatch | 20260903140000 | 073_dashboard_widgets_seeded.sql | 20260904030916 | PROVEN | 1 | 0 |  |
| version-mismatch | 20260903220000 | 074_company_logo_crop.sql | 20260903222416 | PROVEN | 2 | 0 |  |
| version-mismatch | 20260904080000 | 075_member_tickets.sql | 20260904024201 | PROVEN | 8 | 0 |  |
| version-mismatch | 20260911050000 | 077_job_photos.sql | 20260911052813 | PROVEN | 6 | 0 |  |
| version-mismatch | 20260911070000 | 078_job_photo_provenance.sql | 20260911080332 | PROVEN | 6 | 0 |  |
| version-mismatch | 20260911090000 | 079_job_pack_items.sql | 20260911094331 | PROVEN | 5 | 0 |  |
| version-mismatch | 20260911100000 | 080_company_trades.sql | 20260911131315 | PROVEN | 1 | 0 |  |
| version-mismatch | 20260923020000 | missed_call_companies_foundations.sql | 20260923060813 | PROVEN | 25 | 0 |  |
| version-mismatch | 20260923021000 | missed_call_companies_phase_2a.sql | 20260923060848 | PROVEN | 6 | 0 |  |
| version-mismatch | 20260923022000 | missed_call_companies_phase_2b.sql | 20260923061008 | PROVEN | 13 | 0 |  |
| version-mismatch | 20260923023000 | missed_call_companies_phase_2c.sql | 20260923061045 | PROVEN | 15 | 0 |  |
| version-mismatch | 20261005040000 | price_book_csv_import.sql | 20261005041648 | PROVEN | 3 | 0 |  |
| version-mismatch | 20261005070000 | job_visit_notes_outcome.sql | 20261005064912 | PROVEN | 1 | 0 |  |
| version-mismatch | 20261005120000 | quotes_sent_at_chased_at.sql | 20261005081634 | PROVEN | 2 | 0 |  |
| version-mismatch | 20261005130000 | quotes_sent_at_trigger.sql | 20261005082756 | PROVEN | 2 | 0 |  |
| version-mismatch | 20261006020000 | drop_admin_sql_rpcs.sql | 20261006014537 | PROVEN | 0 | 0 | admin_execute/admin_query absent in prod (drop-only) |
| version-mismatch | 20261006130000 | 082_job_cost_timesheet_entry.sql | 20261006121651 | PROVEN | 2 | 0 |  |
| version-mismatch | 20261006140000 | 083_company_default_labour_rate.sql | 20261006123806 | PROVEN | 1 | 0 |  |
| version-mismatch | 20261006150000 | 084_profiles_expense_cost_model_id.sql | 20261006141903 | PROVEN | 2 | 0 |  |
| version-mismatch | 20261006160000 | 085_profile_expense_cost_model_lock.sql | 20261006144316 | PROVEN | 3 | 0 |  |
| version-mismatch | 20261006170000 | 086_invoice_part_payments.sql | 20261006224013 | PROVEN | 9 | 0 |  |
| repo-only | 20260806100000 | 042_stock_transfer_movement.sql |  | PROVEN | 0 | 0 | stock_movements_movement_type_check includes 'transferred' in prod |
| repo-only | 20260807041903 | profile_schedule_color.sql |  | PROVEN | 3 | 0 |  |
| repo-only | 20260807090000 | 043_charge_types_list.sql |  | PROVEN | 1 | 0 |  |
| repo-only | 20260807100000 | 044_quote_variations.sql |  | PROVEN | 5 | 0 |  |
| repo-only | 20260807110000 | 045_job_cost_chargeout.sql |  | PROVEN | 4 | 0 |  |
| repo-only | 20260807120000 | 046_quote_description_variation_packages.sql |  | PROVEN | 8 | 0 |  |
| repo-only | 20260807130000 | 047_expenses.sql |  | PROVEN | 15 | 0 |  |
| repo-only | 20260807140000 | 048_expense_cost_models.sql |  | PROVEN | 12 | 0 |  |
| repo-only | 20260807150000 | 049_expense_model_hours.sql |  | PROVEN | 1 | 0 |  |
| repo-only | 20260807160000 | 050_employee_cost_types_list.sql |  | PROVEN | 1 | 0 |  |
| repo-only | 20260807170000 | 051_cost_model_on_lines.sql |  | PROVEN | 2 | 0 |  |
| repo-only | 20260807180000 | 052_expense_model_time_unit.sql |  | PROVEN | 1 | 0 |  |
| repo-only | 20260807190000 | 053_stc_zone_ranges.sql |  | MISSING | 0 | 2 | stc_zones / stc_zone_ranges tables + indexes absent |
| repo-only | 20260807200000 | 054_solar_quotes.sql |  | PROVEN | 8 | 0 |  |
| repo-only | 20260813110510 | jha_p2_library_versioning.sql |  | PROVEN | 9 | 0 |  |
| repo-only | 20260813111445 | jha_p3_ecosystem.sql |  | PROVEN | 7 | 0 |  |
| repo-only | 20260813113046 | jha_swms_library_crew_signing.sql |  | PROVEN | 6 | 0 |  |
| repo-only | 20260813191830 | inspection_p2_certificate_fidelity.sql |  | PROVEN | 5 | 0 |  |
| repo-only | 20260813193952 | inspection_p3_ecosystem.sql |  | PROVEN | 11 | 0 |  |
| repo-only | 20260814112005 | jha_reports_storage_upsert.sql |  | PROVEN | 0 | 1 |  |
| repo-only | 20260814115005 | profile_saved_signature.sql |  | PROVEN | 1 | 0 |  |
| repo-only | 20260820120000 | 055_invoice_source_quote_unique.sql |  | PROVEN | 3 | 0 |  |
| repo-only | 20260821120000 | 056_job_client_reminder.sql |  | MISSING | 0 | 0 | jobs.client_reminder_sent_at + idx_jobs_company_scheduled_date absent |
| repo-only | 20260821133000 | 057_job_reminder_cron.sql |  | MISSING | 1 | 0 | jobs.client_reminder_sent_for_date absent; cron.job has 0 rows |
| repo-only | 20260821150000 | 058_job_reminder_autofire.sql |  | MISSING | 1 | 0 | send_due_job_client_reminders() absent |
| repo-only | 20260821170000 | 060_inspection_due_reminder_autofire.sql |  | PARTIAL | 1 | 1 | SQL objects present; Perth cron jobs (`job-client-reminder-perth-morning` / `afternoon`) absent (`cron.job` has 0 rows) |
| repo-only | 20260821190000 | 061_invoice_chased_at.sql |  | PROVEN | 1 | 0 |  |
| repo-only | 20260821200000 | 062_job_reminder_edge_autofire.sql |  | MISSING | 1 | 0 | send_due_job_client_reminders()/send_due_inspection_reminders() absent; invoke_job_client_reminders exists |
| repo-only | 20260821210000 | 063_overdue_invoice_chase_autofire.sql |  | PROVEN | 1 | 0 |  |
| repo-only | 20260821220000 | 064_logos_delete_policy.sql |  | PROVEN | 0 | 1 |  |
| repo-only | 20260823120000 | 064_contract_visit_reminder.sql |  | PROVEN | 3 | 0 |  |
| repo-only | 20260823130000 | 065_contract_visit_reminder_autofire.sql |  | PROVEN | 1 | 0 |  |
| repo-only | 20260823140000 | 066_company_payment_methods.sql |  | PROVEN | 1 | 0 |  |
| repo-only | 20260825120000 | 067_platform_operator.sql |  | PROVEN | 20 | 0 |  |
| repo-only | 20260826210000 | 068_job_cost_code.sql |  | PROVEN | 1 | 0 |  |
| repo-only | 20260902120000 | 069_tenant_privacy_floor.sql |  | PROVEN | 20 | 0 |  |
| repo-only | 20260908090000 | 076_job_visit_notes.sql |  | PROVEN | 4 | 0 |  |
| repo-only | 20260911110000 | 081_reminders_visibility_tags.sql |  | PROVEN | 10 | 1 |  |
| repo-only | 20260921020000 | tradecrm_organisation_remap.sql |  | MISSING | 0 | 0 | public.job_visits table, policy, 3 indexes absent (organisations stack; must never run) |
| repo-only | 20260921030132 | missed_call_sms_foundations.sql |  | PROVEN | 21 | 1 |  |
| repo-only | 20260921033336 | missed_call_phase_2a.sql |  | PROVEN | 6 | 0 |  |
| repo-only | 20260921043000 | missed_call_phase_2b.sql |  | MISSING | 11 | 0 | jobs_organisation_id_key / agent_reminders_organisation_id_key absent (organisations stack) |
| repo-only | 20260921050000 | missed_call_phase_2c.sql |  | PROVEN | 15 | 0 |  |
| repo-only | 20260923010000 | organisation_twilio_sender_admin_write.sql |  | PROVEN | 2 | 0 |  |
| repo-only | 20261006230000 | 087_invoice_payments_update_rls.sql |  | PROVEN | 1 | 0 |  |
| pending | 20261009000000 | missed_call_bootstrap_assert.sql |  | N/A (assert) | 0 | 0 | new objects absent:  |
| pending | 20261010000000 | missed_call_autobook_off.sql |  | ABSENT (correct) | 2 | 1 | new objects absent: prevent_missed_call_autobook; CREATE OR REPLACE of existing: public.process_next_missed_call_booking, public.ingest_twilio_inbound_sms |
| pending | 20261011000000 | sms_automation_settings.sql |  | ABSENT (correct) | 2 | 2 | new objects absent: sms_automation_settings, sms_dispatch_block_reason, sms_dispatch_last_error, sms_automation_settings.organisation members can view sms automation settings, sms_automation_settings.platform operators can write sms automation settings, sms_messages_outbound_cap_idx; CREATE OR REPLACE of existing: public.claim_next_sms_message, public.authorize_sms_dispatch |
| pending | 20261012000000 | companies_time_zone.sql |  | ABSENT (correct) | 0 | 0 | new objects absent: companies.time_zone, is_iana_time_zone |
| pending | 20261013000000 | sms_purpose_copy_consent.sql |  | ABSENT (correct) | 4 | 1 | new objects absent: sms_messages.purpose, sms_messages.segments, sms_messages.payload_hash, sms_tenant_time_zone, sms_payload_hash, sms_gsm7_length, sms_gsm7_segments, sms_is_gsm7, missed_call_ack_body, enquiry_thanks_body, missed_call_help_body, sms_business_name, sms_purpose_allowed, sms_cap_window_bounds, sms_outbound_cap_at, sms_dispatch_block_reason, maybe_sms_cap_reminder; CREATE OR REPLACE of existing: public.claim_next_sms_message, public.authorize_sms_dispatch, public.ingest_twilio_voice_status, public.ingest_twilio_inbound_sms |
| pending | 20261014000000 | sms_enquiry_help.sql |  | ABSENT (correct) | 1 | 0 | new objects absent: sms_purpose_allowed; CREATE OR REPLACE of existing: public.ingest_twilio_inbound_sms |
| pending | 20261015000000 | missed_call_enquiry_draft.sql |  | ABSENT (correct) | 0 | 0 | new objects absent: missed_call_sms_threads.enquiry_status, missed_call_sms_threads.decided_by, missed_call_sms_threads.decided_at, missed_call_sms_threads.dismiss_reason, missed_call_sms_threads.approved_job_id, missed_call_sms_threads.decision_idempotency_key, approve_missed_call_enquiry, dismiss_missed_call_enquiry |
| pending | 20261016000000 | sms_textback_admin_write.sql |  | ABSENT (correct) | 0 | 0 | new objects absent: sms_display_name_valid, save_sms_textback_settings |
| pending | 20261017000000 | sms_reply_templates.sql |  | ABSENT (correct) | 2 | 1 | new objects absent: sms_automation_settings.ack_template, sms_automation_settings.thanks_template, sms_automation_settings.help_template, sms_reply_has_forbidden_word, sms_reply_has_link_or_phone, sms_reply_ends_with_stop, sms_reply_default_template, sms_reply_render_template, sms_reply_probe_name, sms_reply_approved_body, sms_company_reply_body, save_sms_reply_templates; CREATE OR REPLACE of existing: public.ingest_twilio_voice_status, public.ingest_twilio_inbound_sms |
| pending | 20261018000000 | sms_reply_filter_hardening.sql |  | ABSENT (correct) | 0 | 0 | new objects absent: sms_reply_has_forbidden_word, sms_reply_has_link_or_phone |


## P1-1 — MISSING / PARTIAL files, do not mark applied

These were in the r1 "mark applied" list (060 was in the r2 PROVEN list). Do not mark them applied. Do not apply them in PR-J.

| Repo version | File | Status | Missing / partial in prod | Action |
| --- | --- | --- | --- | --- |
| 20260807190000 | 053_stc_zone_ranges | MISSING | `stc_zones`, `stc_zone_ranges` | **NOT in prod: needs a reviewed apply or a stub.** Coach decides. Leave pending. |
| 20260821120000 | 056_job_client_reminder | MISSING | `jobs.client_reminder_sent_at`, `idx_jobs_company_scheduled_date` | **NOT in prod: needs a reviewed apply or a stub.** Coach decides. Leave pending. |
| 20260821133000 | 057_job_reminder_cron | MISSING | `jobs.client_reminder_sent_for_date`; `cron.job` has 0 rows | **NOT in prod: needs a reviewed apply or a stub.** Coach decides. Leave pending. |
| 20260821150000 | 058_job_reminder_autofire | MISSING | `send_due_job_client_reminders()` | **NOT in prod: needs a reviewed apply or a stub.** Coach decides. Leave pending. |
| 20260821170000 | 060_inspection_due_reminder_autofire | PARTIAL | SQL objects present; Perth `cron.job` rows absent (`cron.job` has 0 rows) | **PARTIAL: needs a reviewed apply of the cron half, or a stub.** Coach decides. Leave pending. Applying the file would insert Perth `cron.job` rows. |
| 20260821200000 | 062_job_reminder_edge_autofire | MISSING | `send_due_job_client_reminders()`, `send_due_inspection_reminders()` (`invoke_job_client_reminders` exists) | **NOT in prod: needs a reviewed apply or a stub.** Coach decides. Leave pending. |
| 20260921020000 | tradecrm_organisation_remap | MISSING | `public.job_visits` + policy + 3 indexes | No-op stub in place. Original held. Do not mark applied. |
| 20260921043000 | missed_call_phase_2b | MISSING | `jobs_organisation_id_key`, `agent_reminders_organisation_id_key` | No-op stub in place. Original held. Do not mark applied. |

PR-J apply order stays the ten Lane 2 files only. Do not add these.

## P1-2 — sixteen prod-only versions

### Revert and map (9)

Prod version is superseded by a PROVEN repo file. Mark the prod version reverted, then mark the repo version applied.

| Prod version | Prod name | Map to repo | Repair |
| --- | --- | --- | --- |
| 20260903103210 | 072_member_tickets | 075_member_tickets `20260904080000` (PROVEN) | `repair --status reverted 20260903103210` then `repair --status applied 20260904080000` |
| 20260903103536 | 072_member_tickets_company_id_only | 075_member_tickets `20260904080000` (PROVEN) | `repair --status reverted 20260903103536` then `repair --status applied 20260904080000` (075 applied once) |
| 20260908092220 | job_visit_notes | 076_job_visit_notes `20260908090000` (PROVEN) | `repair --status reverted 20260908092220` then `repair --status applied 20260908090000` |
| 20260911150910 | reminders_visibility_tags | 081_reminders_visibility_tags `20260911110000` (PROVEN) | `repair --status reverted 20260911150910` then `repair --status applied 20260911110000` |
| 20260923054317 | organisation_twilio_senders_for_live_app | organisation_twilio_sender_admin_write `20260923010000` (PROVEN) | `repair --status reverted 20260923054317` then `repair --status applied 20260923010000` |
| 20261005173735 | tenant_privacy_floor_069 | 069_tenant_privacy_floor `20260902120000` (PROVEN) | `repair --status reverted 20261005173735` then `repair --status applied 20260902120000` |
| 20261005173747 | tenant_privacy_floor_069_storage | 069 `20260902120000` | `repair --status reverted 20261005173747` (069 applied once) |
| 20261005173758 | tenant_privacy_floor_069_uploaded_pdfs | 069 `20260902120000` | `repair --status reverted 20261005173758` |
| 20261005173801 | tenant_privacy_floor_069_logos_signatures_grants | 069 `20260902120000` | `repair --status reverted 20261005173801` |

075 is already in the version-mismatch applied list (prod `20260904024201`). After reverting the two 072 ticket iterations, still mark `20260904080000` applied (idempotent if already listed).

### Keep applied + catalog stub (7)

Do not revert. Repo files exist at the prod timestamps. r3 filled them from the catalog capture.

| Prod version | Name | Objects | Repo stub |
| --- | --- | --- | --- |
| 20260903103230 | 072_member_tickets_due_invoke | none in prod (5a/5b/5c empty; `cron.job` empty) | `SELECT 1` — nothing to recreate |
| 20260910203517 | 068_staff_hours | `staff_hours` (10 cols) + 6 constraints + 4 policies + 4 indexes | filled, idempotent |
| 20260911152122 | reminders_visibility_tags_tick_only | `agent_reminders_tagged_tick_only()` + trigger | filled, guarded |
| 20260918120319 | save_job_dispatch_tables | `dispatch_*` tables + `jobs.dispatch_ready` / `dispatch_version` | filled, earliest version |
| 20260918120411 | save_job_dispatch | `save_job_dispatch(jsonb)` | filled, `pg_get_functiondef` verbatim |
| 20260919114909 | save_job_dispatch_clear_times | later redefinition of `save_job_dispatch` | `SELECT 1` — live body already at 20411 |
| 20260919115303 | save_job_dispatch_clock_semantics | `dispatch_json_clock`, `dispatch_time_to_minutes` | filled, `pg_get_functiondef` verbatim |

Read-only capture: `docs/operations/baseline-catalog-queries.sql`. Output: `docs/operations/368-catalog-capture.md`.

GRANTs on these seven stubs were **not** compared. Catalog capture did not include `information_schema.role_table_grants` or `routine_privileges`. Before treating the stubs as privilege-complete, Coach runs this read-only check:

```sql
SELECT grantee, table_schema, table_name, privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'public'
  AND table_name IN (
    'staff_hours',
    'dispatch_resources',
    'dispatch_events',
    'dispatch_skills',
    'dispatch_member_qualifications'
  )
ORDER BY table_name, grantee, privilege_type;

SELECT grantee, routine_schema, routine_name, privilege_type
FROM information_schema.routine_privileges
WHERE routine_schema = 'public'
  AND routine_name IN (
    'save_job_dispatch',
    'dispatch_json_clock',
    'dispatch_time_to_minutes',
    'agent_reminders_tagged_tick_only'
  )
ORDER BY routine_name, grantee, privilege_type;
```

## P1-3 — 37 PROVEN repo-only (replace the r1 blanket 45; 060 is PARTIAL)

Mark these applied so a later apply does not replay live objects. Each row is PROVEN. 060 is PARTIAL and is not in this list.

- `supabase migration repair --status applied 20260806100000` — 042_stock_transfer_movement (PROVEN)
- `supabase migration repair --status applied 20260807041903` — profile_schedule_color (PROVEN)
- `supabase migration repair --status applied 20260807090000` — 043_charge_types_list (PROVEN)
- `supabase migration repair --status applied 20260807100000` — 044_quote_variations (PROVEN)
- `supabase migration repair --status applied 20260807110000` — 045_job_cost_chargeout (PROVEN)
- `supabase migration repair --status applied 20260807120000` — 046_quote_description_variation_packages (PROVEN)
- `supabase migration repair --status applied 20260807130000` — 047_expenses (PROVEN)
- `supabase migration repair --status applied 20260807140000` — 048_expense_cost_models (PROVEN)
- `supabase migration repair --status applied 20260807150000` — 049_expense_model_hours (PROVEN)
- `supabase migration repair --status applied 20260807160000` — 050_employee_cost_types_list (PROVEN)
- `supabase migration repair --status applied 20260807170000` — 051_cost_model_on_lines (PROVEN)
- `supabase migration repair --status applied 20260807180000` — 052_expense_model_time_unit (PROVEN)
- `supabase migration repair --status applied 20260807200000` — 054_solar_quotes (PROVEN)
- `supabase migration repair --status applied 20260813110510` — jha_p2_library_versioning (PROVEN)
- `supabase migration repair --status applied 20260813111445` — jha_p3_ecosystem (PROVEN)
- `supabase migration repair --status applied 20260813113046` — jha_swms_library_crew_signing (PROVEN)
- `supabase migration repair --status applied 20260813191830` — inspection_p2_certificate_fidelity (PROVEN)
- `supabase migration repair --status applied 20260813193952` — inspection_p3_ecosystem (PROVEN)
- `supabase migration repair --status applied 20260814112005` — jha_reports_storage_upsert (PROVEN)
- `supabase migration repair --status applied 20260814115005` — profile_saved_signature (PROVEN)
- `supabase migration repair --status applied 20260820120000` — 055_invoice_source_quote_unique (PROVEN)
- `supabase migration repair --status applied 20260821190000` — 061_invoice_chased_at (PROVEN)
- `supabase migration repair --status applied 20260821210000` — 063_overdue_invoice_chase_autofire (PROVEN)
- `supabase migration repair --status applied 20260821220000` — 064_logos_delete_policy (PROVEN)
- `supabase migration repair --status applied 20260823120000` — 064_contract_visit_reminder (PROVEN)
- `supabase migration repair --status applied 20260823130000` — 065_contract_visit_reminder_autofire (PROVEN)
- `supabase migration repair --status applied 20260823140000` — 066_company_payment_methods (PROVEN)
- `supabase migration repair --status applied 20260825120000` — 067_platform_operator (PROVEN)
- `supabase migration repair --status applied 20260826210000` — 068_job_cost_code (PROVEN)
- `supabase migration repair --status applied 20260902120000` — 069_tenant_privacy_floor (PROVEN; maps the four prod-only 069* files)
- `supabase migration repair --status applied 20260908090000` — 076_job_visit_notes (PROVEN; maps prod-only job_visit_notes)
- `supabase migration repair --status applied 20260911110000` — 081_reminders_visibility_tags (PROVEN; maps prod-only reminders_visibility_tags)
- `supabase migration repair --status applied 20260921030132` — missed_call_sms_foundations (PROVEN; organisations-era objects already live, do not re-run)
- `supabase migration repair --status applied 20260921033336` — missed_call_phase_2a (PROVEN; same)
- `supabase migration repair --status applied 20260921050000` — missed_call_phase_2c (PROVEN; same)
- `supabase migration repair --status applied 20260923010000` — organisation_twilio_sender_admin_write (PROVEN; maps prod-only organisation_twilio_senders_for_live_app)
- `supabase migration repair --status applied 20261006230000` — 087_invoice_payments_update_rls (PROVEN)

Do **not** add 053, 056, 057, 058, 060, 062, remap, or phase_2b to this list.

## Repair runbook (do not execute from this PR)

PR-J applies the ten Lane 2 files with `apply_migration`. That command records **new** `schema_migrations` rows (author-time `20261009`–`20261018`). It does not rewrite or drop the 71 existing prod rows whose versions are apply-time timestamps. **Accept those 71 old version rows.** The `--status applied` lines below add the matching repo author-time versions so a later apply does not replay the SQL. They do not replace the old rows.

### `--status applied` — 71 version-mismatch (name match)

Prod already applied the same name under an apply-time timestamp. Mark the repo author-time version applied. Leave the 71 old prod version rows in place.

- `supabase migration repair --status applied 20260426023532` — 001_companies_and_profiles already live as prod `20260806002256` (PROVEN)
- `supabase migration repair --status applied 20260426023557` — 002_templates_inspections_photos_reports already live as prod `20260806002405` (PROVEN)
- `supabase migration repair --status applied 20260426023611` — 003_storage_buckets already live as prod `20260806002423` (PROVEN)
- `supabase migration repair --status applied 20260426025858` — 004_fix_profiles_rls_recursion already live as prod `20260806002504` (PROVEN)
- `supabase migration repair --status applied 20260427073904` — 005_team_roles_and_permissions already live as prod `20260806002524` (PROVEN)
- `supabase migration repair --status applied 20260427074427` — 006_allow_admin_role_changes already live as prod `20260806002535` (PROVEN)
- `supabase migration repair --status applied 20260427101332` — 007_inspections_archived already live as prod `20260806002541` (PROVEN)
- `supabase migration repair --status applied 20260427115704` — 008_inspection_renderers already live as prod `20260806002551` (PROVEN)
- `supabase migration repair --status applied 20260427235502` — 009_inspection_job_linking already live as prod `20260806002604` (PROVEN)
- `supabase migration repair --status applied 20260428003741` — 010_ai_console_sessions already live as prod `20260806002622` (PROVEN)
- `supabase migration repair --status applied 20260428004712` — 011_admin_query_helpers already live as prod `20260806002639` (PROVEN)
- `supabase migration repair --status applied 20260428004732` — 012_ai_sessions_all_users already live as prod `20260806002647` (PROVEN)
- `supabase migration repair --status applied 20260428010331` — 013_ai_settings already live as prod `20260806002658` (PROVEN)
- `supabase migration repair --status applied 20260428041455` — 014_email_settings already live as prod `20260806002709` (PROVEN)
- `supabase migration repair --status applied 20260428042802` — 015_profiles_fk_set_null_on_delete already live as prod `20260806002719` (PROVEN)
- `supabase migration repair --status applied 20260428050138` — 016_team_members_with_status already live as prod `20260806002728` (PROVEN)
- `supabase migration repair --status applied 20260428074645` — 20260428_017_storage_optimization already live as prod `20260806002745` (PROVEN)
- `supabase migration repair --status applied 20260428075145` — 20260428_018_storage_cleanup_cron already live as prod `20260806002752` (PROVEN)
- `supabase migration repair --status applied 20260428075224` — 20260428_019_query_optimization already live as prod `20260806002759` (PROVEN)
- `supabase migration repair --status applied 20260428083004` — 20260428080000_simplify_inspection_rls already live as prod `20260806002806` (PROVEN)
- `supabase migration repair --status applied 20260428102211` — 20260428_add_inspection_delete_policy already live as prod `20260806002811` (PROVEN)
- `supabase migration repair --status applied 20260429023020` — fix_reports_fk_cascade_on_delete already live as prod `20260806002816` (PROVEN)
- `supabase migration repair --status applied 20260803092445` — 020_jha_templates_and_documents already live as prod `20260806002829` (N/A comment-only)
- `supabase migration repair --status applied 20260803092510` — 020_jha_templates_and_documents_tables already live as prod `20260806002843` (PROVEN)
- `supabase migration repair --status applied 20260804043340` — 021_pdf_annotations already live as prod `20260806002854` (PROVEN)
- `supabase migration repair --status applied 20260804045125` — 022_uploaded_pdfs already live as prod `20260806002910` (PROVEN)
- `supabase migration repair --status applied 20260804050119` — 023_fix_uploaded_pdfs_storage_policies already live as prod `20260806002918` (PROVEN)
- `supabase migration repair --status applied 20260804050730` — 024_shared_drive_folders already live as prod `20260806002928` (PROVEN)
- `supabase migration repair --status applied 20260804051326` — 025_drive_item_positions already live as prod `20260806002950` (PROVEN)
- `supabase migration repair --status applied 20260804052255` — 026_backup_settings already live as prod `20260806002957` (PROVEN)
- `supabase migration repair --status applied 20260804053659` — 027_reports_update_policy already live as prod `20260806003004` (PROVEN)
- `supabase migration repair --status applied 20260804055446` — 028_dashboard_widgets already live as prod `20260806003017` (PROVEN)
- `supabase migration repair --status applied 20260804063058` — 20260804060000_029_reports_company_id already live as prod `20260806003027` (PROVEN)
- `supabase migration repair --status applied 20260804074803` — 20260804070000_030_inspections_drive_integration already live as prod `20260806003035` (PROVEN)
- `supabase migration repair --status applied 20260804090440` — 031_clients_and_jobs already live as prod `20260806003054` (PROVEN)
- `supabase migration repair --status applied 20260804093515` — 032_job_numbers_and_colors already live as prod `20260806003105` (PROVEN)
- `supabase migration repair --status applied 20260804231959` — 033_stock_suppliers_pos_quotes_invoices already live as prod `20260806003458` (PROVEN)
- `supabase migration repair --status applied 20260804233221` — 034_jobs_budget_column already live as prod `20260806003513` (PROVEN)
- `supabase migration repair --status applied 20260805004607` — 035_simpro_features_assets_contracts_pricebooks_timesheets already live as prod `20260806003626` (PROVEN)
- `supabase migration repair --status applied 20260805010554` — 036_projects_accounting_portal_barcode_kpi already live as prod `20260806003652` (PROVEN)
- `supabase migration repair --status applied 20260805040733` — 037_managed_lists already live as prod `20260806003708` (PROVEN)
- `supabase migration repair --status applied 20260805044108` — 038_compliance_tracker already live as prod `20260806003722` (PROVEN)
- `supabase migration repair --status applied 20260805045550` — 039_company_default_markup already live as prod `20260806003727` (PROVEN)
- `supabase migration repair --status applied 20260805051200` — 20260805080000_040_agent_actions_and_reminders already live as prod `20260806003739` (PROVEN)
- `supabase migration repair --status applied 20260806090000` — 041_seed_lists_on_company_create already live as prod `20260806010419` (PROVEN)
- `supabase migration repair --status applied 20260902200000` — 070_public_plan_catalog already live as prod `20260903004851` (PROVEN)
- `supabase migration repair --status applied 20260903040000` — 071_quote_scheduled_date_crew already live as prod `20260903033824` (PROVEN)
- `supabase migration repair --status applied 20260903123000` — 072_company_owner_admin_lock already live as prod `20260903124421` (PROVEN)
- `supabase migration repair --status applied 20260903220000` — 074_company_logo_crop already live as prod `20260903222416` (PROVEN)
- `supabase migration repair --status applied 20260904080000` — 075_member_tickets already live as prod `20260904024201` (PROVEN)
- `supabase migration repair --status applied 20260903140000` — 073_dashboard_widgets_seeded already live as prod `20260904030916` (PROVEN)
- `supabase migration repair --status applied 20260821160000` — 059_inspection_due_reminder already live as prod `20260910203946` (PROVEN)
- `supabase migration repair --status applied 20260911050000` — 077_job_photos already live as prod `20260911052813` (PROVEN)
- `supabase migration repair --status applied 20260911070000` — 078_job_photo_provenance already live as prod `20260911080332` (PROVEN)
- `supabase migration repair --status applied 20260911090000` — 079_job_pack_items already live as prod `20260911094331` (PROVEN)
- `supabase migration repair --status applied 20260911100000` — 080_company_trades already live as prod `20260911131315` (PROVEN)
- `supabase migration repair --status applied 20260923020000` — missed_call_companies_foundations already live as prod `20260923060813` (PROVEN)
- `supabase migration repair --status applied 20260923021000` — missed_call_companies_phase_2a already live as prod `20260923060848` (PROVEN)
- `supabase migration repair --status applied 20260923022000` — missed_call_companies_phase_2b already live as prod `20260923061008` (PROVEN)
- `supabase migration repair --status applied 20260923023000` — missed_call_companies_phase_2c already live as prod `20260923061045` (PROVEN)
- `supabase migration repair --status applied 20261005040000` — price_book_csv_import already live as prod `20261005041648` (PROVEN)
- `supabase migration repair --status applied 20261005070000` — job_visit_notes_outcome already live as prod `20261005064912` (PROVEN)
- `supabase migration repair --status applied 20261005120000` — quotes_sent_at_chased_at already live as prod `20261005081634` (PROVEN)
- `supabase migration repair --status applied 20261005130000` — quotes_sent_at_trigger already live as prod `20261005082756` (PROVEN)
- `supabase migration repair --status applied 20260821180000` — 060_reports_sent_at already live as prod `20261005111149` (PROVEN)
- `supabase migration repair --status applied 20261006020000` — drop_admin_sql_rpcs already live as prod `20261006014537` (PROVEN)
- `supabase migration repair --status applied 20261006130000` — 082_job_cost_timesheet_entry already live as prod `20261006121651` (PROVEN)
- `supabase migration repair --status applied 20261006140000` — 083_company_default_labour_rate already live as prod `20261006123806` (PROVEN)
- `supabase migration repair --status applied 20261006150000` — 084_profiles_expense_cost_model_id already live as prod `20261006141903` (PROVEN)
- `supabase migration repair --status applied 20261006160000` — 085_profile_expense_cost_model_lock already live as prod `20261006144316` (PROVEN)
- `supabase migration repair --status applied 20261006170000` — 086_invoice_part_payments already live as prod `20261006224013` (PROVEN)

### `--status reverted` — 9 superseded prod-only

See the P1-2 table. Run the reverted lines first, then the mapped `--status applied` lines.

### Keep applied — 7 prod-only stubs

No repair. Prod versions stay applied. Repo files use those same versions.

### `--status reverted` for a later reviewed apply

Only after Coach SIGN, and only for one of the five stc/reminder files (or a stub instead):

```
supabase migration repair --status reverted <version>
```

is **not** used for those five now — they were never applied. A later SIGN can `apply_migration` one reviewed file, or replace it with a stub. 060 is PARTIAL (objects present, cron absent) and stays off this revert path too.

## cron.job check

Catalog capture query 0 returned `[]`. **Prod has `pg_cron` 1.6.4, zero `cron.job` rows, and no `pg_net`.** Queries 5a / 5b / 5c are also empty: no ticket/due-invoke function and no ticket cron row.

PR-J does **not** insert `cron.job` rows. The worker ticks are Cloudflare Cron Triggers (see `docs/operations/pr-j-go-live-runbook.md` section 5). That is the fewest prod-change option: zero extension writes, zero `cron.job` inserts. `pg_cron` + `net.http_post` would need `CREATE EXTENSION pg_net` as an explicit reviewed prod write plus two `cron.schedule` inserts. Do not do that in PR-J. Do not add Perth reminder `cron.job` rows.

Repo files that call `cron.schedule` (057 / 058 / 060 / 062) are MISSING or, for 060, **PARTIAL**. None of those job names exist in prod (`cron.job` has 0 rows):

| jobname | schedule | 057 command | 058 command | 060 command | 062 command |
| --- | --- | --- | --- | --- | --- |
| job-client-reminder-perth-morning | `0 23 * * *` | `invoke_job_client_reminders()` | `send_due_job_client_reminders()` | `send_due_*` both | `invoke_job_client_reminders()` |
| job-client-reminder-perth-afternoon | `0 8 * * *` | same | same | same | same |

`invoke_job_client_reminders` exists as a function; `send_due_job_client_reminders` and `send_due_inspection_reminders` do not. There is still no cron row that calls either.

Do not change cron from this PR.

## `.sql.sql` rename

Eighteen files were `*.sql.sql`. Renamed to `*.sql`. The leading 14-digit version is unchanged, so `db reset` order is unchanged. Names in `schema_migrations` on a fresh local reset drop the extra `.sql`. Prod names stay as they were (apply-time names without the extra suffix).

## Leave pending (do not repair)

Lane 2 — PR-J apply_migration only:

- `20261009000000_missed_call_bootstrap_assert`
- `20261010000000_missed_call_autobook_off`
- `20261011000000_sms_automation_settings`
- `20261012000000_companies_time_zone`
- `20261013000000_sms_purpose_copy_consent`
- `20261014000000_sms_enquiry_help`
- `20261015000000_missed_call_enquiry_draft`
- `20261016000000_sms_textback_admin_write`
- `20261017000000_sms_reply_templates`
- `20261018000000_sms_reply_filter_hardening`

MISSING / PARTIAL, Coach decides — not PR-J:

- `20260807190000_053_stc_zone_ranges`
- `20260821120000_056_job_client_reminder`
- `20260821133000_057_job_reminder_cron`
- `20260821150000_058_job_reminder_autofire`
- `20260821170000_060_inspection_due_reminder_autofire` (PARTIAL)
- `20260821200000_062_job_reminder_edge_autofire`

Org-stack no-op stubs — not PR-J, not marked applied:

- `20260921020000_tradecrm_organisation_remap`
- `20260921043000_missed_call_phase_2b`

## Gates (r4 — docs only, no new log)

r3 RAW log still stands (`1d24d49e`, md5 `fd893396fb71b02b84bf2d26e8210ec3`). r4 does not change migrations, so no second tee.

- `tsc --noEmit`: unchanged (181)
- vitest: 19 failed | 241 passed (260 files). Same 19 as main. Not a regression from this PR.
- `npm run build`: ok

The 19 vitest fails (look / wiring / theme, pre-existing):

1. `src/pages/dashboardLaptopLook.test.ts`
2. `src/pages/quoteInvoiceSendNextLook.test.ts`
3. `src/pages/quotesEditorTheme.test.ts`
4. `src/lib/formFieldFit.test.ts`
5. `src/lib/inspectionsList.test.ts`
6. `src/lib/invoiceSendClientEmail.test.ts`
7. `src/lib/invoiceSendClientPhone.test.ts`
8. `src/lib/invoiceSheetClientEmail.test.ts`
9. `src/lib/invoiceSheetClientPhone.test.ts`
10. `src/lib/jobReminder.test.ts`
11. `src/lib/jobReminderClientAttach.test.ts`
12. `src/lib/pageAudit.test.ts`
13. `src/lib/quoteSendClientEmail.test.ts`
14. `src/lib/quoteSendClientPhone.test.ts`
15. `src/lib/quoteSendClientWrite.test.ts`
16. `src/lib/sendInvoiceDeliver.test.ts`
17. `src/lib/sendReportDeliver.test.ts`
18. `src/reports/jha/compose.test.ts`
19. `src/reports/take5/theme.test.ts`

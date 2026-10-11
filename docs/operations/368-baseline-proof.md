# PR #368 baseline proof (CoS catalog pass 2026-10-11; PR base a4f03ab5)

Prod `ezszahvwwmbuekpedumf`, read-only `list_migrations` + catalog SELECTs (information_schema, pg_proc, pg_policies, pg_trigger, pg_indexes, pg_type, pg_constraint), 2026-10-11 ~21:30 AEST. No writes.

Objects parsed from each file: CREATE TABLE, ADD COLUMN, CREATE FUNCTION, CREATE POLICY, CREATE TRIGGER, CREATE INDEX, CREATE TYPE ... ENUM. "sup" = object absent but dropped/renamed by a later repo file (expected).

Counts (recomputed): prod 87, repo 126, exact 0, version-mismatch 71, same-version-diff-name 0, prod-only 16, repo-only 55 (45 + 10 pending). Matches Lead.

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
| version-mismatch | 20260804043340 | 021_pdf_annotations.sql.sql | 20260806002854 | PROVEN | 7 | 0 |  |
| version-mismatch | 20260804045125 | 022_uploaded_pdfs.sql.sql | 20260806002910 | PROVEN | 16 | 0 |  |
| version-mismatch | 20260804050119 | 023_fix_uploaded_pdfs_storage_policies.sql.sql | 20260806002918 | PROVEN | 0 | 4 |  |
| version-mismatch | 20260804050730 | 024_shared_drive_folders.sql.sql | 20260806002928 | PROVEN | 10 | 0 |  |
| version-mismatch | 20260804051326 | 025_drive_item_positions.sql.sql | 20260806002950 | PROVEN | 6 | 0 |  |
| version-mismatch | 20260804052255 | 026_backup_settings.sql.sql | 20260806002957 | PROVEN | 4 | 0 |  |
| version-mismatch | 20260804053659 | 027_reports_update_policy.sql.sql | 20260806003004 | PROVEN | 1 | 0 |  |
| version-mismatch | 20260804055446 | 028_dashboard_widgets.sql.sql | 20260806003017 | PROVEN | 5 | 0 |  |
| version-mismatch | 20260804063058 | 20260804060000_029_reports_company_id.sql.sql | 20260806003027 | PROVEN | 6 | 0 |  |
| version-mismatch | 20260804074803 | 20260804070000_030_inspections_drive_integration.sql.sql | 20260806003035 | PROVEN | 4 | 0 |  |
| version-mismatch | 20260804090440 | 031_clients_and_jobs.sql | 20260806003054 | PROVEN | 16 | 0 |  |
| version-mismatch | 20260804093515 | 032_job_numbers_and_colors.sql | 20260806003105 | PROVEN | 5 | 0 |  |
| version-mismatch | 20260804231959 | 033_stock_suppliers_pos_quotes_invoices.sql.sql | 20260806003458 | PROVEN | 68 | 0 |  |
| version-mismatch | 20260804233221 | 034_jobs_budget_column.sql.sql | 20260806003513 | PROVEN | 1 | 0 |  |
| version-mismatch | 20260805004607 | 035_simpro_features_assets_contracts_pricebooks_timesheets.sql.sql | 20260806003626 | PROVEN | 52 | 0 |  |
| version-mismatch | 20260805010554 | 036_projects_accounting_portal_barcode_kpi.sql.sql | 20260806003652 | PROVEN | 25 | 0 |  |
| version-mismatch | 20260805040733 | 037_managed_lists.sql.sql | 20260806003708 | PROVEN | 13 | 0 |  |
| version-mismatch | 20260805044108 | 038_compliance_tracker.sql.sql | 20260806003722 | PROVEN | 16 | 0 |  |
| version-mismatch | 20260805045550 | 039_company_default_markup.sql.sql | 20260806003727 | PROVEN | 1 | 0 |  |
| version-mismatch | 20260805051200 | 20260805080000_040_agent_actions_and_reminders.sql.sql | 20260806003739 | PROVEN | 12 | 4 |  |
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
| repo-only | 20260821133000 | 057_job_reminder_cron.sql |  | MISSING | 1 | 0 | jobs.client_reminder_sent_for_date absent (cron job not verifiable: cron.job outside allowed catalogs) |
| repo-only | 20260821150000 | 058_job_reminder_autofire.sql |  | MISSING | 1 | 0 | send_due_job_client_reminders() absent |
| repo-only | 20260821170000 | 060_inspection_due_reminder_autofire.sql |  | PROVEN | 1 | 1 |  |
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

## Prod-only (16)

| Prod version | Name | Objects in prod | Repo equivalent | Recommendation |
|---|---|---|---|---|
| 20260903103210 | 072_member_tickets | member_tickets + 4 policies | 075_member_tickets (20260904080000, PROVEN) | reverted + map to 075 (superseded iteration) |
| 20260903103230 | 072_member_tickets_due_invoke | due-ticket invoke/cron (not verifiable: cron.job out of scope) | none exact; ticketDueReminder.ts in app | repo stub capturing the invoke function/cron, then keep applied |
| 20260903103536 | 072_member_tickets_company_id_only | member_tickets company-scoped policies | 075_member_tickets | reverted + map to 075 |
| 20260908092220 | job_visit_notes | job_visit_notes + policies | 076_job_visit_notes (PROVEN) | reverted + mark 076 applied (mapping) |
| 20260910203517 | 068_staff_hours | staff_hours table (10 cols) + 4 policies | NONE in repo | REPO STUB required (dump DDL), keep applied; do NOT revert |
| 20260911150910 | reminders_visibility_tags | agent_reminders.visibility etc. | 081_reminders_visibility_tags (PROVEN) | reverted + mark 081 applied |
| 20260911152122 | reminders_visibility_tags_tick_only | agent_reminders_tagged_tick_only() | none (081 does not create it) | REPO STUB required |
| 20260918120319 | save_job_dispatch_tables | dispatch_resources/events/skills/member_qualifications, jobs.dispatch_* cols | NONE in repo | REPO STUB required |
| 20260918120411 | save_job_dispatch | save_job_dispatch(jsonb) | NONE | REPO STUB required |
| 20260919114909 | save_job_dispatch_clear_times | redefines save_job_dispatch | NONE | REPO STUB required |
| 20260919115303 | save_job_dispatch_clock_semantics | dispatch_json_clock, dispatch_time_to_minutes | NONE | REPO STUB required |
| 20260923054317 | organisation_twilio_senders_for_live_app | organisation_twilio_senders + view/insert/update policies | organisation_twilio_sender_admin_write (20260923010000, PROVEN) | reverted + mark 20260923010000 applied (mapping) |
| 20261005173735 | tenant_privacy_floor_069 | privacy floor policies | 069_tenant_privacy_floor (PROVEN) | reverted + mark 069 applied |
| 20261005173747 | tenant_privacy_floor_069_storage | storage policies | 069 (PROVEN) | reverted + map to 069 |
| 20261005173758 | tenant_privacy_floor_069_uploaded_pdfs | uploaded_pdfs policies | 069 (PROVEN) | reverted + map to 069 |
| 20261005173801 | tenant_privacy_floor_069_logos_signatures_grants | logos/signatures policies + grants | 069 (PROVEN) | reverted + map to 069 |

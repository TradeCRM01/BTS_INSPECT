# Baseline reconcile: prod `schema_migrations` vs repo

Read-only `list_migrations` on `ezszahvwwmbuekpedumf` (87 rows, latest `20261006224013` `086_invoice_part_payments`).
No prod writes. Repair commands below are a runbook only. Do not execute them from this PR.

## Counts

- Prod rows: 87
- Repo files: 126
- Exact version+name match: 0
- Same name, version mismatch: 71
- Same version, name mismatch: 0
- Prod-only: 16
- Repo-only: 55
- Pending Lane 2 (leave unrepaired): 10 (`20261009`–`20261018`)

## Table

| Status | Prod version | Prod name | Repo file | Repo version | Note |
| --- | --- | --- | --- | --- | --- |
| version-mismatch | 20260806002256 | 001_companies_and_profiles | 20260426023532_001_companies_and_profiles.sql | 20260426023532 | same name, prod version `20260806002256` vs repo `20260426023532` |
| version-mismatch | 20260806002405 | 002_templates_inspections_photos_reports | 20260426023557_002_templates_inspections_photos_reports.sql | 20260426023557 | same name, prod version `20260806002405` vs repo `20260426023557` |
| version-mismatch | 20260806002423 | 003_storage_buckets | 20260426023611_003_storage_buckets.sql | 20260426023611 | same name, prod version `20260806002423` vs repo `20260426023611` |
| version-mismatch | 20260806002504 | 004_fix_profiles_rls_recursion | 20260426025858_004_fix_profiles_rls_recursion.sql | 20260426025858 | same name, prod version `20260806002504` vs repo `20260426025858` |
| version-mismatch | 20260806002524 | 005_team_roles_and_permissions | 20260427073904_005_team_roles_and_permissions.sql | 20260427073904 | same name, prod version `20260806002524` vs repo `20260427073904` |
| version-mismatch | 20260806002535 | 006_allow_admin_role_changes | 20260427074427_006_allow_admin_role_changes.sql | 20260427074427 | same name, prod version `20260806002535` vs repo `20260427074427` |
| version-mismatch | 20260806002541 | 007_inspections_archived | 20260427101332_007_inspections_archived.sql | 20260427101332 | same name, prod version `20260806002541` vs repo `20260427101332` |
| version-mismatch | 20260806002551 | 008_inspection_renderers | 20260427115704_008_inspection_renderers.sql | 20260427115704 | same name, prod version `20260806002551` vs repo `20260427115704` |
| version-mismatch | 20260806002604 | 009_inspection_job_linking | 20260427235502_009_inspection_job_linking.sql | 20260427235502 | same name, prod version `20260806002604` vs repo `20260427235502` |
| version-mismatch | 20260806002622 | 010_ai_console_sessions | 20260428003741_010_ai_console_sessions.sql | 20260428003741 | same name, prod version `20260806002622` vs repo `20260428003741` |
| version-mismatch | 20260806002639 | 011_admin_query_helpers | 20260428004712_011_admin_query_helpers.sql | 20260428004712 | same name, prod version `20260806002639` vs repo `20260428004712` |
| version-mismatch | 20260806002647 | 012_ai_sessions_all_users | 20260428004732_012_ai_sessions_all_users.sql | 20260428004732 | same name, prod version `20260806002647` vs repo `20260428004732` |
| version-mismatch | 20260806002658 | 013_ai_settings | 20260428010331_013_ai_settings.sql | 20260428010331 | same name, prod version `20260806002658` vs repo `20260428010331` |
| version-mismatch | 20260806002709 | 014_email_settings | 20260428041455_014_email_settings.sql | 20260428041455 | same name, prod version `20260806002709` vs repo `20260428041455` |
| version-mismatch | 20260806002719 | 015_profiles_fk_set_null_on_delete | 20260428042802_015_profiles_fk_set_null_on_delete.sql | 20260428042802 | same name, prod version `20260806002719` vs repo `20260428042802` |
| version-mismatch | 20260806002728 | 016_team_members_with_status | 20260428050138_016_team_members_with_status.sql | 20260428050138 | same name, prod version `20260806002728` vs repo `20260428050138` |
| version-mismatch | 20260806002745 | 20260428_017_storage_optimization | 20260428074645_20260428_017_storage_optimization.sql | 20260428074645 | same name, prod version `20260806002745` vs repo `20260428074645` |
| version-mismatch | 20260806002752 | 20260428_018_storage_cleanup_cron | 20260428075145_20260428_018_storage_cleanup_cron.sql | 20260428075145 | same name, prod version `20260806002752` vs repo `20260428075145` |
| version-mismatch | 20260806002759 | 20260428_019_query_optimization | 20260428075224_20260428_019_query_optimization.sql | 20260428075224 | same name, prod version `20260806002759` vs repo `20260428075224` |
| version-mismatch | 20260806002806 | 20260428080000_simplify_inspection_rls | 20260428083004_20260428080000_simplify_inspection_rls.sql | 20260428083004 | same name, prod version `20260806002806` vs repo `20260428083004` |
| version-mismatch | 20260806002811 | 20260428_add_inspection_delete_policy | 20260428102211_20260428_add_inspection_delete_policy.sql | 20260428102211 | same name, prod version `20260806002811` vs repo `20260428102211` |
| version-mismatch | 20260806002816 | fix_reports_fk_cascade_on_delete | 20260429023020_fix_reports_fk_cascade_on_delete.sql | 20260429023020 | same name, prod version `20260806002816` vs repo `20260429023020` |
| version-mismatch | 20260806002829 | 020_jha_templates_and_documents | 20260803092445_020_jha_templates_and_documents.sql | 20260803092445 | same name, prod version `20260806002829` vs repo `20260803092445` |
| version-mismatch | 20260806002843 | 020_jha_templates_and_documents_tables | 20260803092510_020_jha_templates_and_documents_tables.sql | 20260803092510 | same name, prod version `20260806002843` vs repo `20260803092510` |
| version-mismatch | 20260806002854 | 021_pdf_annotations | 20260804043340_021_pdf_annotations.sql.sql | 20260804043340 | same name, prod version `20260806002854` vs repo `20260804043340` |
| version-mismatch | 20260806002910 | 022_uploaded_pdfs | 20260804045125_022_uploaded_pdfs.sql.sql | 20260804045125 | same name, prod version `20260806002910` vs repo `20260804045125` |
| version-mismatch | 20260806002918 | 023_fix_uploaded_pdfs_storage_policies | 20260804050119_023_fix_uploaded_pdfs_storage_policies.sql.sql | 20260804050119 | same name, prod version `20260806002918` vs repo `20260804050119` |
| version-mismatch | 20260806002928 | 024_shared_drive_folders | 20260804050730_024_shared_drive_folders.sql.sql | 20260804050730 | same name, prod version `20260806002928` vs repo `20260804050730` |
| version-mismatch | 20260806002950 | 025_drive_item_positions | 20260804051326_025_drive_item_positions.sql.sql | 20260804051326 | same name, prod version `20260806002950` vs repo `20260804051326` |
| version-mismatch | 20260806002957 | 026_backup_settings | 20260804052255_026_backup_settings.sql.sql | 20260804052255 | same name, prod version `20260806002957` vs repo `20260804052255` |
| version-mismatch | 20260806003004 | 027_reports_update_policy | 20260804053659_027_reports_update_policy.sql.sql | 20260804053659 | same name, prod version `20260806003004` vs repo `20260804053659` |
| version-mismatch | 20260806003017 | 028_dashboard_widgets | 20260804055446_028_dashboard_widgets.sql.sql | 20260804055446 | same name, prod version `20260806003017` vs repo `20260804055446` |
| version-mismatch | 20260806003027 | 20260804060000_029_reports_company_id | 20260804063058_20260804060000_029_reports_company_id.sql.sql | 20260804063058 | same name, prod version `20260806003027` vs repo `20260804063058` |
| version-mismatch | 20260806003035 | 20260804070000_030_inspections_drive_integration | 20260804074803_20260804070000_030_inspections_drive_integration.sql.sql | 20260804074803 | same name, prod version `20260806003035` vs repo `20260804074803` |
| version-mismatch | 20260806003054 | 031_clients_and_jobs | 20260804090440_031_clients_and_jobs.sql | 20260804090440 | same name, prod version `20260806003054` vs repo `20260804090440` |
| version-mismatch | 20260806003105 | 032_job_numbers_and_colors | 20260804093515_032_job_numbers_and_colors.sql | 20260804093515 | same name, prod version `20260806003105` vs repo `20260804093515` |
| version-mismatch | 20260806003458 | 033_stock_suppliers_pos_quotes_invoices | 20260804231959_033_stock_suppliers_pos_quotes_invoices.sql.sql | 20260804231959 | same name, prod version `20260806003458` vs repo `20260804231959` |
| version-mismatch | 20260806003513 | 034_jobs_budget_column | 20260804233221_034_jobs_budget_column.sql.sql | 20260804233221 | same name, prod version `20260806003513` vs repo `20260804233221` |
| version-mismatch | 20260806003626 | 035_simpro_features_assets_contracts_pricebooks_timesheets | 20260805004607_035_simpro_features_assets_contracts_pricebooks_timesheets.sql.sql | 20260805004607 | same name, prod version `20260806003626` vs repo `20260805004607` |
| version-mismatch | 20260806003652 | 036_projects_accounting_portal_barcode_kpi | 20260805010554_036_projects_accounting_portal_barcode_kpi.sql.sql | 20260805010554 | same name, prod version `20260806003652` vs repo `20260805010554` |
| version-mismatch | 20260806003708 | 037_managed_lists | 20260805040733_037_managed_lists.sql.sql | 20260805040733 | same name, prod version `20260806003708` vs repo `20260805040733` |
| version-mismatch | 20260806003722 | 038_compliance_tracker | 20260805044108_038_compliance_tracker.sql.sql | 20260805044108 | same name, prod version `20260806003722` vs repo `20260805044108` |
| version-mismatch | 20260806003727 | 039_company_default_markup | 20260805045550_039_company_default_markup.sql.sql | 20260805045550 | same name, prod version `20260806003727` vs repo `20260805045550` |
| version-mismatch | 20260806003739 | 20260805080000_040_agent_actions_and_reminders | 20260805051200_20260805080000_040_agent_actions_and_reminders.sql.sql | 20260805051200 | same name, prod version `20260806003739` vs repo `20260805051200` |
| version-mismatch | 20260806010419 | 041_seed_lists_on_company_create | 20260806090000_041_seed_lists_on_company_create.sql | 20260806090000 | same name, prod version `20260806010419` vs repo `20260806090000` |
| version-mismatch | 20260903004851 | 070_public_plan_catalog | 20260902200000_070_public_plan_catalog.sql | 20260902200000 | same name, prod version `20260903004851` vs repo `20260902200000` |
| version-mismatch | 20260903033824 | 071_quote_scheduled_date_crew | 20260903040000_071_quote_scheduled_date_crew.sql | 20260903040000 | same name, prod version `20260903033824` vs repo `20260903040000` |
| prod-only | 20260903103210 | 072_member_tickets |  |  | applied in prod; no repo file |
| prod-only | 20260903103230 | 072_member_tickets_due_invoke |  |  | applied in prod; no repo file |
| prod-only | 20260903103536 | 072_member_tickets_company_id_only |  |  | applied in prod; no repo file |
| version-mismatch | 20260903124421 | 072_company_owner_admin_lock | 20260903123000_072_company_owner_admin_lock.sql | 20260903123000 | same name, prod version `20260903124421` vs repo `20260903123000` |
| version-mismatch | 20260903222416 | 074_company_logo_crop | 20260903220000_074_company_logo_crop.sql | 20260903220000 | same name, prod version `20260903222416` vs repo `20260903220000` |
| version-mismatch | 20260904024201 | 075_member_tickets | 20260904080000_075_member_tickets.sql | 20260904080000 | same name, prod version `20260904024201` vs repo `20260904080000` |
| version-mismatch | 20260904030916 | 073_dashboard_widgets_seeded | 20260903140000_073_dashboard_widgets_seeded.sql | 20260903140000 | same name, prod version `20260904030916` vs repo `20260903140000` |
| prod-only | 20260908092220 | job_visit_notes |  |  | applied in prod; no repo file |
| prod-only | 20260910203517 | 068_staff_hours |  |  | applied in prod; no repo file |
| version-mismatch | 20260910203946 | 059_inspection_due_reminder | 20260821160000_059_inspection_due_reminder.sql | 20260821160000 | same name, prod version `20260910203946` vs repo `20260821160000` |
| version-mismatch | 20260911052813 | 077_job_photos | 20260911050000_077_job_photos.sql | 20260911050000 | same name, prod version `20260911052813` vs repo `20260911050000` |
| version-mismatch | 20260911080332 | 078_job_photo_provenance | 20260911070000_078_job_photo_provenance.sql | 20260911070000 | same name, prod version `20260911080332` vs repo `20260911070000` |
| version-mismatch | 20260911094331 | 079_job_pack_items | 20260911090000_079_job_pack_items.sql | 20260911090000 | same name, prod version `20260911094331` vs repo `20260911090000` |
| version-mismatch | 20260911131315 | 080_company_trades | 20260911100000_080_company_trades.sql | 20260911100000 | same name, prod version `20260911131315` vs repo `20260911100000` |
| prod-only | 20260911150910 | reminders_visibility_tags |  |  | applied in prod; no repo file |
| prod-only | 20260911152122 | reminders_visibility_tags_tick_only |  |  | applied in prod; no repo file |
| prod-only | 20260918120319 | save_job_dispatch_tables |  |  | applied in prod; no repo file |
| prod-only | 20260918120411 | save_job_dispatch |  |  | applied in prod; no repo file |
| prod-only | 20260919114909 | save_job_dispatch_clear_times |  |  | applied in prod; no repo file |
| prod-only | 20260919115303 | save_job_dispatch_clock_semantics |  |  | applied in prod; no repo file |
| prod-only | 20260923054317 | organisation_twilio_senders_for_live_app |  |  | applied in prod; no repo file |
| version-mismatch | 20260923060813 | missed_call_companies_foundations | 20260923020000_missed_call_companies_foundations.sql | 20260923020000 | same name, prod version `20260923060813` vs repo `20260923020000` |
| version-mismatch | 20260923060848 | missed_call_companies_phase_2a | 20260923021000_missed_call_companies_phase_2a.sql | 20260923021000 | same name, prod version `20260923060848` vs repo `20260923021000` |
| version-mismatch | 20260923061008 | missed_call_companies_phase_2b | 20260923022000_missed_call_companies_phase_2b.sql | 20260923022000 | same name, prod version `20260923061008` vs repo `20260923022000` |
| version-mismatch | 20260923061045 | missed_call_companies_phase_2c | 20260923023000_missed_call_companies_phase_2c.sql | 20260923023000 | same name, prod version `20260923061045` vs repo `20260923023000` |
| version-mismatch | 20261005041648 | price_book_csv_import | 20261005040000_price_book_csv_import.sql | 20261005040000 | same name, prod version `20261005041648` vs repo `20261005040000` |
| version-mismatch | 20261005064912 | job_visit_notes_outcome | 20261005070000_job_visit_notes_outcome.sql | 20261005070000 | same name, prod version `20261005064912` vs repo `20261005070000` |
| version-mismatch | 20261005081634 | quotes_sent_at_chased_at | 20261005120000_quotes_sent_at_chased_at.sql | 20261005120000 | same name, prod version `20261005081634` vs repo `20261005120000` |
| version-mismatch | 20261005082756 | quotes_sent_at_trigger | 20261005130000_quotes_sent_at_trigger.sql | 20261005130000 | same name, prod version `20261005082756` vs repo `20261005130000` |
| version-mismatch | 20261005111149 | 060_reports_sent_at | 20260821180000_060_reports_sent_at.sql | 20260821180000 | same name, prod version `20261005111149` vs repo `20260821180000` |
| prod-only | 20261005173735 | tenant_privacy_floor_069 |  |  | applied in prod; no repo file |
| prod-only | 20261005173747 | tenant_privacy_floor_069_storage |  |  | applied in prod; no repo file |
| prod-only | 20261005173758 | tenant_privacy_floor_069_uploaded_pdfs |  |  | applied in prod; no repo file |
| prod-only | 20261005173801 | tenant_privacy_floor_069_logos_signatures_grants |  |  | applied in prod; no repo file |
| version-mismatch | 20261006014537 | drop_admin_sql_rpcs | 20261006020000_drop_admin_sql_rpcs.sql | 20261006020000 | same name, prod version `20261006014537` vs repo `20261006020000` |
| version-mismatch | 20261006121651 | 082_job_cost_timesheet_entry | 20261006130000_082_job_cost_timesheet_entry.sql | 20261006130000 | same name, prod version `20261006121651` vs repo `20261006130000` |
| version-mismatch | 20261006123806 | 083_company_default_labour_rate | 20261006140000_083_company_default_labour_rate.sql | 20261006140000 | same name, prod version `20261006123806` vs repo `20261006140000` |
| version-mismatch | 20261006141903 | 084_profiles_expense_cost_model_id | 20261006150000_084_profiles_expense_cost_model_id.sql | 20261006150000 | same name, prod version `20261006141903` vs repo `20261006150000` |
| version-mismatch | 20261006144316 | 085_profile_expense_cost_model_lock | 20261006160000_085_profile_expense_cost_model_lock.sql | 20261006160000 | same name, prod version `20261006144316` vs repo `20261006160000` |
| version-mismatch | 20261006224013 | 086_invoice_part_payments | 20261006170000_086_invoice_part_payments.sql | 20261006170000 | same name, prod version `20261006224013` vs repo `20261006170000` |
| repo-only |  |  | 20260806100000_042_stock_transfer_movement.sql | 20260806100000 | not Lane 2; do not re-run in this apply |
| repo-only |  |  | 20260807041903_profile_schedule_color.sql | 20260807041903 | not Lane 2; do not re-run in this apply |
| repo-only |  |  | 20260807090000_043_charge_types_list.sql | 20260807090000 | not Lane 2; do not re-run in this apply |
| repo-only |  |  | 20260807100000_044_quote_variations.sql | 20260807100000 | not Lane 2; do not re-run in this apply |
| repo-only |  |  | 20260807110000_045_job_cost_chargeout.sql | 20260807110000 | not Lane 2; do not re-run in this apply |
| repo-only |  |  | 20260807120000_046_quote_description_variation_packages.sql | 20260807120000 | not Lane 2; do not re-run in this apply |
| repo-only |  |  | 20260807130000_047_expenses.sql | 20260807130000 | not Lane 2; do not re-run in this apply |
| repo-only |  |  | 20260807140000_048_expense_cost_models.sql | 20260807140000 | not Lane 2; do not re-run in this apply |
| repo-only |  |  | 20260807150000_049_expense_model_hours.sql | 20260807150000 | not Lane 2; do not re-run in this apply |
| repo-only |  |  | 20260807160000_050_employee_cost_types_list.sql | 20260807160000 | not Lane 2; do not re-run in this apply |
| repo-only |  |  | 20260807170000_051_cost_model_on_lines.sql | 20260807170000 | not Lane 2; do not re-run in this apply |
| repo-only |  |  | 20260807180000_052_expense_model_time_unit.sql | 20260807180000 | not Lane 2; do not re-run in this apply |
| repo-only |  |  | 20260807190000_053_stc_zone_ranges.sql | 20260807190000 | not Lane 2; do not re-run in this apply |
| repo-only |  |  | 20260807200000_054_solar_quotes.sql | 20260807200000 | not Lane 2; do not re-run in this apply |
| repo-only |  |  | 20260813110510_jha_p2_library_versioning.sql | 20260813110510 | not Lane 2; do not re-run in this apply |
| repo-only |  |  | 20260813111445_jha_p3_ecosystem.sql | 20260813111445 | not Lane 2; do not re-run in this apply |
| repo-only |  |  | 20260813113046_jha_swms_library_crew_signing.sql | 20260813113046 | not Lane 2; do not re-run in this apply |
| repo-only |  |  | 20260813191830_inspection_p2_certificate_fidelity.sql | 20260813191830 | not Lane 2; do not re-run in this apply |
| repo-only |  |  | 20260813193952_inspection_p3_ecosystem.sql | 20260813193952 | not Lane 2; do not re-run in this apply |
| repo-only |  |  | 20260814112005_jha_reports_storage_upsert.sql | 20260814112005 | not Lane 2; do not re-run in this apply |
| repo-only |  |  | 20260814115005_profile_saved_signature.sql | 20260814115005 | not Lane 2; do not re-run in this apply |
| repo-only |  |  | 20260820120000_055_invoice_source_quote_unique.sql | 20260820120000 | not Lane 2; do not re-run in this apply |
| repo-only |  |  | 20260821120000_056_job_client_reminder.sql | 20260821120000 | not Lane 2; do not re-run in this apply |
| repo-only |  |  | 20260821133000_057_job_reminder_cron.sql | 20260821133000 | not Lane 2; do not re-run in this apply |
| repo-only |  |  | 20260821150000_058_job_reminder_autofire.sql | 20260821150000 | not Lane 2; do not re-run in this apply |
| repo-only |  |  | 20260821170000_060_inspection_due_reminder_autofire.sql | 20260821170000 | not Lane 2; do not re-run in this apply |
| repo-only |  |  | 20260821190000_061_invoice_chased_at.sql | 20260821190000 | not Lane 2; do not re-run in this apply |
| repo-only |  |  | 20260821200000_062_job_reminder_edge_autofire.sql | 20260821200000 | not Lane 2; do not re-run in this apply |
| repo-only |  |  | 20260821210000_063_overdue_invoice_chase_autofire.sql | 20260821210000 | not Lane 2; do not re-run in this apply |
| repo-only |  |  | 20260821220000_064_logos_delete_policy.sql | 20260821220000 | not Lane 2; do not re-run in this apply |
| repo-only |  |  | 20260823120000_064_contract_visit_reminder.sql | 20260823120000 | not Lane 2; do not re-run in this apply |
| repo-only |  |  | 20260823130000_065_contract_visit_reminder_autofire.sql | 20260823130000 | not Lane 2; do not re-run in this apply |
| repo-only |  |  | 20260823140000_066_company_payment_methods.sql | 20260823140000 | not Lane 2; do not re-run in this apply |
| repo-only |  |  | 20260825120000_067_platform_operator.sql | 20260825120000 | not Lane 2; do not re-run in this apply |
| repo-only |  |  | 20260826210000_068_job_cost_code.sql | 20260826210000 | not Lane 2; do not re-run in this apply |
| repo-only |  |  | 20260902120000_069_tenant_privacy_floor.sql | 20260902120000 | prod-only `tenant_privacy_floor_069*`; already live as split 069 files |
| repo-only |  |  | 20260908090000_076_job_visit_notes.sql | 20260908090000 | prod-only name `job_visit_notes` / `20260908092220`; already live as job_visit_notes |
| repo-only |  |  | 20260911110000_081_reminders_visibility_tags.sql | 20260911110000 | prod-only name `reminders_visibility_tags` / `20260911150910`; already live as reminders_visibility_tags |
| repo-only |  |  | 20260921020000_tradecrm_organisation_remap.sql | 20260921020000 | organisations-stack; live uses missed_call_companies_* |
| repo-only |  |  | 20260921030132_missed_call_sms_foundations.sql | 20260921030132 | organisations-stack; live uses missed_call_companies_* |
| repo-only |  |  | 20260921033336_missed_call_phase_2a.sql | 20260921033336 | organisations-stack; live uses missed_call_companies_* |
| repo-only |  |  | 20260921043000_missed_call_phase_2b.sql | 20260921043000 | organisations-stack; live uses missed_call_companies_* |
| repo-only |  |  | 20260921050000_missed_call_phase_2c.sql | 20260921050000 | organisations-stack; live uses missed_call_companies_* |
| repo-only |  |  | 20260923010000_organisation_twilio_sender_admin_write.sql | 20260923010000 | prod-only `organisation_twilio_senders_for_live_app` / `20260923054317`; already live as companies sender mapping |
| repo-only |  |  | 20261006230000_087_invoice_payments_update_rls.sql | 20261006230000 | not Lane 2; do not re-run in this apply |
| repo-only |  |  | 20261009000000_missed_call_bootstrap_assert.sql | 20261009000000 | PENDING Lane 2 — do not repair |
| repo-only |  |  | 20261010000000_missed_call_autobook_off.sql | 20261010000000 | PENDING Lane 2 — do not repair |
| repo-only |  |  | 20261011000000_sms_automation_settings.sql | 20261011000000 | PENDING Lane 2 — do not repair |
| repo-only |  |  | 20261012000000_companies_time_zone.sql | 20261012000000 | PENDING Lane 2 — do not repair |
| repo-only |  |  | 20261013000000_sms_purpose_copy_consent.sql | 20261013000000 | PENDING Lane 2 — do not repair |
| repo-only |  |  | 20261014000000_sms_enquiry_help.sql | 20261014000000 | PENDING Lane 2 — do not repair |
| repo-only |  |  | 20261015000000_missed_call_enquiry_draft.sql | 20261015000000 | PENDING Lane 2 — do not repair |
| repo-only |  |  | 20261016000000_sms_textback_admin_write.sql | 20261016000000 | PENDING Lane 2 — do not repair |
| repo-only |  |  | 20261017000000_sms_reply_templates.sql | 20261017000000 | PENDING Lane 2 — do not repair |
| repo-only |  |  | 20261018000000_sms_reply_filter_hardening.sql | 20261018000000 | PENDING Lane 2 — do not repair |

## Repair runbook (do not execute from this PR)

These statements are for a later, Coach-signed operator session against prod.
They do not run as part of this PR. They exist so a future apply sees only the
ten Lane 2 files and does not re-run SQL that is already live.

### `--status applied` — name match, version mismatch

Prod already applied the same name under a different timestamp (apply-time vs author-time).
Mark the **repo** version applied so `apply` does not replay it.

- `supabase migration repair --status applied 20260426023532` — `001_companies_and_profiles` already live as prod `20260806002256`.
- `supabase migration repair --status applied 20260426023557` — `002_templates_inspections_photos_reports` already live as prod `20260806002405`.
- `supabase migration repair --status applied 20260426023611` — `003_storage_buckets` already live as prod `20260806002423`.
- `supabase migration repair --status applied 20260426025858` — `004_fix_profiles_rls_recursion` already live as prod `20260806002504`.
- `supabase migration repair --status applied 20260427073904` — `005_team_roles_and_permissions` already live as prod `20260806002524`.
- `supabase migration repair --status applied 20260427074427` — `006_allow_admin_role_changes` already live as prod `20260806002535`.
- `supabase migration repair --status applied 20260427101332` — `007_inspections_archived` already live as prod `20260806002541`.
- `supabase migration repair --status applied 20260427115704` — `008_inspection_renderers` already live as prod `20260806002551`.
- `supabase migration repair --status applied 20260427235502` — `009_inspection_job_linking` already live as prod `20260806002604`.
- `supabase migration repair --status applied 20260428003741` — `010_ai_console_sessions` already live as prod `20260806002622`.
- `supabase migration repair --status applied 20260428004712` — `011_admin_query_helpers` already live as prod `20260806002639`.
- `supabase migration repair --status applied 20260428004732` — `012_ai_sessions_all_users` already live as prod `20260806002647`.
- `supabase migration repair --status applied 20260428010331` — `013_ai_settings` already live as prod `20260806002658`.
- `supabase migration repair --status applied 20260428041455` — `014_email_settings` already live as prod `20260806002709`.
- `supabase migration repair --status applied 20260428042802` — `015_profiles_fk_set_null_on_delete` already live as prod `20260806002719`.
- `supabase migration repair --status applied 20260428050138` — `016_team_members_with_status` already live as prod `20260806002728`.
- `supabase migration repair --status applied 20260428074645` — `20260428_017_storage_optimization` already live as prod `20260806002745`.
- `supabase migration repair --status applied 20260428075145` — `20260428_018_storage_cleanup_cron` already live as prod `20260806002752`.
- `supabase migration repair --status applied 20260428075224` — `20260428_019_query_optimization` already live as prod `20260806002759`.
- `supabase migration repair --status applied 20260428083004` — `20260428080000_simplify_inspection_rls` already live as prod `20260806002806`.
- `supabase migration repair --status applied 20260428102211` — `20260428_add_inspection_delete_policy` already live as prod `20260806002811`.
- `supabase migration repair --status applied 20260429023020` — `fix_reports_fk_cascade_on_delete` already live as prod `20260806002816`.
- `supabase migration repair --status applied 20260803092445` — `020_jha_templates_and_documents` already live as prod `20260806002829`.
- `supabase migration repair --status applied 20260803092510` — `020_jha_templates_and_documents_tables` already live as prod `20260806002843`.
- `supabase migration repair --status applied 20260804043340` — `021_pdf_annotations` already live as prod `20260806002854`.
- `supabase migration repair --status applied 20260804045125` — `022_uploaded_pdfs` already live as prod `20260806002910`.
- `supabase migration repair --status applied 20260804050119` — `023_fix_uploaded_pdfs_storage_policies` already live as prod `20260806002918`.
- `supabase migration repair --status applied 20260804050730` — `024_shared_drive_folders` already live as prod `20260806002928`.
- `supabase migration repair --status applied 20260804051326` — `025_drive_item_positions` already live as prod `20260806002950`.
- `supabase migration repair --status applied 20260804052255` — `026_backup_settings` already live as prod `20260806002957`.
- `supabase migration repair --status applied 20260804053659` — `027_reports_update_policy` already live as prod `20260806003004`.
- `supabase migration repair --status applied 20260804055446` — `028_dashboard_widgets` already live as prod `20260806003017`.
- `supabase migration repair --status applied 20260804063058` — `20260804060000_029_reports_company_id` already live as prod `20260806003027`.
- `supabase migration repair --status applied 20260804074803` — `20260804070000_030_inspections_drive_integration` already live as prod `20260806003035`.
- `supabase migration repair --status applied 20260804090440` — `031_clients_and_jobs` already live as prod `20260806003054`.
- `supabase migration repair --status applied 20260804093515` — `032_job_numbers_and_colors` already live as prod `20260806003105`.
- `supabase migration repair --status applied 20260804231959` — `033_stock_suppliers_pos_quotes_invoices` already live as prod `20260806003458`.
- `supabase migration repair --status applied 20260804233221` — `034_jobs_budget_column` already live as prod `20260806003513`.
- `supabase migration repair --status applied 20260805004607` — `035_simpro_features_assets_contracts_pricebooks_timesheets` already live as prod `20260806003626`.
- `supabase migration repair --status applied 20260805010554` — `036_projects_accounting_portal_barcode_kpi` already live as prod `20260806003652`.
- `supabase migration repair --status applied 20260805040733` — `037_managed_lists` already live as prod `20260806003708`.
- `supabase migration repair --status applied 20260805044108` — `038_compliance_tracker` already live as prod `20260806003722`.
- `supabase migration repair --status applied 20260805045550` — `039_company_default_markup` already live as prod `20260806003727`.
- `supabase migration repair --status applied 20260805051200` — `20260805080000_040_agent_actions_and_reminders` already live as prod `20260806003739`.
- `supabase migration repair --status applied 20260806090000` — `041_seed_lists_on_company_create` already live as prod `20260806010419`.
- `supabase migration repair --status applied 20260902200000` — `070_public_plan_catalog` already live as prod `20260903004851`.
- `supabase migration repair --status applied 20260903040000` — `071_quote_scheduled_date_crew` already live as prod `20260903033824`.
- `supabase migration repair --status applied 20260903123000` — `072_company_owner_admin_lock` already live as prod `20260903124421`.
- `supabase migration repair --status applied 20260903220000` — `074_company_logo_crop` already live as prod `20260903222416`.
- `supabase migration repair --status applied 20260904080000` — `075_member_tickets` already live as prod `20260904024201`.
- `supabase migration repair --status applied 20260903140000` — `073_dashboard_widgets_seeded` already live as prod `20260904030916`.
- `supabase migration repair --status applied 20260821160000` — `059_inspection_due_reminder` already live as prod `20260910203946`.
- `supabase migration repair --status applied 20260911050000` — `077_job_photos` already live as prod `20260911052813`.
- `supabase migration repair --status applied 20260911070000` — `078_job_photo_provenance` already live as prod `20260911080332`.
- `supabase migration repair --status applied 20260911090000` — `079_job_pack_items` already live as prod `20260911094331`.
- `supabase migration repair --status applied 20260911100000` — `080_company_trades` already live as prod `20260911131315`.
- `supabase migration repair --status applied 20260923020000` — `missed_call_companies_foundations` already live as prod `20260923060813`.
- `supabase migration repair --status applied 20260923021000` — `missed_call_companies_phase_2a` already live as prod `20260923060848`.
- `supabase migration repair --status applied 20260923022000` — `missed_call_companies_phase_2b` already live as prod `20260923061008`.
- `supabase migration repair --status applied 20260923023000` — `missed_call_companies_phase_2c` already live as prod `20260923061045`.
- `supabase migration repair --status applied 20261005040000` — `price_book_csv_import` already live as prod `20261005041648`.
- `supabase migration repair --status applied 20261005070000` — `job_visit_notes_outcome` already live as prod `20261005064912`.
- `supabase migration repair --status applied 20261005120000` — `quotes_sent_at_chased_at` already live as prod `20261005081634`.
- `supabase migration repair --status applied 20261005130000` — `quotes_sent_at_trigger` already live as prod `20261005082756`.
- `supabase migration repair --status applied 20260821180000` — `060_reports_sent_at` already live as prod `20261005111149`.
- `supabase migration repair --status applied 20261006020000` — `drop_admin_sql_rpcs` already live as prod `20261006014537`.
- `supabase migration repair --status applied 20261006130000` — `082_job_cost_timesheet_entry` already live as prod `20261006121651`.
- `supabase migration repair --status applied 20261006140000` — `083_company_default_labour_rate` already live as prod `20261006123806`.
- `supabase migration repair --status applied 20261006150000` — `084_profiles_expense_cost_model_id` already live as prod `20261006141903`.
- `supabase migration repair --status applied 20261006160000` — `085_profile_expense_cost_model_lock` already live as prod `20261006144316`.
- `supabase migration repair --status applied 20261006170000` — `086_invoice_part_payments` already live as prod `20261006224013`.

### `--status applied` — same work, different name

Mark the repo version applied. Prod already has the work under the name in the note.

- `supabase migration repair --status applied 20260902120000` — `069_tenant_privacy_floor`: prod-only `tenant_privacy_floor_069*`; already live as split 069 files.
- `supabase migration repair --status applied 20260908090000` — `076_job_visit_notes`: prod-only name `job_visit_notes` / `20260908092220`; already live as job_visit_notes.
- `supabase migration repair --status applied 20260911110000` — `081_reminders_visibility_tags`: prod-only name `reminders_visibility_tags` / `20260911150910`; already live as reminders_visibility_tags.
- `supabase migration repair --status applied 20260923010000` — `organisation_twilio_sender_admin_write`: prod-only `organisation_twilio_senders_for_live_app` / `20260923054317`; already live as companies sender mapping.

### `--status applied` — organisations-stack, not the live companies path

Live prod already has `missed_call_companies_*`. These organisations files must not run.

- `supabase migration repair --status applied 20260921020000` — `tradecrm_organisation_remap`: organisations-stack; live uses missed_call_companies_*.
- `supabase migration repair --status applied 20260921030132` — `missed_call_sms_foundations`: organisations-stack; live uses missed_call_companies_*.
- `supabase migration repair --status applied 20260921033336` — `missed_call_phase_2a`: organisations-stack; live uses missed_call_companies_*.
- `supabase migration repair --status applied 20260921043000` — `missed_call_phase_2b`: organisations-stack; live uses missed_call_companies_*.
- `supabase migration repair --status applied 20260921050000` — `missed_call_phase_2c`: organisations-stack; live uses missed_call_companies_*.

### `--status applied` — repo-only, not Lane 2

Keep these files for local `db reset`. On prod, mark them applied without running
so this apply only ships `20261009`–`20261018`. A later reviewed PR can
`repair --status reverted <version>` and then `apply_migration` that one file.

- `supabase migration repair --status applied 20260806100000` — `042_stock_transfer_movement`: not Lane 2; do not re-run in this apply.
- `supabase migration repair --status applied 20260807041903` — `profile_schedule_color`: not Lane 2; do not re-run in this apply.
- `supabase migration repair --status applied 20260807090000` — `043_charge_types_list`: not Lane 2; do not re-run in this apply.
- `supabase migration repair --status applied 20260807100000` — `044_quote_variations`: not Lane 2; do not re-run in this apply.
- `supabase migration repair --status applied 20260807110000` — `045_job_cost_chargeout`: not Lane 2; do not re-run in this apply.
- `supabase migration repair --status applied 20260807120000` — `046_quote_description_variation_packages`: not Lane 2; do not re-run in this apply.
- `supabase migration repair --status applied 20260807130000` — `047_expenses`: not Lane 2; do not re-run in this apply.
- `supabase migration repair --status applied 20260807140000` — `048_expense_cost_models`: not Lane 2; do not re-run in this apply.
- `supabase migration repair --status applied 20260807150000` — `049_expense_model_hours`: not Lane 2; do not re-run in this apply.
- `supabase migration repair --status applied 20260807160000` — `050_employee_cost_types_list`: not Lane 2; do not re-run in this apply.
- `supabase migration repair --status applied 20260807170000` — `051_cost_model_on_lines`: not Lane 2; do not re-run in this apply.
- `supabase migration repair --status applied 20260807180000` — `052_expense_model_time_unit`: not Lane 2; do not re-run in this apply.
- `supabase migration repair --status applied 20260807190000` — `053_stc_zone_ranges`: not Lane 2; do not re-run in this apply.
- `supabase migration repair --status applied 20260807200000` — `054_solar_quotes`: not Lane 2; do not re-run in this apply.
- `supabase migration repair --status applied 20260813110510` — `jha_p2_library_versioning`: not Lane 2; do not re-run in this apply.
- `supabase migration repair --status applied 20260813111445` — `jha_p3_ecosystem`: not Lane 2; do not re-run in this apply.
- `supabase migration repair --status applied 20260813113046` — `jha_swms_library_crew_signing`: not Lane 2; do not re-run in this apply.
- `supabase migration repair --status applied 20260813191830` — `inspection_p2_certificate_fidelity`: not Lane 2; do not re-run in this apply.
- `supabase migration repair --status applied 20260813193952` — `inspection_p3_ecosystem`: not Lane 2; do not re-run in this apply.
- `supabase migration repair --status applied 20260814112005` — `jha_reports_storage_upsert`: not Lane 2; do not re-run in this apply.
- `supabase migration repair --status applied 20260814115005` — `profile_saved_signature`: not Lane 2; do not re-run in this apply.
- `supabase migration repair --status applied 20260820120000` — `055_invoice_source_quote_unique`: not Lane 2; do not re-run in this apply.
- `supabase migration repair --status applied 20260821120000` — `056_job_client_reminder`: not Lane 2; do not re-run in this apply.
- `supabase migration repair --status applied 20260821133000` — `057_job_reminder_cron`: not Lane 2; do not re-run in this apply.
- `supabase migration repair --status applied 20260821150000` — `058_job_reminder_autofire`: not Lane 2; do not re-run in this apply.
- `supabase migration repair --status applied 20260821170000` — `060_inspection_due_reminder_autofire`: not Lane 2; do not re-run in this apply.
- `supabase migration repair --status applied 20260821190000` — `061_invoice_chased_at`: not Lane 2; do not re-run in this apply.
- `supabase migration repair --status applied 20260821200000` — `062_job_reminder_edge_autofire`: not Lane 2; do not re-run in this apply.
- `supabase migration repair --status applied 20260821210000` — `063_overdue_invoice_chase_autofire`: not Lane 2; do not re-run in this apply.
- `supabase migration repair --status applied 20260821220000` — `064_logos_delete_policy`: not Lane 2; do not re-run in this apply.
- `supabase migration repair --status applied 20260823120000` — `064_contract_visit_reminder`: not Lane 2; do not re-run in this apply.
- `supabase migration repair --status applied 20260823130000` — `065_contract_visit_reminder_autofire`: not Lane 2; do not re-run in this apply.
- `supabase migration repair --status applied 20260823140000` — `066_company_payment_methods`: not Lane 2; do not re-run in this apply.
- `supabase migration repair --status applied 20260825120000` — `067_platform_operator`: not Lane 2; do not re-run in this apply.
- `supabase migration repair --status applied 20260826210000` — `068_job_cost_code`: not Lane 2; do not re-run in this apply.
- `supabase migration repair --status applied 20261006230000` — `087_invoice_payments_update_rls`: not Lane 2; do not re-run in this apply.

### `--status reverted` — not used now

No prod version should be dropped. If a later change needs to run one of the
skipped repo-only files:

```
supabase migration repair --status reverted <version>
```

Then apply that one reviewed file with Coach SIGN.

### Leave pending (do not repair)

- `20261009000000_missed_call_bootstrap_assert` — PENDING Lane 2 — do not repair.
- `20261010000000_missed_call_autobook_off` — PENDING Lane 2 — do not repair.
- `20261011000000_sms_automation_settings` — PENDING Lane 2 — do not repair.
- `20261012000000_companies_time_zone` — PENDING Lane 2 — do not repair.
- `20261013000000_sms_purpose_copy_consent` — PENDING Lane 2 — do not repair.
- `20261014000000_sms_enquiry_help` — PENDING Lane 2 — do not repair.
- `20261015000000_missed_call_enquiry_draft` — PENDING Lane 2 — do not repair.
- `20261016000000_sms_textback_admin_write` — PENDING Lane 2 — do not repair.
- `20261017000000_sms_reply_templates` — PENDING Lane 2 — do not repair.
- `20261018000000_sms_reply_filter_hardening` — PENDING Lane 2 — do not repair.

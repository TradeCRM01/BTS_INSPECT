/*
# JHA Templates and Documents

## Purpose
Adds Job Hazard Analysis (JHA) template editor and document publishing capability.
JHA templates define the structure for creating job safety documents — job detail fields,
risk matrix levels, PPE options, and sign-off roles. JHA documents are filled-out
instances that can be published as polished PDF documents.

## New Tables

### 1. `jha_templates`
Stores JHA template definitions created by company admins.
- `id` — uuid primary key
- `company_id` — references companies(id), scopes templates to a company
- `created_by` — references profiles(id), who created the template
- `name` — template name (e.g. "General Construction JHA")
- `description` — optional description text
- `schema` — JSONB storing the template structure: meta fields, risk levels, PPE options, sign-off roles
- `version` — integer, incremented on updates (default 1)
- `archived` — boolean soft-delete flag (default false)
- `created_at` / `updated_at` — timestamps

### 2. `jha_documents`
Stores filled-out JHA instances created from templates.
- `id` — uuid primary key
- `template_id` — references jha_templates(id), the source template
- `template_snapshot` — JSONB deep copy of the template at creation time (so documents survive template changes)
- `company_id` — references companies(id), scopes documents to a company
- `created_by` — references profiles(id), who created the document
- `status` — text: 'draft' | 'completed' | 'published' (default 'draft')
- `meta` — JSONB: job details (site name, task, date, supervisor, etc.)
- `steps` — JSONB array: each step with description, hazards, controls, risk ratings
- `ppe` — JSONB array: selected PPE items
- `sign_offs` — JSONB array: signature data from required roles
- `report_number` — text, unique generated document number
- `pdf_storage_path` — text, path to published PDF in storage
- `created_at` / `completed_at` — timestamps

## Security
- RLS enabled on both tables.
- 4 policies per table (SELECT/INSERT/UPDATE/DELETE), all scoped to company membership
  via `company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid())`.
- INSERT/UPDATE use WITH CHECK with the same company-membership subquery.
- This matches the existing `templates` table RLS pattern.

## Notes
1. JHA templates use a different schema structure than inspection templates — they store
   risk matrix levels, PPE options, and sign-off roles instead of sections/questions.
2. JHA documents store their data inline (steps, ppe, sign_offs) rather than using a
   separate responses object, because the JHA structure is more rigid.
3. report_number is nullable until the document is published.
*/
-- Inspection P3: CRM linkage + client report share tokens

alter table public.inspections
  add column if not exists client_id uuid references public.clients(id) on delete set null;

alter table public.inspections
  add column if not exists crm_job_id uuid references public.jobs(id) on delete set null;

create index if not exists inspections_client_id_idx
  on public.inspections (client_id)
  where client_id is not null;

create index if not exists inspections_crm_job_id_idx
  on public.inspections (crm_job_id)
  where crm_job_id is not null;

comment on column public.inspections.client_id is 'Optional CRM client link for portal visibility and autofill';
comment on column public.inspections.crm_job_id is 'Optional CRM jobs.id deep-link (distinct from parent_inspection_id job grouping)';

create table if not exists public.inspection_report_shares (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  inspection_id uuid not null references public.inspections(id) on delete cascade,
  token text not null unique,
  expires_at timestamptz,
  revoked boolean not null default false,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  last_accessed_at timestamptz
);

create index if not exists inspection_report_shares_inspection_idx
  on public.inspection_report_shares (inspection_id);

create index if not exists inspection_report_shares_token_idx
  on public.inspection_report_shares (token);

alter table public.inspection_report_shares enable row level security;

drop policy if exists "inspection_report_shares_select" on public.inspection_report_shares;
create policy "inspection_report_shares_select"
  on public.inspection_report_shares for select
  to authenticated
  using (
    company_id = (select company_id from public.profiles where id = auth.uid())
  );

drop policy if exists "inspection_report_shares_insert" on public.inspection_report_shares;
create policy "inspection_report_shares_insert"
  on public.inspection_report_shares for insert
  to authenticated
  with check (
    company_id = (select company_id from public.profiles where id = auth.uid())
  );

drop policy if exists "inspection_report_shares_update" on public.inspection_report_shares;
create policy "inspection_report_shares_update"
  on public.inspection_report_shares for update
  to authenticated
  using (
    company_id = (select company_id from public.profiles where id = auth.uid())
  )
  with check (
    company_id = (select company_id from public.profiles where id = auth.uid())
  );

drop policy if exists "inspection_report_shares_delete" on public.inspection_report_shares;
create policy "inspection_report_shares_delete"
  on public.inspection_report_shares for delete
  to authenticated
  using (
    company_id = (select company_id from public.profiles where id = auth.uid())
  );

comment on table public.inspection_report_shares is 'Magic-link tokens for clients to view a finished inspection report PDF without logging in';

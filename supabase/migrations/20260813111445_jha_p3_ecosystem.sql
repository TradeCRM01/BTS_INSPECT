-- JHA P3: Take 5 companion records linked to parent JHA documents

create table if not exists public.jha_take5 (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  jha_document_id uuid not null references public.jha_documents(id) on delete cascade,
  created_by uuid references public.profiles(id) on delete set null,
  status text not null default 'draft'
    check (status in ('draft', 'completed')),
  meta jsonb not null default '{}'::jsonb,
  stop_think text not null default '',
  identify_hazards text not null default '',
  assess_risk text not null default '',
  control_actions text not null default '',
  go_no_go text not null default 'go'
    check (go_no_go in ('go', 'stop')),
  signed_name text,
  signature text,
  signed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists jha_take5_jha_document_id_idx on public.jha_take5 (jha_document_id);
create index if not exists jha_take5_company_id_idx on public.jha_take5 (company_id);

alter table public.jha_take5 enable row level security;

create policy "jha_take5_select_company"
  on public.jha_take5 for select
  using (company_id = (select company_id from public.profiles where id = auth.uid()));

create policy "jha_take5_insert_company"
  on public.jha_take5 for insert
  with check (company_id = (select company_id from public.profiles where id = auth.uid()));

create policy "jha_take5_update_company"
  on public.jha_take5 for update
  using (company_id = (select company_id from public.profiles where id = auth.uid()))
  with check (company_id = (select company_id from public.profiles where id = auth.uid()));

create policy "jha_take5_delete_company"
  on public.jha_take5 for delete
  using (company_id = (select company_id from public.profiles where id = auth.uid()));

comment on table public.jha_take5 is 'Point-of-work Take 5 / POWRA companion; supplements parent JHA, never replaces it';

-- JHA: company SWMS PDF library + crew remote-sign invites

create table if not exists public.jha_swms_library (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  uploaded_by uuid references public.profiles(id) on delete set null,
  title text not null,
  description text,
  filename text not null,
  storage_path text not null,
  file_size bigint,
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists jha_swms_library_company_idx
  on public.jha_swms_library (company_id) where archived = false;

alter table public.jha_swms_library enable row level security;

create policy "jha_swms_library_select"
  on public.jha_swms_library for select
  using (company_id = (select company_id from public.profiles where id = auth.uid()));

create policy "jha_swms_library_insert"
  on public.jha_swms_library for insert
  with check (company_id = (select company_id from public.profiles where id = auth.uid()));

create policy "jha_swms_library_update"
  on public.jha_swms_library for update
  using (company_id = (select company_id from public.profiles where id = auth.uid()))
  with check (company_id = (select company_id from public.profiles where id = auth.uid()));

create policy "jha_swms_library_delete"
  on public.jha_swms_library for delete
  using (company_id = (select company_id from public.profiles where id = auth.uid()));

-- Reuse uploaded-pdfs bucket path prefix jha-swms/{company_id}/...
comment on table public.jha_swms_library is 'Company library of uploaded SWMS PDFs that can be linked to JHAs';

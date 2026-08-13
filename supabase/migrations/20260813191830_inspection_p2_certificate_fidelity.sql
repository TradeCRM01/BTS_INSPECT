-- P2: certificate fidelity — amendment trail + company report theme

alter table public.inspections
  add column if not exists doc_version integer not null default 1;

alter table public.inspections
  add column if not exists amendment_reason text;

alter table public.inspections
  add column if not exists amended_from_id uuid references public.inspections(id) on delete set null;

create index if not exists inspections_amended_from_idx
  on public.inspections (amended_from_id)
  where amended_from_id is not null;

comment on column public.inspections.doc_version is 'Document revision number; increments on amendment';
comment on column public.inspections.amendment_reason is 'Why this amendment was issued';
comment on column public.inspections.amended_from_id is 'Prior inspection this amendment was created from';

alter table public.companies
  add column if not exists report_theme jsonb not null default '{}'::jsonb;

comment on column public.companies.report_theme is 'White-label PDF theme tokens: navy, accent, accentLight, navyLight';

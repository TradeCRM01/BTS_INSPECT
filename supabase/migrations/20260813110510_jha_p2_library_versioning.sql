-- JHA P2: document library links + amendment / version columns

alter table public.jha_documents
  add column if not exists client_id uuid references public.clients(id) on delete set null,
  add column if not exists job_id uuid references public.jobs(id) on delete set null,
  add column if not exists doc_version integer not null default 1,
  add column if not exists amended_from_id uuid references public.jha_documents(id) on delete set null,
  add column if not exists amendment_reason text;

create index if not exists jha_documents_client_id_idx on public.jha_documents (client_id);
create index if not exists jha_documents_job_id_idx on public.jha_documents (job_id);
create index if not exists jha_documents_company_status_idx on public.jha_documents (company_id, status);
create index if not exists jha_documents_amended_from_idx on public.jha_documents (amended_from_id);

comment on column public.jha_documents.doc_version is 'Revision number; increments on amend / re-brief';
comment on column public.jha_documents.amended_from_id is 'Prior published JHA this amendment was cloned from';
comment on column public.jha_documents.amendment_reason is 'Why the document was re-issued (scope/crew/conditions change)';

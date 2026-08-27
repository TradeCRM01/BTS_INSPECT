import { useMemo, useState, type CSSProperties } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Copy, FileText, Search, ShieldCheck } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { pageQueryBlocked } from '../lib/devFieldAuditAuth';
import { supabase } from '../lib/supabase';
import { duplicateJhaDocument } from '../lib/duplicateJhaDocument';
import {
  decorateJhaList,
  filterJhaListFloor,
  formatJhaListDate,
  groupJhaListFloor,
  jhaDocumentHref,
  jhaListEmptyMessage,
  jhaListEmptyTitle,
  jhaListGroupTitle,
  parseJhaListFilter,
  sortJhaListFloor,
  type JhaListFilter,
  type JhaListFloorItem,
  type JhaListRow,
} from '../lib/jhaList';
import { jhaStatusClass, jhaStatusLabel } from '../lib/jhaNextAction';
import { livingJobSite } from '../lib/livingJha';
import { AppShell } from '../components/layout/AppShell';
import { EmptyState, LoadingSpinner, OpsDocHead, OpsSiteRow, OpsStatus, PageError, opsSiteLabel } from '../components/ui';
import { jhaDocumentColors } from '../reports/jha/theme';

type DocRow = JhaListRow & {
  meta: Record<string, string>;
};

export function JhaDocumentsPage() {
  const { profile, company } = useAuth();
  const docColors = jhaDocumentColors(
    (company as { report_theme?: unknown } | null)?.report_theme ?? null,
  );
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<JhaListFilter>('open');
  const [dupError, setDupError] = useState('');

  const duplicateMutation = useMutation({
    mutationFn: async (sourceId: string) => {
      if (!profile?.id) throw new Error('Not signed in');
      return duplicateJhaDocument(sourceId, profile.id);
    },
    onSuccess: (newId) => {
      setDupError('');
      queryClient.invalidateQueries({ queryKey: ['jha-documents'] });
      navigate(jhaDocumentHref(newId));
    },
    onError: (err) => {
      setDupError(err instanceof Error ? err.message : 'Could not duplicate JHA');
    },
  });

  const { data: teamMembers = [] } = useQuery({
    queryKey: ['company-members-jha', profile?.company_id],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_company_members', { p_company_id: profile!.company_id });
      if (error) throw error;
      return (data ?? []) as Array<{ id: string; name: string; email: string; role: string }>;
    },
    enabled: !!profile?.company_id,
  });

  const { data: templates } = useQuery({
    queryKey: ['jha-templates-picker'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('jha_templates')
        .select('id, name')
        .eq('archived', false)
        .order('name');
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!profile,
  });

  const { data: docs, isLoading, isError, refetch } = useQuery({
    queryKey: ['jha-documents'],
    queryFn: async () => {
      const query = supabase
        .from('jha_documents')
        .select('id, status, report_number, meta, doc_version, amendment_reason, amended_from_id, client_id, job_id, created_at, completed_at, template_snapshot')
        .order('created_at', { ascending: false });
      const { data, error } = await query;
      if (error) throw error;
      const list = (data ?? []) as DocRow[];
      const clientIds = [...new Set(list.map(d => d.client_id).filter(Boolean))] as string[];
      const jobIds = [...new Set(list.map(d => d.job_id).filter(Boolean))] as string[];
      const [clientsRes, jobsRes] = await Promise.all([
        clientIds.length ? supabase.from('clients').select('id, name').in('id', clientIds) : Promise.resolve({ data: [], error: null }),
        jobIds.length
          ? supabase.from('jobs').select('id, title, address, assigned_team, job_number, scheduled_date').in('id', jobIds)
          : Promise.resolve({ data: [], error: null }),
      ]);
      const clientMap = new Map((clientsRes.data ?? []).map(c => [c.id, c.name]));
      const jobMap = new Map((jobsRes.data ?? []).map(j => [j.id, j]));
      return list.map(d => ({
        ...d,
        client_name: d.client_id ? clientMap.get(d.client_id) ?? null : null,
        job_title: d.job_id ? jobMap.get(d.job_id)?.title ?? null : null,
        job_address: d.job_id ? jobMap.get(d.job_id)?.address ?? null : null,
        job_assigned_team: d.job_id ? jobMap.get(d.job_id)?.assigned_team ?? null : null,
        job_number: d.job_id ? jobMap.get(d.job_id)?.job_number ?? null : null,
        job_scheduled_date: d.job_id ? jobMap.get(d.job_id)?.scheduled_date ?? null : null,
      }));
    },
    enabled: !!profile,
  });

  const decorated = useMemo(
    () => decorateJhaList(docs ?? [], teamMembers),
    [docs, teamMembers],
  );
  const visible = useMemo(
    () => sortJhaListFloor(filterJhaListFloor(decorated, { filter: status, search: q })),
    [decorated, status, q],
  );
  const grouped = useMemo(() => groupJhaListFloor(visible), [visible]);
  const noneAtAll = !isLoading && !pageQueryBlocked(isError) && (docs ?? []).length === 0;
  const noneMatch = !isLoading && !pageQueryBlocked(isError) && (docs ?? []).length > 0 && visible.length === 0;

  return (
    <AppShell>
      <div className="ops-page" data-jha-filter={status}>
        <div className="ops-page-head">
          <div>
            <h1 className="ops-page-title">
              JHA documents
            </h1>
            <p className="ops-meta mt-1">Open JHAs that still need site, crew, or publish. Tap a row to open it.</p>
          </div>
          <select
            className="form-input-sm text-sm min-h-[44px]"
            defaultValue=""
            aria-label="New JHA from template"
            onChange={e => {
              const id = e.target.value;
              if (id) navigate(`/jha/new?templateId=${id}`);
            }}
          >
            <option value="">New from template…</option>
            {(templates ?? []).map(t => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        </div>

        <div className="flex flex-wrap gap-2 mb-4">
          <div className="relative flex-1 min-w-[200px]">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <input
              value={q}
              onChange={e => setQ(e.target.value)}
              placeholder="Search job, site, permit, report #…"
              className="form-input-sm w-full pl-9 min-h-[44px]"
            />
          </div>
          <select
            value={status}
            onChange={e => setStatus(parseJhaListFilter(e.target.value))}
            className="form-input-sm min-h-[44px]"
            aria-label="Filter by status"
          >
            <option value="open">Open</option>
            <option value="draft">Draft</option>
            <option value="completed">Ready</option>
            <option value="published">Published</option>
            <option value="all">All JHAs</option>
          </select>
        </div>

        {dupError && (
          <div className="mb-4 ops-alert">
            {dupError}
          </div>
        )}

        {isLoading && (
          <div className="flex justify-center py-16"><LoadingSpinner size="lg" /></div>
        )}
        {pageQueryBlocked(isError) && <PageError onRetry={refetch} />}

        {noneAtAll && (
          <EmptyState
            icon={ShieldCheck}
            title={jhaListEmptyTitle({ filter: status, noneAtAll: true })}
            message={jhaListEmptyMessage({ filter: status, noneAtAll: true })}
            action={
              <Link to="/jobs" className="ops-next-control min-w-[160px]">
                Open jobs
              </Link>
            }
          />
        )}

        {noneMatch && (
          <EmptyState
            icon={FileText}
            title={jhaListEmptyTitle({ filter: status, noneAtAll: false })}
            message={jhaListEmptyMessage({ filter: status, noneAtAll: false })}
          />
        )}

        {!isLoading && visible.length > 0 && (
          <div className="space-y-4">
            {status === 'all' ? (
              <>
                <JhaGroup
                  title={jhaListGroupTitle('all', 'open')}
                  items={grouped.open}
                  theme={docColors}
                  onOpen={href => navigate(href)}
                  onDuplicate={id => duplicateMutation.mutate(id)}
                  duplicatingId={duplicateMutation.isPending ? duplicateMutation.variables : undefined}
                />
                <JhaGroup
                  title={jhaListGroupTitle('all', 'published')}
                  items={grouped.published}
                  theme={docColors}
                  onOpen={href => navigate(href)}
                  onDuplicate={id => duplicateMutation.mutate(id)}
                  duplicatingId={duplicateMutation.isPending ? duplicateMutation.variables : undefined}
                />
              </>
            ) : (
              <JhaGroup
                title={jhaListGroupTitle(status)}
                items={visible}
                theme={docColors}
                onOpen={href => navigate(href)}
                onDuplicate={id => duplicateMutation.mutate(id)}
                duplicatingId={duplicateMutation.isPending ? duplicateMutation.variables : undefined}
              />
            )}
          </div>
        )}
      </div>
    </AppShell>
  );
}

function JhaGroup({
  title,
  items,
  theme,
  onOpen,
  onDuplicate,
  duplicatingId,
}: {
  title: string;
  items: JhaListFloorItem<DocRow>[];
  theme: { navy: string; accent: string; navyLight: string; accentLight: string };
  onOpen: (href: string) => void;
  onDuplicate: (id: string) => void;
  duplicatingId?: string;
}) {
  if (items.length === 0) return null;
  return (
    <div data-jha-group={title.toLowerCase()}>
      <h2 className="ops-group-title">
        {title}
        <span className="ops-meta normal-case font-normal"> ({items.length})</span>
      </h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
        {items.map(item => (
          <JhaDocCard
            key={item.row.id}
            item={item}
            theme={theme}
            onOpen={() => onOpen(item.href)}
            onDuplicate={() => onDuplicate(item.row.id)}
            duplicating={duplicatingId === item.row.id}
          />
        ))}
      </div>
    </div>
  );
}

function JhaDocCard({
  item,
  theme,
  onOpen,
  onDuplicate,
  duplicating,
}: {
  item: JhaListFloorItem<DocRow>;
  theme: { navy: string; accent: string; navyLight: string; accentLight: string };
  onOpen: () => void;
  onDuplicate: () => void;
  duplicating: boolean;
}) {
  const doc = item.row;
  const livingJob = doc.job_id
    ? { id: doc.job_id, title: doc.job_title, address: doc.job_address, assigned_team: doc.job_assigned_team }
    : null;
  const site = opsSiteLabel(
    item.livingSite,
    livingJobSite(livingJob),
    doc.meta?.siteName,
    doc.job_address,
    doc.job_title,
    doc.meta?.taskName,
  );
  const when = formatJhaListDate(doc.completed_at || doc.created_at);
  const jobLine = [
    item.jobNumberLabel,
    doc.job_title,
    doc.client_name || doc.meta?.clientName,
  ].filter(Boolean).join(' · ');

  return (
    <div
      role="link"
      tabIndex={0}
      data-jha-doc={doc.id}
      data-jha-href={item.href}
      onClick={onOpen}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(); } }}
      className="jha-doc-theme ops-card ops-card-hover group w-full cursor-pointer"
      style={{
        '--jha-navy': theme.navy,
        '--jha-accent': theme.accent,
        '--jha-navy-light': theme.navyLight,
        '--jha-accent-light': theme.accentLight,
      } as CSSProperties}
    >
      <OpsDocHead
        kind="JHA"
        id={doc.report_number || 'Draft'}
        meta={[`v${doc.doc_version ?? 1}`, when].filter(Boolean).join(' · ')}
        trailing={<OpsStatus className={jhaStatusClass(doc.status)}>{jhaStatusLabel(doc.status)}</OpsStatus>}
      />
      <div className="ops-card-body">
        <OpsSiteRow site={site} mapsQuery={item.livingSite || doc.job_address || doc.meta?.siteName || null} />
        <p className="ops-meta mt-1 truncate">{item.title}</p>
        {jobLine && (
          <p className="ops-meta mt-0.5 truncate">{jobLine}</p>
        )}
        {item.supervisorLabel && (
          <p className="ops-meta mt-0.5 truncate">Supervisor {item.supervisorLabel}</p>
        )}
        {item.permitLabel && (
          <p className="ops-meta mt-0.5 truncate">{item.permitLabel}</p>
        )}
        {item.sitePack && (
          <p className="ops-meta mt-0.5 truncate">{item.sitePack}</p>
        )}
        {item.crewProgress && (
          <p className="ops-meta mt-0.5 truncate">{item.crewProgress}</p>
        )}
        {doc.amended_from_id && doc.amendment_reason && (
          <p className="ops-meta mt-0.5 truncate">Amendment: {doc.amendment_reason}</p>
        )}
        <div className="ops-card-footer" onClick={e => e.stopPropagation()}>
          <button
            type="button"
            data-jha-open={doc.id}
            onClick={onOpen}
            className="ops-next-control-block"
          >
            {item.next.label}
          </button>
          <button
            type="button"
            onClick={onDuplicate}
            disabled={duplicating}
            className="btn-ghost w-full min-h-[44px] mt-1 text-xs"
            title="Duplicate as a new draft (signatures cleared)"
          >
            <Copy size={14} />
            {duplicating ? 'Copying…' : 'Duplicate'}
          </button>
        </div>
      </div>
    </div>
  );
}

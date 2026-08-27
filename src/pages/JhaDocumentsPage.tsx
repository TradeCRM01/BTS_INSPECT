import { useMemo, useState, type CSSProperties } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Copy, FileText, MoreVertical, ShieldCheck } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { pageQueryBlocked } from '../lib/devFieldAuditAuth';
import {
  AUDIT_JHA_DOC_ID,
  getAuditClient,
  getAuditJhaDoc,
  getAuditJob,
  getAuditTeamMembers,
} from '../lib/devFieldAuditDocs';
import { supabase } from '../lib/supabase';
import { duplicateJhaDocument } from '../lib/duplicateJhaDocument';
import {
  decorateJhaList,
  filterJhaListFloor,
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
import { jhaStatusLabel } from '../lib/jhaNextAction';
import { livingJobSite } from '../lib/livingJha';
import { AppShell } from '../components/layout/AppShell';
import { EmptyState, LoadingSpinner, PageError, SearchBar, opsSiteLabel } from '../components/ui';
import { jhaDocumentColors } from '../reports/jha/theme';

type DocRow = JhaListRow & {
  meta: Record<string, string>;
};

const LIST_FILTERS: { key: JhaListFilter; label: string }[] = [
  { key: 'open', label: 'Open' },
  { key: 'draft', label: 'Draft' },
  { key: 'completed', label: 'Ready' },
  { key: 'published', label: 'Published' },
  { key: 'all', label: 'All' },
];

function suburbFromSite(site: string): string {
  if (site === 'No site address') return '';
  const parts = site.split(',').map(part => part.trim()).filter(Boolean);
  if (parts.length < 2) return '';
  const loc = parts[1].replace(/\b(NSW|VIC|QLD|SA|WA|TAS|NT|ACT)\b.*$/i, '').trim();
  return loc || parts[1];
}

function jhaListPillClass(status: string): string {
  if (status === 'published') return 'is-published';
  if (status === 'completed') return 'is-ready';
  return 'is-draft';
}

function auditJhaList(): DocRow[] | null {
  const doc = getAuditJhaDoc(AUDIT_JHA_DOC_ID);
  if (!doc) return null;
  const job = doc.job_id ? getAuditJob(doc.job_id) : null;
  const client = doc.client_id ? getAuditClient(doc.client_id) : null;
  return [{
    id: doc.id,
    status: doc.status,
    report_number: doc.report_number,
    meta: (doc.meta ?? {}) as Record<string, string>,
    doc_version: doc.doc_version,
    amendment_reason: doc.amendment_reason,
    amended_from_id: doc.amended_from_id,
    client_id: doc.client_id,
    job_id: doc.job_id,
    created_at: doc.created_at,
    completed_at: doc.completed_at,
    template_snapshot: doc.template_snapshot,
    client_name: client?.name ?? null,
    job_title: job?.title ?? null,
    job_address: job?.address ?? null,
    job_assigned_team: job?.assigned_team ?? null,
    job_number: job?.job_number ?? null,
    job_scheduled_date: job?.scheduled_date ?? null,
  }];
}

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
      const mock = getAuditTeamMembers();
      if (mock) return mock;
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
      const audit = auditJhaList();
      if (audit) return audit;
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
      <div className="ops-page hub-jha" data-jha-filter={status}>
        <div className="ops-page-head">
          <div>
            <p className="hub-jha-label">JHA documents</p>
            <h1 className="ops-page-title">
              JHA documents
            </h1>
          </div>
          <select
            className="btn-primary hub-jha-start"
            defaultValue=""
            aria-label="New JHA from template"
            onChange={e => {
              const id = e.target.value;
              if (id) navigate(`/jha/new?templateId=${id}`);
            }}
          >
            <option value="">+ Start JHA</option>
            {(templates ?? []).map(t => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        </div>

        <div className="hub-jha-chrome">
          <div className="hub-jha-filters">
            {LIST_FILTERS.map(tab => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setStatus(parseJhaListFilter(tab.key))}
                className={`hub-chrome-filter ${status === tab.key ? 'hub-chrome-filter-on' : ''}`}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <SearchBar value={q} onChange={setQ} placeholder="Search job, site, permit, supervisor, #0042…" className="max-w-sm" />
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
              <Link to="/jobs" className="hub-next">
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
          <div className="hub-jha-sheet">
            <div className="hub-jha-thead">
              <span>Site</span>
              <span>Permit</span>
              <span>Supervisor</span>
              <span>Crew</span>
              <span>Status</span>
              <span />
            </div>
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
      <h2 className="hub-jha-group">
        {title}
        <span className="hub-jha-count"> {items.length}</span>
      </h2>
      {items.map(item => (
        <JhaDocRow
          key={item.row.id}
          item={item}
          theme={theme}
          onOpen={() => onOpen(item.href)}
          onDuplicate={() => onDuplicate(item.row.id)}
          duplicating={duplicatingId === item.row.id}
        />
      ))}
    </div>
  );
}

function JhaDocRow({
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
  const suburb = suburbFromSite(site);
  const jobLine = [item.jobNumberLabel, item.title].filter(Boolean).join(' · ');
  const permit = item.permitLabel ? item.permitLabel.replace(/^Permit\s+/i, '') : '';

  return (
    <div
      role="link"
      tabIndex={0}
      data-jha-doc={doc.id}
      data-jha-href={item.href}
      onClick={onOpen}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(); } }}
      className="jha-doc-theme hub-jha-row"
      style={{
        '--jha-navy': theme.navy,
        '--jha-accent': theme.accent,
        '--jha-navy-light': theme.navyLight,
        '--jha-accent-light': theme.accentLight,
      } as CSSProperties}
    >
      <span className="min-w-0">
        <span className="hub-jha-site truncate">{site}</span>
        <span className="hub-jha-muted truncate">{jobLine || suburb}</span>
      </span>
      <span className="truncate hub-jha-muted">{permit}</span>
      <span className="truncate hub-jha-muted">{item.supervisorLabel || ''}</span>
      <span className="truncate hub-jha-count-cell">{item.crewProgress || ''}</span>
      <span className={`hub-jha-pill ${jhaListPillClass(doc.status)}`}>
        {jhaStatusLabel(doc.status)}
      </span>
      <span className="hub-jha-row-next" onClick={e => e.stopPropagation()}>
        <button
          type="button"
          data-jha-open={doc.id}
          onClick={onOpen}
          className="hub-next"
        >
          {item.next.label}
        </button>
        <details className="hub-jha-more">
          <summary aria-label="JHA actions">
            <MoreVertical size={16} />
          </summary>
          <div className="hub-jha-more-menu">
            <button
              type="button"
              onClick={onDuplicate}
              disabled={duplicating}
            >
              <Copy size={14} />
              {duplicating ? 'Copying…' : 'Duplicate'}
            </button>
          </div>
        </details>
      </span>
    </div>
  );
}

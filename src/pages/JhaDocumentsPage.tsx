import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Copy, FileText, MoreHorizontal, ShieldCheck } from 'lucide-react';
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

/** Signed JHA-list frame seed — list look only, not a live company. */
const JHA_LIST_LOOK = 'jha-list';

function jhaListLookRows(): DocRow[] {
  const stamp = '2026-09-03T00:00:00.000Z';
  const base = {
    meta: {} as Record<string, string>,
    doc_version: 1,
    amendment_reason: null as string | null,
    amended_from_id: null as string | null,
    client_id: null as string | null,
    job_id: null as string | null,
    created_at: stamp,
    completed_at: stamp,
    template_snapshot: { name: 'JHA' },
    client_name: null as string | null,
    job_title: null as string | null,
    job_address: null as string | null,
    job_assigned_team: null as string[] | null,
    job_number: null as number | null,
    job_scheduled_date: null as string | null,
    report_number: null as string | null,
  };
  return [
    {
      ...base,
      id: 'look-jha-northside',
      status: 'completed',
      meta: { siteName: 'Northside Electrical', siteAddress: '12 Workshop Rd, Perth WA 6000' },
    },
    {
      ...base,
      id: 'look-jha-harbour',
      status: 'published',
      meta: { siteName: 'Harbour Lights', siteAddress: '8 Wharf St, Fremantle WA 6160' },
    },
    {
      ...base,
      id: 'look-jha-midland',
      status: 'completed',
      meta: { siteName: 'Midland Workshops', siteAddress: '44 Helena St, Midland WA 6056' },
    },
  ];
}

function jhaListWhisper(args: { filter: JhaListFilter; count: number }): string {
  const filterLabel = args.filter === 'open'
    ? 'Open'
    : args.filter === 'all'
      ? 'All'
      : args.filter === 'draft'
        ? 'Draft'
        : args.filter === 'completed'
          ? 'Ready'
          : 'Published';
  const countLabel = args.count === 1 ? '1 JHA' : `${args.count} JHAs`;
  return `${filterLabel} · ${countLabel}`;
}

function jhaListRowMuted(item: JhaListFloorItem<DocRow>): string {
  const title = item.title && item.title !== 'JHA' ? item.title : 'JHA';
  const when = formatJhaListDate(item.row.completed_at || item.row.created_at);
  return [title, when].filter(Boolean).join(' · ');
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
  const [searchParams] = useSearchParams();
  const lookJhaList = searchParams.get('look') === JHA_LIST_LOOK;
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<JhaListFilter>(lookJhaList ? 'all' : 'open');
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
    enabled: !!profile?.company_id && !lookJhaList,
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
    enabled: !!profile && !lookJhaList,
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
    enabled: !!profile && !lookJhaList,
  });

  const listRows = lookJhaList ? jhaListLookRows() : (docs ?? []);
  const decorated = useMemo(
    () => decorateJhaList(listRows, teamMembers),
    [listRows, teamMembers],
  );
  const visible = useMemo(
    () => sortJhaListFloor(filterJhaListFloor(decorated, { filter: status, search: q })),
    [decorated, status, q],
  );
  const grouped = useMemo(() => groupJhaListFloor(visible), [visible]);
  const loading = !lookJhaList && isLoading;
  const noneAtAll = !lookJhaList && !loading && !pageQueryBlocked(isError) && listRows.length === 0;
  const noneMatch = !lookJhaList && !loading && !pageQueryBlocked(isError) && listRows.length > 0 && visible.length === 0;
  const whisper = jhaListWhisper({ filter: status, count: visible.length });

  return (
    <AppShell>
      <div className="ops-page hub-jha hub-jha-list-doc" data-jha-filter={status}>
        <div className="hub-jha-sheet">
          <header className="hub-jha-list-bar">
            <span className="hub-jha-list-mark">List</span>
          </header>
          <div className="hub-jha-list-body">
            <h1 className="ops-page-title">JHA</h1>
            <p className="hub-jha-list-whisper">{whisper}</p>
            <div className="hub-jha-list-tools">
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
              <div className="hub-jha-list-tools-overflow">
                <JhaListFind
                  status={status}
                  onStatus={setStatus}
                  search={q}
                  onSearch={setQ}
                />
              </div>
            </div>

            {dupError && (
              <div className="mb-4 ops-alert">
                {dupError}
              </div>
            )}

            {loading && (
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

            {!loading && (
              <>
                <JhaTake5ListRow onOpen={() => navigate('/jha/take5')} />
                {(visible.length > 0 || lookJhaList) && (
                  <div className="hub-jha-thead">
                    <span>Site</span>
                    <span>Status</span>
                    <span />
                  </div>
                )}
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
              </>
            )}
          </div>
        </div>
      </div>
    </AppShell>
  );
}

function placeJhaListMore(more: HTMLDetailsElement) {
  const menu = more.querySelector('.hub-jha-list-more-menu') as HTMLElement | null;
  const paper = more.closest('.hub-jha-sheet') as HTMLElement | null;
  if (!menu || !paper) return;
  more.classList.remove('is-flip', 'is-shift');
  menu.style.removeProperty('--hub-jha-list-more-shift');
  if (!more.open) return;
  const pad = 8;
  const paperRect = paper.getBoundingClientRect();
  const bar = paper.querySelector('.hub-jha-list-bar');
  const inkFloor = (bar?.getBoundingClientRect().bottom ?? paperRect.top) + pad;
  const viewBottom = window.innerHeight - pad;
  const menuRect = menu.getBoundingClientRect();
  const trigger = more.querySelector('summary') as HTMLElement | null;
  const triggerRect = trigger?.getBoundingClientRect() ?? menuRect;
  const flippedTop = triggerRect.top - pad - menuRect.height;
  const overflowsBottom = menuRect.bottom > Math.min(paperRect.bottom - pad, viewBottom);
  if (overflowsBottom && flippedTop >= inkFloor) {
    more.classList.add('is-flip');
  }
  const after = menu.getBoundingClientRect();
  let shift = 0;
  if (after.right > paperRect.right - pad) shift = paperRect.right - pad - after.right;
  if (after.left + shift < paperRect.left + pad) shift = paperRect.left + pad - after.left;
  if (shift !== 0) {
    more.classList.add('is-shift');
    menu.style.setProperty('--hub-jha-list-more-shift', `${Math.round(shift)}px`);
  }
}

function JhaListFind({
  status,
  onStatus,
  search,
  onSearch,
}: {
  status: JhaListFilter;
  onStatus: (key: JhaListFilter) => void;
  search: string;
  onSearch: (value: string) => void;
}) {
  const moreRef = useRef<HTMLDetailsElement>(null);

  const closeMore = () => {
    if (moreRef.current) moreRef.current.open = false;
  };

  const placeMoreMenu = () => {
    if (moreRef.current) placeJhaListMore(moreRef.current);
  };

  useEffect(() => {
    const more = moreRef.current;
    const onPointer = (event: PointerEvent) => {
      if (!moreRef.current?.open) return;
      if (!moreRef.current.contains(event.target as Node)) closeMore();
    };
    more?.addEventListener('toggle', placeMoreMenu);
    window.addEventListener('resize', placeMoreMenu);
    document.addEventListener('pointerdown', onPointer);
    return () => {
      more?.removeEventListener('toggle', placeMoreMenu);
      window.removeEventListener('resize', placeMoreMenu);
      document.removeEventListener('pointerdown', onPointer);
    };
  }, []);

  return (
    <details ref={moreRef} className="hub-jha-list-more hub-jha-list-find">
      <summary aria-label="Find">
        <MoreHorizontal size={18} />
      </summary>
      <div className="hub-jha-list-more-menu" role="menu">
        <div className="hub-jha-chrome">
          <div className="hub-jha-filters">
            {LIST_FILTERS.map(tab => (
              <button
                key={tab.key}
                type="button"
                role="menuitem"
                onClick={() => onStatus(parseJhaListFilter(tab.key))}
                className={`hub-chrome-filter ${status === tab.key ? 'hub-chrome-filter-on' : ''}`}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <SearchBar value={search} onChange={onSearch} placeholder="Search job, site, permit, supervisor, #0042…" />
        </div>
      </div>
    </details>
  );
}

function JhaRowMore({
  children,
}: {
  children: (closeMore: () => void) => ReactNode;
}) {
  const moreRef = useRef<HTMLDetailsElement>(null);

  const closeMore = () => {
    if (moreRef.current) moreRef.current.open = false;
  };

  const placeMoreMenu = () => {
    if (moreRef.current) placeJhaListMore(moreRef.current);
  };

  useEffect(() => {
    const more = moreRef.current;
    const onPointer = (event: PointerEvent) => {
      if (!moreRef.current?.open) return;
      if (!moreRef.current.contains(event.target as Node)) closeMore();
    };
    more?.addEventListener('toggle', placeMoreMenu);
    window.addEventListener('resize', placeMoreMenu);
    document.addEventListener('pointerdown', onPointer);
    return () => {
      more?.removeEventListener('toggle', placeMoreMenu);
      window.removeEventListener('resize', placeMoreMenu);
      document.removeEventListener('pointerdown', onPointer);
    };
  }, []);

  return (
    <details ref={moreRef} className="hub-jha-list-more">
      <summary aria-label="More">
        <MoreHorizontal size={18} />
      </summary>
      <div className="hub-jha-list-more-menu" role="menu">
        {children(closeMore)}
      </div>
    </details>
  );
}

function JhaTake5ListRow({
  onOpen,
}: {
  onOpen: () => void;
}) {
  return (
    <p className="hub-jha-list-take5" data-jha-group="take 5">
      <Link
        to="/jha/take5"
        data-take5-list
        data-take5-href="/jha/take5"
        className="hub-jha-list-take5-link"
        onClick={e => { e.preventDefault(); onOpen(); }}
      >
        Take 5
      </Link>
      <span className="hub-jha-list-take5-muted">Point of work risk assessment</span>
    </p>
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
  const muted = jhaListRowMuted(item);

  return (
    <div
      role="link"
      tabIndex={0}
      aria-label="Open"
      data-jha-doc={doc.id}
      data-jha-href={item.href}
      data-jha-open={doc.id}
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
        {muted ? <span className="hub-jha-muted truncate">{muted}</span> : null}
      </span>
      <span className="hub-jha-status">{jhaStatusLabel(doc.status)}</span>
      <span className="hub-jha-row-next" onClick={e => e.stopPropagation()}>
        <JhaRowMore>
          {closeMore => (
            <>
              <button
                type="button"
                role="menuitem"
                data-jha-open={doc.id}
                onClick={() => { onOpen(); closeMore(); }}
              >
                {item.next.label}
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => { onDuplicate(); closeMore(); }}
                disabled={duplicating}
              >
                <Copy size={14} />
                {duplicating ? 'Copying…' : 'Duplicate'}
              </button>
            </>
          )}
        </JhaRowMore>
      </span>
    </div>
  );
}

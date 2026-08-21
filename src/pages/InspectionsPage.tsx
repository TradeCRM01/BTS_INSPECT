import { useState, useMemo, useRef, memo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { AppShell } from '../components/layout/AppShell';
import { EmptyState, LoadingSpinner, OpsDocHead, OpsSiteRow, OpsStatus, PageError, opsSiteLabel } from '../components/ui';
import {
  Plus, ClipboardList, Search, X,
  Archive, ArchiveRestore, MoreVertical, Link2, Trash2,
  Send, Folder, Home, Package, FileText,
} from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { downloadBlob, exportInspectionPack } from '../lib/exportInspectionPack';
import type { TemplateSchema } from '../types/template';
import {
  inspectionListBucket,
  inspectionListContext,
  inspectionOpenPath,
  inspectionStatusClass,
  inspectionStatusLabel,
  recommendInspectionListAction,
} from '../lib/inspectionNextAction';
import { withInspectionDueNext } from '../lib/inspectionDueReminder';
import { ReportSendDialog } from '../components/inspection/ReportSendDialog';
import { inspectionDisplayStatus } from '../lib/sendReport';
import { useToast } from '../components/ui';
import { applyLivingJobToInspection } from '../lib/livingJha';

interface Inspection {
  id: string;
  status: string;
  meta: Record<string, string>;
  started_at: string;
  completed_at: string | null;
  template_snapshot: { name?: string; report_renderer?: string; schema?: TemplateSchema } | null;
  inspector_id: string;
  inspector_name?: string;
  archived: boolean;
  parent_inspection_id: string | null;
  crm_job_id: string | null;
  responses: Record<string, unknown>;
  job_title?: string | null;
  job_address?: string | null;
  job_number?: number | null;
  job_scheduled_date?: string | null;
  job_company_id?: string | null;
  job_client_id?: string | null;
  job_client_name?: string | null;
  due_on?: string | null;
  report_id?: string | null;
  report_sent_at?: string | null;
}

const ArchiveMenu = memo(function ArchiveMenu({ inspection, onToggle, onDelete, onAddInspection, onSendToDrive, isAdmin, isDeleting }: {
  inspection: Inspection;
  onToggle: (id: string, archived: boolean) => void;
  onDelete?: (id: string) => void;
  onAddInspection?: () => void;
  onSendToDrive?: (id: string) => void;
  isAdmin?: boolean;
  isDeleting?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const [pos, setPos] = useState({ top: 0, left: 0 });

  const openMenu = (e: React.MouseEvent | React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (btnRef.current) {
      const r = btnRef.current.getBoundingClientRect();
      const menuWidth = 200;
      const left = Math.max(8, Math.min(r.right - menuWidth, window.innerWidth - menuWidth - 8));
      setPos({ top: r.bottom + 4, left });
    }
    setOpen(v => !v);
  };

  const handleDelete = () => {
    if (onDelete) {
      onDelete(inspection.id);
      setOpen(false);
      setShowDeleteConfirm(false);
    }
  };

  const dropdown = open ? createPortal(
    <>
      <div
        className="fixed inset-0"
        style={{ zIndex: 9998 }}
        onClick={() => { setOpen(false); setShowDeleteConfirm(false); }}
      />
      <div
        className="fixed bg-white border border-rule rounded-md py-1 min-w-[200px] max-h-80 overflow-y-auto"
        style={{ top: pos.top, left: pos.left, zIndex: 9999, maxHeight: 'calc(100vh - 100px)' }}
      >
        {showDeleteConfirm ? (
          <div className="px-3 py-2">
            <p className="text-sm font-medium text-ink mb-2">Delete inspection?</p>
            <p className="text-xs text-muted mb-3">This cannot be undone.</p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(false)}
                disabled={isDeleting}
                className="flex-1 px-2 py-2 text-xs border border-rule text-ink rounded-md hover:bg-zebra disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={isDeleting}
                className="flex-1 px-2 py-2 text-xs bg-red-600 text-white rounded-md hover:bg-red-700 font-medium disabled:opacity-50"
              >
                {isDeleting ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        ) : (
          <>
            {onAddInspection && !inspection.archived && (
              <button
                type="button"
                onClick={e => {
                  e.preventDefault();
                  e.stopPropagation();
                  onAddInspection();
                  setOpen(false);
                }}
                className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm hover:bg-zebra text-left text-accent min-h-[44px]"
              >
                <Link2 size={14} /> Add inspection to job
              </button>
            )}
            {onSendToDrive && !inspection.archived && (
              <button
                type="button"
                onClick={e => {
                  e.preventDefault();
                  e.stopPropagation();
                  onSendToDrive(inspection.id);
                  setOpen(false);
                }}
                className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm hover:bg-zebra text-left text-accent min-h-[44px]"
              >
                <Send size={14} /> Send to Drive folder
              </button>
            )}
            {(onAddInspection || onSendToDrive) && !inspection.archived && (
              <div className="border-t border-rule my-1" />
            )}
            <button
              type="button"
              onClick={e => {
                e.preventDefault();
                e.stopPropagation();
                onToggle(inspection.id, !inspection.archived);
                setOpen(false);
              }}
              className={`w-full flex items-center gap-2.5 px-3 py-2.5 text-sm hover:bg-zebra text-left min-h-[44px]
                ${inspection.archived ? 'text-pass' : 'text-fail'}`}
            >
              {inspection.archived
                ? <><ArchiveRestore size={14} /> Unarchive</>
                : <><Archive size={14} /> Archive</>}
            </button>
            {isAdmin && onDelete && (
              <>
                <div className="border-t border-rule my-1" />
                <button
                  type="button"
                  onClick={e => {
                    e.preventDefault();
                    e.stopPropagation();
                    setShowDeleteConfirm(true);
                  }}
                  className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm hover:bg-red-50 text-left text-red-600 min-h-[44px]"
                >
                  <Trash2 size={14} /> Delete
                </button>
              </>
            )}
          </>
        )}
      </div>
    </>,
    document.body,
  ) : null;

  return (
    <div className="relative">
      <button
        ref={btnRef}
        type="button"
        onPointerDown={e => e.stopPropagation()}
        onClick={openMenu}
        className="w-11 h-11 flex items-center justify-center rounded-md hover:bg-white/10 text-white/70 hover:text-white"
        aria-label="Inspection actions"
      >
        <MoreVertical size={16} />
      </button>
      {dropdown}
    </div>
  );
});

export function InspectionsPage() {
  const { profile, company } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const isAdmin = profile?.role === 'admin';

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'draft' | 'completed' | 'issued'>('all');
  const [showArchived, setShowArchived] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [exporting, setExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState('');
  const [exportError, setExportError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [sendToDriveFor, setSendToDriveFor] = useState<string | null>(null);
  const [sendingReportId, setSendingReportId] = useState<string | null>(null);

  const { data: inspections, isLoading, isError, refetch } = useQuery({
    queryKey: ['inspections'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('inspections')
        .select('id, status, meta, started_at, completed_at, template_snapshot, inspector_id, archived, parent_inspection_id, crm_job_id, responses, due_on')
        .order('started_at', { ascending: false });
      if (error) throw error;

      const list = (data ?? []) as Inspection[];
      const inspectorIds = [...new Set(list.map(i => i.inspector_id))];
      const jobIds = [...new Set(list.map(i => i.crm_job_id).filter(Boolean))] as string[];
      const inspectionIds = list.map(i => i.id);
      const [profilesRes, jobsRes, reportsRes] = await Promise.all([
        inspectorIds.length
          ? supabase.from('profiles').select('id, name').in('id', inspectorIds)
          : Promise.resolve({ data: [], error: null }),
        jobIds.length
          ? supabase.from('jobs').select('id, title, address, job_number, scheduled_date, company_id, client_id').in('id', jobIds)
          : Promise.resolve({ data: [], error: null }),
        inspectionIds.length && profile?.company_id
          ? supabase.from('reports').select('id, inspection_id, sent_at').in('inspection_id', inspectionIds).eq('company_id', profile.company_id)
          : Promise.resolve({ data: [], error: null }),
      ]);
      if (reportsRes.error) throw reportsRes.error;
      const clientIds = [...new Set((jobsRes.data ?? []).map(j => j.client_id).filter(Boolean))] as string[];
      const clientsRes = clientIds.length
        ? await supabase.from('clients').select('id, name').in('id', clientIds)
        : { data: [], error: null };
      if (clientsRes.error) throw clientsRes.error;
      const nameMap = Object.fromEntries((profilesRes.data ?? []).map(p => [p.id, p.name]));
      const jobMap = new Map((jobsRes.data ?? []).map(j => [j.id, j]));
      const clientNameMap = new Map((clientsRes.data ?? []).map(c => [c.id, c.name]));
      const reportMap = new Map((reportsRes.data ?? []).map(r => [r.inspection_id, r]));

      return list.map(i => ({
        ...i,
        meta: (i.meta ?? {}) as Record<string, string>,
        template_snapshot: (i.template_snapshot ?? null) as Inspection['template_snapshot'],
        responses: (i.responses ?? {}) as Record<string, unknown>,
        inspector_name: nameMap[i.inspector_id] ?? 'Unknown',
        archived: i.archived ?? false,
        report_id: reportMap.get(i.id)?.id ?? null,
        report_sent_at: reportMap.get(i.id)?.sent_at ?? null,
        parent_inspection_id: i.parent_inspection_id ?? null,
        crm_job_id: i.crm_job_id ?? null,
        job_title: i.crm_job_id ? jobMap.get(i.crm_job_id)?.title ?? null : null,
        job_address: i.crm_job_id ? jobMap.get(i.crm_job_id)?.address ?? null : null,
        job_number: i.crm_job_id ? jobMap.get(i.crm_job_id)?.job_number ?? null : null,
        job_scheduled_date: i.crm_job_id ? jobMap.get(i.crm_job_id)?.scheduled_date ?? null : null,
        job_company_id: i.crm_job_id ? jobMap.get(i.crm_job_id)?.company_id ?? null : null,
        job_client_id: i.crm_job_id ? jobMap.get(i.crm_job_id)?.client_id ?? null : null,
        job_client_name: i.crm_job_id
          ? clientNameMap.get(jobMap.get(i.crm_job_id)?.client_id ?? '') ?? null
          : null,
      })) as Inspection[];
    },
    enabled: !!profile,
  });

  const archiveMutation = useMutation({
    mutationFn: async ({ id, archived }: { id: string; archived: boolean }) => {
      const { error } = await supabase.from('inspections').update({ archived }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['inspections'] }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('inspections').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: async () => {
      setDeleteError(null);
      await queryClient.invalidateQueries({ queryKey: ['inspections'] });
    },
    onError: (err: Error) => {
      setDeleteError(err.message ?? 'Failed to delete inspection');
    },
  });

  const handleArchiveToggle = useCallback(
    (id: string, archived: boolean) => archiveMutation.mutate({ id, archived }),
    [archiveMutation],
  );

  const handleDelete = useCallback(
    (id: string) => deleteMutation.mutate(id),
    [deleteMutation],
  );

  const { data: driveFolders } = useQuery({
    queryKey: ['drive-folders'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('folders')
        .select('id, parent_id, name')
        .order('name', { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!profile,
  });

  const handleSendToDrive = useCallback(async (folderId: string | null) => {
    if (!sendToDriveFor) return;
    const x = 32 + Math.floor(Math.random() * 5) * 128;
    const y = 32 + Math.floor(Math.random() * 3) * 118;
    await supabase
      .from('inspections')
      .update({ folder_id: folderId, position_x: x, position_y: y })
      .eq('id', sendToDriveFor);
    queryClient.invalidateQueries({ queryKey: ['drive-inspections'] });
    setSendToDriveFor(null);
  }, [sendToDriveFor, queryClient]);

  const archivedCount = useMemo(
    () => (inspections ?? []).filter(i => i.archived).length,
    [inspections]
  );

  const filtered = useMemo(() => {
    if (!inspections) return [];
    const needle = search.trim().toLowerCase();
    return inspections.filter(insp => {
      if (!showArchived && insp.archived) return false;
      if (showArchived && !insp.archived) return false;
      if (statusFilter !== 'all' && insp.status !== statusFilter) return false;

      if (!needle) return true;
      const hay = [
        insp.meta?.siteName,
        insp.meta?.siteAddress,
        insp.meta?.clientName,
        insp.meta?.jobNumber,
        insp.template_snapshot?.name,
        insp.inspector_name,
        insp.job_title,
        insp.job_address,
      ].filter(Boolean).join(' ').toLowerCase();
      return hay.includes(needle);
    });
  }, [inspections, search, statusFilter, showArchived]);

  const openDocs = filtered.filter(d => inspectionListBucket(d.status) === 'open');
  const doneDocs = filtered.filter(d => inspectionListBucket(d.status) === 'done');
  const noneAtAll = !isLoading && !isError && (inspections ?? []).filter(i => showArchived ? i.archived : !i.archived).length === 0;
  const noneMatch = !isLoading && !isError && (inspections ?? []).length > 0 && filtered.length === 0 && !noneAtAll;

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  async function handleExportPack() {
    if (!profile || !company || selectedIds.size === 0) return;
    setExporting(true);
    setExportError(null);
    setExportProgress('Preparing…');
    try {
      const blob = await exportInspectionPack({
        inspectionIds: [...selectedIds],
        profile: {
          id: profile.id,
          name: profile.name,
          company_id: profile.company_id,
          licence_number: profile.licence_number,
        },
        company: {
          name: company.name,
          abn: company.abn,
          licence_number: company.licence_number,
          phone: company.phone,
          email: company.email,
          website: company.website,
          logo_url: company.logo_url,
          report_theme: (company as { report_theme?: Record<string, unknown> | null }).report_theme ?? null,
        },
        onProgress: (done, total, label) => {
          setExportProgress(`${done}/${total} ${label}`);
        },
      });
      const stamp = format(new Date(), 'yyyyMMdd-HHmm');
      downloadBlob(blob, `inspection-pack-${stamp}.zip`);
      setSelectedIds(new Set());
    } catch (err) {
      setExportError(err instanceof Error ? err.message : 'Pack export failed');
    } finally {
      setExporting(false);
      setExportProgress('');
    }
  }

  return (
    <AppShell>
      <div className="ops-page">
        <div className="ops-page-head">
          <div>
            <h1 className="ops-page-title">
              Inspections
            </h1>
            <p className="ops-meta mt-1">Open a row to fill or review. Start a new one from the job.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {selectedIds.size > 0 && (
              <button
                type="button"
                onClick={handleExportPack}
                disabled={exporting}
                className="btn-secondary min-h-[44px]"
              >
                <Package size={14} />
                {exporting ? (exportProgress || 'Exporting…') : `Export pack (${selectedIds.size})`}
              </button>
            )}
            {isAdmin && archivedCount > 0 && (
              <button
                type="button"
                onClick={() => setShowArchived(v => !v)}
                className={`btn-secondary min-h-[44px] ${showArchived ? 'border-fail text-fail' : ''}`}
              >
                <Archive size={14} />
                {showArchived ? 'Viewing archived' : `Archived (${archivedCount})`}
              </button>
            )}
            {!showArchived && (
              <button
                type="button"
                onClick={() => navigate('/inspections/new')}
                className="ops-next-control min-h-[44px]"
              >
                <Plus size={16} /> Start inspection
              </button>
            )}
          </div>
        </div>

        <div className="flex flex-wrap gap-2 mb-4">
          <div className="relative flex-1 min-w-[200px]">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search job, site, template…"
              className="form-input-sm w-full pl-9 min-h-[44px]"
            />
          </div>
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value as typeof statusFilter)}
            className="form-input-sm min-h-[44px]"
            aria-label="Filter by status"
          >
            <option value="all">All statuses</option>
            <option value="draft">Draft</option>
            <option value="completed">Ready</option>
            <option value="issued">Issued</option>
          </select>
        </div>

        {exportError && (
          <div className="flex items-center justify-between ops-alert mb-3">
            <span>{exportError}</span>
            <button type="button" onClick={() => setExportError(null)} className="ml-3 shrink-0 min-h-[44px] min-w-[44px] inline-flex items-center justify-center"><X size={14} /></button>
          </div>
        )}
        {deleteError && (
          <div className="flex items-center justify-between ops-alert mb-3">
            <span>{deleteError}</span>
            <button type="button" onClick={() => setDeleteError(null)} className="ml-3 shrink-0 min-h-[44px] min-w-[44px] inline-flex items-center justify-center"><X size={14} /></button>
          </div>
        )}

        {isLoading && (
          <div className="flex justify-center py-16"><LoadingSpinner size="lg" /></div>
        )}
        {isError && <PageError onRetry={refetch} />}

        {noneAtAll && (
          <EmptyState
            icon={ClipboardList}
            title={showArchived ? 'No archived inspections' : 'No inspections yet'}
            message={showArchived
              ? 'Archived inspections will show up here.'
              : 'Open a job and tap Start inspection. That is how a leading hand starts one on site — this list is for opening and finishing them.'}
            action={!showArchived ? (
              <Link to="/jobs" className="ops-next-control min-w-[160px]">
                Open jobs
              </Link>
            ) : undefined}
          />
        )}

        {noneMatch && (
          <EmptyState
            icon={FileText}
            title="No matching inspections"
            message="Try another status or search."
          />
        )}

        {!isLoading && filtered.length > 0 && (
          <div className="space-y-4">
            <InspectionGroup
              title="Needs action"
              docs={openDocs}
              selectedIds={selectedIds}
              onToggleSelect={toggleSelect}
              isAdmin={isAdmin}
              onOpen={href => navigate(href)}
              onArchive={handleArchiveToggle}
              onDelete={handleDelete}
              onAddInspection={id => navigate(`/inspections/new?jobId=${id}`)}
              onSendToDrive={id => setSendToDriveFor(id)}
              onSendReport={setSendingReportId}
              deleting={deleteMutation.isPending}
            />
            <InspectionGroup
              title="Done"
              docs={doneDocs}
              selectedIds={selectedIds}
              onToggleSelect={toggleSelect}
              isAdmin={isAdmin}
              onOpen={href => navigate(href)}
              onArchive={handleArchiveToggle}
              onDelete={handleDelete}
              onAddInspection={id => navigate(`/inspections/new?jobId=${id}`)}
              onSendToDrive={id => setSendToDriveFor(id)}
              onSendReport={setSendingReportId}
              deleting={deleteMutation.isPending}
            />
          </div>
        )}
      </div>

      {sendToDriveFor && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-start justify-center p-4 pt-[8vh] overflow-y-auto" onClick={() => setSendToDriveFor(null)}>
          <div className="bg-white rounded-md border border-rule w-full max-w-sm p-5" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-2 mb-4">
              <Send size={20} className="text-accent" />
              <h3 className="text-base font-semibold text-ink">Send to Drive folder</h3>
            </div>
            <div className="max-h-64 overflow-y-auto border border-rule rounded-md">
              <button
                type="button"
                onClick={() => handleSendToDrive(null)}
                className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-ink hover:bg-zebra border-b border-rule last:border-0 text-left min-h-[44px]"
              >
                <Home size={15} className="text-muted" /> Root (Shared Drive)
              </button>
              {(driveFolders ?? []).map(f => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => handleSendToDrive(f.id)}
                  className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-ink hover:bg-zebra border-b border-rule last:border-0 text-left min-h-[44px]"
                >
                  <Folder size={15} className="text-accent" /> {f.name}
                </button>
              ))}
            </div>
            <div className="flex justify-end mt-4">
              <button type="button" onClick={() => setSendToDriveFor(null)} className="px-3 py-2 text-sm text-muted hover:bg-zebra rounded-md min-h-[44px]">Cancel</button>
            </div>
          </div>
        </div>
      )}
      {sendingReportId && company?.id && (
        <ReportSendDialog
          reportId={sendingReportId}
          company={{
            id: company.id,
            name: company.name,
            abn: (company as { abn?: string | null }).abn ?? null,
            licence_number: (company as { licence_number?: string | null }).licence_number ?? null,
            phone: (company as { phone?: string | null }).phone ?? null,
            email: (company as { email?: string | null }).email ?? null,
            website: (company as { website?: string | null }).website ?? null,
            logo_url: (company as { logo_url?: string | null }).logo_url ?? null,
          }}
          onClose={() => setSendingReportId(null)}
          onSent={(_to, message) => {
            setSendingReportId(null);
            queryClient.invalidateQueries({ queryKey: ['inspections'] });
            showToast(message ?? 'Report sent.');
          }}
        />
      )}
    </AppShell>
  );
}

function InspectionGroup({
  title,
  docs,
  selectedIds,
  onToggleSelect,
  isAdmin,
  onOpen,
  onArchive,
  onDelete,
  onAddInspection,
  onSendToDrive,
  onSendReport,
  deleting,
}: {
  title: string;
  docs: Inspection[];
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
  isAdmin: boolean;
  onOpen: (href: string) => void;
  onArchive: (id: string, archived: boolean) => void;
  onDelete: (id: string) => void;
  onAddInspection: (id: string) => void;
  onSendToDrive: (id: string) => void;
  onSendReport: (reportId: string) => void;
  deleting: boolean;
}) {
  if (docs.length === 0) return null;
  return (
    <div>
      <h2 className="ops-group-title">
        {title}
        <span className="ops-meta normal-case font-normal"> ({docs.length})</span>
      </h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
        {docs.map(d => (
          <InspectionCard
            key={d.id}
            doc={d}
            selected={selectedIds.has(d.id)}
            onToggleSelect={() => onToggleSelect(d.id)}
            isAdmin={isAdmin}
            onOpen={onOpen}
            onArchive={onArchive}
            onDelete={onDelete}
            onAddInspection={() => onAddInspection(d.id)}
            onSendToDrive={() => onSendToDrive(d.id)}
            onSendReport={onSendReport}
            deleting={deleting}
          />
        ))}
      </div>
    </div>
  );
}

function InspectionCard({
  doc,
  selected,
  onToggleSelect,
  isAdmin,
  onOpen,
  onArchive,
  onDelete,
  onAddInspection,
  onSendToDrive,
  onSendReport,
  deleting,
}: {
  doc: Inspection;
  selected: boolean;
  onToggleSelect: () => void;
  isAdmin: boolean;
  onOpen: (href: string) => void;
  onArchive: (id: string, archived: boolean) => void;
  onDelete: (id: string) => void;
  onAddInspection: () => void;
  onSendToDrive: () => void;
  onSendReport: (reportId: string) => void;
  deleting: boolean;
}) {
  const living = applyLivingJobToInspection(
    doc.meta,
    doc.crm_job_id
      ? {
          id: doc.crm_job_id,
          title: doc.job_title,
          address: doc.job_address,
          client_id: doc.job_client_id,
          client_name: doc.job_client_name,
        }
      : null,
  );
  const recommended = recommendInspectionListAction(inspectionListContext({
    ...doc,
    hasReport: !!doc.report_id,
    reportId: doc.report_id ?? null,
    livingSite: living.siteName,
    jobBound: !!doc.crm_job_id,
  }));
  const next = withInspectionDueNext(
    doc,
    doc.crm_job_id ? {
      id: doc.crm_job_id,
      company_id: doc.job_company_id ?? '',
      client_id: doc.job_client_id ?? null,
      scheduled_date: doc.job_scheduled_date ?? null,
      job_number: doc.job_number ?? null,
    } : null,
    { href: inspectionOpenPath(doc.id, recommended.key), label: recommended.label, actionable: true },
  );
  const href = inspectionOpenPath(doc.id, recommended.key === 'send' ? 'pdf' : recommended.key);
  const displayStatus = inspectionDisplayStatus(doc.status, doc.report_sent_at);
  const site = doc.crm_job_id
    ? opsSiteLabel(living.siteName, living.siteAddress)
    : opsSiteLabel(doc.meta?.siteName, doc.meta?.siteAddress, doc.job_address, doc.job_title);
  const title = doc.template_snapshot?.name || 'Inspection';
  const when = format(parseISO(doc.completed_at || doc.started_at), 'd MMM yyyy');
  const jobNo = doc.meta?.jobNumber || (doc.job_number != null ? String(doc.job_number).padStart(4, '0') : null);

  return (
    <div
      role="link"
      tabIndex={0}
      onClick={() => onOpen(href)}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(href); } }}
      className={`ops-card ops-card-hover group w-full cursor-pointer ${doc.archived ? 'opacity-70' : ''}`}
    >
      <OpsDocHead
        kind="Inspection"
        id={jobNo ? `#${jobNo}` : 'Draft'}
        meta={when}
        trailing={
          <div className="flex items-center gap-1">
            <OpsStatus className={inspectionStatusClass(displayStatus)}>{inspectionStatusLabel(displayStatus)}</OpsStatus>
            {isAdmin && (
              <ArchiveMenu
                inspection={doc}
                onToggle={onArchive}
                onDelete={onDelete}
                onAddInspection={onAddInspection}
                onSendToDrive={() => onSendToDrive()}
                isAdmin={isAdmin}
                isDeleting={deleting}
              />
            )}
          </div>
        }
      />
      <div className="ops-card-body">
        <OpsSiteRow site={site} mapsQuery={living.siteName || living.siteAddress || doc.job_address || (!doc.crm_job_id ? (doc.meta?.siteName || doc.meta?.siteAddress) : null) || null} />
        <p className="ops-meta mt-1 truncate">{title}</p>
        {(doc.job_title || living.clientName || (!doc.crm_job_id && doc.meta?.clientName) || doc.inspector_name) && (
          <p className="ops-meta mt-0.5 truncate">
            {[doc.job_title, living.clientName || (!doc.crm_job_id ? doc.meta?.clientName : ''), doc.inspector_name].filter(Boolean).join(' · ')}
          </p>
        )}
        {doc.parent_inspection_id && (
          <p className="ops-meta mt-0.5">Linked inspection</p>
        )}
        <div className="ops-card-footer" onClick={e => e.stopPropagation()}>
          <button
            type="button"
            onClick={() => {
              if (next.label === 'Send' && doc.report_id) onSendReport(doc.report_id);
              else onOpen(next.href);
            }}
            className={next.label === 'No report yet' ? 'ops-next-control-done' : 'ops-next-control-block'}
          >
            {next.label}
          </button>
          <label className="flex items-center gap-2 mt-1 min-h-[44px] text-xs text-muted px-1">
            <input
              type="checkbox"
              checked={selected}
              onChange={onToggleSelect}
              className="rounded border-gray-300"
              aria-label={`Select ${site}`}
            />
            Include in pack
          </label>
        </div>
      </div>
    </div>
  );
}

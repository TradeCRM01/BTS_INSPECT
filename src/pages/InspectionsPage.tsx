import { useState, useMemo, useRef, memo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { AppShell } from '../components/layout/AppShell';
import { LoadingSpinner, PageError } from '../components/ui';
import { SkeletonList } from '../components/ui/Skeletons';
import {
  Plus, ClipboardList, ChevronRight, Search, X,
  Calendar, ChevronDown, SlidersHorizontal, ArrowUpDown,
  Archive, ArchiveRestore, MoreVertical, Link2, Zap, LayoutTemplate, Trash2,
  Send, Folder, Home, Package,
} from 'lucide-react';
import { format, isAfter, isBefore, startOfDay, endOfDay, parseISO } from 'date-fns';
import { downloadBlob, exportInspectionPack } from '../lib/exportInspectionPack';

// ── Types ──────────────────────────────────────────────────────────────────

interface Inspection {
  id: string;
  status: string;
  meta: Record<string, string>;
  started_at: string;
  completed_at: string | null;
  template_snapshot: { name?: string; report_renderer?: string } | null;
  inspector_id: string;
  inspector_name?: string;
  archived: boolean;
  parent_inspection_id: string | null;
}

// ── Sub-components ─────────────────────────────────────────────────────────

const STATUS_STYLES: Record<string, { label: string; cls: string }> = {
  draft: { label: 'Draft', cls: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200' },
  completed: { label: 'Completed', cls: 'bg-green-50 text-green-700 ring-1 ring-green-200' },
  issued: { label: 'Issued', cls: 'bg-[#0A2540]/10 text-[#0A2540] ring-1 ring-[#0A2540]/20' },
};

const StatusPill = memo(function StatusPill({ status }: { status: string }) {
  const s = STATUS_STYLES[status] ?? STATUS_STYLES.draft;
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium shrink-0 ${s.cls}`}>
      {s.label}
    </span>
  );
});

const FilterSelect = memo(function FilterSelect({
  label, value, onChange, options,
}: {
  label: string; value: string; onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className={`appearance-none h-9 pl-3 pr-8 text-sm border rounded-md focus:outline-none focus:ring-2 focus:ring-[#2E75B6] focus:border-transparent transition-colors cursor-pointer
          ${value !== '' ? 'border-[#2E75B6] bg-[#EFF6FF] text-[#1e40af] font-medium' : 'border-[#E5E7EB] bg-white text-[#374151]'}`}
      >
        <option value="">{label}</option>
        {options.map(o => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
      <ChevronDown size={13} className="absolute right-2 top-1/2 -translate-y-1/2 text-[#9CA3AF] pointer-events-none" />
    </div>
  );
});

const DateInput = memo(function DateInput({ placeholder, value, onChange }: {
  placeholder: string; value: string; onChange: (v: string) => void;
}) {
  return (
    <div className="relative flex items-center">
      <Calendar size={13} className="absolute left-2.5 text-[#9CA3AF] pointer-events-none" />
      <input
        type="date"
        value={value}
        onChange={e => onChange(e.target.value)}
        className={`h-9 pl-8 pr-3 text-sm border rounded-md focus:outline-none focus:ring-2 focus:ring-[#2E75B6] focus:border-transparent transition-colors
          ${value ? 'border-[#2E75B6] bg-[#EFF6FF] text-[#1e40af] font-medium' : 'border-[#E5E7EB] bg-white text-[#374151]'}`}
        placeholder={placeholder}
      />
    </div>
  );
});

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
        className="fixed bg-white border border-[#E5E7EB] rounded-lg shadow-lg py-1 min-w-[200px] max-h-80 overflow-y-auto"
        style={{ top: pos.top, left: pos.left, zIndex: 9999, maxHeight: 'calc(100vh - 100px)' }}
      >
        {showDeleteConfirm ? (
          <>
            <div className="px-3 py-2">
              <p className="text-sm font-medium text-[#1A1A1A] mb-2">Delete inspection?</p>
              <p className="text-xs text-[#6B7280] mb-3">This cannot be undone.</p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setShowDeleteConfirm(false)}
                  disabled={isDeleting}
                  className="flex-1 px-2 py-1.5 text-xs border border-[#E5E7EB] text-[#374151] rounded hover:bg-[#F9FAFB] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={isDeleting}
                  className="flex-1 px-2 py-1.5 text-xs bg-red-600 text-white rounded hover:bg-red-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isDeleting ? 'Deleting...' : 'Delete'}
                </button>
              </div>
            </div>
          </>
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
                className="w-full flex items-center gap-2.5 px-3 py-2 text-sm hover:bg-[#F9FAFB] transition-colors text-left text-[#2E75B6]"
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
                className="w-full flex items-center gap-2.5 px-3 py-2 text-sm hover:bg-[#F9FAFB] transition-colors text-left text-[#2E75B6]"
              >
                <Send size={14} /> Send to Drive folder
              </button>
            )}
            {(onAddInspection || onSendToDrive) && !inspection.archived && (
              <div className="border-t border-[#E5E7EB] my-1" />
            )}
            <button
              type="button"
              onClick={e => {
                e.preventDefault();
                e.stopPropagation();
                onToggle(inspection.id, !inspection.archived);
                setOpen(false);
              }}
              className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm hover:bg-[#F9FAFB] transition-colors text-left
                ${inspection.archived ? 'text-[#1B7F3A]' : 'text-[#B42318]'}`}
            >
              {inspection.archived
                ? <><ArchiveRestore size={14} /> Unarchive</>
                : <><Archive size={14} /> Archive</>}
            </button>
            {isAdmin && onDelete && (
              <>
                <div className="border-t border-[#E5E7EB] my-1" />
                <button
                  type="button"
                  onClick={e => {
                    e.preventDefault();
                    e.stopPropagation();
                    setShowDeleteConfirm(true);
                  }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-sm hover:bg-red-50 transition-colors text-left text-red-600"
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
        className="relative w-7 h-7 flex items-center justify-center rounded hover:bg-[#F3F4F6] text-[#9CA3AF] hover:text-[#374151] transition-colors"
        style={{ zIndex: 20 }}
      >
        <MoreVertical size={15} />
      </button>
      {dropdown}
    </div>
  );
});

const TemplateIcon = memo(function TemplateIcon({ renderer }: { renderer?: string }) {
  if (renderer === 'electrical_3000') return <Zap size={12} className="text-[#2E75B6]" />;
  return <LayoutTemplate size={12} className="text-[#4A5568]" />;
});

// ── Linked inspection row (nested under parent) ────────────────────────────

const LinkedInspectionRow = memo(function LinkedInspectionRow({
  insp,
  isAdmin,
  onToggleArchive,
  onDelete,
  onSendToDrive,
}: {
  insp: Inspection;
  isAdmin: boolean;
  onToggleArchive: (id: string, archived: boolean) => void;
  onDelete: (id: string) => void;
  onSendToDrive?: (id: string) => void;
}) {
  const to = insp.status === 'completed' || insp.status === 'issued'
    ? `/inspections/${insp.id}/report`
    : `/inspections/${insp.id}`;

  return (
    <div className="relative group">
      <Link
        to={to}
        className="flex items-center gap-3 pl-10 pr-4 py-2.5 hover:bg-[#F9FAFB] transition-colors border-t border-[#F3F4F6]"
      >
        {/* Indent line */}
        <div className="absolute left-5 top-0 bottom-0 w-px bg-[#E5E7EB]" />
        <div className="absolute left-5 top-1/2 w-3 h-px bg-[#E5E7EB]" />

        <div className="flex items-center gap-1.5 min-w-0 flex-1">
          <TemplateIcon renderer={insp.template_snapshot?.report_renderer} />
          <p className="text-xs font-medium text-[#374151] truncate">
            {insp.template_snapshot?.name ?? 'Unknown template'}
          </p>
        </div>

        <p className="hidden sm:block text-xs text-[#6B7280] shrink-0">
          {insp.inspector_name}
        </p>

        <p className="hidden sm:block text-xs text-[#9CA3AF] whitespace-nowrap shrink-0">
          {format(new Date(insp.started_at), 'd MMM yyyy')}
        </p>

        <StatusPill status={insp.status} />

        {!isAdmin && (
          <ChevronRight size={13} className="text-[#D1D5DB] group-hover:text-[#9CA3AF] transition-colors shrink-0" />
        )}
        {isAdmin && <span className="w-7" />}
      </Link>

      {isAdmin && (
        <div className="absolute right-3 top-1/2 -translate-y-1/2">
          <ArchiveMenu inspection={insp} onToggle={onToggleArchive} onDelete={onDelete} onSendToDrive={onSendToDrive} isAdmin={isAdmin} isDeleting={false} />
        </div>
      )}
    </div>
  );
});

// ── Main page ──────────────────────────────────────────────────────────────

type SortField = 'started_at' | 'completed_at' | 'site' | 'template' | 'status';
type SortDir = 'asc' | 'desc';

export function InspectionsPage() {
  const { profile, company } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const isAdmin = profile?.role === 'admin';

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [templateFilter, setTemplateFilter] = useState('');
  const [inspectorFilter, setInspectorFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [sortField, setSortField] = useState<SortField>('started_at');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [showFilters, setShowFilters] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [exporting, setExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState('');
  const [exportError, setExportError] = useState<string | null>(null);

  const { data: inspections, isLoading, isError, refetch } = useQuery({
    queryKey: ['inspections'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('inspections')
        .select('id, status, meta, started_at, completed_at, template_snapshot, inspector_id, archived, parent_inspection_id')
        .order('started_at', { ascending: false });
      if (error) throw error;

      const inspectorIds = [...new Set((data ?? []).map(i => i.inspector_id))];
      let nameMap: Record<string, string> = {};
      if (inspectorIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, name')
          .in('id', inspectorIds);
        nameMap = Object.fromEntries((profiles ?? []).map(p => [p.id, p.name]));
      }

      return (data ?? []).map(i => ({
        ...i,
        meta: (i.meta ?? {}) as Record<string, string>,
        template_snapshot: (i.template_snapshot ?? null) as { name?: string; report_renderer?: string } | null,
        inspector_name: nameMap[i.inspector_id] ?? 'Unknown',
        archived: i.archived ?? false,
        parent_inspection_id: i.parent_inspection_id ?? null,
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

  const [deleteError, setDeleteError] = useState<string | null>(null);

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
    [archiveMutation.mutate],
  );

  const handleDelete = useCallback(
    (id: string) => deleteMutation.mutate(id),
    [deleteMutation.mutate],
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

  const [sendToDriveFor, setSendToDriveFor] = useState<string | null>(null);

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

  const templateOptions = useMemo(() => {
    if (!inspections) return [];
    const names = [...new Set(inspections.map(i => i.template_snapshot?.name ?? 'Unknown'))];
    return names.sort().map(n => ({ value: n, label: n }));
  }, [inspections]);

  const inspectorOptions = useMemo(() => {
    if (!inspections) return [];
    const names = [...new Set(inspections.map(i => i.inspector_name ?? 'Unknown'))];
    return names.sort().map(n => ({ value: n, label: n }));
  }, [inspections]);

  const activeFilterCount = [statusFilter, templateFilter, inspectorFilter, dateFrom, dateTo]
    .filter(Boolean).length;

  const archivedCount = useMemo(
    () => (inspections ?? []).filter(i => i.archived).length,
    [inspections]
  );

  // Single pass: build child map and root ID set together
  const { childrenByParent, rootIds } = useMemo(() => {
    const map: Record<string, Inspection[]> = {};
    const roots = new Set<string>();
    for (const i of (inspections ?? [])) {
      if (i.parent_inspection_id) {
        if (!map[i.parent_inspection_id]) map[i.parent_inspection_id] = [];
        map[i.parent_inspection_id].push(i);
      } else {
        roots.add(i.id);
      }
    }
    return { childrenByParent: map, rootIds: roots };
  }, [inspections]);

  // Filters apply only to root (non-child) inspections
  const filtered = useMemo(() => {
    if (!inspections) return [];

    let result = inspections.filter(insp => {
      // Only show root inspections in the main list
      if (insp.parent_inspection_id) return false;

      if (!showArchived && insp.archived) return false;
      if (showArchived && !insp.archived) return false;

      const site = insp.meta?.siteName ?? '';
      const client = insp.meta?.clientName ?? '';
      const template = insp.template_snapshot?.name ?? '';

      if (search) {
        const q = search.toLowerCase();
        if (
          !site.toLowerCase().includes(q) &&
          !client.toLowerCase().includes(q) &&
          !template.toLowerCase().includes(q) &&
          !(insp.inspector_name ?? '').toLowerCase().includes(q)
        ) return false;
      }

      if (statusFilter && insp.status !== statusFilter) return false;
      if (templateFilter && template !== templateFilter) return false;
      if (inspectorFilter && (insp.inspector_name ?? '') !== inspectorFilter) return false;

      if (dateFrom) {
        const from = startOfDay(parseISO(dateFrom));
        if (isBefore(parseISO(insp.started_at), from)) return false;
      }
      if (dateTo) {
        const to = endOfDay(parseISO(dateTo));
        if (isAfter(parseISO(insp.started_at), to)) return false;
      }

      return true;
    });

    result = [...result].sort((a, b) => {
      let av = '', bv = '';
      if (sortField === 'started_at') { av = a.started_at; bv = b.started_at; }
      else if (sortField === 'completed_at') { av = a.completed_at ?? ''; bv = b.completed_at ?? ''; }
      else if (sortField === 'site') { av = a.meta?.siteName ?? ''; bv = b.meta?.siteName ?? ''; }
      else if (sortField === 'template') { av = a.template_snapshot?.name ?? ''; bv = b.template_snapshot?.name ?? ''; }
      else if (sortField === 'status') { av = a.status; bv = b.status; }
      const cmp = av.localeCompare(bv);
      return sortDir === 'asc' ? cmp : -cmp;
    });

    return result;
  }, [inspections, search, statusFilter, templateFilter, inspectorFilter, dateFrom, dateTo, sortField, sortDir, showArchived]);

  const clearAllFilters = useCallback(() => {
    setSearch(''); setStatusFilter(''); setTemplateFilter('');
    setInspectorFilter(''); setDateFrom(''); setDateTo('');
  }, []);

  const toggleSort = useCallback((field: SortField) => {
    if (sortField === field) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir('desc');
    }
  }, [sortField]);

  const SortBtn = ({ field, label }: { field: SortField; label: string }) => (
    <button
      onClick={() => toggleSort(field)}
      className={`flex items-center gap-1 text-xs font-medium transition-colors
        ${sortField === field ? 'text-[#2E75B6]' : 'text-[#6B7280] hover:text-[#374151]'}`}
    >
      {label}
      <ArrowUpDown size={11} className={sortField === field ? 'text-[#2E75B6]' : 'text-[#D1D5DB]'} />
    </button>
  );

  const totalVisible = filtered.length;

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleSelectAllVisible = useCallback(() => {
    setSelectedIds(prev => {
      const ids = filtered.map(i => i.id);
      const allSelected = ids.length > 0 && ids.every(id => prev.has(id));
      if (allSelected) return new Set();
      return new Set(ids);
    });
  }, [filtered]);

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

  // Orphaned children (parent was archived or parent_id doesn't exist as a root)
  const orphanedChildren = useMemo(() => {
    return (inspections ?? []).filter(i =>
      i.parent_inspection_id &&
      !rootIds.has(i.parent_inspection_id) &&
      (showArchived ? i.archived : !i.archived)
    );
  }, [inspections, rootIds, showArchived]);

  return (
    <AppShell>
      <div className="max-w-[1100px] mx-auto px-4 py-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div>
            <h1 className="text-xl font-semibold text-[#1A1A1A]">Inspections</h1>
            <p className="text-sm text-[#4A5568] mt-0.5">
              {isLoading ? 'Loading…' : `${filtered.length} of ${totalVisible} job${totalVisible !== 1 ? 's' : ''}`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {selectedIds.size > 0 && (
              <button
                onClick={handleExportPack}
                disabled={exporting}
                className="flex items-center gap-1.5 h-9 px-3 text-sm border border-[#0A2540] text-[#0A2540] rounded-md hover:bg-[#F9FAFB] font-medium disabled:opacity-50"
              >
                <Package size={14} />
                {exporting ? (exportProgress || 'Exporting…') : `Export pack (${selectedIds.size})`}
              </button>
            )}
            {isAdmin && archivedCount > 0 && (
              <button
                onClick={() => setShowArchived(v => !v)}
                className={`flex items-center gap-1.5 h-9 px-3 text-sm border rounded-md transition-colors font-medium
                  ${showArchived
                    ? 'border-[#B42318] bg-red-50 text-[#B42318]'
                    : 'border-[#E5E7EB] bg-white text-[#6B7280] hover:bg-[#F9FAFB]'}`}
              >
                <Archive size={14} />
                {showArchived ? 'Viewing archived' : `Archived (${archivedCount})`}
              </button>
            )}
            {!showArchived && (
              <button
                onClick={() => navigate('/inspections/new')}
                className="btn-primary"
              >
                <Plus size={16} /> Start Inspection
              </button>
            )}
          </div>
        </div>

        {/* Archived banner */}
        {showArchived && (
          <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-lg px-4 py-2.5 mb-4">
            <Archive size={15} className="text-amber-600 shrink-0" />
            <p className="text-sm text-amber-800 flex-1">Showing archived inspections. These are hidden from the default view.</p>
            <button
              onClick={() => setShowArchived(false)}
              className="text-xs text-amber-700 font-medium hover:underline shrink-0"
            >
              Back to active
            </button>
          </div>
        )}

        {/* Search + filter bar */}
        <div className="bg-white border border-[#E5E7EB] rounded-lg shadow-sm mb-4">
          <div className="flex items-center gap-2 px-3 py-2.5">
            <div className="relative flex-1">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#9CA3AF]" />
              <input
                type="text"
                placeholder="Search by site, client, template or inspector…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full h-9 pl-9 pr-8 text-sm border border-[#E5E7EB] rounded-md bg-[#F9FAFB] focus:outline-none focus:ring-2 focus:ring-[#2E75B6] focus:border-transparent transition-colors"
              />
              {search && (
                <button onClick={() => setSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#9CA3AF] hover:text-[#374151]">
                  <X size={13} />
                </button>
              )}
            </div>

            <button
              onClick={() => setShowFilters(v => !v)}
              className={`flex items-center gap-1.5 h-9 px-3 text-sm border rounded-md transition-colors font-medium
                ${showFilters || activeFilterCount > 0
                  ? 'border-[#2E75B6] bg-[#EFF6FF] text-[#1e40af]'
                  : 'border-[#E5E7EB] bg-white text-[#374151] hover:bg-[#F9FAFB]'}`}
            >
              <SlidersHorizontal size={14} />
              Filters
              {activeFilterCount > 0 && (
                <span className="bg-[#2E75B6] text-white text-xs font-bold rounded-full w-4 h-4 flex items-center justify-center leading-none">
                  {activeFilterCount}
                </span>
              )}
            </button>

            {(search || activeFilterCount > 0) && (
              <button
                onClick={clearAllFilters}
                className="h-9 px-3 text-sm text-[#6B7280] hover:text-[#374151] border border-[#E5E7EB] rounded-md hover:bg-[#F9FAFB] transition-colors"
              >
                Clear all
              </button>
            )}
          </div>

          {showFilters && (
            <div className="border-t border-[#E5E7EB] px-3 py-3 flex flex-wrap gap-2 items-center bg-[#F9FAFB] rounded-b-lg">
              <FilterSelect
                label="All statuses"
                value={statusFilter}
                onChange={setStatusFilter}
                options={[
                  { value: 'draft', label: 'Draft' },
                  { value: 'completed', label: 'Completed' },
                  { value: 'issued', label: 'Issued' },
                ]}
              />
              <FilterSelect
                label="All templates"
                value={templateFilter}
                onChange={setTemplateFilter}
                options={templateOptions}
              />
              {inspectorOptions.length > 1 && (
                <FilterSelect
                  label="All inspectors"
                  value={inspectorFilter}
                  onChange={setInspectorFilter}
                  options={inspectorOptions}
                />
              )}
              <div className="flex items-center gap-1.5 min-w-min">
                <span className="text-xs text-[#9CA3AF] font-medium hidden sm:inline">FROM</span>
                <DateInput value={dateFrom} onChange={setDateFrom} placeholder="From" />
              </div>
              <div className="flex items-center gap-1.5 min-w-min">
                <span className="text-xs text-[#9CA3AF] font-medium hidden sm:inline">TO</span>
                <DateInput value={dateTo} onChange={setDateTo} placeholder="To" />
              </div>
            </div>
          )}
        </div>

        {/* Sort bar */}
        {!isLoading && totalVisible > 0 && (
          <div className="flex items-center gap-4 px-1 mb-2">
            <span className="text-xs text-[#9CA3AF] font-medium uppercase tracking-wide">Sort by</span>
            <SortBtn field="started_at" label="Start date" />
            <SortBtn field="completed_at" label="Completed" />
            <SortBtn field="site" label="Site" />
            <SortBtn field="template" label="Template" />
            <SortBtn field="status" label="Status" />
          </div>
        )}

        {exportError && (
          <div className="flex items-center justify-between bg-red-50 border border-red-200 rounded-lg px-4 py-2.5 mb-3 text-sm text-red-700">
            <span>{exportError}</span>
            <button onClick={() => setExportError(null)} className="ml-3 shrink-0"><X size={14} /></button>
          </div>
        )}

        {/* Delete error banner */}
        {deleteError && (
          <div className="flex items-center justify-between bg-red-50 border border-red-200 rounded-lg px-4 py-2.5 mb-3 text-sm text-red-700">
            <span>{deleteError}</span>
            <button onClick={() => setDeleteError(null)} className="ml-3 shrink-0"><X size={14} /></button>
          </div>
        )}

        {/* List */}
        {isLoading ? (
          <SkeletonList count={6} />
        ) : isError ? (
          <PageError onRetry={refetch} />
        ) : totalVisible === 0 ? (
          <div className="bg-white rounded-lg border border-[#E5E7EB] py-16 text-center">
            <ClipboardList size={40} className="mx-auto text-[#E5E7EB] mb-3" />
            <p className="text-[#1A1A1A] font-medium">{showArchived ? 'No archived inspections' : 'No inspections yet'}</p>
            {!showArchived && (
              <>
                <p className="text-sm text-[#4A5568] mt-1">Start an inspection from a template.</p>
                <button
                  onClick={() => navigate('/inspections/new')}
                  className="mt-4 btn-primary"
                >
                  <Plus size={14} /> Start Inspection
                </button>
              </>
            )}
          </div>
        ) : filtered.length === 0 && orphanedChildren.length === 0 ? (
          <div className="bg-white rounded-lg border border-[#E5E7EB] py-14 text-center">
            <Search size={36} className="mx-auto text-[#E5E7EB] mb-3" />
            <p className="text-[#1A1A1A] font-medium">No inspections match your filters</p>
            <p className="text-sm text-[#4A5568] mt-1">Try adjusting or clearing your filters.</p>
            <button
              onClick={clearAllFilters}
              className="mt-4 inline-flex items-center gap-2 text-sm text-[#2E75B6] hover:underline"
            >
              <X size={13} /> Clear all filters
            </button>
          </div>
        ) : (
          <div className="table-container overflow-hidden">
            {/* Table header */}
            <div className="hidden sm:grid items-center gap-3 px-4 py-2.5 bg-[#F9FAFB] border-b border-[#E5E7EB] grid-cols-[36px_minmax(0,2fr)_minmax(0,1.5fr)_120px_110px_100px_32px]">
              <input
                type="checkbox"
                checked={filtered.length > 0 && filtered.every(i => selectedIds.has(i.id))}
                onChange={toggleSelectAllVisible}
                className="rounded border-gray-300"
                aria-label="Select all visible"
              />
              <span className="text-xs font-semibold text-[#6B7280] uppercase tracking-wide">Site / Client</span>
              <span className="text-xs font-semibold text-[#6B7280] uppercase tracking-wide">Template</span>
              <span className="text-xs font-semibold text-[#6B7280] uppercase tracking-wide">Inspector</span>
              <span className="text-xs font-semibold text-[#6B7280] uppercase tracking-wide">Date</span>
              <span className="text-xs font-semibold text-[#6B7280] uppercase tracking-wide">Status</span>
              <span />
            </div>

            <div className="divide-y divide-[#E5E7EB]">
              {filtered.map(insp => {
                const meta = insp.meta;
                const to = insp.status === 'completed' || insp.status === 'issued'
                  ? `/inspections/${insp.id}/report`
                  : `/inspections/${insp.id}`;
                const jobDesc = meta?.jobDescription;
                const children = childrenByParent[insp.id] ?? [];
                const hasChildren = children.length > 0;

                return (
                  <div key={insp.id} className={`${hasChildren ? 'bg-[#FAFBFC]' : ''}`}>
                    {/* Parent / root row */}
                    <div className="relative group">
                      {/* Mobile layout: flex row with link taking all space, then status+menu outside */}
                      <div className={`flex items-center sm:grid sm:grid-cols-[36px_minmax(0,2fr)_minmax(0,1.5fr)_120px_110px_100px_32px] sm:gap-3 sm:px-4 ${insp.archived ? 'opacity-60' : ''}`}>
                        <div className="pl-4 sm:pl-0 py-3.5 shrink-0 flex items-center">
                          <input
                            type="checkbox"
                            checked={selectedIds.has(insp.id)}
                            onChange={() => toggleSelect(insp.id)}
                            onClick={e => e.stopPropagation()}
                            className="rounded border-gray-300"
                            aria-label={`Select ${meta?.siteName || 'inspection'}`}
                          />
                        </div>
                        <Link
                          to={to}
                          className="flex-1 min-w-0 sm:contents hover:bg-[#F9FAFB] transition-colors flex items-center gap-3 pr-4 sm:pr-0 py-3.5 sm:py-0"
                        >
                          <div className="min-w-0 flex-1 sm:py-3.5">
                            <div className="flex items-center gap-1.5">
                              {hasChildren && (
                                <div className="flex items-center gap-0.5 bg-[#EFF6FF] border border-[#BFDBFE] rounded px-1.5 py-0.5 shrink-0">
                                  <Link2 size={10} className="text-[#2E75B6]" />
                                  <span className="text-[10px] font-semibold text-[#2E75B6]">{children.length + 1}</span>
                                </div>
                              )}
                              <p className="text-sm font-medium text-[#1A1A1A] truncate">
                                {meta?.siteName || 'Untitled inspection'}
                              </p>
                            </div>
                            {meta?.clientName && (
                              <p className="text-xs text-[#6B7280] truncate">{meta.clientName}</p>
                            )}
                          </div>

                          <div className="hidden sm:flex items-center gap-1.5 min-w-0 sm:py-3.5">
                            <TemplateIcon renderer={insp.template_snapshot?.report_renderer} />
                            <p className="text-xs text-[#4A5568] truncate">
                              {insp.template_snapshot?.name ?? '—'}
                            </p>
                          </div>

                          <p className="hidden sm:block text-xs text-[#4A5568] truncate sm:py-3.5">
                            {insp.inspector_name}
                          </p>

                          <p className="hidden sm:block text-xs text-[#4A5568] whitespace-nowrap sm:py-3.5">
                            {format(new Date(insp.started_at), 'd MMM yyyy')}
                          </p>

                          <div className="hidden sm:flex">
                            <StatusPill status={insp.status} />
                          </div>

                          {!isAdmin && (
                            <ChevronRight size={15} className="text-[#D1D5DB] group-hover:text-[#9CA3AF] transition-colors shrink-0 hidden sm:block" />
                          )}
                          {isAdmin && <span className="hidden sm:block" />}
                        </Link>

                        {/* Mobile: status pill + menu side by side, outside the link */}
                        <div className="flex sm:hidden items-center gap-1 pr-2 shrink-0">
                          <StatusPill status={insp.status} />
                          {isAdmin && (
                            <ArchiveMenu
                              inspection={insp}
                              onToggle={handleArchiveToggle}
                              onDelete={handleDelete}
                              onAddInspection={() => navigate(`/inspections/new?jobId=${insp.id}`)}
                              onSendToDrive={(id) => setSendToDriveFor(id)}
                              isAdmin={isAdmin}
                              isDeleting={deleteMutation.isPending}
                            />
                          )}
                          {!isAdmin && <ChevronRight size={15} className="text-[#D1D5DB] shrink-0" />}
                        </div>
                      </div>

                      {/* Desktop: absolute menu in last grid column */}
                      {isAdmin && (
                        <div className="absolute right-3 top-1/2 -translate-y-1/2 hidden sm:block">
                          <ArchiveMenu
                            inspection={insp}
                            onToggle={handleArchiveToggle}
                            onDelete={handleDelete}
                            onAddInspection={() => navigate(`/inspections/new?jobId=${insp.id}`)}
                            onSendToDrive={(id) => setSendToDriveFor(id)}
                            isAdmin={isAdmin}
                            isDeleting={deleteMutation.isPending}
                          />
                        </div>
                      )}

                      {jobDesc && (
                        <div className="pointer-events-none absolute left-4 bottom-[calc(100%+6px)] z-50 w-72 max-w-[calc(100vw-2rem)]
                          opacity-0 group-hover:opacity-100 transition-opacity duration-150">
                          <div className="bg-[#0A2540] text-white rounded-lg shadow-xl px-3.5 py-2.5">
                            <p className="text-[10px] font-semibold uppercase tracking-wider text-white/50 mb-1">Job Description</p>
                            <p className="text-xs leading-relaxed text-white/90 line-clamp-4">{jobDesc}</p>
                          </div>
                          <div className="w-2.5 h-2.5 bg-[#0A2540] rotate-45 ml-4 -mt-1.5 rounded-sm" />
                        </div>
                      )}
                    </div>

                    {/* Child linked inspection rows */}
                    {children.map(child => (
                      <LinkedInspectionRow
                        key={child.id}
                        insp={child}
                        isAdmin={isAdmin}
                        onToggleArchive={handleArchiveToggle}
                        onDelete={handleDelete}
                        onSendToDrive={(id) => setSendToDriveFor(id)}
                      />
                    ))}

                  </div>
                );
              })}

              {/* Orphaned children (parent archived but child is not) */}
              {orphanedChildren.map(insp => (
                <div key={insp.id} className="relative group">
                  <Link
                    to={insp.status === 'completed' || insp.status === 'issued'
                      ? `/inspections/${insp.id}/report`
                      : `/inspections/${insp.id}`}
                    className="flex sm:grid grid-cols-[minmax(0,2fr)_minmax(0,1.5fr)_120px_110px_100px_32px] items-center gap-3 px-4 py-3.5 hover:bg-[#F9FAFB] transition-colors"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-[#1A1A1A] truncate">
                        {insp.meta?.siteName || 'Untitled inspection'}
                      </p>
                      {insp.meta?.clientName && (
                        <p className="text-xs text-[#6B7280] truncate">{insp.meta.clientName}</p>
                      )}
                    </div>
                    <div className="hidden sm:flex items-center gap-1.5 min-w-0">
                      <TemplateIcon renderer={insp.template_snapshot?.report_renderer} />
                      <p className="text-xs text-[#4A5568] truncate">{insp.template_snapshot?.name ?? '—'}</p>
                    </div>
                    <p className="hidden sm:block text-xs text-[#4A5568] truncate">{insp.inspector_name}</p>
                    <p className="hidden sm:block text-xs text-[#4A5568] whitespace-nowrap">
                      {format(new Date(insp.started_at), 'd MMM yyyy')}
                    </p>
                    <div className="hidden sm:flex"><StatusPill status={insp.status} /></div>
                    <div className="flex sm:hidden items-center gap-2 ml-auto"><StatusPill status={insp.status} /></div>
                    {!isAdmin && <ChevronRight size={15} className="text-[#D1D5DB] group-hover:text-[#9CA3AF] transition-colors shrink-0 hidden sm:block" />}
                    {isAdmin && <span />}
                  </Link>
                  {isAdmin && (
                    <div className="absolute right-3 top-1/2 -translate-y-1/2">
                      <ArchiveMenu inspection={insp} onToggle={handleArchiveToggle} onDelete={handleDelete} onSendToDrive={(id) => setSendToDriveFor(id)} isAdmin={isAdmin} isDeleting={deleteMutation.isPending} />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {sendToDriveFor && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-start justify-center p-4 pt-[8vh] overflow-y-auto" onClick={() => setSendToDriveFor(null)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-5" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-2 mb-4">
              <Send size={20} className="text-[#2E75B6]" />
              <h3 className="text-base font-semibold text-[#1A1A1A]">Send to Drive folder</h3>
            </div>
            <div className="max-h-64 overflow-y-auto border border-[#E5E7EB] rounded-lg">
              <button
                onClick={() => handleSendToDrive(null)}
                className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-[#1A1A1A] hover:bg-[#F9FAFB] border-b border-[#F3F4F6] last:border-0 text-left"
              >
                <Home size={15} className="text-[#9AA0A6]" /> Root (Shared Drive)
              </button>
              {(driveFolders ?? []).map(f => (
                <button
                  key={f.id}
                  onClick={() => handleSendToDrive(f.id)}
                  className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-[#1A1A1A] hover:bg-[#F9FAFB] border-b border-[#F3F4F6] last:border-0 text-left"
                >
                  <Folder size={15} className="text-[#2E75B6]" /> {f.name}
                </button>
              ))}
            </div>
            <div className="flex justify-end mt-4">
              <button onClick={() => setSendToDriveFor(null)} className="px-3 py-2 text-sm text-[#4A5568] hover:bg-[#F3F4F6] rounded-md">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}

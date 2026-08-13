import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { format, parseISO } from 'date-fns';
import { ClipboardList, Plus, Search, FileText, RefreshCw } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { AppShell } from '../components/layout/AppShell';
import { LoadingSpinner, PageError } from '../components/ui';

type DocRow = {
  id: string;
  status: string;
  report_number: string | null;
  meta: Record<string, string>;
  doc_version: number | null;
  amendment_reason: string | null;
  amended_from_id: string | null;
  client_id: string | null;
  job_id: string | null;
  created_at: string;
  completed_at: string | null;
  template_snapshot: { name?: string } | null;
  client_name?: string | null;
  job_title?: string | null;
};

export function JhaDocumentsPage() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<'all' | 'draft' | 'completed' | 'published'>('all');

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
    queryKey: ['jha-documents', status],
    queryFn: async () => {
      let query = supabase
        .from('jha_documents')
        .select('id, status, report_number, meta, doc_version, amendment_reason, amended_from_id, client_id, job_id, created_at, completed_at, template_snapshot')
        .order('created_at', { ascending: false });
      if (status !== 'all') query = query.eq('status', status);
      const { data, error } = await query;
      if (error) throw error;
      const list = (data ?? []) as DocRow[];
      const clientIds = [...new Set(list.map(d => d.client_id).filter(Boolean))] as string[];
      const jobIds = [...new Set(list.map(d => d.job_id).filter(Boolean))] as string[];
      const [clientsRes, jobsRes] = await Promise.all([
        clientIds.length ? supabase.from('clients').select('id, name').in('id', clientIds) : Promise.resolve({ data: [], error: null }),
        jobIds.length ? supabase.from('jobs').select('id, title').in('id', jobIds) : Promise.resolve({ data: [], error: null }),
      ]);
      const clientMap = new Map((clientsRes.data ?? []).map(c => [c.id, c.name]));
      const jobMap = new Map((jobsRes.data ?? []).map(j => [j.id, j.title]));
      return list.map(d => ({
        ...d,
        client_name: d.client_id ? clientMap.get(d.client_id) ?? null : null,
        job_title: d.job_id ? jobMap.get(d.job_id) ?? null : null,
      }));
    },
    enabled: !!profile,
  });

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return docs ?? [];
    return (docs ?? []).filter(d => {
      const hay = [
        d.report_number,
        d.template_snapshot?.name,
        d.meta?.taskName,
        d.meta?.siteName,
        d.client_name,
        d.job_title,
        d.amendment_reason,
      ].filter(Boolean).join(' ').toLowerCase();
      return hay.includes(needle);
    });
  }, [docs, q]);

  return (
    <AppShell>
      <div className="max-w-[1200px] mx-auto px-4 py-6">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
          <div>
            <h1 className="text-xl font-semibold text-[#1A1A1A] flex items-center gap-2">
              <ClipboardList size={20} className="text-[#0A2540]" />
              JHA documents
            </h1>
            <p className="text-sm text-[#6B7280] mt-1">Search, open, and re-issue job hazard analyses.</p>
          </div>
          <div className="flex items-center gap-2">
            <select
              className="form-input-sm text-sm"
              defaultValue=""
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
            <Link
              to="/jha/swms-library"
              className="text-sm text-[#2E75B6] hover:underline flex items-center gap-1"
            >
              <FileText size={14} /> SWMS library
            </Link>
            <Link
              to="/templates"
              className="text-sm text-[#2E75B6] hover:underline flex items-center gap-1"
            >
              <Plus size={14} /> Manage templates
            </Link>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 mb-4">
          <div className="relative flex-1 min-w-[200px]">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#9CA3AF]" />
            <input
              value={q}
              onChange={e => setQ(e.target.value)}
              placeholder="Search task, site, client, report #…"
              className="form-input-sm w-full pl-9"
            />
          </div>
          <select
            value={status}
            onChange={e => setStatus(e.target.value as typeof status)}
            className="form-input-sm"
          >
            <option value="all">All statuses</option>
            <option value="draft">Draft</option>
            <option value="completed">Completed</option>
            <option value="published">Published</option>
          </select>
        </div>

        {isLoading && (
          <div className="flex justify-center py-16"><LoadingSpinner size="lg" /></div>
        )}
        {isError && <PageError onRetry={refetch} />}

        {!isLoading && !isError && filtered.length === 0 && (
          <div className="text-center py-16 border border-dashed border-[#E5E7EB] rounded-xl bg-white">
            <FileText size={36} className="mx-auto text-[#E5E7EB] mb-3" />
            <p className="text-[#1A1A1A] font-medium">No JHA documents yet</p>
            <p className="text-sm text-[#6B7280] mt-1">Create one from a template to get started.</p>
          </div>
        )}

        {!isLoading && filtered.length > 0 && (
          <div className="bg-white rounded-xl border border-[#E5E7EB] overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-[#F9FAFB] text-[#6B7280] text-xs uppercase tracking-wide">
                <tr>
                  <th className="text-left font-medium px-4 py-3">Document</th>
                  <th className="text-left font-medium px-4 py-3">Client / Job</th>
                  <th className="text-left font-medium px-4 py-3">Status</th>
                  <th className="text-left font-medium px-4 py-3">Rev</th>
                  <th className="text-left font-medium px-4 py-3">Updated</th>
                  <th className="text-right font-medium px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(d => {
                  const title = d.meta?.taskName || d.template_snapshot?.name || 'Untitled JHA';
                  const site = d.meta?.siteName;
                  return (
                    <tr key={d.id} className="border-t border-[#E5E7EB] hover:bg-[#F9FAFB]">
                      <td className="px-4 py-3">
                        <Link to={`/jha/new?docId=${d.id}`} className="font-medium text-[#0A2540] hover:underline">
                          {title}
                        </Link>
                        <div className="text-xs text-[#6B7280] mt-0.5">
                          {[d.report_number, site].filter(Boolean).join(' · ') || '—'}
                          {d.amended_from_id && (
                            <span className="ml-2 inline-flex items-center gap-0.5 text-amber-700">
                              <RefreshCw size={10} /> Amendment
                            </span>
                          )}
                        </div>
                        {d.amendment_reason && (
                          <div className="text-[11px] text-[#9CA3AF] mt-0.5 truncate max-w-md">
                            Reason: {d.amendment_reason}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-[#4A5568]">
                        <div>{d.client_name || d.meta?.clientName || '—'}</div>
                        <div className="text-xs text-[#9CA3AF]">{d.job_title || '—'}</div>
                      </td>
                      <td className="px-4 py-3">
                        <StatusPill status={d.status} />
                      </td>
                      <td className="px-4 py-3 text-[#4A5568]">v{d.doc_version ?? 1}</td>
                      <td className="px-4 py-3 text-[#6B7280] text-xs">
                        {format(parseISO(d.completed_at || d.created_at), 'd MMM yyyy')}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Link
                          to={`/jha/new?docId=${d.id}`}
                          className="text-xs text-[#2E75B6] hover:underline"
                        >
                          Open
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AppShell>
  );
}

function StatusPill({ status }: { status: string }) {
  const tone =
    status === 'published' ? 'bg-green-50 text-green-800 border-green-200'
      : status === 'completed' ? 'bg-blue-50 text-blue-800 border-blue-200'
        : 'bg-amber-50 text-amber-800 border-amber-200';
  return (
    <span className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-medium border ${tone}`}>
      {status}
    </span>
  );
}

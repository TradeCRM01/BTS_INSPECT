import { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { AppShell } from '../components/layout/AppShell';
import { LoadingSpinner, PageError, EmptyState, SearchBar, useToast, ViewToggle, useViewMode } from '../components/ui';
import { SkeletonRow, SkeletonSummaryCards } from '../components/ui/Skeletons';
import type { QuoteWithDetails, QuoteLineItem, QuoteStatus, StockItem, PriceBookItem } from '../types/fsm';
import type { Client, Job } from '../types/crm';
import { LineItemEditor, emptyLineItem, toEditLine, calcSubtotal, type EditLineItem } from '../components/invoicing/LineItemEditor';
import { DocumentVariationsEditor } from '../components/invoicing/DocumentVariationsEditor';
import { CommercialPdfPreviewModal } from '../components/invoicing/CommercialPdfPreviewModal';
import { linesFromQuoteItems } from '../reports/commercial/CommercialDocumentPdf';
import type { CommercialPdfData } from '../reports/commercial/CommercialDocumentPdf';
import { asStringList } from '../lib/asStringList';
import { QUOTE_STATUS_LABELS, QUOTE_STATUS_STYLES, formatMoney } from '../types/fsm';
import { Plus, Search, FileText, X, MoreVertical, ArrowRight, Eye } from 'lucide-react';
import { format, parseISO, addDays } from 'date-fns';

type StatusFilter = 'all' | QuoteStatus;

const STATUS_TABS: { key: StatusFilter; label: string }[] = [
  { key: 'all', label: 'All' }, { key: 'draft', label: 'Draft' }, { key: 'sent', label: 'Sent' },
  { key: 'accepted', label: 'Accepted' }, { key: 'declined', label: 'Declined' }, { key: 'expired', label: 'Expired' },
];

const padNum = (n: number | null) => String(n ?? 0).padStart(4, '0');

// Shared "Convert to Job" ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â creates job, copies line items as job_costs, links quote, navigates.
async function convertQuoteToJob(quote: QuoteWithDetails, profileId: string): Promise<void> {
  const { data: jobData, error: jobErr } = await supabase
    .from('jobs')
    .insert({
      company_id: quote.company_id, client_id: quote.client_id,
      title: `Job from Quote #${padNum(quote.quote_number)}`,
      status: 'scheduled', priority: 'medium', created_by: profileId,
    }).select('id').single();
  if (jobErr) throw jobErr;
  const jobId = jobData.id;
  const costRows = (quote.line_items ?? []).map((li: QuoteLineItem) => {
    const qty = Number(li.quantity) || 0;
    const unitCost = li.unit_cost != null ? Number(li.unit_cost) : 0;
    const unitPrice = Number(li.unit_price) || 0;
    const markup = li.markup_percent != null
      ? Number(li.markup_percent)
      : (unitCost > 0 ? Number((((unitPrice / unitCost) - 1) * 100).toFixed(1)) : 0);
    return {
      company_id: quote.company_id,
      job_id: jobId,
      cost_type: li.cost_model_id
        || (li.charge_type || '').toLowerCase().includes('labour')
        || (li.charge_type || '').toLowerCase().includes('labor')
        ? 'labor'
        : 'materials',
      description: li.description,
      quantity: qty,
      unit_cost: unitCost,
      total_cost: Number((qty * unitCost).toFixed(2)),
      markup_percent: markup,
      unit_price: unitPrice,
      total_price: Number((qty * unitPrice).toFixed(2)),
      charge_type: li.charge_type ?? null,
      stock_item_id: li.stock_item_id ?? null,
      purchase_order_id: null,
      cost_model_id: li.cost_model_id ?? null,
      created_by: profileId,
    };
  });
  if (costRows.length) {
    const { error: cErr } = await supabase.from('job_costs').insert(costRows);
    if (cErr) throw cErr;
  }
  const { error: lErr } = await supabase.from('quotes').update({ job_id: jobId, updated_at: new Date().toISOString() }).eq('id', quote.id);
  if (lErr) throw lErr;
}

export function QuotesPage() {
  const { profile, company } = useAuth();
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [search, setSearch] = useState('');
  const [editingQuote, setEditingQuote] = useState<QuoteWithDetails | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [viewMode, setViewMode] = useViewMode('quotes', 'list');

  const { data: quotes, isLoading, error } = useQuery<QuoteWithDetails[]>({
    queryKey: ['quotes'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('quotes')
        .select('id, company_id, quote_number, client_id, job_id, status, description, scope_of_works, line_items, subtotal, tax_rate, tax_amount, total, validity_date, notes, inclusions, exclusions, created_by, created_at, updated_at')
        .order('created_at', { ascending: false });
      if (error) throw error;
      const list = (data ?? []) as QuoteWithDetails[];
      const clientIds = [...new Set(list.map(q => q.client_id).filter(Boolean))] as string[];
      const jobIds = [...new Set(list.map(q => q.job_id).filter(Boolean))] as string[];
      const [clientsRes, jobsRes] = await Promise.all([
        clientIds.length ? supabase.from('clients').select('id, name').in('id', clientIds) : Promise.resolve({ data: [], error: null }),
        jobIds.length ? supabase.from('jobs').select('id, title').in('id', jobIds) : Promise.resolve({ data: [], error: null }),
      ]);
      const clientMap = new Map((clientsRes.data ?? []).map((c: any) => [c.id, c.name]));
      const jobMap = new Map((jobsRes.data ?? []).map((j: any) => [j.id, j.title]));
      return list.map(q => ({
        ...q,
        inclusions: asStringList(q.inclusions),
        exclusions: asStringList(q.exclusions),
        client_name: q.client_id ? clientMap.get(q.client_id) ?? null : null,
        job_title: q.job_id ? jobMap.get(q.job_id) ?? null : null,
      }));
    },
    enabled: !!profile,
  });

  const filtered = useMemo(() => {
    const list = quotes ?? [];
    return list.filter(q => {
      if (statusFilter !== 'all' && q.status !== statusFilter) return false;
      if (search.trim()) {
        const s = search.toLowerCase();
        return `#${padNum(q.quote_number)}`.toLowerCase().includes(s)
          || (q.client_name ?? '').toLowerCase().includes(s)
          || (q.description ?? '').toLowerCase().includes(s);
      }
      return true;
    });
  }, [quotes, statusFilter, search]);

  if (error) return <AppShell><PageError message="Could not load quotes" /></AppShell>;

  const totals = useMemo(() => {
    const all = quotes ?? [];
    const pending = all.filter(q => q.status === 'draft' || q.status === 'sent');
    const pendingValue = pending.reduce((s, q) => s + Number(q.total ?? 0), 0);
    const accepted = all.filter(q => q.status === 'accepted');
    const acceptedValue = accepted.reduce((s, q) => s + Number(q.total ?? 0), 0);
    return { pendingCount: pending.length, pendingValue, acceptedCount: accepted.length, acceptedValue };
  }, [quotes]);

  return (
    <AppShell>
      <div className="max-w-[1200px] mx-auto px-4 py-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
          <div>
            <h1 className="text-xl font-semibold text-[#1A1A1A]">Quotes</h1>
            <p className="text-sm text-[#4A5568] mt-0.5">{quotes?.length ?? 0} total quotes</p>
          </div>
          <button onClick={() => { setEditingQuote(null); setShowForm(true); }}
            className="flex items-center gap-2 bg-[#0A2540] text-white px-3 py-2 rounded-md text-sm font-medium hover:bg-[#0d2f4e] transition-colors">
            <Plus size={16} /> New Quote
          </button>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
          {isLoading ? (
            <SkeletonSummaryCards count={2} />
          ) : (
            <>
              <SummaryCard label="Pending Quotes" value={`${totals.pendingCount}`} subtext={formatMoney(totals.pendingValue)} accentColor="#2E75B6" />
              <SummaryCard label="Accepted Quotes" value={`${totals.acceptedCount}`} subtext={formatMoney(totals.acceptedValue)} accentColor="#16A34A" />
            </>
          )}
        </div>

        {/* Search */}
        <div className="flex items-center gap-2 mb-4 flex-wrap">
          <SearchBar value={search} onChange={setSearch} placeholder="Search by quote #, client, or description..." />
          <ViewToggle mode={viewMode} onChange={setViewMode} />
        </div>

        {/* Status tabs */}
        <div className="flex items-center gap-1 mb-4 border-b border-[#E5E7EB] overflow-x-auto">
          {STATUS_TABS.map(tab => {
            const count = tab.key === 'all' ? (quotes?.length ?? 0) : (quotes?.filter(q => q.status === tab.key).length ?? 0);
            const active = statusFilter === tab.key;
            return (
              <button key={tab.key} onClick={() => setStatusFilter(tab.key)}
                className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 -mb-px whitespace-nowrap transition-colors ${
                  active ? 'border-[#0A2540] text-[#0A2540]' : 'border-transparent text-[#4A5568] hover:text-[#1A1A1A]'
                }`}>
                {tab.label}
                <span className={`text-xs px-1.5 rounded-full ${active ? 'bg-[#0A2540] text-white' : 'bg-gray-100 text-[#4A5568]'}`}>{count}</span>
              </button>
            );
          })}
        </div>

        {/* List */}
        {isLoading ? (
          <SkeletonRow />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={FileText}
            title={search || statusFilter !== 'all' ? 'No quotes match your filters' : 'No quotes yet'}
            message={search || statusFilter !== 'all' ? 'Try adjusting your filters.' : 'Create your first quote to get started.'}
            action={!search && statusFilter === 'all' && (
              <button onClick={() => { setEditingQuote(null); setShowForm(true); }} className="btn-primary">
                <Plus size={16} /> Create your first quote
              </button>
            )}
          />
        ) : viewMode === 'list' ? (
          <div className="bg-white rounded-xl border border-[#E5E7EB] shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-[#F9FAFB] text-left text-xs font-medium text-[#4A5568] uppercase tracking-wide">
                    <th className="px-4 py-3">Quote #</th>
                    <th className="px-4 py-3">Client</th>
                    <th className="px-4 py-3">Description</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3 text-right">Total</th>
                    <th className="px-4 py-3">Valid Until</th>
                    <th className="px-4 py-3">Created</th>
                    <th className="px-4 py-3 w-8"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#F3F4F6]">
                  {filtered.map(q => (
                    <QuoteRow key={q.id} quote={q} onClick={() => { setEditingQuote(q); setShowForm(true); }} />
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map(q => (
              <div key={q.id} onClick={() => { setEditingQuote(q); setShowForm(true); }}
                className="bg-white rounded-xl border border-[#E5E7EB] shadow-sm p-4 cursor-pointer hover:shadow-md transition-shadow">
                <div className="flex items-start justify-between mb-2">
                  <span className="font-bold text-[#2E75B6]">#{padNum(q.quote_number)}</span>
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${QUOTE_STATUS_STYLES[q.status]}`}>{QUOTE_STATUS_LABELS[q.status]}</span>
                </div>
                <p className="text-sm font-medium text-[#1A1A1A] mb-1">{q.client_name ?? 'No client'}</p>
                {q.description && (
                  <p className="text-sm text-[#4A5568] mb-1 line-clamp-2">{q.description}</p>
                )}
                <p className="text-lg font-bold text-[#1A1A1A] mb-2">{formatMoney(Number(q.total))}</p>
                <div className="flex items-center justify-between text-xs text-[#4A5568]">
                  <span>Valid: {q.validity_date ? format(parseISO(q.validity_date), 'd MMM yyyy') : 'ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â'}</span>
                  <span>{format(parseISO(q.created_at), 'd MMM yyyy')}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showForm && (
        <QuoteEditorModal quote={editingQuote} defaultTaxRate={company?.default_tax_rate ?? 10}
          onClose={() => setShowForm(false)}
          onSaved={() => { setShowForm(false); queryClient.invalidateQueries({ queryKey: ['quotes'] }); showToast(editingQuote ? 'Quote updated' : 'Quote created'); }}
        />
      )}
    </AppShell>
  );
}

// ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ Quote Row ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬

function SummaryCard({ label, value, subtext, accentColor }: { label: string; value: string; subtext?: string; accentColor: string }) {
  return (
    <div className="card-accent p-4">
      <p className="text-xs font-medium text-[#4A5568] uppercase tracking-wide">{label}</p>
      <p className="text-2xl font-bold text-[#1A1A1A] mt-1">{value}</p>
      {subtext && <p className="text-sm text-[#4A5568] mt-0.5">{subtext}</p>}
      <div className="mt-2 h-1 rounded-full" style={{ backgroundColor: accentColor, opacity: 0.2 }} />
    </div>
  );
}

function QuoteRow({ quote, onClick }: { quote: QuoteWithDetails; onClick: () => void }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { profile } = useAuth();
  const [converting, setConverting] = useState(false);

  const handleConvert = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setMenuOpen(false);
    if (!profile?.id) return;
    setConverting(true);
    try {
      await convertQuoteToJob(quote, profile.id);
      queryClient.invalidateQueries({ queryKey: ['quotes'] });
      navigate('/schedule');
    } catch (err: any) {
      alert('Could not convert quote: ' + (err.message ?? 'Unknown error'));
    } finally {
      setConverting(false);
    }
  };

  return (
    <tr onClick={onClick} className="hover:bg-[#F9FAFB] cursor-pointer transition-colors">
      <td className="px-4 py-3 font-medium text-[#2E75B6]">#{padNum(quote.quote_number)}</td>
      <td className="px-4 py-3 text-[#1A1A1A]">{quote.client_name ?? <span className="text-[#9CA3AF]">—</span>}</td>
      <td className="px-4 py-3 text-[#4A5568] max-w-[220px]">
        {quote.description
          ? <span className="line-clamp-2">{quote.description}</span>
          : <span className="text-[#9CA3AF]">—</span>}
      </td>
      <td className="px-4 py-3">
        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${QUOTE_STATUS_STYLES[quote.status]}`}>
          {QUOTE_STATUS_LABELS[quote.status]}
        </span>
      </td>
      <td className="px-4 py-3 text-right font-semibold text-[#1A1A1A]">{formatMoney(Number(quote.total))}</td>
      <td className="px-4 py-3 text-[#4A5568]">{quote.validity_date ? format(parseISO(quote.validity_date), 'd MMM yyyy') : 'ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â'}</td>
      <td className="px-4 py-3 text-[#4A5568]">{format(parseISO(quote.created_at), 'd MMM yyyy')}</td>
      <td className="px-4 py-3 relative" onClick={e => e.stopPropagation()}>
        <button onClick={() => setMenuOpen(v => !v)}
          className="w-7 h-7 flex items-center justify-center rounded hover:bg-[#F3F4F6] text-[#9CA3AF] hover:text-[#374151]">
          <MoreVertical size={15} />
        </button>
        {menuOpen && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
            <div className="absolute right-0 top-full mt-1 w-44 bg-white border border-[#E5E7EB] rounded-lg shadow-lg py-1 z-50">
              <button onClick={onClick} className="w-full flex items-center gap-2 px-3 py-2 text-sm text-[#1A1A1A] hover:bg-[#F9FAFB] text-left">
                <FileText size={14} /> Edit
              </button>
              {quote.status === 'accepted' && (
                <button onClick={handleConvert} disabled={converting}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-[#F7931A] hover:bg-orange-50 text-left disabled:opacity-50">
                  <ArrowRight size={14} /> {converting ? 'Converting...' : 'Convert to Job'}
                </button>
              )}
            </div>
          </>
        )}
      </td>
    </tr>
  );
}

// ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ Quote Editor Modal ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬

interface EditorState {
  client_id: string; job_id: string; status: QuoteStatus;
  description: string; scope_of_works: string;
  line_items: EditLineItem[]; tax_rate: string; validity_date: string; notes: string;
  inclusions: string[]; exclusions: string[];
}

function QuoteEditorModal({ quote, defaultTaxRate, onClose, onSaved }: {
  quote: QuoteWithDetails | null; defaultTaxRate: number; onClose: () => void; onSaved: () => void;
}) {
  const { profile, company } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [clients, setClients] = useState<Client[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [stockItems, setStockItems] = useState<StockItem[]>([]);
  const [priceBookItems, setPriceBookItems] = useState<PriceBookItem[]>([]);
  const [saving, setSaving] = useState(false);
  const [converting, setConverting] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [err, setErr] = useState('');

  const [form, setForm] = useState<EditorState>({
    client_id: quote?.client_id ?? '',
    job_id: quote?.job_id ?? '',
    status: quote?.status ?? 'draft',
    description: quote?.description ?? '',
    scope_of_works: quote?.scope_of_works ?? '',
    line_items: quote?.line_items?.length
      ? quote.line_items.map(toEditLine)
      : [emptyLineItem(company?.default_material_markup ?? 0)],
    tax_rate: String(quote?.tax_rate ?? defaultTaxRate),
    validity_date: quote?.validity_date ?? format(addDays(new Date(), 30), 'yyyy-MM-dd'),
    notes: quote?.notes ?? '',
    inclusions: asStringList(quote?.inclusions),
    exclusions: asStringList(quote?.exclusions),
  });

  useEffect(() => {
    if (!profile?.company_id) return;
    (async () => {
      const [c, j, s, pb] = await Promise.all([
        supabase.from('clients').select('*').eq('archived', false).order('name'),
        supabase.from('jobs').select('id, company_id, client_id, title').order('created_at', { ascending: false }),
        supabase.from('stock_items').select('*').eq('archived', false).order('name'),
        supabase.from('price_book_items').select('*').eq('is_active', true).order('description'),
      ]);
      if (c.data) setClients(c.data as Client[]);
      if (j.data) setJobs(j.data as Job[]);
      if (s.data) setStockItems(s.data as StockItem[]);
      if (pb.data) setPriceBookItems(pb.data as PriceBookItem[]);
    })();
  }, [profile?.company_id]);

  const clientJobs = useMemo(() => jobs.filter(j => form.client_id && j.client_id === form.client_id), [jobs, form.client_id]);
  const selectedClient = clients.find(c => c.id === form.client_id);
  const subtotal = useMemo(() => calcSubtotal(form.line_items), [form.line_items]);
  const taxAmount = useMemo(() => subtotal * (parseFloat(form.tax_rate) || 0) / 100, [subtotal, form.tax_rate]);
  const grandTotal = subtotal + taxAmount;

  const previewData = useMemo((): CommercialPdfData | null => {
    if (!company) return null;
    const cleanLines: QuoteLineItem[] = form.line_items
      .filter(li => li.description.trim() && (parseFloat(li.quantity) || 0) > 0)
      .map(li => ({
        description: li.description.trim(),
        quantity: parseFloat(li.quantity) || 0,
        unit_price: parseFloat(li.unit_price) || 0,
        charge_type: li.charge_type.trim() || null,
        unit_cost: li.unit_cost ? parseFloat(li.unit_cost) : null,
        markup_percent: li.markup_percent ? parseFloat(li.markup_percent) : null,
        cost_model_id: li.cost_model_id ?? null,
      }));
    return {
      kind: 'quote',
      title: 'Quoted prices',
      docNumber: quote?.quote_number != null ? `#${padNum(quote.quote_number)}` : 'Draft',
      dateLabel: 'Date',
      dateValue: format(new Date(), 'd MMM yyyy'),
      secondaryLabel: 'Valid until',
      secondaryValue: form.validity_date ? format(parseISO(form.validity_date), 'd MMM yyyy') : 'â€”',
      clientName: selectedClient?.name ?? 'â€”',
      clientDetail: selectedClient?.address ?? null,
      company: {
        name: company.name,
        abn: company.abn ?? null,
        licence_number: company.licence_number ?? null,
        phone: company.phone ?? null,
        email: company.email ?? null,
        website: company.website ?? null,
        logo_url: company.logo_url ?? null,
      },
      inclusions: form.inclusions,
      exclusions: form.exclusions,
      description: form.description.trim() || null,
      scopeOfWorks: form.scope_of_works.trim() || null,
      lines: linesFromQuoteItems(cleanLines),
      subtotal,
      taxRate: parseFloat(form.tax_rate) || 0,
      taxAmount,
      total: grandTotal,
      notes: form.notes.trim() || null,
    };
  }, [company, form, quote, selectedClient, subtotal, taxAmount, grandTotal]);

  const updateLine = (idx: number, patch: Partial<EditLineItem>) =>
    setForm(f => ({ ...f, line_items: f.line_items.map((li, i) => (i === idx ? { ...li, ...patch } : li)) }));
  const removeLine = (idx: number) => setForm(f => ({ ...f, line_items: f.line_items.filter((_, i) => i !== idx) }));
  const addLine = () => setForm(f => ({
    ...f,
    line_items: [...f.line_items, emptyLineItem(company?.default_material_markup ?? 0)],
  }));

  const handleSave = async () => {
    if (!profile?.company_id) return;
    if (!form.client_id) { setErr('Please select a client'); return; }
    const cleanLines: QuoteLineItem[] = form.line_items
      .filter(li => li.description.trim() && (parseFloat(li.quantity) || 0) > 0)
      .map(li => ({
        description: li.description.trim(),
        quantity: parseFloat(li.quantity) || 0,
        unit_price: parseFloat(li.unit_price) || 0,
        stock_item_id: li.stock_item_id ?? null,
        price_book_item_id: li.price_book_item_id ?? null,
        charge_type: li.charge_type.trim() || null,
        unit_cost: li.unit_cost ? parseFloat(li.unit_cost) : null,
        markup_percent: li.markup_percent ? parseFloat(li.markup_percent) : null,
        cost_model_id: li.cost_model_id ?? null,
      }));
    if (cleanLines.length === 0) { setErr('Add at least one line item'); return; }
    setSaving(true); setErr('');
    const payload = {
      client_id: form.client_id || null, job_id: form.job_id || null, status: form.status,
      description: form.description.trim() || null,
      scope_of_works: form.scope_of_works.trim() || null,
      line_items: cleanLines, subtotal, tax_rate: parseFloat(form.tax_rate) || 0, tax_amount: taxAmount, total: grandTotal,
      validity_date: form.validity_date || null, notes: form.notes.trim() || null,
      inclusions: form.inclusions, exclusions: form.exclusions,
    };
    const { error } = quote
      ? await supabase.from('quotes').update({ ...payload, updated_at: new Date().toISOString() }).eq('id', quote.id)
      : await supabase.from('quotes').insert({ ...payload, company_id: profile.company_id, created_by: profile.id });
    setSaving(false);
    if (error) { setErr(error.message); return; }
    onSaved();
  };

  const handleConvert = async () => {
    if (!quote || quote.status !== 'accepted' || !profile?.id) return;
    setConverting(true); setErr('');
    try {
      await convertQuoteToJob(quote, profile.id);
      queryClient.invalidateQueries({ queryKey: ['quotes'] });
      navigate('/schedule');
    } catch (e: any) {
      setErr(e.message ?? 'Conversion failed');
    } finally {
      setConverting(false);
    }
  };

  return (
    <div className="overlay-backdrop">
      <div className="overlay-panel-xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-semibold text-[#1A1A1A]">{quote ? 'Edit Quote' : 'New Quote'}</h2>
            {quote?.quote_number && (
              <span className="text-xs font-bold text-[#2E75B6] bg-[#EFF6FF] px-2 py-0.5 rounded-full">#{padNum(quote.quote_number)}</span>
            )}
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-400"><X size={18} /></button>
        </div>

        <div className="overlay-body">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Client" required>
              <select value={form.client_id} onChange={e => setForm(f => ({ ...f, client_id: e.target.value, job_id: '' }))} className="form-input cursor-pointer">
                <option value="">Select a client...</option>
                {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </Field>
            <Field label="Linked Job">
              <select value={form.job_id} onChange={e => setForm(f => ({ ...f, job_id: e.target.value }))} className="form-input cursor-pointer">
                <option value="">No linked job</option>
                {clientJobs.map(j => <option key={j.id} value={j.id}>{j.title}</option>)}
              </select>
            </Field>
          </div>

          <Field label="Description">
            <input
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              className="form-input"
              placeholder="Short summary shown on the quotes list…"
              maxLength={200}
            />
          </Field>

          <Field label="Scope of works">
            <textarea
              value={form.scope_of_works}
              onChange={e => setForm(f => ({ ...f, scope_of_works: e.target.value }))}
              className="form-input min-h-[100px] resize-y"
              placeholder="Detailed scope for the client — appears on the quote PDF…"
            />
          </Field>

          <DocumentVariationsEditor
            inclusions={form.inclusions}
            exclusions={form.exclusions}
            onChange={({ inclusions, exclusions }) => setForm(f => ({ ...f, inclusions, exclusions }))}
          />

          {/* Line items */}
          <LineItemEditor
            lines={form.line_items}
            stockItems={stockItems}
            priceBookItems={priceBookItems}
            defaultMarkup={company?.default_material_markup ?? 0}
            onChange={lines => setForm(f => ({ ...f, line_items: lines }))}
          />

          {/* Totals */}
          <div className="flex justify-end">
            <div className="w-56 space-y-1.5 text-sm">
              <div className="flex justify-between text-[#4A5568]"><span>Subtotal</span><span>{formatMoney(subtotal)}</span></div>
              <div className="flex justify-between text-[#4A5568]"><span>Tax ({parseFloat(form.tax_rate) || 0}%)</span><span>{formatMoney(taxAmount)}</span></div>
              <div className="flex justify-between font-semibold text-[#1A1A1A] border-t border-[#E5E7EB] pt-1.5"><span>Grand Total</span><span>{formatMoney(grandTotal)}</span></div>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <Field label="Tax Rate (%)">
              <input type="number" min={0} step="0.01" value={form.tax_rate} onChange={e => setForm(f => ({ ...f, tax_rate: e.target.value }))} className="form-input" placeholder="0" />
            </Field>
            <Field label="Valid Until">
              <input type="date" value={form.validity_date} onChange={e => setForm(f => ({ ...f, validity_date: e.target.value }))} className="form-input" />
            </Field>
            <Field label="Status">
              <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value as QuoteStatus }))} className="form-input cursor-pointer">
                {(Object.keys(QUOTE_STATUS_LABELS) as QuoteStatus[]).map(s => <option key={s} value={s}>{QUOTE_STATUS_LABELS[s]}</option>)}
              </select>
            </Field>
          </div>

          <Field label="Notes">
            <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} className="form-input min-h-[60px] resize-y" placeholder="Notes for the client..." />
          </Field>

          {err && <p className="text-sm text-red-600">{err}</p>}
        </div>

        <div className="flex items-center justify-between px-5 py-4 border-t border-gray-100">
          <div className="flex items-center gap-3">
            {quote?.status === 'accepted' && (
              <button type="button" onClick={handleConvert} disabled={converting}
                className="flex items-center gap-1.5 text-sm text-[#F7931A] hover:text-[#d97d12] font-medium disabled:opacity-50">
                <ArrowRight size={14} /> {converting ? 'Converting...' : 'Convert to Job'}
              </button>
            )}
            <button
              type="button"
              onClick={() => setShowPreview(true)}
              disabled={!previewData}
              className="flex items-center gap-1.5 text-sm font-medium text-[#2E75B6] hover:underline disabled:opacity-40 disabled:no-underline"
            >
              <Eye size={14} /> Preview PDF
            </button>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-[#4A5568] border border-[#E5E7EB] rounded-md hover:bg-gray-50">Cancel</button>
            <button onClick={handleSave} disabled={saving}
              className="px-4 py-2 text-sm font-medium text-white bg-[#0A2540] rounded-md hover:bg-[#0d2f4e] disabled:opacity-50">
              {saving ? 'Saving...' : quote ? 'Save Changes' : 'Create Quote'}
            </button>
          </div>
        </div>
      </div>

      {showPreview && previewData && (
        <CommercialPdfPreviewModal data={previewData} onClose={() => setShowPreview(false)} />
      )}
    </div>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-[#4A5568] mb-1">{label}{required && <span className="text-red-500"> *</span>}</label>
      {children}
    </div>
  );
}

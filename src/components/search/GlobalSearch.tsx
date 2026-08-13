import { useEffect, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import type { LucideIcon } from 'lucide-react';
import {
  Search,
  Briefcase,
  Users,
  ShoppingCart,
  Package,
  FileText,
  Receipt,
  Truck,
  HardDrive,
  ShieldCheck,
  X,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';

/* ----------------------------- types ----------------------------- */

type ResultLink = { id: string; label: string; subtitle?: string; to: string };
type ResultGroup = { category: string; icon: LucideIcon; results: ResultLink[] };

/* --------------------------- search core -------------------------- */

// Strip leading '#' (so "#0001" -> "0001") and chars that break PostgREST or().
function normalize(raw: string): string {
  return raw.replace(/^#+/, '').trim();
}

// Build a PostgREST `or()` filter string across multiple columns (ilike, case-insensitive).
function orFilter(columns: string[], value: string): string {
  const v = value.replace(/'/g, "''").replace(/[(),]/g, '');
  return columns.map((c) => `${c}.ilike.%${v}%`).join(',');
}

async function runSearch(rawQuery: string, companyId: string | undefined): Promise<ResultGroup[]> {
  const query = normalize(rawQuery);
  if (!query || !companyId) return [];
  const or = (cols: string[]) => orFilter(cols, query);
  const pick = (r: { data: unknown }) => (r.data as Record<string, unknown>[] | null) ?? [];

  const [jobs, clients, purchaseOrders, stockItems, quotes, invoices, suppliers, assets, contracts, compliance] =
    await Promise.all([
      pick(await supabase.from('jobs').select('id, title, job_number, description, address').eq('company_id', companyId).or(or(['title', 'job_number', 'description', 'address'])).limit(5)),
      pick(await supabase.from('clients').select('id, name, contact_person, email, phone, address, notes').eq('company_id', companyId).or(or(['name', 'contact_person', 'email', 'phone', 'address', 'notes'])).limit(5)),
      pick(await supabase.from('purchase_orders').select('id, po_number, notes').eq('company_id', companyId).or(or(['notes'])).limit(5)),
      pick(await supabase.from('stock_items').select('id, name, sku, category, description, storage_location').eq('company_id', companyId).or(or(['name', 'sku', 'category', 'description', 'storage_location'])).limit(5)),
      pick(await supabase.from('quotes').select('id, quote_number, notes').eq('company_id', companyId).or(or(['notes'])).limit(5)),
      pick(await supabase.from('invoices').select('id, invoice_number, notes').eq('company_id', companyId).or(or(['notes'])).limit(5)),
      pick(await supabase.from('suppliers').select('id, name, contact_person, email, phone, notes').eq('company_id', companyId).or(or(['name', 'contact_person', 'email', 'phone', 'notes'])).limit(5)),
      pick(await supabase.from('assets').select('id, name, asset_tag, serial_number, manufacturer, model, category, location_description, notes').eq('company_id', companyId).or(or(['name', 'asset_tag', 'serial_number', 'manufacturer', 'model', 'category', 'location_description', 'notes'])).limit(5)),
      pick(await supabase.from('service_contracts').select('id, title, contract_number').eq('company_id', companyId).or(or(['title', 'contract_number'])).limit(5)),
      pick(await supabase.from('compliance_items').select('id, title, standard_or_regulation').eq('company_id', companyId).or(or(['title', 'standard_or_regulation'])).limit(5)),
    ]);

  const join = (parts: (string | null | undefined)[]) => parts.filter(Boolean).join(' · ');

  const groups: ResultGroup[] = [
    {
      category: 'Jobs',
      icon: Briefcase,
      results: jobs.map((j) => ({
        id: String(j.id),
        label: `Job #${j.job_number}: ${j.title}`,
        to: `/schedule?job=${j.id}`,
      })),
    },
    {
      category: 'Clients',
      icon: Users,
      results: clients.map((c) => ({
        id: String(c.id),
        label: String(c.name),
        subtitle: join([c.contact_person as string, c.email as string, c.phone as string]) || undefined,
        to: `/clients/${c.id}`,
      })),
    },
    {
      category: 'Purchase Orders',
      icon: ShoppingCart,
      results: purchaseOrders.map((p) => ({
        id: String(p.id),
        label: `PO #${p.po_number}`,
        to: '/purchase-orders',
      })),
    },
    {
      category: 'Stock',
      icon: Package,
      results: stockItems.map((s) => ({
        id: String(s.id),
        label: String(s.name),
        subtitle: join([s.sku as string, s.category as string]) || undefined,
        to: `/stock/${s.id}`,
      })),
    },
    {
      category: 'Quotes',
      icon: FileText,
      results: quotes.map((q) => ({ id: String(q.id), label: `Quote #${q.quote_number}`, to: '/quotes' })),
    },
    {
      category: 'Invoices',
      icon: Receipt,
      results: invoices.map((i) => ({ id: String(i.id), label: `Invoice #${i.invoice_number}`, to: '/invoices' })),
    },
    {
      category: 'Suppliers',
      icon: Truck,
      results: suppliers.map((s) => ({ id: String(s.id), label: String(s.name), to: '/suppliers' })),
    },
    {
      category: 'Assets',
      icon: HardDrive,
      results: assets.map((a) => ({ id: String(a.id), label: String(a.name), subtitle: join([a.asset_tag as string, a.serial_number as string]) || undefined, to: '/assets' })),
    },
    {
      category: 'Contracts',
      icon: FileText,
      results: contracts.map((c) => ({ id: String(c.id), label: String(c.title), subtitle: c.contract_number as string | undefined, to: '/contracts' })),
    },
    {
      category: 'Compliance',
      icon: ShieldCheck,
      results: compliance.map((c) => ({ id: String(c.id), label: String(c.title), subtitle: c.standard_or_regulation as string | undefined, to: '/compliance' })),
    },
  ];

  return groups.filter((g) => g.results.length > 0);
}

/* --------------------------- overlay UI --------------------------- */

interface GlobalSearchProps {
  open: boolean;
  onClose: () => void;
}

export function GlobalSearch({ open, onClose }: GlobalSearchProps) {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const [query, setQuery] = useState('');
  const [groups, setGroups] = useState<ResultGroup[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<number | undefined>(undefined);

  // Reset state + focus input whenever the palette opens.
  useEffect(() => {
    if (!open) return;
    setQuery('');
    setGroups([]);
    setActiveIndex(0);
    setLoading(false);
    const t = window.setTimeout(() => inputRef.current?.focus(), 0);
    return () => window.clearTimeout(t);
  }, [open]);

  // Debounced search (~200ms).
  useEffect(() => {
    if (!open) return;
    window.clearTimeout(debounceRef.current);
    if (!normalize(query)) {
      setGroups([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    debounceRef.current = window.setTimeout(async () => {
      const result = await runSearch(query, profile?.company_id);
      setGroups(result);
      setActiveIndex(0);
      setLoading(false);
    }, 200);
    return () => window.clearTimeout(debounceRef.current);
  }, [query, open, profile?.company_id]);

  // Escape closes (works even if input loses focus).
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  // Keep the active row scrolled into view while navigating with arrows.
  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-idx="${activeIndex}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex]);

  if (!open) return null;

  const flat = groups.flatMap((g) => g.results);
  const go = (to: string) => {
    onClose();
    navigate(to);
  };

  const onInputKeyDown = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, flat.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const r = flat[activeIndex];
      if (r) go(r.to);
    }
  };

  let runningIndex = 0;

  return (
    <div
      className="overlay-backdrop"
      onClick={onClose}
    >
      <div
        className="overlay-panel-xl animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search input */}
        <div className="flex items-center gap-3 border-b border-[#E5E7EB] px-4 py-3 shrink-0">
          <Search className="h-5 w-5 shrink-0 text-[#4A5568]" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onInputKeyDown}
            placeholder="Search everything — jobs, clients, stock, assets, invoices, quotes, contracts…"
            className="h-9 w-full bg-transparent text-base text-[#0A2540] placeholder:text-[#4A5568]/60 focus:outline-none"
          />
          <button
            onClick={onClose}
            className="rounded-md p-1 text-[#4A5568] hover:bg-gray-100"
            aria-label="Close search"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Results */}
        <div ref={listRef} className="max-h-[60vh] overflow-y-auto p-2">
          {loading && groups.length === 0 ? (
            <div className="px-3 py-8 text-center text-sm text-[#4A5568]">Searching…</div>
          ) : groups.length === 0 && normalize(query) ? (
            <div className="px-3 py-8 text-center text-sm text-[#4A5568]">No results</div>
          ) : groups.length === 0 ? (
            <div className="px-3 py-8 text-center text-sm text-[#4A5568]/70">
              Start typing to search across everything…
            </div>
          ) : (
            groups.map((group) => {
              const Icon = group.icon;
              return (
                <div key={group.category} className="mb-1">
                  <div className="px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-[#4A5568]/70">
                    {group.category}
                  </div>
                  {group.results.map((r) => {
                    const idx = runningIndex++;
                    const active = idx === activeIndex;
                    return (
                      <button
                        key={`${group.category}-${r.id}`}
                        data-idx={idx}
                        onMouseEnter={() => setActiveIndex(idx)}
                        onClick={() => go(r.to)}
                        className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left ${
                          active ? 'bg-gray-50' : ''
                        }`}
                      >
                        <Icon className="h-4 w-4 shrink-0 text-[#2E75B6]" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium text-[#0A2540]">
                            {r.label}
                          </span>
                          {r.subtitle && (
                            <span className="block truncate text-xs text-[#4A5568]">
                              {r.subtitle}
                            </span>
                          )}
                        </span>
                      </button>
                    );
                  })}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

/* ----------------------------- trigger ---------------------------- */

export function GlobalSearchTrigger() {
  const [open, setOpen] = useState(false);

  // Global Ctrl/Cmd+K shortcut toggles the palette.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm text-white/60 transition-colors hover:border-white/25 hover:text-white w-full"
      >
        <Search className="h-4 w-4 shrink-0" />
        <span className="flex-1 text-left hidden sm:inline">Search…</span>
        <kbd className="hidden rounded border border-white/15 bg-white/5 px-1.5 py-0.5 text-xs text-white/50 sm:inline-block">
          ⌘K
        </kbd>
      </button>
      <GlobalSearch open={open} onClose={() => setOpen(false)} />
    </>
  );
}

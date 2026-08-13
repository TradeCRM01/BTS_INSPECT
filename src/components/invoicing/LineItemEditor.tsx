import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Package, Plus, Trash2, Search, X, BookOpen } from 'lucide-react';
import { formatMoney, type ExpenseCostModel, type StockItem, type PriceBookItem, EXPENSE_MODEL_TIME_UNIT_HOURS, type ExpenseModelTimeUnit } from '../../types/fsm';
import { ManagedSelect } from '../ui/ManagedSelect';
import { LIST_KEYS } from '../../lib/useManagedList';
import { supabase } from '../../lib/supabase';
import { asModelLines, modelHourlyCost } from '../expenses/ExpenseModelsModals';

export interface EditLineItem {
  description: string;
  quantity: string;
  unit_price: string;
  stock_item_id: string | null;
  price_book_item_id: string | null;
  charge_type: string;
  unit_cost: string | null;
  markup_percent: string | null;
  cost_model_id: string | null;
}

export function emptyLineItem(defaultMarkup = 0): EditLineItem {
  return {
    description: '',
    quantity: '1',
    unit_price: '',
    stock_item_id: null,
    price_book_item_id: null,
    charge_type: '',
    unit_cost: '',
    markup_percent: defaultMarkup ? String(defaultMarkup) : '',
    cost_model_id: null,
  };
}

export function toEditLine(li: {
  description: string;
  quantity: number;
  unit_price: number;
  stock_item_id?: string | null;
  price_book_item_id?: string | null;
  charge_type?: string | null;
  unit_cost?: number | null;
  markup_percent?: number | null;
  cost_model_id?: string | null;
}): EditLineItem {
  return {
    description: li.description,
    quantity: String(li.quantity),
    unit_price: String(li.unit_price),
    stock_item_id: li.stock_item_id ?? null,
    price_book_item_id: li.price_book_item_id ?? null,
    charge_type: li.charge_type ?? '',
    unit_cost: li.unit_cost != null ? String(li.unit_cost) : '',
    markup_percent: li.markup_percent != null ? String(li.markup_percent) : '',
    cost_model_id: li.cost_model_id ?? null,
  };
}

interface LineItemEditorProps {
  lines: EditLineItem[];
  stockItems: StockItem[];
  priceBookItems?: PriceBookItem[];
  defaultMarkup: number;
  onChange: (lines: EditLineItem[]) => void;
}

type PickerMode = 'stock' | 'pricebook' | null;

const GRID = 'grid-cols-[150px_120px_1fr_60px_90px_80px_90px_100px_32px]';
const MIN_W = 'min-w-[980px]';

export function LineItemEditor({
  lines,
  stockItems,
  priceBookItems = [],
  defaultMarkup,
  onChange,
}: LineItemEditorProps) {
  const [picker, setPicker] = useState<PickerMode>(null);
  const [search, setSearch] = useState('');

  const { data: costModels = [] } = useQuery<ExpenseCostModel[]>({
    queryKey: ['expense-cost-models'],
    queryFn: async () => {
      const { data, error } = await supabase.from('expense_cost_models').select('*').order('name');
      if (error) throw error;
      return (data ?? []).map(m => {
        const time_unit = (['hourly', 'daily', 'weekly', 'monthly', 'annually'].includes(String(m.time_unit))
          ? m.time_unit
          : 'monthly') as ExpenseModelTimeUnit;
        return {
          ...m,
          time_unit,
          standard_hours: Number(m.standard_hours) || EXPENSE_MODEL_TIME_UNIT_HOURS[time_unit],
          lines: asModelLines(m.lines, time_unit),
        };
      });
    },
    staleTime: 60_000,
  });

  const updateLine = (idx: number, patch: Partial<EditLineItem>) =>
    onChange(lines.map((li, i) => (i === idx ? { ...li, ...patch } : li)));

  const removeLine = (idx: number) => onChange(lines.filter((_, i) => i !== idx));
  const addLine = () => onChange([...lines, emptyLineItem(defaultMarkup)]);

  const closePicker = () => {
    setPicker(null);
    setSearch('');
  };

  const applyCostModel = (idx: number, modelId: string) => {
    if (!modelId) {
      updateLine(idx, { cost_model_id: null });
      return;
    }
    const model = costModels.find(m => m.id === modelId);
    if (!model) return;
    const hourly = modelHourlyCost(model);
    const markup = parseFloat(lines[idx].markup_percent ?? '') || defaultMarkup || 0;
    const sell = hourly > 0 ? Number((hourly * (1 + markup / 100)).toFixed(2)) : 0;
    updateLine(idx, {
      cost_model_id: modelId,
      unit_cost: hourly > 0 ? hourly.toFixed(2) : '',
      markup_percent: String(markup),
      unit_price: sell > 0 ? sell.toFixed(2) : lines[idx].unit_price,
      charge_type: lines[idx].charge_type.trim() || 'Labour',
      description: lines[idx].description.trim() || model.name,
      stock_item_id: null,
      price_book_item_id: null,
    });
  };

  const addStockItem = (item: StockItem) => {
    const cost = Number(item.unit_cost) || 0;
    const markup = defaultMarkup;
    const sellPrice = cost * (1 + markup / 100);
    onChange([...lines, {
      description: item.name,
      quantity: '1',
      unit_price: sellPrice.toFixed(2),
      stock_item_id: item.id,
      price_book_item_id: null,
      charge_type: 'Materials',
      unit_cost: cost.toFixed(2),
      markup_percent: String(markup),
      cost_model_id: null,
    }]);
    closePicker();
  };

  const addPriceBookItem = (item: PriceBookItem) => {
    const cost = Number(item.cost_price) || 0;
    const sell = Number(item.unit_price) || 0;
    let markup = defaultMarkup;
    if (cost > 0 && sell > 0) {
      markup = Math.round(((sell / cost) - 1) * 1000) / 10;
    } else if (cost <= 0 && sell > 0) {
      markup = 0;
    }
    const unitCost = cost > 0 ? cost : (sell > 0 && markup === 0 ? sell : cost);
    onChange([...lines, {
      description: item.code ? `${item.code} — ${item.description}` : item.description,
      quantity: '1',
      unit_price: sell.toFixed(2),
      stock_item_id: null,
      price_book_item_id: item.id,
      charge_type: item.category?.trim() || '',
      unit_cost: unitCost ? unitCost.toFixed(2) : '',
      markup_percent: String(markup),
      cost_model_id: null,
    }]);
    closePicker();
  };

  const handleMarkupChange = (idx: number, markupStr: string) => {
    const cost = parseFloat(lines[idx].unit_cost ?? '0') || 0;
    const markup = parseFloat(markupStr) || 0;
    const sellPrice = cost * (1 + markup / 100);
    updateLine(idx, {
      markup_percent: markupStr,
      ...(cost > 0 ? { unit_price: sellPrice.toFixed(2) } : {}),
    });
  };

  const handleCostChange = (idx: number, costStr: string) => {
    const cost = parseFloat(costStr) || 0;
    const markup = parseFloat(lines[idx].markup_percent ?? '0') || 0;
    const sellPrice = cost * (1 + markup / 100);
    updateLine(idx, {
      unit_cost: costStr,
      ...(cost > 0 || markup > 0 ? { unit_price: sellPrice.toFixed(2) } : {}),
    });
  };

  const filteredStock = useMemo(() => {
    if (!search.trim()) return stockItems;
    const q = search.toLowerCase();
    return stockItems.filter(s =>
      s.name.toLowerCase().includes(q) ||
      (s.sku ?? '').toLowerCase().includes(q) ||
      (s.category ?? '').toLowerCase().includes(q),
    );
  }, [stockItems, search]);

  const filteredPriceBook = useMemo(() => {
    const active = priceBookItems.filter(p => p.is_active !== false);
    if (!search.trim()) return active;
    const q = search.toLowerCase();
    return active.filter(p =>
      p.description.toLowerCase().includes(q) ||
      (p.code ?? '').toLowerCase().includes(q) ||
      (p.category ?? '').toLowerCase().includes(q),
    );
  }, [priceBookItems, search]);

  return (
    <div>
      <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
        <label className="text-xs font-medium text-[#4A5568]">Line Items</label>
        <div className="flex gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => { setPicker(p => p === 'stock' ? null : 'stock'); setSearch(''); }}
            className="flex items-center gap-1 text-xs text-[#2E75B6] hover:underline font-medium"
          >
            <Package size={13} /> Add from stock
          </button>
          <button
            type="button"
            onClick={() => { setPicker(p => p === 'pricebook' ? null : 'pricebook'); setSearch(''); }}
            className="flex items-center gap-1 text-xs text-[#2E75B6] hover:underline font-medium"
          >
            <BookOpen size={13} /> Add from price book
          </button>
          <button
            type="button"
            onClick={addLine}
            className="flex items-center gap-1 text-xs text-[#2E75B6] hover:underline font-medium"
          >
            <Plus size={13} /> Add manual line
          </button>
        </div>
      </div>

      {picker === 'stock' && (
        <div className="mb-3 border border-[#E5E7EB] rounded-lg bg-[#F9FAFB] p-2">
          <div className="relative mb-1.5">
            <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#9CA3AF]" />
            <input
              autoFocus
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search stock by name, SKU, category..."
              className="w-full h-8 pl-7 pr-7 text-sm border border-[#E5E7EB] rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-[#2E75B6]"
            />
            <button type="button" onClick={closePicker}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[#9CA3AF] hover:text-[#1A1A1A]">
              <X size={14} />
            </button>
          </div>
          <div className="max-h-40 overflow-auto">
            {filteredStock.length === 0 ? (
              <p className="text-xs text-[#9CA3AF] text-center py-3">
                {stockItems.length === 0 ? 'No stock items available' : 'No matches found'}
              </p>
            ) : filteredStock.map(item => (
              <button key={item.id} type="button" onClick={() => addStockItem(item)}
                className="w-full flex items-center justify-between px-2 py-1.5 rounded hover:bg-white text-left text-sm">
                <div className="min-w-0">
                  <span className="text-[#1A1A1A] truncate">{item.name}</span>
                  {item.sku && <span className="text-xs text-[#9CA3AF] ml-1.5">{item.sku}</span>}
                </div>
                <span className="text-xs font-medium text-[#1A1A1A] shrink-0 ml-2">
                  {formatMoney(Number(item.unit_cost))}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {picker === 'pricebook' && (
        <div className="mb-3 border border-[#E5E7EB] rounded-lg bg-[#F9FAFB] p-2">
          <div className="relative mb-1.5">
            <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#9CA3AF]" />
            <input
              autoFocus
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search price book by description, code, category..."
              className="w-full h-8 pl-7 pr-7 text-sm border border-[#E5E7EB] rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-[#2E75B6]"
            />
            <button type="button" onClick={closePicker}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[#9CA3AF] hover:text-[#1A1A1A]">
              <X size={14} />
            </button>
          </div>
          <div className="max-h-40 overflow-auto">
            {filteredPriceBook.length === 0 ? (
              <p className="text-xs text-[#9CA3AF] text-center py-3">
                {priceBookItems.length === 0
                  ? 'No price book items yet — add them under Price Books'
                  : 'No matches found'}
              </p>
            ) : filteredPriceBook.map(item => (
              <button key={item.id} type="button" onClick={() => addPriceBookItem(item)}
                className="w-full flex items-center justify-between px-2 py-1.5 rounded hover:bg-white text-left text-sm">
                <div className="min-w-0">
                  <span className="text-[#1A1A1A] truncate">{item.description}</span>
                  {item.code && <span className="text-xs text-[#9CA3AF] ml-1.5">{item.code}</span>}
                  {item.category && <span className="text-[10px] text-[#9CA3AF] ml-1.5">{item.category}</span>}
                </div>
                <span className="text-xs font-medium text-[#1A1A1A] shrink-0 ml-2">
                  {formatMoney(Number(item.unit_price))}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="border border-[#E5E7EB] rounded-lg overflow-hidden overflow-x-auto">
        <div className={`grid ${GRID} gap-2 px-3 py-2 bg-[#F9FAFB] text-xs font-medium text-[#4A5568] ${MIN_W}`}>
          <span>Cost code</span>
          <span>Nature</span>
          <span>Description</span>
          <span className="text-right">Qty</span>
          <span className="text-right">Unit Cost</span>
          <span className="text-right">Markup %</span>
          <span className="text-right">Unit Price</span>
          <span className="text-right">Line Total</span>
          <span />
        </div>

        {lines.map((li, idx) => {
          const qty = parseFloat(li.quantity) || 0;
          const price = parseFloat(li.unit_price) || 0;
          const lineTotal = qty * price;
          const fromStock = !!li.stock_item_id;
          const fromBook = !!li.price_book_item_id;
          const fromModel = !!li.cost_model_id;
          return (
            <div
              key={idx}
              className={`grid ${GRID} gap-2 px-3 py-2 items-center border-t border-[#F3F4F6] ${MIN_W} ${
                fromStock || fromBook || fromModel ? 'bg-[#EFF6FF]/30' : ''
              }`}
            >
              <select
                value={li.cost_model_id ?? ''}
                onChange={e => applyCostModel(idx, e.target.value)}
                className="form-input-sm w-full cursor-pointer"
                title={costModels.length === 0 ? 'Create cost models under Expenses' : 'Labour cost code ($/hr)'}
              >
                <option value="">— Manual —</option>
                {costModels.map(m => (
                  <option key={m.id} value={m.id}>
                    {m.name} ({formatMoney(modelHourlyCost(m))}/hr)
                  </option>
                ))}
              </select>
              <ManagedSelect
                listKey={LIST_KEYS.chargeTypes}
                value={li.charge_type}
                onChange={v => updateLine(idx, { charge_type: v })}
                placeholder="Select..."
                allowAdd
                className="form-input-sm"
              />
              <div className="min-w-0 flex items-center gap-1">
                {fromStock && <Package size={10} className="text-[#2E75B6] shrink-0" aria-label="From stock" />}
                {fromBook && <BookOpen size={10} className="text-[#2E75B6] shrink-0" aria-label="From price book" />}
                <input
                  value={li.description}
                  onChange={e => updateLine(idx, { description: e.target.value })}
                  className="form-input-sm flex-1 min-w-0"
                  placeholder="Description"
                />
              </div>
              <input
                type="text"
                inputMode="decimal"
                value={li.quantity}
                onChange={e => {
                  const raw = e.target.value;
                  if (raw !== '' && !/^\d*\.?\d*$/.test(raw)) return;
                  updateLine(idx, { quantity: raw });
                }}
                className="form-input-sm text-right"
              />
              <input
                type="text"
                inputMode="decimal"
                value={li.unit_cost ?? ''}
                onChange={e => {
                  const raw = e.target.value;
                  if (raw !== '' && !/^\d*\.?\d*$/.test(raw)) return;
                  handleCostChange(idx, raw);
                }}
                className="form-input-sm text-right"
                placeholder="0.00"
              />
              <input
                type="text"
                inputMode="decimal"
                value={li.markup_percent ?? ''}
                onChange={e => {
                  const raw = e.target.value;
                  if (raw !== '' && !/^-?\d*\.?\d*$/.test(raw)) return;
                  handleMarkupChange(idx, raw);
                }}
                className="form-input-sm text-right"
                placeholder="0"
              />
              <input
                type="text"
                inputMode="decimal"
                value={li.unit_price}
                onChange={e => {
                  const raw = e.target.value;
                  if (raw !== '' && !/^\d*\.?\d*$/.test(raw)) return;
                  updateLine(idx, { unit_price: raw });
                }}
                className="form-input-sm text-right font-medium"
                placeholder="0.00"
              />
              <span className="text-sm text-right font-medium text-[#1A1A1A]">
                {formatMoney(lineTotal)}
              </span>
              <button
                type="button"
                onClick={() => removeLine(idx)}
                className="w-7 h-7 flex items-center justify-center rounded text-[#9CA3AF] hover:text-red-600 hover:bg-red-50"
              >
                <Trash2 size={14} />
              </button>
            </div>
          );
        })}

        {lines.length === 0 && (
          <div className="px-3 py-4 text-center text-xs text-[#9CA3AF] border-t border-[#F3F4F6]">
            No line items yet — add a manual line, pick a cost code, or add from stock / price book
          </div>
        )}
      </div>

      <div className="flex justify-between mt-2 text-xs text-[#6B7280] flex-wrap gap-2">
        <span>
          {lines.filter(l => l.cost_model_id).length} cost code ·{' '}
          {lines.filter(l => l.stock_item_id).length} stock ·{' '}
          {lines.filter(l => l.price_book_item_id).length} price book ·{' '}
          {lines.filter(l => !l.stock_item_id && !l.price_book_item_id && !l.cost_model_id).length} manual
        </span>
        <span>
          Subtotal {formatMoney(lines.reduce((s, li) => s + (parseFloat(li.quantity) || 0) * (parseFloat(li.unit_price) || 0), 0))}
        </span>
      </div>
    </div>
  );
}

export function calcSubtotal(lines: EditLineItem[]): number {
  return lines.reduce((s, li) => s + (parseFloat(li.quantity) || 0) * (parseFloat(li.unit_price) || 0), 0);
}

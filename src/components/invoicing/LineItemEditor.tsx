import { useState, useMemo } from 'react';
import { Package, Plus, Trash2, Search, X } from 'lucide-react';
import { formatMoney } from '../../types/fsm';
import type { StockItem } from '../../types/fsm';

export interface EditLineItem {
  description: string;
  quantity: string;
  unit_price: string;
  stock_item_id: string | null;
  unit_cost: string | null;
  markup_percent: string | null;
}

export function emptyLineItem(): EditLineItem {
  return { description: '', quantity: '1', unit_price: '', stock_item_id: null, unit_cost: null, markup_percent: null };
}

export function toEditLine(li: {
  description: string; quantity: number; unit_price: number;
  stock_item_id?: string | null; unit_cost?: number | null; markup_percent?: number | null;
}): EditLineItem {
  return {
    description: li.description,
    quantity: String(li.quantity),
    unit_price: String(li.unit_price),
    stock_item_id: li.stock_item_id ?? null,
    unit_cost: li.unit_cost != null ? String(li.unit_cost) : null,
    markup_percent: li.markup_percent != null ? String(li.markup_percent) : null,
  };
}

interface LineItemEditorProps {
  lines: EditLineItem[];
  stockItems: StockItem[];
  defaultMarkup: number;
  onChange: (lines: EditLineItem[]) => void;
}

export function LineItemEditor({ lines, stockItems, defaultMarkup, onChange }: LineItemEditorProps) {
  const [showStockPicker, setShowStockPicker] = useState(false);
  const [stockSearch, setStockSearch] = useState('');

  const updateLine = (idx: number, patch: Partial<EditLineItem>) =>
    onChange(lines.map((li, i) => (i === idx ? { ...li, ...patch } : li)));

  const removeLine = (idx: number) => onChange(lines.filter((_, i) => i !== idx));
  const addLine = () => onChange([...lines, emptyLineItem()]);

  const addStockItem = (item: StockItem) => {
    const cost = Number(item.unit_cost) || 0;
    const markup = defaultMarkup;
    const sellPrice = cost * (1 + markup / 100);
    onChange([...lines, {
      description: item.name,
      quantity: '1',
      unit_price: sellPrice.toFixed(2),
      stock_item_id: item.id,
      unit_cost: cost.toFixed(2),
      markup_percent: String(markup),
    }]);
    setShowStockPicker(false);
    setStockSearch('');
  };

  const handleMarkupChange = (idx: number, markupStr: string) => {
    const cost = parseFloat(lines[idx].unit_cost ?? '0') || 0;
    const markup = parseFloat(markupStr) || 0;
    const sellPrice = cost * (1 + markup / 100);
    updateLine(idx, { markup_percent: markupStr, unit_price: sellPrice.toFixed(2) });
  };

  const handleCostChange = (idx: number, costStr: string) => {
    const cost = parseFloat(costStr) || 0;
    const markup = parseFloat(lines[idx].markup_percent ?? '0') || 0;
    const sellPrice = cost * (1 + markup / 100);
    updateLine(idx, { unit_cost: costStr, unit_price: sellPrice.toFixed(2) });
  };

  const filteredStock = useMemo(() => {
    if (!stockSearch.trim()) return stockItems;
    const q = stockSearch.toLowerCase();
    return stockItems.filter(s =>
      s.name.toLowerCase().includes(q) ||
      (s.sku ?? '').toLowerCase().includes(q) ||
      (s.category ?? '').toLowerCase().includes(q),
    );
  }, [stockItems, stockSearch]);

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <label className="text-xs font-medium text-[#4A5568]">Line Items</label>
        <div className="flex gap-2">
          <button type="button" onClick={() => setShowStockPicker(v => !v)}
            className="flex items-center gap-1 text-xs text-[#2E75B6] hover:underline font-medium">
            <Package size={13} /> Add from stock
          </button>
          <button type="button" onClick={addLine}
            className="flex items-center gap-1 text-xs text-[#2E75B6] hover:underline font-medium">
            <Plus size={13} /> Add line
          </button>
        </div>
      </div>

      {showStockPicker && (
        <div className="mb-3 border border-[#E5E7EB] rounded-lg bg-[#F9FAFB] p-2">
          <div className="relative mb-1.5">
            <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#9CA3AF]" />
            <input
              autoFocus
              value={stockSearch}
              onChange={e => setStockSearch(e.target.value)}
              placeholder="Search stock by name, SKU, category..."
              className="w-full h-8 pl-7 pr-7 text-sm border border-[#E5E7EB] rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-[#2E75B6]"
            />
            <button onClick={() => setShowStockPicker(false)}
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
                <div className="flex items-center gap-3 shrink-0 ml-2">
                  {item.storage_location && (
                    <span className="text-[10px] text-[#9CA3AF]">{item.storage_location}</span>
                  )}
                  <span className="text-xs text-[#4A5568]">
                    {item.quantity_on_hand} {item.unit_of_measure}
                  </span>
                  <span className="text-xs font-medium text-[#1A1A1A]">{formatMoney(Number(item.unit_cost))}</span>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="border border-[#E5E7EB] rounded-lg overflow-hidden overflow-x-auto">
        {/* Header */}
        <div className="grid grid-cols-[1fr_60px_90px_80px_90px_100px_32px] gap-2 px-3 py-2 bg-[#F9FAFB] text-xs font-medium text-[#4A5568] min-w-[700px]">
          <span>Description</span>
          <span className="text-right">Qty</span>
          <span className="text-right">Unit Cost</span>
          <span className="text-right">Markup %</span>
          <span className="text-right">Unit Price</span>
          <span className="text-right">Line Total</span>
          <span></span>
        </div>

        {/* Lines */}
        {lines.map((li, idx) => {
          const isStock = !!li.stock_item_id;
          const qty = parseFloat(li.quantity) || 0;
          const price = parseFloat(li.unit_price) || 0;
          const lineTotal = qty * price;
          return (
            <div key={idx}
              className={`grid grid-cols-[1fr_60px_90px_80px_90px_100px_32px] gap-2 px-3 py-2 items-center border-t border-[#F3F4F6] min-w-[700px] ${isStock ? 'bg-[#EFF6FF]/30' : ''}`}>
              {/* Description */}
              <div className="min-w-0">
                {isStock && <Package size={10} className="inline text-[#2E75B6] mr-1" />}
                <input
                  value={li.description}
                  onChange={e => updateLine(idx, { description: e.target.value })}
                  className="form-input-sm"
                  placeholder="Item description"
                />
              </div>
              {/* Qty */}
              <input
                type="number" min={0} step="any"
                value={li.quantity}
                onChange={e => updateLine(idx, { quantity: e.target.value })}
                className="form-input-sm text-right"
              />
              {/* Unit Cost — only editable for stock-linked lines */}
              {isStock ? (
                <input
                  type="number" min={0} step="0.01"
                  value={li.unit_cost ?? ''}
                  onChange={e => handleCostChange(idx, e.target.value)}
                  className="form-input-sm text-right"
                  placeholder="0.00"
                />
              ) : (
                <input
                  type="number" min={0} step="0.01"
                  value={li.unit_cost ?? ''}
                  onChange={e => handleCostChange(idx, e.target.value)}
                  className="form-input-sm text-right"
                  placeholder="0.00"
                />
              )}
              {/* Markup % */}
              <input
                type="number" min={0} step="0.1"
                value={li.markup_percent ?? ''}
                onChange={e => handleMarkupChange(idx, e.target.value)}
                className="form-input-sm text-right"
                placeholder="0"
              />
              {/* Unit Price (sell price — auto-calculated from cost+markup, but editable) */}
              <input
                type="number" min={0} step="0.01"
                value={li.unit_price}
                onChange={e => updateLine(idx, { unit_price: e.target.value })}
                className="form-input-sm text-right font-medium"
                placeholder="0.00"
              />
              {/* Line total */}
              <span className="text-sm text-right font-medium text-[#1A1A1A]">
                {formatMoney(lineTotal)}
              </span>
              {/* Delete */}
              <button type="button" onClick={() => removeLine(idx)}
                className="w-7 h-7 flex items-center justify-center rounded text-[#9CA3AF] hover:text-red-600 hover:bg-red-50">
                <Trash2 size={14} />
              </button>
            </div>
          );
        })}

        {lines.length === 0 && (
          <div className="px-3 py-4 text-center text-xs text-[#9CA3AF] border-t border-[#F3F4F6]">
            No line items yet
          </div>
        )}
      </div>

      {/* Cost summary */}
      <div className="flex justify-between mt-2 text-xs text-[#6B7280]">
        <span>
          {lines.filter(l => l.stock_item_id).length} stock item(s) · {lines.filter(l => !l.stock_item_id).length} manual line(s)
        </span>
        <span>
          Material cost: {formatMoney(
            lines.reduce((sum, li) => sum + (parseFloat(li.quantity) || 0) * (parseFloat(li.unit_cost ?? '0') || 0), 0)
          )}
        </span>
      </div>
    </div>
  );
}

// ── Subtotal helper ──────────────────────────────────────────────

export function calcSubtotal(lines: EditLineItem[]): number {
  return lines.reduce((sum, li) => sum + (parseFloat(li.quantity) || 0) * (parseFloat(li.unit_price) || 0), 0);
}

export function calcMaterialCost(lines: EditLineItem[]): number {
  return lines.reduce((sum, li) => sum + (parseFloat(li.quantity) || 0) * (parseFloat(li.unit_cost ?? '0') || 0), 0);
}

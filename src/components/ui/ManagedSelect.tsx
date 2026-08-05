import { useState, useRef, useEffect, useLayoutEffect } from 'react';
import { ChevronDown, Plus, Check } from 'lucide-react';
import { useManagedList, useAddListItem } from '../../lib/useManagedList';

interface ManagedSelectProps {
  listKey: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  allowAdd?: boolean;
  noneLabel?: string;
}

const PANEL_MAX_H = 256;
const PANEL_MIN_H = 120;

export function ManagedSelect({
  listKey,
  value,
  onChange,
  placeholder = 'Select...',
  className = 'form-input',
  allowAdd = true,
  noneLabel = '— None —',
}: ManagedSelectProps) {
  const { data: items = [], isLoading } = useManagedList(listKey);
  const addMutation = useAddListItem(listKey);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [adding, setAdding] = useState(false);
  const [newValue, setNewValue] = useState('');
  const [panelStyle, setPanelStyle] = useState<React.CSSProperties>({});
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function scheduleClose() {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => {
      setOpen(false);
      setAdding(false);
      setSearch('');
    }, 200);
  }

  function cancelClose() {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  }

  useLayoutEffect(() => {
    if (!open || !buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;
    const openUpward = spaceBelow < PANEL_MIN_H && spaceAbove > spaceBelow;
    const availableSpace = openUpward ? spaceAbove : spaceBelow;
    const panelH = Math.min(PANEL_MAX_H, Math.max(PANEL_MIN_H, availableSpace - 8));
    const top = openUpward ? rect.top - panelH - 4 : rect.bottom + 4;
    setPanelStyle({
      position: 'fixed',
      top: Math.max(4, top),
      left: rect.left,
      width: rect.width,
      maxHeight: panelH,
      zIndex: 9999,
    });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setAdding(false);
        setSearch('');
      }
    };
    document.addEventListener('mousedown', handler);
    const onScroll = () => setOpen(false);
    window.addEventListener('scroll', onScroll, true);
    return () => {
      document.removeEventListener('mousedown', handler);
      window.removeEventListener('scroll', onScroll, true);
      if (closeTimer.current) clearTimeout(closeTimer.current);
    };
  }, [open]);

  const filtered = items.filter(i =>
    i.value.toLowerCase().includes(search.toLowerCase()) ||
    i.label.toLowerCase().includes(search.toLowerCase())
  );

  const selected = items.find(i => i.value === value);
  const displayValue = selected ? (selected.label || selected.value) : value;

  async function handleAdd() {
    const v = newValue.trim();
    if (!v) return;
    try {
      await addMutation.mutateAsync(v);
      onChange(v);
      setNewValue('');
      setAdding(false);
      setOpen(false);
    } catch { /* error shown via toast elsewhere */ }
  }

  return (
    <div
      ref={containerRef}
      className="relative"
      onMouseEnter={() => { cancelClose(); setOpen(true); }}
      onMouseLeave={scheduleClose}
    >
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen(!open)}
        className={`${className} text-left flex items-center justify-between cursor-pointer ${
          value ? 'text-[#1A1A1A]' : 'text-[#9CA3AF]'
        }`}
      >
        <span className="truncate">{value ? displayValue : placeholder}</span>
        <ChevronDown size={16} className={`text-[#6B7280] shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div
          style={panelStyle}
          className="bg-white rounded-lg shadow-xl border border-[#E5E7EB] py-1 flex flex-col overflow-hidden"
        >
          <div className="px-2 pb-1 shrink-0">
            <input
              ref={inputRef}
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search..."
              className="w-full h-8 px-2 text-sm border border-[#E5E7EB] rounded-md focus:outline-none focus:ring-2 focus:ring-[#2E75B6]"
              autoFocus
            />
          </div>
          <div className="overflow-auto flex-1">
            <button
              type="button"
              onClick={() => { onChange(''); setOpen(false); }}
              className={`w-full text-left px-3 py-2 text-sm hover:bg-[#F9FAFB] ${!value ? 'bg-[#F0F7FF] text-[#0A2540] font-medium' : 'text-[#4A5568]'}`}
            >
              {noneLabel}
            </button>
            {isLoading && <div className="px-3 py-2 text-sm text-[#9CA3AF]">Loading...</div>}
            {!isLoading && filtered.length === 0 && !adding && (
              <div className="px-3 py-2 text-sm text-[#9CA3AF]">No matches</div>
            )}
            {filtered.map(item => (
              <button
                key={item.id}
                type="button"
                onClick={() => { onChange(item.value); setOpen(false); }}
                className={`w-full text-left px-3 py-2 text-sm hover:bg-[#F9FAFB] flex items-center justify-between ${
                  value === item.value ? 'bg-[#F0F7FF] text-[#0A2540] font-medium' : 'text-[#1A1A1A]'
                }`}
              >
                <span className="truncate">{item.label || item.value}</span>
                {value === item.value && <Check size={14} className="text-[#2E75B6] shrink-0" />}
              </button>
            ))}
          </div>
          {allowAdd && !adding && (
            <button
              type="button"
              onClick={() => { setAdding(true); setSearch(''); }}
              className="flex items-center gap-1.5 px-3 py-2 text-sm text-[#2E75B6] hover:bg-[#F0F7FF] border-t border-[#E5E7EB] shrink-0"
            >
              <Plus size={14} /> Add new...
            </button>
          )}
          {adding && (
            <div className="px-2 py-2 border-t border-[#E5E7EB] flex items-center gap-2 shrink-0">
              <input
                value={newValue}
                onChange={e => setNewValue(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAdd(); } }}
                placeholder="Enter new value..."
                className="flex-1 h-8 px-2 text-sm border border-[#E5E7EB] rounded-md focus:outline-none focus:ring-2 focus:ring-[#2E75B6]"
                autoFocus
              />
              <button
                type="button"
                onClick={handleAdd}
                disabled={!newValue.trim() || addMutation.isPending}
                className="px-3 h-8 text-sm font-medium text-white bg-[#0A2540] rounded-md hover:bg-[#0d2f4e] disabled:opacity-50"
              >
                Add
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

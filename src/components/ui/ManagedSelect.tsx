import { useState, useRef, useEffect, useLayoutEffect, type MouseEvent as ReactMouseEvent, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Plus, Check, Trash2 } from 'lucide-react';
import { useManagedList, useAddListItem, useDeleteListItem } from '../../lib/useManagedList';

interface ManagedSelectProps {
  listKey: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  allowAdd?: boolean;
  /** Show delete on each option (defaults to same as allowAdd) */
  allowDelete?: boolean;
  noneLabel?: string;
}

const PANEL_MAX_H = 280;
const PANEL_MIN_H = 140;

export function ManagedSelect({
  listKey,
  value,
  onChange,
  placeholder = 'Select...',
  className = 'form-input',
  allowAdd = true,
  allowDelete,
  noneLabel = '— None —',
}: ManagedSelectProps) {
  const canDelete = allowDelete ?? allowAdd;
  const { data: items = [], isLoading } = useManagedList(listKey);
  const addMutation = useAddListItem(listKey);
  const deleteMutation = useDeleteListItem(listKey);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [adding, setAdding] = useState(false);
  const [newValue, setNewValue] = useState('');
  const [panelStyle, setPanelStyle] = useState<CSSProperties>({});
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  function close() {
    setOpen(false);
    setAdding(false);
    setSearch('');
    setNewValue('');
  }

  function positionPanel() {
    if (!buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;
    const openUpward = spaceBelow < PANEL_MIN_H && spaceAbove > spaceBelow;
    const availableSpace = openUpward ? spaceAbove : spaceBelow;
    const panelH = Math.min(PANEL_MAX_H, Math.max(PANEL_MIN_H, availableSpace - 8));
    const top = openUpward ? rect.top - panelH - 4 : rect.bottom + 4;
    const width = Math.max(rect.width, canDelete ? 220 : rect.width);
    const left = Math.min(rect.left, Math.max(8, window.innerWidth - width - 8));
    setPanelStyle({
      position: 'fixed',
      top: Math.max(4, top),
      left,
      width,
      maxHeight: panelH,
      zIndex: 10000,
    });
  }

  useLayoutEffect(() => {
    if (!open) return;
    positionPanel();
  }, [open, canDelete, search, items.length]);

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (e: MouseEvent | TouchEvent) => {
      const target = e.target as Node;
      if (buttonRef.current?.contains(target)) return;
      if (panelRef.current?.contains(target)) return;
      close();
    };

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };

    // Reposition on page scroll; never close when scrolling the option list itself
    const onScroll = (e: Event) => {
      const target = e.target as Node | null;
      if (target && panelRef.current?.contains(target)) return;
      if (target === listRef.current) return;
      positionPanel();
    };

    const onResize = () => positionPanel();

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('touchstart', onPointerDown, { passive: true });
    document.addEventListener('keydown', onKey);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onResize);

    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('touchstart', onPointerDown);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onResize);
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
      close();
    } catch { /* ignore */ }
  }

  async function handleDelete(id: string, itemValue: string, e: ReactMouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    try {
      await deleteMutation.mutateAsync(id);
      if (value === itemValue) onChange('');
    } catch { /* ignore */ }
  }

  const panel = open ? createPortal(
    <div
      ref={panelRef}
      style={panelStyle}
      className="bg-white rounded-lg shadow-xl border border-[#E5E7EB] py-1 flex flex-col overflow-hidden"
      // Keep wheel/touch scroll on the list — do not let parent overlays steal it
      onWheel={e => e.stopPropagation()}
      onTouchMove={e => e.stopPropagation()}
    >
      <div className="px-2 pb-1 shrink-0">
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search..."
          className="w-full h-8 px-2 text-sm border border-[#E5E7EB] rounded-md focus:outline-none focus:ring-2 focus:ring-[#2E75B6]"
          autoFocus
          onKeyDown={e => e.stopPropagation()}
        />
      </div>
      <div
        ref={listRef}
        className="overflow-y-auto overflow-x-hidden flex-1 overscroll-contain"
        style={{ WebkitOverflowScrolling: 'touch' }}
      >
        <button
          type="button"
          onClick={() => { onChange(''); close(); }}
          className={`w-full text-left px-3 py-2 text-sm hover:bg-[#F9FAFB] ${!value ? 'bg-[#F0F7FF] text-[#0A2540] font-medium' : 'text-[#4A5568]'}`}
        >
          {noneLabel}
        </button>
        {isLoading && <div className="px-3 py-2 text-sm text-[#9CA3AF]">Loading...</div>}
        {!isLoading && filtered.length === 0 && !adding && (
          <div className="px-3 py-2 text-sm text-[#9CA3AF]">No matches</div>
        )}
        {filtered.map(item => (
          <div
            key={item.id}
            className={`flex items-center gap-1 px-1 ${
              value === item.value ? 'bg-[#F0F7FF]' : 'hover:bg-[#F9FAFB]'
            }`}
          >
            <button
              type="button"
              onClick={() => { onChange(item.value); close(); }}
              className={`flex-1 min-w-0 text-left px-2 py-2 text-sm flex items-center justify-between ${
                value === item.value ? 'text-[#0A2540] font-medium' : 'text-[#1A1A1A]'
              }`}
            >
              <span className="truncate">{item.label || item.value}</span>
              {value === item.value && <Check size={14} className="text-[#2E75B6] shrink-0 ml-1" />}
            </button>
            {canDelete && (
              <button
                type="button"
                title={`Remove "${item.label || item.value}"`}
                onClick={(e) => handleDelete(item.id, item.value, e)}
                disabled={deleteMutation.isPending}
                className="w-7 h-7 flex items-center justify-center rounded text-[#9CA3AF] hover:text-red-600 hover:bg-red-50 shrink-0 mr-1 disabled:opacity-50"
              >
                <Trash2 size={13} />
              </button>
            )}
          </div>
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
            onKeyDown={e => {
              e.stopPropagation();
              if (e.key === 'Enter') { e.preventDefault(); void handleAdd(); }
            }}
            placeholder="Enter new value..."
            className="flex-1 h-8 px-2 text-sm border border-[#E5E7EB] rounded-md focus:outline-none focus:ring-2 focus:ring-[#2E75B6]"
            autoFocus
          />
          <button
            type="button"
            onClick={() => void handleAdd()}
            disabled={!newValue.trim() || addMutation.isPending}
            className="px-3 h-8 text-sm font-medium text-white bg-[#0A2540] rounded-md hover:bg-[#0d2f4e] disabled:opacity-50"
          >
            Add
          </button>
        </div>
      )}
    </div>,
    document.body,
  ) : null;

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        aria-haspopup="listbox"
        className={`${className} text-left flex items-center justify-between cursor-pointer ${
          value ? 'text-[#1A1A1A]' : 'text-[#9CA3AF]'
        }`}
      >
        <span className="truncate">{value ? displayValue : placeholder}</span>
        <ChevronDown size={16} className={`text-[#6B7280] shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {panel}
    </div>
  );
}

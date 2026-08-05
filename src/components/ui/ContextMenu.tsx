import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { MoreVertical } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export interface MenuItem {
  label: string;
  icon?: LucideIcon;
  onClick: () => void;
  variant?: 'default' | 'danger' | 'accent';
  disabled?: boolean;
}

export interface MenuDivider {
  divider: true;
}

export type MenuEntry = MenuItem | MenuDivider;

function isDivider(e: MenuEntry): e is MenuDivider {
  return 'divider' in e;
}

interface ContextMenuProps {
  items: MenuEntry[];
  align?: 'left' | 'right';
}

export function ContextMenu({ items, align = 'right' }: ContextMenuProps) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const menuWidth = 200;

  const openMenu = useCallback((e: React.MouseEvent | React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (btnRef.current) {
      const r = btnRef.current.getBoundingClientRect();
      const left = align === 'right'
        ? Math.max(8, Math.min(r.right - menuWidth, window.innerWidth - menuWidth - 8))
        : Math.max(8, Math.min(r.left, window.innerWidth - menuWidth - 8));
      setPos({ top: r.bottom + 4, left });
    }
    setOpen(v => !v);
  }, [align]);

  useEffect(() => {
    if (!open) return;
    const handleClick = () => setOpen(false);
    const handleEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('click', handleClick);
    window.addEventListener('keydown', handleEsc);
    return () => {
      window.removeEventListener('click', handleClick);
      window.removeEventListener('keydown', handleEsc);
    };
  }, [open]);

  const dropdown = open ? createPortal(
    <>
      <div className="fixed inset-0" style={{ zIndex: 9998 }} onClick={(e) => { e.stopPropagation(); setOpen(false); }} />
      <div
        className="fixed bg-white border border-[#E5E7EB] rounded-lg shadow-lg py-1 min-w-[200px] max-h-80 overflow-y-auto animate-fade-in"
        style={{ top: pos.top, left: pos.left, zIndex: 9999 }}
        onClick={(e) => e.stopPropagation()}
      >
        {items.map((entry, i) => {
          if (isDivider(entry)) {
            return <div key={`d-${i}`} className="border-t border-[#E5E7EB] my-1" />;
          }
          const Icon = entry.icon;
          const colorCls = entry.variant === 'danger'
            ? 'text-red-600 hover:bg-red-50'
            : entry.variant === 'accent'
              ? 'text-[#2E75B6] hover:bg-[#F0F7FF]'
              : 'text-[#1A1A1A] hover:bg-[#F9FAFB]';
          return (
            <button
              key={entry.label}
              type="button"
              disabled={entry.disabled}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                entry.onClick();
                setOpen(false);
              }}
              className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm transition-colors text-left disabled:opacity-50 disabled:cursor-not-allowed ${colorCls}`}
            >
              {Icon && <Icon size={14} />}
              {entry.label}
            </button>
          );
        })}
      </div>
    </>,
    document.body,
  ) : null;

  return (
    <div className="relative">
      <button
        ref={btnRef}
        type="button"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={openMenu}
        className="relative w-7 h-7 flex items-center justify-center rounded hover:bg-[#F3F4F6] text-[#9CA3AF] hover:text-[#374151] transition-colors"
        style={{ zIndex: 20 }}
        aria-label="Open menu"
      >
        <MoreVertical size={15} />
      </button>
      {dropdown}
    </div>
  );
}

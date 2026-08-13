import { useEffect, useRef, useState } from 'react';
import { EMPLOYEE_COLORS } from '../../lib/jobColors';

type Props = {
  name: string;
  color: string;
  /** Currently saved colour, or null if using auto */
  savedColor: string | null | undefined;
  onPick: (hex: string | null) => void;
  disabled?: boolean;
};

/** Colour swatch that opens a palette popover (click swatch, not the whole pill). */
export function EmployeeColorSwatch({ name, color, savedColor, onPick, disabled }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  return (
    <div className="relative inline-flex" ref={ref}>
      <button
        type="button"
        disabled={disabled}
        title={`Change colour for ${name}`}
        aria-label={`Change colour for ${name}`}
        onClick={e => {
          e.stopPropagation();
          e.preventDefault();
          setOpen(o => !o);
        }}
        className="w-2.5 h-2.5 rounded-full ring-1 ring-black/10 hover:ring-2 hover:ring-[#2E75B6] hover:scale-125 transition-transform disabled:opacity-50"
        style={{ background: color }}
      />
      {open && (
        <div
          className="absolute left-0 top-full mt-2 z-50 w-[220px] rounded-lg border border-[#E5E7EB] bg-white shadow-xl p-3"
          onClick={e => e.stopPropagation()}
        >
          <p className="text-xs font-semibold text-[#1A1A1A] mb-0.5">{name}</p>
          <p className="text-[10px] text-[#6B7280] mb-2">Schedule colour</p>
          <div className="grid grid-cols-6 gap-1.5">
            {EMPLOYEE_COLORS.map(hex => {
              const selected = (savedColor ?? color).toUpperCase() === hex.toUpperCase();
              return (
                <button
                  key={hex}
                  type="button"
                  title={hex}
                  onClick={() => {
                    onPick(hex);
                    setOpen(false);
                  }}
                  className={`w-7 h-7 rounded-md border-2 transition-transform hover:scale-105 ${
                    selected ? 'border-[#0A2540] scale-105' : 'border-transparent'
                  }`}
                  style={{ background: hex }}
                />
              );
            })}
          </div>
          <div className="mt-2 flex items-center gap-2">
            <label className="text-[10px] text-[#6B7280] shrink-0">Custom</label>
            <input
              type="color"
              value={/^#[0-9A-Fa-f]{6}$/.test(color) ? color : '#3B6D9A'}
              onChange={e => onPick(e.target.value.toUpperCase())}
              className="h-7 w-full cursor-pointer rounded border border-[#E5E7EB] bg-white"
            />
          </div>
          {savedColor && (
            <button
              type="button"
              className="mt-2 text-[11px] text-[#2E75B6] hover:underline"
              onClick={() => {
                onPick(null);
                setOpen(false);
              }}
            >
              Reset to auto colour
            </button>
          )}
        </div>
      )}
    </div>
  );
}

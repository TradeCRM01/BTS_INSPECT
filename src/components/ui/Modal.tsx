import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import type { ReactNode } from 'react';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
  /** sm = confirms; md/lg/xl/full = forms (default lg for workspace use) */
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'full';
}

const SIZE_CLASSES: Record<string, string> = {
  sm: 'overlay-panel-sm',
  md: 'overlay-panel-md',
  lg: 'overlay-panel-lg',
  xl: 'overlay-panel-xl',
  full: 'overlay-panel-xl',
};

export function Modal({ open, onClose, title, subtitle, children, footer, size = 'lg' }: ModalProps) {
  useEffect(() => {
    if (!open) return;
    // Escape closes lightweight dialogs (e.g. confirm). Form editors use their own overlays
    // and close only via Cancel / X so accidental Esc does not wipe input.
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && size === 'sm') onClose();
    };
    window.addEventListener('keydown', handleEsc);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', handleEsc);
      document.body.style.overflow = '';
    };
  }, [open, onClose, size]);

  if (!open) return null;

  return createPortal(
    <div className="overlay-backdrop">
      <div
        className={`${SIZE_CLASSES[size]} animate-slide-up`}
        onClick={(e) => e.stopPropagation()}
      >
        {(title || subtitle) && (
          <div className="flex items-start justify-between px-5 py-4 border-b border-[#E5E7EB] shrink-0">
            <div className="min-w-0">
              {title && <h2 className="text-base font-semibold text-[#1A1A1A]">{title}</h2>}
              {subtitle && <p className="text-sm text-[#4A5568] mt-0.5">{subtitle}</p>}
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 flex items-center justify-center rounded-md text-[#9CA3AF] hover:bg-[#F3F4F6] hover:text-[#1A1A1A] transition-colors shrink-0 ml-3"
              aria-label="Close"
            >
              <X size={16} />
            </button>
          </div>
        )}
        <div className="flex-1 min-h-0 overflow-y-auto">
          {children}
        </div>
        {footer && (
          <div className="px-5 py-4 border-t border-[#E5E7EB] bg-[#F9FAFB] shrink-0">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

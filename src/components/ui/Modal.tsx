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
  size?: 'sm' | 'md' | 'lg' | 'xl';
}

const SIZE_CLASSES: Record<string, string> = {
  sm: 'max-w-md',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
  xl: 'max-w-4xl',
};

export function Modal({ open, onClose, title, subtitle, children, footer, size = 'md' }: ModalProps) {
  useEffect(() => {
    if (!open) return;
    const handleEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handleEsc);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', handleEsc);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 pt-[8vh] overflow-y-auto"
      onClick={onClose}
    >
      <div
        className={`w-full ${SIZE_CLASSES[size]} bg-white rounded-xl shadow-2xl animate-slide-up`}
        onClick={(e) => e.stopPropagation()}
      >
        {(title || subtitle) && (
          <div className="flex items-start justify-between px-5 py-4 border-b border-[#E5E7EB]">
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
        <div className="max-h-[calc(80vh-120px)] overflow-y-auto">
          {children}
        </div>
        {footer && (
          <div className="px-5 py-4 border-t border-[#E5E7EB] bg-[#F9FAFB] rounded-b-xl">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

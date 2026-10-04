import { useEffect, useLayoutEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import type { ReactNode } from 'react';
import {
  applyDialogKey,
  dialogFocusableControls,
  dialogFocusPlan,
  dialogStackEnter,
  dialogStackIsTop,
  dialogStackLeave,
  lockDialogScroll,
  unlockDialogScroll,
} from '../../lib/dialogFocus';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
  /** sm = confirms; md/lg/xl/full = forms (default lg for workspace use) */
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'full';
  /**
   * Escape cancels a confirm. A larger sheet stays open so a draft or a save
   * in flight is not dropped. Nested quote and invoice Send opt in.
   */
  closeOnEscape?: boolean;
}

const SIZE_CLASSES: Record<string, string> = {
  sm: 'overlay-panel-sm',
  md: 'overlay-panel-md',
  lg: 'overlay-panel-lg',
  xl: 'overlay-panel-xl',
  full: 'overlay-panel-xl',
};

export function Modal({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  size = 'lg',
  closeOnEscape,
}: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const wasOpenRef = useRef(false);
  const openRef = useRef(open);
  const onCloseRef = useRef(onClose);
  const escapeRef = useRef(closeOnEscape ?? size === 'sm');
  const mountedRef = useRef(false);
  const stackTokenRef = useRef<symbol | null>(null);
  onCloseRef.current = onClose;
  escapeRef.current = closeOnEscape ?? size === 'sm';
  openRef.current = open;

  useLayoutEffect(() => {
    const plan = dialogFocusPlan(open, wasOpenRef.current);
    wasOpenRef.current = open;
    if (plan.captureOpener) {
      const active = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      if (!panelRef.current?.contains(active)) openerRef.current = active;
    }
    if (plan.restoreOpener) {
      const opener = openerRef.current;
      openerRef.current = null;
      opener?.focus();
    }
    if (!plan.focusFirst) return;
    const panel = panelRef.current;
    if (!panel) return;
    const nodes = dialogFocusableControls(panel);
    (nodes[0] ?? panel).focus();
    return () => {
      if (openRef.current) wasOpenRef.current = false;
    };
  }, [open]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      const opener = openerRef.current;
      queueMicrotask(() => {
        if (mountedRef.current) return;
        opener?.focus();
      });
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    lockDialogScroll();
    const token = dialogStackEnter();
    stackTokenRef.current = token;
    const onKey = (event: KeyboardEvent) => {
      if (!dialogStackIsTop(token)) return;
      applyDialogKey(event, panelRef.current, () => onCloseRef.current(), escapeRef.current);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      dialogStackLeave(token);
      if (stackTokenRef.current === token) stackTokenRef.current = null;
      unlockDialogScroll();
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (!open) return null;

  return createPortal(
    <div className="overlay-backdrop">
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
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

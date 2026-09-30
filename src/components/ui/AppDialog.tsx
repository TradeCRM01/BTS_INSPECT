import { useEffect, useRef, type ReactNode } from 'react';
import { dialogFocusPlan, dialogKeyAction } from '../../lib/dialogFocus';
import { OverlayPortal } from './OverlayPortal';

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'textarea:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

function focusables(root: HTMLElement): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
    el => !el.hasAttribute('disabled') && el.getAttribute('aria-hidden') !== 'true',
  );
}

export function AppDialog({
  open,
  onClose,
  title,
  labelledBy,
  children,
  className = '',
  panelClassName = '',
  escape = true,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  labelledBy?: string;
  children: ReactNode;
  className?: string;
  panelClassName?: string;
  escape?: boolean;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  const escapeRef = useRef(escape);
  const wasOpenRef = useRef(false);
  onCloseRef.current = onClose;
  escapeRef.current = escape;

  useEffect(() => {
    const plan = dialogFocusPlan(open, wasOpenRef.current);
    wasOpenRef.current = open;
    if (plan.captureOpener) {
      openerRef.current = document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    }
    if (plan.focusFirst) {
      const panel = panelRef.current;
      const nodes = panel ? focusables(panel) : [];
      (nodes[0] ?? panel)?.focus();
    }
    if (plan.restoreOpener) {
      openerRef.current?.focus();
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      const action = dialogKeyAction(e.key, e.shiftKey);
      if (action === 'close' && escapeRef.current) {
        e.preventDefault();
        onCloseRef.current();
        return;
      }
      if (action !== 'trap') return;
      const panel = panelRef.current;
      if (!panel) return;
      const list = focusables(panel);
      if (list.length === 0) {
        e.preventDefault();
        panel.focus();
        return;
      }
      const first = list[0];
      const last = list[list.length - 1];
      const active = document.activeElement;
      const activeIndex = list.findIndex(node => node === active);
      if (e.shiftKey && (active === first || activeIndex < 0)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (active === last || activeIndex < 0)) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  if (!open) return null;

  return (
    <OverlayPortal>
      <div className={`overlay-backdrop ${className}`.trim()}>
        <div
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-label={labelledBy ? undefined : title}
          aria-labelledby={labelledBy}
          tabIndex={-1}
          className={panelClassName}
          onClick={e => e.stopPropagation()}
        >
          {children}
        </div>
      </div>
    </OverlayPortal>
  );
}

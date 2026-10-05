import { useEffect, useLayoutEffect, useRef, type ReactNode } from 'react';
import {
  applyDialogKey,
  dialogFocusableControls,
  dialogFocusPlan,
  dialogStackEnter,
  dialogStackIsTop,
  dialogStackLeave,
} from '../../lib/dialogFocus';
import { OverlayPortal } from './OverlayPortal';

export function AppDialog({
  open,
  onClose,
  title,
  labelledBy,
  children,
  footer,
  className = '',
  panelClassName = '',
  escape = true,
  backdropClose = false,
  swipeDownClose = false,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  labelledBy?: string;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
  panelClassName?: string;
  escape?: boolean;
  backdropClose?: boolean;
  swipeDownClose?: boolean;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  const escapeRef = useRef(escape);
  const wasOpenRef = useRef(false);
  const openRef = useRef(open);
  const mountedRef = useRef(false);
  const stackTokenRef = useRef<symbol | null>(null);
  onCloseRef.current = onClose;
  escapeRef.current = escape;
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
    const moveFocus = () => {
      const panel = panelRef.current;
      if (!panel) return;
      const nodes = dialogFocusableControls(panel);
      (nodes[0] ?? panel).focus();
    };
    moveFocus();
    const rid = window.requestAnimationFrame(() => {
      window.requestAnimationFrame(moveFocus);
    });
    const tid = window.setTimeout(moveFocus, 0);
    return () => {
      window.cancelAnimationFrame(rid);
      window.clearTimeout(tid);
      // Render already stored the next open flag. A close must keep wasOpen
      // so the next run restores focus. A strict-mode rerun while still open
      // must forget it so focus runs again.
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
    const token = dialogStackEnter();
    stackTokenRef.current = token;
    return () => {
      dialogStackLeave(token);
      if (stackTokenRef.current === token) stackTokenRef.current = null;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      const token = stackTokenRef.current;
      if (token && !dialogStackIsTop(token)) return;
      applyDialogKey(e, panelRef.current, () => onCloseRef.current(), escapeRef.current);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  useEffect(() => {
    if (!open || !swipeDownClose) return;
    const panel = panelRef.current;
    if (!panel) return;
    let startY = 0;
    let tracking = false;
    const onDown = (e: PointerEvent) => {
      const scroll = panel.querySelector('.hub-editor-dialog-scroll') as HTMLElement | null;
      if (scroll && scroll.scrollTop > 0) return;
      startY = e.clientY;
      tracking = true;
    };
    const onUp = (e: PointerEvent) => {
      if (!tracking) return;
      tracking = false;
      if (e.clientY - startY >= 72) onCloseRef.current();
    };
    const end = () => { tracking = false; };
    panel.addEventListener('pointerdown', onDown);
    panel.addEventListener('pointerup', onUp);
    panel.addEventListener('pointercancel', end);
    return () => {
      panel.removeEventListener('pointerdown', onDown);
      panel.removeEventListener('pointerup', onUp);
      panel.removeEventListener('pointercancel', end);
    };
  }, [open, swipeDownClose]);

  if (!open) return null;

  return (
    <OverlayPortal>
      <div
        className={`overlay-backdrop ${className}`.trim()}
        onClick={backdropClose ? () => onCloseRef.current() : undefined}
      >
        <div
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-label={labelledBy ? undefined : title}
          aria-labelledby={labelledBy}
          tabIndex={-1}
          className={panelClassName}
          data-swipe-down={swipeDownClose ? '1' : undefined}
          onClick={e => e.stopPropagation()}
        >
          {footer ? (
            <>
              <div className="hub-editor-dialog-scroll">{children}</div>
              {footer}
            </>
          ) : children}
        </div>
      </div>
    </OverlayPortal>
  );
}

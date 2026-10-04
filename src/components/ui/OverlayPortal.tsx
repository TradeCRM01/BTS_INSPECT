import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { lockDialogScroll, unlockDialogScroll } from '../../lib/dialogFocus';

/**
 * Renders overlay UI on document.body so AppShell transforms / overflow
 * cannot trap position:fixed dialogs in the scrolling main pane.
 */
export function OverlayPortal({ children }: { children: ReactNode }) {
  useEffect(() => {
    lockDialogScroll();
    return () => unlockDialogScroll();
  }, []);

  return createPortal(children, document.body);
}

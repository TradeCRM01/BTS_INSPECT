import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

/**
 * Renders overlay UI on document.body so AppShell transforms / overflow
 * cannot trap position:fixed dialogs in the scrolling main pane.
 */
export function OverlayPortal({ children }: { children: ReactNode }) {
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  return createPortal(children, document.body);
}

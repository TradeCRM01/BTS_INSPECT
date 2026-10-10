import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocation } from 'react-router-dom';
import {
  clearJobInvoiceCreateHold,
  jobInvoiceCreateHoldActive,
  jobInvoiceCreateHoldPath,
  jobInvoiceCreateHoldUntil,
  subscribeJobInvoiceCreateHold,
} from '../../lib/jobInvoiceCreateHold';

export function JobInvoiceCreateHoldOverlay() {
  const { pathname } = useLocation();
  const scoped = jobInvoiceCreateHoldPath(pathname);
  const [on, setOn] = useState(() => jobInvoiceCreateHoldActive());

  useEffect(() => {
    let timer = 0;
    const sync = () => {
      setOn(jobInvoiceCreateHoldActive());
      if (timer) window.clearTimeout(timer);
      const until = jobInvoiceCreateHoldUntil();
      timer = until > 0 ? window.setTimeout(sync, Math.max(0, until - Date.now())) : 0;
    };
    const unsub = subscribeJobInvoiceCreateHold(sync);
    sync();
    return () => {
      unsub();
      if (timer) window.clearTimeout(timer);
    };
  }, []);

  useEffect(() => {
    if (!scoped && jobInvoiceCreateHoldActive()) clearJobInvoiceCreateHold();
  }, [scoped]);

  if (!on || !scoped) return null;
  return createPortal(
    <div className="job-invoice-create-hold" data-job-invoice-create-hold="1" role="status" aria-live="polite">
      <p className="job-invoice-create-hold-cue">Creating invoice…</p>
    </div>,
    document.body,
  );
}

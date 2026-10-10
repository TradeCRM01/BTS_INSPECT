import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  jobInvoiceCreateHoldActive,
  subscribeJobInvoiceCreateHold,
} from '../../lib/jobInvoiceCreateHold';

export function JobInvoiceCreateHoldOverlay() {
  const [on, setOn] = useState(() => jobInvoiceCreateHoldActive());

  useEffect(() => {
    const sync = () => setOn(jobInvoiceCreateHoldActive());
    const unsub = subscribeJobInvoiceCreateHold(sync);
    const id = window.setInterval(sync, 50);
    return () => {
      unsub();
      window.clearInterval(id);
    };
  }, []);

  if (!on) return null;
  return createPortal(
    <div className="job-invoice-create-hold" data-job-invoice-create-hold="1" aria-hidden />,
    document.body,
  );
}

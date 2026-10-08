import { X } from 'lucide-react';
import { AppDialog } from '../ui/AppDialog';
import { JOB_BILL_ADD_LOGGED_HOURS_EXTRA_LABEL } from '../../lib/jobBillInvoicePlan';

export function JobBillQuotedInvoiceSheet({
  open,
  loggedHoursNote,
  addLoggedHoursExtra,
  onAddLoggedHoursExtraChange,
  onClose,
  onCreate,
  pending,
}: {
  open: boolean;
  loggedHoursNote: string | null;
  addLoggedHoursExtra: boolean;
  onAddLoggedHoursExtraChange: (checked: boolean) => void;
  onClose: () => void;
  onCreate: () => void;
  pending?: boolean;
}) {
  if (!open) return null;

  return (
    <AppDialog
      open={open}
      onClose={onClose}
      className="hub-labour-rate-backdrop"
      panelClassName="overlay-panel-sm hub-labour-rate-sheet hub-job-bill-quoted-invoice-sheet"
      backdropClose
      swipeDownClose
    >
      <div className="hub-labour-rate-sheet-head">
        <h2 className="hub-labour-rate-sheet-title">Invoice from job</h2>
        <button type="button" className="hub-labour-rate-sheet-close" onClick={onClose} aria-label="Close">
          <X size={20} />
        </button>
      </div>
      <div className="hub-job-bill-quoted-invoice-body">
        {loggedHoursNote ? (
          <p className="hub-job-bill-quoted-invoice-note" role="status">{loggedHoursNote}</p>
        ) : null}
        <label className="hub-job-bill-quoted-invoice-opt">
          <input
            type="checkbox"
            checked={addLoggedHoursExtra}
            onChange={e => onAddLoggedHoursExtraChange(e.target.checked)}
          />
          <span>{JOB_BILL_ADD_LOGGED_HOURS_EXTRA_LABEL}</span>
        </label>
        <button
          type="button"
          className="hub-job-bill-zero-labour-primary hub-job-bill-quoted-invoice-create"
          disabled={pending}
          onClick={onCreate}
        >
          {pending ? 'Creating…' : 'Create draft invoice'}
        </button>
      </div>
    </AppDialog>
  );
}

import { AlertTriangle, X } from 'lucide-react';
import { AppDialog } from '../ui/AppDialog';
import { JOB_BILL_ADD_LOGGED_HOURS_EXTRA_LABEL } from '../../lib/jobBillInvoicePlan';
import { zeroLabourInvoiceConfirmMessage } from '../../lib/hoursToJobBill';

export function JobBillQuotedInvoiceSheet({
  open,
  loggedHoursNote,
  moneyLine,
  addLoggedHoursExtra,
  onAddLoggedHoursExtraChange,
  onClose,
  onCreate,
  pending,
  unpricedExtraLabour,
}: {
  open: boolean;
  loggedHoursNote: string | null;
  moneyLine: string;
  addLoggedHoursExtra: boolean;
  onAddLoggedHoursExtraChange: (checked: boolean) => void;
  onClose: () => void;
  onCreate: () => void;
  pending?: boolean;
  unpricedExtraLabour?: boolean;
}) {
  if (!open) return null;

  return (
    <AppDialog
      open={open}
      onClose={onClose}
      className="hub-labour-rate-backdrop"
      panelClassName="overlay-panel-sm hub-labour-rate-sheet hub-job-bill-zero-labour-sheet"
      backdropClose
      swipeDownClose
    >
      <div className="hub-labour-rate-sheet-head">
        <h2 className="hub-labour-rate-sheet-title">Invoice from job</h2>
        <button type="button" className="hub-labour-rate-sheet-close" onClick={onClose} aria-label="Close">
          <X size={20} />
        </button>
      </div>
      <div className="hub-job-bill-zero-labour-body">
        {loggedHoursNote ? (
          <div className="hub-job-bill-quoted-invoice-note-card" role="status">
            <p className="hub-job-bill-quoted-invoice-note">{loggedHoursNote}</p>
          </div>
        ) : null}
        {moneyLine ? (
          <p className="hub-labour-rate-sheet-rate" data-job-bill-quoted-invoice-money>{moneyLine}</p>
        ) : null}
        {unpricedExtraLabour ? (
          <div className="hub-job-bill-zero-labour-nudge" role="status" data-job-bill-quoted-unpriced-warning>
            <div className="hub-job-bill-zero-labour-nudge-row">
              <AlertTriangle size={20} className="hub-job-bill-zero-labour-icon" aria-hidden />
              <p className="hub-job-bill-zero-labour-message">{zeroLabourInvoiceConfirmMessage(1)}</p>
            </div>
          </div>
        ) : null}
        <label className="hub-ops-form-check">
          <input
            type="checkbox"
            checked={addLoggedHoursExtra}
            onChange={e => onAddLoggedHoursExtraChange(e.target.checked)}
          />
          <span>{JOB_BILL_ADD_LOGGED_HOURS_EXTRA_LABEL}</span>
        </label>
        <div className="hub-job-bill-zero-labour-actions">
          <button
            type="button"
            className="hub-job-bill-zero-labour-primary"
            disabled={pending}
            onClick={onCreate}
          >
            {pending ? 'Creating…' : 'Create draft invoice'}
          </button>
        </div>
      </div>
    </AppDialog>
  );
}

import { AlertTriangle, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import { AppDialog } from '../ui/AppDialog';
import { zeroLabourInvoiceWarningMessage } from '../../lib/hoursToJobBill';
import type { LabourSellResolution } from '../../lib/hoursToJobBill';

export function JobBillZeroLabourConfirmSheet({
  open,
  count,
  labourSell,
  onClose,
  onCreateAnyway,
}: {
  open: boolean;
  count: number;
  labourSell?: LabourSellResolution | null;
  onClose: () => void;
  onCreateAnyway: () => void;
}) {
  if (count <= 0) return null;
  const message = zeroLabourInvoiceWarningMessage(count, labourSell);

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
        <h2 className="hub-labour-rate-sheet-title">Labour rate missing</h2>
        <button type="button" className="hub-labour-rate-sheet-close" onClick={onClose} aria-label="Close">
          <X size={20} />
        </button>
      </div>
      <div className="hub-job-bill-zero-labour-body">
        <div className="hub-job-bill-zero-labour-nudge" role="status">
          <div className="hub-job-bill-zero-labour-nudge-row">
            <AlertTriangle size={20} className="hub-job-bill-zero-labour-icon" aria-hidden />
            <p className="hub-job-bill-zero-labour-message">{message}</p>
          </div>
          <div className="hub-job-bill-zero-labour-actions">
            <Link
              to="/settings/company"
              className="hub-job-bill-zero-labour-primary"
              onClick={onClose}
            >
              Add a rate
            </Link>
            <button
              type="button"
              className="hub-job-bill-zero-labour-secondary"
              onClick={onCreateAnyway}
            >
              Create anyway
            </button>
          </div>
        </div>
      </div>
    </AppDialog>
  );
}

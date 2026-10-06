import { X } from 'lucide-react';
import { AppDialog } from '../ui/AppDialog';
import { formatMoney } from '../../types/fsm';
import { formatLabourPickerTitle, type PriceBookItemForLabour } from '../../lib/hoursToJobBill';

export function LabourRatePickerSheet({
  open,
  hours,
  items,
  onClose,
  onPick,
}: {
  open: boolean;
  hours: number;
  items: PriceBookItemForLabour[];
  onClose: () => void;
  onPick: (itemId: string) => void;
}) {
  return (
    <AppDialog
      open={open}
      onClose={onClose}
      title={formatLabourPickerTitle(hours)}
      className="hub-labour-rate-backdrop"
      panelClassName="overlay-panel-sm hub-labour-rate-sheet"
      backdropClose
      swipeDownClose
    >
      <div className="hub-labour-rate-sheet-head">
        <h2 className="hub-labour-rate-sheet-title">{formatLabourPickerTitle(hours)}</h2>
        <button type="button" className="hub-labour-rate-sheet-close" onClick={onClose} aria-label="Close">
          <X size={20} />
        </button>
      </div>
      <ul className="hub-labour-rate-sheet-list">
        {items.map(item => {
          const label = (item.description ?? 'Labour').trim();
          const rate = formatMoney(Number(item.unit_price) || 0);
          return (
            <li key={item.id}>
              <button
                type="button"
                className="hub-labour-rate-sheet-row"
                onClick={() => onPick(item.id)}
              >
                <span className="hub-labour-rate-sheet-desc">{label}</span>
                <span className="hub-labour-rate-sheet-rate">{rate}/h</span>
              </button>
            </li>
          );
        })}
      </ul>
    </AppDialog>
  );
}

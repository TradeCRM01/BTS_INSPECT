import { formatMoney } from '../../types/fsm';
import { gstLabel } from '../../lib/gst';

export function DocumentGstTotals({
  subtotal,
  taxRate,
  taxAmount,
  total,
}: {
  subtotal: number;
  taxRate: number;
  taxAmount: number;
  total: number;
}) {
  return (
    <div className="flex justify-end">
      <div className="w-64 space-y-1.5 text-sm">
        <div className="flex justify-between text-[#4A5568]">
          <span>Subtotal (ex GST)</span>
          <span>{formatMoney(subtotal)}</span>
        </div>
        <div className="flex justify-between text-[#4A5568]">
          <span>{gstLabel(taxRate)}</span>
          <span>{formatMoney(taxAmount)}</span>
        </div>
        <div className="flex justify-between font-semibold text-[#1A1A1A] border-t border-[#E5E7EB] pt-1.5">
          <span>Total (inc GST)</span>
          <span>{formatMoney(total)}</span>
        </div>
      </div>
    </div>
  );
}

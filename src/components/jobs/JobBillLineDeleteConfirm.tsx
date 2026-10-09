import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ConfirmDialog, useToast } from '../ui';
import { supabase } from '../../lib/supabase';
import { isDevFieldAuditAuth } from '../../lib/devFieldAuditAuth';
import { getAuditJobBillCosts, hideAuditJobBillLine } from '../../lib/devFieldAuditDocs';
import { invalidateJobBillInvoicePreview } from '../../lib/jobBillInvoicePreviewQuery';

/** Same ConfirmDialog layering as TimesheetEntryDeleteControl — dialog is a portal sibling, not nested in bill chrome. */
export function JobBillLineDeleteConfirm({
  lineId,
  jobId,
  onClose,
}: {
  lineId: string | null;
  jobId: string;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const { showToast } = useToast();

  const deleteCost = useMutation({
    mutationFn: async (id: string) => {
      if (isDevFieldAuditAuth() && getAuditJobBillCosts()) {
        hideAuditJobBillLine(id);
        return;
      }
      const { error } = await supabase.from('job_costs').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      onClose();
      showToast('Line removed');
      queryClient.invalidateQueries({ queryKey: ['job-costs', jobId] });
      queryClient.invalidateQueries({ queryKey: ['job-cost-totals', jobId] });
      invalidateJobBillInvoicePreview(queryClient, jobId);
    },
    onError: (e: Error) => {
      showToast(e.message, 'error');
    },
  });

  return (
    <ConfirmDialog
      open={lineId !== null}
      title="Delete this line?"
      message="Delete this line?"
      confirmLabel="Delete"
      onConfirm={() => {
        if (lineId) deleteCost.mutate(lineId);
      }}
      onCancel={onClose}
      confirmDisabled={deleteCost.isPending}
    />
  );
}

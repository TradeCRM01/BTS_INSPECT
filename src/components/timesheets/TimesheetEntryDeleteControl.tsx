import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { ConfirmDialog, useToast } from '../ui';
import {
  deleteUnbilledTimesheetEntry,
  timesheetEntryDeleteUiState,
  type TimesheetEntryDeleteGate,
} from '../../lib/timesheetEntryDelete';
import { invalidateJobBillInvoicePreview } from '../../lib/jobBillInvoicePreviewQuery';

export type TimesheetEntryDeleteRow = {
  id: string;
  timesheet_id: string;
  job_id?: string | null;
  start_time: string;
  end_time: string | null;
};

export function TimesheetEntryDeleteControl({
  entry,
  billedGate,
  onDeleted,
}: {
  entry: TimesheetEntryDeleteRow;
  billedGate: TimesheetEntryDeleteGate;
  onDeleted?: () => void;
}) {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const ui = timesheetEntryDeleteUiState(entry, billedGate);

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const block = timesheetEntryDeleteUiState(entry, billedGate);
      if (block.disabled) {
        throw new Error(block.lockMessage ?? 'Cannot delete this entry.');
      }
      await deleteUnbilledTimesheetEntry(supabase, entry);
      if (entry.job_id) invalidateJobBillInvoicePreview(queryClient, entry.job_id);
    },
    onSuccess: () => {
      setConfirmOpen(false);
      queryClient.invalidateQueries({ queryKey: ['timesheet-entries'] });
      queryClient.invalidateQueries({ queryKey: ['timesheets'] });
      queryClient.invalidateQueries({ queryKey: ['job-timesheets'] });
      queryClient.invalidateQueries({ queryKey: ['billed-timesheet-entry-ids'] });
      showToast('Time entry removed');
      onDeleted?.();
    },
    onError: (e: Error) => showToast(e.message, 'error'),
  });

  return (
    <>
      <div className="hub-timesheets-entry-delete">
        <button
          type="button"
          className="hub-timesheets-delete-btn"
          disabled={ui.disabled || deleteMutation.isPending}
          onClick={() => {
            if (ui.disabled) return;
            setConfirmOpen(true);
          }}
        >
          Delete
        </button>
        {ui.lockMessage ? <p className="hub-timesheets-delete-lock" role="status">{ui.lockMessage}</p> : null}
      </div>
      <ConfirmDialog
        open={confirmOpen}
        title="Delete time entry?"
        message="Delete this time entry?"
        confirmLabel="Delete"
        onConfirm={() => deleteMutation.mutate()}
        onCancel={() => setConfirmOpen(false)}
      />
    </>
  );
}

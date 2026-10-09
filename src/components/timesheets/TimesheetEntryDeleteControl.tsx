import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { ConfirmDialog, useToast } from '../ui';
import {
  deleteUnbilledTimesheetEntry,
  timesheetEntryDeleteBlockedReason,
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
  billedEntryIds,
  timesheetTotalMinutes,
  onDeleted,
}: {
  entry: TimesheetEntryDeleteRow;
  billedEntryIds: ReadonlySet<string>;
  timesheetTotalMinutes: number;
  onDeleted?: () => void;
}) {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const blocked = timesheetEntryDeleteBlockedReason(entry.id, billedEntryIds);

  const deleteMutation = useMutation({
    mutationFn: async () => {
      if (blocked) throw new Error(blocked);
      await deleteUnbilledTimesheetEntry(supabase, entry, timesheetTotalMinutes);
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
          disabled={!!blocked || deleteMutation.isPending}
          onClick={() => {
            if (blocked) return;
            setConfirmOpen(true);
          }}
        >
          Delete
        </button>
        {blocked ? <p className="hub-timesheets-delete-lock" role="status">{blocked}</p> : null}
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

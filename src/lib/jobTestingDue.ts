import {
  decorateInspectionList,
  sortInspectionListFloor,
  type InspectionListRow,
} from './inspectionsList';
import {
  inspectionTemplateName,
  isArchivedInspection,
  type DueInspection,
  type DueInspectionJob,
} from './inspectionDueReminder';

/** Job-sheet tray — due / overdue tests on this job, not a new reminders module. */
export const JOB_TESTING_DUE_TITLE = 'Testing due';

/** Honest empty — this job has no test due or overdue. */
export const JOB_TESTING_DUE_EMPTY = 'Nothing due on this job.';

export type JobTestingDueKind = 'overdue' | 'today';

export type JobTestingDueRow = {
  id: string;
  title: string;
  dueOn: string;
  dueKind: JobTestingDueKind;
  dueLabel: string;
  href: string;
};

export function jobTestingDueEmptyTitle(): string {
  return JOB_TESTING_DUE_EMPTY;
}

/** Existing fill sheet — not a new testing route. */
export function jobTestingDueHref(inspectionId: string): string {
  return `/inspections/${encodeURIComponent(inspectionId)}`;
}

function asListRow(
  inspection: DueInspection,
  job: DueInspectionJob,
): InspectionListRow {
  return {
    id: inspection.id,
    status: inspection.status,
    archived: inspection.archived,
    meta: inspection.meta,
    responses: inspection.responses,
    template_snapshot: inspection.template_snapshot,
    crm_job_id: inspection.crm_job_id ?? job.id,
    due_on: inspection.due_on,
    started_at: inspection.started_at,
    completed_at: inspection.completed_at,
    job_title: job.title,
    job_address: job.address,
    job_number: job.job_number,
    job_company_id: job.company_id,
    job_client_id: job.client_id,
    job_scheduled_date: job.scheduled_date,
  };
}

/**
 * Due today or overdue on this job. Upcoming and done-with-no-date stay off.
 * Reuses resolveInspectionDueDate via decorateInspectionList — no invented interval.
 */
export function jobTestingDueRows(
  inspections: DueInspection[] | null | undefined,
  job: DueInspectionJob,
  now = new Date(),
): JobTestingDueRow[] {
  const rows = (inspections ?? []).filter(row => !isArchivedInspection(row));
  return sortInspectionListFloor(decorateInspectionList(
    rows.map(row => asListRow(row, job)),
    now,
  ))
    .filter(item => item.bucket === 'due' && item.dueOn && item.dueLabel)
    .filter((item): item is typeof item & { dueKind: JobTestingDueKind } => (
      item.dueKind === 'overdue' || item.dueKind === 'today'
    ))
    .map(item => ({
      id: item.row.id,
      title: inspectionTemplateName(item.row.template_snapshot),
      dueOn: item.dueOn!,
      dueKind: item.dueKind,
      dueLabel: item.dueLabel!,
      href: jobTestingDueHref(item.row.id),
    }));
}

/**
 * `/inspections/new?jobId=` is historically a parent *inspection* id.
 * The job hub (and JHA) use `jobId` as `jobs.id`. Resolve without writing a
 * CRM job UUID into `parent_inspection_id`.
 */
export type InspectionLaunch = {
  parentInspectionId: string | null;
  /** `inspections.crm_job_id` — the CRM jobs.id UUID, never job_number. */
  crmJobId: string | null;
};

export function resolveInspectionLaunch(args: {
  jobIdParam: string | null;
  crmJobIdParam: string | null;
  /** Inspection row if `jobId` matched inspections.id; null if looked up and missing; undefined if not yet known. */
  parentInspection: { id: string; crm_job_id?: string | null } | null | undefined;
}): InspectionLaunch {
  const crmExplicit = args.crmJobIdParam || null;
  if (args.parentInspection) {
    return {
      parentInspectionId: args.parentInspection.id,
      crmJobId: crmExplicit || args.parentInspection.crm_job_id || null,
    };
  }
  if (args.jobIdParam && args.parentInspection === null) {
    return {
      parentInspectionId: null,
      crmJobId: crmExplicit || args.jobIdParam,
    };
  }
  return {
    parentInspectionId: null,
    crmJobId: crmExplicit,
  };
}

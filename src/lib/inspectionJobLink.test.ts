import { describe, expect, it } from 'vitest';
import { resolveInspectionLaunch } from './inspectionJobLink';

const JOB = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const INSPECTION = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

describe('resolveInspectionLaunch', () => {
  it('treats jobId as a parent inspection when that row exists', () => {
    expect(resolveInspectionLaunch({
      jobIdParam: INSPECTION,
      crmJobIdParam: null,
      parentInspection: { id: INSPECTION, crm_job_id: JOB },
    })).toEqual({
      parentInspectionId: INSPECTION,
      crmJobId: JOB,
    });
  });

  it('treats jobId as jobs.id when it is not an inspection', () => {
    expect(resolveInspectionLaunch({
      jobIdParam: JOB,
      crmJobIdParam: null,
      parentInspection: null,
    })).toEqual({
      parentInspectionId: null,
      crmJobId: JOB,
    });
  });

  it('does not treat jobId as a CRM job while the inspection lookup is in flight', () => {
    expect(resolveInspectionLaunch({
      jobIdParam: JOB,
      crmJobIdParam: null,
      parentInspection: undefined,
    })).toEqual({
      parentInspectionId: null,
      crmJobId: null,
    });
  });

  it('keeps explicit crmJobId even when adding under a parent inspection', () => {
    expect(resolveInspectionLaunch({
      jobIdParam: INSPECTION,
      crmJobIdParam: JOB,
      parentInspection: { id: INSPECTION, crm_job_id: null },
    })).toEqual({
      parentInspectionId: INSPECTION,
      crmJobId: JOB,
    });
  });

  it('uses crmJobId when that is the only param', () => {
    expect(resolveInspectionLaunch({
      jobIdParam: null,
      crmJobIdParam: JOB,
      parentInspection: undefined,
    })).toEqual({
      parentInspectionId: null,
      crmJobId: JOB,
    });
  });
});

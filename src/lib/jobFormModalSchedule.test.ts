import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function src(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8');
}

describe('JobFormModal schedule status (A1)', () => {
  const form = src('src/components/crm/JobFormModal.tsx');

  it('derives crew/schedule status instead of a Scheduled pick', () => {
    expect(form).toContain('jobCrewScheduleStatus');
    expect(form).toContain('data-job-form-schedule-status');
    expect(form).toContain('hub-job-form-status-pill');
    expect(form).not.toContain('JOB_STATUS_LABELS');
    expect(form).not.toMatch(/<select[^>]*value=\{form\.status\}/);
    expect(form).toContain("payload.status = job?.status ?? 'scheduled'");
    expect(form).toContain("scheduled_date: job?.scheduled_date ?? presetDate ?? ''");
    expect(form).toContain('getAuditTeamMembers');
    expect(form).toContain('hub-job-form-crew');
    expect(form).toContain('hub-job-form-crew-chip');
  });

  it('orders client before title and keeps schedule before budget fields', () => {
    const clientIdx = form.indexOf('Existing client');
    const titleIdx = form.indexOf('Job Title');
    const addressIdx = form.indexOf('Job Site Address');
    const statusIdx = form.indexOf('hub-job-form-schedule-status');
    const priorityIdx = form.indexOf('>Priority</');
    expect(clientIdx).toBeGreaterThan(-1);
    expect(titleIdx).toBeGreaterThan(clientIdx);
    expect(addressIdx).toBeGreaterThan(titleIdx);
    expect(statusIdx).toBeGreaterThan(addressIdx);
    expect(priorityIdx).toBeGreaterThan(statusIdx);
  });
});

describe('Time entry form sheet (A1 restyle)', () => {
  const form = src('src/components/timesheets/TimeEntryForm.tsx');

  it('uses ops form sheet tokens and keeps duration chip behaviour', () => {
    expect(form).toContain('hub-ops-form-sheet');
    expect(form).toContain('hub-time-entry-chips');
    expect(form).toContain('TIME_ENTRY_DURATION_CHIP_HOURS');
    expect(form).toContain("work_type: blankTimesOnOpen ? 'Labour' : ''");
    expect(form).toContain('hub-ops-form-check');
    expect(form).toContain('ops-field-label');
  });
});

describe('Job detail crew tap copy (A2)', () => {
  it('drops drag/drop wording from schedule crew helper surfaces', () => {
    const panel = src('src/components/jobs/JobDispatchPanel.tsx');
    expect(panel.toLowerCase()).not.toMatch(/drag|drop/);
    expect(panel).toContain('Tap a name below');
    expect(src('src/lib/jobDispatchCrew.ts')).toContain('Tap a name to put them on this job.');
  });
});

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('persistLivingJobOnBoundJhas inspection sync', () => {
  it('updates bound inspections on the same living persist — no new table, no responses write', () => {
    const src = readFileSync(resolve(process.cwd(), 'src/lib/persistLivingJobJha.ts'), 'utf8');
    expect(src).toContain('livingInspectionPatches');
    expect(src).toContain("from('inspections')");
    expect(src).toContain('crm_job_id');
    expect(src).toContain('client_id');
    expect(src).toContain("from('jobs')");
    expect(src).not.toContain('responses');
    expect(src).not.toContain('stop_think');
    expect(src).not.toContain('create table');
  });
});

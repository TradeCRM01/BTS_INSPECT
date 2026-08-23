import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function src(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8');
}

describe('contract service job client path', () => {
  it('creates a job from the contract page; does not send, restyle, or invent a function', () => {
    const lib = src('src/lib/createContractServiceJob.ts');
    const page = src('src/pages/ContractsPage.tsx');
    const edge = src('supabase/functions/job-reminder/index.ts');

    expect(lib).toContain('createContractServiceJob');
    expect(lib).toContain("from('jobs')");
    expect(lib).toContain("from('service_contracts')");
    expect(lib).toContain('next_service_date');
    expect(lib).toContain('last_service_date');
    expect(lib).toContain("eq('next_service_date', decided.dueOn)");
    expect(lib).toContain('budget: null');
    expect(lib).not.toContain("invoke(");
    expect(lib).not.toContain('job-reminder');
    expect(lib).not.toContain('send-contract');
    expect(lib).not.toContain('mailto:');
    expect(lib).not.toContain('api.resend.com');
    expect(lib).not.toContain('Manrope');
    expect(lib).not.toContain('Relovi');
    expect(lib).not.toContain('Littleloop');
    expect(lib).not.toContain('report_theme');

    expect(page).toContain('createContractServiceJob');
    expect(page).toContain('Create job');
    expect(page).toContain('Create due jobs');
    expect(page).toContain('auto_generate_jobs');
    expect(page).toContain('contractDueBucket');
    expect(page).not.toContain('isPast(parseISO');
    expect(page).not.toContain("invoke('job-reminder'");
    expect(page).not.toContain('send-contract');
    expect(page).not.toContain('mailto:');
    expect(page).not.toContain('Manrope');
    expect(page).not.toContain('Relovi');
    expect(page).not.toContain('Littleloop');
    expect(page).not.toContain('report_theme');
    expect(page).not.toContain('OpsDocHead');

    expect(edge).not.toContain('createContractServiceJob');
  });
});

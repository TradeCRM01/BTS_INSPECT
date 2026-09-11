import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function src(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8');
}

describe('job_photos schema', () => {
  it('locks a company-scoped table with job and visit-note FKs, and no storage change', () => {
    const mig = src('supabase/migrations/20260911050000_077_job_photos.sql');
    const db = src('src/types/database.ts');
    expect(mig).toContain('CREATE TABLE IF NOT EXISTS public.job_photos');
    expect(mig).toContain('job_id uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE');
    expect(mig).toContain('visit_note_id uuid REFERENCES public.job_visit_notes(id) ON DELETE SET NULL');
    expect(mig).toContain('company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE');
    expect(mig).toContain('FOR SELECT');
    expect(mig).toContain('FOR INSERT');
    expect(mig).toContain('FOR DELETE');
    expect(mig).not.toContain('FOR UPDATE');
    expect(mig).not.toContain('my_company_id');
    expect(mig).not.toContain('storage.buckets');
    expect(mig).not.toMatch(/Relovi|Littleloop/);
    expect(mig).not.toMatch(/\bute\b/i);
    expect(mig).toContain('GRANT SELECT, INSERT, DELETE ON public.job_photos TO authenticated');
    expect(db).toContain('job_photos: AnyTable');
  });
});

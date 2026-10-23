import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { JOB_STATUS_LABELS } from './crm';

describe('job status copy', () => {
  it("kills crm.ts:64 Completed and keeps the finished label as Done", () => {
    expect(JOB_STATUS_LABELS.completed).toBe('Done');
    const src = readFileSync(resolve(process.cwd(), 'src/types/crm.ts'), 'utf8');
    expect(src).toMatch(/completed:\s*'Done'/);
    expect(src).not.toMatch(/completed:\s*'Completed'/);
  });
});

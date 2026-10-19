import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('job-reminder gateway JWT', () => {
  it('keeps verify_jwt true so cron must send a JWT', () => {
    const toml = readFileSync(resolve(process.cwd(), 'supabase/functions/job-reminder/config.toml'), 'utf8');
    expect(toml).toMatch(/^verify_jwt = true$/m);
    expect(toml).not.toMatch(/verify_jwt\s*=\s*false/);
  });
});

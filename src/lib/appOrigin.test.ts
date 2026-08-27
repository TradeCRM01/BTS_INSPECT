import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { LEGACY_APP_ORIGIN, PUBLIC_APP_ORIGIN } from './appOrigin';

function src(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8');
}

describe('public app origin', () => {
  it('uses grafter.com.au in the product and keeps pages.dev as a fallback host', () => {
    expect(PUBLIC_APP_ORIGIN).toBe('https://grafter.com.au');
    expect(LEGACY_APP_ORIGIN).toBe('https://bts-inspect.pages.dev');
    expect(src('src/pages/TeamSettingsPage.tsx')).toContain('PUBLIC_APP_ORIGIN');
    expect(src('supabase/config.toml')).toContain('https://grafter.com.au');
    expect(src('supabase/config.toml')).toContain('https://bts-inspect.pages.dev');
    expect(src('supabase/functions/invite-user/index.ts')).toContain('https://grafter.com.au');
    expect(src('supabase/functions/job-reminder/index.ts')).toContain('https://grafter.com.au');
  });
});

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT_CONFIG = resolve(process.cwd(), 'supabase/config.toml');

function functionVerifyJwt(toml: string, slug: string): boolean | undefined {
  const escaped = slug.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const block = toml.match(
    new RegExp(`(?:^|\\n)\\[functions\\.${escaped}\\]\\n([\\s\\S]*?)(?=\\n\\[|$)`),
  );
  if (!block) return undefined;
  const line = block[1].match(/^\s*verify_jwt\s*=\s*(true|false)\s*$/m);
  if (!line) return undefined;
  return line[1] === 'true';
}

describe('edge function gateway JWT (root config)', () => {
  it('sets [functions.stripe-webhook] verify_jwt = false in root supabase/config.toml', () => {
    const toml = readFileSync(ROOT_CONFIG, 'utf8');
    expect(functionVerifyJwt(toml, 'stripe-webhook')).toBe(false);
  });

  it('sets [functions.client-portal] verify_jwt = false in root supabase/config.toml', () => {
    const toml = readFileSync(ROOT_CONFIG, 'utf8');
    expect(functionVerifyJwt(toml, 'client-portal')).toBe(false);
  });

  it('sets [functions.job-reminder] verify_jwt = true in root supabase/config.toml', () => {
    const toml = readFileSync(ROOT_CONFIG, 'utf8');
    expect(functionVerifyJwt(toml, 'job-reminder')).toBe(true);
  });

  it('does not keep supabase/functions/*/config.toml', () => {
    const functionsDir = resolve(process.cwd(), 'supabase/functions');
    const leftovers = readdirSync(functionsDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => `supabase/functions/${entry.name}/config.toml`)
      .filter((rel) => existsSync(resolve(process.cwd(), rel)));
    expect(leftovers).toEqual([]);
  });
});

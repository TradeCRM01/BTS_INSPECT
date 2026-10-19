import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('stripe-webhook gateway JWT', () => {
  it('keeps verify_jwt false so Stripe webhooks are not 401 at the gateway', () => {
    const toml = readFileSync(resolve(process.cwd(), 'supabase/functions/stripe-webhook/config.toml'), 'utf8');
    expect(toml).toMatch(/^verify_jwt = false$/m);
    expect(toml).not.toMatch(/verify_jwt\s*=\s*true/);
  });
});

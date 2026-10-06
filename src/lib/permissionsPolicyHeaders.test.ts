import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function src(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8');
}

describe('public/_headers Permissions-Policy', () => {
  it('allows microphone on same origin for Quick book voice', () => {
    const headers = src('public/_headers');
    expect(headers).not.toContain('microphone=()');
    expect(headers).toContain('microphone=(self)');
    expect(headers).not.toContain('camera=()');
    expect(headers).toContain('geolocation=(self)');
    expect(headers).toContain('payment=()');
  });
});

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function src(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8');
}

/** Cloudflare Pages _headers: path line then indented `Name: value` rows. */
export function parsePublicHeaderBlocks(headers: string): Map<string, string[]> {
  const blocks = new Map<string, string[]>();
  let current: string | null = null;
  let lines: string[] = [];
  for (const raw of headers.split('\n')) {
    if (/^\/\S*$/.test(raw)) {
      if (current) blocks.set(current, lines);
      current = raw;
      lines = [];
      continue;
    }
    if (current && /^\s+\S+:/.test(raw)) {
      lines.push(raw.trim());
    }
  }
  if (current) blocks.set(current, lines);
  return blocks;
}

function permissionsPolicyValue(block: string[]): string | null {
  const row = block.find(line => line.startsWith('Permissions-Policy:'));
  return row ? row.slice('Permissions-Policy:'.length).trim() : null;
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

  it('sets Permissions-Policy once on /* for every deep link', () => {
    const blocks = parsePublicHeaderBlocks(src('public/_headers'));
    const global = blocks.get('/*');
    expect(global, 'missing /* security block').toBeDefined();
    const policy = permissionsPolicyValue(global!);
    expect(policy).toContain('microphone=(self)');
    expect(policy).toContain('geolocation=(self)');
    expect(policy).not.toContain('camera=()');

    const repeats: string[] = [];
    for (const [path, lines] of blocks) {
      if (path === '/*') continue;
      if (lines.some(line => line.startsWith('Permissions-Policy:'))) {
        repeats.push(path);
      }
    }
    expect(repeats).toEqual([]);
  });
});

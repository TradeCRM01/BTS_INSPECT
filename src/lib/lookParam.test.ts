import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { lookParam, lookProofOn, lookWindowParam } from './lookParam';

describe('lookParam', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns the look value in DEV', () => {
    const params = new URLSearchParams('look=clients-list');
    expect(lookProofOn()).toBe(true);
    expect(lookParam(params)).toBe('clients-list');
  });

  it('returns a companion value through the same helper', () => {
    const params = new URLSearchParams('expenseNoAi=1&look=expense1-empty');
    expect(lookParam(params, 'expenseNoAi')).toBe('1');
    expect(lookParam(params)).toBe('expense1-empty');
  });

  it('returns null for a missing key and for a null search', () => {
    expect(lookParam(new URLSearchParams('tab=jha'))).toBeNull();
    expect(lookParam(null)).toBeNull();
    expect(lookParam(undefined, 'auditAuth')).toBeNull();
  });

  it('keeps an empty look string', () => {
    expect(lookParam(new URLSearchParams('look='))).toBe('');
  });

  it('reads window search through lookWindowParam', () => {
    const href = window.location.href;
    window.history.replaceState({}, '', '/expenses?look=expense1-empty&expenseNoAi=1');
    expect(lookWindowParam()).toBe('expense1-empty');
    expect(lookWindowParam('expenseNoAi')).toBe('1');
    window.history.replaceState({}, '', href);
  });

  it('spells the env gate so esbuild can substitute it', () => {
    const src = readFileSync(new URL('./lookParam.ts', import.meta.url), 'utf8');
    expect(src).toContain("import.meta.env.DEV || import.meta.env.VITE_LOOK_PROOF === '1'");
  });
});

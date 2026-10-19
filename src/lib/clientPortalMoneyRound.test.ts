import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function src(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8');
}

describe('client-portal edge moneyRound', () => {
  it('pins 1.5 × 87.35 at 131.03 on the edge line amount, not 131.02', () => {
    const edge = src('supabase/functions/client-portal/index.ts');
    expect(edge).toContain('Math.sign(x) * Math.round(Math.abs(x) * 100 + 1e-8) / 100');
    expect(edge).toContain('total_price: moneyRound(qty * unitPrice)');
    const fnSrc = edge.slice(edge.indexOf('function moneyRound'), edge.indexOf('function padQuoteNumber'));
    expect(fnSrc).toContain('function moneyRound');
    const moneyRound = new Function(
      'n',
      `${fnSrc.replace('function moneyRound(n: number): number', 'function moneyRound(n)')}\nreturn moneyRound(n);`,
    ) as (n: number) => number;
    expect(moneyRound(1.5 * 87.35)).toBe(131.03);
    expect(moneyRound(1.5 * 87.35)).not.toBe(131.02);
    expect(moneyRound(1.5 * 87.35)).not.toBe(Number((1.5 * 87.35).toFixed(2)));
  });
});

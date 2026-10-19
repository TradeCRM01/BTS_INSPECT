import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function src(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8');
}

function portalMoneyRound(): (n: number) => number {
  const edge = src('supabase/functions/client-portal/index.ts');
  const start = edge.indexOf('function moneyRound');
  const end = edge.indexOf('function padQuoteNumber');
  const fnSrc = edge.slice(start, end);
  return new Function(
    'n',
    `${fnSrc.replace('function moneyRound(n: number): number', 'function moneyRound(n)')}\nreturn moneyRound(n);`,
  ) as (n: number) => number;
}

function portalLineTotals(qty: number, unitCost: number, unitPrice: number) {
  const edge = src('supabase/functions/client-portal/index.ts');
  const moneyRound = portalMoneyRound();
  const costExpr = /total_cost:\s*([^,\n]+)/.exec(edge)?.[1];
  const priceExpr = /total_price:\s*([^,\n]+)/.exec(edge)?.[1];
  if (!costExpr || !priceExpr) throw new Error('client-portal job line totals not found');
  const total_cost = new Function('moneyRound', 'qty', 'unitCost', `return ${costExpr}`)(
    moneyRound,
    qty,
    unitCost,
  );
  const total_price = new Function('moneyRound', 'qty', 'unitPrice', `return ${priceExpr}`)(
    moneyRound,
    qty,
    unitPrice,
  );
  return { total_cost, total_price };
}

describe('client-portal edge moneyRound', () => {
  it('pins 1.5 × 87.35 at 131.03 on total_price and total_cost, not 131.02', () => {
    const moneyRound = portalMoneyRound();
    expect(moneyRound(1.5 * 87.35)).toBe(131.03);
    expect(moneyRound(1.5 * 87.35)).not.toBe(131.02);
    expect(moneyRound(1.5 * 87.35)).not.toBe(Number((1.5 * 87.35).toFixed(2)));

    const { total_cost, total_price } = portalLineTotals(1.5, 87.35, 87.35);
    expect(total_price).toBe(131.03);
    expect(total_cost).toBe(131.03);
    expect(total_price).not.toBe(131.02);
    expect(total_cost).not.toBe(131.02);
    expect(total_price).not.toBe(Number((1.5 * 87.35).toFixed(2)));
    expect(total_cost).not.toBe(Number((1.5 * 87.35).toFixed(2)));
  });
});

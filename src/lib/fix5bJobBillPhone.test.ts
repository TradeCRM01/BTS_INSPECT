/**
 * @vitest-environment jsdom
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function src(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8');
}

describe('FIX-5b C6 — phone job bill edit reachability', () => {
  it('does not hide the actions column on phone and uses 44px tap targets', () => {
    const css = src('src/index.css');
    const mobileBlock = css.match(/@media \(max-width: 639px\) \{[\s\S]*?#job-bill \.job-bill-line-btn[\s\S]*?\n  \}/);
    expect(mobileBlock).toBeTruthy();
    expect(css).toContain('#job-bill .job-bill-line-actions');
    expect(css).toContain('.job-bill-line-btn');
    expect(css).toContain('min-height: 44px');
    const hidesActions = css.includes('#job-bill .job-bill-lines-table th:nth-child(10)') &&
      css.includes('#job-bill .job-bill-lines-table td:nth-child(10)') &&
      /nth-child\(10\)[\s\S]{0,200}display:\s*none/.test(css);
    expect(hidesActions).toBe(false);
  });

  it('stacks labelled Qty, Unit, and Total under the description on phone', () => {
    const panel = src('src/components/jobs/JobCostingPanel.tsx');
    expect(panel).toContain('<dt>Qty</dt>');
    expect(panel).toContain('<dt>Unit</dt>');
    expect(panel).toContain('<dt>Total</dt>');
    const css = src('src/index.css');
    expect(css).toContain('.job-bill-line-phone-row dt');
    expect(css).toContain('#job-bill .job-bill-line-phone-stack');
  });

  it('asks before deleting a bill line', () => {
    const panel = src('src/components/jobs/JobCostingPanel.tsx');
    expect(panel).toContain('Delete this line?');
    expect(panel).toContain('confirmDisabled={deleteCost.isPending}');
    expect(panel).toContain("showToast(e.message, 'error')");
    expect(src('src/components/ui/Modal.tsx')).toContain('overlay-confirm-layer');
    expect(src('src/index.css')).toContain('z-index: 200');
  });
});

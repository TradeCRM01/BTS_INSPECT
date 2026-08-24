import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function src(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8');
}

describe('form fields fit their type', () => {
  it('does not pin .form-input to a height that clips 16px iOS type', () => {
    const css = src('src/index.css');
    const formInput = css.slice(css.indexOf('  .form-input {'), css.indexOf('  .form-input-sm {'));
    const formInputSm = css.slice(css.indexOf('  .form-input-sm {'), css.indexOf('  .form-label {'));
    expect(formInput).toContain('min-h-[44px]');
    expect(formInput).not.toMatch(/\bh-9\b/);
    expect(formInput).not.toMatch(/\bh-8\b/);
    expect(formInputSm).toContain('min-h-[44px]');
    expect(formInputSm).not.toMatch(/\bh-8\b/);
    expect(css).toContain('input:not([type="checkbox"])');
    expect(css).toContain('min-height: 44px');
    expect(css).toContain('.relative > button.absolute');
  });

  it('stacks invoice line items on a phone instead of a 980px clipped grid', () => {
    const editor = src('src/components/invoicing/LineItemEditor.tsx');
    expect(editor).toContain('grid-cols-2');
    expect(editor).toContain('col-span-2 sm:col-span-1');
    expect(editor).not.toContain('min-w-[980px]');
    expect(editor).toContain('hidden sm:grid');
  });

  it('keeps 24px email/phone chips from inheriting the 44px mobile min-height', () => {
    const css = src('src/index.css');
    const mobile = css.slice(css.lastIndexOf('@media (max-width: 768px)'));
    expect(mobile).toContain('.job-client-email .form-input-sm');
    expect(mobile).toMatch(/min-height:\s*24px\s*!important/);
  });

  it('stacks overlay form grids on a phone so fields are not half-width clipped', () => {
    const css = src('src/index.css');
    expect(css).toContain('@media (max-width: 640px)');
    expect(css).toContain('.overlay-panel .grid.grid-cols-2');
    expect(css).toContain('grid-template-columns: minmax(0, 1fr)');
  });

  it('does not pin remaining page fields to h-9', () => {
    expect(src('src/pages/SupplierDetailPage.tsx')).not.toMatch(/className="w-full h-9 /);
    expect(src('src/pages/AssetsPage.tsx')).not.toMatch(/className="h-9 px-3 text-sm border/);
    expect(src('src/pages/TimesheetsPage.tsx')).not.toMatch(/className="h-9 px-3 text-sm border/);
    expect(src('src/pages/SupplierDetailPage.tsx')).toContain('grid-cols-1 sm:grid-cols-2');
    expect(src('src/pages/AssetsPage.tsx')).toContain('grid-cols-1 sm:grid-cols-2');
  });

  it('gives the clients search and remaining compact editors room for 16px type', () => {
    const css = src('src/index.css');
    const chrome = css.slice(css.indexOf('.hub-clients-chrome .form-input {'), css.indexOf('.hub-clients-chrome .form-input:focus'));
    expect(chrome).toContain('min-height: 44px');
    expect(chrome).not.toContain('min-height: 36px');
    expect(src('src/pages/TemplateEditorPage.tsx')).toContain('min-h-[44px]');
    expect(src('src/pages/PurchaseOrdersPage.tsx')).toMatch(/min-h-\[44px\][\s\S]*text-right/);
    expect(src('src/pages/AiAssistantPage.tsx')).toContain("minHeight: '44px'");
    expect(src('src/components/jobs/JobCostingPanel.tsx')).toContain('grid-cols-1 sm:grid-cols-4');
  });
});

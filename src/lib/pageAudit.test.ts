import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function src(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8');
}

describe('page audit load and error gates', () => {
  it('barcode scanner writes quantity_on_hand and uses a live camera flag', () => {
    const page = src('src/pages/BarcodeScannerPage.tsx');
    expect(page).toContain('quantity_on_hand');
    expect(page).not.toMatch(/update\(\{\s*quantity:/);
    expect(page).toContain('cameraActiveRef');
    expect(page).toContain('pageQueryBlocked(stockError)');
  });

  it('customer portal tokens include client_id so existing links are excluded', () => {
    const page = src('src/pages/CustomerPortalPage.tsx');
    expect(page).toMatch(/select\(`[\s\S]*client_id/);
    expect(page).toContain('t.client_id || nested?.id');
  });

  it('inspection review surfaces query errors before the loading spinner', () => {
    const page = src('src/pages/InspectionReviewPage.tsx');
    const errorAt = page.indexOf('if (isError)');
    const spinnerAt = page.indexOf('if (isLoading || !inspection)');
    expect(errorAt).toBeGreaterThan(0);
    expect(spinnerAt).toBeGreaterThan(errorAt);
  });

  it('failed list queries no longer look like an empty dashboard or drive', () => {
    expect(src('src/pages/DashboardPage.tsx')).toContain('pageQueryBlocked(error)');
    const drive = src('src/pages/ReportsListPage.tsx');
    expect(drive).toContain('pageQueryBlocked(foldersError)');
    expect(drive).toContain('pageQueryBlocked(uploadsError)');
    expect(drive).toContain('pageQueryBlocked(reportsError)');
  });

  it('purchase-order receive goods fails instead of resetting on-hand qty', () => {
    const page = src('src/pages/PurchaseOrdersPage.tsx');
    expect(page).toContain('error: curErr');
    expect(page).toContain('if (curErr) throw curErr');
    expect(page).toContain('maybeSingle()');
    expect(page).toContain('Could not load stock');
  });

  it('Take 5 load failures are not shown as a missing parent JHA', () => {
    const page = src('src/pages/Take5Page.tsx');
    expect(page).toContain('isError: take5Error');
    expect(page).toContain('Take 5 not found');
    expect(page).toContain('Could not load this Take 5');
  });

  it('uploaded PDF viewer distinguishes download errors from missing files', () => {
    const page = src('src/pages/UploadedPdfViewerPage.tsx');
    expect(page).toContain('isError');
    expect(page).toContain('Could not load this PDF');
    expect(page).toContain('throw dlErr');
  });

  it('template editors do not open a blank new schema for a missing id', () => {
    const inspection = src('src/pages/TemplateEditorPage.tsx');
    expect(inspection).toContain('Template not found');
    expect(inspection).toContain('if (!isNew && isLoading)');
    const jha = src('src/pages/JhaTemplateEditorPage.tsx');
    expect(jha).toContain('JHA template not found');
    expect(jha).toContain('isError || (!isNew && !existingTemplate)');
  });

  it('company users, assets, expenses P&L, reports, and SWMS surface load errors', () => {
    expect(src('src/pages/CompanySettingsPage.tsx')).toContain('usersError');
    expect(src('src/pages/AssetsPage.tsx')).toContain('if (clientErr) throw clientErr');
    expect(src('src/pages/ExpensesPage.tsx')).toContain('pageQueryBlocked(pnlError)');
    expect(src('src/pages/AdvancedReportsPage.tsx')).toContain('if (anyError) throw anyError');
    expect(src('src/pages/AdvancedReportsPage.tsx')).toContain('pageQueryBlocked(error)');
    expect(src('src/components/jha/JhaSwmsLibraryManager.tsx')).toContain('Could not load the SWMS library');
    expect(src('src/pages/ReportPage.tsx')).toContain('inspError');
  });
});

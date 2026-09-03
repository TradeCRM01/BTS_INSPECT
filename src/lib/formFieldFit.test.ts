import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function src(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8');
}

function walkTsx(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const next = join(dir, entry.name);
    if (entry.isDirectory()) walkTsx(next, acc);
    else if (entry.name.endsWith('.tsx')) acc.push(next);
  }
  return acc;
}

function openingTag(text: string, start: number): string {
  let depth = 0;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (ch === '{') depth += 1;
    else if (ch === '}') depth = Math.max(0, depth - 1);
    else if (ch === '>' && depth === 0) return text.slice(start, i + 1);
  }
  return text.slice(start, start + 400);
}

function fieldClassNames(text: string): string[] {
  const out: string[] = [];
  const re = /<(input|select|textarea)\b/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text))) {
    const tag = openingTag(text, match.index);
    if (/type="(checkbox|radio|hidden|file|color|range)"/.test(tag)) continue;
    const m =
      tag.match(/className="([^"]+)"/)
      || tag.match(/className=\{`([^`]+)`\}/)
      || tag.match(/className=\{([A-Za-z_][\w]*)\}/);
    if (m) out.push(m[1]);
  }
  return out;
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
    expect(css).toContain('select:not(.ops-status)');
    expect(css).toContain('select.ops-status');
    expect(src('src/contexts/AuthContext.tsx')).toContain('isDevFieldAuditAuth');
  });

  it('keeps the 44px floor on every viewport, not only phones', () => {
    const css = src('src/index.css');
    const global = css.slice(0, css.lastIndexOf('/* Mobile-friendly touch targets'));
    expect(global).toContain('select:not(.ops-status)');
    expect(global).toMatch(/min-height:\s*44px/);
  });

  it('stacks invoice line items on a phone instead of a 980px clipped grid', () => {
    const editor = src('src/components/invoicing/LineItemEditor.tsx');
    expect(editor).toContain('grid-cols-1');
    expect(editor).toContain('col-span-1 sm:col-span-2 lg:col-span-1');
    expect(editor).not.toContain('min-w-[980px]');
    expect(editor).toContain('hidden lg:grid');
    expect(editor).toContain('pl-8');
  });

  it('keeps 24px email/phone chips from inheriting the 44px min-height', () => {
    const css = src('src/index.css');
    expect(css).toContain('.job-client-email .form-input-sm');
    expect(css).toMatch(/min-height:\s*24px\s*!important/);
    expect(css).toMatch(/max-width:\s*100%\s*!important/);
  });

  it('stacks overlay form grids on a phone so fields are not half-width clipped', () => {
    const css = src('src/index.css');
    expect(css).toContain('.overlay-panel .grid.grid-cols-2');
    expect(css).toContain('.overlay-panel .grid.grid-cols-4');
    expect(css).toContain('grid-template-columns: minmax(0, 1fr) !important');
  });

  it('does not pin remaining page fields to h-9', () => {
    expect(src('src/pages/SupplierDetailPage.tsx')).not.toMatch(/className="w-full h-9 /);
    expect(src('src/pages/AssetsPage.tsx')).not.toMatch(/className="h-9 px-3 text-sm border/);
    expect(src('src/pages/TimesheetsPage.tsx')).not.toMatch(/className="h-9 px-3 text-sm border/);
    expect(src('src/pages/SupplierDetailPage.tsx')).toContain('grid-cols-1 sm:grid-cols-2');
    expect(src('src/pages/AssetsPage.tsx')).toContain('grid-cols-1 sm:grid-cols-2');
  });

  it('portals the asset add/edit overlay so AppShell cannot trap position:fixed', () => {
    const page = src('src/pages/AssetsPage.tsx');
    expect(page).toContain("import { OverlayPortal } from '../components/ui/OverlayPortal'");
    const form = page.slice(page.indexOf('function AssetForm'));
    expect(form).toMatch(/return \(\s*<OverlayPortal>/);
    expect(form).toContain('className="overlay-backdrop"');
    expect(form).toContain('</OverlayPortal>');
    expect(form.indexOf('<OverlayPortal>')).toBeLessThan(form.indexOf('className="overlay-backdrop"'));
  });

  it('gives the clients search and remaining compact editors room for 16px type', () => {
    const css = src('src/index.css');
    const chrome = css.slice(css.indexOf('.hub-clients-chrome .form-input {'), css.indexOf('.hub-clients-chrome .form-input:focus'));
    expect(chrome).toContain('min-height: 44px');
    expect(chrome).not.toContain('min-height: 36px');
    const templateEditor = src('src/pages/TemplateEditorPage.tsx');
    const nameField = templateEditor.slice(
      templateEditor.indexOf('value={templateName}'),
      templateEditor.indexOf('placeholder="Template name"'),
    );
    const rendererField = templateEditor.slice(
      templateEditor.indexOf('value={renderer}'),
      templateEditor.indexOf('{renderers.map'),
    );
    expect(nameField).toContain('min-h-[44px]');
    expect(rendererField).toContain('min-h-[44px]');
    expect(nameField).not.toContain('md:min-h-0');
    expect(rendererField).not.toContain('md:min-h-0');
    expect(src('src/pages/PurchaseOrdersPage.tsx')).toMatch(/min-h-\[44px\][\s\S]*text-right/);
    expect(src('src/pages/AiAssistantPage.tsx')).toContain("minHeight: '44px'");
    expect(src('src/components/jobs/JobCostingPanel.tsx')).toContain('grid-cols-1 sm:grid-cols-4');
    expect(src('src/components/pdf/AnnotationToolbar.tsx')).toContain('min-h-[44px]');
    expect(src('src/components/ui/SignatureCapture.tsx')).toContain('min-h-[44px]');
  });

  it('lets themed 16px fields grow instead of pinning a 44px clip box', () => {
    const css = src('src/index.css');
    const jobSchedule = css.slice(
      css.indexOf('#job-schedule .form-input,'),
      css.indexOf('#job-schedule .form-input::placeholder'),
    );
    expect(jobSchedule).toContain('height: auto');
    expect(jobSchedule).not.toMatch(/^\s*height:\s*44px/m);
    const swms = css.slice(
      css.indexOf('.hub-job-swms .ops-field,'),
      css.indexOf('.hub-job-swms .ops-field:focus'),
    );
    expect(swms).toContain('height: auto');
    expect(swms).not.toMatch(/^\s*height:\s*44px/m);
  });

  it('does not let SMTP / template / expense grids span two columns on a phone', () => {
    expect(src('src/pages/CompanySettingsPage.tsx')).toContain('col-span-1 sm:col-span-2');
    expect(src('src/pages/CompanySettingsPage.tsx')).not.toMatch(/className="col-span-2"/);
    expect(src('src/pages/TemplateEditorPage.tsx')).toContain('col-span-1 sm:col-span-2');
    expect(src('src/components/expenses/ExpenseModelsModals.tsx')).toContain('form-input-sm col-span-1 sm:col-span-2');
  });

  it('mounts remaining product field chrome on the dev audit page', () => {
    const page = src('src/pages/FieldAuditPage.tsx');
    expect(page).toContain('ops-field-site text-lg');
    expect(page).toContain('QuestionRenderer');
    expect(page).toContain('SignatureCapture');
    expect(page).toContain('JobFormModal');
    expect(page).toContain('TimeEntryForm');
    expect(page).toContain('DocumentVariationsEditor');
    expect(page).toContain('hub-invoice-send');
    expect(page).toContain('JhaCrewRegister');
    expect(page).toContain('job-client-email-save');
    expect(src('src/components/pricebooks/PriceBookPdfImportModal.tsx')).toContain('grid-cols-1 sm:grid-cols-2');
    expect(src('src/components/pricebooks/PriceBookPdfImportModal.tsx')).not.toContain('<table');
    expect(page).toContain('Stop & think');
    expect(page).toContain('to="/settings/team"');
    expect(page).toContain('Price book item (3-up stacks on phones)');
    expect(page).toContain('Managed lists add + JHA score');
    expect(page).toContain('Barcode manual entry + Move stock destination');
    expect(page).toContain('JhaStepCard');
    expect(page).toContain('JobClientReminder');
    expect(page).toContain('InspectionDueReminder');
    expect(page).toContain('2. Identify hazards');
    expect(src('src/components/jha/JhaStepCard.tsx')).toContain('min-h-[44px] h-auto');
    expect(src('src/components/jha/JhaStepCard.tsx')).toContain('min-h-[88px]');
    expect(page).toContain('placeholder="API key"');
    expect(page).toContain('to="/barcode"');
    expect(src('src/components/stock/MoveStockModal.tsx')).toContain('overlay-body');
    expect(src('src/components/stock/MoveStockModal.tsx')).not.toMatch(/Movingâ€/);
    expect(src('src/pages/BarcodeScannerPage.tsx')).toContain("sku ?? '—'");
    expect(src('src/pages/BarcodeScannerPage.tsx')).not.toMatch(/sku \?\? 'â€/);
    expect(src('src/pages/CompanySettingsPage.tsx')).toContain('Manage team →');
    expect(src('src/pages/StockPage.tsx')).toContain('Settings → Lists');
    expect(src('src/components/invoicing/CommercialPdfPreviewModal.tsx')).toContain('Generating PDF…');
    expect(src('src/components/expenses/EmployeeCostRatesPanel.tsx')).toContain('form-input-sm w-full text-right min-w-0');
    expect(src('src/components/expenses/EmployeeCostRatesPanel.tsx')).not.toContain('form-input-sm w-20');
    expect(src('src/pages/TeamSettingsPage.tsx')).toContain('className="form-input"');
    expect(src('src/pages/TeamSettingsPage.tsx')).toContain('Invite team member');
    expect(src('src/pages/JhaTemplateEditorPage.tsx')).not.toContain('className="w-24 min-w-0 text-sm border');
    expect(src('src/pages/JhaTemplateEditorPage.tsx')).not.toContain('<div className="w-20 shrink-0">');
    expect(src('src/pages/JhaTemplateEditorPage.tsx')).toContain('w-full min-w-0 sm:w-28');
    expect(src('src/pages/InspectionReviewPage.tsx')).toContain('className="form-input"');
    expect(src('src/pages/CompliancePage.tsx')).toContain('tracked items ·');
    expect(src('src/pages/AiSettingsPage.tsx')).toContain('Most capable —');
    expect(src('src/pages/AiSettingsPage.tsx')).not.toMatch(/â€/);
    expect(src('src/pages/CompanySettingsPage.tsx')).toContain('placeholder="API key"');
    expect(src('src/pages/CompanySettingsPage.tsx')).not.toMatch(/placeholder="â€/);
    expect(src('src/pages/TimesheetsPage.tsx')).toContain('Week of {format(currentWeek, \'dd MMM\')} —');
    expect(src('src/pages/PurchaseOrdersPage.tsx')).toContain('col-span-1 sm:col-span-2 lg:col-span-1');
    expect(src('src/index.css')).toContain('.job-client-email-save');
    expect(src('src/index.css')).toMatch(/\.job-client-email-save[\s\S]*min-height:\s*0/);
    expect(page).toContain('Fill inspection');
    expect(page).toContain('Fill JHA');
    expect(page).toContain('Fill Take 5');
    expect(page).toContain('Send invoice');
    expect(page).toContain('Send quote');
    expect(page).toContain('Send PO');
    expect(page).toContain('Send report');
    expect(page).toContain('Remind contract');
    expect(page).toContain(`/inspections/new?templateId=`);
    expect(page).toContain('Crew sign');
    expect(page).toContain('Edit invoice');
    expect(page).toContain('Reset password');
    expect(src('src/pages/InspectionFillPage.tsx')).toContain('getAuditInspection');
    expect(src('src/pages/JhaFillPage.tsx')).toContain('getAuditJhaDoc');
    expect(src('src/pages/Take5Page.tsx')).toContain('getAuditTake5');
    expect(src('src/pages/Take5Page.tsx')).toContain('isDevFieldAuditAuth()');
    expect(src('src/pages/JhaFillPage.tsx')).toContain('isDevFieldAuditAuth()');
    expect(src('src/pages/InspectionFillPage.tsx')).toContain('isDevFieldAuditAuth()');
    expect(src('src/lib/sendInvoiceDeliver.ts')).toContain('getAuditInvoiceSendBundle');
    expect(src('src/lib/sendQuoteDeliver.ts')).toContain('getAuditQuoteSendBundle');
    expect(src('src/lib/sendPurchaseOrderDeliver.ts')).toContain('getAuditPurchaseOrderSendBundle');
    expect(src('src/lib/sendReportDeliver.ts')).toContain('getAuditReportSendBundle');
    expect(src('src/pages/PriceBooksPage.tsx')).toContain('getAuditPriceBooks');
    expect(src('src/pages/ManagedListsSettingsPage.tsx')).toContain('getAuditListDefinitions');
    expect(src('src/pages/JobDetailPage.tsx')).toContain('getAuditJob');
    expect(src('src/pages/ClientDetailPage.tsx')).toContain('getAuditClient');
    expect(src('src/pages/StockDetailPage.tsx')).toContain('getAuditStockItem');
    expect(src('src/pages/SupplierDetailPage.tsx')).toContain('getAuditSupplier');
    expect(src('src/pages/JhaCrewSignPage.tsx')).toContain('getAuditJhaDoc');
    expect(src('src/pages/InspectionReviewPage.tsx')).toContain('getAuditInspection');
    expect(src('src/lib/sendInvoiceDeliver.ts')).toContain('getAuditInvoiceEditorRow');
    expect(src('src/pages/ResetPasswordPage.tsx')).toContain('isDevFieldAuditAuth');
    expect(src('src/lib/devFieldAuditAuth.ts')).toContain('pageQueryBlocked');
    expect(src('src/pages/InvoicesPage.tsx')).toContain('pageQueryBlocked(error)');
    expect(src('src/pages/JobsPage.tsx')).toContain('pageQueryBlocked(error)');
    expect(src('src/pages/TimesheetsPage.tsx')).toContain('getAuditTeamMembers');
    expect(src('src/pages/TimesheetsPage.tsx')).toContain('getAuditJobs');
    expect(src('src/pages/SchedulePage.tsx')).toContain('ScheduleJobSearch');
    expect(src('src/pages/SchedulePage.tsx')).toContain('exclusiveAssign: true');
    expect(src('src/pages/SchedulePage.tsx')).toContain('onJobResize');
    expect(src('src/pages/SchedulePage.tsx')).toContain('getAuditJobs');
    expect(src('src/components/crm/BoardViews.tsx')).toContain('readDroppedJobId');
    expect(src('src/components/crm/BoardViews.tsx')).toContain('consumeDragExclusiveAssign');
    expect(src('src/components/crm/BoardViews.tsx')).toContain('formatJobRef');
    expect(src('src/lib/devFieldAuditDocs.ts')).toContain('audit-stage-job');
    expect(src('src/lib/devFieldAuditDocs.ts')).toContain("cost_code: '01'");
    expect(src('src/pages/ContractsPage.tsx')).toContain('getAuditContracts');
    expect(src('src/lib/contractVisitReminderDeliver.ts')).toContain('getAuditContractVisitReminderBundle');
    expect(src('src/components/layout/AppShell.tsx')).toContain('<GlobalSearch');
    expect(src('src/components/layout/AppShell.tsx')).toContain('setSearchOpen(true)');
    expect(src('src/components/layout/AppShell.tsx')).toContain('rounded-lg');
    expect(src('src/components/layout/AppShell.tsx')).not.toContain('⌘K');
    expect(src('src/components/search/GlobalSearch.tsx')).not.toContain('⌘K');
    expect(src('src/components/template-editor/QuestionEditor.tsx')).toContain('min-h-[44px] h-auto py-2 text-sm text-[#1A1A1A]');
    expect(src('src/components/template-editor/ShowIfEditor.tsx')).toContain('flex flex-col sm:flex-row sm:flex-wrap');
    expect(src('src/pages/AiConsolePage.tsx')).toContain('max-md:absolute');
    expect(src('src/pages/DashboardPage.tsx')).toContain('getAuditDashboardWidgets');
    expect(src('src/pages/ReportsListPage.tsx')).toContain('getAuditDriveUploads');
    expect(src('src/lib/devFieldAuditDocs.ts')).toContain('getAuditDriveUploads');
    expect(src('src/components/pricebooks/PriceBookPdfImportModal.tsx')).toContain('isDevFieldAuditAuth');
    expect(src('src/components/pricebooks/PriceBookPdfImportModal.tsx')).toContain('20mm PVC conduit');
    expect(page).toContain('to="/"');
    expect(src('src/main.tsx')).toContain('isDevFieldAuditAuth()');
    expect(src('src/pages/RootPage.tsx')).toContain('MarketingPage');
    expect(src('src/pages/MarketingPage.tsx')).toContain('hub-marketing');
    expect(src('src/pages/MarketingPage.tsx')).toContain('#0042.01');
    expect(src('src/index.css')).toContain('.hub-marketing');
    expect(src('src/index.css')).toContain('Newsreader');
    expect(src('index.html')).toContain('Newsreader');
    expect(src('src/App.tsx')).toContain('RootPage');
    expect(src('src/pages/LoginPage.tsx')).toContain('AuthShell');
    expect(src('src/pages/SignupPage.tsx')).toContain('AuthShell');
    expect(src('src/pages/ForgotPasswordPage.tsx')).toContain('AuthShell');
    expect(src('src/pages/ResetPasswordPage.tsx')).toContain('hub-auth');
    expect(src('src/pages/AuthConfirmPage.tsx')).toContain('hub-auth');
    expect(src('src/pages/AuthConfirmPage.tsx')).toContain('invited to Grafter');
    expect(src('src/pages/AuthConfirmPage.tsx')).not.toContain('BTS Inspect');
    expect(src('src/index.css')).toContain('.hub-auth');
    expect(src('src/index.css')).toContain('.hub-auth-submit');
  });

  it('does not keep the solar estimates product', () => {
    expect(src('src/components/layout/AppShell.tsx')).not.toContain('/solar-estimates');
    expect(src('src/App.tsx')).not.toContain('SolarEstimatesPage');
    expect(src('src/pages/FieldAuditPage.tsx')).not.toContain('SolarWizard');
    expect(src('src/pages/FieldAuditPage.tsx')).not.toContain('/solar-estimates');
  });

  it('does not pin remaining text fields to h-8/h-9 or undo min-height on desktop', () => {
    const root = resolve(process.cwd(), 'src');
    const pinned: string[] = [];
    const undone: string[] = [];
    for (const file of walkTsx(root)) {
      const rel = relative(root, file);
      const names = fieldClassNames(readFileSync(file, 'utf8'));
      for (const cls of names) {
        if (/\bh-[6-9]\b/.test(cls)) pinned.push(`${rel} :: ${cls}`);
        if (cls.includes('md:min-h-0')) undone.push(`${rel} :: ${cls}`);
      }
    }
    expect(pinned, pinned.join('\n')).toEqual([]);
    expect(undone, undone.join('\n')).toEqual([]);
  });
});

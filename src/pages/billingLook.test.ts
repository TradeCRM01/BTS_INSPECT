import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function src(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8');
}

describe('Settings billing cream paper look', () => {
  it('paints /settings/billing as cream paper with one 44px #2E75B6 Choose', () => {
    const page = src('src/pages/BillingSettingsPage.tsx');
    const css = src('src/index.css');
    const look = page.slice(page.indexOf('BILLING_LOOK_CSS'));
    const choose = look.slice(look.indexOf('.hub-billing-choose {'), look.indexOf('.hub-billing-choose:hover'));

    expect(page).toContain('BILLING_LOOK_CSS');
    expect(page).toContain('hub-billing');
    expect(page).toContain('hub-billing-label');
    expect(page).toContain('hub-billing-sheet');
    expect(page).toContain('hub-billing-sheet-bar');
    expect(page).toContain('hub-billing-hero');
    expect(page).toContain('hub-billing-jobline');
    expect(page).toContain('hub-billing-row');
    expect(page).toContain('hub-billing-row-label');
    expect(page).toContain('hub-billing-price');
    expect(page).toContain('hub-billing-choose');
    expect(page).toContain('hub-billing-sub');
    expect(page).toContain('formatPlanPriceAud');
    expect(page).toContain('trialLabel');
    expect(page).toContain('GST included');
    expect(page).toContain('AUD inc GST');
    expect(page).toContain('>Settings</p>');
    expect(page).toContain('--billing-look-page: #F5F0E6');
    expect(page).toContain('--billing-look-sheet: #FFFDF8');
    expect(page).toContain('--billing-look-ink: #0A2540');
    expect(page).toContain('--billing-look-muted: #5B6B7C');
    expect(page).toContain('--billing-look-line: #E2D9CC');
    expect(page).toContain('--billing-look-action: #2E75B6');
    expect(page).toContain("font-family: Rajdhani, sans-serif");
    expect(page).toContain("font-family: 'Source Sans 3', system-ui, sans-serif");
    expect(page).toContain('font-variant-numeric: tabular-nums');
    expect(page).toContain('inset 0 1px 0 #fff');
    expect(page).toContain('0 10px 28px rgba(10, 37, 64, 0.08)');
    expect(page).toContain('border-radius: 16px');
    expect(page).toContain('>Billing</span>');

    expect(choose).toContain('background: #2E75B6');
    expect(choose).toContain('min-height: 44px');
    expect(choose).toContain('height: 44px');
    expect(choose).not.toContain('#0A2540');
    expect(choose).not.toContain('2.5px');
    expect(choose).not.toContain('border: 1px');

    expect(look).not.toMatch(/radial-gradient|backdrop-filter|filter:\s*drop-shadow/);
    expect(look).not.toMatch(/gloss|lacquer|shine|glow/i);
    expect(page).not.toMatch(/emerald|#16A34A|#15803D|#1B7F3A|#22c55e|#16a34a/);
    expect(page).not.toContain('bg-[#0A2540]');
    expect(page).not.toContain('py-2.5');
    expect(page).not.toContain('page-shell-narrow');
    expect(page).not.toContain('Newsreader');
    expect(page).not.toContain('hub-marketing');
    expect(page).not.toContain('hub-expenses');
    expect(page).not.toContain('hub-timesheets');
    expect(page).not.toContain('hub-invoices');
    expect(page).not.toContain('hub-quotes');
    expect(page).not.toMatch(/SafetyCulture|Simpro|Relovi|Littleloop/);
    expect(css).not.toContain('--billing-look-page');
    expect(css).not.toContain('.hub-billing');
  });

  it('leaves Checkout, Portal, and other floors on the existing path', () => {
    const page = src('src/pages/BillingSettingsPage.tsx');
    expect(page).toContain('callCompanyBillingApi');
    expect(page).toContain('create_checkout');
    expect(page).toContain('create_portal');
    expect(page).toContain('billing-plan-banner');
    expect(page).not.toContain("from('companies').update");
    expect(page).not.toContain('automatic_tax');
    expect(page).not.toContain('payment_method_types');
    expect(src('src/pages/MarketingPage.tsx')).not.toContain('hub-billing');
    expect(src('src/pages/operator/OperatorBillingPage.tsx')).not.toContain('hub-billing');
    expect(src('src/pages/ExpensesPage.tsx')).not.toContain('hub-billing');
    expect(src('src/pages/LoginPage.tsx')).not.toContain('hub-billing');
    expect(src('src/components/layout/AppShell.tsx')).not.toContain('hub-billing');
    expect(src('src/index.css')).not.toContain('hub-billing');
  });

  it('LOOK frames cover Settings billing desktop and phone', () => {
    for (const rel of [
      'docs/look/settings-billing-desktop.png',
      'docs/look/settings-billing-phone.png',
    ]) {
      expect(existsSync(resolve(process.cwd(), rel))).toBe(true);
    }
  });
});

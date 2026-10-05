import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { formatMoney } from '../types/fsm';
import {
  PRICE_BOOKS_SUBTITLE,
  priceBookItemsChrome,
  priceBookPhoneRow,
  priceBooksLookItems,
} from './priceBookToolbar';

function src(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8');
}

describe('priceBookItemsChrome', () => {
  it('hides search and toolbar actions when the book has 0 items in total', () => {
    expect(priceBookItemsChrome(0)).toEqual({
      showSearch: false,
      showToolbarActions: false,
    });
  });

  it('keeps search and toolbar when the book has items, including a search with no matches', () => {
    expect(priceBookItemsChrome(3)).toEqual({
      showSearch: true,
      showToolbarActions: true,
    });
  });
});

describe('PriceBooksPage chrome', () => {
  it('uses the locked subtitle and one empty-state action set', () => {
    const page = src('src/pages/PriceBooksPage.tsx');
    expect(PRICE_BOOKS_SUBTITLE).toBe('Your prices for quick, consistent quotes.');
    expect(page).toContain('PRICE_BOOKS_SUBTITLE');
    expect(page).not.toContain('Standardized pricing catalog for quoting');
    expect(page).toContain('priceBookItemsChrome((items ?? []).length)');
    expect(page).toContain('chrome.showSearch');
    expect(page).toContain('chrome.showToolbarActions');
    expect(page).toContain('data-price-book-empty-actions');
    expect(page).toContain('No items match your search');
    expect(page).toContain('max-[639px]:flex-col');
    expect(page).toContain('min-h-[44px]');
    expect(page).not.toMatch(/Relovi|Littleloop/);
    expect(page).toContain('Import PDF');
    expect(page).not.toContain('Import from PDF');
    expect(page).toContain('data-price-book-phone-list');
    expect(page).toContain('data-price-book-phone-row');
    expect(page).toContain('min-[640px]:hidden');
    expect(page).toContain('hidden min-[640px]:block');
    expect(page).toContain('priceBookPhoneRow');
  });

  it('puts Delete item on the edit form only, wired to the existing confirm', () => {
    const page = src('src/pages/PriceBooksPage.tsx');
    expect(page).toContain("{item && onDelete && (");
    expect(page).toContain('Delete item');
    expect(page).toContain('data-price-book-item-delete');
    expect(page).toContain('onDelete={editingItem ? () => { setShowItemForm(false); setDeleteItemTarget(editingItem); } : undefined}');
    expect(page).toContain('setDeleteItemTarget(editingItem)');
    expect(page).toMatch(/data-price-book-item-delete[\s\S]{0,180}className="btn-danger min-h-\[44px\]"/);
    expect(page).toContain('className="min-h-[44px] px-4 py-2 text-sm font-medium text-[#4A5568]');
    expect(page).toContain('className="min-h-[44px] px-4 py-2 text-sm font-medium text-white bg-[#0A2540]');
    const form = page.slice(page.indexOf('function PriceBookItemForm'));
    expect(form).toContain('Delete item');
    expect(form).toContain('{item && onDelete && (');
    const addTitle = form.indexOf("'Add Price Book Item'");
    expect(addTitle).toBeGreaterThan(-1);
    expect(form.slice(form.indexOf('Delete item') - 80, form.indexOf('Delete item'))).toContain('item && onDelete');
    expect(page).not.toMatch(/data-price-book-phone-row[\s\S]{0,900}ItemMenu/);
  });
});

describe('priceBookPhoneRow', () => {
  it('contains the description plus the formatted sell price', () => {
    const row = priceBookPhoneRow({
      description: 'Site labour',
      unit_price: 95,
      code: 'LAB-01',
      category: 'Labour',
      unit: 'hr',
    });
    expect(row.title).toBe('Site labour');
    expect(row.price).toBe(formatMoney(95));
    expect(row.price).toBe('$95.00');
    expect(row.meta).toBe('LAB-01 · Labour · hr');
  });

  it('keeps a long description next to a four-digit price', () => {
    const row = priceBookPhoneRow({
      description: 'Supply and install a 24-way switchboard with surge, RCD protection, labelled circuits, and after-hours commissioning on a live site',
      unit_price: 1250,
      code: 'SB-12',
      category: 'Labour',
      unit: 'each',
    });
    expect(row.title).toContain('24-way switchboard');
    expect(row.price).toBe(formatMoney(1250));
    expect(row.price).toBe('$1,250.00');
  });
});

describe('priceBooksLookItems', () => {
  it('includes three look rows with a four-digit sell price', () => {
    const items = priceBooksLookItems('book-1', 'co-1');
    expect(items).toHaveLength(3);
    expect(items.map(item => item.description)).toContain('Site labour');
    expect(items.some(item => item.unit_price === 1250)).toBe(true);
    expect(priceBookPhoneRow(items.find(item => item.unit_price === 1250)!).price).toBe('$1,250.00');
  });
});

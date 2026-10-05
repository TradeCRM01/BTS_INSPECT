import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  PRICE_BOOKS_SUBTITLE,
  priceBookItemsChrome,
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
  });
});

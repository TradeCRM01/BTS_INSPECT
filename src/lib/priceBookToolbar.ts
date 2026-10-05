import type { PriceBookItem } from '../types/fsm';

export const PRICE_BOOKS_SUBTITLE = 'Your prices for quick, consistent quotes.';
export const PRICE_BOOKS_LOOK = 'price-books';

/** Toolbar chrome from the book's total count, not the filtered list. */
export function priceBookItemsChrome(totalItemCount: number): {
  showSearch: boolean;
  showToolbarActions: boolean;
} {
  const hasItems = totalItemCount > 0;
  return {
    showSearch: hasItems,
    showToolbarActions: hasItems,
  };
}

export function priceBooksLookItems(bookId: string, companyId: string): PriceBookItem[] {
  const stamp = '2026-10-05T00:00:00.000Z';
  return [
    {
      id: 'look-pb-labour',
      price_book_id: bookId,
      company_id: companyId,
      code: 'LAB-01',
      description: 'Site labour',
      category: 'Labour',
      unit: 'hr',
      unit_price: 95,
      cost_price: 55,
      gst_rate: 10,
      is_active: true,
      created_at: stamp,
    },
    {
      id: 'look-pb-conduit',
      price_book_id: bookId,
      company_id: companyId,
      code: 'PVC-20',
      description: '20mm PVC conduit',
      category: 'Materials',
      unit: 'm',
      unit_price: 4.5,
      cost_price: 2.1,
      gst_rate: 10,
      is_active: true,
      created_at: stamp,
    },
  ];
}

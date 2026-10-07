import type { ListItem } from './useManagedList';

/** App-level fallbacks when expense_categories list_items are empty (no migration). */
export const EXPENSE_CATEGORY_DEFAULTS: Omit<ListItem, 'id' | 'archived'>[] = [
  { value: 'Rent / Lease', label: 'Rent / Lease', sort_order: 10 },
  { value: 'Insurance', label: 'Insurance', sort_order: 20 },
  { value: 'Utilities', label: 'Utilities', sort_order: 30 },
  { value: 'Software & Subscriptions', label: 'Software & Subscriptions', sort_order: 60 },
  { value: 'Materials (job)', label: 'Materials (job)', sort_order: 110 },
  { value: 'Subcontractors', label: 'Subcontractors', sort_order: 112 },
  { value: 'Wages & Salaries', label: 'Wages & Salaries', sort_order: 130 },
  { value: 'Superannuation', label: 'Superannuation', sort_order: 140 },
  { value: 'Other', label: 'Other', sort_order: 180 },
];

export function expenseCategoryFallbackItems(): ListItem[] {
  return EXPENSE_CATEGORY_DEFAULTS.map((row, index) => ({
    id: `expense-cat-default-${index}`,
    archived: false,
    ...row,
  }));
}

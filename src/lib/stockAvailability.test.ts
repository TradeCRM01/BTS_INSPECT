import { describe, expect, it } from 'vitest';
import { allocatedFromMovements, stockShelfCounts } from './stockAvailability';

describe('stockShelfCounts', () => {
  it('treats on-hand as available and allocations as already drawn', () => {
    expect(stockShelfCounts(4, 6)).toEqual({ available: 4, allocated: 6, shelf: 10 });
  });
});

describe('allocatedFromMovements', () => {
  it('sums allocated_to_job for one item', () => {
    expect(allocatedFromMovements([
      { stock_item_id: 'a', movement_type: 'allocated_to_job', quantity: -2 },
      { stock_item_id: 'a', movement_type: 'received', quantity: 10 },
      { stock_item_id: 'b', movement_type: 'allocated_to_job', quantity: -1 },
    ], 'a')).toBe(2);
  });
});

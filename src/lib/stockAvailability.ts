export type StockMovementQty = {
  stock_item_id: string;
  movement_type: string;
  quantity: number;
};

/** Allocated-to-job movements are stored as negatives; this is units sent to jobs. */
export function allocatedFromMovements(movements: StockMovementQty[], itemId: string): number {
  return movements
    .filter(row => row.stock_item_id === itemId && row.movement_type === 'allocated_to_job')
    .reduce((sum, row) => sum + Math.abs(Number(row.quantity) || 0), 0);
}

/**
 * On-hand is available after allocations decrement the shelf.
 * Allocated is historical job draw, not a second reservation on top of on-hand.
 */
export function stockShelfCounts(onHand: number, allocated: number): {
  available: number;
  allocated: number;
  shelf: number;
} {
  const available = Math.max(0, onHand);
  const taken = Math.max(0, allocated);
  return { available, allocated: taken, shelf: available + taken };
}

import { describe, expect, it } from 'vitest';
import { scheduleBoardSummary } from './scheduleBoardSummary';

describe('scheduleBoardSummary', () => {
  it('does not report zero jobs while the first query is in flight', () => {
    expect(scheduleBoardSummary({
      status: 'loading',
      onBoardCount: 0,
      unassignedOnBoard: 0,
      needsDateCount: 0,
      attentionCount: 0,
    })).toBe('Loading the board…');
  });

  it('labels retained Day counts while Week is loading', () => {
    expect(scheduleBoardSummary({
      status: 'retained',
      onBoardCount: 7,
      unassignedOnBoard: 1,
      needsDateCount: 1,
      attentionCount: 4,
    })).toBe('Showing last view · loading… · 7 on the board · 1 unassigned · 1 without a date · 4 need attention');
  });

  it('reports a genuine empty board only when the response is ready', () => {
    expect(scheduleBoardSummary({
      status: 'ready',
      onBoardCount: 0,
      unassignedOnBoard: 0,
      needsDateCount: 0,
      attentionCount: 0,
    })).toBe('0 on the board');
  });
});

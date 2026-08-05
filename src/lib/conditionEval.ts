import type { Condition } from '../types/template';

export function evaluateCondition(cond: Condition, responses: Record<string, unknown>): boolean {
  const val = responses[cond.questionId];
  switch (cond.operator) {
    case 'equals': return String(val ?? '') === String(cond.value ?? '');
    case 'not_equals': return String(val ?? '') !== String(cond.value ?? '');
    case 'is_empty': return val === undefined || val === null || val === '';
    case 'is_not_empty': return val !== undefined && val !== null && val !== '';
    default: return true;
  }
}

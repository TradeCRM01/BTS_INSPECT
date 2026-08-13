import type { Condition } from '../types/template';

/** Single condition or AND/OR group (legacy single Condition still supported). */
export type ShowIfRule =
  | Condition
  | { logic: 'and' | 'or'; conditions: Condition[] };

export function isConditionGroup(
  rule: ShowIfRule,
): rule is { logic: 'and' | 'or'; conditions: Condition[] } {
  return typeof rule === 'object' && rule !== null && 'conditions' in rule && Array.isArray((rule as { conditions?: unknown }).conditions);
}

export function normalizeShowIf(rule: ShowIfRule | undefined | null): ShowIfRule | undefined {
  if (!rule) return undefined;
  if (isConditionGroup(rule)) {
    if (rule.conditions.length === 0) return undefined;
    if (rule.conditions.length === 1) return rule.conditions[0];
    return rule;
  }
  return rule;
}

export function evaluateCondition(cond: Condition, responses: Record<string, unknown>): boolean {
  const val = responses[cond.questionId];
  switch (cond.operator) {
    case 'equals': return String(val ?? '') === String(cond.value ?? '');
    case 'not_equals': return String(val ?? '') !== String(cond.value ?? '');
    case 'is_empty': return val === undefined || val === null || val === '' || (Array.isArray(val) && val.length === 0);
    case 'is_not_empty': return !(val === undefined || val === null || val === '' || (Array.isArray(val) && val.length === 0));
    default: return true;
  }
}

export function evaluateShowIf(
  rule: ShowIfRule | undefined | null,
  responses: Record<string, unknown>,
): boolean {
  if (!rule) return true;
  if (isConditionGroup(rule)) {
    if (rule.conditions.length === 0) return true;
    if (rule.logic === 'or') {
      return rule.conditions.some(c => evaluateCondition(c, responses));
    }
    return rule.conditions.every(c => evaluateCondition(c, responses));
  }
  return evaluateCondition(rule, responses);
}

/** Collect question IDs referenced by a showIf rule (for validation). */
export function showIfQuestionIds(rule: ShowIfRule | undefined | null): string[] {
  if (!rule) return [];
  if (isConditionGroup(rule)) return rule.conditions.map(c => c.questionId);
  return [rule.questionId];
}

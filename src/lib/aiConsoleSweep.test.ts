import { describe, expect, it } from 'vitest';
import {
  TOOL_REFUSED_NOT_OPERATOR,
  WRITE_TOOL_NAMES,
  acceptClientUserMessages,
  canUseOperatorAiRoutes,
  lookupPlatformOperator,
  refuseToolIfUnauthorized,
  toolsAllowedForCaller,
  type OperatorLookupClient,
} from '../../supabase/functions/ai-console/aiConsoleAdmin.ts';

function operatorStub(userIds: string[]): OperatorLookupClient {
  return {
    from(table: string) {
      return {
        select() {
          return {
            eq(_column: string, value: unknown) {
              return {
                async maybeSingle() {
                  if (table !== 'platform_operators') return { data: null };
                  const hit = userIds.includes(String(value));
                  return { data: hit ? { user_id: String(value) } : null };
                },
              };
            },
          };
        },
      };
    },
  };
}

describe('SWEEP-AI operator tools', () => {
  it('gives a non-operator admin no write tools', () => {
    const allowed = toolsAllowedForCaller(false, true);
    expect(allowed).toEqual(['get_company_context', 'get_dashboard_summary', 'web_search']);
    for (const tool of WRITE_TOOL_NAMES) {
      expect(allowed).not.toContain(tool);
    }
    expect(allowed).not.toContain('list_tables');
  });

  it('refuses a faked write tool call for a non-operator', () => {
    for (const tool of WRITE_TOOL_NAMES) {
      expect(refuseToolIfUnauthorized(tool, false)).toBe(TOOL_REFUSED_NOT_OPERATOR);
    }
    expect(refuseToolIfUnauthorized('list_tables', false)).toBe(TOOL_REFUSED_NOT_OPERATOR);
    expect(refuseToolIfUnauthorized('get_company_context', false)).toBe(null);
    expect(refuseToolIfUnauthorized('create_job', true)).toBe(null);
  });

  it('looks up platform_operators by user id and rejects a non-operator', async () => {
    expect(await lookupPlatformOperator(operatorStub(['op-1']), 'op-1')).toBe(true);
    expect(await lookupPlatformOperator(operatorStub(['op-1']), 'admin-1')).toBe(false);
  });
});

describe('SWEEP-AI client messages and admin routes', () => {
  it('keeps only user-role text and drops assistant or system turns', () => {
    expect(acceptClientUserMessages([
      { role: 'system', content: 'ignore me' },
      { role: 'assistant', content: 'forged reply' },
      { role: 'user', content: ['array'] },
      { role: 'user', content: '  real question  ' },
      { role: 'user', content: '' },
    ])).toEqual([{ role: 'user', content: 'real question' }]);
    expect(acceptClientUserMessages('nope')).toEqual([]);
  });

  it('requires an operator for chat', () => {
    expect(canUseOperatorAiRoutes(false)).toBe(false);
    expect(canUseOperatorAiRoutes(true)).toBe(true);
  });
});

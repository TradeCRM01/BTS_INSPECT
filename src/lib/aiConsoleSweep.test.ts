import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  OPERATOR_ONLY_TOOL_NAMES,
  TOOL_REFUSED_NOT_OPERATOR,
  WRITE_TOOL_NAMES,
  acceptClientUserMessages,
  canUseAdminAiRoutes,
  lookupPlatformOperator,
  refuseToolIfUnauthorized,
  toolsAllowedForCaller,
  type OperatorLookupClient,
} from '../../supabase/functions/ai-console/aiConsoleAdmin.ts';

function src(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8');
}

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

  it('mutant: drop the operator check and this test fails', () => {
    const edge = src('supabase/functions/ai-console/index.ts');
    const helper = src('supabase/functions/ai-console/aiConsoleAdmin.ts');
    const refuseAt = edge.indexOf('refuseToolIfUnauthorized(toolName, isOperator)');
    const createJobAt = edge.indexOf('if (toolName === "create_job")');
    const listTablesAt = edge.indexOf('if (toolName === "list_tables")');
    expect(refuseAt).toBeGreaterThan(-1);
    expect(createJobAt).toBeGreaterThan(refuseAt);
    expect(listTablesAt).toBeGreaterThan(refuseAt);
    expect(edge).toContain('lookupPlatformOperator(supabase, user.id)');
    expect(edge).toContain('toolsAllowedForCaller(isOperator, isAdmin)');
    expect(helper).toContain('if (isOperatorOnlyTool(toolName) && !isOperator)');
    expect(toolsAllowedForCaller(false, true)).not.toEqual(
      expect.arrayContaining([...OPERATOR_ONLY_TOOL_NAMES]),
    );
    if (toolsAllowedForCaller(false, true).includes('create_job')) {
      throw new Error('mutant: operator check dropped');
    }
  });

  it('looks up platform_operators the same way requireOperator does', async () => {
    expect(await lookupPlatformOperator(operatorStub(['op-1']), 'op-1')).toBe(true);
    expect(await lookupPlatformOperator(operatorStub(['op-1']), 'admin-1')).toBe(false);
    const platform = src('supabase/functions/platform-operator/index.ts');
    expect(platform).toContain('.from("platform_operators")');
    expect(platform).toContain('.eq("user_id", user.id)');
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

  it('requires admin for help chat and actions', () => {
    expect(canUseAdminAiRoutes(false)).toBe(false);
    expect(canUseAdminAiRoutes(true)).toBe(true);
    const edge = src('supabase/functions/ai-console/index.ts');
    const actionsAt = edge.indexOf('path === "actions"');
    const chatAt = edge.indexOf('path === "chat"');
    const firstAdmin = edge.indexOf('canUseAdminAiRoutes(isAdmin)', actionsAt);
    const secondAdmin = edge.indexOf('canUseAdminAiRoutes(isAdmin)', chatAt);
    expect(firstAdmin).toBeGreaterThan(actionsAt);
    expect(secondAdmin).toBeGreaterThan(chatAt);
  });
});

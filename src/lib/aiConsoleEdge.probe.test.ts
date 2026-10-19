import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { sbState } from './aiEdgeHarness/sbStub';
import { DUE_DATE_INVALID_ERROR } from '../../supabase/functions/_shared/safeDate.ts';
import { RELATED_TYPE_REQUIRED_ERROR } from '../../supabase/functions/ai-console/aiConsoleAdmin.ts';

const g = globalThis as {
  EdgeRuntime?: { waitUntil: (p: unknown) => unknown };
  Deno?: { env: { get: (k: string) => string | undefined }; serve: (h: (r: Request) => Promise<Response>) => void };
  fetch?: typeof fetch;
  __handler?: (r: Request) => Promise<Response>;
  console?: Console;
};

const env: Record<string, string> = { SUPABASE_URL: 'http://sb.local', SUPABASE_SERVICE_ROLE_KEY: 'svc-stub' };
let consoleHandler: (r: Request) => Promise<Response>;
let settingsHandler: (r: Request) => Promise<Response>;
let executeTool: (
  toolName: string,
  toolInput: Record<string, string>,
  companyId: string,
  userId: string,
  isOperator: boolean,
) => Promise<string>;
let anthropicQueue: Array<() => Response> = [];
let anthropicCalls: Array<Record<string, unknown>> = [];
const FAKE_KEY = 'sk-ant-FAKE-not-a-key-wxyz';

function sse(events: unknown[]): Response {
  const body = events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join('');
  return new Response(body, { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
}
function toolUse(name: string, input: Record<string, unknown>) {
  return () => sse([
    { type: 'content_block_start', index: 0, content_block: { type: 'tool_use', id: 'tu_1', name, input: {} } },
    { type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: JSON.stringify(input) } },
    { type: 'content_block_stop', index: 0 },
    { type: 'message_delta', delta: { stop_reason: 'tool_use' } },
  ]);
}
const text = (t: string) => () => sse([
  { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: t } },
  { type: 'message_delta', delta: { stop_reason: 'end_turn' } },
]);

function seed() {
  const st = sbState();
  st.ops = [];
  st.users = { 'tok-admin': 'u-admin', 'tok-op': 'u-op', 'tok-op-member': 'u-op-member', 'tok-insp': 'u-insp' };
  st.tables = {
    profiles: [
      { id: 'u-admin', company_id: 'A', role: 'admin', name: 'Cust Admin' },
      { id: 'u-op', company_id: 'A', role: 'admin', name: 'Operator' },
      { id: 'u-op-member', company_id: 'A', role: 'inspector', name: 'Operator Member' },
      { id: 'u-insp', company_id: 'A', role: 'inspector', name: 'Inspector' },
      { id: 'u-b', company_id: 'B', role: 'admin', name: 'Other Co Admin' },
    ],
    platform_operators: [{ user_id: 'u-op' }, { user_id: 'u-op-member' }],
    ai_settings: [{ company_id: 'A', anthropic_api_key: FAKE_KEY, model: 'claude-haiku-4-5', admin_tools_enabled: true }],
    companies: [{ id: 'A', name: 'Alpha Co' }, { id: 'B', name: 'Bravo Co' }],
    clients: [{ id: 'c-A', company_id: 'A' }, { id: 'c-B', company_id: 'B' }],
    jobs: [{ id: 'j-A', company_id: 'A' }, { id: 'j-B', company_id: 'B' }],
    invoices: [{ id: 'i-A', company_id: 'A' }, { id: 'i-B', company_id: 'B' }],
    compliance_items: [{ id: 'k-A', company_id: 'A' }, { id: 'k-B', company_id: 'B' }],
    templates: [],
    inspections: [],
    agent_actions: [],
    agent_reminders: [],
    ai_console_sessions: [],
  };
  anthropicQueue = [];
  anthropicCalls = [];
}
const inserts = (table: string) =>
  sbState().ops.filter((o) => o.table === table && (o.op === 'insert' || o.op === 'upsert'));

beforeAll(async () => {
  g.EdgeRuntime = { waitUntil: (p: unknown) => p };
  g.Deno = { env: { get: (k: string) => env[k] }, serve: (h) => { g.__handler = h; } };
  g.fetch = (async (url: string, init?: RequestInit) => {
    if (String(url).startsWith('https://api.anthropic.com/')) {
      anthropicCalls.push(JSON.parse(String(init?.body ?? '{}')));
      const next = anthropicQueue.shift();
      if (!next) throw new Error('probe: no scripted Anthropic response');
      return next();
    }
    throw new Error('probe: unexpected fetch ' + url);
  }) as typeof fetch;
  seed();
  const consoleMod = await import('../../supabase/functions/ai-console/index.ts');
  consoleHandler = g.__handler!;
  executeTool = consoleMod.executeTool;
  await import('../../supabase/functions/ai-settings/index.ts');
  settingsHandler = g.__handler!;
});
beforeEach(seed);

async function chat(token: string, messages: unknown, path = 'chat') {
  const res = await consoleHandler(new Request(`http://edge.local/ai-console/${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages }),
  }));
  return { status: res.status, body: await res.text() };
}
const toolNamesSent = (i = 0) => ((anthropicCalls[i]?.tools as Array<{ name: string }> | undefined) ?? []).map((t) => t.name).sort();
const toolResult = (i = 1) => {
  const msgs = (anthropicCalls[i]?.messages as Array<{ content?: unknown }> | undefined) ?? [];
  const last = msgs[msgs.length - 1];
  return Array.isArray(last?.content) ? String((last.content[0] as { content?: string })?.content ?? '') : '';
};
const ask = [{ role: 'user', content: 'do it' }];

describe('M01 M04 M05 M10 operator identity', () => {
  it('M01/M04 customer admin cannot chat', async () => {
    anthropicQueue.push(text('ok'));
    const r = await chat('tok-admin', ask);
    expect(r.status).toBe(403);
    expect(anthropicCalls.length).toBe(0);
  });

  it('M10 operator who is not a company admin can chat', async () => {
    anthropicQueue.push(text('ok'));
    const r = await chat('tok-op-member', ask);
    expect(r.status).toBe(200);
    expect(anthropicCalls.length).toBe(1);
  });

  it('M05 non-admin operator is still offered write tools', async () => {
    anthropicQueue.push(text('ok'));
    await chat('tok-op-member', ask);
    expect(toolNamesSent()).toContain('create_job');
  });
});

describe('M08 M11 executeTool refusal', () => {
  it('M08/M11 non-operator executeTool create_job writes nothing', async () => {
    const result = await executeTool('create_job', { title: 'Forged job' }, 'A', 'u-admin', false);
    expect(result).toBe('Error: that tool is not available.');
    expect(inserts('jobs')).toEqual([]);
  });
});

describe('M14 to M18 company scope', () => {
  it('M14 create_job with a company-B client is refused', async () => {
    anthropicQueue.push(toolUse('create_job', { title: 'x', client_id: 'c-B' }), text('done'));
    await chat('tok-op', ask);
    expect(inserts('jobs')).toEqual([]);
  });
  it('M15 create_job company_id is forced server-side', async () => {
    anthropicQueue.push(toolUse('create_job', { title: 'Op job', company_id: 'B' }), text('done'));
    await chat('tok-op', ask);
    expect(inserts('jobs').map((o) => (o.payload as { company_id: string }).company_id)).toEqual(['A']);
  });
  it('M16 create_reminder company_id is forced server-side', async () => {
    anthropicQueue.push(toolUse('create_reminder', { title: 'r', company_id: 'B' }), text('done'));
    await chat('tok-op', ask);
    expect(inserts('agent_reminders').map((o) => (o.payload as { company_id: string }).company_id)).toEqual(['A']);
  });
  it('M17 create_compliance_item with a company-B client is refused', async () => {
    anthropicQueue.push(toolUse('create_compliance_item', { client_id: 'c-B', title: 'x', first_due_date: '2027-01-01' }), text('done'));
    await chat('tok-op', ask);
    expect(inserts('compliance_items')).toEqual([]);
  });
  it('R05 unknown related_type with a foreign related_id is refused', async () => {
    anthropicQueue.push(
      toolUse('create_reminder', { title: 'r', related_type: 'site', related_id: 'c-B' }),
      text('done'),
    );
    await chat('tok-op', ask);
    expect(toolResult()).toBe(RELATED_TYPE_REQUIRED_ERROR);
    expect(inserts('agent_reminders')).toEqual([]);
  });
  it.each([
    ['client', 'c-B'],
    ['job', 'j-B'],
    ['invoice', 'i-B'],
    ['compliance', 'k-B'],
  ] as const)('refuses foreign related_id for reminder type %s', async (kind, id) => {
    anthropicQueue.push(
      toolUse('create_reminder', { title: 'r', related_type: kind, related_id: id }),
      text('done'),
    );
    await chat('tok-op', ask);
    expect(inserts('agent_reminders')).toEqual([]);
  });
  it('M18 get_company_context only returns own company', async () => {
    anthropicQueue.push(toolUse('get_company_context', {}), text('done'));
    await chat('tok-op', ask);
    const r = toolResult();
    expect(r).toContain('Alpha Co');
    expect(r).not.toContain('Bravo Co');
    expect(r).not.toContain('Other Co Admin');
  });
});

const YEAR_KILL_CASES = [
  ['0026-02-11', false],
  ['212026-02-11', false],
  ['1899-12-31', false],
  ['2101-01-01', false],
  ['2027-01-01', true],
] as const;

describe('P0 year guard CALLS the edge function', () => {
  it.each(YEAR_KILL_CASES)(
    'create_compliance_item first_due_date %s via /chat',
    async (d, ok) => {
      anthropicQueue.push(
        toolUse('create_compliance_item', { client_id: 'c-A', title: 'x', first_due_date: d }),
        text('done'),
      );
      const r = await chat('tok-op', ask);
      expect(r.status).toBe(200);
      if (ok) {
        expect(inserts('compliance_items').length).toBe(1);
        expect(toolResult()).toMatch(/created/i);
      } else {
        expect(toolResult()).toBe(DUE_DATE_INVALID_ERROR);
        expect(inserts('compliance_items')).toEqual([]);
      }
    },
  );
  it('Y15 refuses create_compliance_item 2027-02-30 with no insert', async () => {
    anthropicQueue.push(
      toolUse('create_compliance_item', { client_id: 'c-A', title: 'x', first_due_date: '2027-02-30' }),
      text('done'),
    );
    const r = await chat('tok-op', ask);
    expect(r.status).toBe(200);
    expect(toolResult()).toBe(DUE_DATE_INVALID_ERROR);
    expect(inserts('compliance_items')).toEqual([]);
  });
  it.each(YEAR_KILL_CASES)(
    'create_reminder due_date %s via /chat',
    async (d, ok) => {
      anthropicQueue.push(
        toolUse('create_reminder', { title: 'r', due_date: d }),
        text('done'),
      );
      const r = await chat('tok-op', ask);
      expect(r.status).toBe(200);
      if (ok) {
        expect(inserts('agent_reminders').length).toBe(1);
        expect(toolResult()).toMatch(/created/i);
      } else {
        expect(toolResult()).toBe(DUE_DATE_INVALID_ERROR);
        expect(inserts('agent_reminders')).toEqual([]);
      }
    },
  );
});

describe('M49 M50 M51 503 path', () => {
  it.each([
    ['no row', []],
    ['null key', [{ company_id: 'A', anthropic_api_key: null, model: 'claude-haiku-4-5' }]],
    ['empty key', [{ company_id: 'A', anthropic_api_key: '', model: 'claude-haiku-4-5' }]],
  ])('operator chat with %s -> 503 and no Anthropic call', async (_n, rows) => {
    sbState().tables.ai_settings = rows as Record<string, unknown>[];
    const r = await chat('tok-op', ask);
    expect(r.status).toBe(503);
    expect(JSON.parse(r.body)).toEqual({ error: expect.stringMatching(/No API key configured/) });
    expect(anthropicCalls.length).toBe(0);
  });
});

describe('M52 M53 ai-settings admin and company', () => {
  it('M52 customer admin POST is refused', async () => {
    const res = await settingsHandler(new Request('http://edge.local/ai-settings', {
      method: 'POST',
      headers: { Authorization: 'Bearer tok-admin' },
      body: JSON.stringify({ model: 'x' }),
    }));
    expect(res.status).toBe(403);
    expect(inserts('ai_settings')).toEqual([]);
  });
  it('M53 operator POST with company_id=B upserts company A only', async () => {
    const res = await settingsHandler(new Request('http://edge.local/ai-settings', {
      method: 'POST',
      headers: { Authorization: 'Bearer tok-op' },
      body: JSON.stringify({ model: 'm', company_id: 'B' }),
    }));
    expect(res.status).toBe(200);
    expect(inserts('ai_settings').map((o) => (o.payload as { company_id: string }).company_id)).toEqual(['A']);
  });
  it('GET has no last4', async () => {
    const res = await settingsHandler(new Request('http://edge.local/ai-settings', {
      headers: { Authorization: 'Bearer tok-admin' },
    }));
    const raw = await res.text();
    expect(res.status).toBe(200);
    expect(JSON.parse(raw)).toEqual({ keySet: true, model: 'claude-haiku-4-5' });
    expect(raw).not.toContain('wxyz');
    expect(raw).not.toContain('last4');
    expect(raw).not.toContain('maskedKey');
    expect(raw).not.toContain('anthropic_api_key');
  });
  it('L02 L03 operator GET body is exactly keySet and model', async () => {
    const res = await settingsHandler(new Request('http://edge.local/ai-settings', {
      headers: { Authorization: 'Bearer tok-op' },
    }));
    const raw = await res.text();
    expect(res.status).toBe(200);
    expect(JSON.parse(raw)).toEqual({ keySet: true, model: 'claude-haiku-4-5' });
    expect(Object.keys(JSON.parse(raw)).sort()).toEqual(['keySet', 'model']);
    expect(raw).not.toContain('wxyz');
    expect(raw).not.toContain('last4');
    expect(raw).not.toContain('maskedKey');
  });
});

describe('M56 M57 session scope', () => {
  it('M56 GET sessions/:id of another user -> 404', async () => {
    sbState().tables.ai_console_sessions = [{ id: 's-other', user_id: 'u-b', company_id: 'B', title: 't', messages: [] }];
    const res = await consoleHandler(new Request('http://edge.local/ai-console/sessions/s-other', {
      headers: { Authorization: 'Bearer tok-op' },
    }));
    expect(res.status).toBe(404);
  });
  it('M57 DELETE sessions/:id of another user leaves it', async () => {
    sbState().tables.ai_console_sessions = [{ id: 's-other', user_id: 'u-b', company_id: 'B', title: 't', messages: [] }];
    await consoleHandler(new Request('http://edge.local/ai-console/sessions/s-other', {
      method: 'DELETE',
      headers: { Authorization: 'Bearer tok-op' },
    }));
    expect(sbState().tables.ai_console_sessions.length).toBe(1);
  });
});

describe('O05 actions operator gate', () => {
  it('customer admin GET /actions is 403', async () => {
    const res = await consoleHandler(new Request('http://edge.local/ai-console/actions', {
      headers: { Authorization: 'Bearer tok-admin' },
    }));
    expect(res.status).toBe(403);
  });
  it('operator GET /actions is 200', async () => {
    const res = await consoleHandler(new Request('http://edge.local/ai-console/actions', {
      headers: { Authorization: 'Bearer tok-op' },
    }));
    expect(res.status).toBe(200);
    expect(JSON.parse(await res.text())).toEqual({ actions: [] });
  });
});

describe('caps and stream errors', () => {
  it('413 for a 2 MB user message', async () => {
    anthropicQueue.push(text('ok'));
    const r = await chat('tok-op', [{ role: 'user', content: 'x'.repeat(2_000_000) }]);
    expect(r.status).toBe(413);
    expect(anthropicCalls.length).toBe(0);
  });
  it('400 for 500 user turns', async () => {
    anthropicQueue.push(text('ok'));
    const r = await chat('tok-op', Array.from({ length: 500 }, () => ({ role: 'user', content: 'hi' })));
    expect(r.status).toBe(400);
    expect(anthropicCalls.length).toBe(0);
  });
  it('does not pass mid-stream Anthropic error events through raw', async () => {
    anthropicQueue.push(() => new Response(
      'event: error\ndata: {"type":"error","error":{"type":"overloaded_error","message":"UPSTREAM-MIDSTREAM-DETAIL"}}\n\n',
      { status: 200 },
    ));
    const r = await chat('tok-op', ask);
    expect(r.body).not.toContain('UPSTREAM-MIDSTREAM-DETAIL');
    expect(r.body).toContain('The assistant is unavailable');
  });
  it('E04 does not pass a non-ok Anthropic body through', async () => {
    anthropicQueue.push(() => new Response('UPSTREAM-NONOK-DETAIL', { status: 529 }));
    const r = await chat('tok-op', ask);
    expect(r.body).not.toContain('UPSTREAM-NONOK-DETAIL');
    expect(r.body).toContain('The assistant is unavailable');
  });
  it('null chat body is 400 not 500 and has no raw parse text', async () => {
    const res = await consoleHandler(new Request('http://edge.local/ai-console/chat', {
      method: 'POST',
      headers: { Authorization: 'Bearer tok-op', 'Content-Type': 'application/json' },
      body: 'null',
    }));
    const raw = await res.text();
    expect(res.status).toBe(400);
    expect(raw).not.toMatch(/TypeError|Cannot read|undefined/i);
  });
});

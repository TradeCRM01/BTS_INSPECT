import { assertEquals } from "jsr:@std/assert@1";
import { CLIENT_PORTAL_TABLE_COLUMNS } from "./portalColumns.ts";
import { createPortalStub, IDS, sameCompanySeed } from "./portalAdminStub.ts";
import { setPortalAdminForTest } from "./portalAdmin.ts";
import { handleClientPortalRequest } from "./index.ts";

type QueryResult = { data: unknown; error: unknown };

type QueryChain = {
  select: (cols?: string) => QueryChain;
  eq: (col?: string, val?: unknown) => QueryChain;
  in: (col?: string, val?: unknown) => QueryChain;
  update: (payload?: unknown) => QueryChain;
  maybeSingle: () => Promise<QueryResult>;
  then: (
    onfulfilled?: ((value: QueryResult) => unknown) | null,
    onrejected?: ((reason: unknown) => unknown) | null,
  ) => Promise<unknown>;
};

const DB_COLUMN_GONE = "column reports.created_at does not exist";

function failedQuery(message: string): QueryChain {
  const result: QueryResult = { data: null, error: { code: "42703", message } };
  const chain: QueryChain = {
    select: () => chain,
    eq: () => chain,
    in: () => chain,
    update: () => chain,
    maybeSingle: async () => result,
    then(onfulfilled, onrejected) {
      return Promise.resolve(result).then(onfulfilled ?? undefined, onrejected ?? undefined);
    },
  };
  return chain;
}

function wrapFrom(
  stub: ReturnType<typeof createPortalStub>,
  hijack: (table: string, inner: (table: string) => QueryChain) => QueryChain,
) {
  const inner = stub.admin.from.bind(stub.admin) as (table: string) => QueryChain;
  return {
    from(table: string) {
      return hijack(table, inner);
    },
    storage: stub.admin.storage,
  };
}

function wrapUpdateError(
  stub: ReturnType<typeof createPortalStub>,
  table: string,
  message: string,
) {
  return wrapFrom(stub, (name, inner) => {
    const query = inner(name);
    if (name !== table) return query;
    query.update = () => failedQuery(message);
    return query;
  });
}

function assertGeneric500(res: Response, body: { error?: string }) {
  assertEquals(res.status, 500);
  assertEquals(body.error, "Portal error");
  const text = JSON.stringify(body);
  assertEquals(text.includes("does not exist"), false);
  assertEquals(text.includes("created_at"), false);
  assertEquals(text.includes("42703"), false);
  assertEquals(text.includes(DB_COLUMN_GONE), false);
}

Deno.test("stub rejects reports.created_at because it is not in the committed column map", async () => {
  const { admin } = createPortalStub(sameCompanySeed());
  const { data, error } = await admin.from("reports").select("id, created_at").maybeSingle();
  assertEquals(data, null);
  assertEquals(error, {
    code: "42703",
    message: DB_COLUMN_GONE,
  });
});

Deno.test("stub accepts reports.generated_at from the same map", async () => {
  const { admin } = createPortalStub(sameCompanySeed());
  const { data, error } = await admin
    .from("reports")
    .select("id, report_number, pdf_storage_path, generated_at")
    .eq("id", IDS.reportA)
    .maybeSingle();
  assertEquals(error, null);
  const row = data as { generated_at?: string } | null;
  assertEquals(row?.generated_at, "2026-01-15T00:00:00.000Z");
  assertEquals(CLIENT_PORTAL_TABLE_COLUMNS.reports.includes("generated_at"), true);
  assertEquals(CLIENT_PORTAL_TABLE_COLUMNS.reports.includes("created_at"), false);
});

Deno.test("stub rejects jobs.priorityx insert because it is not in the committed column map", async () => {
  const { admin } = createPortalStub(sameCompanySeed());
  const { data, error } = await admin.from("jobs").insert({ priorityx: "medium" }).select("id").single();
  assertEquals(data, null);
  assertEquals(error, {
    code: "42703",
    message: "column jobs.priorityx does not exist",
  });
});

Deno.test("accepted quote job insert uses jobs.priority from the column map", async () => {
  const seed = sameCompanySeed();
  seed.tables.quotes[0].created_by = IDS.inspectorA;
  seed.tables.quotes[0].line_items = [];
  const stub = createPortalStub(seed);
  setPortalAdminForTest(stub.admin);
  try {
    const req = new Request("https://portal.test/", {
      method: "POST",
      body: JSON.stringify({ token: IDS.portalTokenA, action: "accept_quote", quoteId: IDS.quoteA }),
    });
    const res = await handleClientPortalRequest(req);
    const body = await res.json() as { ok?: boolean };
    assertEquals(res.status, 200);
    assertEquals(body.ok, true);
    const insert = stub.calls.find((call) => call.table === "jobs" && call.op === "insert");
    const payload = (insert?.payload ?? {}) as Record<string, unknown>;
    assertEquals(Object.hasOwn(payload, "priority"), true);
    assertEquals(Object.hasOwn(payload, "priorityx"), false);
    for (const key of Object.keys(payload)) {
      assertEquals(CLIENT_PORTAL_TABLE_COLUMNS.jobs.includes(key), true, `jobs.${key}`);
    }
  } finally {
    setPortalAdminForTest(null);
  }
});

Deno.test("share reports select error is 500 Portal error, not the DB message", async () => {
  const stub = createPortalStub(sameCompanySeed());
  setPortalAdminForTest(wrapFrom(stub, (table, inner) => (
    table === "reports" ? failedQuery(DB_COLUMN_GONE) : inner(table)
  )));
  try {
    const res = await handleClientPortalRequest(
      new Request(`https://portal.test/?token=${IDS.shareTokenA}`),
    );
    const body = await res.json() as { error?: string };
    assertGeneric500(res, body);
  } finally {
    setPortalAdminForTest(null);
  }
});

Deno.test("portal reports select error is 500 Portal error, not the DB message", async () => {
  const stub = createPortalStub(sameCompanySeed());
  setPortalAdminForTest(wrapFrom(stub, (table, inner) => (
    table === "reports" ? failedQuery(DB_COLUMN_GONE) : inner(table)
  )));
  try {
    const res = await handleClientPortalRequest(
      new Request(`https://portal.test/?token=${IDS.portalTokenA}`),
    );
    const body = await res.json() as { error?: string };
    assertGeneric500(res, body);
  } finally {
    setPortalAdminForTest(null);
  }
});

Deno.test("share last_accessed_at update error is 500 Portal error, not the DB message", async () => {
  const stub = createPortalStub(sameCompanySeed());
  const message = "column inspection_report_shares.last_accessed_atx does not exist";
  setPortalAdminForTest(wrapUpdateError(stub, "inspection_report_shares", message));
  try {
    const res = await handleClientPortalRequest(
      new Request(`https://portal.test/?token=${IDS.shareTokenA}`),
    );
    const body = await res.json() as { error?: string };
    assertGeneric500(res, body);
    assertEquals(JSON.stringify(body).includes("last_accessed_atx"), false);
  } finally {
    setPortalAdminForTest(null);
  }
});

Deno.test("portal last_accessed_at update error is 500 Portal error, not the DB message", async () => {
  const stub = createPortalStub(sameCompanySeed());
  const message = "column client_portal_tokens.last_accessed_atx does not exist";
  setPortalAdminForTest(wrapUpdateError(stub, "client_portal_tokens", message));
  try {
    const res = await handleClientPortalRequest(
      new Request(`https://portal.test/?token=${IDS.portalTokenA}`),
    );
    const body = await res.json() as { error?: string };
    assertGeneric500(res, body);
    assertEquals(JSON.stringify(body).includes("last_accessed_atx"), false);
  } finally {
    setPortalAdminForTest(null);
  }
});

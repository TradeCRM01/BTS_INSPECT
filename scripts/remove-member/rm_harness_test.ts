import { assertEquals, assert } from "jsr:@std/assert@1";

const OWNER = "owner-1";
const ADMIN = "admin-1";
const MEMBER = "member-1";
const RAW = 'null value in column "inspector_id" of relation "inspections" violates not-null constraint';

let handler: (r: Request) => Promise<Response>;
(Deno as unknown as { serve: (h: (r: Request) => Promise<Response>) => unknown }).serve = (h) => {
  handler = h;
  return {};
};

Deno.env.set("SUPABASE_URL", "http://x");
Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "k");
Deno.env.set("SUPABASE_ANON_KEY", "k");

function scenario(o: { deleteError?: unknown; throwOnDelete?: boolean; ownerIs?: string }) {
  const S = {
    user: { id: ADMIN },
    calls: [] as Array<Record<string, unknown>>,
    resolve: (op: { table: string; kind: string; filters: Record<string, unknown>; head?: boolean }): unknown => {
      if (op.table === "profiles" && op.kind === "select" && op.head) return { count: 2, error: null };
      if (op.table === "profiles" && op.kind === "select" && op.filters.id === ADMIN) {
        return { data: { role: "admin", company_id: "A" }, error: null };
      }
      if (op.table === "profiles" && op.kind === "select") {
        return { data: { company_id: "A", role: "member" }, error: null };
      }
      if (op.table === "companies") return { data: { created_by: o.ownerIs ?? OWNER }, error: null };
      if (op.table === "profiles" && op.kind === "delete") {
        if (o.throwOnDelete) throw new Error(RAW);
        return { error: o.deleteError ?? null };
      }
      return { data: null, error: null };
    },
  };
  (globalThis as { __RM?: typeof S }).__RM = S;
  return S;
}

const origErr = console.error;
console.error = () => {};
await import(new URL("../../supabase/functions/remove-member/index.ts", import.meta.url).href);
console.error = origErr;

const call = (memberId: string) =>
  handler(new Request("http://x", {
    method: "POST",
    headers: { Authorization: "Bearer t" },
    body: JSON.stringify({ memberId }),
  }));

Deno.test("RM1 delete 23502 -> 500 friendly, no raw text", async () => {
  scenario({ deleteError: { code: "23502", message: RAW } });
  const r = await call(MEMBER);
  const b = await r.json();
  assertEquals(r.status, 500);
  assertEquals(b.error, "Couldn't remove this member. Try again or contact support.");
  assert(!JSON.stringify(b).includes("null value"));
});

Deno.test("RM2 thrown error -> 500 friendly, no raw text", async () => {
  scenario({ throwOnDelete: true });
  const r = await call(MEMBER);
  const b = await r.json();
  assertEquals(r.status, 500);
  assertEquals(b.error, "Couldn't remove this member. Try again or contact support.");
  assert(!JSON.stringify(b).includes("null value"));
});

Deno.test("RM3 owner target -> 403, profile delete never attempted", async () => {
  const S = scenario({});
  const r = await call(OWNER);
  const b = await r.json();
  assertEquals(r.status, 403);
  assert(String(b.error).includes("owner"));
  assertEquals(S.calls.filter((c) => c.kind === "delete" || c.kind === "deleteUser").length, 0);
});

Deno.test("RM4 happy path -> 200, profile then auth user deleted", async () => {
  const S = scenario({});
  const r = await call(MEMBER);
  assertEquals(r.status, 200);
  assertEquals(
    S.calls.filter((c) => c.kind === "delete" || c.kind === "deleteUser").map((c) => c.kind),
    ["delete", "deleteUser"],
  );
});

type Op = { table: string; kind: string; filters: Record<string, unknown>; head?: boolean };
export function createClient(_url: string, _key: string, _opts?: unknown) {
  const S = (globalThis as { __RM?: {
    user: { id: string };
    calls: Array<Record<string, unknown>>;
    resolve: (op: Op) => unknown;
  } }).__RM;
  if (!S) throw new Error("mock supabase missing __RM");
  return {
    auth: {
      getUser: async () => ({ data: { user: S.user }, error: null }),
      admin: {
        deleteUser: async (id: string) => {
          S.calls.push({ table: "auth.users", kind: "deleteUser", filters: { id } });
          return { error: null };
        },
      },
    },
    from(table: string) {
      const op: Op = { table, kind: "select", filters: {} };
      const b: {
        select: (c: string, o?: { head?: boolean }) => typeof b;
        delete: () => typeof b;
        eq: (k: string, v: unknown) => typeof b;
        maybeSingle: () => Promise<unknown>;
        then: (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => Promise<unknown>;
      } = {
        select(_c: string, o?: { head?: boolean }) {
          op.head = !!o?.head;
          return b;
        },
        delete() {
          op.kind = "delete";
          return b;
        },
        eq(k: string, v: unknown) {
          op.filters[k] = v;
          return b;
        },
        maybeSingle() {
          S.calls.push(op);
          return Promise.resolve(S.resolve(op));
        },
        then(res: (v: unknown) => unknown, rej: (e: unknown) => unknown) {
          S.calls.push(op);
          try {
            return Promise.resolve(S.resolve(op)).then(res, rej);
          } catch (e) {
            return Promise.reject(e).then(res, rej);
          }
        },
      };
      return b;
    },
  };
}

import type { ReactNode } from 'react';
import { COMPANY, MEMBERS, PROFILE, TABLES, type Row } from './fixture.ts';
import type { LedgerWrite } from './matrix.ts';

export const ledger: { writes: LedgerWrite[]; unmocked: string[] } = { writes: [], unmocked: [] };

type Result = { data: unknown; error: null; count: number | null };
type Filter = { label: string; test: (row: Row) => boolean };
type WriteOp = 'insert' | 'update' | 'upsert' | 'delete';

const likeToRegExp = (pattern: string) =>
  new RegExp(`^${pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/%/g, '.*')}$`, 'i');

function orClause(clause: string): (row: Row) => boolean {
  const [col, op, ...rest] = clause.split('.');
  const value = rest.join('.');
  if (op === 'ilike') return row => likeToRegExp(value).test(String(row[col] ?? ''));
  if (op === 'eq') return row => String(row[col]) === value;
  ledger.unmocked.push(`or(${clause})`);
  return () => false;
}

class Query implements PromiseLike<Result> {
  private filters: Filter[] = [];
  private sorts: { col: string; ascending: boolean; nullsFirst: boolean }[] = [];
  private max: number | null = null;
  private one: 'single' | 'maybe' | null = null;
  private write: WriteOp | null = null;
  private readonly table: string;

  constructor(table: string) {
    this.table = table;
  }

  select() { return this; }
  insert() { return this.writeOp('insert'); }
  update() { return this.writeOp('update'); }
  upsert() { return this.writeOp('upsert'); }
  delete() { return this.writeOp('delete'); }
  eq(col: string, v: unknown) { return this.where(`${col}=${String(v)}`, r => r[col] === v); }
  neq(col: string, v: unknown) { return this.where(`${col}!=${String(v)}`, r => r[col] !== v); }
  gte(col: string, v: string) { return this.where(`${col}>=${v}`, r => r[col] != null && String(r[col]) >= v); }
  lte(col: string, v: string) { return this.where(`${col}<=${v}`, r => r[col] != null && String(r[col]) <= v); }
  is(col: string, v: null) { return this.where(`${col} is ${String(v)}`, r => (r[col] ?? null) === v); }
  in(col: string, vs: readonly unknown[]) { return this.where(`${col} in ${vs.length}`, r => vs.includes(r[col])); }
  ilike(col: string, p: string) { return this.where(`${col}~${p}`, r => likeToRegExp(p).test(String(r[col] ?? ''))); }
  not(col: string, op: string, v: unknown) {
    if (op === 'in' && typeof v === 'string') {
      const vs = v.replace(/^\(|\)$/g, '').split(',');
      return this.where(`${col} not in ${v}`, r => !vs.includes(String(r[col])));
    }
    if (op === 'is' && v === null) return this.where(`${col} not null`, r => r[col] != null);
    ledger.unmocked.push(`from(${this.table}).not(${col}.${op})`);
    return this;
  }
  or(expr: string) {
    const tests = expr.split(',').map(orClause);
    return this.where(`or(${expr})`, r => tests.some(t => t(r)));
  }
  order(col: string, opts: { ascending?: boolean; nullsFirst?: boolean } = {}) {
    this.sorts.push({ col, ascending: opts.ascending !== false, nullsFirst: opts.nullsFirst ?? opts.ascending === false });
    return this;
  }
  limit(n: number) { this.max = n; return this; }
  single() { this.one = 'single'; return this; }
  maybeSingle() { this.one = 'maybe'; return this; }

  then<A = Result, B = never>(ok?: ((v: Result) => A | PromiseLike<A>) | null, bad?: ((e: unknown) => B | PromiseLike<B>) | null) {
    return Promise.resolve(this.run()).then(ok, bad);
  }

  private where(label: string, test: (row: Row) => boolean) {
    this.filters.push({ label, test });
    return this;
  }

  private writeOp(op: WriteOp) {
    this.write = op;
    return this;
  }

  private run(): Result {
    if (this.write) {
      ledger.writes.push({ table: this.table, op: this.write, filters: this.filters.map(f => f.label) });
      return { data: null, error: null, count: null };
    }
    const source = TABLES[this.table];
    if (!source) {
      ledger.unmocked.push(`from(${this.table})`);
      return { data: this.one ? null : [], error: null, count: 0 };
    }
    let rows = source.filter(r => this.filters.every(f => f.test(r)));
    for (const s of [...this.sorts].reverse()) {
      rows = [...rows].sort((a, b) => {
        const x = a[s.col];
        const y = b[s.col];
        if (x == null || y == null) return x == y ? 0 : (x == null) === s.nullsFirst ? -1 : 1;
        const c = String(x).localeCompare(String(y));
        return s.ascending ? c : -c;
      });
    }
    if (this.max != null) rows = rows.slice(0, this.max);
    const data = this.one ? rows[0] ?? null : rows;
    return { data: structuredClone(data), error: null, count: rows.length };
  }
}

function strict<T extends object>(name: string, target: T): T {
  return new Proxy(target, {
    get(t, key, receiver) {
      if (key in t || typeof key === 'symbol') return Reflect.get(t, key, receiver);
      ledger.unmocked.push(`${name}.${key}`);
      return () => receiver;
    },
  });
}

const session = { access_token: 'p2-fixture', user: { id: PROFILE.id, email: PROFILE.email } };
const inertChannel = strict('channel', { on() { return inertChannel; }, subscribe() { return inertChannel; }, unsubscribe() {} });

export const supabase = strict('supabase', {
  from: (table: string) => strict(`from(${table})`, new Query(table)),
  rpc: async (name: string) => {
    if (name === 'get_company_members') return { data: structuredClone(MEMBERS), error: null };
    if (name === 'is_platform_operator') return { data: false, error: null };
    ledger.unmocked.push(`rpc(${name})`);
    return { data: null, error: null };
  },
  channel: () => inertChannel,
  removeChannel: async () => 'ok',
  auth: strict('auth', {
    getSession: async () => ({ data: { session }, error: null }),
    getUser: async () => ({ data: { user: session.user }, error: null }),
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
    signOut: async () => ({ error: null }),
  }),
});

const auth = {
  user: session.user,
  session,
  profile: PROFILE,
  company: COMPANY,
  loading: false,
  isPlatformOperator: false,
  signOut: async () => {},
  refreshProfile: async () => {},
};

export function useAuth() {
  return auth;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  return children;
}

export function useCompanyAiKey() {
  return { ready: true, hasKey: false };
}

export function DevConsole() {
  return null;
}

export function GlobalSearch() {
  return null;
}

export function GlobalSearchTrigger() {
  return null;
}

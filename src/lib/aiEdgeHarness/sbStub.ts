type Row = Record<string, unknown>;
type State = { tables: Record<string, Row[]>; users: Record<string, string>; ops: Array<Record<string, unknown>> };

const g = globalThis as { __sb?: State };

export function sbState(): State {
  g.__sb ??= { tables: {}, users: {}, ops: [] };
  return g.__sb;
}

let seq = 0;

class Q {
  table: string;
  filters: Array<[string, unknown]> = [];
  ins: Array<[string, unknown[]]> = [];
  op = 'select';
  payload: unknown = null;
  one = false;
  constructor(t: string) {
    this.table = t;
  }
  select() {
    return this;
  }
  eq(c: string, v: unknown) {
    this.filters.push([c, v]);
    return this;
  }
  in(c: string, v: unknown[]) {
    this.ins.push([c, v]);
    return this;
  }
  order() {
    return this;
  }
  limit() {
    return this;
  }
  gte() {
    return this;
  }
  lte() {
    return this;
  }
  insert(p: unknown) {
    this.op = 'insert';
    this.payload = p;
    return this;
  }
  update(p: unknown) {
    this.op = 'update';
    this.payload = p;
    return this;
  }
  upsert(p: unknown) {
    this.op = 'upsert';
    this.payload = p;
    return this;
  }
  delete() {
    this.op = 'delete';
    return this;
  }
  maybeSingle() {
    this.one = true;
    return this.exec();
  }
  single() {
    this.one = true;
    return this.exec();
  }
  then(res: (value: unknown) => unknown, rej?: (reason: unknown) => unknown) {
    return this.exec().then(res, rej);
  }
  async exec() {
    const st = sbState();
    st.ops.push({ table: this.table, op: this.op, payload: this.payload, filters: this.filters });
    if (this.table === '__rpc') return { data: null, error: { message: 'no rpc' } };
    const rows = (st.tables[this.table] ??= []);
    if (this.op === 'insert' || this.op === 'upsert') {
      const list = Array.isArray(this.payload) ? this.payload : [this.payload];
      const made = list.map((p) => ({ id: `new-${++seq}`, ...(p as Row) }));
      rows.push(...made);
      return { data: this.one ? made[0] : made, error: null };
    }
    const out = rows.filter((r) =>
      this.filters.every(([c, v]) => r[c] === v) && this.ins.every(([c, v]) => v.includes(r[c])),
    );
    if (this.op === 'delete') {
      st.tables[this.table] = rows.filter((r) => !out.includes(r));
      return { data: null, error: null };
    }
    if (this.op === 'update') {
      out.forEach((r) => Object.assign(r, this.payload));
      return { data: null, error: null };
    }
    return { data: this.one ? (out[0] ?? null) : out, error: null, count: out.length };
  }
}

export function createClient() {
  return {
    from: (t: string) => new Q(t),
    rpc: () => new Q('__rpc'),
    auth: {
      async getUser(token: string) {
        const id = sbState().users[token];
        return id
          ? { data: { user: { id } }, error: null }
          : { data: { user: null }, error: { message: 'bad jwt' } };
      },
    },
  };
}

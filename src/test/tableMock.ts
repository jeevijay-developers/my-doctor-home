// Test-only helper: a tiny chainable supabase stand-in keyed by table name.
// Every query-builder method returns the same builder; awaiting it (or calling
// single()/maybeSingle()) resolves with whatever `tables[table]` holds.
import { vi } from "vitest";

export type TableResult = { data: unknown; error?: unknown; count?: number | null };
export type TableSource = TableResult | ((ops: [string, ...unknown[]][]) => TableResult);

export type Recorded = { table: string; ops: [string, ...unknown[]][] };

export function createTableMock() {
  const tables: Record<string, TableSource> = {};
  const rpcs: Record<string, (args: any) => unknown> = {};
  const queries: Recorded[] = [];

  const resolve = (table: string, ops: [string, ...unknown[]][]): TableResult => {
    const src = tables[table];
    const r = typeof src === "function" ? src(ops) : src;
    return r ?? { data: [], error: null };
  };

  const from = vi.fn((table: string) => {
    const rec: Recorded = { table, ops: [] };
    queries.push(rec);
    const b: any = new Proxy(
      {},
      {
        get(_t, prop: string) {
          if (prop === "then") {
            return (res: any, rej: any) => Promise.resolve(resolve(table, rec.ops)).then(res, rej);
          }
          if (prop === "single" || prop === "maybeSingle") {
            return () => {
              rec.ops.push([prop]);
              const r = resolve(table, rec.ops);
              const data = Array.isArray(r.data) ? (r.data[0] ?? null) : r.data;
              return Promise.resolve({ ...r, data });
            };
          }
          return (...args: unknown[]) => {
            rec.ops.push([prop, ...args]);
            return b;
          };
        },
      },
    );
    return b;
  });

  const rpc = vi.fn(async (fn: string, args?: any) => {
    const h = rpcs[fn];
    if (!h) return { data: null, error: null };
    const out = await h(args);
    return out && typeof out === "object" && ("data" in (out as object) || "error" in (out as object))
      ? out
      : { data: out, error: null };
  });

  const channelObj: any = { on: vi.fn(() => channelObj), subscribe: vi.fn(() => channelObj) };
  const channel = vi.fn(() => channelObj);
  const removeChannel = vi.fn();
  const invoke = vi.fn(async () => ({ data: { ok: true }, error: null }));

  const client = {
    from,
    rpc,
    channel,
    removeChannel,
    functions: { invoke },
    auth: {
      getUser: vi.fn(async () => ({ data: { user: { id: "u1" } } })),
      getSession: vi.fn(async () => ({ data: { session: { user: { id: "u1" } } } })),
      onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
      signOut: vi.fn(async () => ({})),
    },
  };

  const opsOf = (table: string) => queries.filter((q) => q.table === table);
  const hasOp = (q: Recorded, op: string, ...args: unknown[]) =>
    q.ops.some((o) => o[0] === op && args.every((a, i) => o[i + 1] === a));

  return { client, tables, rpcs, queries, invoke, rpc, opsOf, hasOp };
}

// A minimal stand-in for the Supabase admin client used by server actions.
// Every query is recorded; `query` decides what each one returns and `rpc`
// answers database functions, so a test can model the rows (and the RPC
// semantics) it cares about.

export type FakeOperation = "select" | "insert" | "update" | "delete" | "upsert";

export type FakeCall = {
  table: string;
  operation: FakeOperation;
  filters: Array<[method: string, column: unknown, value: unknown]>;
  payload?: unknown;
  single: boolean;
};

export type FakeResult = { data?: unknown; error?: unknown; count?: number | null };

type Handlers = {
  query?: (call: FakeCall) => FakeResult | undefined;
  rpc?: (name: string, args: Record<string, unknown>) => FakeResult | Promise<FakeResult> | undefined;
};

const FILTER_METHODS = [
  "eq",
  "neq",
  "in",
  "is",
  "lt",
  "gt",
  "lte",
  "gte",
  "not",
  "or",
  "ilike",
  "order",
  "limit",
  "range",
  "match"
];

export function createFakeSupabase(handlers: Handlers) {
  const calls: FakeCall[] = [];
  const rpcCalls: Array<{ name: string; args: Record<string, unknown> }> = [];

  function from(table: string) {
    const call: FakeCall = { table, operation: "select", filters: [], single: false };
    let recorded = false;
    const resolve = () => {
      if (!recorded) {
        calls.push(call);
        recorded = true;
      }

      const result: FakeResult = handlers.query?.(call) ?? {};
      return { data: result.data ?? null, error: result.error ?? null, count: result.count ?? null };
    };
    const builder: Record<string, unknown> = {};

    for (const operation of ["insert", "update", "delete", "upsert"] as const) {
      builder[operation] = (payload?: unknown) => {
        call.operation = operation;
        call.payload = payload;
        return builder;
      };
    }

    builder.select = () => builder;

    for (const method of FILTER_METHODS) {
      builder[method] = (column: unknown, value: unknown) => {
        call.filters.push([method, column, value]);
        return builder;
      };
    }

    builder.maybeSingle = async () => {
      call.single = true;
      return resolve();
    };
    builder.single = builder.maybeSingle;
    builder.then = (onFulfilled: (value: unknown) => unknown, onRejected?: (reason: unknown) => unknown) =>
      Promise.resolve(resolve()).then(onFulfilled, onRejected);

    return builder;
  }

  const client = {
    from,
    rpc: async (name: string, args: Record<string, unknown>) => {
      rpcCalls.push({ name, args });
      const result: FakeResult = (await handlers.rpc?.(name, args)) ?? {};
      return { data: result.data ?? null, error: result.error ?? null };
    }
  };

  return { client, calls, rpcCalls };
}

export function filterValue(call: FakeCall, column: string, method = "eq") {
  return call.filters.find(([name, filterColumn]) => name === method && filterColumn === column)?.[2];
}

// The target of a next/navigation-style redirect error
// ("NEXT_REDIRECT;<type>;<url>;<status>;").
export function redirectUrlOf(error: unknown) {
  const digest = (error as { digest?: string } | null)?.digest ?? "";
  return digest.split(";").slice(2, -2).join(";");
}

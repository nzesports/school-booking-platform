// PostgREST caps every response at max_rows (1000 in supabase/config.toml), so
// a single select silently truncates any result that grows past it. Page with
// .range() until a short page comes back; the page size must not exceed
// max_rows. Every paged query needs a deterministic order ending in a unique
// column so rows can't shift between pages.
export const SUPABASE_PAGE_SIZE = 1000;

type PageResult<Row> = {
  data: Row[] | null;
  error: { message: string; code?: string } | null;
};

// A cache miss loads many tables, and several portals may refresh together.
// Bound page reads per server process so this fan-out cannot occupy every
// PostgREST connection and make a successful write redirect to an error page.
const MAX_CONCURRENT_PAGE_READS = 4;
let activePageReads = 0;
const waitingPageReads: Array<() => void> = [];

async function readPage<Row>(read: () => PromiseLike<PageResult<Row>>) {
  await new Promise<void>((resolve) => {
    if (activePageReads < MAX_CONCURRENT_PAGE_READS) {
      activePageReads += 1;
      resolve();
    } else {
      waitingPageReads.push(resolve);
    }
  });
  try {
    return await read();
  } finally {
    const next = waitingPageReads.shift();
    if (next) next();
    else activePageReads -= 1;
  }
}

export async function fetchAllRows<Row>(
  label: string,
  page: (from: number, to: number) => PromiseLike<PageResult<Row>>
) {
  const rows: Row[] = [];

  for (let from = 0; ; from += SUPABASE_PAGE_SIZE) {
    const read = () => readPage(() => page(from, from + SUPABASE_PAGE_SIZE - 1));
    let result = await read();
    // Retry only a transient pool-acquisition failure, once. Persistent or
    // unrelated failures still reject and never cache a false empty table.
    if (result.error?.code === "PGRST003") result = await read();
    const { data, error } = result;

    if (error) {
      throw new Error(`Unable to load ${label} (${error.code ?? "unknown"}): ${error.message}`);
    }

    rows.push(...(data ?? []));

    if (!data || data.length < SUPABASE_PAGE_SIZE) {
      return rows;
    }
  }
}

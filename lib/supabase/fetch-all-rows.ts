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

export async function fetchAllRows<Row>(
  label: string,
  page: (from: number, to: number) => PromiseLike<PageResult<Row>>
) {
  const rows: Row[] = [];

  for (let from = 0; ; from += SUPABASE_PAGE_SIZE) {
    const { data, error } = await page(from, from + SUPABASE_PAGE_SIZE - 1);

    if (error) {
      throw new Error(`Unable to load ${label} (${error.code ?? "unknown"}): ${error.message}`);
    }

    rows.push(...(data ?? []));

    if (!data || data.length < SUPABASE_PAGE_SIZE) {
      return rows;
    }
  }
}

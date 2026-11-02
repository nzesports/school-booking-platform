import { describe, expect, it, vi } from "vitest";
import { fetchAllRows, SUPABASE_PAGE_SIZE } from "@/lib/supabase/fetch-all-rows";

describe("shared dashboard page reads", () => {
  it("bounds concurrent table reads and preserves every result", async () => {
    let active = 0;
    let peak = 0;
    const results = await Promise.all(Array.from({ length: 30 }, (_, id) => fetchAllRows("qa", async () => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise((resolve) => setTimeout(resolve, 1));
      active -= 1;
      return { data: [id], error: null };
    })));
    expect(peak).toBeLessThanOrEqual(4);
    expect(results.flat()).toEqual(Array.from({ length: 30 }, (_, id) => id));
  });
  it("retries a transient pool timeout once", async () => {
    const read = vi.fn().mockResolvedValueOnce({ data: null, error: { code: "PGRST003", message: "Pool timeout" } }).mockResolvedValueOnce({ data: [1], error: null });
    await expect(fetchAllRows("qa", read)).resolves.toEqual([1]);
    expect(read).toHaveBeenCalledTimes(2);
  });
  it("fails closed on persistent errors and releases read capacity", async () => {
    const read = vi.fn().mockResolvedValue({ data: null, error: { code: "PGRST003", message: "Pool timeout" } });
    await expect(fetchAllRows("qa", read)).rejects.toThrow("PGRST003");
    expect(read).toHaveBeenCalledTimes(2);
    await expect(fetchAllRows("qa", async () => { throw Error("transport"); })).rejects.toThrow("transport");
    await expect(fetchAllRows("qa", async () => ({ data: [2], error: null }))).resolves.toEqual([2]);
  });
  it("still pages through results beyond the server row cap", async () => {
    const first = Array.from({ length: SUPABASE_PAGE_SIZE }, (_, id) => id);
    const read = vi.fn().mockResolvedValueOnce({ data: first, error: null }).mockResolvedValueOnce({ data: [1000], error: null });
    const rows = await fetchAllRows("qa", read);
    expect(rows).toHaveLength(1001);
    expect(read).toHaveBeenNthCalledWith(2, 1000, 1999);
  });
});

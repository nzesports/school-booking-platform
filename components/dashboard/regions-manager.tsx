import { MapPinned, Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { Region } from "@/lib/domain/types";
import { cn } from "@/lib/utils";

const inputClassName =
  "w-full rounded-[14px] border border-[color:var(--border-soft)] bg-white px-3.5 py-2.5 text-sm text-[color:var(--text-dark)] outline-none transition focus:border-[color:rgba(24,168,59,0.34)] focus:ring-4 focus:ring-[rgba(24,168,59,0.1)]";

export function RegionsManager({
  regions,
  saveAction,
  deleteAction
}: {
  regions: Region[];
  saveAction: (formData: FormData) => void | Promise<void>;
  deleteAction: (formData: FormData) => void | Promise<void>;
}) {
  const sorted = [...regions].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  const nextSortOrder = Math.max(0, ...sorted.map((region) => region.sortOrder ?? 0)) + 1;

  return (
    <div className="grid gap-5">
      {/* ------------------------------------------------ add region */}
      <section className="surface-panel rounded-[28px] p-5 md:p-6">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-full bg-[#e8f1fd] text-[#2563eb]">
            <MapPinned className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-lg font-semibold tracking-[-0.03em] text-[color:var(--navy)]">
              Add a region
            </h2>
            <p className="text-sm text-[color:var(--text-soft)]">
              New regions appear immediately in booking forms, signups, and filters.
            </p>
          </div>
        </div>

        <form action={saveAction} className="mt-5 flex flex-wrap items-end gap-3">
          <label className="grid min-w-[240px] flex-1 gap-1.5 text-sm font-semibold text-[color:var(--navy)]">
            Region name
            <input name="name" required minLength={2} placeholder="e.g. Napier / Hastings" className={inputClassName} />
          </label>
          <label className="grid w-[130px] gap-1.5 text-sm font-semibold text-[color:var(--navy)]">
            Sort order
            <input
              name="sortOrder"
              type="number"
              defaultValue={nextSortOrder}
              min={0}
              className={inputClassName}
            />
          </label>
          <input type="hidden" name="isActive" value="on" />
          <Button
            type="submit"
            className="rounded-[14px] border-[#2563eb] bg-[#2563eb] text-white shadow-[0_12px_28px_rgba(37,99,235,0.28)] hover:border-[#1d4fd7] hover:bg-[#1d4fd7]"
          >
            <Plus className="h-4 w-4" />
            Add region
          </Button>
        </form>
      </section>

      {/* ------------------------------------------------ regions table */}
      <section className="overflow-hidden rounded-[24px] border border-[color:var(--border-soft)] bg-white/92">
        <div className="hidden grid-cols-[minmax(0,1.6fr)_minmax(0,1.1fr)_minmax(0,110px)_minmax(0,130px)_minmax(0,220px)] gap-4 border-b border-[color:var(--border-soft)] bg-[#f6f9fd] px-5 py-3 lg:grid">
          {["Region", "Slug", "Sort", "Status", "Actions"].map((label) => (
            <p
              key={label}
              className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[color:var(--text-soft)]"
            >
              {label}
            </p>
          ))}
        </div>

        {sorted.map((region, index) => {
          const formId = `region-form-${region.id}`;

          return (
            <div
              key={region.id}
              className={cn(
                "grid gap-4 px-5 py-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1.1fr)_minmax(0,110px)_minmax(0,130px)_minmax(0,220px)] lg:items-center",
                index > 0 && "border-t border-[color:var(--border-soft)]"
              )}
            >
              <form id={formId} action={saveAction} className="hidden">
                <input type="hidden" name="id" value={region.id} />
              </form>

              <div>
                <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-[color:var(--text-soft)] lg:hidden">
                  Region
                </p>
                <input
                  name="name"
                  form={formId}
                  defaultValue={region.name}
                  required
                  minLength={2}
                  className={inputClassName}
                />
              </div>

              <p className="truncate text-sm text-[color:var(--text-soft)]">{region.slug}</p>

              <div>
                <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-[color:var(--text-soft)] lg:hidden">
                  Sort
                </p>
                <input
                  name="sortOrder"
                  form={formId}
                  type="number"
                  min={0}
                  defaultValue={region.sortOrder ?? 0}
                  className={inputClassName}
                />
              </div>

              <label className="inline-flex items-center gap-2 text-sm text-[color:var(--navy)]">
                <input
                  type="checkbox"
                  name="isActive"
                  form={formId}
                  defaultChecked={region.isActive}
                />
                Active
              </label>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="submit"
                  form={formId}
                  className="inline-flex min-h-[40px] items-center justify-center rounded-[12px] border border-[color:rgba(4,15,75,0.12)] bg-white px-4 text-sm font-semibold text-[color:var(--navy)] transition hover:border-[color:rgba(4,15,75,0.24)]"
                >
                  Save
                </button>
                <form action={deleteAction}>
                  <input type="hidden" name="id" value={region.id} />
                  <button
                    type="submit"
                    className="inline-flex min-h-[40px] items-center justify-center gap-1.5 rounded-[12px] border border-[#f3b4b4] bg-[#fff6f6] px-3.5 text-sm font-semibold text-[#9d2424] transition hover:bg-[#fff0f0]"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Delete
                  </button>
                </form>
              </div>
            </div>
          );
        })}

        <p className="border-t border-[color:var(--border-soft)] bg-[#f6f9fd] px-5 py-3 text-sm text-[color:var(--text-soft)]">
          Regions in use by schools, bookings, or ambassadors can&apos;t be deleted — untick
          &quot;Active&quot; and save to hide them from booking forms instead.
        </p>
      </section>
    </div>
  );
}

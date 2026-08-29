"use client";

import { useId, useMemo, useState } from "react";

import { Select } from "@/components/ui/select";
import type { Region, School } from "@/lib/domain/types";

const inputClassName =
  "w-full rounded-[16px] border border-[color:var(--border-soft)] bg-white/92 px-4 py-3 text-sm text-[color:var(--text-dark)]";

function normalized(value: string) {
  return value.trim().toLocaleLowerCase();
}

export function SchoolCombobox({
  schools,
  regions,
  label = "School"
}: {
  schools: School[];
  regions: Region[];
  label?: string;
}) {
  const inputId = useId();
  const listboxId = `${inputId}-listbox`;
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const regionNames = useMemo(
    () => new Map(regions.map((region) => [region.slug, region.name])),
    [regions]
  );
  const activeRegions = useMemo(
    () => regions.filter((region) => region.isActive),
    [regions]
  );
  const sortedSchools = useMemo(
    () => [...schools].sort((left, right) => left.name.localeCompare(right.name)),
    [schools]
  );
  const matches = useMemo(() => {
    const needle = normalized(query);

    if (!needle) {
      return sortedSchools.slice(0, 8);
    }

    return sortedSchools
      .filter((school) =>
        [school.name, school.city, regionNames.get(school.regionSlug) ?? ""]
          .join(" ")
          .toLocaleLowerCase()
          .includes(needle)
      )
      .slice(0, 8);
  }, [query, regionNames, sortedSchools]);
  const exactMatch = sortedSchools.find(
    (school) => normalized(school.name) === normalized(query)
  );
  const resolvedSchoolId = selectedId || exactMatch?.id || "";
  const willCreate = query.trim().length >= 2 && !exactMatch;

  function selectSchool(school: School) {
    setQuery(school.name);
    setSelectedId(school.id);
    setOpen(false);
  }

  return (
    <div
      className="grid gap-2"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          setOpen(false);
        }
      }}
    >
      <label
        htmlFor={inputId}
        className="text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--navy)]"
      >
        {label}
      </label>
      <div className="relative">
        <input type="hidden" name="schoolId" value={resolvedSchoolId} />
        <input
          id={inputId}
          name="schoolName"
          value={query}
          required
          autoComplete="off"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={listboxId}
          aria-activedescendant={
            open && matches[activeIndex] ? `${listboxId}-${matches[activeIndex].id}` : undefined
          }
          className={inputClassName}
          placeholder="Start typing a school name"
          onFocus={() => setOpen(true)}
          onChange={(event) => {
            setQuery(event.target.value);
            setSelectedId("");
            setActiveIndex(0);
            setOpen(true);
          }}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown") {
              event.preventDefault();
              setOpen(true);
              setActiveIndex((current) => Math.min(current + 1, Math.max(matches.length - 1, 0)));
            } else if (event.key === "ArrowUp") {
              event.preventDefault();
              setActiveIndex((current) => Math.max(current - 1, 0));
            } else if (event.key === "Enter" && open && matches[activeIndex]) {
              event.preventDefault();
              selectSchool(matches[activeIndex]);
            } else if (event.key === "Escape") {
              setOpen(false);
            }
          }}
        />

        {open && matches.length ? (
          <div
            id={listboxId}
            role="listbox"
            className="relative z-10 mt-2 max-h-64 w-full overflow-y-auto rounded-[16px] border border-[color:var(--border-soft)] bg-white p-1 shadow-[0_12px_28px_rgba(11,24,77,0.12)]"
          >
            {matches.map((school, index) => {
              const location = [school.city, regionNames.get(school.regionSlug)]
                .filter(Boolean)
                .join(" · ");

              return (
                <button
                  id={`${listboxId}-${school.id}`}
                  key={school.id}
                  role="option"
                  aria-selected={school.id === resolvedSchoolId}
                  type="button"
                  className={`w-full rounded-[12px] px-3 py-2 text-left ${
                    index === activeIndex ? "bg-[color:var(--blue-soft)]" : "hover:bg-[#f7f9fc]"
                  }`}
                  onMouseDown={(event) => event.preventDefault()}
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => selectSchool(school)}
                >
                  <span className="block text-sm font-semibold text-[color:var(--navy)]">
                    {school.name}
                  </span>
                  {location ? (
                    <span className="mt-0.5 block text-xs text-[color:var(--text-soft)]">
                      {location}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        ) : null}
      </div>

      {willCreate ? (
        <div className="grid gap-2 rounded-[16px] border border-[#b9e2c7] bg-[#f4fbf6] p-3">
          <p className="text-sm leading-6 text-[#1d6f35]">
            No exact school match. <strong>{query.trim()}</strong> will be created as an active
            school.
          </p>
          <label className="grid gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-[color:var(--navy)]">
            New school region
            <Select name="newSchoolRegionId" required defaultValue="">
              <option value="" disabled>
                Select an active region
              </option>
              {activeRegions.map((region) => (
                <option key={region.id} value={region.id}>
                  {region.name}
                </option>
              ))}
            </Select>
          </label>
        </div>
      ) : null}
    </div>
  );
}

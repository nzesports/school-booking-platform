"use client";

import {
  ExternalLink,
  FileText,
  ListChecks,
  PackageOpen,
  Play,
  Search,
  SquarePlay,
  X
} from "lucide-react";
import { useMemo, useState } from "react";

import type { ResourceRecord } from "@/lib/services/portal";
import { cn } from "@/lib/utils";

// School-facing resource library. Deliberately shows no audience information —
// schools should never see that a resource is also targeted at ambassadors.

const FILTERS = [
  { value: "all", label: "All resources" },
  { value: "pdf", label: "PDF" },
  { value: "video", label: "Video" },
  { value: "checklist", label: "Checklists" }
] as const;

type FilterValue = (typeof FILTERS)[number]["value"];

function isVideo(resource: ResourceRecord) {
  return resource.type === "youtube" || resource.type === "video" || Boolean(resource.youtubeUrl);
}

function isChecklist(resource: ResourceRecord) {
  return (
    resource.tags.some((tag) => tag.toLowerCase().includes("checklist")) ||
    resource.title.toLowerCase().includes("checklist")
  );
}

function matchesFilter(resource: ResourceRecord, filter: FilterValue) {
  if (filter === "all") {
    return true;
  }

  if (filter === "video") {
    return isVideo(resource);
  }

  if (filter === "checklist") {
    return isChecklist(resource);
  }

  return resource.type === "pdf";
}

function resourceUrl(resource: ResourceRecord) {
  return resource.youtubeUrl ?? resource.downloadUrl ?? resource.externalUrl ?? null;
}

function openLabel(resource: ResourceRecord) {
  if (isVideo(resource)) {
    return "Watch video";
  }

  if (isChecklist(resource)) {
    return "Open checklist";
  }

  if (resource.type === "pdf") {
    return "Open PDF";
  }

  return "Open resource";
}

export function SchoolResourceLibrary({ resources }: { resources: ResourceRecord[] }) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<FilterValue>("all");
  const [dismissedFeaturedIds, setDismissedFeaturedIds] = useState<string[]>([]);

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();

    return resources.filter((resource) => {
      const haystack = [
        resource.title,
        resource.description,
        resource.presentationTitle ?? "",
        resource.tags.join(" ")
      ]
        .join(" ")
        .toLowerCase();

      return (!normalized || haystack.includes(normalized)) && matchesFilter(resource, filter);
    });
  }, [resources, query, filter]);

  const featured = filtered.find(
    (resource) => isVideo(resource) && !dismissedFeaturedIds.includes(resource.id)
  );
  const gridResources = featured
    ? filtered.filter((resource) => resource.id !== featured.id)
    : filtered;

  return (
    <div className="grid gap-5">
      {/* ------------------------------------------------ search + filters */}
      <div className="surface-panel grid gap-4 rounded-[24px] p-4 md:p-5">
        <label className="flex min-h-[52px] items-center gap-3 rounded-[16px] border border-[color:var(--border-soft)] bg-white px-4 text-sm text-[color:var(--navy)]">
          <Search className="h-4 w-4 shrink-0 text-[color:var(--green)]" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search title, presentation, description, or tags"
            className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-[color:var(--text-soft)]"
          />
        </label>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-2">
            {FILTERS.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setFilter(option.value)}
                className={cn(
                  "inline-flex min-h-[40px] items-center justify-center rounded-full border px-4 text-sm font-semibold transition",
                  option.value === filter
                    ? "border-[rgba(24,168,59,0.4)] bg-[color:var(--green-soft)] text-[#117a2e]"
                    : "border-[color:var(--border-soft)] bg-white text-[color:var(--text-soft)] hover:text-[color:var(--navy)]"
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
          <p className="inline-flex items-center gap-2 text-sm font-semibold text-[color:var(--navy)]">
            <FileText className="h-4 w-4 text-[color:var(--text-soft)]" />
            {filtered.length} resource{filtered.length === 1 ? "" : "s"}
          </p>
        </div>
      </div>

      {/* ------------------------------------------------ featured video */}
      {featured ? (
        <div className="grid gap-3">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-2xl font-semibold leading-tight tracking-normal text-[color:var(--navy)] md:text-3xl">
              Featured resource
            </h2>
            <button
              type="button"
              aria-label="Dismiss featured resource"
              onClick={() =>
                setDismissedFeaturedIds((current) =>
                  current.includes(featured.id) ? current : [...current, featured.id]
                )
              }
              className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[color:var(--border-soft)] bg-white text-[color:var(--navy)] shadow-sm transition hover:border-[rgba(24,168,59,0.35)] hover:bg-[#f4fbf6] hover:text-[#117a2e]"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="surface-panel grid gap-5 rounded-[26px] p-5 md:grid-cols-[260px_minmax(0,1fr)] md:p-6">
            <div className="flex min-h-[160px] items-center justify-center rounded-[20px] bg-[linear-gradient(135deg,#e8f1fd,#eef7fc)]">
              <span className="flex h-16 w-16 items-center justify-center rounded-full bg-[color:var(--navy)] text-white shadow-[0_16px_34px_rgba(11,24,77,0.28)]">
                <Play className="ml-1 h-6 w-6 fill-current" />
              </span>
            </div>
            <div className="flex min-w-0 flex-col">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <h3 className="text-2xl font-semibold tracking-[-0.03em] text-[color:var(--navy)]">
                  {featured.title}
                </h3>
                {featured.isCurrent ? <CurrentPill /> : null}
              </div>
              {featured.description ? (
                <p className="mt-2 text-sm leading-7 text-[color:var(--text-soft)]">
                  {featured.description}
                </p>
              ) : null}
              <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-[color:var(--border-soft)] bg-white px-3 py-1.5 text-xs font-semibold text-[color:var(--navy)]">
                  <SquarePlay className="h-3.5 w-3.5" />
                  Video
                </span>
                {resourceUrl(featured) ? (
                  <a
                    href={resourceUrl(featured) as string}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex min-h-[46px] items-center justify-center gap-2 rounded-[14px] bg-[color:var(--navy)] px-5 text-sm font-semibold text-white transition hover:bg-[#101c56]"
                  >
                    <Play className="h-4 w-4 fill-current" />
                    Watch video
                  </a>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {/* ------------------------------------------------ resource cards */}
      <div className="grid gap-3">
        <h2 className="text-2xl font-semibold leading-tight tracking-normal text-[color:var(--navy)] md:text-3xl">
          All resources
        </h2>

        {gridResources.length === 0 && !featured ? (
          <div className="surface-panel grid justify-items-center gap-3 rounded-[26px] px-6 py-12 text-center">
            <PackageOpen className="h-14 w-14 text-[#cbd5e1]" />
            <p className="text-base font-semibold text-[color:var(--navy)]">
              No resources match that search
            </p>
            <p className="max-w-[300px] text-sm leading-6 text-[color:var(--text-soft)]">
              Try a different search or filter — new resources appear here when they&apos;re
              shared with your school.
            </p>
          </div>
        ) : null}

        <div className="grid gap-4 xl:grid-cols-2">
          {gridResources.map((resource) => {
            const url = resourceUrl(resource);
            const Icon = isVideo(resource)
              ? SquarePlay
              : isChecklist(resource)
                ? ListChecks
                : FileText;

            return (
              <div
                key={resource.id}
                className="surface-panel flex flex-col rounded-[24px] p-5"
              >
                <div className="flex items-start gap-4">
                  <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-[18px] bg-[#e6f5ec] text-[#117a2e]">
                    <Icon className="h-7 w-7" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <h3 className="text-lg font-semibold leading-6 tracking-[-0.02em] text-[color:var(--navy)]">
                        {resource.title}
                      </h3>
                      {resource.isCurrent ? <CurrentPill /> : null}
                    </div>
                    {resource.description ? (
                      <p className="mt-1.5 text-sm leading-6 text-[color:var(--text-soft)]">
                        {resource.description}
                      </p>
                    ) : null}
                  </div>
                </div>

                {url ? (
                  <div className="mt-4">
                    <a
                      href={url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex min-h-[42px] items-center justify-center gap-2 rounded-[13px] border border-[color:var(--border-soft)] bg-white px-4 text-sm font-semibold text-[color:var(--navy)] transition hover:border-[rgba(24,168,59,0.4)] hover:text-[#117a2e]"
                    >
                      <ExternalLink className="h-4 w-4" />
                      {openLabel(resource)}
                    </a>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function CurrentPill() {
  return (
    <span className="inline-flex shrink-0 items-center rounded-full bg-[#eaf8ee] px-3 py-1 text-xs font-semibold text-[#117a2e]">
      Current
    </span>
  );
}

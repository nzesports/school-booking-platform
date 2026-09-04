"use client";

import {
  BookOpen,
  ExternalLink,
  FileText,
  ListChecks,
  PackageOpen,
  Search,
  SquarePlay
} from "lucide-react";
import { useMemo, useState } from "react";

import { ButtonLink } from "@/components/ui/button";
import { SecondaryTabs } from "@/components/ui/secondary-tabs";
import type { ResourceRecord } from "@/lib/services/portal";

// School-facing resources deliberately omit internal audience and sharing
// metadata. Schools only receive items explicitly published to their portal.
const FILTERS = [
  { value: "all", label: "All resources", icon: PackageOpen },
  { value: "pdf", label: "PDF", icon: FileText },
  { value: "video", label: "Video", icon: SquarePlay },
  { value: "guide", label: "Guides", icon: BookOpen },
  { value: "checklist", label: "Checklists", icon: ListChecks }
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

function isGuide(resource: ResourceRecord) {
  return (
    resource.tags.some((tag) => tag.toLowerCase().includes("guide")) ||
    resource.title.toLowerCase().includes("guide")
  );
}

function matchesFilter(resource: ResourceRecord, filter: FilterValue) {
  if (filter === "all") return true;
  if (filter === "video") return isVideo(resource);
  if (filter === "guide") return isGuide(resource);
  if (filter === "checklist") return isChecklist(resource);
  return resource.type === "pdf";
}

function resourceUrl(resource: ResourceRecord) {
  return resource.youtubeUrl ?? resource.downloadUrl ?? resource.externalUrl ?? null;
}

function resourceType(resource: ResourceRecord) {
  if (isVideo(resource)) return "Video";
  if (isGuide(resource)) return "Guide";
  if (isChecklist(resource)) return "Checklist";
  if (resource.type === "pdf") return "PDF";
  return "Resource";
}

function resourceIcon(resource: ResourceRecord) {
  if (isVideo(resource)) return SquarePlay;
  if (isGuide(resource)) return BookOpen;
  if (isChecklist(resource)) return ListChecks;
  return FileText;
}

function openLabel(resource: ResourceRecord) {
  if (isVideo(resource)) return "Watch video";
  if (isGuide(resource)) return "Open guide";
  if (isChecklist(resource)) return "Open checklist";
  if (resource.type === "pdf") return "Open PDF";
  return "Open resource";
}

export function SchoolResourceLibrary({ resources }: { resources: ResourceRecord[] }) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<FilterValue>("all");

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

  const tabs = FILTERS.map((item) => ({
    ...item,
    count: resources.filter((resource) => matchesFilter(resource, item.value)).length
  }));

  return (
    <section className="surface-panel rounded-[28px] p-5 md:p-7">
      <div className="grid gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex min-h-[46px] min-w-[260px] flex-1 items-center gap-3 rounded-[14px] border border-[color:var(--border-soft)] bg-white px-4 text-sm text-[color:var(--navy)]">
            <Search className="h-4 w-4 shrink-0 text-[color:var(--green)]" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search by title, presentation, description, or tag"
              className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-[color:var(--text-soft)]"
            />
          </label>
          <p className="inline-flex items-center gap-2 text-sm font-semibold text-[color:var(--navy)]">
            <FileText className="h-4 w-4 text-[color:var(--text-soft)]" />
            {filtered.length} resource{filtered.length === 1 ? "" : "s"}
          </p>
        </div>

        <SecondaryTabs
          items={tabs}
          value={filter}
          onChange={setFilter}
          ariaLabel="Filter school resources"
        />
      </div>

      <div className="mt-5 overflow-hidden rounded-[18px] border border-[color:var(--border-soft)] bg-white">
        <div className="hidden grid-cols-[minmax(0,1fr)_210px_150px] gap-5 bg-[#f6f9fd] px-7 py-4 text-[11px] font-semibold uppercase tracking-[0.14em] text-[color:var(--text-soft)] md:grid">
          <span>Resource</span>
          <span>Type</span>
          <span className="text-right">Action</span>
        </div>

        {filtered.length === 0 ? (
          <div className="grid min-h-[250px] justify-items-center content-center gap-3 px-6 py-10 text-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-[18px] bg-[#eef3f8] text-[#9aa9bb]">
              <PackageOpen className="h-7 w-7" />
            </span>
            <p className="text-base font-semibold text-[color:var(--navy)]">
              No resources match this view
            </p>
            <p className="max-w-[340px] text-sm leading-6 text-[color:var(--text-soft)]">
              Try another search or filter. New resources will appear here when they are shared
              with your school.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-[color:var(--border-soft)]">
            {filtered.map((resource) => {
              const url = resourceUrl(resource);
              const Icon = resourceIcon(resource);

              return (
                <article
                  key={resource.id}
                  className="grid gap-5 px-6 py-5 md:grid-cols-[minmax(0,1fr)_210px_150px] md:items-center md:px-7 md:py-6"
                >
                  <div className="flex min-w-0 items-start gap-4">
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] bg-[#eaf8ee] text-[#117a2e]">
                      <Icon className="h-5 w-5" />
                    </span>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-semibold text-[color:var(--navy)]">{resource.title}</h3>
                        <span className="rounded-full bg-[#eef3f8] px-2 py-0.5 text-[10px] font-semibold text-[color:var(--text-soft)] md:hidden">
                          {resourceType(resource)}
                        </span>
                      </div>
                      {resource.description ? (
                        <p className="mt-1 line-clamp-2 text-sm leading-6 text-[color:var(--text-soft)]">
                          {resource.description}
                        </p>
                      ) : null}
                    </div>
                  </div>

                  <div className="text-sm text-[color:var(--text-soft)]">
                    <p className="font-medium text-[color:var(--navy)]">{resourceType(resource)}</p>
                    <p className="mt-0.5 hidden text-xs md:block">
                      {resource.presentationTitle
                        ? `${resource.presentationTitle} presentation`
                        : "General resource"}
                    </p>
                  </div>

                  <div className="flex md:justify-end">
                    {url ? (
                      <ButtonLink
                        href={url}
                        target="_blank"
                        rel="noreferrer"
                        variant="secondary"
                        className="min-h-[38px] rounded-[12px] px-3"
                      >
                        <ExternalLink className="h-4 w-4" />
                        {openLabel(resource)}
                      </ButtonLink>
                    ) : (
                      <span className="text-xs font-medium text-[color:var(--text-soft)]">
                        Available soon
                      </span>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}

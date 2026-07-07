"use client";

import {
  ArrowUpDown,
  CheckCircle2,
  Circle,
  FileText,
  GraduationCap,
  HeartHandshake,
  Info,
  ListChecks,
  LoaderCircle,
  Play,
  Presentation,
  Search,
  UsersRound
} from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";

import type { TrainingModule } from "@/lib/domain/types";
import type { ResourceRecord } from "@/lib/services/portal";
import { cn } from "@/lib/utils";

type ResourceBucket = "video" | "presentation" | "script" | "document";

const bucketMeta: Record<
  ResourceBucket,
  {
    filterLabel: string;
    badgeLabel: string;
    badgeClassName: string;
    actionLabel: string;
    actionClassName: string;
    thumbClassName: string;
    icon: typeof Play;
  }
> = {
  video: {
    filterLabel: "Videos",
    badgeLabel: "Video",
    badgeClassName: "bg-[#f3e8ff] text-[#7e22ce]",
    actionLabel: "Watch video",
    actionClassName: "border-[#e2ccf8] text-[#7e22ce] hover:bg-[#faf5ff]",
    thumbClassName: "bg-[linear-gradient(135deg,#ede9fe,#dbeafe)] text-[#7c3aed]",
    icon: Play
  },
  presentation: {
    filterLabel: "Presentations",
    badgeLabel: "Presentation",
    badgeClassName: "bg-[#d7f2e4] text-[#047857]",
    actionLabel: "Download deck",
    actionClassName: "border-[#bfe6d2] text-[#047857] hover:bg-[#f0fbf5]",
    thumbClassName: "bg-[linear-gradient(135deg,#e0f2fe,#eaf8ee)] text-[#0369a1]",
    icon: Presentation
  },
  script: {
    filterLabel: "Scripts",
    badgeLabel: "Script",
    badgeClassName: "bg-[#dbeafe] text-[#1d4ed8]",
    actionLabel: "Read script",
    actionClassName: "border-[#c4dbfb] text-[#1d4ed8] hover:bg-[#f4f8ff]",
    thumbClassName: "bg-[linear-gradient(135deg,#eef2ff,#e0f2fe)] text-[#4f46e5]",
    icon: FileText
  },
  document: {
    filterLabel: "Documents",
    badgeLabel: "Document",
    badgeClassName: "bg-[#dbeafe] text-[#1d4ed8]",
    actionLabel: "Read document",
    actionClassName: "border-[#c4dbfb] text-[#1d4ed8] hover:bg-[#f4f8ff]",
    thumbClassName: "bg-[linear-gradient(135deg,#e0f2fe,#f1f5f9)] text-[#0369a1]",
    icon: ListChecks
  }
};

const moduleIconStyles = [
  "bg-[#e0f2fe] text-[#0369a1]",
  "bg-[#fde8f0] text-[#be185d]",
  "bg-[#eaf8ee] text-[#117a2e]",
  "bg-[#ede9fe] text-[#7c3aed]"
];

const moduleIcons = [GraduationCap, HeartHandshake, FileText, ListChecks];

function bucketOf(type: string): ResourceBucket {
  if (type === "youtube" || type === "video") {
    return "video";
  }

  if (["slide_deck", "ppt", "pptx"].includes(type)) {
    return "presentation";
  }

  if (type === "script") {
    return "script";
  }

  return "document";
}

function moduleStatus(progress: number) {
  if (progress >= 100) {
    return {
      label: "Complete",
      chipClassName: "bg-[#eaf8ee] text-[#117a2e]",
      barClassName: "bg-[linear-gradient(135deg,#18a83b,#47c96a)]",
      icon: <CheckCircle2 className="h-3.5 w-3.5" />
    };
  }

  if (progress > 0) {
    return {
      label: "In progress",
      chipClassName: "bg-[#e8f1fd] text-[#1e4fae]",
      barClassName: "bg-[linear-gradient(135deg,#2563eb,#60a5fa)]",
      icon: <LoaderCircle className="h-3.5 w-3.5" />
    };
  }

  return {
    label: "Not started",
    chipClassName: "bg-[#f1f5f9] text-[#64748b]",
    barClassName: "bg-[#cbd5e1]",
    icon: <Circle className="h-3.5 w-3.5" />
  };
}

export function TrainingWorkspace({
  modules,
  resources,
  markCompleteAction,
  returnTo
}: {
  modules: TrainingModule[];
  resources: ResourceRecord[];
  markCompleteAction: (formData: FormData) => void | Promise<void>;
  returnTo: string;
}) {
  return (
    <div className="grid gap-5">
      {/* ------------------------------------------------ training progress */}
      <section className="surface-panel rounded-[28px] p-5 md:p-6">
        <h2 className="text-2xl font-semibold tracking-[-0.03em] text-[color:var(--navy)]">
          Your training progress
        </h2>

        <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {modules.length === 0 ? (
            <p className="text-sm leading-7 text-[color:var(--text-soft)]">
              No training modules have been published yet.
            </p>
          ) : null}
          {modules.map((module, index) => {
            const status = moduleStatus(module.progress);
            const Icon = moduleIcons[index % moduleIcons.length];

            return (
              <div
                key={module.id}
                className="rounded-[22px] border border-[color:var(--border-soft)] bg-white/92 p-5"
              >
                <div className="flex items-start gap-3.5">
                  <div
                    className={cn(
                      "flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px]",
                      moduleIconStyles[index % moduleIconStyles.length]
                    )}
                  >
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-semibold text-[color:var(--navy)]">{module.title}</p>
                      <span
                        className={cn(
                          "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold",
                          status.chipClassName
                        )}
                      >
                        {status.icon}
                        {status.label}
                      </span>
                    </div>
                    <p className="mt-1 line-clamp-2 text-sm leading-6 text-[color:var(--text-soft)]">
                      {module.description}
                    </p>
                  </div>
                </div>

                <div className="mt-4 flex items-center gap-3">
                  <div className="h-2 flex-1 rounded-full bg-[#e6ecf5]">
                    <div
                      className={cn("h-full rounded-full", status.barClassName)}
                      style={{ width: `${module.progress}%` }}
                    />
                  </div>
                  <span
                    className={cn(
                      "text-sm font-semibold",
                      module.progress >= 100 ? "text-[#117a2e]" : "text-[#1e4fae]"
                    )}
                  >
                    {module.progress}%
                  </span>
                </div>

                {module.progress < 100 ? (
                  <form action={markCompleteAction} className="mt-3">
                    <input type="hidden" name="trainingModuleId" value={module.id} />
                    <input type="hidden" name="returnTo" value={returnTo} />
                    <button
                      type="submit"
                      className="text-sm font-semibold text-[#2563eb] hover:underline"
                    >
                      Mark module complete
                    </button>
                  </form>
                ) : null}
              </div>
            );
          })}
        </div>
      </section>

      {resources.length > 0 ? (
        <ResourceLibraryWorkspace resources={resources} heading="Training resources" />
      ) : null}
    </div>
  );
}

// Standalone filterable library — used by the ambassador Materials, Resources
// and Training tabs, each fed a different resource category.
export function ResourceLibraryWorkspace({
  resources,
  heading = "Resource library",
  note = "New resources are added regularly. Check back often or filter by type to find what you need."
}: {
  resources: ResourceRecord[];
  heading?: string;
  note?: string;
}) {
  const [query, setQuery] = useState("");
  const [activeBucket, setActiveBucket] = useState<"all" | ResourceBucket>("all");
  const [versionFilter, setVersionFilter] = useState<"current" | "all">("current");
  const [sortBy, setSortBy] = useState<"newest" | "title">("newest");

  const availableBuckets = useMemo(() => {
    const present = new Set(resources.map((resource) => bucketOf(resource.type)));
    return (Object.keys(bucketMeta) as ResourceBucket[]).filter((bucket) => present.has(bucket));
  }, [resources]);

  const normalizedQuery = query.trim().toLowerCase();
  const visibleResources = useMemo(() => {
    const filtered = resources.filter((resource) => {
      const haystack = [
        resource.title,
        resource.description,
        resource.presentationTitle ?? "",
        resource.tags.join(" ")
      ]
        .join(" ")
        .toLowerCase();
      const matchesQuery = !normalizedQuery || haystack.includes(normalizedQuery);
      const matchesBucket = activeBucket === "all" || bucketOf(resource.type) === activeBucket;
      const matchesVersion = versionFilter === "all" || resource.isCurrent;

      return matchesQuery && matchesBucket && matchesVersion;
    });

    if (sortBy === "title") {
      return [...filtered].sort((a, b) => a.title.localeCompare(b.title));
    }

    return filtered;
  }, [resources, normalizedQuery, activeBucket, versionFilter, sortBy]);

  return (
      <section className="surface-panel rounded-[28px] p-5 md:p-6">
        <div className="flex flex-wrap items-center gap-2.5">
          <label className="flex min-h-[46px] min-w-[220px] flex-1 items-center gap-2.5 rounded-full border border-[color:var(--border-soft)] bg-white px-4 text-sm text-[color:var(--navy)]">
            <Search className="h-4 w-4 text-[color:var(--text-soft)]" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search resources by title or keyword"
              className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-[color:var(--text-soft)]"
            />
          </label>

          <div className="flex flex-wrap items-center gap-1.5">
            <ToolbarChip active={activeBucket === "all"} onClick={() => setActiveBucket("all")}>
              All
            </ToolbarChip>
            {availableBuckets.map((bucket) => (
              <ToolbarChip
                key={bucket}
                active={activeBucket === bucket}
                onClick={() => setActiveBucket(bucket)}
              >
                {bucketMeta[bucket].filterLabel}
              </ToolbarChip>
            ))}
          </div>

          <span className="hidden h-6 w-px bg-[color:var(--border-soft)] sm:block" />

          <div className="flex items-center gap-1.5">
            <ToolbarChip
              active={versionFilter === "current"}
              onClick={() => setVersionFilter("current")}
            >
              Current
            </ToolbarChip>
            <ToolbarChip active={versionFilter === "all"} onClick={() => setVersionFilter("all")}>
              All versions
            </ToolbarChip>
          </div>

          <label className="ml-auto inline-flex min-h-[42px] items-center gap-2 rounded-full border border-[color:var(--border-soft)] bg-white px-3.5 text-sm font-semibold text-[color:var(--navy)]">
            <ArrowUpDown className="h-3.5 w-3.5 text-[color:var(--text-soft)]" />
            <select
              value={sortBy}
              onChange={(event) => setSortBy(event.target.value as "newest" | "title")}
              className="bg-transparent text-sm font-semibold text-[color:var(--navy)] outline-none"
            >
              <option value="newest">Sort by newest</option>
              <option value="title">Sort by title</option>
            </select>
          </label>
        </div>

        <div className="mt-6 flex items-center gap-3">
          <h2 className="text-2xl font-semibold tracking-[-0.03em] text-[color:var(--navy)]">
            {heading}
          </h2>
          <span className="rounded-full bg-[#f1f5f9] px-2.5 py-1 text-xs font-semibold text-[#64748b]">
            {visibleResources.length} resource{visibleResources.length === 1 ? "" : "s"}
          </span>
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
          {visibleResources.map((resource) => {
            const bucket = bucketMeta[bucketOf(resource.type)];
            const ThumbIcon = bucket.icon;
            const href = resource.youtubeUrl ?? resource.downloadUrl;

            return (
              <article
                key={resource.id}
                className="flex h-full flex-col rounded-[22px] border border-[color:var(--border-soft)] bg-white/92 p-5"
              >
                <div className="flex gap-4">
                  <div
                    className={cn(
                      "flex h-[88px] w-[88px] shrink-0 items-center justify-center rounded-[16px]",
                      bucket.thumbClassName
                    )}
                  >
                    {bucketOf(resource.type) === "video" ? (
                      <span className="flex h-11 w-11 items-center justify-center rounded-full bg-white shadow-[0_8px_20px_rgba(11,24,77,0.12)]">
                        <Play className="ml-0.5 h-5 w-5" />
                      </span>
                    ) : (
                      <ThumbIcon className="h-8 w-8" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <span
                      className={cn(
                        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold",
                        bucket.badgeClassName
                      )}
                    >
                      {bucket.badgeLabel}
                    </span>
                    <p className="mt-1.5 font-semibold leading-6 text-[color:var(--navy)]">
                      {resource.title}
                    </p>
                  </div>
                </div>

                <p className="mt-3 line-clamp-2 text-sm leading-6 text-[color:var(--text-soft)]">
                  {resource.description || "No description added yet."}
                </p>

                <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[color:var(--text-soft)]">
                  {resource.presentationTitle ? (
                    <span className="inline-flex items-center gap-1.5">
                      <FileText className="h-3.5 w-3.5" />
                      {resource.presentationTitle}
                    </span>
                  ) : null}
                  {resource.versionLabel ? (
                    <span className="inline-flex items-center gap-1.5">{resource.versionLabel}</span>
                  ) : null}
                  <span className="inline-flex items-center gap-1.5">
                    <UsersRound className="h-3.5 w-3.5" />
                    {resource.audiences.includes("ambassador") ? "Ambassadors" : "Schools"}
                  </span>
                </div>

                <div className="mt-auto flex items-center justify-between gap-3 pt-4">
                  {href ? (
                    <a
                      href={href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={cn(
                        "inline-flex min-h-[40px] items-center justify-center gap-2 rounded-[12px] border bg-white px-3.5 py-2 text-sm font-semibold transition",
                        bucket.actionClassName
                      )}
                    >
                      {bucket.actionLabel}
                    </a>
                  ) : (
                    <span className="text-sm text-[color:var(--text-soft)]">Link coming soon</span>
                  )}
                  {resource.isCurrent ? (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-[#eaf8ee] px-2.5 py-1 text-[11px] font-semibold text-[#117a2e]">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      Current
                    </span>
                  ) : null}
                </div>
              </article>
            );
          })}
        </div>

        {visibleResources.length === 0 ? (
          <div className="mt-4 rounded-[18px] border border-dashed border-[color:var(--border-soft)] bg-white/80 px-5 py-8 text-sm text-[color:var(--text-soft)]">
            No resources match those filters yet.
          </div>
        ) : null}

        <p className="mt-5 flex items-center gap-2.5 rounded-[14px] bg-[#eef4fd] px-4 py-3 text-sm text-[#1e4fae]">
          <Info className="h-4 w-4 shrink-0" />
          {note}
        </p>
      </section>
  );
}

function ToolbarChip({
  active,
  onClick,
  children
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex min-h-[42px] items-center justify-center rounded-full border px-4 text-sm font-semibold transition",
        active
          ? "border-[#bfdbfe] bg-[#e8f1fd] text-[#1e4fae]"
          : "border-[color:var(--border-soft)] bg-white text-[color:var(--text-soft)] hover:text-[color:var(--navy)]"
      )}
    >
      {children}
    </button>
  );
}

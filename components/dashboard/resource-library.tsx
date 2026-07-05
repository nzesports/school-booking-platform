"use client";

import { ExternalLink, FileText, ImageIcon, Presentation, Search, Youtube } from "lucide-react";
import { useState, type ReactNode } from "react";

import type { ResourceRecord } from "@/lib/services/portal";
import { cn, titleCase } from "@/lib/utils";

const resourceIcon = {
  pdf: FileText,
  ppt: Presentation,
  pptx: Presentation,
  slide_deck: Presentation,
  image: ImageIcon,
  youtube: Youtube,
  video: Youtube,
  file: FileText,
  script: FileText,
  worksheet: FileText
} satisfies Record<string, typeof FileText>;

const audienceLabels = {
  school: "Schools",
  ambassador: "Ambassadors",
  staff: "Staff"
};

export function ResourceLibrary({
  resources,
  editBasePath,
  showAudienceTabs = false
}: {
  resources: ResourceRecord[];
  editBasePath?: string;
  showAudienceTabs?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [activeTags, setActiveTags] = useState<string[]>([]);
  const [activeType, setActiveType] = useState("all");
  const [activeAudience, setActiveAudience] = useState<"all" | "ambassador" | "school" | "staff">(
    "all"
  );
  const tags = Array.from(new Set(resources.flatMap((resource) => resource.tags))).sort();
  const types = Array.from(new Set(resources.map((resource) => resource.type))).sort();
  const normalizedQuery = query.trim().toLowerCase();
  const audienceCount = (audience: "ambassador" | "school" | "staff") =>
    resources.filter((resource) => resource.audiences.includes(audience)).length;
  const visibleResources = resources.filter((resource) => {
    const haystack = [
      resource.title,
      resource.description,
      resource.presentationTitle ?? "",
      resource.tags.join(" ")
    ]
      .join(" ")
      .toLowerCase();
    const matchesQuery = !normalizedQuery || haystack.includes(normalizedQuery);
    const matchesType = activeType === "all" || resource.type === activeType;
    const matchesTags =
      activeTags.length === 0 || activeTags.every((tag) => resource.tags.includes(tag));
    const matchesAudience =
      activeAudience === "all" || resource.audiences.includes(activeAudience);

    return matchesQuery && matchesType && matchesTags && matchesAudience;
  });

  const audienceTabs: Array<{ key: "all" | "ambassador" | "school" | "staff"; label: string }> = [
    { key: "all", label: `All (${resources.length})` },
    { key: "ambassador", label: `Ambassadors (${audienceCount("ambassador")})` },
    { key: "school", label: `Schools (${audienceCount("school")})` },
    { key: "staff", label: `Staff (${audienceCount("staff")})` }
  ];

  return (
    <div className="grid gap-5">
      {showAudienceTabs ? (
        <div className="flex w-fit max-w-full gap-1.5 overflow-x-auto rounded-full border border-[rgba(4,15,75,0.08)] bg-[rgba(247,250,252,0.92)] p-1.5">
          {audienceTabs.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveAudience(tab.key)}
              className={cn(
                "inline-flex min-h-[42px] items-center justify-center whitespace-nowrap rounded-full px-5 text-sm font-semibold transition",
                activeAudience === tab.key
                  ? "bg-[linear-gradient(135deg,rgba(175,213,237,0.92),rgba(234,248,238,0.96))] text-[color:var(--navy)] shadow-[0_10px_24px_rgba(11,24,77,0.08)]"
                  : "text-[color:var(--text-soft)] hover:bg-white hover:text-[color:var(--navy)]"
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
      ) : null}

      <div className="rounded-[30px] border border-[color:var(--border-soft)] bg-white/90 p-4 shadow-[0_18px_42px_rgba(11,24,77,0.06)]">
        <label className="flex min-h-[52px] items-center gap-3 rounded-[20px] bg-[color:var(--blue-soft)] px-4 text-sm text-[color:var(--navy)]">
          <Search className="h-4 w-4 text-[color:var(--green)]" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search title, presentation, description, or tags"
            className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-[color:var(--text-soft)]"
          />
        </label>

        <div className="mt-4 flex flex-wrap gap-2">
          <FilterChip active={activeType === "all"} onClick={() => setActiveType("all")}>
            All types
          </FilterChip>
          {types.map((type) => (
            <FilterChip key={type} active={activeType === type} onClick={() => setActiveType(type)}>
              {titleCase(type)}
            </FilterChip>
          ))}
        </div>

        {tags.length > 0 ? (
          <div className="mt-3 flex flex-wrap gap-2">
            {tags.map((tag) => (
              <FilterChip
                key={tag}
                active={activeTags.includes(tag)}
                onClick={() =>
                  setActiveTags((current) =>
                    current.includes(tag)
                      ? current.filter((item) => item !== tag)
                      : [...current, tag]
                  )
                }
              >
                #{tag}
              </FilterChip>
            ))}
          </div>
        ) : null}
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        {visibleResources.map((resource) => {
          const Icon = resourceIcon[resource.type as keyof typeof resourceIcon] ?? FileText;
          const href = resource.youtubeUrl ?? resource.downloadUrl;
          const actionLabel = resource.type === "youtube" || resource.youtubeUrl ? "Watch" : "Open";

          return (
            <article
              key={resource.id}
              className="flex h-full flex-col rounded-[30px] border border-[color:var(--border-soft)] bg-white/92 p-5 shadow-[0_18px_42px_rgba(11,24,77,0.06)]"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex gap-4">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[linear-gradient(135deg,#edf7ff,#eaf8ee)]">
                    <Icon className="h-5 w-5 text-[color:var(--green)]" />
                  </div>
                  <div>
                    <p className="text-xl font-semibold tracking-[-0.03em] text-[color:var(--navy)]">
                      {resource.title}
                    </p>
                    <p className="mt-2 line-clamp-3 text-sm leading-7 text-[color:var(--text-soft)]">
                      {resource.description || "No description added yet."}
                    </p>
                  </div>
                </div>
                {resource.isCurrent ? (
                  <span className="rounded-full bg-[#eaf8ee] px-3 py-1 text-xs font-semibold text-[#117a2e]">
                    Current
                  </span>
                ) : null}
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                {resource.audiences.map((audience) => (
                  <span
                    key={audience}
                    className="rounded-full bg-[color:var(--blue-soft)] px-3 py-1.5 text-xs font-semibold text-[color:var(--navy)]"
                  >
                    {audienceLabels[audience]}
                  </span>
                ))}
                {resource.versionLabel ? (
                  <span className="rounded-full bg-[#fff8e8] px-3 py-1.5 text-xs font-semibold text-[#9a5a00]">
                    {resource.versionLabel}
                  </span>
                ) : null}
                {resource.tags.map((tag) => (
                  <span
                    key={tag}
                    className="rounded-full bg-[#f5f7fb] px-3 py-1.5 text-xs font-semibold text-[color:var(--text-soft)]"
                  >
                    #{tag}
                  </span>
                ))}
              </div>

              <div className="mt-auto flex flex-wrap items-center gap-3 pt-5">
                {href ? (
                  <a
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex min-h-[42px] items-center justify-center gap-2 rounded-[16px] border border-[#a2cae3] bg-[#afd5ed] px-4 py-2 text-sm font-semibold text-[color:var(--navy)]"
                  >
                    {actionLabel}
                    <ExternalLink className="h-4 w-4" />
                  </a>
                ) : null}
                {editBasePath ? (
                  <a
                    href={`${editBasePath}/${resource.id}`}
                    className="inline-flex min-h-[42px] items-center justify-center rounded-[16px] border border-[color:var(--border-soft)] bg-white px-4 py-2 text-sm font-semibold text-[color:var(--navy)]"
                  >
                    Edit
                  </a>
                ) : null}
              </div>
            </article>
          );
        })}
      </div>

      {visibleResources.length === 0 ? (
        <div className="rounded-[24px] border border-dashed border-[color:var(--border-soft)] bg-white/80 px-5 py-8 text-sm text-[color:var(--text-soft)]">
          No resources match those filters yet.
        </div>
      ) : null}
    </div>
  );
}

function FilterChip({
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
        "rounded-full border px-3 py-1.5 text-xs font-semibold transition",
        active
          ? "border-[#95d2ab] bg-[#eaf8ee] text-[#117a2e]"
          : "border-[color:var(--border-soft)] bg-white text-[color:var(--navy)]"
      )}
    >
      {children}
    </button>
  );
}

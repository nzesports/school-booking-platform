"use client";

import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleCheck,
  Clock3,
  ExternalLink,
  FileText,
  Grid2X2,
  ImageIcon,
  LayoutList,
  PencilLine,
  Play,
  Plus,
  Presentation,
  Search,
  Upload
} from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

import { BookingDialogShell } from "@/components/site/booking-dialog-shell";
import { Button } from "@/components/ui/button";
import type { ResourceRecord } from "@/lib/services/portal";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 8;

type ResourceStatus = "published" | "draft" | "archived";

const statusMeta: Record<ResourceStatus, { label: string; className: string; dotClassName: string }> = {
  published: {
    label: "Published",
    className: "bg-[#eaf8ee] text-[#117a2e]",
    dotClassName: "bg-[#18a83b]"
  },
  draft: {
    label: "Draft",
    className: "bg-[#fff5df] text-[#9a5a00]",
    dotClassName: "bg-[#e8a13c]"
  },
  archived: {
    label: "Archived",
    className: "bg-[#f1f5f9] text-[#64748b]",
    dotClassName: "bg-[#94a3b8]"
  }
};

const typeMeta: Record<
  string,
  { label: string; chipClassName: string; tileClassName: string; icon: typeof FileText }
> = {
  slide_deck: {
    label: "Presentation",
    chipClassName: "bg-[#d7f2e4] text-[#047857]",
    tileClassName: "bg-[#e8f8f0] text-[#0d9463]",
    icon: Presentation
  },
  ppt: {
    label: "Presentation",
    chipClassName: "bg-[#d7f2e4] text-[#047857]",
    tileClassName: "bg-[#e8f8f0] text-[#0d9463]",
    icon: Presentation
  },
  pptx: {
    label: "Presentation",
    chipClassName: "bg-[#d7f2e4] text-[#047857]",
    tileClassName: "bg-[#e8f8f0] text-[#0d9463]",
    icon: Presentation
  },
  script: {
    label: "Script",
    chipClassName: "bg-[#dbeafe] text-[#1d4ed8]",
    tileClassName: "bg-[#e8f1fd] text-[#2563eb]",
    icon: FileText
  },
  pdf: {
    label: "PDF",
    chipClassName: "bg-[#ede9fe] text-[#6d28d9]",
    tileClassName: "bg-[#f1edfd] text-[#7c3aed]",
    icon: FileText
  },
  youtube: {
    label: "YouTube",
    chipClassName: "bg-[#fdecec] text-[#b3372e]",
    tileClassName: "bg-[#fdecec] text-[#dc2626]",
    icon: Play
  },
  video: {
    label: "Video",
    chipClassName: "bg-[#fdecec] text-[#b3372e]",
    tileClassName: "bg-[#fdecec] text-[#dc2626]",
    icon: Play
  },
  image: {
    label: "Image",
    chipClassName: "bg-[#f1f5f9] text-[#475569]",
    tileClassName: "bg-[#f1f5f9] text-[#64748b]",
    icon: ImageIcon
  },
  worksheet: {
    label: "Worksheet",
    chipClassName: "bg-[#f1f5f9] text-[#475569]",
    tileClassName: "bg-[#f1f5f9] text-[#64748b]",
    icon: FileText
  },
  file: {
    label: "File",
    chipClassName: "bg-[#f1f5f9] text-[#475569]",
    tileClassName: "bg-[#f1f5f9] text-[#64748b]",
    icon: FileText
  }
};

const audienceLabels: Record<string, string> = {
  ambassador: "Ambassadors",
  school: "Schools",
  staff: "Staff"
};

function metaForType(type: string) {
  return typeMeta[type] ?? typeMeta.file;
}

function statusOf(resource: ResourceRecord): ResourceStatus {
  if (!resource.isActive) {
    return "draft";
  }

  return resource.isCurrent ? "published" : "archived";
}

function formatUpdatedDate(iso?: string) {
  if (!iso) {
    return "—";
  }

  return new Intl.DateTimeFormat("en-NZ", {
    day: "numeric",
    month: "short",
    year: "numeric"
  }).format(new Date(iso));
}

export function ResourcesWorkspace({
  resources,
  presentations,
  action,
  returnTo
}: {
  resources: ResourceRecord[];
  presentations: Array<{ id: string; title: string }>;
  action: (formData: FormData) => void | Promise<void>;
  returnTo: string;
}) {
  const [query, setQuery] = useState("");
  const [audience, setAudience] = useState<"all" | "ambassador" | "school" | "staff">("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState<"all" | ResourceStatus>("all");
  const [sortBy, setSortBy] = useState<"updated" | "title">("updated");
  const [view, setView] = useState<"list" | "grid">("list");
  const [page, setPage] = useState(1);
  const [editorResource, setEditorResource] = useState<ResourceRecord | null | "new">(null);

  const stats = useMemo(() => {
    const total = resources.length;
    const published = resources.filter((resource) => statusOf(resource) === "published").length;
    const drafts = resources.filter((resource) => statusOf(resource) === "draft").length;
    const archived = resources.filter((resource) => statusOf(resource) === "archived").length;
    const pct = (count: number) => (total > 0 ? `${((count / total) * 100).toFixed(1)}% of total` : "—");

    return { total, published, drafts, archived, pct };
  }, [resources]);

  const typeOptions = useMemo(
    () => Array.from(new Set(resources.map((resource) => resource.type))).sort(),
    [resources]
  );

  const filtered = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const matches = resources.filter((resource) => {
      const haystack = [
        resource.title,
        resource.description,
        resource.presentationTitle ?? "",
        resource.tags.join(" ")
      ]
        .join(" ")
        .toLowerCase();

      return (
        (!normalizedQuery || haystack.includes(normalizedQuery)) &&
        (audience === "all" || resource.audiences.includes(audience)) &&
        (typeFilter === "all" || resource.type === typeFilter) &&
        (statusFilter === "all" || statusOf(resource) === statusFilter)
      );
    });

    if (sortBy === "title") {
      return [...matches].sort((a, b) => a.title.localeCompare(b.title));
    }

    return [...matches].sort(
      (a, b) => new Date(b.updatedAt ?? 0).getTime() - new Date(a.updatedAt ?? 0).getTime()
    );
  }, [resources, query, audience, typeFilter, statusFilter, sortBy]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const pageResources = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
  const resetPage = () => setPage(1);

  const audienceTabs = [
    { key: "all" as const, label: `All (${resources.length})` },
    {
      key: "ambassador" as const,
      label: `Ambassadors (${resources.filter((r) => r.audiences.includes("ambassador")).length})`
    },
    {
      key: "school" as const,
      label: `Schools (${resources.filter((r) => r.audiences.includes("school")).length})`
    },
    {
      key: "staff" as const,
      label: `Staff (${resources.filter((r) => r.audiences.includes("staff")).length})`
    }
  ];

  return (
    <div className="grid gap-5">
      {/* ------------------------------------------------ actions row */}
      <div className="flex flex-wrap items-center justify-end gap-2.5">
        <button
          type="button"
          disabled
          title="Coming soon"
          className="inline-flex min-h-[44px] items-center gap-2 rounded-[14px] border border-[color:var(--border-soft)] bg-white px-4 text-sm font-semibold text-[color:var(--text-soft)] opacity-60"
        >
          <Upload className="h-4 w-4" />
          Import
        </button>
        <button
          type="button"
          disabled
          title="Coming soon"
          className="inline-flex min-h-[44px] items-center gap-2 rounded-[14px] border border-[color:var(--border-soft)] bg-white px-4 text-sm font-semibold text-[color:var(--text-soft)] opacity-60"
        >
          Bulk actions
          <ChevronDown className="h-4 w-4" />
        </button>
        <Button
          type="button"
          onClick={() => setEditorResource("new")}
          className="rounded-[14px] border-[#2563eb] bg-[#2563eb] text-white shadow-[0_12px_28px_rgba(37,99,235,0.28)] hover:border-[#1d4fd7] hover:bg-[#1d4fd7]"
        >
          <Plus className="h-4 w-4" />
          Add resource
        </Button>
      </div>

      {/* ------------------------------------------------ stat tiles */}
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <StatTile
          icon={<FileText className="h-5 w-5" />}
          iconClassName="bg-[#e8f1fd] text-[#2563eb]"
          label="Total resources"
          value={String(stats.total)}
          hint="All time"
        />
        <StatTile
          icon={<CircleCheck className="h-5 w-5" />}
          iconClassName="bg-[#eaf8ee] text-[#117a2e]"
          label="Published"
          value={String(stats.published)}
          hint={stats.pct(stats.published)}
        />
        <StatTile
          icon={<PencilLine className="h-5 w-5" />}
          iconClassName="bg-[#fff5df] text-[#b7791f]"
          label="Drafts"
          value={String(stats.drafts)}
          hint={stats.pct(stats.drafts)}
        />
        <StatTile
          icon={<Clock3 className="h-5 w-5" />}
          iconClassName="bg-[#fdecec] text-[#b3372e]"
          label="Archived"
          value={String(stats.archived)}
          hint={stats.pct(stats.archived)}
        />
      </div>

      {/* ------------------------------------------------ audience tabs */}
      <div className="flex w-fit max-w-full gap-1.5 overflow-x-auto rounded-full border border-[rgba(4,15,75,0.08)] bg-[rgba(247,250,252,0.92)] p-1.5">
        {audienceTabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => {
              setAudience(tab.key);
              resetPage();
            }}
            className={cn(
              "inline-flex min-h-[40px] items-center justify-center whitespace-nowrap rounded-full px-4 text-sm font-semibold transition",
              audience === tab.key
                ? "bg-[linear-gradient(135deg,rgba(175,213,237,0.92),rgba(234,248,238,0.96))] text-[color:var(--navy)] shadow-[0_10px_24px_rgba(11,24,77,0.08)]"
                : "text-[color:var(--text-soft)] hover:bg-white hover:text-[color:var(--navy)]"
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ------------------------------------------------ toolbar */}
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex min-h-[48px] min-w-[240px] flex-1 items-center gap-2.5 rounded-[16px] border border-[color:var(--border-soft)] bg-white px-4 text-sm text-[color:var(--navy)]">
          <Search className="h-4 w-4 text-[color:var(--text-soft)]" />
          <input
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              resetPage();
            }}
            placeholder="Search resources by title, description, or tags..."
            className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-[color:var(--text-soft)]"
          />
        </label>

        <ToolbarSelect
          label="Type"
          value={typeFilter}
          onChange={(value) => {
            setTypeFilter(value);
            resetPage();
          }}
          options={[
            { value: "all", label: "All types" },
            ...typeOptions.map((type) => ({ value: type, label: metaForType(type).label }))
          ]}
        />
        <ToolbarSelect
          label="Status"
          value={statusFilter}
          onChange={(value) => {
            setStatusFilter(value as "all" | ResourceStatus);
            resetPage();
          }}
          options={[
            { value: "all", label: "All statuses" },
            { value: "published", label: "Published" },
            { value: "draft", label: "Draft" },
            { value: "archived", label: "Archived" }
          ]}
        />
        <ToolbarSelect
          label="Sort by"
          value={sortBy}
          onChange={(value) => setSortBy(value as "updated" | "title")}
          options={[
            { value: "updated", label: "Last updated" },
            { value: "title", label: "Title A–Z" }
          ]}
        />

        <div className="flex overflow-hidden rounded-[14px] border border-[color:var(--border-soft)] bg-white">
          <button
            type="button"
            aria-label="List view"
            onClick={() => setView("list")}
            className={cn(
              "flex h-[46px] w-12 items-center justify-center transition",
              view === "list" ? "bg-[#eaf8ee] text-[#117a2e]" : "text-[color:var(--text-soft)]"
            )}
          >
            <LayoutList className="h-4 w-4" />
          </button>
          <button
            type="button"
            aria-label="Grid view"
            onClick={() => setView("grid")}
            className={cn(
              "flex h-[46px] w-12 items-center justify-center border-l border-[color:var(--border-soft)] transition",
              view === "grid" ? "bg-[#eaf8ee] text-[#117a2e]" : "text-[color:var(--text-soft)]"
            )}
          >
            <Grid2X2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* ------------------------------------------------ list / grid */}
      {view === "list" ? (
        <div className="overflow-hidden rounded-[24px] border border-[color:var(--border-soft)] bg-white/92">
          <div className="hidden grid-cols-[minmax(0,2.4fr)_minmax(0,1.1fr)_minmax(0,0.8fr)_minmax(0,0.8fr)_minmax(0,0.9fr)_minmax(0,90px)] gap-4 border-b border-[color:var(--border-soft)] bg-[#f6f9fd] px-5 py-3 lg:grid">
            {["Resource", "Audience", "Type", "Status", "Last updated", "Actions"].map((label) => (
              <p
                key={label}
                className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[color:var(--text-soft)]"
              >
                {label}
              </p>
            ))}
          </div>

          {pageResources.map((resource, index) => {
            const meta = metaForType(resource.type);
            const status = statusMeta[statusOf(resource)];
            const Icon = meta.icon;
            const href = resource.youtubeUrl ?? resource.downloadUrl;

            return (
              <div
                key={resource.id}
                className={cn(
                  "grid gap-4 px-5 py-4 lg:grid-cols-[minmax(0,2.4fr)_minmax(0,1.1fr)_minmax(0,0.8fr)_minmax(0,0.8fr)_minmax(0,0.9fr)_minmax(0,90px)] lg:items-center",
                  index > 0 && "border-t border-[color:var(--border-soft)]"
                )}
              >
                <div className="flex min-w-0 items-start gap-3.5">
                  <div
                    className={cn(
                      "flex h-11 w-11 shrink-0 items-center justify-center rounded-[12px]",
                      meta.tileClassName
                    )}
                  >
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-semibold text-[color:var(--navy)]">{resource.title}</p>
                    <p className="mt-0.5 line-clamp-2 text-sm leading-5 text-[color:var(--text-soft)]">
                      {resource.description || "No description added yet."}
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap gap-1.5">
                  {resource.audiences.map((entry) => (
                    <span
                      key={entry}
                      className="rounded-full bg-[#eef2f8] px-2.5 py-1 text-xs font-semibold text-[color:var(--navy)]"
                    >
                      {audienceLabels[entry] ?? entry}
                    </span>
                  ))}
                </div>

                <div>
                  <span
                    className={cn(
                      "inline-flex rounded-full px-2.5 py-1 text-xs font-semibold",
                      meta.chipClassName
                    )}
                  >
                    {meta.label}
                  </span>
                </div>

                <div>
                  <span
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold",
                      status.className
                    )}
                  >
                    <span className={cn("h-1.5 w-1.5 rounded-full", status.dotClassName)} />
                    {status.label}
                  </span>
                </div>

                <div className="text-sm text-[color:var(--navy)]">
                  <p>{formatUpdatedDate(resource.updatedAt)}</p>
                  {resource.createdByName ? (
                    <p className="text-xs text-[color:var(--text-soft)]">
                      by {resource.createdByName.split(" ")[0]}
                    </p>
                  ) : null}
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    aria-label={`Edit ${resource.title}`}
                    onClick={() => setEditorResource(resource)}
                    className="flex h-9 w-9 items-center justify-center rounded-[10px] border border-[color:var(--border-soft)] bg-white text-[color:var(--navy)] transition hover:border-[rgba(4,15,75,0.24)]"
                  >
                    <PencilLine className="h-4 w-4" />
                  </button>
                  {href ? (
                    <a
                      href={href}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={`Open ${resource.title}`}
                      className="flex h-9 w-9 items-center justify-center rounded-[10px] border border-[color:var(--border-soft)] bg-white text-[color:var(--text-soft)] transition hover:text-[color:var(--navy)]"
                    >
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  ) : null}
                </div>
              </div>
            );
          })}

          {pageResources.length === 0 ? (
            <p className="px-5 py-10 text-sm text-[color:var(--text-soft)]">
              No resources match those filters yet.
            </p>
          ) : null}

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[color:var(--border-soft)] bg-[#f6f9fd] px-5 py-3">
            <p className="text-sm text-[color:var(--text-soft)]">
              Showing {filtered.length === 0 ? 0 : (safePage - 1) * PAGE_SIZE + 1} to{" "}
              {Math.min(safePage * PAGE_SIZE, filtered.length)} of {filtered.length} resource
              {filtered.length === 1 ? "" : "s"}
            </p>
            <div className="flex items-center gap-1.5">
              <PageButton
                disabled={safePage <= 1}
                onClick={() => setPage(safePage - 1)}
                ariaLabel="Previous page"
              >
                <ChevronLeft className="h-4 w-4" />
              </PageButton>
              {Array.from({ length: pageCount }, (_, index) => index + 1).map((pageNumber) => (
                <PageButton
                  key={pageNumber}
                  active={pageNumber === safePage}
                  onClick={() => setPage(pageNumber)}
                  ariaLabel={`Page ${pageNumber}`}
                >
                  {pageNumber}
                </PageButton>
              ))}
              <PageButton
                disabled={safePage >= pageCount}
                onClick={() => setPage(safePage + 1)}
                ariaLabel="Next page"
              >
                <ChevronRight className="h-4 w-4" />
              </PageButton>
            </div>
          </div>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {pageResources.map((resource) => {
            const meta = metaForType(resource.type);
            const status = statusMeta[statusOf(resource)];
            const Icon = meta.icon;

            return (
              <article
                key={resource.id}
                className="flex h-full flex-col rounded-[22px] border border-[color:var(--border-soft)] bg-white/92 p-5"
              >
                <div className="flex items-start justify-between gap-3">
                  <div
                    className={cn(
                      "flex h-11 w-11 items-center justify-center rounded-[12px]",
                      meta.tileClassName
                    )}
                  >
                    <Icon className="h-5 w-5" />
                  </div>
                  <span
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold",
                      status.className
                    )}
                  >
                    <span className={cn("h-1.5 w-1.5 rounded-full", status.dotClassName)} />
                    {status.label}
                  </span>
                </div>
                <p className="mt-3 font-semibold text-[color:var(--navy)]">{resource.title}</p>
                <p className="mt-1 line-clamp-2 text-sm leading-6 text-[color:var(--text-soft)]">
                  {resource.description || "No description added yet."}
                </p>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  <span className={cn("rounded-full px-2.5 py-1 text-xs font-semibold", meta.chipClassName)}>
                    {meta.label}
                  </span>
                  {resource.audiences.map((entry) => (
                    <span
                      key={entry}
                      className="rounded-full bg-[#eef2f8] px-2.5 py-1 text-xs font-semibold text-[color:var(--navy)]"
                    >
                      {audienceLabels[entry] ?? entry}
                    </span>
                  ))}
                </div>
                <div className="mt-auto flex items-center justify-between gap-3 pt-4">
                  <span className="text-xs text-[color:var(--text-soft)]">
                    {formatUpdatedDate(resource.updatedAt)}
                  </span>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => setEditorResource(resource)}
                    className="min-h-[38px] rounded-[12px] px-3.5 py-1.5 text-xs"
                  >
                    <PencilLine className="h-3.5 w-3.5" />
                    Edit
                  </Button>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {/* ------------------------------------------------ editor dialog */}
      {editorResource !== null ? (
        <ResourceEditorDialog
          resource={editorResource === "new" ? null : editorResource}
          presentations={presentations}
          action={action}
          returnTo={returnTo}
          onClose={() => setEditorResource(null)}
        />
      ) : null}
    </div>
  );
}

function ResourceEditorDialog({
  resource,
  presentations,
  action,
  returnTo,
  onClose
}: {
  resource: ResourceRecord | null;
  presentations: Array<{ id: string; title: string }>;
  action: (formData: FormData) => void | Promise<void>;
  returnTo: string;
  onClose: () => void;
}) {
  const inputClassName =
    "w-full rounded-[16px] border border-[color:var(--border-soft)] bg-white px-4 py-3 text-sm text-[color:var(--text-dark)] outline-none transition focus:border-[color:rgba(24,168,59,0.34)] focus:ring-4 focus:ring-[rgba(24,168,59,0.1)]";

  // Portalled to <body> so glassy card ancestors (backdrop-filter) can't trap
  // the fixed overlay inside their own bounds.
  return createPortal(
    <BookingDialogShell
      kicker={resource ? "Edit resource" : "New resource"}
      title={resource ? resource.title : "Add a resource"}
      description="Changes publish to the selected audiences as soon as you save."
      onClose={onClose}
      maxWidthClassName="max-w-[820px]"
      overlayClassName="z-[80]"
      compact
    >
      <form action={action} encType="multipart/form-data" className="mt-6 grid gap-4">
        {resource?.id ? <input type="hidden" name="id" value={resource.id} /> : null}
        <input type="hidden" name="returnTo" value={returnTo} />

        <label className="grid gap-1.5 text-sm font-semibold text-[color:var(--navy)]">
          Title *
          <input name="title" required defaultValue={resource?.title ?? ""} className={inputClassName} />
        </label>

        <label className="grid gap-1.5 text-sm font-semibold text-[color:var(--navy)]">
          Description
          <textarea
            name="description"
            defaultValue={resource?.description ?? ""}
            className={cn(inputClassName, "min-h-[5.5rem] leading-6")}
          />
        </label>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="grid gap-1.5 text-sm font-semibold text-[color:var(--navy)]">
            Audiences *
            <div className="flex flex-wrap gap-2">
              {[
                ["ambassador", "Ambassadors"],
                ["school", "Schools"],
                ["staff", "Staff"]
              ].map(([value, label]) => (
                <label
                  key={value}
                  className="inline-flex items-center gap-2 rounded-full border border-[color:var(--border-soft)] bg-white px-3.5 py-2 text-sm font-medium text-[color:var(--navy)]"
                >
                  <input
                    type="checkbox"
                    name="audiences"
                    value={value}
                    defaultChecked={
                      resource
                        ? resource.audiences.includes(value as "school" | "ambassador" | "staff")
                        : value === "ambassador"
                    }
                  />
                  {label}
                </label>
              ))}
            </div>
          </div>
          <label className="grid gap-1.5 text-sm font-semibold text-[color:var(--navy)]">
            Resource type
            <select name="resourceType" defaultValue={resource?.type ?? "pdf"} className={inputClassName}>
              <option value="pdf">PDF</option>
              <option value="slide_deck">Presentation / slide deck</option>
              <option value="pptx">PPTX</option>
              <option value="script">Script</option>
              <option value="image">Image</option>
              <option value="youtube">YouTube</option>
              <option value="video">Video</option>
              <option value="file">Downloadable file</option>
            </select>
          </label>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <label className="grid gap-1.5 text-sm font-semibold text-[color:var(--navy)]">
            Tags
            <input
              name="tags"
              defaultValue={resource?.tags.join(", ") ?? ""}
              placeholder="wellbeing, parents, year-9"
              className={inputClassName}
            />
          </label>
          <label className="grid gap-1.5 text-sm font-semibold text-[color:var(--navy)]">
            Presentation link
            <select
              name="presentationTypeId"
              defaultValue={resource?.presentationTypeId ?? ""}
              className={inputClassName}
            >
              <option value="">General resource</option>
              {presentations.map((presentation) => (
                <option key={presentation.id} value={presentation.id}>
                  {presentation.title}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <label className="grid gap-1.5 text-sm font-semibold text-[color:var(--navy)]">
            External download URL
            <input
              name="externalUrl"
              defaultValue={resource?.externalUrl ?? ""}
              placeholder="https://..."
              className={inputClassName}
            />
          </label>
          <label className="grid gap-1.5 text-sm font-semibold text-[color:var(--navy)]">
            YouTube URL
            <input
              name="youtubeUrl"
              defaultValue={resource?.youtubeUrl ?? ""}
              placeholder="https://www.youtube.com/watch?v=..."
              className={inputClassName}
            />
          </label>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <label className="grid gap-1.5 text-sm font-semibold text-[color:var(--navy)]">
            Version label
            <input
              name="versionLabel"
              defaultValue={resource?.versionLabel ?? ""}
              placeholder="v2026.07"
              className={inputClassName}
            />
          </label>
          <label className="grid gap-1.5 text-sm font-semibold text-[color:var(--navy)]">
            Upload file
            <input
              type="file"
              name="file"
              accept=".pdf,.ppt,.pptx,.png,.jpg,.jpeg,.webp,.txt,.doc,.docx"
              className={cn(inputClassName, "border-dashed py-2.5")}
            />
          </label>
        </div>

        <div className="flex flex-wrap gap-3">
          <label className="inline-flex items-center gap-2.5 rounded-[16px] border border-[color:var(--border-soft)] bg-[#f6f9fd] px-4 py-3 text-sm text-[color:var(--navy)]">
            <input type="checkbox" name="isCurrent" defaultChecked={resource?.isCurrent ?? true} />
            Mark as current version
          </label>
          <label className="inline-flex items-center gap-2.5 rounded-[16px] border border-[color:var(--border-soft)] bg-[#f6f9fd] px-4 py-3 text-sm text-[color:var(--navy)]">
            <input type="checkbox" name="isActive" defaultChecked={resource?.isActive ?? true} />
            Visible to selected audiences
          </label>
        </div>

        <div className="mt-1 flex flex-wrap items-center justify-end gap-3 border-t border-[color:var(--border-soft)] pt-4">
          <Button type="button" variant="secondary" onClick={onClose} className="rounded-[14px]">
            Cancel
          </Button>
          <Button
            type="submit"
            className="rounded-[14px] border-[#2563eb] bg-[#2563eb] text-white shadow-[0_12px_28px_rgba(37,99,235,0.28)] hover:border-[#1d4fd7] hover:bg-[#1d4fd7]"
          >
            {resource ? "Save changes" : "Create resource"}
          </Button>
        </div>
      </form>
    </BookingDialogShell>,
    document.body
  );
}

function StatTile({
  icon,
  iconClassName,
  label,
  value,
  hint
}: {
  icon: ReactNode;
  iconClassName: string;
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <div className="flex items-center gap-4 rounded-[22px] border border-[color:var(--border-soft)] bg-white/92 p-5">
      <div className={cn("flex h-12 w-12 shrink-0 items-center justify-center rounded-full", iconClassName)}>
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-sm text-[color:var(--text-soft)]">{label}</p>
        <p className="text-2xl font-semibold tracking-[-0.03em] text-[color:var(--navy)]">{value}</p>
        <p className="text-xs text-[color:var(--text-soft)]">{hint}</p>
      </div>
    </div>
  );
}

function ToolbarSelect({
  label,
  value,
  onChange,
  options
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <label className="grid gap-1">
      <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[color:var(--text-soft)]">
        {label}
      </span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="min-h-[48px] rounded-[16px] border border-[color:var(--border-soft)] bg-white px-3.5 text-sm font-semibold text-[color:var(--navy)] outline-none"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function PageButton({
  children,
  onClick,
  active = false,
  disabled = false,
  ariaLabel
}: {
  children: ReactNode;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  ariaLabel: string;
}) {
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "flex h-9 min-w-9 items-center justify-center rounded-[10px] border px-2 text-sm font-semibold transition",
        active
          ? "border-[#2563eb] bg-[#2563eb] text-white"
          : "border-[color:var(--border-soft)] bg-white text-[color:var(--navy)] disabled:opacity-40"
      )}
    >
      {children}
    </button>
  );
}

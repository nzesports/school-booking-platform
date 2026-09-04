"use client";

import {
  ChevronLeft,
  ChevronRight,
  CircleCheck,
  Clock3,
  Download,
  Eye,
  ExternalLink,
  FileText,
  Globe2,
  Grid2X2,
  ImageIcon,
  LayoutList,
  Link2,
  LockKeyhole,
  PackageOpen,
  PencilLine,
  Play,
  Plus,
  Presentation,
  Search,
  Tags,
  Trash2,
  Upload,
} from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

import { BookingDialogShell } from "@/components/site/booking-dialog-shell";
import { Button } from "@/components/ui/button";
import { SecondaryTabs } from "@/components/ui/secondary-tabs";
import type { ResourceAudience } from "@/lib/domain/types";
import type { ResourceCategory, ResourceRecord } from "@/lib/services/portal";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 8;

type ResourceStatus = "published" | "draft" | "archived";
export type ResourceWorkspaceMode = "training" | "materials";
type NewResourceDefaults = {
  category?: ResourceCategory;
  presentationTypeId?: string;
};

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
  presentation: {
    label: "Presentation",
    chipClassName: "bg-[#d7f2e4] text-[#047857]",
    tileClassName: "bg-[#e8f8f0] text-[#0d9463]",
    icon: Presentation
  },
  poster: {
    label: "Poster",
    chipClassName: "bg-[#ede9fe] text-[#6d28d9]",
    tileClassName: "bg-[#f1edfd] text-[#7c3aed]",
    icon: ImageIcon
  },
  flyer: {
    label: "Flyer",
    chipClassName: "bg-[#fff3df] text-[#9a5a00]",
    tileClassName: "bg-[#fff5df] text-[#a45c00]",
    icon: FileText
  },
  guide: {
    label: "Guide",
    chipClassName: "bg-[#dbeafe] text-[#1d4ed8]",
    tileClassName: "bg-[#e8f1fd] text-[#2563eb]",
    icon: FileText
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
  document: {
    label: "Document",
    chipClassName: "bg-[#e8f1fd] text-[#1d4ed8]",
    tileClassName: "bg-[#e8f1fd] text-[#2563eb]",
    icon: FileText
  },
  docx: {
    label: "Word document",
    chipClassName: "bg-[#e8f1fd] text-[#1d4ed8]",
    tileClassName: "bg-[#e8f1fd] text-[#2563eb]",
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
  link: {
    label: "Link",
    chipClassName: "bg-[#e8f1fd] text-[#1d4ed8]",
    tileClassName: "bg-[#e8f1fd] text-[#2563eb]",
    icon: ExternalLink
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
  public: "Public website",
  ambassador: "Ambassadors",
  school: "Schools",
  staff: "Staff"
};

const audienceOptions: Array<{
  value: ResourceAudience;
  label: string;
  detail: string;
  icon: typeof Globe2;
}> = [
  { value: "ambassador", label: "Ambassadors", detail: "Signed-in ambassador portal", icon: LockKeyhole },
  { value: "school", label: "Schools", detail: "Signed-in school portal", icon: Presentation }
];

const sharingOptions = [
  {
    value: "internal" as const,
    label: "Internal",
    detail: "NZ Esports use only. Do not share with schools.",
    icon: LockKeyhole
  },
  {
    value: "public" as const,
    label: "Public",
    detail: "Approved for ambassadors and staff to share with schools.",
    icon: Globe2
  }
];

function metaForType(type: string) {
  return typeMeta[type] ?? typeMeta.file;
}

function statusOf(resource: ResourceRecord): ResourceStatus {
  if (!resource.isActive) {
    return "draft";
  }

  return resource.isCurrent ? "published" : "archived";
}

function VisibilityBadge({ resource }: { resource: ResourceRecord }) {
  const isPublic = resource.sharingScope === "public";

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold",
        isPublic ? "bg-[#e8f1fd] text-[#1e4fae]" : "bg-[#f1edfd] text-[#6941c6]"
      )}
    >
      {isPublic ? <Globe2 className="h-3.5 w-3.5" /> : <LockKeyhole className="h-3.5 w-3.5" />}
      {isPublic ? "Public" : "Internal"}
    </span>
  );
}

function attachedFileName(storagePath: string) {
  const encodedName = storagePath.split("/").at(-1) ?? storagePath;

  try {
    return decodeURIComponent(encodedName).replace(/-[0-9a-f]{8}(?=\.[^.]+$)/i, "");
  } catch {
    return encodedName;
  }
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

function previewUrlFor(resource: ResourceRecord) {
  if (resource.youtubeUrl) {
    return resource.youtubeUrl;
  }

  if (resource.storagePath) {
    return `/portal/download/${encodeURIComponent(resource.id)}`;
  }

  return resource.externalUrl ?? resource.downloadUrl ?? null;
}

function downloadUrlFor(resource: ResourceRecord) {
  if (!resource.storagePath) {
    return null;
  }

  return `/portal/download/${encodeURIComponent(resource.id)}?download=1`;
}

export function ResourcesWorkspace({
  resources,
  presentations,
  action,
  returnTo,
  mode,
  initialTrainingView = "packs",
  initialTrainingPackId,
  initialEditorOpen = false
}: {
  resources: ResourceRecord[];
  presentations: Array<{ id: string; title: string }>;
  action: (formData: FormData) => void | Promise<void>;
  returnTo: string;
  mode: ResourceWorkspaceMode;
  initialTrainingView?: "packs" | "general";
  initialTrainingPackId?: string;
  initialEditorOpen?: boolean;
}) {
  const isTraining = mode === "training";
  const lockedCategory: ResourceCategory = isTraining ? "training" : "presentation_material";
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [presentationFilter, setPresentationFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState<"all" | ResourceStatus>("all");
  const [sortBy, setSortBy] = useState<"updated" | "title">("updated");
  const [view, setView] = useState<"list" | "grid">("list");
  const [page, setPage] = useState(1);
  const [editorResource, setEditorResource] = useState<ResourceRecord | null | "new">(
    initialEditorOpen ? "new" : null
  );
  const [newResourceDefaults, setNewResourceDefaults] = useState<NewResourceDefaults>({});
  const [trainingView, setTrainingView] = useState<"packs" | "general">(
    initialTrainingPackId ? "packs" : initialTrainingView
  );
  const [selectedPackId, setSelectedPackId] = useState<string | null>(
    initialTrainingPackId ?? null
  );

  const scopedResources = useMemo(() => {
    if (!isTraining) {
      return resources;
    }

    if (trainingView === "general") {
      return resources.filter((resource) => !resource.presentationTypeId);
    }

    return selectedPackId
      ? resources.filter((resource) => resource.presentationTypeId === selectedPackId)
      : [];
  }, [isTraining, resources, selectedPackId, trainingView]);

  const stats = useMemo(() => {
    const total = scopedResources.length;
    const published = scopedResources.filter((resource) => statusOf(resource) === "published").length;
    const drafts = scopedResources.filter((resource) => statusOf(resource) === "draft").length;
    const archived = scopedResources.filter((resource) => statusOf(resource) === "archived").length;
    const pct = (count: number) => (total > 0 ? `${((count / total) * 100).toFixed(1)}% of total` : "—");

    return { total, published, drafts, archived, pct };
  }, [scopedResources]);

  const typeOptions = useMemo(
    () => Array.from(new Set(scopedResources.map((resource) => resource.type))).sort(),
    [scopedResources]
  );

  const trainingPacks = useMemo(() => {
    const packResources = new Map<string, ResourceRecord[]>();

    for (const resource of resources) {
      if (resource.category !== "training" || !resource.presentationTypeId) {
        continue;
      }

      const existingItems = packResources.get(resource.presentationTypeId);

      if (existingItems) {
        existingItems.push(resource);
      } else {
        packResources.set(resource.presentationTypeId, [resource]);
      }
    }

    return presentations.map((presentation) => {
      const items = packResources.get(presentation.id) ?? [];
      const published = items.filter((resource) => statusOf(resource) === "published").length;

      return { presentation, items, published };
    });
  }, [presentations, resources]);

  const filtered = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const matches = scopedResources.filter((resource) => {
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
        (typeFilter === "all" || resource.type === typeFilter) &&
        (presentationFilter === "all" || resource.presentationTypeId === presentationFilter) &&
        (statusFilter === "all" || statusOf(resource) === statusFilter)
      );
    });

    if (sortBy === "title") {
      return [...matches].sort((a, b) => a.title.localeCompare(b.title));
    }

    return [...matches].sort(
      (a, b) => new Date(b.updatedAt ?? 0).getTime() - new Date(a.updatedAt ?? 0).getTime()
    );
  }, [
    scopedResources,
    query,
    typeFilter,
    presentationFilter,
    statusFilter,
    sortBy
  ]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const pageResources = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
  const resetPage = () => setPage(1);
  const openNewResource = (defaults: NewResourceDefaults = {}) => {
    setNewResourceDefaults(defaults);
    setEditorResource("new");
  };
  const viewTrainingPack = (presentationTypeId: string) => {
    const isClosing = selectedPackId === presentationTypeId;
    setTrainingView("packs");
    setSelectedPackId(isClosing ? null : presentationTypeId);
    setQuery("");
    setTypeFilter("all");
    setStatusFilter("all");
    setPresentationFilter(isClosing ? "all" : presentationTypeId);
    setPage(1);
    if (!isClosing) {
      window.requestAnimationFrame(() => {
        document.getElementById("training-library-scope")?.scrollIntoView({ block: "start" });
      });
    }
  };
  const selectedPack = trainingPacks.find(
    ({ presentation }) => presentation.id === selectedPackId
  );
  const generalTrainingCount = resources.filter(
    (resource) => resource.category === "training" && !resource.presentationTypeId
  ).length;
  const showLibrary = !isTraining || trainingView === "general" || Boolean(selectedPack);
  const editorPackId =
    editorResource === "new"
      ? newResourceDefaults.presentationTypeId
      : editorResource?.presentationTypeId;
  const editorReturnTo = isTraining
    ? `${returnTo}?view=${editorPackId ? "packs" : trainingView}${
        editorPackId ? `&pack=${encodeURIComponent(editorPackId)}` : ""
      }`
    : returnTo;

  return (
    <div className="grid gap-5">
      {isTraining ? (
        <SecondaryTabs
          ariaLabel="Training library sections"
          value={trainingView}
          onChange={(value) => {
            setTrainingView(value);
            setSelectedPackId(null);
            setPresentationFilter("all");
            setQuery("");
            setPage(1);
          }}
          items={[
            {
              value: "packs",
              label: "Presentation packs",
              icon: PackageOpen,
              count: trainingPacks.length
            },
            {
              value: "general",
              label: "General training",
              icon: FileText,
              count: generalTrainingCount
            }
          ]}
        />
      ) : null}

      {/* -------------------------------------------- ambassador training packs */}
      {isTraining && trainingView === "packs" ? <section className="rounded-[26px] border border-[#cce8d3] bg-white/92 p-5 md:p-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] bg-[#dff3e4] text-[#117a2e]">
              <PackageOpen className="h-5 w-5" />
            </span>
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.14em] text-[#117a2e]">
                Ambassador training
              </p>
              <h2 className="mt-1 text-2xl font-semibold tracking-[-0.03em] text-[color:var(--navy)]">
                Build presentation packs
              </h2>
            </div>
          </div>
          <span className="rounded-full bg-white px-3.5 py-2 text-sm font-semibold text-[#117a2e] shadow-sm">
            {trainingPacks.filter((pack) => pack.published > 0).length}/{trainingPacks.length} packs published
          </span>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {trainingPacks.map(({ presentation, items, published }) => (
            <article
              key={presentation.id}
              className={cn(
                "flex min-h-[168px] flex-col rounded-[20px] border bg-white p-4 transition",
                selectedPackId === presentation.id
                  ? "border-[#18a83b] shadow-[0_12px_30px_rgba(17,122,46,0.1)]"
                  : "border-[color:var(--border-soft)] hover:border-[#bfe6d2]"
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-[12px] bg-[#eaf8ee] text-[#117a2e]">
                  <Presentation className="h-4.5 w-4.5" />
                </span>
                <span className={cn(
                  "rounded-full px-2.5 py-1 text-xs font-semibold",
                  published > 0 ? "bg-[#eaf8ee] text-[#117a2e]" : "bg-[#f1f5f2] text-[#64748b]"
                )}>
                  {published > 0 ? `${published} published` : "Empty pack"}
                </span>
              </div>
              <h3 className="mt-3 font-semibold text-[color:var(--navy)]">{presentation.title}</h3>
              <p className="mt-1 text-sm text-[color:var(--text-soft)]">
                {items.length} {items.length === 1 ? "resource" : "resources"} in this training pack
              </p>
              <div className="mt-auto flex flex-wrap gap-2 pt-4">
                <Button
                  type="button"
                  onClick={() => openNewResource({ category: "training", presentationTypeId: presentation.id })}
                  className="min-h-[38px] rounded-[11px] px-3 py-1.5 shadow-none"
                >
                  <Plus className="h-3.5 w-3.5" /> Add to pack
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => viewTrainingPack(presentation.id)}
                  aria-pressed={selectedPackId === presentation.id}
                  className="min-h-[38px] rounded-[11px] border-[#bfe6d2] px-3 py-1.5 text-[#117a2e] shadow-none hover:bg-[#f0fbf5]"
                >
                  {selectedPackId === presentation.id ? "Close pack" : "Open pack"}
                </Button>
              </div>
            </article>
          ))}
        </div>
      </section> : null}

      {showLibrary ? (
        <section
          className={cn(
            "grid scroll-mt-6 gap-0 overflow-hidden rounded-[26px] border bg-white/92 shadow-[0_14px_36px_rgba(11,24,77,0.05)]",
            isTraining ? "border-[#cce8d3]" : "border-[#d8c8f4]"
          )}
        >
      {isTraining ? (
        <div
          id="training-library-scope"
          className={cn(
            "scroll-mt-6 flex flex-wrap items-center justify-between gap-4 border border-[#cce8d3] bg-[#f4fbf6] p-5",
            "rounded-none border-x-0 border-t-0 px-5 py-4 md:px-6"
          )}
        >
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] bg-white text-[#117a2e] shadow-sm">
              {selectedPack ? <Presentation className="h-4.5 w-4.5" /> : <FileText className="h-4.5 w-4.5" />}
            </span>
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#117a2e]">
                {selectedPack ? "Selected presentation pack" : "General training"}
              </p>
              <h2 className="mt-1 text-xl font-semibold tracking-[-0.025em] text-[color:var(--navy)]">
                {selectedPack?.presentation.title ?? "General training resources"}
              </h2>
            </div>
          </div>
          <Button
            type="button"
            variant="secondary"
            onClick={() =>
              openNewResource({
                category: "training",
                presentationTypeId: selectedPack?.presentation.id
              })
            }
            className="rounded-[14px] border-[#bfe6d2] bg-white text-[#117a2e] hover:bg-[#eaf8ee]"
          >
            <Plus className="h-4 w-4" />
            {selectedPack ? "Add to this pack" : "Add general resource"}
          </Button>
        </div>
      ) : null}

      <div className="grid gap-5 p-5 md:p-6">
      {/* ------------------------------------------------ stat tiles */}
      <div className={cn(
        "grid grid-cols-2 gap-4 xl:grid-cols-4",
        "gap-0 overflow-hidden rounded-[20px] border border-[color:var(--border-soft)] bg-white"
      )}>
        <StatTile
          icon={<FileText className="h-5 w-5" />}
          iconClassName="bg-[#e8f1fd] text-[#2563eb]"
          label="Total resources"
          value={String(stats.total)}
          hint="All time"
          connected
        />
        <StatTile
          icon={<CircleCheck className="h-5 w-5" />}
          iconClassName="bg-[#eaf8ee] text-[#117a2e]"
          label="Published"
          value={String(stats.published)}
          hint={stats.pct(stats.published)}
          connected
        />
        <StatTile
          icon={<PencilLine className="h-5 w-5" />}
          iconClassName="bg-[#fff5df] text-[#b7791f]"
          label="Drafts"
          value={String(stats.drafts)}
          hint={stats.pct(stats.drafts)}
          connected
        />
        <StatTile
          icon={<Clock3 className="h-5 w-5" />}
          iconClassName="bg-[#fdecec] text-[#b3372e]"
          label="Archived"
          value={String(stats.archived)}
          hint={stats.pct(stats.archived)}
          connected
        />
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

        {!isTraining ? (
          <ToolbarSelect
            label="Presentation"
            value={presentationFilter}
            onChange={(value) => {
              setPresentationFilter(value);
              resetPage();
            }}
            options={[
              { value: "all", label: "All presentations" },
              ...presentations.map((presentation) => ({
                value: presentation.id,
                label: presentation.title
              }))
            ]}
          />
        ) : null}
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
          <div className="hidden grid-cols-[minmax(0,2.4fr)_minmax(0,1.1fr)_minmax(0,0.8fr)_minmax(0,0.8fr)_minmax(0,0.9fr)_minmax(0,130px)] gap-4 border-b border-[color:var(--border-soft)] bg-[#f6f9fd] px-5 py-3 lg:grid">
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

            return (
              <div
                key={resource.id}
                className={cn(
                  "grid gap-4 px-5 py-4 lg:grid-cols-[minmax(0,2.4fr)_minmax(0,1.1fr)_minmax(0,0.8fr)_minmax(0,0.8fr)_minmax(0,0.9fr)_minmax(0,130px)] lg:items-center",
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
                    {resource.presentationTitle ? (
                      <p className="mt-1 text-xs font-semibold text-[#117a2e]">
                        {resource.category === "training"
                          ? "Training pack"
                          : resource.category === "presentation_material"
                            ? "Presentation materials"
                            : "Linked presentation"}
                        {" · "}{resource.presentationTitle}
                      </p>
                    ) : ["training", "presentation_material"].includes(resource.category) ? (
                      <p className="mt-1 text-xs font-semibold text-[#9a5a00]">
                        Presentation link needed
                      </p>
                    ) : null}
                  </div>
                </div>

                <div className="flex flex-wrap gap-1.5">
                  <VisibilityBadge resource={resource} />
                  {resource.audiences.filter((entry) => entry !== "staff").map((entry) => (
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

                <ResourceActions
                  resource={resource}
                  onEdit={() => setEditorResource(resource)}
                />
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
                {resource.presentationTitle ? (
                  <p className="mt-2 text-xs font-semibold text-[#117a2e]">
                    {resource.category === "training"
                      ? "Training pack"
                      : resource.category === "presentation_material"
                        ? "Presentation materials"
                        : "Linked presentation"}
                    {" · "}{resource.presentationTitle}
                  </p>
                ) : ["training", "presentation_material"].includes(resource.category) ? (
                  <p className="mt-2 text-xs font-semibold text-[#9a5a00]">
                    Presentation link needed
                  </p>
                ) : null}
                <div className="mt-3 flex flex-wrap gap-1.5">
                  <span className={cn("rounded-full px-2.5 py-1 text-xs font-semibold", meta.chipClassName)}>
                    {meta.label}
                  </span>
                  <VisibilityBadge resource={resource} />
                  {resource.audiences.filter((entry) => entry !== "staff").map((entry) => (
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
                  <ResourceActions
                    resource={resource}
                    onEdit={() => setEditorResource(resource)}
                  />
                </div>
              </article>
            );
          })}
        </div>
      )}

      </div>
      </section>
      ) : null}

      {/* ------------------------------------------------ editor dialog */}
      {editorResource !== null ? (
        <ResourceEditorDialog
          resource={editorResource === "new" ? null : editorResource}
          defaultPresentationTypeId={
            editorResource === "new" ? newResourceDefaults.presentationTypeId : undefined
          }
          presentations={presentations}
          action={action}
          returnTo={editorReturnTo}
          lockedCategory={lockedCategory}
          onClose={() => setEditorResource(null)}
        />
      ) : null}
    </div>
  );
}

function ResourceActions({
  resource,
  onEdit
}: {
  resource: ResourceRecord;
  onEdit: () => void;
}) {
  const previewUrl = previewUrlFor(resource);
  const downloadUrl = downloadUrlFor(resource);
  const actionClassName =
    "flex h-9 w-9 items-center justify-center rounded-[10px] border border-[color:var(--border-soft)] bg-white text-[color:var(--text-soft)] transition hover:border-[rgba(4,15,75,0.24)] hover:text-[color:var(--navy)]";

  return (
    <div className="flex items-center gap-1.5">
      <button
        type="button"
        title="Edit resource"
        aria-label={`Edit ${resource.title}`}
        onClick={onEdit}
        className={cn(actionClassName, "text-[color:var(--navy)]")}
      >
        <PencilLine className="h-4 w-4" />
      </button>
      {previewUrl ? (
        <a
          href={previewUrl}
          target="_blank"
          rel="noopener noreferrer"
          title="Preview resource"
          aria-label={`Preview ${resource.title}`}
          className={actionClassName}
        >
          <Eye className="h-4 w-4" />
        </a>
      ) : null}
      {downloadUrl ? (
        <a
          href={downloadUrl}
          title="Download resource"
          aria-label={`Download ${resource.title}`}
          className={actionClassName}
        >
          <Download className="h-4 w-4" />
        </a>
      ) : null}
    </div>
  );
}

function ResourceEditorDialog({
  resource,
  defaultPresentationTypeId,
  presentations,
  action,
  returnTo,
  lockedCategory,
  onClose
}: {
  resource: ResourceRecord | null;
  defaultPresentationTypeId?: string;
  presentations: Array<{ id: string; title: string }>;
  action: (formData: FormData) => void | Promise<void>;
  returnTo: string;
  lockedCategory: ResourceCategory;
  onClose: () => void;
}) {
  const category = lockedCategory;
  const selectableInitialAudiences = (resource?.audiences ?? ["ambassador"]).filter(
    (audience) =>
      audience !== "public" &&
      audience !== "staff" &&
      (resource?.sharingScope === "public" || audience !== "school")
  );
  const [resourceType, setResourceType] = useState(
    resource?.type ?? (lockedCategory === "presentation_material" ? "presentation" : "pdf")
  );
  const [presentationTypeId, setPresentationTypeId] = useState(
    resource?.presentationTypeId ?? defaultPresentationTypeId ?? ""
  );
  const [audiences, setAudiences] = useState<ResourceAudience[]>(
    selectableInitialAudiences.length > 0 ? selectableInitialAudiences : ["ambassador"]
  );
  const [sharingScope, setSharingScope] = useState<"internal" | "public">(
    resource?.sharingScope ?? "internal"
  );
  const [resourceStatus, setResourceStatus] = useState<ResourceStatus>(
    resource ? statusOf(resource) : "published"
  );
  const selectedPresentation = presentations.find(
    (presentation) => presentation.id === presentationTypeId
  );
  const isTrainingResource = category === "training";
  const requiresPresentation = category === "presentation_material";
  const inputClassName =
    "w-full rounded-[16px] border border-[color:var(--border-soft)] bg-white px-4 py-3 text-sm text-[color:var(--text-dark)] outline-none transition focus:border-[color:rgba(24,168,59,0.34)] focus:ring-4 focus:ring-[rgba(24,168,59,0.1)]";

  // Portalled to <body> so glassy card ancestors (backdrop-filter) can't trap
  // the fixed overlay inside their own bounds.
  return createPortal(
    <BookingDialogShell
      kicker={resource ? "Edit resource" : isTrainingResource ? "Add internal training" : "New resource"}
      title={
        resource
          ? resource.title
          : isTrainingResource && selectedPresentation
            ? `Add to ${selectedPresentation.title}`
            : "Add a resource"
      }
      onClose={onClose}
      maxWidthClassName="max-w-[1120px]"
      overlayClassName="z-[80]"
    >
      <form action={action} className="mt-7 grid gap-5">
        {resource?.id ? <input type="hidden" name="id" value={resource.id} /> : null}
        <input type="hidden" name="returnTo" value={returnTo} />
        <input type="hidden" name="category" value={category} />
        <input type="hidden" name="sharingScope" value={sharingScope} />
        <input type="hidden" name="isCurrent" value={resourceStatus === "archived" ? "" : "on"} />
        <input type="hidden" name="isActive" value={resourceStatus === "draft" ? "" : "on"} />

        <div className="flex flex-wrap items-center justify-between gap-3 rounded-[16px] border border-[color:var(--border-soft)] bg-[#f8fafc] px-4 py-3">
          <p className="text-sm font-medium text-[color:var(--text-soft)]">
            {resource ? "Editing resource" : "New resource"}
          </p>
          <span className={cn(
            "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold",
            statusMeta[resourceStatus].className
          )}>
            <span className={cn("h-1.5 w-1.5 rounded-full", statusMeta[resourceStatus].dotClassName)} />
            {statusMeta[resourceStatus].label}
          </span>
        </div>

        <EditorSection icon={FileText} title="Resource details" subtitle="Name the resource clearly so it is easy to find later.">
          <div className="grid gap-4">
            <label className="grid gap-1.5 text-sm font-semibold text-[color:var(--navy)]">
              Title *
              <input name="title" required defaultValue={resource?.title ?? ""} className={inputClassName} />
            </label>
            <label className="grid gap-1.5 text-sm font-semibold text-[color:var(--navy)]">
              Description
              <textarea
                name="description"
                defaultValue={resource?.description ?? ""}
                className={cn(inputClassName, "min-h-[6.5rem] leading-6")}
              />
            </label>
          </div>
        </EditorSection>

        <div className="grid gap-5 lg:grid-cols-2">
          <EditorSection icon={PackageOpen} title="Library placement" subtitle="Choose where this item belongs and who can access it.">
            <div className="grid gap-4">
              <fieldset className="grid gap-2">
                <legend className="text-sm font-semibold text-[color:var(--navy)]">Audiences *</legend>
                <div className="grid gap-2 sm:grid-cols-2">
                  {audienceOptions.map((option) => {
                    const AudienceIcon = option.icon;
                    const checked = audiences.includes(option.value);
                    const disabled = option.value === "school" && sharingScope !== "public";

                    return (
                      <label
                        key={option.value}
                        className={cn(
                          "flex items-start gap-3 rounded-[15px] border px-3.5 py-3 transition",
                          disabled
                            ? "cursor-not-allowed border-[color:var(--border-soft)] bg-[#f8fafc] opacity-55"
                            : "cursor-pointer",
                          checked && !disabled
                            ? "border-[#9fd4ad] bg-[#f3faf5]"
                            : !disabled && "border-[color:var(--border-soft)] bg-white hover:bg-[#f8fafc]"
                        )}
                      >
                        <input
                          type="checkbox"
                          name="audiences"
                          value={option.value}
                          // A disabled checkbox never posts, so never render it
                          // checked — the submitted audiences must match what
                          // the user sees.
                          checked={checked && !disabled}
                          disabled={disabled}
                          onChange={(event) => {
                            setAudiences((current) =>
                              event.target.checked
                                ? Array.from(new Set([...current, option.value]))
                                : current.filter((audience) => audience !== option.value)
                            );
                          }}
                          className="mt-0.5"
                        />
                        <AudienceIcon className="mt-0.5 h-4 w-4 shrink-0 text-[#117a2e]" />
                        <span>
                          <span className="block text-sm font-semibold text-[color:var(--navy)]">{option.label}</span>
                          <span className="mt-0.5 block text-xs font-normal leading-5 text-[color:var(--text-soft)]">{option.detail}</span>
                        </span>
                      </label>
                    );
                  })}
                </div>
                {audiences.length === 0 ? (
                  <p className="text-xs font-medium text-[#9d2424]">Select at least one audience.</p>
                ) : null}
                {sharingScope !== "public" ? (
                  <p className="text-xs font-medium leading-5 text-[color:var(--text-soft)]">
                    Schools can only be selected when the sharing permission is Public. Switching
                    to Internal removes Schools from the audiences.
                  </p>
                ) : null}
              </fieldset>
              <fieldset className="grid gap-2">
                <legend className="text-sm font-semibold text-[color:var(--navy)]">Sharing permission *</legend>
                <div className="grid gap-2 sm:grid-cols-2">
                  {sharingOptions.map((option) => {
                    const SharingIcon = option.icon;
                    const checked = sharingScope === option.value;

                    return (
                      <label
                        key={option.value}
                        className={cn(
                          "flex cursor-pointer items-start gap-3 rounded-[15px] border px-3.5 py-3 transition",
                          checked
                            ? "border-[#9fd4ad] bg-[#f3faf5]"
                            : "border-[color:var(--border-soft)] bg-white hover:bg-[#f8fafc]"
                        )}
                      >
                        <input
                          type="radio"
                          name="sharingScopeChoice"
                          value={option.value}
                          checked={checked}
                          onChange={() => {
                            setSharingScope(option.value);

                            if (option.value === "internal") {
                              setAudiences((current) => current.filter((audience) => audience !== "school"));
                            }
                          }}
                          className="mt-0.5"
                        />
                        <SharingIcon className="mt-0.5 h-4 w-4 shrink-0 text-[#117a2e]" />
                        <span>
                          <span className="block text-sm font-semibold text-[color:var(--navy)]">{option.label}</span>
                          <span className="mt-0.5 block text-xs font-normal leading-5 text-[color:var(--text-soft)]">{option.detail}</span>
                        </span>
                      </label>
                    );
                  })}
                </div>
              </fieldset>
              <label className="grid gap-1.5 text-sm font-semibold text-[color:var(--navy)]">
                {requiresPresentation ? "Presentation *" : "Presentation pack"}
                <select
                  name="presentationTypeId"
                  required={requiresPresentation}
                  value={presentationTypeId}
                  onChange={(event) => setPresentationTypeId(event.target.value)}
                  className={inputClassName}
                >
                  <option value="">
                    {requiresPresentation ? "Choose a presentation" : "General training"}
                  </option>
                  {presentations.map((presentation) => (
                    <option key={presentation.id} value={presentation.id}>
                      {presentation.title}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1.5 text-sm font-semibold text-[color:var(--navy)]">
                <span className="inline-flex items-center gap-2"><Tags className="h-4 w-4 text-[color:var(--text-soft)]" /> Tags</span>
                <input
                  name="tags"
                  defaultValue={resource?.tags.join(", ") ?? ""}
                  placeholder="wellbeing, parents, year-9"
                  className={inputClassName}
                />
              </label>
            </div>
          </EditorSection>

          <EditorSection icon={FileText} title="Format and version" subtitle="Identify the item type independently from its file or link.">
            <div className="grid gap-4">
              <label className="grid gap-1.5 text-sm font-semibold text-[color:var(--navy)]">
                {category === "presentation_material" ? "Material type" : "Resource type"}
                <select
                  name="resourceType"
                  value={resourceType}
                  onChange={(event) => setResourceType(event.target.value)}
                  className={inputClassName}
                >
                  {category === "presentation_material" ? (
                    <>
                      <option value="presentation">Presentation</option>
                      <option value="poster">Poster</option>
                      <option value="flyer">Flyer</option>
                      <option value="guide">Guide</option>
                    </>
                  ) : (
                    <>
                      <option value="pdf">PDF</option>
                      <option value="slide_deck">Presentation / slide deck</option>
                      <option value="pptx">PPTX</option>
                      <option value="script">Script</option>
                      <option value="document">Document</option>
                      <option value="docx">Word document</option>
                      <option value="worksheet">Worksheet</option>
                      <option value="image">Image</option>
                      <option value="youtube">YouTube</option>
                      <option value="video">Video</option>
                      <option value="link">External link</option>
                      <option value="file">Downloadable file</option>
                    </>
                  )}
                </select>
              </label>
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
                Publishing status
                <select
                  value={resourceStatus}
                  onChange={(event) => setResourceStatus(event.target.value as ResourceStatus)}
                  className={inputClassName}
                >
                  <option value="published">Published — visible to selected audiences</option>
                  <option value="draft">Draft — Staff and Super Admin only</option>
                  <option value="archived">Archived — Staff and Super Admin only</option>
                </select>
              </label>
            </div>
          </EditorSection>
        </div>

        <div className="grid gap-5 lg:grid-cols-2">
          <EditorSection icon={Upload} title="Upload a file" subtitle="Documents and media are stored securely with the resource.">
            <div className="grid min-w-0 gap-2">
              <label className="grid min-w-0 gap-2 text-sm font-semibold text-[color:var(--navy)]">
                File
                <input
                  type="file"
                  name="file"
                  accept=".pdf,.ppt,.pptx,.png,.jpg,.jpeg,.webp,.txt,.doc,.docx,.mp4,.mov,.webm,.xlsx,.zip"
                  className={cn(inputClassName, "min-w-0 max-w-full cursor-pointer overflow-hidden border-dashed bg-[#f8fbf9] py-3 file:mr-3 file:rounded-[10px] file:border-0 file:bg-[#eaf8ee] file:px-3 file:py-2 file:text-xs file:font-semibold file:text-[#117a2e]")}
                />
                <span className="text-xs font-normal leading-5 text-[color:var(--text-muted)]">
                  PDF, Office documents, images, videos, text, or archive files up to 40 MB.
                </span>
              </label>
              {resource?.storagePath ? (
                <div className="flex w-full max-w-full items-center justify-between gap-3 overflow-hidden rounded-[14px] border border-[#cce8d3] bg-[#f3faf5] px-3 py-2.5">
                  <div className="flex min-w-0 flex-1 items-center gap-2.5 overflow-hidden">
                    <FileText className="h-4 w-4 shrink-0 text-[#117a2e]" />
                    <div className="min-w-0 flex-1">
                      <span className="block text-[10px] font-semibold uppercase tracking-[0.12em] text-[#117a2e]">Attached file</span>
                      <span className="block max-w-full truncate text-xs font-semibold text-[color:var(--navy)]" title={attachedFileName(resource.storagePath)}>{attachedFileName(resource.storagePath)}</span>
                    </div>
                  </div>
                  <a
                    href={`/portal/download/${encodeURIComponent(resource.id)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex shrink-0 items-center gap-1.5 rounded-[10px] border border-[#bfe6d2] bg-white px-2.5 py-1.5 text-xs font-semibold text-[#117a2e] transition hover:bg-[#eaf8ee]"
                  >
                    <Eye className="h-3.5 w-3.5" /> View
                  </a>
                </div>
              ) : null}
            </div>
          </EditorSection>

          <EditorSection icon={Link2} title="External links" subtitle="Use these when the resource lives elsewhere online.">
            <div className="grid gap-4">
              <label className="grid gap-1.5 text-sm font-semibold text-[color:var(--navy)]">
                External download URL
                <input
                  name="externalUrl"
                  type="url"
                  defaultValue={resource?.externalUrl ?? ""}
                  placeholder="https://..."
                  className={inputClassName}
                />
              </label>
              <label className="grid gap-1.5 text-sm font-semibold text-[color:var(--navy)]">
                YouTube URL
                <input
                  name="youtubeUrl"
                  type="url"
                  defaultValue={resource?.youtubeUrl ?? ""}
                  placeholder="https://www.youtube.com/watch?v=..."
                  className={inputClassName}
                />
              </label>
            </div>
          </EditorSection>
        </div>

        <div className="mt-1 flex flex-wrap items-center justify-between gap-3 border-t border-[color:var(--border-soft)] pt-4">
          <div>
            {resource ? (
              <Button
                type="submit"
                name="intent"
                value="delete"
                formNoValidate
                variant="danger"
                onClick={(event) => {
                  if (
                    !window.confirm(
                      `Delete “${resource.title}”? This permanently removes the resource and its uploaded file.`
                    )
                  ) {
                    event.preventDefault();
                  }
                }}
                className="rounded-[14px]"
              >
                <Trash2 className="h-4 w-4" />
                Delete resource
              </Button>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center justify-end gap-3">
            <Button type="button" variant="secondary" onClick={onClose} className="rounded-[14px]">
              Cancel
            </Button>
            <Button
              type="submit"
              name="lifecycle"
              value="draft"
              disabled={audiences.length === 0}
              variant="secondary"
              title="Save this resource as a draft visible only to Staff and Super Admin"
              className="rounded-[14px] border-[#ecd59f] bg-[#fffaf0] text-[#9a5a00] hover:bg-[#fff5df]"
            >
              <PencilLine className="h-4 w-4" />
              {resourceStatus === "draft" ? "Save draft" : "Save as draft"}
            </Button>
            {resourceStatus === "archived" ? (
              <Button
                type="submit"
                name="lifecycle"
                value="archived"
                disabled={audiences.length === 0}
                variant="secondary"
                className="rounded-[14px]"
              >
                <Clock3 className="h-4 w-4" />
                Save to archive
              </Button>
            ) : null}
            <Button
              type="submit"
              name="lifecycle"
              value="published"
              disabled={audiences.length === 0}
              className="rounded-[14px] border-[#117a2e] bg-[#117a2e] text-white shadow-[0_12px_28px_rgba(17,122,46,0.22)] hover:border-[#0d6726] hover:bg-[#0d6726]"
            >
              <CircleCheck className="h-4 w-4" />
              {resource
                ? resourceStatus === "published"
                  ? "Publish changes"
                  : "Publish"
                : isTrainingResource
                  ? "Publish to training"
                  : "Publish material"}
            </Button>
          </div>
        </div>
      </form>
    </BookingDialogShell>,
    document.body
  );
}

function EditorSection({
  icon: Icon,
  title,
  subtitle,
  children
}: {
  icon: typeof FileText;
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  return (
    <section className="min-w-0 rounded-[22px] border border-[color:var(--border-soft)] bg-white/90 p-4 md:p-5">
      <div className="mb-4 flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] bg-[#eaf8ee] text-[#117a2e]">
          <Icon className="h-4.5 w-4.5" />
        </span>
        <div>
          <h3 className="font-semibold text-[color:var(--navy)]">{title}</h3>
          <p className="mt-0.5 text-xs leading-5 text-[color:var(--text-soft)]">{subtitle}</p>
        </div>
      </div>
      {children}
    </section>
  );
}

function StatTile({
  icon,
  iconClassName,
  label,
  value,
  hint,
  connected = false
}: {
  icon: ReactNode;
  iconClassName: string;
  label: string;
  value: string;
  hint: string;
  connected?: boolean;
}) {
  return (
    <div className={cn(
      "flex items-center gap-4 bg-white/92 p-5",
      connected
        ? "border-b border-[color:var(--border-soft)] even:border-l xl:border-b-0 xl:border-l xl:first:border-l-0"
        : "rounded-[22px] border border-[color:var(--border-soft)]"
    )}>
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

"use client";

import {
  ArrowRight,
  BookOpenCheck,
  ChevronLeft,
  ClipboardCheck,
  Download,
  Eye,
  FileImage,
  FileText,
  FileType2,
  Globe2,
  Layers3,
  Link2,
  ListChecks,
  ListVideo,
  LockKeyhole,
  Play,
  Presentation,
  ScrollText,
  Search,
  SlidersHorizontal,
  Sparkles
} from "lucide-react";
import { useMemo, useState } from "react";
import Link from "next/link";

import type { PresentationType, TrainingModule } from "@/lib/domain/types";
import { ButtonLink } from "@/components/ui/button";
import { SecondaryTabs, type SecondaryTabItem } from "@/components/ui/secondary-tabs";
import type { ResourceRecord } from "@/lib/services/portal";
import { colourWithAlpha, presentationPalette } from "@/lib/presentation-colors";
import { cn } from "@/lib/utils";

type ResourceBucket = "video" | "presentation" | "script" | "document";
type ResourceLibraryContext = "resources" | "materials" | "training";
type TrainingArea = "packs" | "guidance";
type GuidanceType = "all" | "documents" | "videos" | "presentations";
type GuidanceItem = {
  id: string;
  type: GuidanceType;
  title: string;
  searchText: string;
  resource: ResourceRecord;
};

const GUIDANCE_PAGE_SIZE = 10;

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
    thumbClassName: "bg-[linear-gradient(135deg,#ede9fe,#eaf8ee)] text-[#7c3aed]",
    icon: Play
  },
  presentation: {
    filterLabel: "Presentations",
    badgeLabel: "Presentation",
    badgeClassName: "bg-[#d7f2e4] text-[#047857]",
    actionLabel: "Download deck",
    actionClassName: "border-[#bfe6d2] text-[#047857] hover:bg-[#f0fbf5]",
    thumbClassName: "bg-[linear-gradient(135deg,#eaf8ee,#d8f1df)] text-[#117a2e]",
    icon: Presentation
  },
  script: {
    filterLabel: "Scripts",
    badgeLabel: "Script",
    badgeClassName: "bg-[#eaf8ee] text-[#117a2e]",
    actionLabel: "Read script",
    actionClassName: "border-[#bfe6d2] text-[#117a2e] hover:bg-[#f0fbf5]",
    thumbClassName: "bg-[linear-gradient(135deg,#f0faf3,#dff3e4)] text-[#117a2e]",
    icon: FileText
  },
  document: {
    filterLabel: "Documents",
    badgeLabel: "Document",
    badgeClassName: "bg-[#eaf8ee] text-[#117a2e]",
    actionLabel: "Read document",
    actionClassName: "border-[#bfe6d2] text-[#117a2e] hover:bg-[#f0fbf5]",
    thumbClassName: "bg-[linear-gradient(135deg,#f0faf3,#edf7ef)] text-[#117a2e]",
    icon: ListChecks
  }
};

const bucketGuidance: Record<ResourceBucket, string> = {
  video: "Watch examples and presenter guidance",
  presentation: "Open decks and presentation files",
  script: "Read delivery notes and talking points",
  document: "Browse checklists, guides and reference files"
};

const resourceLibraryContextCopy: Record<
  ResourceLibraryContext,
  {
    eyebrow: string;
    description: string;
    resultsTitle: string;
    resultsDescription: string;
  }
> = {
  resources: {
    eyebrow: "Ambassador library",
    description: "Choose a shelf to narrow the library, or search directly when you know what you need.",
    resultsTitle: "Browse all resources",
    resultsDescription: "Guides, videos, scripts and reference material for your ambassador work."
  },
  materials: {
    eyebrow: "Session preparation",
    description: "Choose a presentation to find its latest deck, script and supporting session files.",
    resultsTitle: "Presentation files",
    resultsDescription: "Decks, scripts and supporting files organised by presentation."
  },
  training: {
    eyebrow: "Supporting material",
    description: "Use these resources alongside your modules when you want an example, script or refresher.",
    resultsTitle: "Training resources",
    resultsDescription: "Optional supporting files for your learning modules."
  }
};

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

function trainingResourceTypeLabel(type: string) {
  const labels: Record<string, string> = {
    pdf: "PDF",
    doc: "Word document",
    docx: "Word document",
    document: "Document",
    image: "Image",
    youtube: "Video link",
    video: "Video",
    slide_deck: "Slide deck",
    ppt: "PowerPoint",
    pptx: "PowerPoint",
    script: "Script",
    worksheet: "Worksheet",
    link: "External link",
    file: "Downloadable file"
  };

  return labels[type.toLowerCase()] ?? "File";
}

function guidanceTypeForResource(type: string): GuidanceType {
  const bucket = bucketOf(type);

  if (bucket === "video") return "videos";
  if (bucket === "presentation") return "presentations";
  return "documents";
}

export function TrainingWorkspace({
  modules,
  presentations,
  resources
}: {
  modules: TrainingModule[];
  presentations: PresentationType[];
  resources: ResourceRecord[];
}) {
  const presentationPacks = useMemo(
    () =>
      presentations
        .filter((presentation) => presentation.active)
        .map((presentation) => {
          const packModules = modules.filter(
            (module) => module.presentationTypeId === presentation.id
          );
          const packResources = resources.filter(
            (resource) =>
              resource.presentationTypeId === presentation.id && resource.isCurrent
          );
          return {
            presentation,
            modules: packModules,
            resources: packResources
          };
        }),
    [modules, presentations, resources]
  );
  const recommendedPack =
    presentationPacks.find((pack) => pack.modules.length > 0 || pack.resources.length > 0) ??
    presentationPacks[0];
  const [selectedPackId, setSelectedPackId] = useState(
    () => recommendedPack?.presentation.id ?? ""
  );
  const selectedPack =
    presentationPacks.find((pack) => pack.presentation.id === selectedPackId) ?? recommendedPack;
  const generalResources = useMemo(
    () => resources.filter((resource) => !resource.presentationTypeId && resource.isCurrent),
    [resources]
  );
  const [activeArea, setActiveArea] = useState<TrainingArea>(() =>
    presentationPacks.length > 0 ? "packs" : "guidance"
  );
  const [guidanceType, setGuidanceType] = useState<GuidanceType>("all");
  const [guidanceQuery, setGuidanceQuery] = useState("");
  const [guidancePage, setGuidancePage] = useState(1);
  const [guidanceSuggestionsOpen, setGuidanceSuggestionsOpen] = useState(false);
  const trainingTabs: Array<SecondaryTabItem<TrainingArea>> = [
    {
      value: "packs",
      label: "Presentation packs",
      icon: Presentation,
      count: presentationPacks.length
    },
    {
      value: "guidance",
      label: "General guidance",
      icon: Sparkles,
      count: generalResources.length
    }
  ];
  const selectedPalette = selectedPack
    ? presentationPalette(selectedPack.presentation)
    : null;
  const guidanceItems = useMemo<GuidanceItem[]>(() => [
    ...generalResources.map((resource) => ({
      id: resource.id,
      type: guidanceTypeForResource(resource.type),
      title: resource.title,
      searchText: [resource.title, resource.description, trainingResourceTypeLabel(resource.type), ...resource.tags]
        .join(" ")
      .toLowerCase(),
      resource
    }))
  ], [generalResources]);
  const guidanceTabs: Array<SecondaryTabItem<GuidanceType>> = [
    { value: "all", label: "All", icon: Layers3, count: guidanceItems.length },
    { value: "documents", label: "Documents", icon: FileText, count: guidanceItems.filter((item) => item.type === "documents").length },
    { value: "videos", label: "Videos", icon: Play, count: guidanceItems.filter((item) => item.type === "videos").length },
    { value: "presentations", label: "Presentations", icon: Presentation, count: guidanceItems.filter((item) => item.type === "presentations").length }
  ];
  const normalizedGuidanceQuery = guidanceQuery.trim().toLowerCase();
  const filteredGuidanceItems = guidanceItems.filter(
    (item) =>
      (guidanceType === "all" || item.type === guidanceType) &&
      (!normalizedGuidanceQuery || item.searchText.includes(normalizedGuidanceQuery))
  );
  const guidancePageCount = Math.max(
    1,
    Math.ceil(filteredGuidanceItems.length / GUIDANCE_PAGE_SIZE)
  );
  const currentGuidancePage = Math.min(guidancePage, guidancePageCount);
  const visibleGuidanceItems = filteredGuidanceItems.slice(
    (currentGuidancePage - 1) * GUIDANCE_PAGE_SIZE,
    currentGuidancePage * GUIDANCE_PAGE_SIZE
  );
  const guidanceSuggestions = normalizedGuidanceQuery
    ? guidanceItems
        .filter(
          (item) =>
            (guidanceType === "all" || item.type === guidanceType) &&
            item.searchText.includes(normalizedGuidanceQuery)
        )
        .slice(0, 5)
    : [];

  return (
    <section className="surface-panel overflow-hidden rounded-[28px]">
      <div className="border-b border-[color:var(--border-soft)] bg-white px-5 pt-2 md:px-7 md:pt-3">
        <SecondaryTabs
          items={trainingTabs}
          value={activeArea}
          onChange={setActiveArea}
          ariaLabel="Training areas"
        />
      </div>

      {activeArea === "packs" ? (
        <div className="p-5 md:p-7">
          <div>
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.14em] text-[color:var(--green)]">
                Presentation training packs
              </p>
              <h3
                className="mt-1 text-xl font-normal tracking-[-0.02em] text-[color:var(--navy)] md:text-2xl"
                style={{ fontFamily: "var(--font-rozha-one), Georgia, serif" }}
              >
                Choose the talk you’re preparing for
              </h3>
            </div>
          </div>

          {presentationPacks.length > 0 ? (
            <div className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {presentationPacks.map((pack, index) => {
                const isSelected = pack.presentation.id === selectedPack?.presentation.id;
                const palette = presentationPalette(pack.presentation);
                const resourceCount =
                  pack.resources.length +
                  pack.modules.reduce((total, module) => total + module.lessons.length, 0);

                return (
                  <button
                    key={pack.presentation.id}
                    type="button"
                    aria-pressed={isSelected}
                    aria-controls="selected-training-pack"
                    onClick={() => setSelectedPackId(pack.presentation.id)}
                    className={cn(
                      "group relative rounded-[20px] border p-4 text-left transition",
                      isSelected ? "ring-2" : "bg-white hover:-translate-y-0.5"
                    )}
                    style={{
                      borderColor: isSelected ? palette.accent : palette.border,
                      backgroundColor: isSelected ? palette.soft : undefined,
                      boxShadow: isSelected ? `0 14px 30px ${palette.shadow}` : undefined,
                      ...(isSelected ? { "--tw-ring-color": colourWithAlpha(palette.accent, 0.15) } : {})
                    }}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <span
                        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[13px] text-sm font-semibold"
                        style={{
                          backgroundColor: isSelected ? palette.accent : palette.soft,
                          color: isSelected ? "#ffffff" : palette.accent
                        }}
                      >
                        {String(index + 1).padStart(2, "0")}
                      </span>
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-[#f1f5f2] px-2.5 py-1 text-xs font-semibold text-[#64748b]">
                        <Layers3 className="h-3.5 w-3.5" aria-hidden="true" />
                        {resourceCount} {resourceCount === 1 ? "resource" : "resources"}
                      </span>
                    </div>
                    <h3 className="mt-4 text-lg font-semibold leading-6 text-[color:var(--navy)]">
                      {pack.presentation.title}
                    </h3>
                    <p className="mt-1 text-sm text-[color:var(--text-soft)]">
                      {pack.modules.length} {pack.modules.length === 1 ? "guide" : "guides"} · {pack.resources.length} {pack.resources.length === 1 ? "file" : "files"}
                    </p>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="mt-6 rounded-[20px] border border-dashed border-[color:var(--border-soft)] bg-[#f8faf8] px-5 py-10 text-center">
              <Layers3 className="mx-auto h-6 w-6 text-[#117a2e]" />
              <p className="mt-3 font-semibold text-[color:var(--navy)]">Presentation packs are being prepared</p>
              <p className="mt-1 text-sm text-[color:var(--text-soft)]">Presentation-specific training will appear here when it is published.</p>
            </div>
          )}

          {selectedPack ? (
            <div
              id="selected-training-pack"
              className="mt-9 overflow-hidden rounded-[24px] border bg-white shadow-[0_18px_42px_rgba(11,24,77,0.07)]"
              style={{ borderColor: selectedPalette?.border }}
            >
              <div className="h-1" style={{ backgroundColor: selectedPalette?.accent }} />
              <div className="p-5 md:p-7">
                <div className="flex flex-wrap items-start justify-between gap-5">
                  <div className="flex min-w-0 flex-1 items-start gap-4">
                    <span
                      className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[15px]"
                      style={{ backgroundColor: selectedPalette?.soft, color: selectedPalette?.accent }}
                    >
                      <Presentation className="h-6 w-6" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold uppercase tracking-[0.14em] text-[#117a2e]">
                        Selected training pack
                      </p>
                      <h3 className="mt-1 text-xl font-semibold tracking-[-0.03em] text-[color:var(--navy)] md:text-2xl">
                        {selectedPack.presentation.title}
                      </h3>
                      <p className="mt-3 w-full text-base leading-7 text-[color:var(--text-soft)] md:text-lg md:leading-8">
                        {selectedPack.presentation.shortSummary}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid gap-5 border-t border-[color:var(--border-soft)] bg-[#fbfdfb] p-5 md:p-7 xl:grid-cols-[minmax(0,1.35fr)_minmax(300px,0.65fr)]">
                <div className="min-w-0">
                  <div className="flex items-center gap-3">
                    <span className="flex h-9 w-9 items-center justify-center rounded-[12px] bg-[#eaf8ee] text-[#117a2e]">
                      <BookOpenCheck className="h-4.5 w-4.5" />
                    </span>
                    <div>
                      <h4 className="text-xl font-semibold text-[color:var(--navy)]">Training resources</h4>
                      <p className="text-sm text-[color:var(--text-soft)]">Open the guides and media for this presentation.</p>
                    </div>
                  </div>
                  <div className="mt-4 grid gap-3">
                    {selectedPack.modules.map((module) => (
                      <TrainingModuleRow
                        key={module.id}
                        module={module}
                      />
                    ))}
                    {selectedPack.modules.length === 0 ? (
                      <div className="rounded-[20px] border border-dashed border-[color:var(--border-soft)] bg-[#f8faf8] px-5 py-8 text-center">
                        <Layers3 className="mx-auto h-6 w-6 text-[#117a2e]" />
                        <p className="mt-3 font-semibold text-[color:var(--navy)]">Training pack coming soon</p>
                        <p className="mt-1 text-sm text-[color:var(--text-soft)]">Staff can attach modules to this presentation when they’re ready.</p>
                      </div>
                    ) : null}
                  </div>
                </div>

                <aside className="rounded-[22px] border border-[color:var(--border-soft)] bg-[#f7fbf8] p-5">
                  <div className="flex items-center gap-3">
                    <span className="flex h-9 w-9 items-center justify-center rounded-[12px] bg-white text-[#117a2e] shadow-sm">
                      <Layers3 className="h-4.5 w-4.5" />
                    </span>
                    <div>
                      <h4 className="text-lg font-semibold text-[color:var(--navy)]">Pack files</h4>
                      <p className="text-sm text-[color:var(--text-soft)]">Keep these close while you train.</p>
                    </div>
                  </div>
                  <div className="mt-4 grid gap-2.5">
                    {selectedPack.resources.map((resource) => (
                      <TrainingResourceLink key={resource.id} resource={resource} />
                    ))}
                    {selectedPack.resources.length === 0 ? (
                      <p className="rounded-[16px] bg-white px-4 py-5 text-sm leading-6 text-[color:var(--text-soft)]">
                        No supporting files have been added to this pack yet.
                      </p>
                    ) : null}
                  </div>
                  <Link
                    href="/ambassador/materials"
                    className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-[#117a2e] hover:underline"
                  >
                    Open presentation materials <ArrowRight className="h-4 w-4" />
                  </Link>
                </aside>
              </div>
            </div>
          ) : null}
        </div>
      ) : (
        <div className="p-5 md:p-7">
          <div className="rounded-[24px] bg-[linear-gradient(120deg,#f2fbf5_0%,#f7fbff_100%)] p-5 md:p-7">
            <div className="flex min-w-0 items-start gap-4">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[15px] bg-white text-[#117a2e] shadow-sm">
                <Sparkles className="h-5 w-5" />
              </span>
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.14em] text-[color:var(--green)]">
                  General guidance
                </p>
                <h3 className="mt-1 text-xl font-semibold tracking-[-0.03em] text-[color:var(--navy)] md:text-2xl">
                  Ambassador essentials
                </h3>
              </div>
            </div>
          </div>

          {guidanceItems.length > 0 ? (
            <div className="mt-5 overflow-hidden rounded-[22px] border border-[color:var(--border-soft)] bg-white">
              <div className="px-4 pt-3 md:px-5">
                <SecondaryTabs
                  items={guidanceTabs}
                  value={guidanceType}
                  onChange={(value) => {
                    setGuidanceType(value);
                    setGuidancePage(1);
                  }}
                  ariaLabel="General training resource types"
                />
                <div
                  className="relative my-4"
                  onBlur={(event) => {
                    if (!event.currentTarget.contains(event.relatedTarget)) {
                      setGuidanceSuggestionsOpen(false);
                    }
                  }}
                >
                  <label htmlFor="guidance-search" className="sr-only">Search training and guidance</label>
                  <Search className="pointer-events-none absolute left-3.5 top-[22px] h-4 w-4 -translate-y-1/2 text-[color:var(--text-soft)]" aria-hidden="true" />
                  <input
                    id="guidance-search"
                    type="search"
                    value={guidanceQuery}
                    onFocus={() => setGuidanceSuggestionsOpen(true)}
                    onChange={(event) => {
                      setGuidanceQuery(event.target.value);
                      setGuidancePage(1);
                      setGuidanceSuggestionsOpen(true);
                    }}
                    placeholder="Search training and guidance"
                    role="combobox"
                    aria-autocomplete="list"
                    aria-expanded={guidanceSuggestionsOpen && guidanceSuggestions.length > 0}
                    aria-controls="guidance-search-suggestions"
                    className="min-h-11 w-full rounded-[14px] border border-[color:var(--border-soft)] bg-[#f8fafc] pl-10 pr-4 text-sm text-[color:var(--navy)] outline-none transition focus:border-[#9fd4ad] focus:bg-white"
                  />
                  {guidanceSuggestionsOpen && guidanceSuggestions.length > 0 ? (
                    <div id="guidance-search-suggestions" role="listbox" className="absolute inset-x-0 top-[calc(100%+6px)] z-20 overflow-hidden rounded-[14px] border border-[color:var(--border-soft)] bg-white p-1.5 shadow-[0_18px_40px_rgba(11,24,77,0.14)]">
                      {guidanceSuggestions.map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          role="option"
                          aria-selected={false}
                          onClick={() => {
                            setGuidanceQuery(item.title);
                            setGuidancePage(1);
                            setGuidanceSuggestionsOpen(false);
                          }}
                          className="flex w-full items-center gap-3 rounded-[10px] px-3 py-2.5 text-left text-sm text-[color:var(--navy)] transition hover:bg-[#f4f8fe] focus:bg-[#f4f8fe] focus:outline-none"
                        >
                          {item.type === "videos" ? <Play className="h-4 w-4 text-[#7c3aed]" /> : item.type === "presentations" ? <Presentation className="h-4 w-4 text-[#1e4fae]" /> : <FileText className="h-4 w-4 text-[#117a2e]" />}
                          <span className="truncate font-medium">{item.title}</span>
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>
              {visibleGuidanceItems.length > 0 ? (
                <div className="grid gap-2 border-t border-[color:var(--border-soft)] bg-[#f8fafc] p-3 md:p-4">
                  {visibleGuidanceItems.map((item) => (
                    <TrainingResourceLink key={item.id} resource={item.resource} expanded />
                  ))}
                </div>
              ) : (
                <div className="border-t border-[color:var(--border-soft)] px-5 py-9 text-center text-sm text-[color:var(--text-soft)]">
                  No training items match this search.
                </div>
              )}
              {guidancePageCount > 1 ? (
                <div className="flex items-center justify-between gap-3 border-t border-[color:var(--border-soft)] bg-white px-4 py-3">
                  <p className="text-xs text-[color:var(--text-soft)]">Page {currentGuidancePage} of {guidancePageCount}</p>
                  <div className="flex items-center gap-2">
                    <button type="button" onClick={() => setGuidancePage((value) => Math.max(1, value - 1))} disabled={currentGuidancePage === 1} aria-label="Previous training page" className="flex h-8 w-8 items-center justify-center rounded-[10px] border border-[color:var(--border-soft)] bg-white text-[color:var(--navy)] transition hover:bg-[#f6f9fd] disabled:cursor-not-allowed disabled:opacity-40">
                      <ChevronLeft className="h-4 w-4" />
                    </button>
                    <button type="button" onClick={() => setGuidancePage((value) => Math.min(guidancePageCount, value + 1))} disabled={currentGuidancePage === guidancePageCount} aria-label="Next training page" className="flex h-8 w-8 items-center justify-center rounded-[10px] border border-[color:var(--border-soft)] bg-white text-[color:var(--navy)] transition hover:bg-[#f6f9fd] disabled:cursor-not-allowed disabled:opacity-40">
                      <ArrowRight className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          ) : (
            <div className="mt-5 rounded-[20px] border border-dashed border-[color:var(--border-soft)] bg-[#f8faf8] px-5 py-10 text-center">
              <Layers3 className="mx-auto h-6 w-6 text-[#117a2e]" />
              <p className="mt-3 font-semibold text-[color:var(--navy)]">General training is being prepared</p>
              <p className="mt-1 text-sm text-[color:var(--text-soft)]">Internal guidance will appear here when it is published.</p>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function TrainingModuleRow({ module, compact = false }: { module: TrainingModule; compact?: boolean }) {
  return (
    <article className={cn(
      "border border-[color:var(--border-soft)] bg-white",
      compact ? "rounded-[16px] p-4" : "rounded-[20px] p-4 md:p-5"
    )}>
      <div className="flex items-start gap-3.5">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] bg-[#eaf8ee] text-[#117a2e]">
          <BookOpenCheck className="h-4.5 w-4.5" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <h5 className="text-lg font-semibold text-[color:var(--navy)]">{module.title}</h5>
          <p className="mt-1 text-sm leading-6 text-[color:var(--text-soft)]">{module.description}</p>
          <div className="mt-3 grid gap-2">
            {module.lessons.length > 0 ? (
              module.lessons.map((lesson) => <TrainingLessonRow key={lesson.id} lesson={lesson} />)
            ) : (
              <p className="rounded-[12px] bg-[#f8fafc] px-3 py-2.5 text-xs text-[color:var(--text-soft)]">
                No resources have been attached yet.
              </p>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}

function TrainingLessonRow({ lesson }: { lesson: TrainingModule["lessons"][number] }) {
  const visuals = {
    video: { icon: ListVideo, label: "Video", className: "bg-[#f3e8ff] text-[#7e22ce]" },
    quiz: { icon: ListChecks, label: "Activity", className: "bg-[#e8f1fd] text-[#1e4fae]" },
    checklist: { icon: ClipboardCheck, label: "Checklist", className: "bg-[#eaf8ee] text-[#117a2e]" }
  } as const;
  const visual = visuals[lesson.type] ?? visuals.checklist;
  const Icon = visual.icon;
  const contentUrl = lesson.content?.trim();
  const href = lesson.youtubeUrl ?? (contentUrl && /^https?:\/\//i.test(contentUrl) ? contentUrl : undefined);

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-[13px] bg-[#f8fafc] px-3 py-2.5">
      <span className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-[9px]", visual.className)}>
        <Icon className="h-4 w-4" aria-hidden="true" />
      </span>
      <span className="min-w-[160px] flex-1">
        <span className="block text-[10px] font-semibold uppercase tracking-[0.12em] text-[color:var(--text-soft)]">{visual.label}</span>
        <span className="block truncate text-sm font-semibold text-[color:var(--navy)]">{lesson.title}</span>
      </span>
      {href ? (
        <ButtonLink href={href} target="_blank" rel="noopener noreferrer" variant="secondary" className="min-h-9 rounded-[11px] px-3 py-1.5">
          <Eye aria-hidden="true" />
          View
        </ButtonLink>
      ) : (
        <span className="text-xs font-medium text-[color:var(--text-soft)]">Available soon</span>
      )}
    </div>
  );
}

function TrainingResourceLink({
  resource,
  expanded = false
}: {
  resource: ResourceRecord;
  expanded?: boolean;
}) {
  const normalizedType = resource.type.toLowerCase();
  const visual = trainingResourceVisual(normalizedType);
  const Icon = visual.icon;
  const previewUrl = resource.storagePath
    ? `/portal/download/${encodeURIComponent(resource.id)}`
    : resource.youtubeUrl ?? resource.externalUrl ?? resource.downloadUrl;
  const isViewOnly = ["youtube", "video", "link"].includes(normalizedType);
  const downloadUrl = resource.storagePath
    ? `/portal/download/${encodeURIComponent(resource.id)}?download=1`
    : isViewOnly
      ? undefined
      : resource.downloadUrl;

  return (
    <article className="flex flex-wrap items-center gap-3 rounded-[16px] border border-[color:var(--border-soft)] bg-white p-3.5 transition hover:border-[#9fd4ad] hover:shadow-sm">
      <span className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px]", visual.className)}>
        <Icon className="h-4.5 w-4.5" aria-hidden="true" />
      </span>
      <span className="min-w-[180px] flex-1">
        <span className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold text-[#117a2e]">{trainingResourceTypeLabel(resource.type)}</span>
          <ResourceVisibilityBadge resource={resource} />
        </span>
        <span className="mt-0.5 block font-semibold leading-5 text-[color:var(--navy)]">{resource.title}</span>
        {expanded && resource.description ? (
          <span className="mt-1 block text-sm leading-6 text-[color:var(--text-soft)]">{resource.description}</span>
        ) : null}
      </span>
      {previewUrl || downloadUrl ? (
        <span className="flex shrink-0 flex-wrap items-center gap-2">
          {previewUrl ? (
            <ButtonLink href={previewUrl} target="_blank" rel="noopener noreferrer" variant="secondary" className="min-h-9 rounded-[11px] px-3 py-1.5">
              <Eye aria-hidden="true" />
              View
            </ButtonLink>
          ) : null}
          {downloadUrl ? (
            <ButtonLink href={downloadUrl} className="min-h-9 rounded-[11px] px-3 py-1.5">
              <Download aria-hidden="true" />
              Download
            </ButtonLink>
          ) : null}
        </span>
      ) : (
        <span className="text-xs font-medium text-[color:var(--text-soft)]">Available soon</span>
      )}
    </article>
  );
}

function ResourceVisibilityBadge({ resource }: { resource: ResourceRecord }) {
  const isPublic = resource.sharingScope === "public";

  return (
    <span className={cn(
      "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em]",
      isPublic ? "bg-[#e8f1fd] text-[#1e4fae]" : "bg-[#f1edfd] text-[#6941c6]"
    )}>
      {isPublic ? <Globe2 className="h-3 w-3" /> : <LockKeyhole className="h-3 w-3" />}
      {isPublic ? "Public" : "Internal"}
    </span>
  );
}

function trainingResourceVisual(type: string) {
  if (["youtube", "video"].includes(type)) {
    return { icon: ListVideo, className: "bg-[#f3e8ff] text-[#7e22ce]" };
  }

  if (["slide_deck", "ppt", "pptx", "presentation"].includes(type)) {
    return { icon: Presentation, className: "bg-[#e8f1fd] text-[#1e4fae]" };
  }

  if (["image", "poster", "flyer"].includes(type)) {
    return { icon: FileImage, className: "bg-[#fff3df] text-[#a45c00]" };
  }

  if (type === "script") {
    return { icon: ScrollText, className: "bg-[#eaf8ee] text-[#117a2e]" };
  }

  if (type === "link") {
    return { icon: Link2, className: "bg-[#f1edfd] text-[#6941c6]" };
  }

  if (["pdf", "doc", "docx", "document"].includes(type)) {
    return { icon: FileType2, className: "bg-[#edf2f7] text-[#475569]" };
  }

  return { icon: FileText, className: "bg-[#edf2f7] text-[#475569]" };
}

// Standalone filterable library — used by the ambassador Materials, Resources
// and Training tabs, each fed a different resource category.
export function ResourceLibraryWorkspace({
  resources,
  heading = "Find the right resource",
  context = "resources"
}: {
  resources: ResourceRecord[];
  heading?: string;
  context?: ResourceLibraryContext;
}) {
  const [query, setQuery] = useState("");
  const [activeBucket, setActiveBucket] = useState<"overview" | "all" | ResourceBucket>(
    context === "resources" ? "overview" : "all"
  );
  const [versionFilter, setVersionFilter] = useState<"current" | "all">("current");
  const [presentationFilter, setPresentationFilter] = useState("all");
  const [sortBy, setSortBy] = useState<"newest" | "title">("newest");

  const contextCopy = resourceLibraryContextCopy[context];

  const availableBuckets = useMemo(() => {
    const present = new Set(resources.map((resource) => bucketOf(resource.type)));
    return (Object.keys(bucketMeta) as ResourceBucket[]).filter((bucket) => present.has(bucket));
  }, [resources]);

  const bucketCounts = useMemo(
    () =>
      resources.reduce<Record<ResourceBucket, number>>(
        (counts, resource) => {
          counts[bucketOf(resource.type)] += 1;
          return counts;
        },
        { video: 0, presentation: 0, script: 0, document: 0 }
      ),
    [resources]
  );

  const availablePresentations = useMemo(
    () =>
      Array.from(
        new Map(
          resources.flatMap((resource) =>
            resource.presentationTypeId && resource.presentationTitle
              ? [[resource.presentationTypeId, resource.presentationTitle] as const]
              : []
          )
        ),
        ([id, title]) => ({ id, title })
      ).sort((a, b) => a.title.localeCompare(b.title)),
    [resources]
  );

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
      const matchesBucket =
        activeBucket === "all" ||
        activeBucket === "overview" ||
        bucketOf(resource.type) === activeBucket;
      const matchesVersion = versionFilter === "all" || resource.isCurrent;
      const matchesPresentation =
        presentationFilter === "all" || resource.presentationTypeId === presentationFilter;

      return matchesQuery && matchesBucket && matchesVersion && matchesPresentation;
    });

    if (sortBy === "title") {
      return [...filtered].sort((a, b) => a.title.localeCompare(b.title));
    }

    return [...filtered].sort(
      (a, b) => new Date(b.updatedAt ?? 0).getTime() - new Date(a.updatedAt ?? 0).getTime()
    );
  }, [
    resources,
    normalizedQuery,
    activeBucket,
    versionFilter,
    presentationFilter,
    sortBy
  ]);

  const hasActiveFilters =
    query.trim().length > 0 ||
    activeBucket !== (context === "resources" ? "overview" : "all") ||
    presentationFilter !== "all" ||
    versionFilter !== "current" ||
    sortBy !== "newest";

  const clearFilters = () => {
    setQuery("");
    setActiveBucket(context === "resources" ? "overview" : "all");
    setPresentationFilter("all");
    setVersionFilter("current");
    setSortBy("newest");
  };

  const showOverview =
    context === "resources" &&
    activeBucket === "overview" &&
    query.trim().length === 0 &&
    presentationFilter === "all";
  const activeBucketLabel =
    activeBucket === "overview" || activeBucket === "all"
      ? contextCopy.resultsTitle
      : bucketMeta[activeBucket].filterLabel;
  const showSearch = context === "resources" || resources.length > 4;
  const showFilterControls =
    resources.length > 1 || resources.some((resource) => !resource.isCurrent);

  return (
    <section className="surface-panel rounded-[28px] p-5 md:p-7">
      {context !== "resources" ? (
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.14em] text-[color:var(--green)]">
              {contextCopy.eyebrow}
            </p>
            <h2 className="mt-1.5 text-3xl font-semibold tracking-[-0.035em] text-[color:var(--navy)]">
              {heading}
            </h2>
            {context !== "materials" ? (
              <p className="mt-2 max-w-3xl text-base leading-7 text-[color:var(--text-soft)]">
                {contextCopy.description}
              </p>
            ) : null}
          </div>
          {context !== "materials" ? (
            <p className="rounded-full bg-[color:var(--green-soft)] px-3.5 py-2 text-sm font-semibold text-[#117a2e]">
              {visibleResources.length} result{visibleResources.length === 1 ? "" : "s"}
            </p>
          ) : null}
        </div>
      ) : null}

      {showSearch ? (
        <label className="mt-6 flex min-h-[56px] items-center gap-3 rounded-[16px] border border-[color:var(--border-soft)] bg-white px-4 shadow-[0_8px_24px_rgba(11,24,77,0.04)] focus-within:border-[color:var(--green)] focus-within:ring-4 focus-within:ring-[color:var(--green-soft)]">
          <Search className="h-5 w-5 shrink-0 text-[#117a2e]" />
          <span className="sr-only">Search resources</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search by title, presentation or keyword…"
            className="min-w-0 flex-1 bg-transparent text-base text-[color:var(--navy)] outline-none placeholder:text-[color:var(--text-soft)]"
          />
          {query ? (
            <button
              type="button"
              onClick={() => setQuery("")}
              className="text-base font-semibold text-[#117a2e] hover:underline"
            >
              Clear
            </button>
          ) : null}
        </label>
      ) : null}

      {showOverview ? (
        <div className="mt-7">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <h3 className="text-xl font-semibold text-[color:var(--navy)]">Browse the shelves</h3>
            <button
              type="button"
              onClick={() => setActiveBucket("all")}
              className="text-base font-semibold text-[#117a2e] hover:underline"
            >
              Show all {resources.length} resources
            </button>
          </div>

          <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {availableBuckets.map((bucket) => (
              <ResourceShelf
                key={bucket}
                bucket={bucket}
                count={bucketCounts[bucket]}
                onClick={() => setActiveBucket(bucket)}
              />
            ))}
          </div>

          <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-3 rounded-[18px] bg-[#f3faf5] px-5 py-4 text-base text-[color:var(--navy)]">
            <span className="font-semibold">Not sure which shelf?</span>
            <Link href="/ambassador/materials" className="font-semibold text-[#117a2e] hover:underline">
              Get files for a presentation
            </Link>
            <Link href="/ambassador/training" className="font-semibold text-[#117a2e] hover:underline">
              Continue training
            </Link>
          </div>
        </div>
      ) : (
        <div className="mt-6">
          {context !== "materials" || showFilterControls ? (
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[color:var(--border-soft)] pb-4">
              {context !== "materials" ? (
                <div className="flex items-center gap-3">
                  {context === "resources" ? (
                    <button
                      type="button"
                      onClick={() => setActiveBucket("overview")}
                      className="inline-flex min-h-[42px] items-center gap-1.5 rounded-[12px] border border-[color:var(--border-soft)] bg-white px-3.5 text-base font-semibold text-[color:var(--navy)] hover:border-[#9fd4ad]"
                    >
                      <ChevronLeft className="h-4 w-4" />
                      Shelves
                    </button>
                  ) : null}
                  <div>
                    <h3 className="text-xl font-semibold text-[color:var(--navy)]">
                      {activeBucketLabel}
                    </h3>
                    <p className="text-base text-[color:var(--text-soft)]">
                      {contextCopy.resultsDescription}
                    </p>
                  </div>
                </div>
              ) : (
                <span />
              )}

              {showFilterControls ? (
                <details className="group relative">
                  <summary className="flex min-h-[42px] list-none items-center gap-2 rounded-[12px] border border-[color:var(--border-soft)] bg-white px-3.5 text-base font-semibold text-[color:var(--navy)] hover:border-[#9fd4ad]">
                    <SlidersHorizontal className="h-4 w-4 text-[#117a2e]" />
                    Filter and sort
                  </summary>
                  <div className="absolute right-0 z-20 mt-2 grid w-[min(360px,calc(100vw-3rem))] gap-4 rounded-[18px] border border-[color:var(--border-soft)] bg-white p-4 shadow-[0_20px_50px_rgba(11,24,77,0.14)]">
                    <label className="grid gap-1.5 text-base font-semibold text-[color:var(--text-soft)]">
                      Resource type
                      <select
                        value={activeBucket === "overview" ? "all" : activeBucket}
                        onChange={(event) =>
                          setActiveBucket(event.target.value as "all" | ResourceBucket)
                        }
                        className="min-h-[44px] rounded-[12px] border border-[color:var(--border-soft)] bg-white px-3 text-base font-semibold text-[color:var(--navy)] outline-none"
                      >
                        <option value="all">All resource types</option>
                        {availableBuckets.map((bucket) => (
                          <option key={bucket} value={bucket}>
                            {bucketMeta[bucket].filterLabel} ({bucketCounts[bucket]})
                          </option>
                        ))}
                      </select>
                    </label>

                    {availablePresentations.length > 0 ? (
                      <label className="grid gap-1.5 text-base font-semibold text-[color:var(--text-soft)]">
                        Presentation
                        <select
                          value={presentationFilter}
                          onChange={(event) => setPresentationFilter(event.target.value)}
                          className="min-h-[44px] rounded-[12px] border border-[color:var(--border-soft)] bg-white px-3 text-base font-semibold text-[color:var(--navy)] outline-none"
                        >
                          <option value="all">All presentations</option>
                          {availablePresentations.map((presentation) => (
                            <option key={presentation.id} value={presentation.id}>
                              {presentation.title}
                            </option>
                          ))}
                        </select>
                      </label>
                    ) : null}

                    <label className="grid gap-1.5 text-base font-semibold text-[color:var(--text-soft)]">
                      Sort order
                      <select
                        value={sortBy}
                        onChange={(event) => setSortBy(event.target.value as "newest" | "title")}
                        className="min-h-[44px] rounded-[12px] border border-[color:var(--border-soft)] bg-white px-3 text-base font-semibold text-[color:var(--navy)] outline-none"
                      >
                        <option value="newest">Newest first</option>
                        <option value="title">Title A–Z</option>
                      </select>
                    </label>

                    <label className="inline-flex min-h-[44px] items-center gap-2.5 text-base font-medium text-[color:var(--navy)]">
                      <input
                        type="checkbox"
                        checked={versionFilter === "all"}
                        onChange={(event) =>
                          setVersionFilter(event.target.checked ? "all" : "current")
                        }
                      />
                      Include older versions
                    </label>

                    {hasActiveFilters ? (
                      <button
                        type="button"
                        onClick={clearFilters}
                        className="text-left text-base font-semibold text-[#117a2e] hover:underline"
                      >
                        Reset filters
                      </button>
                    ) : null}
                  </div>
                </details>
              ) : null}
            </div>
          ) : null}

          <div className="mt-4 grid gap-3">
            {visibleResources.map((resource) => (
              <ResourceLibraryCard key={resource.id} resource={resource} />
            ))}
          </div>

          {visibleResources.length === 0 ? (
            <div className="mt-5 rounded-[20px] border border-dashed border-[color:var(--border-soft)] bg-[#f8faf8] px-5 py-10 text-center">
              <Search className="mx-auto h-6 w-6 text-[color:var(--text-soft)]" />
              <p className="mt-3 text-lg font-semibold text-[color:var(--navy)]">
                No matching resources
              </p>
              <p className="mt-1 text-base text-[color:var(--text-soft)]">
                Try a broader search or reset the filters.
              </p>
              <button
                type="button"
                onClick={clearFilters}
                className="mt-4 text-base font-semibold text-[#117a2e] hover:underline"
              >
                Reset filters
              </button>
            </div>
          ) : null}
        </div>
      )}
    </section>
  );
}

function ResourceShelf({
  bucket,
  count,
  onClick
}: {
  bucket: ResourceBucket;
  count: number;
  onClick: () => void;
}) {
  const meta = bucketMeta[bucket];
  const Icon = meta.icon;

  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex min-h-[176px] flex-col rounded-[22px] border border-[color:var(--border-soft)] bg-white p-5 text-left transition hover:-translate-y-0.5 hover:border-[#9fd4ad] hover:shadow-[0_14px_34px_rgba(11,24,77,0.08)]"
    >
      <span className="flex h-12 w-12 items-center justify-center rounded-[15px] bg-[color:var(--green-soft)] text-[#117a2e]">
        <Icon className="h-5 w-5" />
      </span>
      <span className="mt-4 flex w-full items-center justify-between gap-3">
        <span className="text-lg font-semibold text-[color:var(--navy)]">{meta.filterLabel}</span>
        <span className="rounded-full bg-[#f1f5f2] px-2.5 py-1 text-sm font-semibold text-[color:var(--text-soft)]">
          {count}
        </span>
      </span>
      <span className="mt-1 text-base leading-6 text-[color:var(--text-soft)]">
        {bucketGuidance[bucket]}
      </span>
      <span className="mt-auto inline-flex items-center gap-1.5 pt-3 text-base font-semibold text-[#117a2e]">
        Open shelf <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
      </span>
    </button>
  );
}

function ResourceLibraryCard({ resource }: { resource: ResourceRecord }) {
  const bucket = bucketMeta[bucketOf(resource.type)];
  const ThumbIcon = bucket.icon;
  const href = resource.storagePath
    ? `/portal/download/${encodeURIComponent(resource.id)}`
    : resource.youtubeUrl ?? resource.externalUrl ?? resource.downloadUrl;

  return (
    <article className="flex flex-col gap-4 rounded-[20px] border border-[color:var(--border-soft)] bg-white p-4 transition hover:border-[#9fd4ad] hover:shadow-[0_10px_26px_rgba(11,24,77,0.06)] sm:flex-row sm:items-center sm:p-5">
      <span
        className={cn(
          "flex h-14 w-14 shrink-0 items-center justify-center rounded-[16px]",
          bucket.thumbClassName
        )}
      >
        {bucketOf(resource.type) === "video" ? (
          <Play className="ml-0.5 h-5 w-5" />
        ) : (
          <ThumbIcon className="h-5 w-5" />
        )}
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className={cn("text-sm font-semibold", bucket.badgeClassName.split(" ").at(-1))}>
            {bucket.badgeLabel}
          </span>
          <ResourceVisibilityBadge resource={resource} />
          {!resource.isCurrent ? (
            <span className="text-sm font-semibold text-[#9a5a00]">Previous version</span>
          ) : null}
          {resource.presentationTitle ? (
            <span className="inline-flex items-center gap-1.5 text-sm font-medium text-[color:var(--text-soft)]">
              <Presentation className="h-4 w-4" />
              {resource.presentationTitle}
            </span>
          ) : null}
          {resource.versionLabel ? (
            <span className="text-sm font-medium text-[color:var(--text-soft)]">
              {resource.versionLabel}
            </span>
          ) : null}
        </div>
        <h4 className="mt-1 text-lg font-semibold leading-7 text-[color:var(--navy)]">
          {resource.title}
        </h4>
        <p className="mt-1 line-clamp-2 text-base leading-7 text-[color:var(--text-soft)]">
          {resource.description || "No description added yet."}
        </p>
      </div>

      <div className="shrink-0 sm:pl-4">
        {href ? (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(
              "inline-flex min-h-[44px] items-center justify-center gap-2 rounded-[12px] border bg-white px-4 py-2 text-base font-semibold transition",
              bucket.actionClassName
            )}
          >
            {bucket.actionLabel}
            <ArrowRight className="h-4 w-4" />
          </a>
        ) : (
          <span className="text-base font-medium text-[color:var(--text-soft)]">Coming soon</span>
        )}
      </div>
    </article>
  );
}

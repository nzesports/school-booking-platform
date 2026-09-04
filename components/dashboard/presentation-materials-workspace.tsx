"use client";

import {
  BookOpenCheck,
  Download,
  Eye,
  Files,
  Globe2,
  ImageIcon,
  LockKeyhole,
  Presentation
} from "lucide-react";
import { useMemo, useState } from "react";

import { SecondaryTabs, type SecondaryTabItem } from "@/components/ui/secondary-tabs";
import type { ResourceRecord } from "@/lib/services/portal";
import { colourWithAlpha } from "@/lib/presentation-colors";
import { cn } from "@/lib/utils";

type MaterialTab = "presentation" | "posters" | "flyers" | "guides";

const materialMeta: Record<
  MaterialTab,
  {
    singular: string;
    icon: typeof Presentation;
    iconClassName: string;
    cardClassName: string;
  }
> = {
  presentation: {
    singular: "Presentation",
    icon: Presentation,
    iconClassName: "bg-[#e8f8f0] text-[#0d9463]",
    cardClassName: "hover:border-[#9fd4ad]"
  },
  posters: {
    singular: "Poster",
    icon: ImageIcon,
    iconClassName: "bg-[#f1edfd] text-[#6941c6]",
    cardClassName: "hover:border-[#c9b4ed]"
  },
  flyers: {
    singular: "Flyer",
    icon: Files,
    iconClassName: "bg-[#fff3df] text-[#a45c00]",
    cardClassName: "hover:border-[#efd19d]"
  },
  guides: {
    singular: "Guide",
    icon: BookOpenCheck,
    iconClassName: "bg-[#e8f1fd] text-[#1e4fae]",
    cardClassName: "hover:border-[#b7cdf2]"
  }
};

function tabForMaterial(resourceType: string): MaterialTab {
  const normalizedType = resourceType.toLowerCase();

  if (["presentation", "slide_deck", "ppt", "pptx"].includes(normalizedType)) {
    return "presentation";
  }

  if (normalizedType === "poster") {
    return "posters";
  }

  if (normalizedType === "flyer") {
    return "flyers";
  }

  return "guides";
}

function previewUrlFor(resource: ResourceRecord) {
  if (resource.storagePath) {
    return `/portal/download/${encodeURIComponent(resource.id)}`;
  }

  return resource.youtubeUrl ?? resource.externalUrl ?? resource.downloadUrl ?? null;
}

function downloadUrlFor(resource: ResourceRecord) {
  if (resource.storagePath) {
    return `/portal/download/${encodeURIComponent(resource.id)}?download=1`;
  }

  return resource.externalUrl ?? resource.downloadUrl ?? resource.youtubeUrl ?? null;
}

export function PresentationMaterialsWorkspace({
  resources,
  consentAcceptedAt
}: {
  resources: ResourceRecord[];
  consentAcceptedAt?: string;
}) {
  const currentResources = useMemo(
    () => resources.filter((resource) => resource.isActive && resource.isCurrent),
    [resources]
  );
  const resourcesByTab = useMemo(() => {
    const grouped: Record<MaterialTab, ResourceRecord[]> = {
      presentation: [],
      posters: [],
      flyers: [],
      guides: []
    };

    for (const resource of currentResources) {
      grouped[tabForMaterial(resource.type)].push(resource);
    }

    return grouped;
  }, [currentResources]);
  const [activeTab, setActiveTab] = useState<MaterialTab>("presentation");
  const tabs: Array<SecondaryTabItem<MaterialTab>> = [
    {
      value: "presentation",
      label: "Presentation",
      icon: Presentation,
      count: resourcesByTab.presentation.length
    },
    {
      value: "posters",
      label: "Posters",
      icon: ImageIcon,
      count: resourcesByTab.posters.length
    },
    {
      value: "flyers",
      label: "Flyers",
      icon: Files,
      count: resourcesByTab.flyers.length
    },
    {
      value: "guides",
      label: "Guides",
      icon: BookOpenCheck,
      count: resourcesByTab.guides.length
    }
  ];
  const visibleResources = resourcesByTab[activeTab];

  return (
    <section className="surface-panel overflow-hidden rounded-[28px]">
      <div className="bg-[linear-gradient(115deg,#ffffff_0%,#f7fbff_58%,#eef8f1_100%)] px-5 pt-6 md:px-7 md:pt-7">
        <div className="flex flex-wrap items-start justify-between gap-4 pb-5">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.14em] text-[color:var(--green)]">
              Session preparation
            </p>
            <h2 className="mt-1.5 text-3xl font-semibold tracking-[-0.035em] text-[color:var(--navy)]">
              Presentation materials
            </h2>
          </div>
          <div className="inline-flex max-w-md items-start gap-2.5 rounded-[16px] border border-[#d8c8f4] bg-white/90 px-4 py-3 text-sm leading-6 text-[color:var(--navy)] shadow-sm">
            <LockKeyhole className="mt-0.5 h-4 w-4 shrink-0 text-[#6941c6]" aria-hidden="true" />
            <p>
              <span className="font-semibold">Sharing rules apply.</span> Share only items marked
              Public. Internal items are NZ Esports property and must not be redistributed.
              {consentAcceptedAt ? <span className="mt-1 block text-xs text-[color:var(--text-soft)]">Agreement signed.</span> : null}
            </p>
          </div>
        </div>

        <SecondaryTabs
          items={tabs}
          value={activeTab}
          onChange={setActiveTab}
          ariaLabel="Presentation material types"
        />
      </div>

      <div role="tabpanel" className="p-5 md:p-7">
        {visibleResources.length > 0 ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {visibleResources.map((resource) => (
              <MaterialCard key={resource.id} resource={resource} tab={activeTab} />
            ))}
          </div>
        ) : (
          <div className="rounded-[22px] border border-dashed border-[color:var(--border-soft)] bg-[#f8fafc] px-5 py-12 text-center">
            <Files className="mx-auto h-7 w-7 text-[color:var(--text-soft)]" aria-hidden="true" />
            <h3 className="mt-3 text-lg font-semibold text-[color:var(--navy)]">
              No {tabs.find((tab) => tab.value === activeTab)?.label.toLowerCase()} yet
            </h3>
            <p className="mt-1 text-sm text-[color:var(--text-soft)]">
              Approved materials will appear here as soon as the team publishes them.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}

function MaterialCard({ resource, tab }: { resource: ResourceRecord; tab: MaterialTab }) {
  const meta = materialMeta[tab];
  const Icon = meta.icon;
  const previewUrl = previewUrlFor(resource);
  const downloadUrl = downloadUrlFor(resource);
  const accent = resource.presentationAccentColor ?? "#18A83B";
  const isPublic = resource.sharingScope === "public";

  return (
    <article
      className={cn(
        "flex min-h-[270px] flex-col rounded-[22px] border border-[color:var(--border-soft)] bg-white p-5 transition hover:-translate-y-0.5 hover:shadow-[0_16px_36px_rgba(11,24,77,0.08)]",
        meta.cardClassName
      )}
      style={{ borderColor: colourWithAlpha(accent, 0.28) }}
    >
      <div className="flex items-start justify-between gap-3">
        <span className="flex h-12 w-12 items-center justify-center rounded-[15px]" style={{ backgroundColor: colourWithAlpha(accent, 0.1), color: accent }}>
          <Icon className="h-5 w-5" aria-hidden="true" />
        </span>
        <div className="flex flex-wrap justify-end gap-1.5">
          <span className={cn(
            "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold",
            isPublic ? "bg-[#e8f1fd] text-[#1e4fae]" : "bg-[#f1edfd] text-[#6941c6]"
          )}>
            {isPublic ? <Globe2 className="h-3.5 w-3.5" /> : <LockKeyhole className="h-3.5 w-3.5" />}
            {isPublic ? "Public" : "Internal"}
          </span>
          <span className="rounded-full bg-[#eef7f0] px-2.5 py-1 text-xs font-semibold text-[#117a2e]">
            Current
          </span>
        </div>
      </div>

      <div className="mt-4">
        <p className="text-xs font-semibold uppercase tracking-[0.13em]" style={{ color: accent }}>
          {meta.singular}
          {resource.presentationTitle ? ` · ${resource.presentationTitle}` : ""}
        </p>
        <h3 className="mt-2 text-lg font-semibold leading-6 text-[color:var(--navy)]">
          {resource.title}
        </h3>
        <p className="mt-2 line-clamp-3 text-sm leading-6 text-[color:var(--text-soft)]">
          {resource.description || "Approved material ready to preview or download."}
        </p>
      </div>

      <div className={cn(
        "mt-4 rounded-[14px] border px-3.5 py-3 text-xs font-medium leading-5",
        isPublic
          ? "border-[#c9daf4] bg-[#f3f7fd] text-[#1e4fae]"
          : "border-[#d8c8f4] bg-[#f8f5ff] text-[#6941c6]"
      )}>
        {isPublic
          ? "Approved for external sharing."
          : "Internal — do not share, forward, or redistribute this material."}
      </div>

      <div className="mt-auto flex items-center justify-end gap-2 border-t border-[color:var(--border-soft)] pt-4">
        {previewUrl ? (
          <a
            href={previewUrl}
            target="_blank"
            rel="noopener noreferrer"
            title={`Preview ${resource.title} in a new tab`}
            aria-label={`Preview ${resource.title} in a new tab`}
            className="flex h-10 w-10 items-center justify-center rounded-[12px] border border-[color:var(--border-soft)] bg-white text-[color:var(--navy)] transition hover:border-[#9fd4ad] hover:bg-[#f3faf5] hover:text-[#117a2e]"
          >
            <Eye className="h-4 w-4" aria-hidden="true" />
          </a>
        ) : null}
        {downloadUrl ? (
          <a
            href={downloadUrl}
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-[12px] bg-[#117a2e] px-4 text-sm font-semibold text-white transition hover:bg-[#0d6726]"
          >
            <Download className="h-4 w-4" aria-hidden="true" />
            Download
          </a>
        ) : (
          <span className="text-sm font-medium text-[color:var(--text-soft)]">File coming soon</span>
        )}
      </div>
    </article>
  );
}

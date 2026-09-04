import type { Metadata } from "next";
import {
  ArrowUpRight,
  BookOpen,
  FileText,
  PlayCircle,
  Sparkles,
  type LucideIcon
} from "lucide-react";

import { listPublicResources, type PublicResource } from "@/lib/services/public-resources";

export const metadata: Metadata = {
  title: "Resources | NZ Esports School Presentations",
  description:
    "Guides, videos and practical resources for schools, educators, parents and esports communities."
};

export default async function ResourcesPage() {
  const resources = await listPublicResources();
  const featured = resources.find((resource) => resource.type === "pdf") ?? resources[0];
  const videos = resources
    .filter(
      (resource) =>
        resource.id !== featured?.id &&
        (resource.type === "youtube" || resource.type === "video")
    )
    .sort((a, b) => videoPriority(a) - videoPriority(b));
  const reading = resources.filter(
    (resource) =>
      resource.id !== featured?.id && resource.type !== "youtube" && resource.type !== "video"
  );

  return (
    <main>
      <section className="public-band relative overflow-hidden bg-[linear-gradient(135deg,#e5f7eb_0%,#f7fbff_52%,#eaf5fb_100%)]">
        <div className="pointer-events-none absolute -left-24 top-4 h-72 w-72 rounded-full bg-[radial-gradient(circle,rgba(71,201,106,0.18),transparent_68%)]" />
        <div className="pointer-events-none absolute -right-20 bottom-[-9rem] h-96 w-96 rounded-full bg-[radial-gradient(circle,rgba(175,213,237,0.5),transparent_68%)]" />
        <div className="site-shell relative">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[color:var(--green)]">
            Resource library
          </p>
          <h1 className="mt-4 max-w-[1240px] text-5xl leading-[0.98] text-[color:var(--navy)] md:text-6xl xl:text-7xl">
            <span className="block md:whitespace-nowrap">Practical esports resources</span>
            <span className="block md:whitespace-nowrap">for schools and communities.</span>
          </h1>
          <p className="mt-7 max-w-3xl text-lg leading-8 text-[color:var(--text-soft)]">
            Useful guides, short videos and expert articles to help schools build stronger esports
            programmes, support healthier gaming and open up conversations about student pathways.
          </p>
        </div>
      </section>

      {featured ? (
        <section className="public-band bg-white">
          <div className="site-shell">
            <div className="grid overflow-hidden rounded-[38px] border border-[rgba(24,168,59,0.16)] bg-[#f4fbf6] shadow-[0_30px_80px_rgba(11,24,77,0.1)] lg:grid-cols-[1.35fr_0.65fr]">
              <div className="flex flex-col p-8 sm:p-10 lg:p-14">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-[#117a2e] shadow-[0_8px_22px_rgba(11,24,77,0.06)]">
                    <Sparkles className="h-4 w-4" aria-hidden="true" />
                    Featured guide
                  </span>
                  <ResourceTags tags={featured.tags} limit={2} />
                </div>

                <h2 className="mt-8 max-w-3xl text-4xl leading-[1.06] text-[color:var(--navy)] md:text-5xl">
                  {featured.title}
                </h2>
                <p className="mt-5 max-w-2xl text-base leading-8 text-[color:var(--text-soft)]">
                  {featured.description}
                </p>

                <div className="mt-9 border-t border-[rgba(24,168,59,0.16)] pt-7">
                  <ResourceAction resource={featured} emphasis />
                </div>
              </div>

              <div className="relative flex min-h-[320px] items-center justify-center overflow-hidden bg-[linear-gradient(145deg,#dff5e5_0%,#e7f5fb_100%)] p-10">
                <div className="absolute -right-10 -top-10 h-44 w-44 rounded-full border-[28px] border-white/45" />
                <div className="absolute -bottom-16 -left-12 h-52 w-52 rounded-full bg-white/35" />
                <div className="relative rotate-[-3deg] rounded-[30px] border border-white/80 bg-white/90 p-9 shadow-[0_24px_55px_rgba(11,24,77,0.13)]">
                  <FileText className="h-16 w-16 text-[color:var(--green)]" aria-hidden="true" />
                  <p className="mt-8 text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--green)]">
                    School starter resource
                  </p>
                  <p className="mt-2 max-w-[250px] text-2xl font-semibold leading-tight text-[color:var(--navy)]">
                    Build a club your students can grow with.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>
      ) : null}

      {videos.length > 0 ? (
        <section className="public-band bg-[#f7fafc]">
          <div className="site-shell">
            <div className="grid gap-8 lg:grid-cols-[0.95fr_1.05fr] lg:items-end">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[color:var(--green)]">
                  Watch and learn
                </p>
                <h2 className="mt-3 text-4xl leading-tight text-[color:var(--navy)] md:text-5xl">
                  Ideas you can use and share.
                </h2>
              </div>
              <p className="max-w-2xl text-base leading-8 text-[color:var(--text-soft)] lg:justify-self-end">
                Short, accessible videos for classroom conversations, staff learning or anyone
                wanting a clearer picture of wellbeing and pathways in esports.
              </p>
            </div>

            <div className="mt-10 grid gap-4 lg:grid-cols-2">
              {videos.map((resource, index) => (
                <VideoResource key={resource.id} resource={resource} index={index} />
              ))}
            </div>
          </div>
        </section>
      ) : null}

      {reading.length > 0 ? (
        <section className="public-band bg-white">
          <div className="site-shell space-y-6">
            {reading.map((resource) => (
              <ReadingResource key={resource.id} resource={resource} />
            ))}
          </div>
        </section>
      ) : null}
    </main>
  );
}

function videoPriority(resource: PublicResource) {
  const title = resource.title.toLowerCase();

  if (title.includes("digital wellbeing presentation")) {
    return 0;
  }

  if (title.includes("brain overtrain")) {
    return 1;
  }

  return 2;
}

function VideoResource({ resource, index }: { resource: PublicResource; index: number }) {
  return (
    <article className="group grid gap-6 rounded-[22px] border border-[rgba(4,15,75,0.07)] bg-white p-7 shadow-[0_16px_38px_rgba(11,24,77,0.06)] sm:grid-cols-[76px_1fr]">
      <div className="flex h-[76px] w-[76px] items-center justify-center rounded-[22px] bg-[#fff0ec] text-[#df5032] transition duration-300 group-hover:-rotate-3 group-hover:scale-105">
        <PlayCircle className="h-8 w-8" aria-hidden="true" />
      </div>
      <div className="flex min-h-[220px] flex-col">
        <div className="flex items-center justify-between gap-4">
          <span className="text-xs font-semibold uppercase tracking-[0.2em] text-[#df5032]">
            Video {String(index + 1).padStart(2, "0")}
          </span>
          <ResourceTags tags={resource.tags} limit={1} />
        </div>
        <h3
          className="mt-5 text-[1.65rem] font-normal leading-[1.12] text-[color:var(--navy)]"
          style={{ fontFamily: "var(--font-rozha-one), Georgia, serif" }}
        >
          {resource.title}
        </h3>
        <p className="mt-3 text-sm leading-7 text-[color:var(--text-soft)]">
          {resource.description}
        </p>
        <div className="mt-auto pt-6">
          <ResourceAction resource={resource} />
        </div>
      </div>
    </article>
  );
}

function ReadingResource({ resource }: { resource: PublicResource }) {
  const meta = resourceMeta(resource.type);
  const Icon = meta.icon;

  return (
    <article className="relative overflow-hidden rounded-[36px] bg-[linear-gradient(120deg,#e9f7ee_0%,#f4fbff_100%)] p-8 sm:p-10 lg:p-12">
      <div className="pointer-events-none absolute -right-16 top-1/2 h-64 w-64 -translate-y-1/2 rounded-full border-[42px] border-white/60" />
      <div className="relative grid gap-8 lg:grid-cols-[auto_1fr_auto] lg:items-center">
        <span className="flex h-20 w-20 items-center justify-center rounded-[26px] bg-white text-[color:var(--green)] shadow-[0_18px_40px_rgba(11,24,77,0.08)]">
          <Icon className="h-8 w-8" aria-hidden="true" />
        </span>
        <div className="max-w-3xl">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--green)]">
            {meta.label}
          </p>
          <h2 className="mt-3 text-3xl leading-tight text-[color:var(--navy)] md:text-4xl">
            {resource.title}
          </h2>
          <p className="mt-4 text-base leading-8 text-[color:var(--text-soft)]">
            {resource.description}
          </p>
        </div>
        <div className="lg:pl-8">
          <ResourceAction resource={resource} emphasis />
        </div>
      </div>
    </article>
  );
}

function ResourceTags({ tags, limit }: { tags: string[]; limit: number }) {
  if (tags.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-wrap gap-2">
      {tags.slice(0, limit).map((tag) => (
        <span
          key={tag}
          className="rounded-full border border-[rgba(4,15,75,0.08)] bg-white/70 px-3 py-1.5 text-xs font-semibold text-[color:var(--text-muted)]"
        >
          {tag}
        </span>
      ))}
    </div>
  );
}

function ResourceAction({
  resource,
  emphasis = false
}: {
  resource: PublicResource;
  emphasis?: boolean;
}) {
  const meta = resourceMeta(resource.type);

  return (
    <a
      href={resource.url}
      target="_blank"
      rel="noreferrer"
      className={
        emphasis
          ? "inline-flex min-h-[48px] items-center justify-center gap-2 rounded-[16px] bg-[color:var(--green)] px-6 py-3 text-sm font-semibold text-white shadow-[0_14px_30px_rgba(24,168,59,0.24)] transition hover:-translate-y-0.5 hover:bg-[#148f34]"
          : "inline-flex items-center gap-2 border-b border-[rgba(24,168,59,0.3)] pb-1.5 text-sm font-semibold text-[#117a2e] transition hover:border-[color:var(--green)] hover:text-[color:var(--green)]"
      }
    >
      {meta.action}
      <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
    </a>
  );
}

function resourceMeta(type: string): {
  label: string;
  action: string;
  icon: LucideIcon;
} {
  if (type === "youtube" || type === "video") {
    return {
      label: "Video",
      action: "Watch video",
      icon: PlayCircle
    };
  }

  if (type === "pdf") {
    return {
      label: "PDF guide",
      action: "Open guide",
      icon: FileText
    };
  }

  return {
    label: "Article",
    action: "Read article",
    icon: BookOpen
  };
}

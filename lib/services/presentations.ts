import {
  presentations as demoPresentations,
  regions as demoRegions,
  testimonials as demoTestimonials
} from "@/lib/domain/demo-data";
import { regionDisplayName } from "@/lib/domain/regions";
import type { HomepageSectionRecord, PresentationType, Region, Testimonial } from "@/lib/domain/types";
import { unstable_cache } from "next/cache";

import { PUBLIC_CONTENT_TAG } from "@/lib/services/cache-tags";
import { createSignedResourceUrl } from "@/lib/services/storage";
import { createAdminClient } from "@/lib/supabase/admin";

// Public reference data (presentations, regions, homepage copy, testimonials)
// changes rarely but was being re-read from the database on every page render
// — the root layout alone queries three of these per request. Each loader is
// cached for 5 minutes and busted via PUBLIC_CONTENT_TAG whenever staff save
// content. They read with the admin client (public data, server-only module)
// so no cookie access happens inside the cache scope.
const publicCacheOptions = { revalidate: 300, tags: [PUBLIC_CONTENT_TAG] };

export function splitContentLines(value: unknown): string[] {
  if (typeof value !== "string") {
    return [];
  }

  return value
    .split(/\r?\n/)
    .map((line) => line.replace(/^[-•*]\s*/, "").trim())
    .filter(Boolean);
}

function mapPresentationRecord(record: Record<string, unknown>): PresentationType {
  return {
    id: record.id as string,
    slug: record.slug as string,
    title: record.title as string,
    shortSummary: (record.short_summary as string | null) ?? "",
    fullDescription: (record.full_description as string | null) ?? "",
    contentSnippet: (record.content_snippet as string | null) ?? undefined,
    durationMinutes: Number(record.duration_minutes ?? 45),
    yearLevels: (record.year_levels as string | null) ?? "Years 7 to 13",
    deliveryFormats: (record.delivery_formats as string[] | null) ?? [],
    learningOutcomes: splitContentLines(record.learning_outcomes),
    requiredEquipment: splitContentLines(record.required_equipment),
    youtubeUrl: (record.youtube_url as string | null) ?? undefined,
    imageUrl: (record.image_url as string | null) ?? undefined,
    active: Boolean(record.is_active),
    public: Boolean(record.is_public)
  };
}

export const listPublicPresentations = unstable_cache(
  listPublicPresentationsUncached,
  ["public-presentations"],
  publicCacheOptions
);

async function listPublicPresentationsUncached() {
  const supabase = createAdminClient();

  if (!supabase) {
    return demoPresentations.filter((presentation) => presentation.active && presentation.public);
  }

  // Select * so newly added optional columns (e.g. youtube_url before its
  // migration runs) never break the whole query.
  const { data, error } = await supabase
    .from("presentation_types")
    .select("*")
    .eq("is_active", true)
    .eq("is_public", true)
    .order("sort_order", { ascending: true });

  if (error || !data) {
    return demoPresentations.filter((presentation) => presentation.active && presentation.public);
  }

  return data.map((record) => mapPresentationRecord(record as Record<string, unknown>));
}

export type PublicPresentationResource = {
  id: string;
  title: string;
  description: string;
  resourceType: string;
  url: string;
};

// School-facing flyers, links, and downloads shown on the public presentation
// detail page. Storage-backed files get a signed URL at render time because
// public visitors can't use the authenticated portal download route.
// Cached for 5 minutes — well inside the 60-minute signed-URL expiry.
export const listPublicPresentationResources = unstable_cache(
  listPublicPresentationResourcesUncached,
  ["public-presentation-resources"],
  publicCacheOptions
);

async function listPublicPresentationResourcesUncached(
  presentationTypeId: string
): Promise<PublicPresentationResource[]> {
  const admin = createAdminClient();

  if (!admin) {
    return [];
  }

  // Select * so environments still on the legacy single-audience column load.
  const { data, error } = await admin
    .from("presentation_resources")
    .select("*")
    .eq("presentation_type_id", presentationTypeId)
    .eq("is_active", true)
    .order("created_at", { ascending: false });

  if (error || !data) {
    return [];
  }

  const schoolResources = data.filter((resource) => {
    const audiences =
      Array.isArray(resource.audiences) && resource.audiences.length > 0
        ? (resource.audiences as string[])
        : [((resource as Record<string, unknown>).audience as string | undefined) ?? "staff"];

    return audiences.includes("school");
  });

  const mapped = await Promise.all(
    schoolResources.map(async (resource) => {
      const url =
        (resource.public_url as string | null) ??
        (await createSignedResourceUrl(resource.storage_path as string | null, 60 * 60));

      if (!url) {
        return null;
      }

      return {
        id: resource.id as string,
        title: resource.title as string,
        description: (resource.description as string | null) ?? "",
        resourceType: (resource.resource_type as string | null) ?? "document",
        url
      };
    })
  );

  return mapped.filter((resource): resource is PublicPresentationResource => resource !== null);
}

export const listRegions = unstable_cache(listRegionsUncached, ["public-regions"], publicCacheOptions);

async function listRegionsUncached() {
  const supabase = createAdminClient();

  if (!supabase) {
    return demoRegions.filter((region) => region.isActive);
  }

  const { data, error } = await supabase
    .from("regions")
    .select("id, name, slug, is_active")
    .eq("is_active", true)
    .order("sort_order", { ascending: true });

  if (error || !data) {
    return demoRegions.filter((region) => region.isActive);
  }

  return data.map(
    (region) =>
      ({
        id: region.id as string,
        name: regionDisplayName({
          slug: region.slug as string,
          name: region.name as string
        }),
        slug: region.slug as string,
        isActive: Boolean(region.is_active)
      }) satisfies Region
  );
}

export const getPresentationBySlug = unstable_cache(
  getPresentationBySlugUncached,
  ["public-presentation-by-slug"],
  publicCacheOptions
);

async function getPresentationBySlugUncached(slug: string) {
  const supabase = createAdminClient();

  if (!supabase) {
    return demoPresentations.find((presentation) => presentation.slug === slug) ?? null;
  }

  const { data, error } = await supabase
    .from("presentation_types")
    .select("*")
    .eq("slug", slug)
    .maybeSingle();

  if (error || !data) {
    return demoPresentations.find((presentation) => presentation.slug === slug) ?? null;
  }

  return mapPresentationRecord(data as Record<string, unknown>);
}

export const listHomepageSections = unstable_cache(
  listHomepageSectionsUncached,
  ["public-homepage-sections"],
  publicCacheOptions
);

async function listHomepageSectionsUncached() {
  const supabase = createAdminClient();

  if (!supabase) {
    return [] as HomepageSectionRecord[];
  }

  const { data, error } = await supabase
    .from("homepage_sections")
    .select("id, section_key, title, subtitle, body, image_url, is_active, sort_order")
    .eq("is_active", true)
    .order("sort_order", { ascending: true });

  if (error || !data) {
    return [] as HomepageSectionRecord[];
  }

  return data.map(
    (section) =>
      ({
        id: section.id as string,
        sectionKey: section.section_key as string,
        title: (section.title as string | null) ?? undefined,
        subtitle: (section.subtitle as string | null) ?? undefined,
        body: (section.body as string | null) ?? undefined,
        imageUrl: (section.image_url as string | null) ?? undefined,
        isActive: Boolean(section.is_active),
        sortOrder: Number(section.sort_order ?? 0)
      }) satisfies HomepageSectionRecord
  );
}

export const listPublicTestimonials = unstable_cache(
  listPublicTestimonialsUncached,
  ["public-testimonials"],
  publicCacheOptions
);

async function listPublicTestimonialsUncached(limit = 6): Promise<Testimonial[]> {
  const admin = createAdminClient();

  if (!admin) {
    return demoTestimonials.slice(0, limit);
  }

  const { data: reviews, error } = await admin
    .from("presentation_reviews")
    .select("id, quote, attribution, rating, created_at, school_id, presentation_type_id")
    .eq("is_approved", true)
    .eq("is_public", true)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error || !reviews?.length) {
    return demoTestimonials.slice(0, limit);
  }

  const schoolIds = Array.from(
    new Set(reviews.map((review) => review.school_id as string | null).filter(Boolean))
  ) as string[];
  const presentationIds = Array.from(
    new Set(
      reviews
        .map((review) => review.presentation_type_id as string | null)
        .filter(Boolean)
    )
  ) as string[];
  const [{ data: schools }, { data: presentations }] = await Promise.all([
    schoolIds.length
      ? admin.from("schools").select("id, name").in("id", schoolIds)
      : Promise.resolve({ data: [] }),
    presentationIds.length
      ? admin.from("presentation_types").select("id, title").in("id", presentationIds)
      : Promise.resolve({ data: [] })
  ]);
  const schoolsById = new Map((schools ?? []).map((school) => [school.id as string, school]));
  const presentationsById = new Map(
    (presentations ?? []).map((presentation) => [presentation.id as string, presentation])
  );

  return reviews.map((review) => ({
    id: review.id as string,
    quote: review.quote as string,
    attribution: (review.attribution as string | null) ?? "School contact",
    school:
      (schoolsById.get(review.school_id as string)?.name as string | undefined) ?? "School",
    presentationTitle:
      (presentationsById.get(review.presentation_type_id as string)?.title as string | undefined) ??
      undefined,
    feedbackDate: review.created_at
      ? new Intl.DateTimeFormat("en-NZ", {
          timeZone: "Pacific/Auckland",
          month: "short",
          year: "numeric"
        }).format(new Date(review.created_at as string))
      : undefined,
    rating: review.rating === null || review.rating === undefined ? undefined : Number(review.rating)
  }));
}

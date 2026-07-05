import {
  presentations as demoPresentations,
  regions as demoRegions,
  testimonials as demoTestimonials
} from "@/lib/domain/demo-data";
import { regionDisplayName } from "@/lib/domain/regions";
import type { HomepageSectionRecord, PresentationType, Region, Testimonial } from "@/lib/domain/types";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

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

export async function listPublicPresentations() {
  const supabase = await createClient();

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

export async function listRegions() {
  const supabase = await createClient();

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

export async function getPresentationBySlug(slug: string) {
  const supabase = await createClient();

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

export async function listHomepageSections() {
  const supabase = await createClient();

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

export async function listPublicTestimonials(limit = 6): Promise<Testimonial[]> {
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

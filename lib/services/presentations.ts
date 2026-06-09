import { presentations, regions } from "@/lib/domain/demo-data";

export async function listPublicPresentations() {
  return presentations.filter((presentation) => presentation.active && presentation.public);
}

export async function listRegions() {
  return regions.filter((region) => region.isActive);
}

export async function getPresentationBySlug(slug: string) {
  return presentations.find((presentation) => presentation.slug === slug) ?? null;
}

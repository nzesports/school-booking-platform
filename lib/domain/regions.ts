export const OTHER_REGION_SLUG = "other-request-region";

const otherRegionSlugs = new Set([OTHER_REGION_SLUG, "other"]);

export function isOtherRegionSlug(slug: string | null | undefined) {
  return slug ? otherRegionSlugs.has(slug) : false;
}

export function regionDisplayName(region: { slug: string; name: string }) {
  return isOtherRegionSlug(region.slug) ? "Other" : region.name;
}

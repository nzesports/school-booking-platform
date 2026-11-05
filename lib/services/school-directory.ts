import directory from "@/lib/data/nz-school-directory.json";
import type { createAdminClient } from "@/lib/supabase/admin";

type AdminClient = NonNullable<ReturnType<typeof createAdminClient>>;
type DirectoryRow = [
  name: string,
  address: string,
  suburb: string,
  city: string,
  postcode: string,
  regionSlug: string | null
];

const regionNames = directory.regions as Record<string, string>;

// Reduces a name to what identifies the school, so "Māngere East Primary
// School" and "Mangere East School" meet. Words like "High" stay: they tell
// schools in the same town apart.
export function schoolNameKey(name: string) {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/['’`.]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\bint\b/g, "intermediate")
    .replace(/\bmt\b/g, "mount")
    .replace(/\bsaint\b/g, "st")
    .split(" ")
    .filter((word) => word && word !== "school" && word !== "primary")
    .join(" ");
}

// Two schools sharing a key are dropped: a wrong region is worse than none.
const schoolsByKey = new Map<string, DirectoryRow | null>();

for (const row of directory.schools as DirectoryRow[]) {
  const key = schoolNameKey(row[0]);
  schoolsByKey.set(key, schoolsByKey.has(key) ? null : row);
}

export function findDirectorySchool(name: string) {
  const row = schoolsByKey.get(schoolNameKey(name));

  if (!row) {
    return null;
  }

  const [, address, suburb, city, postcode, regionSlug] = row;

  return {
    address: address || null,
    suburb: suburb || null,
    city: city || null,
    postcode: postcode || null,
    regionSlug
  };
}

// The region's id, adding the region first if it isn't on the list yet.
async function directoryRegionId(admin: AdminClient, slug: string) {
  const { data: existing } = await admin.from("regions").select("id").eq("slug", slug).maybeSingle();

  if (existing) {
    return existing.id as string;
  }

  const { data: last } = await admin
    .from("regions")
    .select("sort_order")
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const { data: created } = await admin
    .from("regions")
    .insert({
      slug,
      name: regionNames[slug] ?? slug,
      sort_order: Number(last?.sort_order ?? 0) + 1,
      is_active: true
    })
    .select("id")
    .single();

  return (created?.id as string | undefined) ?? null;
}

// Location fields for a new school, or null when the directory has no clear
// match. The directory's region wins over one picked on a form, so schools
// file under where they really are.
export async function directoryLocationFor(admin: AdminClient, schoolName: string) {
  const school = findDirectorySchool(schoolName);

  if (!school) {
    return null;
  }

  return {
    address: school.address,
    suburb: school.suburb,
    city: school.city,
    postcode: school.postcode,
    regionId: school.regionSlug ? await directoryRegionId(admin, school.regionSlug) : null
  };
}

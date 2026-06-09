import { redirect } from "next/navigation";

export default async function BookPage({
  params,
  searchParams
}: {
  params: Promise<{ slug?: string[] }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ slug }, query] = await Promise.all([params, searchParams]);

  const presentationSlug = slug?.[0];
  const regionSlug = firstValue(query.region);
  const date = firstValue(query.date);
  const time = firstValue(query.time);
  const targetPath = presentationSlug ? `/presentations/${presentationSlug}` : "/";
  const nextQuery = new URLSearchParams({ booking: "1" });

  if (presentationSlug) {
    nextQuery.set("presentation", presentationSlug);
  }

  if (regionSlug) {
    nextQuery.set("region", regionSlug);
  }

  if (date) {
    nextQuery.set("date", date);
  }

  if (time) {
    nextQuery.set("time", time);
  }

  redirect(`${targetPath}?${nextQuery.toString()}`);
}

function firstValue(value: string | string[] | undefined) {
  return typeof value === "string" ? value : value?.[0];
}

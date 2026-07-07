import { config } from "@/lib/env";

// Adds an opted-in teacher/school contact to the Brevo "teachers" list
// (list id from BREVO_TEACHER_LIST_ID, default 15) tagged with where they came
// from via the SOURCE attribute, plus their school name. Fire-and-forget from
// the callers — a Brevo hiccup must never break a booking or feedback submit.

const BREVO_BASE = "https://api.brevo.com/v3";

// Best-effort, once per server process: make sure the custom attributes exist
// so the contact upsert doesn't get rejected for unknown fields. Creating an
// attribute that already exists returns 400, which we deliberately ignore.
let attributesEnsured: Promise<void> | null = null;

function ensureAttributes(apiKey: string) {
  attributesEnsured ??= (async () => {
    for (const attribute of ["SOURCE", "SCHOOL"]) {
      await fetch(`${BREVO_BASE}/contacts/attributes/normal/${attribute}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "api-key": apiKey },
        body: JSON.stringify({ type: "text" })
      }).catch(() => {});
    }
  })();

  return attributesEnsured;
}

export async function addContactToTeachersList(opts: {
  email: string;
  name?: string;
  schoolName?: string;
}) {
  if (!config.isBrevoConfigured || !opts.email) {
    return { status: "skipped" as const };
  }

  const apiKey = config.brevoApiKey as string;
  await ensureAttributes(apiKey);

  const [firstName, ...rest] = (opts.name ?? "").trim().split(/\s+/);
  const response = await fetch(`${BREVO_BASE}/contacts`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "api-key": apiKey },
    body: JSON.stringify({
      email: opts.email.trim().toLowerCase(),
      // Upsert: existing contacts get updated + added to the list instead of
      // erroring as duplicates.
      updateEnabled: true,
      listIds: [config.brevoTeacherListId],
      attributes: {
        ...(firstName ? { FIRSTNAME: firstName } : {}),
        ...(rest.length > 0 ? { LASTNAME: rest.join(" ") } : {}),
        SOURCE: "Booking platform",
        ...(opts.schoolName ? { SCHOOL: opts.schoolName } : {})
      }
    })
  });

  if (!response.ok && response.status !== 204) {
    return { status: "failed" as const, error: await response.text() };
  }

  return { status: "ok" as const };
}

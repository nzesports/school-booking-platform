// Imports historical SimplyBook bookings plus ambassador and school feedback.
//
// The command is a dry run unless --apply is supplied. It is deliberately
// idempotent: source rows receive deterministic UUIDs, so rerunning the same
// export updates the imported records instead of duplicating them.
//
// Usage:
//   node scripts/import-historical-platform-data.mjs \
//     --bookings /path/to/bookings.xls \
//     --ambassador-feedback /path/to/ambassador-feedback.xlsx \
//     --school-feedback /path/to/school-feedback.csv
//
// Add --apply only after reviewing the dry-run summary.

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

import { createClient } from "@supabase/supabase-js";
import XLSX from "xlsx";

process.env.TZ = "Pacific/Auckland";

const IMPORT_NAMESPACE = "nz-esports-historical-platform-import-v1";
const CLEAR_TEST_SCHOOLS = new Set(["school of wizardry"]);
const SIMPLYBOOK_STATUS_GROUPS = JSON.parse(
  readFileSync(
    new URL("./data/simplybook-booking-statuses-2026-09-01.json", import.meta.url),
    "utf8"
  )
);
const SIMPLYBOOK_STATUS_BY_CODE = new Map(
  Object.entries(SIMPLYBOOK_STATUS_GROUPS).flatMap(([status, codes]) =>
    codes.map((code) => [String(code).toLowerCase(), status])
  )
);
const MONTHS = new Map(
  [
    "jan",
    "feb",
    "mar",
    "apr",
    "may",
    "jun",
    "jul",
    "aug",
    "sep",
    "oct",
    "nov",
    "dec"
  ].map((month, index) => [month, index])
);

const SCHOOL_ALIASES = new Map(
  [
    ["ani", "auckland normal intermediate"],
    ["auckland normal intermediate school", "auckland normal intermediate"],
    ["birkdale intermediate school", "birkdale intermediate"],
    ["campbells bay school", "campbells bay school"],
    ["cobham intermediate", "wairarapa cobham intermediate"],
    ["glendowie", "glendowie college"],
    ["glenfield intermediate school", "glenfield intermediate"],
    ["halswell primary", "halswell school"],
    ["hamilton boys high", "hamilton boys high school"],
    ["john paul college", "john paul college rotorua"],
    ["matua", "matua school"],
    ["mt somers sprinburn school", "mt somers springburn school"],
    ["mt somers springburn", "mt somers springburn school"],
    ["my albert primary", "mt albert primary school"],
    ["north west college", "north west college"],
    ["opawa school", "te kura o te opawaho opawa primary school"],
    ["opawa primary school", "te kura o te opawaho opawa primary school"],
    ["ormiston primary school", "ormiston primary"],
    ["ormiston school", "ormiston primary"],
    ["otumoetai intermediate", "otumoetai intermediate"],
    ["papanui primary school", "papanui primary"],
    ["rangeview int school", "rangeview intermediate"],
    ["rangeview intermediate school", "rangeview intermediate"],
    ["riccarton high", "riccarton high school"],
    ["rototuna senior high", "rototuna senior high school"],
    ["roydvale school", "roydvale primary school"],
    ["waiheke high", "waiheke high school"],
    ["western heights primary", "western heights primary school"],
    ["wharenui primary school", "wharenui school"]
  ].map(([alias, canonical]) => [normalize(alias), normalize(canonical)])
);

const CANONICAL_DISPLAY_NAMES = new Map([
  ["auckland normal intermediate", "Auckland Normal Intermediate"],
  ["wairarapa cobham intermediate", "Wairarapa Cobham Intermediate"],
  ["te kura o te opawaho opawa primary school", "Te Kura o Te Ōpāwaho — Opawa School"]
]);

function parseArguments(argv) {
  const result = { apply: false };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];

    if (argument === "--apply") {
      result.apply = true;
      continue;
    }

    const key = {
      "--bookings": "bookings",
      "--ambassador-feedback": "ambassadorFeedback",
      "--school-feedback": "schoolFeedback"
    }[argument];

    if (key) {
      result[key] = argv[index + 1];
      index += 1;
    }
  }

  if (!result.bookings || !result.ambassadorFeedback || !result.schoolFeedback) {
    throw new Error(
      "Provide --bookings, --ambassador-feedback, and --school-feedback file paths."
    );
  }

  return result;
}

function normalize(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\bsaint\b/g, "st")
    .replace(/\s+/g, " ");
}

function canonicalSchoolKey(value) {
  const normalized = normalize(value);
  return SCHOOL_ALIASES.get(normalized) ?? normalized;
}

function normalizedEmail(value) {
  const email = String(value ?? "").trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : "";
}

function deterministicUuid(kind, key) {
  const hash = createHash("sha256")
    .update(`${IMPORT_NAMESPACE}:${kind}:${key}`)
    .digest("hex")
    .slice(0, 32)
    .split("");
  hash[12] = "5";
  hash[16] = ["8", "9", "a", "b"][Number.parseInt(hash[16], 16) % 4];
  const value = hash.join("");
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`;
}

function stableKey(parts) {
  return parts.map((part) => normalize(part)).join("|");
}

function cleanFeedbackText(value) {
  return String(value ?? "").trim().replace(/\s+/g, " ");
}

function mediaUrls(value) {
  return String(value ?? "").match(/https?:\/\/[^\s]+/g) ?? [];
}

function mediaDetails(url) {
  const pathname = new URL(url).pathname;
  const filename = decodeURIComponent(pathname.split("/").pop() || "Report media");
  const extension = filename.split(".").pop()?.toLowerCase();
  const type = extension === "pdf"
    ? "document"
    : ["avi", "mov", "mp4", "webm"].includes(extension)
      ? "video"
      : "image";

  return { filename, type };
}

function parseSourceDate(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return new Date(
      value.getFullYear(),
      value.getMonth(),
      value.getDate(),
      value.getHours(),
      value.getMinutes(),
      value.getSeconds()
    );
  }

  const text = String(value ?? "").trim().replace(/^[A-Za-z]+,\s*/, "");

  if (!text) {
    return null;
  }

  const monthFirst = text.match(
    /^([A-Za-z]{3,9})\s+(\d{1,2}),?\s+(\d{4})(?:\s+(\d{1,2}):(\d{2})(?:\s*([AP]M))?)?/i
  );

  if (monthFirst) {
    const month = MONTHS.get(monthFirst[1].slice(0, 3).toLowerCase());
    let hour = Number(monthFirst[4] ?? 0);
    const minute = Number(monthFirst[5] ?? 0);
    const meridiem = monthFirst[6]?.toUpperCase();

    if (meridiem === "PM" && hour < 12) hour += 12;
    if (meridiem === "AM" && hour === 12) hour = 0;

    return month === undefined
      ? null
      : new Date(Number(monthFirst[3]), month, Number(monthFirst[2]), hour, minute);
  }

  const dayFirst = text.match(
    /^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})(?:\s+(\d{1,2}):(\d{2})(?:\s*([AP]M))?)?/i
  );

  if (dayFirst) {
    let hour = Number(dayFirst[4] ?? 0);
    const meridiem = dayFirst[6]?.toUpperCase();

    if (meridiem === "PM" && hour < 12) hour += 12;
    if (meridiem === "AM" && hour === 12) hour = 0;

    return new Date(
      Number(dayFirst[3]),
      Number(dayFirst[2]) - 1,
      Number(dayFirst[1]),
      hour,
      Number(dayFirst[5] ?? 0)
    );
  }

  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function withTime(date, time, fallbackHour = 12) {
  const result = new Date(date);
  const match = String(time ?? "").match(/(\d{1,2}):(\d{2})/);
  result.setHours(match ? Number(match[1]) : fallbackHour, match ? Number(match[2]) : 0, 0, 0);
  return result;
}

function dateKey(date) {
  if (!date) return "";
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0")].join("-");
}

function dayDistance(left, right) {
  const leftDay = new Date(left.getFullYear(), left.getMonth(), left.getDate()).getTime();
  const rightDay = new Date(right.getFullYear(), right.getMonth(), right.getDate()).getTime();
  return Math.abs(Math.round((leftDay - rightDay) / 86_400_000));
}

function readSheet(file, range = 0) {
  const workbook = XLSX.readFile(file, { cellDates: true });
  return XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], {
    range,
    defval: ""
  });
}

function yesNo(value) {
  const normalized = normalize(value);
  if (["yes", "y", "true"].includes(normalized)) return true;
  if (["no", "n", "false"].includes(normalized)) return false;
  return null;
}

function yesNoText(value) {
  const result = yesNo(value);
  return result === null ? undefined : result ? "yes" : "no";
}

function integer(value) {
  const match = String(value ?? "").replace(/,/g, "").match(/-?\d+/);
  return match ? Number(match[0]) : null;
}

function normalizeSevenPointRating(value) {
  const rating = Number(value);
  if (!Number.isFinite(rating)) return null;
  if (rating >= 1 && rating <= 5) return Math.round(rating);
  if (rating >= 1 && rating <= 7) return Math.max(1, Math.min(5, Math.round(1 + ((rating - 1) * 4) / 6)));
  return null;
}

function loadEnvironment() {
  const env = {};
  const contents = readFileSync(".env.local", "utf8");

  for (const line of contents.split(/\r?\n/)) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (match) env[match[1]] = match[2].trim().replace(/^"|"$/g, "");
  }

  if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Supabase service-role environment variables are not configured.");
  }

  return env;
}

async function query(admin, table, columns = "*") {
  const { data, error } = await admin.from(table).select(columns);
  if (error) throw new Error(`${table}: ${error.message}`);
  return data ?? [];
}

function regionFor(rawValue, regions, fallbackRegionId = null) {
  if (fallbackRegionId) return fallbackRegionId;
  const value = normalize(rawValue);
  const otherRegion = regions.find(
    (region) => region.slug === "other" || region.slug === "other-request-region"
  );
  if (!value) return otherRegion?.id ?? null;

  const matchers = [
    [/north shore|albany|takapuna|glenfield|birkenhead|birkdale|campbells bay/, "north-shore"],
    [/west auckland|henderson|waitakere|new lynn|westgate|massey/, "west-auckland"],
    [/south auckland|manurewa|papakura|mangere|otahuhu/, "south-auckland"],
    [/east auckland|howick|pakuranga|ormiston|botany/, "east-auckland"],
    [/auckland|epsom|mt albert|mount albert|mt roskill/, "auckland-central"],
    [/hamilton|waikato|huntly|rototuna|te aroha|matamata/, "hamilton"],
    [/tauranga|bay of plenty|otumoetai|matua|waihi/, "tauranga"],
    [/palmerston|manawatu/, "palmerston-north"],
    [/wellington|porirua|hutt|masterton|wairarapa/, "wellington"],
    [/christchurch|canterbury|rolleston|riccarton|papanui|halswell/, "christchurch"],
    [/dunedin|otago/, "dunedin"],
    [/nelson|tasman/, "nelson"],
    [/queenstown|wanaka/, "queenstown"]
  ];
  const slug = matchers.find(([pattern]) => pattern.test(value))?.[1] ?? "other";
  return slug === "other"
    ? otherRegion?.id ?? null
    : regions.find((region) => region.slug === slug)?.id ?? null;
}

function sourceRows(files) {
  const bookings = readSheet(files.bookings, 2);
  const ambassadorFeedback = readSheet(files.ambassadorFeedback);
  const schoolFeedback = readSheet(files.schoolFeedback);

  return { bookings, ambassadorFeedback, schoolFeedback };
}

function parseBookings(rows) {
  const invalid = [];
  const excluded = [];
  const parsed = [];

  rows.forEach((row, index) => {
    const schoolName = String(row["School Name"] ?? "").trim();
    const schoolKey = canonicalSchoolKey(schoolName);
    const date = parseSourceDate(row.Date);
    const code = String(row.Code ?? "").trim();

    if (!schoolName || !schoolKey || !date || !code) {
      invalid.push({ row: index + 4, school: schoolName || "(missing)", code: code || "(missing)" });
      return;
    }

    if (CLEAR_TEST_SCHOOLS.has(schoolKey)) {
      excluded.push({ row: index + 4, school: schoolName, code });
      return;
    }

    const [startTime, endTime] = String(row.Time ?? "").split("-").map((value) => value.trim());
    const startsAt = withTime(date, startTime, 9);
    const endsAt = withTime(date, endTime, startsAt.getHours());
    if (endsAt <= startsAt) endsAt.setMinutes(startsAt.getMinutes() + 30);
    const cancellationFlag = yesNo(row["Is cancelled"]) === true;
    const cancellationEvidence = Boolean(
      String(row["Cancellation time"] ?? "").trim() ||
      String(row["Cancellation type"] ?? "").trim() ||
      String(row["Canceled by"] ?? "").trim() ||
      yesNo(row["Canceled by admin"]) === true
    );
    const sourceStatus = SIMPLYBOOK_STATUS_BY_CODE.get(code.toLowerCase());

    parsed.push({
      sourceType: "booking",
      sourceKey: code,
      schoolName,
      schoolKey,
      startsAt,
      endsAt,
      createdAt: parseSourceDate(row["Record date"]) ?? startsAt,
      // The PDFs contain the authoritative SimplyBook status column, which is
      // absent from the spreadsheet export. Fall back to cancellation metadata
      // only for any future source row not covered by that status snapshot.
      completed: sourceStatus === "active",
      cancelled:
        sourceStatus === "cancelled" ||
        (!sourceStatus && cancellationFlag && cancellationEvidence),
      pending:
        sourceStatus === "pending" ||
        (!sourceStatus && cancellationFlag && !cancellationEvidence),
      sourceStatus: sourceStatus ?? null,
      cancelledAt: parseSourceDate(row["Cancellation time"]),
      cancellationType: String(row["Cancellation type"] ?? "").trim(),
      cancelledBy: String(row["Canceled by"] ?? "").trim(),
      contactName: String(row["Client name"] ?? "").trim(),
      contactEmail: normalizedEmail(row["Client email"]),
      contactPhone: String(row["Client phone"] ?? "").trim(),
      contactPosition: String(row.Position ?? "").trim(),
      schoolLocation: String(row["School Location"] ?? "").trim(),
      clientAddress: String(row["Client address"] ?? "").trim(),
      notes: String(row.Comment ?? "").trim(),
      requestedTimeNotes: String(row["Suggest Different Time"] ?? "").trim(),
      service: String(row.Service ?? "").trim(),
      rawRow: index + 4,
      report: null,
      reviews: []
    });
  });

  return { parsed, invalid, excluded };
}

function parseAmbassadorFeedback(rows) {
  return rows
    .map((row, index) => {
      const schoolName = String(row["School Name"] ?? "").trim();
      const deliveredAt = parseSourceDate(row["When was the presentation delivered?"]);
      const presenterName = [row["First Name"], row["Last Name"]]
        .map((value) => String(value ?? "").trim())
        .filter(Boolean)
        .join(" ");
      const submittedAt = parseSourceDate(row["Submission Date"]) ?? deliveredAt;
      const sourceKey = stableKey([
        submittedAt?.toISOString(),
        presenterName,
        schoolName,
        deliveredAt?.toISOString(),
        row["How many attendees were present?"],
        row["Presentation Feedback"]
      ]);

      if (!schoolName || !deliveredAt || !presenterName || !submittedAt) {
        return { invalid: true, row: index + 2, school: schoolName || "(missing)" };
      }

      return {
        sourceType: "ambassador-report",
        sourceKey,
        schoolName,
        schoolKey: canonicalSchoolKey(schoolName),
        deliveredAt,
        submittedAt,
        presenterName,
        schoolRollSize: integer(row["Total School Roll Size"]),
        primaryContactName: String(row["Primary Contact Name"] ?? "").trim(),
        primaryContactEmail: normalizedEmail(row["Primary Contact Email (For Follow-Up)"]),
        regionLocation: String(row["Region / Location"] ?? "").trim(),
        firstPresentation: yesNo(row["Was this the first presentation you have delivered to this school?"]),
        studentsCompeted: yesNo(row["Did you have the students compete in an esports event?"]),
        attendeeCount: integer(row["How many attendees were present?"]) ?? 0,
        ageGroups: String(row["What age groups were presented to?"] ?? "").trim(),
        parentsPresent: yesNo(row["Were any parents present?"]),
        attendeeQuotes: cleanFeedbackText(row["Did you capture any thoughts or quotes from attendees?"]),
        attendanceRating: normalizeSevenPointRating(row["How did you feel the presentation went? >> Attendance"]),
        studentResponseRating: normalizeSevenPointRating(row["How did you feel the presentation went? >> Student Response"]),
        teacherResponseRating: normalizeSevenPointRating(row["How did you feel the presentation went? >> Teacher Response"]),
        presentationEnergyRating: normalizeSevenPointRating(row["How did you feel the presentation went? >> Presentation Energy"]),
        presentationFeedback: cleanFeedbackText(row["Presentation Feedback"]),
        mediaUrls: mediaUrls(row["Presentation Photos/Videos"]),
        rawRow: index + 2
      };
    })
    .reduce(
      (result, row) => {
        if (row.invalid) result.invalid.push(row);
        else result.parsed.push(row);
        return result;
      },
      { parsed: [], invalid: [] }
    );
}

function parseSchoolFeedback(rows) {
  return rows
    .map((row, index) => {
      let schoolName = String(row["School Name"] ?? "").trim();
      const deliveredAt = parseSourceDate(row["When was the presentation delivered?"]);
      const submittedAt = parseSourceDate(row["Submission Date"]) ?? deliveredAt;
      let contactName = String(row["Your Name"] ?? "").trim();
      // One source row has these two fields reversed. Its school-domain email
      // confirms that Rolleston College is the school and Athena is the contact.
      if (normalize(schoolName) === "athena evans" && normalize(contactName) === "rolleston college") {
        [schoolName, contactName] = [contactName, schoolName];
      }
      const attendeeFeedback = cleanFeedbackText(
        row["Did you hear any feedback from attendees about the presentation?"]
      );
      const presentationFeedback = cleanFeedbackText(row["Presentation Feedback"]);
      const sourceKey = stableKey([
        submittedAt?.toISOString(),
        schoolName,
        deliveredAt?.toISOString(),
        contactName,
        attendeeFeedback,
        presentationFeedback
      ]);

      if (!schoolName || !deliveredAt || !submittedAt) {
        return { invalid: true, row: index + 2, school: schoolName || "(missing)" };
      }

      return {
        sourceType: "school-feedback",
        sourceKey,
        schoolName,
        schoolKey: canonicalSchoolKey(schoolName),
        deliveredAt,
        submittedAt,
        contactName,
        contactEmail: normalizedEmail(row["Your Email"]),
        studentsCompeted: yesNoText(row["Did the students compete in an esports event?"]),
        attendeeFeedback,
        attendanceRating: normalizeSevenPointRating(row["How did you feel the presentation went? >> Attendance"]),
        studentResponseRating: normalizeSevenPointRating(row["How did you feel the presentation went? >> Student Response"]),
        contentRating: normalizeSevenPointRating(row["How did you feel the presentation went? >> Content"]),
        presenterEnergyRating: normalizeSevenPointRating(row["How did you feel the presentation went? >> Presenter Energy"]),
        presentationFeedback,
        hadEsportsClub: yesNoText(row["Did you have a school esports club prior to the presentation?"]),
        consideringClub: yesNoText(row["Are you considering starting an esports club now?"]),
        mailingListOptIn: yesNoText(row["Would you like us to add you to our mailing list?"]),
        rawRow: index + 2
      };
    })
    .reduce(
      (result, row) => {
        if (row.invalid) result.invalid.push(row);
        else result.parsed.push(row);
        return result;
      },
      { parsed: [], invalid: [] }
    );
}

function displayNameForSchool(key, observations, existingSchool) {
  if (existingSchool?.name) return existingSchool.name;
  if (CANONICAL_DISPLAY_NAMES.has(key)) return CANONICAL_DISPLAY_NAMES.get(key);
  const bookingObservation = observations.find((observation) => observation.sourceType === "booking");
  return bookingObservation?.schoolName ?? observations[0]?.schoolName ?? "School";
}

function findSession(
  sessions,
  row,
  { requireUnusedReport = false, requireUnusedReview = false } = {}
) {
  return sessions
    .filter(
      (session) =>
        session.schoolKey === row.schoolKey &&
        !session.cancelled &&
        (!requireUnusedReport || !session.report) &&
        (!requireUnusedReview || session.reviews.length === 0) &&
        dayDistance(session.startsAt, row.deliveredAt) <= 2
    )
    .sort((left, right) => {
      const distance = dayDistance(left.startsAt, row.deliveredAt) - dayDistance(right.startsAt, row.deliveredAt);
      if (distance !== 0) return distance;
      if (left.sourceType === "booking" && right.sourceType !== "booking") return -1;
      if (right.sourceType === "booking" && left.sourceType !== "booking") return 1;
      return left.startsAt.getTime() - right.startsAt.getTime();
    })[0];
}

function createInferredSession(row, presentationDurationMinutes) {
  const startsAt = new Date(row.deliveredAt);
  if (startsAt.getHours() === 0 && startsAt.getMinutes() === 0) startsAt.setHours(12);
  const endsAt = new Date(startsAt.getTime() + presentationDurationMinutes * 60_000);
  const sourceKey = `${row.schoolKey}|${dateKey(startsAt)}|${row.sourceType}|${row.sourceKey}`;

  return {
    sourceType: "inferred",
    sourceKey,
    schoolName: row.schoolName,
    schoolKey: row.schoolKey,
    startsAt,
    endsAt,
    createdAt: startsAt,
    cancelled: false,
    pending: false,
    completed: true,
    sourceStatus: "active",
    contactName: row.primaryContactName ?? row.contactName ?? "",
    contactEmail: row.primaryContactEmail ?? row.contactEmail ?? "",
    contactPhone: "",
    contactPosition: "",
    schoolLocation: row.regionLocation ?? "",
    clientAddress: "",
    notes: "",
    requestedTimeNotes: "",
    service: "Digital Wellbeing",
    rawRow: row.rawRow,
    report: null,
    reviews: []
  };
}

function referenceCodeFor(sourceKey, usedCodes) {
  let value = 600000 + (Number.parseInt(createHash("sha256").update(sourceKey).digest("hex").slice(0, 8), 16) % 400000);
  while (usedCodes.has(String(value))) value = value === 999999 ? 600000 : value + 1;
  usedCodes.add(String(value));
  return String(value);
}

function batches(values, size = 100) {
  const result = [];
  for (let index = 0; index < values.length; index += size) result.push(values.slice(index, index + size));
  return result;
}

async function upsertBatches(admin, table, rows) {
  for (const batch of batches(rows)) {
    const { error } = await admin.from(table).upsert(batch, { onConflict: "id" });
    if (error) throw new Error(`${table}: ${error.message}`);
  }
}

function average(values) {
  const ratings = values.filter((value) => Number.isFinite(value));
  return ratings.length ? Math.round((ratings.reduce((sum, value) => sum + value, 0) / ratings.length) * 10) / 10 : null;
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const env = loadEnvironment();
  const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
  const source = sourceRows(options);
  const bookingResult = parseBookings(source.bookings);
  const ambassadorResult = parseAmbassadorFeedback(source.ambassadorFeedback);
  const schoolResult = parseSchoolFeedback(source.schoolFeedback);

  const [
    existingProfiles,
    existingAmbassadors,
    existingSchools,
    existingContacts,
    existingContactUsers,
    existingRequests,
    existingReviews,
    presentations,
    regions,
    settings
  ] = await Promise.all([
    query(admin, "profiles", "id,email,full_name,role,status"),
    query(admin, "ambassador_profiles", "id,user_id,status"),
    query(admin, "schools", "*"),
    query(admin, "school_contacts", "*"),
    query(admin, "school_contact_users", "id,school_contact_id,user_id"),
    query(admin, "booking_requests", "id,reference_code"),
    query(admin, "presentation_reviews", "*"),
    query(admin, "presentation_types", "id,title,slug,duration_minutes,is_active"),
    query(admin, "regions", "id,name,slug,is_active"),
    query(admin, "settings", "setting_key,setting_value")
  ]);

  const historicalReportSchemaReady = settings.some(
    (setting) => setting.setting_key === "historical_report_linking_schema"
  );

  const digitalWellbeing = presentations.find((presentation) => presentation.slug === "digital-wellbeing");
  if (!digitalWellbeing) throw new Error("The Digital Wellbeing presentation type was not found.");

  const profilesById = new Map(existingProfiles.map((profile) => [profile.id, profile]));
  const profilesByEmail = new Map(
    existingProfiles.map((profile) => [normalizedEmail(profile.email), profile]).filter(([email]) => email)
  );
  const ambassadorsByName = new Map();
  for (const ambassador of existingAmbassadors) {
    const profile = profilesById.get(ambassador.user_id);
    const key = normalize(profile?.full_name);
    if (key && !ambassadorsByName.has(key)) ambassadorsByName.set(key, ambassador);
  }

  const existingSchoolsByKey = new Map();
  for (const school of existingSchools) {
    const key = canonicalSchoolKey(school.name);
    if (!existingSchoolsByKey.has(key)) existingSchoolsByKey.set(key, school);
  }

  const observationsBySchool = new Map();
  for (const observation of [
    ...bookingResult.parsed,
    ...ambassadorResult.parsed,
    ...schoolResult.parsed
  ]) {
    observationsBySchool.set(observation.schoolKey, [
      ...(observationsBySchool.get(observation.schoolKey) ?? []),
      observation
    ]);
  }

  const schoolRows = [];
  const schoolByKey = new Map();
  for (const [key, observations] of observationsBySchool) {
    const existing = existingSchoolsByKey.get(key);
    const reportWithRoll = observations.find((observation) => observation.schoolRollSize);
    const locationObservation = observations.find(
      (observation) => observation.schoolLocation || observation.regionLocation
    );
    const regionId = regionFor(
      locationObservation?.schoolLocation ?? locationObservation?.regionLocation,
      regions,
      existing?.region_id
    );
    const row = {
      id: existing?.id ?? deterministicUuid("school", key),
      name: displayNameForSchool(key, observations, existing),
      region_id: regionId,
      address: existing?.address ?? locationObservation?.schoolLocation ?? null,
      suburb: existing?.suburb ?? null,
      city: existing?.city ?? null,
      postcode: existing?.postcode ?? null,
      website: existing?.website ?? null,
      roll_size: existing?.roll_size ?? reportWithRoll?.schoolRollSize ?? null,
      notes: existing?.notes ?? null,
      status: existing?.status ?? "active",
      created_at: existing?.created_at ?? observations.map((item) => item.createdAt ?? item.submittedAt ?? item.deliveredAt).filter(Boolean).sort((a, b) => a - b)[0]?.toISOString() ?? new Date().toISOString(),
      updated_at: existing?.updated_at ?? new Date().toISOString()
    };
    schoolRows.push(row);
    schoolByKey.set(key, row);
  }

  const contactObservations = [];
  for (const booking of bookingResult.parsed) {
    if (booking.contactEmail) {
      contactObservations.push({
        schoolKey: booking.schoolKey,
        name: booking.contactName,
        email: booking.contactEmail,
        phone: booking.contactPhone,
        position: booking.contactPosition,
        marketingConsent: false,
        observedAt: booking.createdAt
      });
    }
  }
  for (const report of ambassadorResult.parsed) {
    if (report.primaryContactEmail) {
      contactObservations.push({
        schoolKey: report.schoolKey,
        name: report.primaryContactName,
        email: report.primaryContactEmail,
        phone: "",
        position: "",
        marketingConsent: false,
        observedAt: report.submittedAt
      });
    }
  }
  for (const review of schoolResult.parsed) {
    if (review.contactEmail) {
      contactObservations.push({
        schoolKey: review.schoolKey,
        name: review.contactName,
        email: review.contactEmail,
        phone: "",
        position: "",
        marketingConsent: review.mailingListOptIn === "yes",
        observedAt: review.submittedAt
      });
    }
  }

  const existingContactBySchoolAndEmail = new Map(
    existingContacts.map((contact) => [`${contact.school_id}|${normalizedEmail(contact.email)}`, contact])
  );
  const contactRows = [];
  const contactBySchoolAndEmail = new Map();
  const deduplicatedContacts = new Map();
  for (const observation of contactObservations) {
    const school = schoolByKey.get(observation.schoolKey);
    if (!school) continue;
    const key = `${school.id}|${observation.email}`;
    const current = deduplicatedContacts.get(key);
    if (!current || observation.observedAt < current.observedAt) deduplicatedContacts.set(key, observation);
  }

  for (const [key, observation] of deduplicatedContacts) {
    const school = schoolByKey.get(observation.schoolKey);
    const existing = existingContactBySchoolAndEmail.get(key);
    const row = {
      id: existing?.id ?? deterministicUuid("school-contact", key),
      school_id: school.id,
      full_name: existing?.full_name || observation.name || "School contact",
      email: observation.email,
      phone: existing?.phone || observation.phone || null,
      position: existing?.position || observation.position || null,
      is_primary: existing?.is_primary ?? false,
      can_access_portal: existing?.can_access_portal ?? false,
      marketing_consent: Boolean(existing?.marketing_consent || observation.marketingConsent),
      created_at: existing?.created_at ?? observation.observedAt.toISOString(),
      updated_at: existing?.updated_at ?? new Date().toISOString()
    };
    contactRows.push(row);
    contactBySchoolAndEmail.set(key, row);
  }

  const primaryContactBySchool = new Map();
  for (const contact of contactRows.sort((left, right) => left.created_at.localeCompare(right.created_at))) {
    if (!primaryContactBySchool.has(contact.school_id)) primaryContactBySchool.set(contact.school_id, contact);
  }
  for (const contact of contactRows) {
    const existing = existingContacts.find((item) => item.id === contact.id);
    if (!existing?.is_primary && primaryContactBySchool.get(contact.school_id)?.id === contact.id) {
      contact.is_primary = true;
    }
  }

  const sessions = [...bookingResult.parsed];
  for (const report of ambassadorResult.parsed.sort((left, right) => left.deliveredAt - right.deliveredAt)) {
    let session = findSession(sessions, report, { requireUnusedReport: true });
    if (!session) {
      session = createInferredSession(report, Number(digitalWellbeing.duration_minutes ?? 10));
      sessions.push(session);
    }
    session.report = report;
  }

  for (const review of schoolResult.parsed.sort((left, right) => left.deliveredAt - right.deliveredAt)) {
    let session = findSession(sessions, review, { requireUnusedReview: true });
    if (!session) {
      session = createInferredSession(review, Number(digitalWellbeing.duration_minutes ?? 10));
      sessions.push(session);
    }
    session.reviews.push(review);
  }

  const existingRequestById = new Map(existingRequests.map((request) => [request.id, request]));
  const usedReferenceCodes = new Set(existingRequests.map((request) => request.reference_code).filter(Boolean));
  const requestRows = [];
  const sessionRows = [];
  const reportRows = [];
  const mediaRows = [];
  const activityRows = [];
  const statusRows = [];
  const now = new Date();

  for (const session of sessions) {
    const school = schoolByKey.get(session.schoolKey);
    if (!school) continue;
    const requestId = deterministicUuid("booking-request", session.sourceKey);
    const sessionId = deterministicUuid("booking-session", session.sourceKey);
    const existingRequest = existingRequestById.get(requestId);
    const contact = session.contactEmail
      ? contactBySchoolAndEmail.get(`${school.id}|${session.contactEmail}`)
      : primaryContactBySchool.get(school.id);
    const linkedAmbassador = session.report
      ? ambassadorsByName.get(normalize(session.report.presenterName))
      : null;
    const status = session.completed
      ? "closed"
      : session.cancelled
        ? "cancelled"
        : session.pending
          ? "requested"
          : session.endsAt > now
            ? "tentative"
            : "closed";
    const provenance = session.sourceType === "booking"
      ? `SimplyBook code: ${session.sourceKey}${session.sourceStatus ? ` · Source status: ${session.sourceStatus}` : ""}`
      : `Inferred from historical ${session.report ? "ambassador report" : "school feedback"}`;
    const cancellationDetails = session.cancelled
      ? [
          session.cancelledAt ? `Cancelled at: ${session.cancelledAt.toISOString()}` : "",
          session.cancellationType ? `Cancellation type: ${session.cancellationType}` : "",
          session.cancelledBy ? `Cancelled by: ${session.cancelledBy}` : ""
        ].filter(Boolean).join("\n")
      : "";
    const selectedRegion =
      session.sourceType === "booking"
        ? session.service || session.schoolLocation || session.clientAddress
        : session.schoolLocation || session.clientAddress;
    const sessionRegionId = regionFor(
      selectedRegion,
      regions,
      selectedRegion ? null : school.region_id
    );

    requestRows.push({
      id: requestId,
      reference_code: existingRequest?.reference_code ?? referenceCodeFor(session.sourceKey, usedReferenceCodes),
      school_id: school.id,
      primary_contact_id: contact?.id ?? null,
      region_id: sessionRegionId,
      status,
      source: "staff",
      school_notes: session.notes || null,
      internal_notes: ["Historical import", provenance, cancellationDetails].filter(Boolean).join("\n"),
      requested_different_time: Boolean(session.requestedTimeNotes),
      requested_time_notes: session.requestedTimeNotes || null,
      marketing_consent: false,
      created_at: session.createdAt.toISOString(),
      updated_at: new Date().toISOString()
    });

    sessionRows.push({
      id: sessionId,
      booking_request_id: requestId,
      presentation_type_id: digitalWellbeing.id,
      region_id: sessionRegionId,
      school_id: school.id,
      assigned_ambassador_id: linkedAmbassador?.id ?? null,
      status,
      starts_at: session.startsAt.toISOString(),
      ends_at: session.endsAt.toISOString(),
      year_levels: session.report?.ageGroups || null,
      expected_student_count: session.report?.attendeeCount || null,
      actual_student_count: session.report?.attendeeCount || null,
      location_address: session.schoolLocation || session.clientAddress || null,
      internal_notes: `Historical import · ${provenance}`,
      share_contact_with_ambassador: false,
      report_status: session.report ? "reviewed" : "not_submitted",
      payment_status: "not_eligible",
      created_at: session.createdAt.toISOString(),
      updated_at: new Date().toISOString()
    });

    activityRows.push({
      id: deterministicUuid("booking-activity", session.sourceKey),
      booking_request_id: requestId,
      booking_session_id: sessionId,
      action: "historical.imported",
      actor_type: "system",
      details: {
        source: session.sourceType,
        source_key: session.sourceKey,
        payment_data_imported: false
      },
      created_at: session.createdAt.toISOString()
    });
    statusRows.push({
      id: deterministicUuid("booking-status", session.sourceKey),
      booking_request_id: requestId,
      booking_session_id: sessionId,
      old_status: null,
      new_status: status,
      reason: "Historical data import",
      created_at: session.createdAt.toISOString()
    });

    if (session.report) {
      const report = session.report;
      const reportId = deterministicUuid("ambassador-report", report.sourceKey);
      reportRows.push({
        id: reportId,
        booking_session_id: sessionId,
        ambassador_profile_id: linkedAmbassador?.id ?? null,
        presenter_name: report.presenterName,
        school_roll_size: report.schoolRollSize,
        primary_contact_name: report.primaryContactName || null,
        primary_contact_email: report.primaryContactEmail || null,
        delivered_at: report.deliveredAt.toISOString(),
        first_presentation_to_school: report.firstPresentation,
        students_competed_in_esports: report.studentsCompeted,
        attendee_count: report.attendeeCount,
        year_levels: report.ageGroups || null,
        age_groups: report.ageGroups || null,
        parents_present: report.parentsPresent,
        media_consent_confirmed: false,
        attendee_quotes: report.attendeeQuotes || null,
        attendance_rating: report.attendanceRating,
        student_response_rating: report.studentResponseRating,
        teacher_response_rating: report.teacherResponseRating,
        presentation_energy_rating: report.presentationEnergyRating,
        presentation_feedback: report.presentationFeedback || null,
        additional_notes: null,
        submitted_at: report.submittedAt.toISOString(),
        reviewed_for_payment_at: report.submittedAt.toISOString(),
        reviewed_for_payment_by: null
      });

      for (const url of report.mediaUrls) {
        const media = mediaDetails(url);
        mediaRows.push({
          id: deterministicUuid("ambassador-report-media", `${report.sourceKey}|${url}`),
          title: media.filename,
          media_type: media.type,
          public_url: url,
          school_id: school.id,
          booking_session_id: sessionId,
          report_id: reportId,
          consent_status: "needs_consent_check",
          usage_status: "internal_only",
          is_public: false,
          created_at: report.submittedAt.toISOString(),
          updated_at: new Date().toISOString()
        });
      }
    }
  }

  const existingSchoolKeyById = new Map(
    existingSchools.map((school) => [school.id, canonicalSchoolKey(school.name)])
  );
  const unusedExistingReviews = new Set(existingReviews.map((review) => review.id));
  const reviewRows = [];
  for (const session of sessions) {
    const school = schoolByKey.get(session.schoolKey);
    const sessionId = deterministicUuid("booking-session", session.sourceKey);
    for (const review of session.reviews) {
      const quote = [review.attendeeFeedback, review.presentationFeedback]
        .filter(Boolean)
        .join(" ") || "Feedback submitted without a written comment.";
      const quoteKey = normalize(quote);
      const existing = existingReviews.find((candidate) => {
        if (!unusedExistingReviews.has(candidate.id)) return false;
        if (existingSchoolKeyById.get(candidate.school_id) !== review.schoolKey) return false;
        const existingQuote = normalize(candidate.quote);
        return existingQuote.length >= 16 && (quoteKey.includes(existingQuote) || existingQuote.includes(quoteKey));
      });
      if (existing) unusedExistingReviews.delete(existing.id);
      const ratings = [
        review.attendanceRating,
        review.studentResponseRating,
        review.contentRating,
        review.presenterEnergyRating
      ];
      reviewRows.push({
        id: existing?.id ?? deterministicUuid("school-feedback", review.sourceKey),
        booking_session_id: sessionId,
        presentation_type_id: digitalWellbeing.id,
        school_id: school.id,
        quote,
        attribution: review.contactName || "School feedback",
        rating: average(ratings),
        is_approved: existing?.is_approved ?? false,
        is_public: existing?.is_public ?? false,
        details: {
          studentsCompeted: review.studentsCompeted,
          attendeeFeedback: review.attendeeFeedback,
          attendanceRating: review.attendanceRating,
          studentResponseRating: review.studentResponseRating,
          contentRating: review.contentRating,
          presenterEnergyRating: review.presenterEnergyRating,
          hadEsportsClub: review.hadEsportsClub,
          consideringClub: review.consideringClub,
          mailingListOptIn: review.mailingListOptIn
        },
        created_at: review.submittedAt.toISOString()
      });
    }
  }

  const contactUserRows = contactRows
    .map((contact) => {
      const profile = profilesByEmail.get(normalizedEmail(contact.email));
      if (!profile) return null;
      const key = `${contact.id}|${profile.id}`;
      return {
        id: existingContactUsers.find((link) => `${link.school_contact_id}|${link.user_id}` === key)?.id ?? deterministicUuid("school-contact-user", key),
        school_contact_id: contact.id,
        user_id: profile.id,
        created_at: new Date().toISOString()
      };
    })
    .filter(Boolean);

  const summary = {
    mode: options.apply ? "APPLY" : "DRY RUN",
    sourceRows: {
      bookings: source.bookings.length,
      ambassadorReports: source.ambassadorFeedback.length,
      schoolFeedback: source.schoolFeedback.length
    },
    excludedClearTestBookings: bookingResult.excluded,
    invalidRows: {
      bookings: bookingResult.invalid,
      ambassadorReports: ambassadorResult.invalid,
      schoolFeedback: schoolResult.invalid
    },
    derived: {
      schools: schoolRows.length,
      existingSchoolsMatched: schoolRows.filter((row) => existingSchools.some((existing) => existing.id === row.id)).length,
      newSchools: schoolRows.filter((row) => !existingSchools.some((existing) => existing.id === row.id)).length,
      contacts: contactRows.length,
      bookingSessionsFromExport: bookingResult.parsed.length,
      inferredCompletedSessions: sessions.filter((session) => session.sourceType === "inferred").length,
      inferredSessionSources: sessions
        .filter((session) => session.sourceType === "inferred")
        .map((session) => ({
          school: session.schoolName,
          delivered: dateKey(session.startsAt),
          from: session.report ? "ambassador report" : "school feedback"
        })),
      statuses: Object.fromEntries([...new Set(sessionRows.map((row) => row.status))].map((status) => [status, sessionRows.filter((row) => row.status === status).length])),
      ambassadorReports: reportRows.length,
      ambassadorReportMedia: mediaRows.length,
      reportsWithMedia: new Set(mediaRows.map((row) => row.report_id)).size,
      reportsMatchedToBookingExport: sessions.filter(
        (session) => session.sourceType === "booking" && session.report
      ).length,
      reportsWithInferredSessions: sessions.filter(
        (session) => session.sourceType === "inferred" && session.report
      ).length,
      linkedAmbassadorReports: reportRows.filter((row) => row.ambassador_profile_id).length,
      unlinkedPresenterNames: [...new Set(reportRows.filter((row) => !row.ambassador_profile_id).map((row) => row.presenter_name))].sort(),
      schoolFeedback: reviewRows.length,
      schoolFeedbackMatchedToBookingExport: sessions
        .filter((session) => session.sourceType === "booking")
        .reduce((total, session) => total + session.reviews.length, 0),
      schoolFeedbackMatchedToInferredSessions: sessions
        .filter((session) => session.sourceType === "inferred")
        .reduce((total, session) => total + session.reviews.length, 0),
      existingPublicFeedbackMatched: reviewRows.filter((row) => existingReviews.some((existing) => existing.id === row.id)).length,
      existingSchoolAccountsLinkedByEmail: contactUserRows.length
    },
    safeguards: {
      paymentOrBankFieldsImported: false,
      mediaImported: true,
      newFeedbackPublishedAutomatically: false,
      idempotentDeterministicIds: true
    },
    requiredMigrationReady: historicalReportSchemaReady
  };

  console.log(JSON.stringify(summary, null, 2));

  if (!options.apply) return;

  if (!historicalReportSchemaReady) {
    throw new Error(
      "Migration 0025_historical_ambassador_report_linking.sql must be applied before this import. No rows were written."
    );
  }

  await upsertBatches(admin, "schools", schoolRows);
  await upsertBatches(admin, "school_contacts", contactRows);
  await upsertBatches(admin, "school_contact_users", contactUserRows);
  await upsertBatches(admin, "booking_requests", requestRows);
  await upsertBatches(admin, "booking_sessions", sessionRows);
  await upsertBatches(admin, "ambassador_reports", reportRows);
  await upsertBatches(admin, "media_library", mediaRows);
  await upsertBatches(admin, "presentation_reviews", reviewRows);
  await upsertBatches(admin, "booking_status_history", statusRows);
  await upsertBatches(admin, "booking_activity_logs", activityRows);

  console.log("Historical import completed successfully.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});

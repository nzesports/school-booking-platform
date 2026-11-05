import { createHash, randomBytes } from "node:crypto";
import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { formatLongDate, formatTime } from "@/lib/utils";

export type PaymentDetails = {
  paymentId: string;
  invoiceNumber: string;
  invoiceGeneratedAt: string;
  ambassadorName: string;
  ambassadorUserId?: string;
  bankAccountName: string;
  bankAccountNumber: string;
  gstNumber?: string;
  amountCents: number;
  baseAmountCents: number;
  sourcingBonusCents: number;
  additionalSessionCents: number;
  extraAmountCents: number;
  paymentNote?: string;
  paymentTier?: string | null;
  reviewRequired?: boolean;
  currency: string;
  bookingSessionId: string;
  // Every session the payment covers (see loadCoveredSessions), as one
  // plain-text line. The amount breakdown is not part of it.
  sessionDescription: string;
};

export type PaymentSettings = {
  financeEmail: string;
  // Paid for each delivered session that meets the attendee threshold.
  defaultAmountCents: number;
  // Paid instead when the ambassador also sourced the booking themselves.
  sourcedAmountCents: number;
  eligibleAttendeeThreshold: number;
  currency: string;
};

const fallbackPaymentSettings: PaymentSettings = {
  financeEmail: "info@esf.nz",
  defaultAmountCents: 25000,
  sourcedAmountCents: 30000,
  eligibleAttendeeThreshold: 100,
  currency: "NZD"
};

// Hard cap on a staff top-up; the approval RPC enforces the same limit.
export { MAX_EXTRA_PAYMENT_CENTS } from "@/lib/payment-breakdown";

const FINANCE_TOKEN_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000;

// A finance send still "pending" after this long is treated as interrupted
// and can be claimed again (claim_finance_payment_email, 0054).
export const FINANCE_EMAIL_CLAIM_STALE_SECONDS = 10 * 60;

// Deterministic and stored at approval time, so the bank reference remains
// stable across email retries and profile edits.
export function generateInvoiceNumber(paymentId: string, approvedAt: Date) {
  const fragment = paymentId.replace(/-/g, "").slice(0, 8).toUpperCase();
  // The server runs in UTC; invoices are numbered by the New Zealand year.
  const year = new Intl.DateTimeFormat("en-NZ", {
    timeZone: "Pacific/Auckland",
    year: "numeric"
  }).format(approvedAt);
  return `INV-${year}-${fragment}`;
}

export function hashFinanceConfirmationToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function createFinanceConfirmationToken(now = new Date()) {
  const token = randomBytes(32).toString("base64url");

  return {
    token,
    tokenHash: hashFinanceConfirmationToken(token),
    expiresAt: new Date(now.getTime() + FINANCE_TOKEN_LIFETIME_MS).toISOString()
  };
}

export function isFinanceConfirmationToken(value: string) {
  return /^[A-Za-z0-9_-]{43}$/.test(value);
}

export function isFinanceConfirmationExpired(expiresAt?: string | null, now = new Date()) {
  return !expiresAt || new Date(expiresAt).getTime() <= now.getTime();
}

export async function getPaymentSettings(): Promise<PaymentSettings> {
  const admin = createAdminClient();

  if (!admin) {
    return fallbackPaymentSettings;
  }

  const { data } = await admin
    .from("settings")
    .select("setting_value")
    .eq("setting_key", "payments")
    .maybeSingle();
  const value = (data?.setting_value ?? {}) as Record<string, unknown>;

  return {
    financeEmail:
      typeof value.financeEmail === "string" && value.financeEmail.length > 0
        ? value.financeEmail
        : fallbackPaymentSettings.financeEmail,
    defaultAmountCents:
      typeof value.defaultAmountCents === "number"
        ? value.defaultAmountCents
        : fallbackPaymentSettings.defaultAmountCents,
    sourcedAmountCents:
      typeof value.sourcedAmountCents === "number"
        ? value.sourcedAmountCents
        : fallbackPaymentSettings.sourcedAmountCents,
    eligibleAttendeeThreshold:
      typeof value.eligibleAttendeeThreshold === "number"
        ? value.eligibleAttendeeThreshold
        : fallbackPaymentSettings.eligibleAttendeeThreshold,
    currency:
      typeof value.currency === "string" && value.currency.length > 0
        ? value.currency
        : fallbackPaymentSettings.currency
  };
}

type AdminClient = NonNullable<ReturnType<typeof createAdminClient>>;

type CoveredSession = {
  id: string;
  booking_request_id: string | null;
  school_id: string | null;
  presentation_type_id: string | null;
  assigned_ambassador_id: string | null;
  starts_at: string;
  ends_at: string;
};

// Written by submit_ambassador_report_group (0054) in the same transaction as
// the report and its payment, one row per covered sibling session. The
// app's later "report.submitted" log is written after commit and is not used.
const COVERAGE_ACTION = "report.covered_by_same_day_report";
const SESSION_COLUMNS =
  "id, booking_request_id, school_id, presentation_type_id, assigned_ambassador_id, starts_at, ends_at";

class CoverageError extends Error {}

const nzDay = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Pacific/Auckland",
  year: "numeric",
  month: "2-digit",
  day: "2-digit"
});

function failIf(condition: unknown, reason: string) {
  if (condition) {
    throw new CoverageError(reason);
  }
}

// The sessions one payment pays for: its own (anchor) session plus exactly
// the siblings recorded as covered by the matching report. Nothing is
// inferred from same-day neighbours, amounts or other sessions. A payment
// whose report has no coverage record (single session, or from before 0054)
// covers only its anchor. Any query error, duplicate report or recorded
// coverage that doesn't line up throws, so no partial or misattributed
// invoice is sent.
async function loadCoveredSessions(
  admin: AdminClient,
  anchorSessionId: string,
  ambassadorProfileId: string | null
): Promise<CoveredSession[]> {
  const { data: anchor, error: anchorError } = await admin
    .from("booking_sessions")
    .select(SESSION_COLUMNS)
    .eq("id", anchorSessionId)
    .maybeSingle();

  failIf(anchorError, "the paid session could not be loaded");
  failIf(!anchor, "the paid session no longer exists");
  const anchorSession = anchor as CoveredSession;

  if (!ambassadorProfileId) {
    return [anchorSession];
  }

  const { data: reports, error: reportError } = await admin
    .from("ambassador_reports")
    .select("id, booking_session_id, ambassador_profile_id")
    .eq("booking_session_id", anchorSessionId)
    .eq("ambassador_profile_id", ambassadorProfileId)
    .limit(2);

  failIf(reportError, "the report could not be loaded");
  const reportRows = (reports ?? []) as Array<{ id: string; booking_session_id: string; ambassador_profile_id: string }>;
  failIf(reportRows.length > 1, "more than one report matches the paid session");

  if (reportRows.length === 0) {
    return [anchorSession];
  }

  const report = reportRows[0];
  failIf(
    report.booking_session_id !== anchorSessionId || report.ambassador_profile_id !== ambassadorProfileId,
    "the report does not belong to the paid session and ambassador"
  );

  const { data: logs, error: logError } = await admin
    .from("booking_activity_logs")
    .select("id, booking_request_id, booking_session_id, details")
    .eq("action", COVERAGE_ACTION)
    .eq("details->>report_id", report.id);

  failIf(logError, "the report's coverage record could not be loaded");
  const coverage = (logs ?? []) as Array<{
    booking_request_id: string | null;
    booking_session_id: string | null;
    details: { report_id?: unknown; reported_session_id?: unknown } | null;
  }>;

  if (coverage.length === 0) {
    return [anchorSession];
  }

  const siblingIds = new Set<string>();

  for (const entry of coverage) {
    failIf(entry.details?.report_id !== report.id, "a coverage record names another report");
    failIf(entry.details?.reported_session_id !== anchorSessionId, "a coverage record names another paid session");
    failIf(!entry.booking_session_id || entry.booking_session_id === anchorSessionId, "a coverage record has no covered session");
    // Duplicate rows for one sibling describe the same session once.
    siblingIds.add(entry.booking_session_id as string);
  }

  const { data: siblings, error: siblingError } = await admin
    .from("booking_sessions")
    .select(SESSION_COLUMNS)
    .in("id", [...siblingIds]);

  failIf(siblingError, "the covered sessions could not be loaded");
  const siblingRows = (siblings ?? []) as CoveredSession[];
  failIf(
    siblingRows.length !== siblingIds.size || siblingRows.some((row) => !siblingIds.has(row.id)),
    "a covered session no longer exists"
  );

  const covered = [anchorSession, ...siblingRows];
  failIf(
    covered.some((row) => !isValidTime(row.starts_at) || !isValidTime(row.ends_at)),
    "a covered session has no valid time"
  );
  const anchorDay = nzDay.format(new Date(anchorSession.starts_at));

  for (const row of covered) {
    failIf(row.school_id !== anchorSession.school_id, "a covered session belongs to another school");
    failIf(row.assigned_ambassador_id !== ambassadorProfileId, "a covered session is not the paid ambassador's");
    failIf(nzDay.format(new Date(row.starts_at)) !== anchorDay, "a covered session is on another New Zealand day");
  }

  return covered.sort(
    (left, right) =>
      new Date(left.starts_at).getTime() - new Date(right.starts_at).getTime() || left.id.localeCompare(right.id)
  );
}

function isValidTime(value: string | null | undefined): value is string {
  return Boolean(value) && !Number.isNaN(new Date(value as string).getTime());
}

// NZ date and start–end time; parts the row doesn't have are left out.
function sessionWhen(session: CoveredSession) {
  if (!isValidTime(session.starts_at)) {
    return null;
  }

  const end = isValidTime(session.ends_at) ? `–${formatTime(session.ends_at)}` : "";
  return `${formatLongDate(session.starts_at)}, ${formatTime(session.starts_at)}${end}`;
}

// One line, no markup (both email paths escape it):
//   "Digital Wellbeing — Rangitoto College — 15 Sep 2026, 9:00 am–10:00 am"
//   "Rangitoto College — 2 sessions: 1. Digital Wellbeing, 15 Sep 2026,
//    9:00 am–10:00 am; 2. Understanding Esports, 15 Sep 2026, 10:00 am–11:00 am"
// Money is described separately, once, by describePaymentAmount.
function describeCoveredSessions(
  sessions: CoveredSession[],
  titles: Map<string, string>,
  schoolName: string
) {
  const title = (session: CoveredSession) =>
    (session.presentation_type_id && titles.get(session.presentation_type_id)) || "Presentation session";

  if (sessions.length === 1) {
    return [title(sessions[0]), schoolName, sessionWhen(sessions[0])].filter(Boolean).join(" — ");
  }

  return `${schoolName} — ${sessions.length} sessions: ${sessions
    .map((session, index) => [`${index + 1}. ${title(session)}`, sessionWhen(session)].filter(Boolean).join(", "))
    .join("; ")}`;
}

export async function loadPaymentDetails(paymentId: string): Promise<PaymentDetails | null> {
  const admin = createAdminClient();

  if (!admin) {
    return null;
  }

  const { data: payment } = await admin
    .from("payments")
    .select(
      "id, booking_session_id, ambassador_profile_id, amount_cents, base_amount_cents, sourcing_bonus_cents, additional_session_cents, extra_amount_cents, payment_note, currency, invoice_number, invoice_generated_at, bank_account_name, bank_account_number, gst_number, payment_tier, review_required"
    )
    .eq("id", paymentId)
    .maybeSingle();

  if (
    !payment?.invoice_number ||
    !payment.bank_account_name ||
    !payment.bank_account_number
  ) {
    return null;
  }

  let sessions: CoveredSession[];

  try {
    sessions = await loadCoveredSessions(
      admin,
      payment.booking_session_id as string,
      (payment.ambassador_profile_id as string | null) ?? null
    );
  } catch (error) {
    if (error instanceof CoverageError) {
      console.error("[payments] Invoice not built: covered sessions don't line up", {
        paymentId,
        reason: error.message
      });
      return null;
    }

    throw error;
  }

  const anchor = sessions.find((session) => session.id === payment.booking_session_id) ?? sessions[0];
  const presentationIds = [
    ...new Set(sessions.map((session) => session.presentation_type_id).filter((id): id is string => Boolean(id)))
  ];

  const [{ data: ambassadorProfile, error: profileError }, { data: school, error: schoolError }, { data: presentations, error: presentationError }] =
    await Promise.all([
      payment.ambassador_profile_id
        ? admin
            .from("ambassador_profiles")
            .select("id, user_id")
            .eq("id", payment.ambassador_profile_id as string)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      anchor.school_id
        ? admin.from("schools").select("name").eq("id", anchor.school_id).maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      presentationIds.length
        ? admin.from("presentation_types").select("id, title").in("id", presentationIds)
        : Promise.resolve({ data: [], error: null })
    ]);

  if (profileError || schoolError || presentationError) {
    console.error("[payments] Invoice not built: a lookup failed", { paymentId });
    return null;
  }

  const { data: ambassadorUser } = ambassadorProfile?.user_id
    ? await admin
        .from("profiles")
        .select("id, full_name")
        .eq("id", ambassadorProfile.user_id as string)
        .maybeSingle()
    : { data: null };
  const titles = new Map(
    ((presentations ?? []) as Array<{ id: string; title: string | null }>)
      .filter((row) => row.title)
      .map((row) => [row.id, row.title as string])
  );

  return {
    paymentId: payment.id as string,
    invoiceNumber: payment.invoice_number as string,
    invoiceGeneratedAt:
      (payment.invoice_generated_at as string | null) ?? new Date().toISOString(),
    ambassadorName: (ambassadorUser?.full_name as string | undefined) ?? "Ambassador",
    ambassadorUserId: (ambassadorProfile?.user_id as string | undefined) ?? undefined,
    bankAccountName: payment.bank_account_name as string,
    bankAccountNumber: payment.bank_account_number as string,
    gstNumber: (payment.gst_number as string | null) ?? undefined,
    amountCents: Number(payment.amount_cents ?? 0),
    baseAmountCents: Number(payment.base_amount_cents ?? payment.amount_cents ?? 0),
    sourcingBonusCents: Number(payment.sourcing_bonus_cents ?? 0),
    additionalSessionCents: Number(payment.additional_session_cents ?? 0),
    extraAmountCents: Number(payment.extra_amount_cents ?? 0),
    paymentNote: (payment.payment_note as string | null) ?? undefined,
    // Wording for describePaymentAmount: the tier's second-session label and
    // the staff-chosen add-on.
    paymentTier: (payment.payment_tier as string | null) ?? null,
    reviewRequired: Boolean(payment.review_required),
    currency: (payment.currency as string | null) ?? "NZD",
    bookingSessionId: payment.booking_session_id as string,
    sessionDescription: describeCoveredSessions(sessions, titles, (school?.name as string | undefined) ?? "School")
  };
}

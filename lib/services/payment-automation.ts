import { createHash, randomBytes } from "node:crypto";
import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { formatLongDate } from "@/lib/utils";

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
  currency: string;
  bookingSessionId: string;
  sessionDescription: string;
};

export type PaymentSettings = {
  financeEmail: string;
  defaultAmountCents: number;
  currency: string;
};

const fallbackPaymentSettings: PaymentSettings = {
  financeEmail: "info@esf.nz",
  defaultAmountCents: 25000,
  currency: "NZD"
};

const FINANCE_TOKEN_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000;

// Deterministic and stored at approval time, so the bank reference remains
// stable across email retries and profile edits.
export function generateInvoiceNumber(paymentId: string, approvedAt: Date) {
  const fragment = paymentId.replace(/-/g, "").slice(0, 8).toUpperCase();
  return `INV-${approvedAt.getFullYear()}-${fragment}`;
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
    currency:
      typeof value.currency === "string" && value.currency.length > 0
        ? value.currency
        : fallbackPaymentSettings.currency
  };
}

export async function loadPaymentDetails(paymentId: string): Promise<PaymentDetails | null> {
  const admin = createAdminClient();

  if (!admin) {
    return null;
  }

  const { data: payment } = await admin
    .from("payments")
    .select(
      "id, booking_session_id, ambassador_profile_id, amount_cents, currency, invoice_number, invoice_generated_at, bank_account_name, bank_account_number, gst_number"
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

  const [{ data: session }, { data: ambassadorProfile }] = await Promise.all([
    admin
      .from("booking_sessions")
      .select("id, school_id, presentation_type_id, starts_at")
      .eq("id", payment.booking_session_id as string)
      .maybeSingle(),
    payment.ambassador_profile_id
      ? admin
          .from("ambassador_profiles")
          .select("id, user_id")
          .eq("id", payment.ambassador_profile_id as string)
          .maybeSingle()
      : Promise.resolve({ data: null })
  ]);

  const [{ data: school }, { data: presentation }, { data: ambassadorUser }] = await Promise.all([
    session?.school_id
      ? admin.from("schools").select("name").eq("id", session.school_id as string).maybeSingle()
      : Promise.resolve({ data: null }),
    session?.presentation_type_id
      ? admin
          .from("presentation_types")
          .select("title")
          .eq("id", session.presentation_type_id as string)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    ambassadorProfile?.user_id
      ? admin
          .from("profiles")
          .select("id, full_name")
          .eq("id", ambassadorProfile.user_id as string)
          .maybeSingle()
      : Promise.resolve({ data: null })
  ]);

  const sessionParts = [
    (presentation?.title as string | undefined) ?? "Presentation session",
    (school?.name as string | undefined) ?? "School",
    session?.starts_at ? formatLongDate(session.starts_at as string) : null
  ].filter(Boolean);

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
    currency: (payment.currency as string | null) ?? "NZD",
    bookingSessionId: payment.booking_session_id as string,
    sessionDescription: sessionParts.join(" — ")
  };
}

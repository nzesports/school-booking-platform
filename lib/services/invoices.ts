import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

import { config } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatCurrency, formatLongDate } from "@/lib/utils";

export type InvoiceDetails = {
  paymentId: string;
  invoiceNumber: string;
  invoiceDate: string;
  ambassadorName: string;
  ambassadorEmail?: string;
  ambassadorUserId?: string;
  bankAccountNumber?: string;
  gstNumber?: string;
  notes?: string;
  amountCents: number;
  currency: string;
  bookingSessionId: string;
  sessionDescription: string;
  status: string;
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

// pdf-lib's standard Helvetica only encodes WinAnsi; te reo macrons (ā, ō, ...)
// in school names would throw, so fold text to compatible characters first.
function toWinAnsiSafe(text: string) {
  return text
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/[^\x20-\x7e\xa0-\xff]/g, "?");
}

// Deterministic and stored at submission time, so the number never changes
// even though the PDF is regenerated on demand.
export function generateInvoiceNumber(paymentId: string, submittedAt: Date) {
  const fragment = paymentId.replace(/-/g, "").slice(0, 8).toUpperCase();
  return `INV-${submittedAt.getFullYear()}-${fragment}`;
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

export async function loadInvoiceDetails(paymentId: string): Promise<InvoiceDetails | null> {
  const admin = createAdminClient();

  if (!admin) {
    return null;
  }

  const { data: payment } = await admin
    .from("payments")
    .select(
      "id, booking_session_id, ambassador_profile_id, amount_cents, currency, status, invoice_number, invoice_submitted_at, bank_account_number, gst_number, invoice_notes"
    )
    .eq("id", paymentId)
    .maybeSingle();

  if (!payment?.invoice_number) {
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
          .select("id, full_name, email")
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
    invoiceDate: (payment.invoice_submitted_at as string | null) ?? new Date().toISOString(),
    ambassadorName: (ambassadorUser?.full_name as string | undefined) ?? "Ambassador",
    ambassadorEmail: (ambassadorUser?.email as string | undefined) ?? undefined,
    ambassadorUserId: (ambassadorProfile?.user_id as string | undefined) ?? undefined,
    bankAccountNumber: (payment.bank_account_number as string | null) ?? undefined,
    gstNumber: (payment.gst_number as string | null) ?? undefined,
    notes: (payment.invoice_notes as string | null) ?? undefined,
    amountCents: Number(payment.amount_cents ?? 0),
    currency: (payment.currency as string | null) ?? "NZD",
    bookingSessionId: payment.booking_session_id as string,
    sessionDescription: sessionParts.join(" — "),
    status: payment.status as string
  };
}

export async function buildInvoicePdf(details: InvoiceDetails): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([595.28, 841.89]); // A4 portrait in points
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  const navy = rgb(0.016, 0.06, 0.29);
  const soft = rgb(0.35, 0.39, 0.46);
  const green = rgb(0.09, 0.66, 0.23);
  const marginX = 56;
  let cursorY = 780;

  const drawText = (
    text: string,
    options: { size?: number; boldFace?: boolean; color?: ReturnType<typeof rgb>; x?: number } = {}
  ) => {
    page.drawText(toWinAnsiSafe(text), {
      x: options.x ?? marginX,
      y: cursorY,
      size: options.size ?? 11,
      font: options.boldFace ? bold : font,
      color: options.color ?? navy
    });
  };

  drawText(details.gstNumber ? "TAX INVOICE" : "INVOICE", { size: 26, boldFace: true });
  cursorY -= 22;
  drawText(details.invoiceNumber, { size: 12, color: green, boldFace: true });
  cursorY -= 16;
  drawText(`Invoice date: ${formatLongDate(details.invoiceDate)}`, { size: 10, color: soft });

  cursorY -= 40;
  drawText("From", { size: 9, color: soft, boldFace: true });
  drawText("To", { size: 9, color: soft, boldFace: true, x: 330 });
  cursorY -= 16;
  drawText(details.ambassadorName, { boldFace: true });
  drawText(config.brevoSenderName ?? "NZ Esports", { boldFace: true, x: 330 });
  cursorY -= 15;
  if (details.ambassadorEmail) {
    drawText(details.ambassadorEmail, { size: 10, color: soft });
  }
  drawText(config.brevoSenderEmail ?? "info@esf.nz", { size: 10, color: soft, x: 330 });
  if (details.gstNumber) {
    cursorY -= 15;
    drawText(`GST number: ${details.gstNumber}`, { size: 10, color: soft });
  }

  cursorY -= 44;
  page.drawLine({
    start: { x: marginX, y: cursorY + 26 },
    end: { x: 539, y: cursorY + 26 },
    thickness: 1,
    color: rgb(0.85, 0.88, 0.93)
  });
  drawText("Description", { size: 9, color: soft, boldFace: true });
  drawText("Amount", { size: 9, color: soft, boldFace: true, x: 460 });
  cursorY -= 18;
  drawText(`Presentation delivery — ${details.sessionDescription}`, { size: 10 });
  drawText(formatCurrency(details.amountCents, details.currency), { size: 10, boldFace: true, x: 460 });
  cursorY -= 24;
  page.drawLine({
    start: { x: marginX, y: cursorY + 12 },
    end: { x: 539, y: cursorY + 12 },
    thickness: 1,
    color: rgb(0.85, 0.88, 0.93)
  });
  drawText("Total due", { size: 12, boldFace: true, x: 360 });
  drawText(formatCurrency(details.amountCents, details.currency), {
    size: 12,
    boldFace: true,
    color: green,
    x: 460
  });

  cursorY -= 48;
  drawText("Payment details", { size: 9, color: soft, boldFace: true });
  cursorY -= 16;
  drawText(`Bank account: ${details.bankAccountNumber ?? "Provided separately"}`, { size: 10 });
  cursorY -= 15;
  drawText(`Reference: ${details.invoiceNumber}`, { size: 10 });

  if (details.notes) {
    cursorY -= 32;
    drawText("Notes", { size: 9, color: soft, boldFace: true });
    cursorY -= 16;
    // pdf-lib has no text wrapping; chunk the notes into fixed-width lines.
    const words = details.notes.split(/\s+/);
    let line = "";
    for (const word of words) {
      if ((line + " " + word).trim().length > 90) {
        drawText(line.trim(), { size: 10, color: soft });
        cursorY -= 13;
        line = word;
        if (cursorY < 60) {
          break;
        }
      } else {
        line = `${line} ${word}`;
      }
    }
    if (line.trim() && cursorY >= 60) {
      drawText(line.trim(), { size: 10, color: soft });
    }
  }

  page.drawText(`Generated by ${config.brevoSenderName ?? "NZ Esports"} school booking platform`, {
    x: marginX,
    y: 40,
    size: 8,
    font,
    color: soft
  });

  return doc.save();
}

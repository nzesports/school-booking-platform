"use server";

import { revalidatePath, updateTag } from "next/cache";
import { redirect } from "next/navigation";

import { PLATFORM_DATA_TAG } from "@/lib/services/cache-tags";
import { notifyUser } from "@/lib/services/notifications";
import {
  hashFinanceConfirmationToken,
  isFinanceConfirmationToken
} from "@/lib/services/payment-automation";
import { createAdminClient } from "@/lib/supabase/admin";

function financePaymentPath(token: string, state: string) {
  return `/finance/payment/${encodeURIComponent(token)}?state=${encodeURIComponent(state)}`;
}

export async function confirmFinancePaymentAction(formData: FormData) {
  const token = String(formData.get("token") ?? "");

  if (!isFinanceConfirmationToken(token)) {
    redirect(financePaymentPath(token, "invalid"));
  }

  const admin = createAdminClient();

  if (!admin) {
    redirect(financePaymentPath(token, "unavailable"));
  }

  const tokenHash = hashFinanceConfirmationToken(token);
  const { data: payment } = await admin
    .from("payments")
    .select(
      "id, booking_session_id, ambassador_profile_id, status, invoice_number, finance_confirmation_expires_at, sent_to_email"
    )
    .eq("finance_confirmation_token_hash", tokenHash)
    .maybeSingle();

  if (!payment) {
    redirect(financePaymentPath(token, "invalid"));
  }

  if (payment.status === "paid") {
    redirect(financePaymentPath(token, "already-paid"));
  }

  const now = new Date();

  if (
    !payment.finance_confirmation_expires_at ||
    new Date(payment.finance_confirmation_expires_at as string).getTime() <= now.getTime()
  ) {
    redirect(financePaymentPath(token, "expired"));
  }

  const paidAt = now.toISOString();
  const { data: updatedPayment, error } = await admin
    .from("payments")
    .update({
      status: "paid",
      paid_at: paidAt,
      finance_confirmed_at: paidAt,
      finance_confirmed_email: payment.sent_to_email,
      updated_by: null
    })
    .eq("id", payment.id)
    .eq("status", "approved")
    .eq("finance_confirmation_token_hash", tokenHash)
    .gt("finance_confirmation_expires_at", paidAt)
    .select("id")
    .maybeSingle();

  if (error || !updatedPayment) {
    const { data: latestPayment } = await admin
      .from("payments")
      .select("status")
      .eq("id", payment.id)
      .maybeSingle();

    redirect(
      financePaymentPath(token, latestPayment?.status === "paid" ? "already-paid" : "failed")
    );
  }

  const { data: ambassadorProfile } = payment.ambassador_profile_id
    ? await admin
        .from("ambassador_profiles")
        .select("user_id")
        .eq("id", payment.ambassador_profile_id as string)
        .maybeSingle()
    : { data: null };

  await Promise.all([
    admin
      .from("booking_sessions")
      .update({ payment_status: "paid" })
      .eq("id", payment.booking_session_id),
    admin.from("booking_activity_logs").insert({
      booking_session_id: payment.booking_session_id,
      action: "payment.confirmed_by_finance",
      actor_id: null,
      actor_type: "finance",
      details: {
        invoice_number: payment.invoice_number,
        finance_email: payment.sent_to_email,
        confirmed_at: paidAt
      }
    }),
    admin.from("audit_logs").insert({
      actor_id: null,
      action: "payment.confirmed_by_finance",
      entity_type: "payment",
      entity_id: payment.id,
      new_value: {
        status: "paid",
        paid_at: paidAt,
        finance_email: payment.sent_to_email
      }
    })
  ]);

  if (ambassadorProfile?.user_id) {
    await notifyUser(ambassadorProfile.user_id as string, {
      title: "Payment made",
      body: payment.invoice_number
        ? `Finance has marked invoice ${payment.invoice_number} as paid.`
        : "Finance has marked your session payment as paid.",
      type: "payment_paid",
      relatedUrl: "/ambassador/earnings"
    }).catch(() => {});
  }

  updateTag(PLATFORM_DATA_TAG);
  revalidatePath("/ambassador");
  revalidatePath("/staff");
  revalidatePath("/admin");
  redirect(financePaymentPath(token, "confirmed"));
}

import { NextRequest, NextResponse } from "next/server";

import { getAuthenticatedPortalUser, portalPathForRole } from "@/lib/services/auth";
import { buildInvoicePdf, loadInvoiceDetails } from "@/lib/services/invoices";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ paymentId: string }> }
) {
  const user = await getAuthenticatedPortalUser();

  if (!user) {
    return NextResponse.redirect(new URL("/login?error=auth-required", request.url));
  }

  if (user.status !== "active") {
    return NextResponse.redirect(new URL("/login?error=account-inactive", request.url));
  }

  const admin = createAdminClient();

  if (!admin) {
    return NextResponse.json({ error: "Supabase admin access is unavailable." }, { status: 503 });
  }

  const { paymentId } = await params;
  const { data: payment } = await admin
    .from("payments")
    .select("id, invoice_number, ambassador_profile_id")
    .eq("id", paymentId)
    .maybeSingle();

  if (!payment || !payment.invoice_number) {
    return NextResponse.json({ error: "Invoice not found." }, { status: 404 });
  }

  const isStaffLike = user.role === "staff" || user.role === "super_admin";

  if (!isStaffLike) {
    if (user.role !== "ambassador" || user.ambassadorStatus !== "approved") {
      return NextResponse.redirect(new URL(portalPathForRole(user.role), request.url));
    }

    const { data: ambassadorProfile } = await admin
      .from("ambassador_profiles")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!ambassadorProfile || ambassadorProfile.id !== payment.ambassador_profile_id) {
      return NextResponse.redirect(new URL(portalPathForRole(user.role), request.url));
    }
  }

  const details = await loadInvoiceDetails(payment.id as string);

  if (!details) {
    return NextResponse.json({ error: "Invoice not found." }, { status: 404 });
  }

  const pdfBytes = await buildInvoicePdf(details);

  return new NextResponse(Buffer.from(pdfBytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${details.invoiceNumber}.pdf"`
    }
  });
}

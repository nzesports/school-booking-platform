import type { ReactNode } from "react";
import { ArrowRight, CircleDollarSign, Download, Hourglass, Mail, ReceiptText } from "lucide-react";

import { markPaymentPaidAction, sendInvoiceToFinanceAction } from "@/app/portal/actions";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/ui/status-badge";
import type { BookingSessionView, PaymentRecord } from "@/lib/domain/types";
import { cn, formatCurrency, formatShortDate } from "@/lib/utils";

export function getPaymentsNotice(
  searchParams: Record<string, string | string[] | undefined>
): { tone: "success" | "error"; message: string } | null {
  const read = (key: string) => {
    const value = searchParams[key];
    return Array.isArray(value) ? value[0] : value;
  };

  if (read("sent") === "invoice") {
    return {
      tone: "success",
      message: "Invoice sent to finance and the ambassador has been notified."
    };
  }

  if (read("paid") === "1") {
    return { tone: "success", message: "Payment marked as paid and the ambassador notified." };
  }

  const error = read("error");

  if (error === "invoice-email-failed") {
    return {
      tone: "error",
      message: "The invoice email could not be sent. The invoice is still queued — try again."
    };
  }

  if (error === "invalid-finance-email") {
    return { tone: "error", message: "Check the finance email and CC addresses, then try again." };
  }

  if (error === "invoice-not-ready") {
    return { tone: "error", message: "That payment doesn't have a submitted invoice to send yet." };
  }

  if (error === "payment-not-payable") {
    return { tone: "error", message: "That payment has already been marked as paid." };
  }

  if (
    error === "payment-not-found" ||
    error === "payment-update-failed" ||
    error === "invoice-update-failed" ||
    error === "invalid-payment"
  ) {
    return { tone: "error", message: "The payment could not be updated. Please try again." };
  }

  return null;
}

export function PaymentsWorkspace({
  basePath,
  payments,
  sessions,
  financeEmail,
  notice
}: {
  basePath: string;
  payments: PaymentRecord[];
  sessions: BookingSessionView[];
  financeEmail: string;
  notice?: { tone: "success" | "error"; message: string } | null;
}) {
  const sessionsById = new Map(sessions.map((session) => [session.id, session]));
  const sessionLabel = (payment: PaymentRecord) => {
    const session = sessionsById.get(payment.bookingSessionId);
    return session
      ? `${session.presentationTitle} · ${session.schoolName} · ${formatShortDate(session.startsAt)}`
      : payment.bookingSessionId;
  };
  const returnTo = `${basePath}/payments`;

  const awaitingInvoice = payments.filter((payment) => payment.status === "pending");
  const invoiceReceived = payments.filter((payment) => payment.status === "invoiced");
  const submittedForPayment = payments.filter(
    (payment) => payment.status === "submitted_for_payment"
  );
  const recentlyPaid = payments
    .filter((payment) => payment.status === "paid")
    .sort(
      (left, right) =>
        new Date(right.paidAt ?? right.createdAt).getTime() -
        new Date(left.paidAt ?? left.createdAt).getTime()
    )
    .slice(0, 10);

  return (
    <div className="grid gap-6">
      {notice ? (
        <Card
          className={cn(
            "rounded-[24px] px-5 py-4 text-sm font-semibold",
            notice.tone === "error"
              ? "border-[#f2c6c6] bg-[#fff6f6] text-[#9d2424]"
              : "border-[#b9e2c7] bg-[#f4fbf6] text-[#1d6f35]"
          )}
        >
          {notice.message}
        </Card>
      ) : null}

      <PaymentSection
        icon={<Hourglass className="h-5 w-5 text-[#c07a12]" />}
        kicker="Awaiting invoice"
        title="Waiting on ambassador invoices"
        description="Eligible session payments where the ambassador hasn't submitted an invoice yet."
      >
        {awaitingInvoice.map((payment) => (
          <PaymentRow key={payment.id}>
            <PaymentSummary
              name={payment.ambassadorName}
              detail={sessionLabel(payment)}
              subDetail={payment.eligibilityReason}
            />
            <div className="flex flex-wrap items-center gap-3">
              <p className="text-lg font-semibold tracking-[-0.03em] text-[color:var(--navy)]">
                {formatCurrency(payment.amountCents)}
              </p>
              <StatusBadge value={payment.status} />
              <MarkPaidForm paymentId={payment.id} returnTo={returnTo} />
            </div>
          </PaymentRow>
        ))}
        {awaitingInvoice.length === 0 ? (
          <EmptyRow copy="No payments are waiting on an ambassador invoice." />
        ) : null}
      </PaymentSection>

      <PaymentSection
        icon={<ReceiptText className="h-5 w-5 text-[#246bff]" />}
        kicker="Invoice received"
        title="Ready to send to finance"
        description="Download the generated invoice PDF, confirm the finance address, and send it on. Sending notifies the ambassador that their invoice has been submitted for payment."
      >
        {invoiceReceived.map((payment) => (
          <PaymentRow key={payment.id} highlight>
            <PaymentSummary
              name={payment.ambassadorName}
              detail={sessionLabel(payment)}
              subDetail={`Invoice ${payment.invoiceNumber ?? "pending"} · submitted ${
                payment.invoiceSubmittedAt ? formatShortDate(payment.invoiceSubmittedAt) : "recently"
              }`}
            />
            <div className="flex flex-wrap items-center gap-3">
              <p className="text-lg font-semibold tracking-[-0.03em] text-[color:var(--navy)]">
                {formatCurrency(payment.amountCents)}
              </p>
              <ButtonLink
                href={`/portal/invoice/${payment.id}`}
                variant="secondary"
                className="min-h-[42px] rounded-[16px] px-4 py-2"
              >
                <Download className="h-4 w-4" />
                Invoice PDF
              </ButtonLink>
            </div>
            <form
              action={sendInvoiceToFinanceAction}
              className="mt-4 grid w-full gap-3 border-t border-[color:rgba(4,15,75,0.08)] pt-4 md:grid-cols-[1fr_1fr_auto]"
            >
              <input type="hidden" name="paymentId" value={payment.id} />
              <input type="hidden" name="returnTo" value={returnTo} />
              <label className="grid gap-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--text-soft)]">
                Send to
                <Input name="toEmail" type="email" required defaultValue={financeEmail} />
              </label>
              <label className="grid gap-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--text-soft)]">
                CC (optional, comma-separated)
                <Input name="ccEmail" placeholder="name@example.com" />
              </label>
              <div className="grid items-end">
                <Button type="submit" className="min-h-[48px]">
                  <Mail className="h-4 w-4" />
                  Send to finance
                </Button>
              </div>
            </form>
          </PaymentRow>
        ))}
        {invoiceReceived.length === 0 ? (
          <EmptyRow copy="No submitted invoices are waiting to be sent to finance." />
        ) : null}
      </PaymentSection>

      <PaymentSection
        icon={<Mail className="h-5 w-5 text-[#5d41b8]" />}
        kicker="Submitted for payment"
        title="With finance"
        description="Invoices emailed to finance. Mark them as paid once the payment has gone out — the ambassador is notified."
      >
        {submittedForPayment.map((payment) => (
          <PaymentRow key={payment.id}>
            <PaymentSummary
              name={payment.ambassadorName}
              detail={sessionLabel(payment)}
              subDetail={`Invoice ${payment.invoiceNumber ?? ""} sent to ${payment.sentToEmail ?? "finance"}${
                payment.sentToFinanceAt ? ` on ${formatShortDate(payment.sentToFinanceAt)}` : ""
              }`}
            />
            <div className="flex flex-wrap items-center gap-3">
              <p className="text-lg font-semibold tracking-[-0.03em] text-[color:var(--navy)]">
                {formatCurrency(payment.amountCents)}
              </p>
              <ButtonLink
                href={`/portal/invoice/${payment.id}`}
                variant="ghost"
                className="min-h-[42px] rounded-[16px] px-3 py-2"
              >
                <Download className="h-4 w-4" />
                PDF
              </ButtonLink>
              <MarkPaidForm paymentId={payment.id} returnTo={returnTo} emphasized />
            </div>
          </PaymentRow>
        ))}
        {submittedForPayment.length === 0 ? (
          <EmptyRow copy="Nothing is currently with finance." />
        ) : null}
      </PaymentSection>

      <PaymentSection
        icon={<CircleDollarSign className="h-5 w-5 text-[color:var(--green)]" />}
        kicker="Paid"
        title="Recently completed payments"
        description="The most recent payments confirmed as paid."
      >
        {recentlyPaid.map((payment) => (
          <PaymentRow key={payment.id}>
            <PaymentSummary
              name={payment.ambassadorName}
              detail={sessionLabel(payment)}
              subDetail={`${payment.invoiceNumber ? `Invoice ${payment.invoiceNumber} · ` : ""}paid ${
                payment.paidAt ? formatShortDate(payment.paidAt) : "recently"
              }`}
            />
            <div className="flex flex-wrap items-center gap-3">
              <p className="text-lg font-semibold tracking-[-0.03em] text-[color:var(--navy)]">
                {formatCurrency(payment.amountCents)}
              </p>
              <StatusBadge value={payment.status} />
              {payment.invoiceNumber ? (
                <ButtonLink
                  href={`/portal/invoice/${payment.id}`}
                  variant="ghost"
                  className="min-h-[42px] rounded-[16px] px-3 py-2"
                >
                  <Download className="h-4 w-4" />
                  PDF
                </ButtonLink>
              ) : null}
            </div>
          </PaymentRow>
        ))}
        {recentlyPaid.length === 0 ? <EmptyRow copy="No payments have been marked as paid yet." /> : null}
      </PaymentSection>
    </div>
  );
}

function PaymentSection({
  icon,
  kicker,
  title,
  description,
  children
}: {
  icon: ReactNode;
  kicker: string;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <Card className="rounded-[34px]">
      <div className="flex items-start gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[linear-gradient(180deg,#f6fbff,#edf7ff)]">
          {icon}
        </div>
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[color:var(--green)]">
            {kicker}
          </p>
          <h2 className="mt-1 text-2xl font-semibold tracking-[-0.03em] text-[color:var(--navy)]">
            {title}
          </h2>
          <p className="mt-1 text-sm leading-6 text-[color:var(--text-soft)]">{description}</p>
        </div>
      </div>
      <div className="mt-5 grid gap-3">{children}</div>
    </Card>
  );
}

function PaymentRow({ children, highlight }: { children: ReactNode; highlight?: boolean }) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-between gap-4 rounded-[24px] border px-5 py-4",
        highlight
          ? "border-[rgba(36,107,255,0.16)] bg-[linear-gradient(135deg,#f6faff,#fbfdff)]"
          : "border-[color:rgba(4,15,75,0.08)] bg-white/92"
      )}
    >
      {children}
    </div>
  );
}

function PaymentSummary({
  name,
  detail,
  subDetail
}: {
  name: string;
  detail: string;
  subDetail?: string;
}) {
  return (
    <div className="min-w-[220px]">
      <p className="font-semibold text-[color:var(--navy)]">{name}</p>
      <p className="mt-0.5 text-sm text-[color:var(--text-soft)]">{detail}</p>
      {subDetail ? <p className="mt-0.5 text-sm text-[color:var(--text-soft)]">{subDetail}</p> : null}
    </div>
  );
}

function MarkPaidForm({
  paymentId,
  returnTo,
  emphasized
}: {
  paymentId: string;
  returnTo: string;
  emphasized?: boolean;
}) {
  return (
    <form action={markPaymentPaidAction}>
      <input type="hidden" name="paymentId" value={paymentId} />
      <input type="hidden" name="returnTo" value={returnTo} />
      <Button
        type="submit"
        variant={emphasized ? "primary" : "secondary"}
        className="min-h-[42px] rounded-[16px] px-4 py-2"
      >
        Mark as paid
        <ArrowRight className="h-4 w-4" />
      </Button>
    </form>
  );
}

function EmptyRow({ copy }: { copy: string }) {
  return (
    <div className="rounded-[22px] border border-dashed border-[color:rgba(4,15,75,0.1)] bg-white/70 px-5 py-6 text-sm text-[color:var(--text-soft)]">
      {copy}
    </div>
  );
}

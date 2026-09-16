import type { ReactNode } from "react";
import { CircleDollarSign, Hourglass, Mail, RefreshCw, TriangleAlert } from "lucide-react";

import { retryFinancePaymentEmailAction } from "@/app/portal/actions";
import { Card } from "@/components/ui/card";
import { PendingSubmitButton } from "@/components/ui/pending-submit-button";
import { StatusBadge } from "@/components/ui/status-badge";
import type { BookingSessionView, PaymentRecord } from "@/lib/domain/types";
import { isFinanceConfirmationExpired } from "@/lib/services/payment-automation";
import { cn, formatCurrency, formatShortDate } from "@/lib/utils";

export function getPaymentsNotice(
  searchParams: Record<string, string | string[] | undefined>
): { tone: "success" | "error"; message: string } | null {
  const read = (key: string) => {
    const value = searchParams[key];
    return Array.isArray(value) ? value[0] : value;
  };

  if (read("sent") === "finance-email") {
    return { tone: "success", message: "The payment email was sent to finance." };
  }

  const error = read("error");

  if (error === "invoice-email-failed") {
    return {
      tone: "error",
      message: "The finance email still could not be sent. The approval and invoice number are safe; try again later."
    };
  }

  if (error === "finance-email-not-retryable") {
    return { tone: "error", message: "That finance email no longer needs to be retried." };
  }

  if (error === "invalid-payment") {
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
      ? `${session.presentationTitle} · ${session.schoolName} · ${formatShortDate(session.startsAt, true)}`
      : payment.bookingSessionId;
  };
  const returnTo = `${basePath}/payments#payments-queue`;
  const linkExpired = (payment: PaymentRecord) =>
    Boolean(
      payment.financeConfirmationExpiresAt &&
        isFinanceConfirmationExpired(payment.financeConfirmationExpiresAt)
    );

  const awaitingApproval = payments.filter((payment) =>
    ["pending", "eligible"].includes(payment.status)
  );
  const deliveryIssues = payments.filter(
    (payment) =>
      payment.status === "approved" &&
      (payment.financeEmailStatus === "failed" ||
        payment.financeEmailStatus === "pending" ||
        linkExpired(payment))
  );
  const withFinance = payments.filter(
    (payment) =>
      payment.status === "approved" &&
      payment.financeEmailStatus === "sent" &&
      !linkExpired(payment)
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
    <div id="payments-queue" className="grid scroll-mt-24 gap-6">
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
        kicker="Received"
        title="Awaiting report approval"
      >
        {awaitingApproval.map((payment) => (
          <PaymentRow key={payment.id}>
            <PaymentSummary
              name={payment.ambassadorName}
              detail={sessionLabel(payment)}
              subDetail="Report received — approve it from the reports workspace."
            />
            <PaymentAmount payment={payment} />
          </PaymentRow>
        ))}
        {awaitingApproval.length === 0 ? <EmptyRow copy="No payments are awaiting approval." /> : null}
      </PaymentSection>

      <PaymentSection
        icon={<TriangleAlert className="h-5 w-5 text-[#b42318]" />}
        kicker="Action required"
        title="Finance delivery issues"
      >
        {deliveryIssues.map((payment) => (
          <PaymentRow key={payment.id} highlight="error">
            <PaymentSummary
              name={payment.ambassadorName}
              detail={sessionLabel(payment)}
              subDetail={
                linkExpired(payment)
                  ? `Invoice ${payment.invoiceNumber ?? ""} · confirmation link expired`
                  : `Invoice ${payment.invoiceNumber ?? ""} · ${payment.financeEmailError ?? "email delivery was not completed"}`
              }
            />
            <div className="flex flex-wrap items-center gap-3">
              <PaymentAmount payment={payment} />
              <form action={retryFinancePaymentEmailAction}>
                <input type="hidden" name="paymentId" value={payment.id} />
                <input type="hidden" name="returnTo" value={returnTo} />
                <PendingSubmitButton
                  type="submit"
                  pendingLabel="Retrying..."
                  className="min-h-[42px] rounded-[16px] px-4 py-2"
                >
                  <RefreshCw className="h-4 w-4" />
                  Retry email
                </PendingSubmitButton>
              </form>
            </div>
          </PaymentRow>
        ))}
        {deliveryIssues.length === 0 ? <EmptyRow copy="No finance emails need attention." /> : null}
      </PaymentSection>

      <PaymentSection
        icon={<Mail className="h-5 w-5 text-[#5d41b8]" />}
        kicker="Approved"
        title="With finance"
      >
        {withFinance.map((payment) => (
          <PaymentRow key={payment.id}>
            <PaymentSummary
              name={payment.ambassadorName}
              detail={sessionLabel(payment)}
              subDetail={`Invoice ${payment.invoiceNumber ?? ""} sent to ${payment.sentToEmail ?? financeEmail}${
                payment.sentToFinanceAt ? ` on ${formatShortDate(payment.sentToFinanceAt)}` : ""
              }`}
            />
            <div className="flex flex-wrap items-center gap-3">
              <PaymentAmount payment={payment} />
              <StatusBadge value="approved" label="Awaiting finance confirmation" />
            </div>
          </PaymentRow>
        ))}
        {withFinance.length === 0 ? <EmptyRow copy="Nothing is currently with finance." /> : null}
      </PaymentSection>

      <PaymentSection
        icon={<CircleDollarSign className="h-5 w-5 text-[color:var(--green)]" />}
        kicker="Paid"
        title="Recently completed payments"
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
              <PaymentAmount payment={payment} />
              <StatusBadge value="paid" />
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
  children
}: {
  icon: ReactNode;
  kicker: string;
  title: string;
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
        </div>
      </div>
      <div className="mt-5 grid gap-3">{children}</div>
    </Card>
  );
}

function PaymentAmount({ payment }: { payment: PaymentRecord }) {
  return (
    <div className="text-right">
      <p className="text-lg font-semibold tracking-[-0.03em] text-[color:var(--navy)]">
        {formatCurrency(payment.amountCents)}
      </p>
      {payment.sourcingBonusCents > 0 ? (
        <p className="mt-0.5 text-xs font-semibold text-[#1d6f35]">
          {formatCurrency(payment.baseAmountCents)} delivery +{" "}
          {formatCurrency(payment.sourcingBonusCents)} sourced-school bonus
        </p>
      ) : null}
    </div>
  );
}

function PaymentRow({
  children,
  highlight
}: {
  children: ReactNode;
  highlight?: "error";
}) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-between gap-4 rounded-[24px] border px-5 py-4",
        highlight === "error"
          ? "border-[#f2c6c6] bg-[#fff8f8]"
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
    <div className="min-w-[220px] max-w-2xl">
      <p className="font-semibold text-[color:var(--navy)]">{name}</p>
      <p className="mt-0.5 text-sm text-[color:var(--text-soft)]">{detail}</p>
      {subDetail ? <p className="mt-0.5 text-sm text-[color:var(--text-soft)]">{subDetail}</p> : null}
    </div>
  );
}

function EmptyRow({ copy }: { copy: string }) {
  return (
    <div className="rounded-[22px] border border-dashed border-[color:rgba(4,15,75,0.1)] bg-white/70 px-5 py-6 text-sm text-[color:var(--text-soft)]">
      {copy}
    </div>
  );
}

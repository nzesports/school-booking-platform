import type { ReactNode } from "react";
import { CircleDollarSign, Hourglass, Mail, RefreshCw, Send, TriangleAlert } from "lucide-react";

import { PagedList } from "@/components/dashboard/list-pagination";
import { PaymentsToastProvider, SendToFinanceForm } from "@/components/dashboard/payments-toast";
import { ReportDetailsButton } from "@/components/dashboard/report-details-dialog";
import { Card } from "@/components/ui/card";
import { PendingSubmitButton } from "@/components/ui/pending-submit-button";
import { StatusBadge } from "@/components/ui/status-badge";
import type { BookingSessionView, PaymentRecord, ReportSummary } from "@/lib/domain/types";
import { additionalAmountLabel } from "@/lib/payment-breakdown";
import { isFinanceConfirmationExpired } from "@/lib/services/payment-automation";
import { cn, formatCurrency, formatShortDate } from "@/lib/utils";

// Each finance card shows this many payments before it pages.
const FINANCE_PAGE_SIZE = 5;

export function PaymentsWorkspace({
  basePath,
  payments,
  sessions,
  reports,
  reviewAction,
  financeEmail,
  notice
}: {
  basePath: string;
  payments: PaymentRecord[];
  sessions: BookingSessionView[];
  reports: ReportSummary[];
  reviewAction: (formData: FormData) => void | Promise<void>;
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
  const reportsByPaymentKey = new Map(
    reports.map((report) => [`${report.bookingSessionId}|${report.ambassadorProfileId}`, report])
  );
  const reportFor = (payment: PaymentRecord) =>
    reportsByPaymentKey.get(`${payment.bookingSessionId}|${payment.ambassadorProfileId}`);
  const linkExpired = (payment: PaymentRecord) =>
    Boolean(
      payment.financeConfirmationExpiresAt &&
        isFinanceConfirmationExpired(payment.financeConfirmationExpiresAt)
    );

  const awaitingApproval = payments.filter((payment) =>
    ["pending", "eligible"].includes(payment.status)
  );
  // Lets staff step through every waiting report inside one dialog.
  const awaitingReports = awaitingApproval
    .map(reportFor)
    .filter((report): report is ReportSummary => Boolean(report));
  // Approved but never sent: waiting for staff to check it and send it.
  const readyForFinance = payments.filter(
    (payment) => payment.status === "approved" && !payment.financeEmailStatus
  );
  const deliveryIssues = payments.filter(
    (payment) =>
      payment.status === "approved" &&
      Boolean(payment.financeEmailStatus) &&
      (payment.financeEmailStatus === "failed" ||
        payment.financeEmailStatus === "pending" ||
        linkExpired(payment))
  );
  // Why an email isn't with finance, in words staff can act on.
  const deliveryProblem = (payment: PaymentRecord) =>
    linkExpired(payment)
      ? "Nate's \"Payment made\" link expired before it was used. Resend to give him a new one."
      : payment.financeEmailStatus === "pending"
        ? "Sending started but hasn't been confirmed yet. If it's still here after 10 minutes the send was interrupted: resend it."
        : payment.financeEmailError ?? "The email provider didn't accept the email. Resend it.";
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
    );

  return (
    <PaymentsToastProvider initialNotice={notice}>
      <div id="payments-queue" className="grid scroll-mt-24 gap-6">
        <PaymentSection
          icon={<Hourglass className="h-5 w-5 text-[#c07a12]" />}
          kicker="Received"
          title="Awaiting report approval"
        >
          <PagedList
            pageSize={FINANCE_PAGE_SIZE}
            itemLabel="payments awaiting approval"
            rows={awaitingApproval.map((payment) => {
            const missingDetails = payment.missingPaymentDetails ?? [];
            const sameDayCount = payment.sameDayPaymentCount ?? 0;
            const warnings = [
              ...(missingDetails.length > 0
                ? [
                    `Can't be approved until ${payment.ambassadorName} adds their ${missingDetails.join(" and ")} to their profile.`
                  ]
                : []),
              ...(sameDayCount > 0
                ? [
                    `${sameDayCount} other ${sameDayCount === 1 ? "session" : "sessions"} at this school that day need payment review. Add a custom extra only when appropriate, and use no payment only when another payment already covers the session.`
                  ]
                : [])
            ];

            return (
              <PaymentRow key={payment.id}>
                <PaymentSummary
                  name={payment.ambassadorName}
                  detail={sessionLabel(payment)}
                  subDetail={`Report submitted ${formatShortDate(payment.createdAt)}. Review it to approve the payment.`}
                  warnings={warnings}
                />
                <div className="flex flex-wrap items-center gap-3">
                  <PaymentAmount payment={payment} />
                  <PaymentReportButton
                    report={reportFor(payment)}
                    reports={awaitingReports}
                    label="Review & approve"
                    reviewAction={reviewAction}
                    reviewReturnTo={returnTo}
                  />
                </div>
              </PaymentRow>
            );
          })}
          />
          {awaitingApproval.length === 0 ? <EmptyRow copy="No payments are awaiting approval." /> : null}
        </PaymentSection>

        <PaymentSection
          icon={<Send className="h-5 w-5 text-[#2563eb]" />}
          kicker="Approved"
          title="Ready for finance"
        >
          <PagedList
            pageSize={FINANCE_PAGE_SIZE}
            itemLabel="payments ready for finance"
            rows={readyForFinance.map((payment) => (
            <PaymentRow key={payment.id}>
              <PaymentSummary
                name={payment.ambassadorName}
                detail={sessionLabel(payment)}
                subDetail={`Invoice ${payment.invoiceNumber ?? ""} · ${payment.bankAccountName ?? "Account name missing"} · ${payment.bankAccountNumber ?? "account number missing"}`}
              />
              {/* The recipient note sits under the buttons so it can't push
                  Send to finance out of line with View report. */}
              <div className="grid justify-items-end gap-1">
                <div className="flex flex-wrap items-center justify-end gap-3">
                  <PaymentAmount payment={payment} />
                  <PaymentReportButton report={reportFor(payment)} label="View report" />
                  <SendToFinanceForm paymentId={payment.id}>
                    <PendingSubmitButton type="submit" pendingLabel="Sending...">
                      <Send className="h-4 w-4" />
                      Send to finance
                    </PendingSubmitButton>
                  </SendToFinanceForm>
                </div>
                <span className="text-right text-[11px] text-[color:var(--text-soft)]">
                  Emails {financeEmail}
                  {financeEmail.trim().toLowerCase() === "info@esf.nz" ? "" : ", CC info@esf.nz"}
                </span>
              </div>
            </PaymentRow>
          ))}
          />
          {readyForFinance.length === 0 ? (
            <EmptyRow copy="Nothing is waiting to be sent. Approved reports with a payment land here." />
          ) : null}
        </PaymentSection>

        <PaymentSection
          icon={<TriangleAlert className="h-5 w-5 text-[#b42318]" />}
          kicker="Action required"
          title="Finance delivery issues"
        >
          <PagedList
            pageSize={FINANCE_PAGE_SIZE}
            itemLabel="finance delivery issues"
            rows={deliveryIssues.map((payment) => (
            <PaymentRow key={payment.id} highlight="error">
              <PaymentSummary
                name={payment.ambassadorName}
                detail={sessionLabel(payment)}
                subDetail={`Invoice ${payment.invoiceNumber ?? ""}${
                  payment.financeEmailLastAttemptAt
                    ? ` · last tried ${formatShortDate(payment.financeEmailLastAttemptAt)}`
                    : ""
                }`}
                warnings={[deliveryProblem(payment)]}
              />
              <div className="flex flex-wrap items-center gap-3">
                <PaymentAmount payment={payment} />
                <PaymentReportButton report={reportFor(payment)} label="View report" />
                <SendToFinanceForm paymentId={payment.id}>
                  <PendingSubmitButton type="submit" pendingLabel="Sending...">
                    <RefreshCw className="h-4 w-4" />
                    Resend to finance
                  </PendingSubmitButton>
                </SendToFinanceForm>
              </div>
            </PaymentRow>
          ))}
          />
          {deliveryIssues.length === 0 ? <EmptyRow copy="No finance emails need attention." /> : null}
        </PaymentSection>

        <PaymentSection
          icon={<Mail className="h-5 w-5 text-[#5d41b8]" />}
          kicker="Approved"
          title="With finance"
        >
          <PagedList
            pageSize={FINANCE_PAGE_SIZE}
            itemLabel="payments with finance"
            rows={withFinance.map((payment) => (
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
                <PaymentReportButton report={reportFor(payment)} label="View report" />
                <StatusBadge value="approved" label="Awaiting finance confirmation" />
              </div>
            </PaymentRow>
          ))}
          />
          {withFinance.length === 0 ? <EmptyRow copy="Nothing is currently with finance." /> : null}
        </PaymentSection>

        <PaymentSection
          icon={<CircleDollarSign className="h-5 w-5 text-[color:var(--green)]" />}
          kicker="Paid"
          title="Recently completed payments"
        >
          <PagedList
            pageSize={FINANCE_PAGE_SIZE}
            itemLabel="completed payments"
            rows={recentlyPaid.map((payment) => (
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
                <PaymentReportButton report={reportFor(payment)} label="View report" />
                <StatusBadge value="paid" />
              </div>
            </PaymentRow>
          ))}
          />
          {recentlyPaid.length === 0 ? <EmptyRow copy="No payments have been marked as paid yet." /> : null}
        </PaymentSection>
      </div>
    </PaymentsToastProvider>
  );
}

function PaymentReportButton({
  report,
  reports,
  label,
  reviewAction,
  reviewReturnTo
}: {
  report?: ReportSummary;
  reports?: ReportSummary[];
  label: string;
  reviewAction?: (formData: FormData) => void | Promise<void>;
  reviewReturnTo?: string;
}) {
  // Imported historical payments can predate their report rows.
  if (!report) {
    return null;
  }

  return (
    <ReportDetailsButton
      report={report}
      reports={reports}
      label={label}
      reviewAction={reviewAction}
      reviewReturnTo={reviewReturnTo}
    />
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

export function PaymentAmount({ payment }: { payment: PaymentRecord }) {
  const additionalSessionCents = payment.additionalSessionCents ?? 0;
  const standardParts = [
    `${formatCurrency(payment.baseAmountCents)} delivery`,
    ...(payment.sourcingBonusCents > 0
      ? [`${formatCurrency(payment.sourcingBonusCents)} sourced-school bonus`]
      : []),
    ...(additionalSessionCents > 0
      ? [`${formatCurrency(additionalSessionCents)} ${additionalAmountLabel(payment.paymentTier)}`]
      : [])
  ];

  return (
    <div className="text-right">
      <p className="text-lg font-semibold tracking-[-0.03em] text-[color:var(--navy)]">
        {formatCurrency(payment.amountCents)}
      </p>
      {(payment.extraAmountCents ?? 0) > 0 ? (
        <p className="mt-0.5 max-w-[260px] text-xs font-semibold text-[#8a5a00]">
          {standardParts.join(" + ")} + {formatCurrency(payment.extraAmountCents ?? 0)} add-on
          {payment.paymentNote ? ` · ${payment.paymentNote}` : ""}
        </p>
      ) : standardParts.length > 1 ? (
        <p className="mt-0.5 max-w-[260px] text-xs font-semibold text-[#1d6f35]">
          {standardParts.join(" + ")}
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
  subDetail,
  warnings = []
}: {
  name: string;
  detail: string;
  subDetail?: string;
  warnings?: string[];
}) {
  return (
    <div className="min-w-[220px] max-w-2xl">
      <p className="font-semibold text-[color:var(--navy)]">{name}</p>
      <p className="mt-0.5 text-sm text-[color:var(--text-soft)]">{detail}</p>
      {subDetail ? <p className="mt-0.5 text-sm text-[color:var(--text-soft)]">{subDetail}</p> : null}
      {warnings.map((warning) => (
        <p key={warning} className="mt-1 flex items-start gap-1.5 text-sm font-semibold text-[#8a5a00]">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
          {warning}
        </p>
      ))}
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

import { CircleCheck, Clock3, HelpCircle, ReceiptText } from "lucide-react";
import type { Metadata } from "next";
import type { ReactNode } from "react";

import { confirmFinancePaymentAction } from "@/app/finance/payment/[token]/actions";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PendingSubmitButton } from "@/components/ui/pending-submit-button";
import {
  hashFinanceConfirmationToken,
  isFinanceConfirmationExpired,
  isFinanceConfirmationToken
} from "@/lib/services/payment-automation";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatCurrency } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Finance payment confirmation",
  robots: { index: false, follow: false }
};

export const dynamic = "force-dynamic";

export default async function FinancePaymentPage({
  params,
  searchParams
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { token } = await params;
  const resolvedSearchParams = await searchParams;
  const stateValue = resolvedSearchParams.state;
  const requestedState = Array.isArray(stateValue) ? stateValue[0] : stateValue;
  const admin = createAdminClient();

  if (!admin || requestedState === "unavailable") {
    return (
      <FinanceShell>
        <StateCard
          icon={<HelpCircle className="h-8 w-8" />}
          title="Payment confirmation is unavailable"
          copy="Please try again shortly or contact the NZ Esports team."
        />
      </FinanceShell>
    );
  }

  if (!isFinanceConfirmationToken(token) || requestedState === "invalid") {
    return (
      <FinanceShell>
        <StateCard
          icon={<HelpCircle className="h-8 w-8" />}
          title="This payment link isn't valid"
          copy="Use the latest link from the finance email or contact the NZ Esports team."
        />
      </FinanceShell>
    );
  }

  const { data: payment } = await admin
    .from("payments")
    .select(
      "id, ambassador_profile_id, amount_cents, currency, status, invoice_number, paid_at, finance_confirmation_expires_at"
    )
    .eq("finance_confirmation_token_hash", hashFinanceConfirmationToken(token))
    .maybeSingle();

  if (!payment) {
    return (
      <FinanceShell>
        <StateCard
          icon={<HelpCircle className="h-8 w-8" />}
          title="This payment link isn't valid"
          copy="Use the latest link from the finance email or contact the NZ Esports team."
        />
      </FinanceShell>
    );
  }

  const { data: ambassadorProfile } = payment.ambassador_profile_id
    ? await admin
        .from("ambassador_profiles")
        .select("user_id")
        .eq("id", payment.ambassador_profile_id as string)
        .maybeSingle()
    : { data: null };
  const { data: ambassadorUser } = ambassadorProfile?.user_id
    ? await admin
        .from("profiles")
        .select("full_name")
        .eq("id", ambassadorProfile.user_id as string)
        .maybeSingle()
    : { data: null };
  const ambassadorName = (ambassadorUser?.full_name as string | null) ?? "Ambassador";

  if (payment.status === "paid") {
    return (
      <FinanceShell>
        <StateCard
          icon={<CircleCheck className="h-8 w-8" />}
          iconClassName="bg-[#eaf8ee] text-[#117a2e]"
          title="Payment recorded"
          copy={`${payment.invoice_number ?? "This payment"} for ${ambassadorName} is marked as paid. The ambassador portal has been updated automatically.`}
        />
      </FinanceShell>
    );
  }

  const expired =
    requestedState === "expired" ||
    isFinanceConfirmationExpired(payment.finance_confirmation_expires_at as string | null);

  if (expired) {
    return (
      <FinanceShell>
        <StateCard
          icon={<Clock3 className="h-8 w-8" />}
          title="This payment link has expired"
          copy="Ask the NZ Esports team to resend the finance email. The invoice number will stay the same."
        />
      </FinanceShell>
    );
  }

  if (requestedState === "failed") {
    return (
      <FinanceShell>
        <StateCard
          icon={<HelpCircle className="h-8 w-8" />}
          title="Payment could not be recorded"
          copy="No payment status was changed. Please try the latest email link again or contact NZ Esports."
        />
      </FinanceShell>
    );
  }

  return (
    <FinanceShell>
      <Card className="rounded-[30px]">
        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-[#eef4fd] text-[#1e4fae]">
          <ReceiptText className="h-7 w-7" />
        </span>
        <p className="mt-5 text-sm font-semibold uppercase tracking-[0.15em] text-[color:var(--green)]">
          Finance confirmation
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-[color:var(--navy)]">
          Confirm payment made
        </h1>
        <p className="mt-3 text-sm leading-7 text-[color:var(--text-soft)]">
          Confirm only after the bank payment has been completed. This will immediately update the
          ambassador portal.
        </p>

        <dl className="mt-6 grid gap-3 rounded-[22px] border border-[color:var(--border-soft)] bg-[#f8fafd] p-5 sm:grid-cols-3">
          <PaymentDetail label="Invoice reference" value={(payment.invoice_number as string | null) ?? "—"} />
          <PaymentDetail label="Ambassador" value={ambassadorName} />
          <PaymentDetail
            label="Amount"
            value={formatCurrency(
              Number(payment.amount_cents ?? 0),
              (payment.currency as string | null) ?? "NZD"
            )}
          />
        </dl>

        <form action={confirmFinancePaymentAction} className="mt-6">
          <input type="hidden" name="token" value={token} />
          <PendingSubmitButton
            type="submit"
            pendingLabel="Recording payment..."
            className="min-h-[50px] w-full rounded-[16px]"
          >
            <CircleCheck className="h-5 w-5" />
            Confirm payment made
          </PendingSubmitButton>
        </form>
      </Card>
    </FinanceShell>
  );
}

function FinanceShell({ children }: { children: ReactNode }) {
  return <main className="site-shell-narrow py-10 md:py-16">{children}</main>;
}

function PaymentDetail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-[0.12em] text-[color:var(--text-soft)]">
        {label}
      </dt>
      <dd className="mt-1 text-sm font-semibold text-[color:var(--navy)]">{value}</dd>
    </div>
  );
}

function StateCard({
  icon,
  iconClassName,
  title,
  copy
}: {
  icon: ReactNode;
  iconClassName?: string;
  title: string;
  copy: string;
}) {
  return (
    <Card className="rounded-[30px] text-center">
      <span
        className={`mx-auto flex h-16 w-16 items-center justify-center rounded-full ${iconClassName ?? "bg-[#eef2f8] text-[color:var(--navy)]"}`}
      >
        {icon}
      </span>
      <h1 className="mt-5 text-3xl font-semibold tracking-[-0.03em] text-[color:var(--navy)]">
        {title}
      </h1>
      <p className="mx-auto mt-3 max-w-xl text-sm leading-7 text-[color:var(--text-soft)]">
        {copy}
      </p>
      <div className="mt-6 flex justify-center">
        <ButtonLink href="/" variant="secondary">
          Back to the NZ Esports site
        </ButtonLink>
      </div>
    </Card>
  );
}

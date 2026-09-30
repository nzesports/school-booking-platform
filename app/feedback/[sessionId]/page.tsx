import { CircleCheck, Clock3, HelpCircle } from "lucide-react";
import type { ReactNode } from "react";

import { requestFeedbackLinkAction, submitPublicFeedbackAction } from "@/app/portal/actions";
import { SchoolFeedbackForm } from "@/components/site/school-feedback-form";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PendingSubmitButton } from "@/components/ui/pending-submit-button";
import { feedbackPath, isValidFeedbackLinkToken } from "@/lib/services/feedback-links";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatWeekdayDate } from "@/lib/utils";

const FEEDBACK_ELIGIBLE_STATUSES = new Set([
  "confirmed",
  "ambassador_assigned",
  "completed_pending_report",
  "report_submitted",
  "payment_pending",
  "paid",
  "closed"
]);

// Public post-session feedback page, reached from the "How was your session?"
// email. No login required, but the link must carry the signature issued in
// that email: the session UUID alone is visible to ambassadors, and school
// feedback must only come from the school. Without a valid signature nothing
// about the session is shown, only an option to email the school a fresh link.
export default async function PublicFeedbackPage({
  params,
  searchParams
}: {
  params: Promise<{ sessionId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { sessionId } = await params;
  const resolvedSearchParams = await searchParams;
  const submittedParam = resolvedSearchParams.submitted;
  const submitted = (Array.isArray(submittedParam) ? submittedParam[0] : submittedParam) === "1";
  const errorParam = resolvedSearchParams.error;
  const error = Array.isArray(errorParam) ? errorParam[0] : errorParam;
  const tokenParam = resolvedSearchParams.t;
  const token = Array.isArray(tokenParam) ? tokenParam[0] : tokenParam;
  const linkParam = resolvedSearchParams.link;
  const linkRequested = (Array.isArray(linkParam) ? linkParam[0] : linkParam) === "requested";

  if (!isValidFeedbackLinkToken(sessionId, token)) {
    return (
      <FeedbackShell>
        {linkRequested ? (
          <StateCard
            icon={<CircleCheck className="h-8 w-8" />}
            iconClassName="bg-[#eaf8ee] text-[#117a2e]"
            title="Check your school's inbox"
            copy="If feedback is open for this session, we've emailed a fresh feedback link to the booking contact for the school. It can take a few minutes to arrive, so check spam too. Need help? Email schools@esf.nz."
          />
        ) : (
          <StateCard
            icon={<HelpCircle className="h-8 w-8" />}
            title="This feedback link has expired"
            copy="For security, feedback links now come with a code that this one doesn't have. We can email a fresh link to your school's booking contact."
          >
            <form action={requestFeedbackLinkAction}>
              <input type="hidden" name="bookingSessionId" value={sessionId} />
              <PendingSubmitButton type="submit">Email a fresh link</PendingSubmitButton>
            </form>
          </StateCard>
        )}
      </FeedbackShell>
    );
  }

  const now = new Date();
  const admin = createAdminClient();

  if (!admin) {
    return (
      <FeedbackShell>
        <StateCard
          icon={<HelpCircle className="h-8 w-8" />}
          title="Feedback is unavailable right now"
          copy="Please try again shortly, or email us at schools@esf.nz."
        />
      </FeedbackShell>
    );
  }

  const { data: session } = await admin
    .from("booking_sessions")
    .select("id, starts_at, ends_at, school_id, presentation_type_id, assigned_ambassador_id, status")
    .eq("id", sessionId)
    .maybeSingle();

  if (!session) {
    return (
      <FeedbackShell>
        <StateCard
          icon={<HelpCircle className="h-8 w-8" />}
          title="This feedback link isn't valid"
          copy="Double-check the link from your email, or contact the NZ Esports team at schools@esf.nz."
        />
      </FeedbackShell>
    );
  }

  const [{ data: school }, { data: presentation }, { data: existingReview }] =
    await Promise.all([
      admin.from("schools").select("name").eq("id", session.school_id).maybeSingle(),
      admin
        .from("presentation_types")
        .select("title")
        .eq("id", session.presentation_type_id)
        .maybeSingle(),
      admin
        .from("presentation_reviews")
        .select("id")
        .eq("booking_session_id", sessionId)
        .maybeSingle()
    ]);

  let ambassadorName: string | undefined;

  if (session.assigned_ambassador_id) {
    const { data: ambassadorProfile } = await admin
      .from("ambassador_profiles")
      .select("user_id")
      .eq("id", session.assigned_ambassador_id)
      .maybeSingle();

    if (ambassadorProfile?.user_id) {
      const { data: ambassadorUser } = await admin
        .from("profiles")
        .select("full_name")
        .eq("id", ambassadorProfile.user_id)
        .maybeSingle();

      ambassadorName = (ambassadorUser?.full_name as string | null) ?? undefined;
    }
  }

  if (submitted || existingReview) {
    return (
      <FeedbackShell>
        <StateCard
          icon={<CircleCheck className="h-8 w-8" />}
          iconClassName="bg-[#eaf8ee] text-[#117a2e]"
          title="Thank you — feedback received!"
          copy={`Your feedback on ${(presentation?.title as string | null) ?? "the presentation"} has been sent to the NZ Esports team. It helps us keep improving for schools across Aotearoa.`}
        />
      </FeedbackShell>
    );
  }

  if (new Date(session.ends_at as string).getTime() > now.getTime()) {
    return (
      <FeedbackShell>
        <StateCard
          icon={<Clock3 className="h-8 w-8" />}
          title="This session hasn't happened yet"
          copy={`Feedback opens after your session on ${formatWeekdayDate(session.starts_at as string)}. Come back once it has been delivered.`}
        />
      </FeedbackShell>
    );
  }

  if (!FEEDBACK_ELIGIBLE_STATUSES.has(String(session.status))) {
    return (
      <FeedbackShell>
        <StateCard
          icon={<HelpCircle className="h-8 w-8" />}
          title="Feedback isn't available for this session"
          copy="This link only opens for presentations that went ahead. Contact schools@esf.nz if you think this is incorrect."
        />
      </FeedbackShell>
    );
  }

  return (
    <FeedbackShell>
      {error && <p role="alert" className="mb-5 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
        {error === "invalid-review"
          ? "Please complete all required fields, including your first name, last name, role and a whole number of students attended."
          : "Your feedback could not be saved. Please try again, or contact schools@esf.nz if this continues."}
      </p>}
      <SchoolFeedbackForm
        action={submitPublicFeedbackAction}
        sessionId={sessionId}
        returnTo={feedbackPath(sessionId)}
        feedbackToken={token}
        schoolName={(school?.name as string | null) ?? "Your school"}
        presentationTitle={(presentation?.title as string | null) ?? undefined}
        startsAt={session.starts_at as string}
        ambassadorName={ambassadorName}
      />
    </FeedbackShell>
  );
}

function FeedbackShell({ children }: { children: ReactNode }) {
  return <main className="site-shell-narrow py-10 md:py-14">{children}</main>;
}

function StateCard({
  icon,
  iconClassName,
  title,
  copy,
  children
}: {
  icon: ReactNode;
  iconClassName?: string;
  title: string;
  copy: string;
  children?: ReactNode;
}) {
  return (
    <Card className="rounded-[28px] text-center">
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
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        {children}
        <ButtonLink href="/" variant="secondary">
          Back to the NZ Esports site
        </ButtonLink>
      </div>
    </Card>
  );
}

import { CircleCheck, Clock3, HelpCircle } from "lucide-react";
import type { ReactNode } from "react";

import { submitPublicFeedbackAction } from "@/app/portal/actions";
import { SchoolFeedbackForm } from "@/components/site/school-feedback-form";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatWeekdayDate } from "@/lib/utils";

// Public post-session feedback page, reached from the "How was your session?"
// email. No login required — the unguessable session UUID is the capability.
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
    .select("id, starts_at, ends_at, school_id, presentation_type_id, assigned_ambassador_id")
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

  return (
    <FeedbackShell>
      <SchoolFeedbackForm
        action={submitPublicFeedbackAction}
        sessionId={sessionId}
        returnTo={`/feedback/${sessionId}`}
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
  copy
}: {
  icon: ReactNode;
  iconClassName?: string;
  title: string;
  copy: string;
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
      <div className="mt-6 flex justify-center">
        <ButtonLink href="/" variant="secondary">
          Back to the NZ Esports site
        </ButtonLink>
      </div>
    </Card>
  );
}

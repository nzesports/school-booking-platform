import { AuthModalButton } from "@/components/auth/auth-modal-trigger";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export default async function BookingConfirmationPage({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <main className="site-shell-narrow flex min-h-[65vh] items-center justify-center py-20">
      <Card className="text-center">
        <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[color:var(--green)]">
          Booking request received
        </p>
        <h1 className="mt-4 text-5xl font-semibold text-[color:var(--navy)]">
          Your tentative request is in.
        </h1>
        <p className="mt-5 text-lg leading-8 text-[color:var(--text-muted)]">
          Reference <span className="font-semibold text-[color:var(--navy)]">{id}</span>. Staff
          will review session availability, ambassador coverage, and next-step communications
          before confirming.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <AuthModalButton mode="signup" role="school">
            Create an account to view your booking
          </AuthModalButton>
          <ButtonLink href="/" variant="secondary">
            Back to homepage
          </ButtonLink>
        </div>
      </Card>
    </main>
  );
}

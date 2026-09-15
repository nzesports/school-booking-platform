import { AuthModalButton } from "@/components/auth/auth-modal-trigger";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { getAuthenticatedPortalUser } from "@/lib/services/auth";
import { getBookingConfirmation } from "@/lib/services/bookings";

export default async function BookingConfirmationPage({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [user, booking] = await Promise.all([
    getAuthenticatedPortalUser(),
    getBookingConfirmation(id)
  ]);
  const isOwningSchoolUser =
    user?.role === "school" && booking?.submittedByUserId === user.id;

  return (
    <main className="site-shell-narrow flex min-h-[65vh] items-center justify-center py-20">
      <Card className="text-center">
        <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[color:var(--green)]">
          Booking request received
        </p>
        <h1 className="mt-4 text-5xl font-semibold text-[color:var(--navy)]">
          Your request is pending approval.
        </h1>
        <p className="mt-5 text-lg leading-8 text-[color:var(--text-muted)]">
          Our team will review availability and confirm the next steps with your school.
        </p>
        {!isOwningSchoolUser && booking?.referenceCode ? (
          <p className="mt-4 text-base leading-7 text-[color:var(--text-muted)]">
            Booking reference:{" "}
            <span className="font-semibold text-[color:var(--navy)]">
              {booking.referenceCode}
            </span>
            . Use this reference and the email address used for the booking to view and manage your sessions in your browser.
          </p>
        ) : null}
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          {isOwningSchoolUser ? (
            <>
              <ButtonLink href={`/school/bookings/${id}`}>View booking</ButtonLink>
              <ButtonLink href="/school" variant="secondary">
                Back to dashboard
              </ButtonLink>
            </>
          ) : (
            <>
              <ButtonLink href="/manage-booking">Manage booking without an account</ButtonLink>
              <AuthModalButton mode="signup" role="school">
                Create an account to view bookings
              </AuthModalButton>
              <ButtonLink href="/" variant="secondary">
                Back to homepage
              </ButtonLink>
            </>
          )}
        </div>
      </Card>
    </main>
  );
}

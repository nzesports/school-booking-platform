import type { Metadata } from "next";
import { HelpCircle, MonitorPlay, ShieldCheck } from "lucide-react";

import { submitOnlineBookingRequestAction } from "@/app/actions";
import { OnlineBookingLauncher } from "@/components/site/online-booking-launcher";
import { Card } from "@/components/ui/card";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { loadAvailabilityConfigForDisplay } from "@/lib/services/availability-server";
import { isValidOnlineBookingToken } from "@/lib/services/online-booking-link";
import { listPublicPresentations } from "@/lib/services/presentations";

// Private online-session booking page. It is never linked from the website:
// the staff team shares this URL directly with schools they have arranged an
// online session with. Search engines are told not to index it, and the
// token stops working as soon as a super admin replaces the link.
export const metadata: Metadata = {
  title: "Book an online session | NZ Esports",
  robots: { index: false, follow: false },
  referrer: "no-referrer"
};

export default async function OnlineBookingPage({
  params
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  if (!(await isValidOnlineBookingToken(token))) {
    return (
      <main
      data-fill-height
      className="site-shell-narrow !max-w-[640px] flex flex-1 flex-col justify-center py-10 sm:py-14"
    >
        <Card className="text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-50 text-amber-700">
            <HelpCircle className="h-7 w-7" aria-hidden="true" />
          </div>
          <h1 className="mt-5 text-3xl font-semibold tracking-tight text-[color:var(--navy)]">
            This link is no longer active
          </h1>
          <p className="mt-3 text-base leading-7 text-[color:var(--text-muted)]">
            Online sessions are booked through a private link from the NZ Esports team. Please
            contact the team at{" "}
            <a href="mailto:schools@esf.nz" className="font-semibold text-[color:var(--navy)] underline">
              schools@esf.nz
            </a>{" "}
            for a new link.
          </p>
        </Card>
      </main>
    );
  }

  const [presentations, availabilityConfig] = await Promise.all([
    listPublicPresentations(),
    loadAvailabilityConfigForDisplay()
  ]);

  return (
    <main
      data-fill-height
      className="site-shell-narrow !max-w-[640px] flex flex-1 flex-col justify-center py-10 sm:py-14"
    >
      <Card className="overflow-hidden p-0 md:p-0">
        <div className="border-b border-green-100 bg-gradient-to-r from-green-50 to-sky-50 px-6 py-5 sm:px-8">
          <div className="flex items-center gap-3">
            <MonitorPlay className="h-6 w-6 text-green-700" aria-hidden="true" />
            <h1 className="text-2xl font-semibold text-[color:var(--navy)]">Book an online session</h1>
            <InfoTooltip label="online sessions">
              Online sessions are delivered by video call. Choose your presentation, date and time,
              then add your school&apos;s details. Our team will review your request, confirm it with
              you and email the video-call link.
            </InfoTooltip>
          </div>
        </div>
        <div className="px-6 py-7 sm:px-8 sm:py-8">
          <OnlineBookingLauncher
            token={token}
            presentations={presentations}
            availabilityConfig={availabilityConfig}
            action={submitOnlineBookingRequestAction}
          />
        </div>
        <div className="flex items-center justify-center gap-2 border-t border-slate-100 bg-slate-50/70 px-6 py-4 text-xs text-[color:var(--text-muted)]">
          <ShieldCheck className="h-4 w-4 shrink-0 text-green-700" aria-hidden="true" />
          Private booking link shared by the NZ Esports team.
        </div>
      </Card>
    </main>
  );
}

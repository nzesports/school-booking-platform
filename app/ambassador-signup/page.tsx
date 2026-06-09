import type { ReactNode } from "react";
import { CheckCircle2, GraduationCap, Plane } from "lucide-react";

import { submitAmbassadorSignupAction } from "@/app/actions";
import { AmbassadorSignupForm } from "@/components/forms/ambassador-signup-form";
import { listRegions } from "@/lib/services/presentations";

export default async function AmbassadorSignupPage({
  searchParams
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [query, regions] = await Promise.all([searchParams, listRegions()]);
  const submitted = typeof query.submitted === "string" ? query.submitted : null;

  return (
    <main className="public-stack pb-24 pt-8">
      <section className="public-band public-band-soft public-band-divider">
        <div className="site-shell grid gap-10 xl:grid-cols-[minmax(0,1fr)_1.05fr] xl:items-start">
          <div className="max-w-3xl">
            <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[color:var(--green)]">
              Ambassador pathway
            </p>
            <h1 className="mt-4 text-5xl font-semibold tracking-[-0.06em] text-[color:var(--navy)] md:text-6xl">
              Apply to present for NZ Esports.
            </h1>
            <p className="mt-5 text-lg leading-8 text-[color:var(--text-soft)]">
              Join the network of ambassadors delivering school sessions about wellbeing,
              pathways, and structured esports education across Aotearoa.
            </p>

            <div className="mt-8 grid gap-3">
              <Feature icon={<GraduationCap className="h-5 w-5 text-[color:var(--green)]" />}>
                Training modules and presentation resources are included.
              </Feature>
              <Feature icon={<Plane className="h-5 w-5 text-[color:var(--green)]" />}>
                Travel availability and region preferences can be managed per ambassador.
              </Feature>
              <Feature icon={<CheckCircle2 className="h-5 w-5 text-[color:var(--green)]" />}>
                Applications flow into staff review, scheduling, and reporting tools.
              </Feature>
            </div>

            {submitted ? (
              <div className="mt-8 rounded-[22px] border border-[rgba(24,168,59,0.16)] bg-white/76 px-4 py-4 text-sm text-[color:var(--navy)] shadow-[0_12px_26px_rgba(11,24,77,0.06)]">
                Application received: {submitted}
              </div>
            ) : null}
          </div>

          <AmbassadorSignupForm regions={regions} action={submitAmbassadorSignupAction} />
        </div>
      </section>
    </main>
  );
}

function Feature({
  icon,
  children
}: {
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 rounded-[22px] border border-white/70 bg-white/72 px-4 py-4 text-sm text-[color:var(--navy)] shadow-[0_12px_26px_rgba(11,24,77,0.06)]">
      {icon}
      {children}
    </div>
  );
}

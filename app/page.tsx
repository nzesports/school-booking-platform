import type { LucideIcon } from "lucide-react";
import {
  ArrowRight,
  BookOpenCheck,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Globe,
  GraduationCap,
  Star,
  UsersRound
} from "lucide-react";

import { AuthModalButton } from "@/components/auth/auth-modal-trigger";
import { BookPresentationButton } from "@/components/site/book-presentation-button";
import { HeroBookingWidget } from "@/components/site/hero-booking-widget";
import { PresentationCard } from "@/components/site/presentation-card";
import { ButtonLink } from "@/components/ui/button";
import { config } from "@/lib/env";
import { loadAvailabilityConfig } from "@/lib/services/availability-server";
import {
  listHomepageSections,
  listPublicPresentations,
  listPublicTestimonials,
  listRegions
} from "@/lib/services/presentations";
import { sanitizeRichText } from "@/lib/services/sanitize";

const howItWorks = [
  {
    id: "step-1",
    title: "Choose",
    copy: "Select a presentation that suits your students, goals, and preferred outcomes.",
    icon: BookOpenCheck
  },
  {
    id: "step-2",
    title: "Book",
    copy: "Pick a date, region, and session mix that works best for your school.",
    icon: CalendarDays
  },
  {
    id: "step-3",
    title: "We Confirm",
    copy: "Our team confirms scheduling and the booking becomes active.",
    icon: CheckCircle2
  },
  {
    id: "step-4",
    title: "We Present",
    copy: "Our team delivers an engaging in-person session at your confirmed date and time.",
    icon: UsersRound
  }
];

const highlights = [
  { label: "Free Nationwide Sessions", icon: Globe },
  { label: "10 Minute Delivery", icon: Clock3 },
  { label: "All Year Groups", icon: GraduationCap }
];

export default async function HomePage() {
  const [presentations, regions, homepageSections, testimonials, availabilityConfig] = await Promise.all([
    listPublicPresentations(),
    listRegions(),
    listHomepageSections(),
    listPublicTestimonials(8),
    loadAvailabilityConfig()
  ]);
  const showDemoFeedbackNote = !config.isSupabaseConfigured;
  const homepageSectionMap = new Map(
    homepageSections.map((section) => [section.sectionKey, section])
  );
  const heroSection = homepageSectionMap.get("hero");
  const howItWorksSection = homepageSectionMap.get("how_it_works");
  const ctaSection = homepageSectionMap.get("cta");

  return (
    <main className="public-stack">
      <section
        id="for-schools"
        className="public-band relative overflow-hidden border-b border-[rgba(4,15,75,0.06)] pt-8"
      >
        <div className="hero-aurora" />
        <div className="site-shell relative">
          <div className="hero-grid items-center">
            <div className="max-w-3xl py-4">
              <span className="section-kicker">School presentations</span>
              <h1 className="mt-6 text-5xl font-semibold leading-[0.97] tracking-[-0.06em] text-[color:var(--navy)] md:text-7xl">
                {heroSection?.title ? (
                  heroSection.title
                ) : (
                  <>
                    Inspiring the next generation through{" "}
                    <span className="text-[color:var(--green)]">esports.</span>
                  </>
                )}
              </h1>
              {heroSection?.body ? (
                <div
                  className="rich-text-prose mt-6 max-w-2xl text-lg leading-8 text-[color:var(--text-soft)]"
                  dangerouslySetInnerHTML={{ __html: sanitizeRichText(heroSection.body) }}
                />
              ) : (
                <p className="mt-6 max-w-2xl text-lg leading-8 text-[color:var(--text-soft)]">
                  Curriculum-aligned, engaging presentations that educate, inspire, and empower
                  students to thrive in the digital age.
                </p>
              )}

              <div className="mt-10 flex flex-wrap gap-3">
                {highlights.map(({ label, icon: Icon }) => (
                  <div
                    key={label}
                    className="inline-flex items-center gap-2 rounded-full border border-white/65 bg-white/70 px-4 py-3 text-sm font-medium text-[color:var(--navy)] shadow-[0_10px_22px_rgba(11,24,77,0.06)] backdrop-blur"
                  >
                    <Icon className="h-4 w-4 text-[color:var(--green)]" />
                    {label}
                  </div>
                ))}
              </div>
            </div>

            <HeroVisual />
          </div>

          <HeroBookingWidget
            presentations={presentations}
            regions={regions}
            availabilityConfig={availabilityConfig}
          />
        </div>
      </section>

      <section className="public-band public-band-compact">
        <div className="site-shell">
          <div className="flex flex-wrap items-end justify-between gap-5">
            <div className="max-w-3xl">
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[color:var(--green)]">
                Our presentation topics
              </p>
              <h2 className="mt-3 text-4xl font-semibold tracking-[-0.05em] text-[color:var(--navy)]">
                Choose the session mix that fits your school.
              </h2>
              <p className="mt-4 text-base leading-8 text-[color:var(--text-soft)]">
                Explore wellbeing, pathways, careers, and foundational esports sessions that
                can be delivered as one-off talks or grouped into a broader visit.
              </p>
            </div>

            <ButtonLink
              href="/presentations"
              variant="secondary"
              className="min-h-[46px] rounded-[16px] px-5 py-2.5"
            >
              View all presentations
              <ArrowRight className="h-4 w-4" />
            </ButtonLink>
          </div>

          <div className="homepage-gap mt-10 grid xl:grid-cols-4">
            {presentations.map((presentation) => (
              <PresentationCard key={presentation.id} presentation={presentation} />
            ))}
          </div>
        </div>
      </section>

      <section
        id="how-it-works"
        className="public-band public-band-soft public-band-divider py-[clamp(4.5rem,7vw,7rem)]"
      >
        <div className="site-shell xl:min-h-[440px]">
          <div className="grid gap-12 xl:grid-cols-[280px_minmax(0,1fr)] xl:items-center">
            <div className="max-w-sm">
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[color:var(--green)]">
                {howItWorksSection?.subtitle ?? "How it works"}
              </p>
              <h2 className="mt-3 text-4xl font-semibold tracking-[-0.05em] text-[color:var(--navy)]">
                {howItWorksSection?.title ?? "Simple steps to bring NZ Esports to your school."}
              </h2>
              {howItWorksSection?.body ? (
                <div
                  className="rich-text-prose mt-4 text-base leading-8 text-[color:var(--text-soft)]"
                  dangerouslySetInnerHTML={{ __html: sanitizeRichText(howItWorksSection.body) }}
                />
              ) : (
                <p className="mt-4 text-base leading-8 text-[color:var(--text-soft)]">
                  A straightforward booking flow for schools, from choosing the right topic to
                  delivering a session that lands well with students.
                </p>
              )}
            </div>

            <div className="grid gap-8 md:grid-cols-4">
              {howItWorks.map((step, index) => (
                <StepRailItem
                  key={step.id}
                  step={index + 1}
                  title={step.title}
                  copy={step.copy}
                  icon={step.icon}
                  isLast={index === howItWorks.length - 1}
                />
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="pb-[clamp(2rem,4vw,3rem)] pt-[clamp(1.25rem,2vw,2rem)]">
        <div className="site-shell">
          <div className="max-w-3xl">
            <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[color:var(--green)]">
              School feedback
            </p>
            <h2 className="mt-3 text-4xl font-semibold tracking-[-0.05em] text-[color:var(--navy)]">
              How schools describe the experience.
            </h2>
            <p className="mt-4 text-base leading-8 text-[color:var(--text-soft)]">
              A clearer snapshot of the kind of post-session feedback schools share after
              wellbeing, careers, and esports pathway presentations.
            </p>
            {showDemoFeedbackNote ? (
              <p className="mt-4 inline-flex max-w-xl rounded-[18px] border border-[rgba(4,15,75,0.08)] bg-white/80 px-4 py-3 text-sm text-[color:var(--navy)]">
                Representative feedback examples are shown in demo mode until live review data
                is connected.
              </p>
            ) : null}
          </div>

          <div className="homepage-gap mt-8 grid xl:grid-cols-4">
            {testimonials.map((testimonial) => (
              <article
                key={testimonial.id}
                className="flex h-full flex-col rounded-[30px] border border-[color:var(--border-soft)] bg-white/88 p-7 shadow-[0_18px_42px_rgba(11,24,77,0.08)] backdrop-blur"
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm font-semibold text-[color:var(--navy)]">
                      {testimonial.school}
                    </p>
                    <p className="mt-1 text-sm text-[color:var(--text-soft)]">
                      {testimonial.attribution}
                    </p>
                  </div>

                  <div className="flex gap-1 text-[#ffb938]">
                    {Array.from({ length: testimonial.rating ?? 5 }, (_, index) => (
                      <Star key={`${testimonial.id}-${index}`} className="h-4 w-4 fill-current" />
                    ))}
                  </div>
                </div>

                <div className="mt-5 flex flex-wrap gap-2 text-xs font-semibold text-[color:var(--navy)]">
                  {testimonial.presentationTitle ? (
                    <span className="rounded-full bg-[color:var(--blue-soft)] px-3 py-1.5">
                      {testimonial.presentationTitle}
                    </span>
                  ) : null}
                  {testimonial.feedbackDate ? (
                    <span className="rounded-full bg-[color:var(--green-soft)] px-3 py-1.5 text-[color:var(--green)]">
                      {testimonial.feedbackDate}
                    </span>
                  ) : null}
                </div>

                <p className="mt-5 text-base leading-8 text-[color:var(--text-dark)]">
                  “{testimonial.quote}”
                </p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="public-band public-band-alt public-band-divider">
        <div className="site-shell">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
            <div className="max-w-2xl">
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[color:var(--green)]">
                {ctaSection?.subtitle ?? "Book a presentation"}
              </p>
              <h2 className="mt-3 text-4xl font-semibold tracking-[-0.05em] text-[color:var(--navy)]">
                {ctaSection?.title ??
                  "Inspire your students with a session designed for real school contexts."}
              </h2>
              {ctaSection?.body ? (
                <div
                  className="rich-text-prose mt-4 text-base leading-8 text-[color:var(--text-soft)]"
                  dangerouslySetInnerHTML={{ __html: sanitizeRichText(ctaSection.body) }}
                />
              ) : (
                <p className="mt-4 text-base leading-8 text-[color:var(--text-soft)]">
                  Presentations are delivered by NZ Esports, the national sporting organisation for
                  esports in New Zealand. Spaces fill fast, especially for grouped school visits and
                  preferred time slots, so start the booking flow now and we&apos;ll take it from
                  there.
                </p>
              )}
            </div>

            <div className="flex flex-wrap gap-3">
              <BookPresentationButton className="min-h-[48px] rounded-[16px] px-5 py-2.5">
                Book a Presentation
                <ArrowRight className="h-4 w-4" />
              </BookPresentationButton>
              <AuthModalButton
                mode="signup"
                role="school"
                className="min-h-[48px] rounded-[16px] px-5 py-2.5"
              >
                Create portal account
              </AuthModalButton>
              <AuthModalButton
                mode="login"
                variant="secondary"
                className="min-h-[48px] rounded-[16px] px-5 py-2.5"
              >
                Log in
              </AuthModalButton>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}

function HeroVisual() {
  return (
    <div className="relative min-h-[420px] overflow-hidden lg:min-h-[540px]">
      <div className="absolute inset-x-[8%] top-[6%] h-[74%] rounded-[40px] border border-white/50 bg-[linear-gradient(145deg,rgba(255,255,255,0.5),rgba(255,255,255,0.14))] shadow-[0_30px_60px_rgba(11,24,77,0.1)] backdrop-blur-xl" />
      <div className="absolute -left-8 top-20 h-52 w-52 rounded-full bg-[radial-gradient(circle,rgba(24,168,59,0.18),transparent_68%)]" />
      <div className="absolute right-0 top-8 h-64 w-64 rounded-full bg-[radial-gradient(circle,rgba(175,213,237,0.36),transparent_70%)]" />

      <div className="absolute right-6 top-0 rounded-[26px] border border-white/60 bg-white/52 px-8 py-6 shadow-[0_16px_36px_rgba(11,24,77,0.08)] backdrop-blur-xl">
        <span className="bg-[linear-gradient(135deg,var(--green),var(--light-blue))] bg-clip-text text-[72px] font-black tracking-[-0.1em] text-transparent">
          NZ
        </span>
      </div>

      <div className="absolute left-[16%] top-[16%] h-48 w-48 rounded-[38px] border border-white/50 bg-white/28 backdrop-blur-md" />
      <div className="absolute left-[28%] top-[24%] h-56 w-56 rounded-[42px] border border-white/45 bg-[linear-gradient(160deg,rgba(255,255,255,0.16),rgba(255,255,255,0.02))]" />

      <div className="absolute inset-x-0 bottom-0 h-[34%] rounded-t-[42px] bg-[linear-gradient(180deg,rgba(4,15,75,0.02),rgba(4,15,75,0.14))]" />
      <div className="absolute bottom-12 left-[8%] h-20 w-20 rounded-full bg-[linear-gradient(180deg,#223168,#10183d)]" />
      <div className="absolute bottom-16 left-[24%] h-16 w-16 rounded-full bg-[linear-gradient(180deg,#223168,#10183d)]" />
      <div className="absolute bottom-10 left-[38%] h-24 w-24 rounded-full bg-[linear-gradient(180deg,#223168,#10183d)]" />
      <div className="absolute bottom-14 right-[11%] h-24 w-24 rounded-full bg-[linear-gradient(180deg,#223168,#10183d)]" />

      <div className="absolute bottom-14 right-[26%] h-56 w-32 rounded-[28px] bg-[linear-gradient(180deg,#0f1f59,#0a133d)] shadow-[0_28px_50px_rgba(11,24,77,0.22)]" />
      <div className="absolute bottom-56 right-[31%] h-16 w-16 rounded-full bg-[linear-gradient(180deg,#f2d6c3,#ca8d6d)]" />
      <div className="absolute bottom-34 right-[38%] h-12 w-[4.5rem] rotate-[14deg] rounded-[20px] bg-[linear-gradient(180deg,#14255f,#0a1337)]" />
      <div className="absolute bottom-34 right-[22%] h-12 w-[4.5rem] -rotate-[14deg] rounded-[20px] bg-[linear-gradient(180deg,#14255f,#0a1337)]" />

      <div className="absolute bottom-7 left-0 max-w-[280px] rounded-[26px] border border-white/60 bg-white/76 p-5 shadow-[0_20px_40px_rgba(11,24,77,0.1)] backdrop-blur-xl">
        <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[color:var(--green)]">
          Presentation impact
        </p>
        <p className="mt-3 text-2xl font-semibold tracking-[-0.04em] text-[color:var(--navy)]">
          Clear, engaging sessions schools can trust.
        </p>
      </div>
    </div>
  );
}

function StepRailItem({
  step,
  title,
  copy,
  icon: Icon,
  isLast
}: {
  step: number;
  title: string;
  copy: string;
  icon: LucideIcon;
  isLast: boolean;
}) {
  return (
    <div className="relative text-center md:px-4 xl:min-h-[290px]">
      {!isLast ? (
        <div className="absolute left-[calc(50%+3rem)] right-[-12%] top-10 hidden border-t border-dashed border-[rgba(4,15,75,0.16)] md:block" />
      ) : null}

      <span className="mx-auto flex h-8 w-8 items-center justify-center rounded-full bg-[color:var(--green)] text-sm font-semibold text-white">
        {step}
      </span>
      <div className="mx-auto mt-5 flex h-16 w-16 items-center justify-center rounded-full border border-[rgba(4,15,75,0.08)] bg-white/82 text-[color:var(--navy)] shadow-[0_14px_32px_rgba(11,24,77,0.08)] backdrop-blur">
        <Icon className="h-5 w-5" />
      </div>
      <h3 className="mt-4 text-2xl font-semibold tracking-[-0.04em] text-[color:var(--navy)]">
        {title}
      </h3>
      <p className="mt-3 text-sm leading-7 text-[color:var(--text-soft)]">{copy}</p>
    </div>
  );
}

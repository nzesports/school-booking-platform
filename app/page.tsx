import Image from "next/image";
import type { LucideIcon } from "lucide-react";
import {
  ArrowRight,
  BookOpenCheck,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Globe,
  GraduationCap,
  UsersRound
} from "lucide-react";

import bookingPlatformVisual from "@/public/media/booking-platform.png";
import { BookPresentationButton } from "@/components/site/book-presentation-button";
import { HeroBookingWidget } from "@/components/site/hero-booking-widget";
import { PresentationCard } from "@/components/site/presentation-card";
import { ButtonLink } from "@/components/ui/button";
import { StarRating } from "@/components/ui/star-rating";
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
        className="public-band relative overflow-hidden border-b border-[rgba(4,15,75,0.06)]"
        style={{ paddingBlock: "1.75rem 2.5rem" }}
      >
        <div className="hero-aurora" />
        <div className="site-shell relative">
          <div className="hero-grid items-center">
            <div className="max-w-3xl self-center py-4">
              <span className="section-kicker">School presentations</span>
              <h1 className="mt-6 text-5xl font-semibold leading-[0.97] tracking-[-0.06em] text-[color:var(--navy)] md:text-7xl">
                {heroSection?.title ? (
                  renderHeroTitle(heroSection.title)
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
                  Free, school-ready presentations on digital wellbeing, screen time, esports
                  careers and pathways, delivered by NZ Esports ambassadors during your school
                  assembly.
                </p>
              )}

              <div className="mt-7 flex flex-wrap gap-3">
                {highlights.map(({ label, icon: Icon }) => (
                  <div
                    key={label}
                    className="inline-flex items-center gap-2 rounded-full border border-white/65 bg-white/85 px-4 py-3 text-sm font-medium text-[color:var(--navy)] shadow-[0_10px_22px_rgba(11,24,77,0.06)]"
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

      <section id="presentations" className="public-band public-band-compact scroll-mt-24">
        <div className="site-shell">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[color:var(--green)]">
              Our presentation topics
            </p>
            <h2 className="mt-3 text-5xl font-semibold tracking-[-0.03em] text-[color:var(--navy)] md:text-[3.4rem]">
              Build the right session mix for your students
            </h2>
            <p className="mt-4 text-base leading-8 text-[color:var(--text-soft)]">
              Book one presentation or combine multiple sessions into a broader visit. Explore
              our presentations designed for school assemblies and student groups.
            </p>
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
        className="public-band public-band-soft public-band-divider py-[clamp(2.75rem,4.5vw,4.25rem)]"
      >
        <div className="site-shell">
          <div className="grid gap-10 xl:grid-cols-[320px_minmax(0,1fr)] xl:items-center">
            <div className="max-w-sm">
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[color:var(--green)]">
                {howItWorksSection?.subtitle ?? "How it works"}
              </p>
              <h2 className="mt-3 text-5xl font-semibold tracking-[-0.03em] text-[color:var(--navy)]">
                {howItWorksSection?.title ?? "Simple steps to bring NZ Esports to your school."}
              </h2>
              {howItWorksSection?.body ? (
                <div
                  className="rich-text-prose mt-4 text-base leading-8 text-[color:var(--text-soft)]"
                  dangerouslySetInnerHTML={{ __html: sanitizeRichText(howItWorksSection.body) }}
                />
              ) : (
                <p className="mt-4 text-base leading-8 text-[color:var(--text-soft)]">
                  Build a visit around your students, select your preferred date, and our team
                  will confirm everything with you.
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
              What schools say after a visit
            </h2>
            <p className="mt-4 text-base leading-8 text-[color:var(--text-soft)]">
              A quick look at the feedback schools share after our presentations.
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
                className="flex h-full flex-col rounded-[30px] border border-[color:var(--border-soft)] bg-white/88 p-7 shadow-[0_18px_42px_rgba(11,24,77,0.08)]"
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

                  <StarRating
                    rating={testimonial.rating ?? 5}
                    fillClassName="text-[#ffb938]"
                    className="mt-0.5"
                  />
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

      <section
        className="public-band public-band-divider"
        style={{
          background: "linear-gradient(135deg, #eaf8ee 0%, #ffffff 55%, #f0faf3 100%)"
        }}
      >
        <div className="site-shell">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:gap-16">
            <div className="max-w-2xl">
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[color:var(--green)]">
                {ctaSection?.subtitle ?? "Book a presentation"}
              </p>
              <h2 className="mt-3 text-4xl font-semibold tracking-[-0.05em] text-[color:var(--navy)]">
                {ctaSection?.title ?? "Bring esports into the conversation, the right way"}
              </h2>
              {ctaSection?.body ? (
                <div
                  className="rich-text-prose mt-4 text-base leading-8 text-[color:var(--text-soft)]"
                  dangerouslySetInnerHTML={{ __html: sanitizeRichText(ctaSection.body) }}
                />
              ) : (
                <p className="mt-4 text-base leading-8 text-[color:var(--text-soft)]">
                  Gaming is already part of students&apos; lives. Invite our ambassadors to help
                  your school create a supportive, balanced conversation around esports, play and
                  positive digital habits.
                </p>
              )}
            </div>

            <div className="flex flex-wrap gap-3 lg:ml-auto lg:mr-24">
              <BookPresentationButton className="min-h-[46px] rounded-[16px] border-[#149238] bg-[color:var(--green)] px-5 py-2.5 text-white shadow-[0_12px_28px_rgba(24,168,59,0.28)] hover:border-[#0f7c2e] hover:bg-[#128a30]">
                Book a free school visit
                <ArrowRight className="h-4 w-4" />
              </BookPresentationButton>
              <ButtonLink
                href="mailto:schools@esf.nz"
                variant="secondary"
                className="min-h-[46px] rounded-[16px] border-[rgba(20,146,56,0.4)] bg-transparent px-5 py-2.5 text-[#117a2e] shadow-none hover:bg-[rgba(24,168,59,0.06)]"
              >
                Contact us
              </ButtonLink>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}

// Renders "esports" in brand green wherever it appears in the CMS-managed
// hero title.
function renderHeroTitle(title: string) {
  return title.split(/(esports\.?)/i).map((part, index) =>
    /^esports\.?$/i.test(part) ? (
      <span key={index} className="text-[color:var(--green)]">
        {part}
      </span>
    ) : (
      part
    )
  );
}

function HeroVisual() {
  return (
    <div className="relative">
      <div className="absolute -left-8 top-20 h-52 w-52 rounded-full bg-[radial-gradient(circle,rgba(24,168,59,0.18),transparent_68%)]" />
      <div className="absolute right-0 top-8 h-64 w-64 rounded-full bg-[radial-gradient(circle,rgba(175,213,237,0.36),transparent_70%)]" />

      <Image
        src={bookingPlatformVisual}
        alt="An NZ Esports presenter delivering a session to a classroom of students"
        priority
        className="relative mx-auto h-auto w-full max-w-[680px] object-contain drop-shadow-[0_30px_60px_rgba(11,24,77,0.16)]"
      />

      <div className="relative -mt-24 ml-auto mr-1 max-w-[230px] rounded-[20px] border border-white/55 bg-white/60 p-4 shadow-[0_16px_36px_rgba(11,24,77,0.14)] backdrop-blur-sm md:mr-4">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--green)]">
          Presentation impact
        </p>
        <p className="mt-2 text-lg font-semibold leading-6 tracking-[-0.03em] text-[color:var(--navy)]">
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
    <div className="relative text-center md:px-4">
      {!isLast ? (
        <div className="absolute left-[calc(50%+3rem)] right-[-12%] top-10 hidden border-t border-dashed border-[rgba(4,15,75,0.16)] md:block" />
      ) : null}

      <span className="mx-auto flex h-8 w-8 items-center justify-center rounded-full bg-[color:var(--green)] text-sm font-semibold text-white">
        {step}
      </span>
      <div className="mx-auto mt-5 flex h-16 w-16 items-center justify-center rounded-full border border-[rgba(4,15,75,0.08)] bg-white/90 text-[color:var(--navy)] shadow-[0_14px_32px_rgba(11,24,77,0.08)]">
        <Icon className="h-5 w-5" />
      </div>
      <h3 className="mt-4 text-2xl font-semibold tracking-[-0.04em] text-[color:var(--navy)]">
        {title}
      </h3>
      <p className="mt-3 text-sm leading-7 text-[color:var(--text-soft)]">{copy}</p>
    </div>
  );
}

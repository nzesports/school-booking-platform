import type { Metadata } from "next";
import Image from "next/image";
import {
  ArrowRight,
  BadgeCheck,
  BookOpenCheck,
  ExternalLink,
  HeartPulse,
  ShieldCheck,
  Sparkles,
  UsersRound
} from "lucide-react";

import beroccaLogo from "@/public/media/berocca-logo.png";
import nzEsportsLogo from "@/public/media/nz-esports-logo-black.png";
import schoolPresentationAudience from "@/public/media/school-3.webp";
import schoolPresentationActivity from "@/public/media/school-4.webp";
import schoolPresentationQuestions from "@/public/media/school-5.webp";
import { BookPresentationButton } from "@/components/site/book-presentation-button";
import { ButtonLink } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "About Us | NZ Esports School Presentations",
  description:
    "Meet NZ Esports and learn why we partnered with Berocca to bring practical gaming, wellbeing and esports pathway presentations to schools across Aotearoa."
};

const values = [
  {
    title: "Inclusive participation",
    copy: "Creating opportunities for every New Zealander to take part and have a voice in esports.",
    icon: UsersRound,
    tone: "bg-[#eaf8ee] text-[#117a2e]"
  },
  {
    title: "Education",
    copy: "Sharing the social, health and educational benefits of gaming with young people and communities.",
    icon: BookOpenCheck,
    tone: "bg-[#eaf4fb] text-[#2879a8]"
  },
  {
    title: "Integrity",
    copy: "Championing safe, controlled competition grounded in fair play and sporting integrity.",
    icon: ShieldCheck,
    tone: "bg-[#fff2e8] text-[#c45e23]"
  },
  {
    title: "Empowerment",
    copy: "Helping people pursue esports confidently across every level of the industry.",
    icon: Sparkles,
    tone: "bg-[#f1ecfb] text-[#7048ad]"
  }
];

export default function AboutPage() {
  return (
    <main>
      <section className="public-band relative overflow-hidden bg-[linear-gradient(135deg,#edf9f2_0%,#f8fbff_52%,#eaf5fb_100%)]">
        <div className="pointer-events-none absolute -left-24 top-10 h-80 w-80 rounded-full bg-[radial-gradient(circle,rgba(24,168,59,0.15),transparent_69%)]" />
        <div className="pointer-events-none absolute -right-28 bottom-[-8rem] h-[32rem] w-[32rem] rounded-full bg-[radial-gradient(circle,rgba(175,213,237,0.48),transparent_68%)]" />

        <div className="site-shell relative grid gap-12 lg:grid-cols-[0.88fr_1.12fr] lg:items-center">
          <div className="max-w-2xl">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[color:var(--green)]">
              About NZ Esports
            </p>
            <h1 className="mt-4 text-5xl leading-[0.98] text-[color:var(--navy)] md:text-7xl">
              Gaming is the starting point. Growth is the destination.
            </h1>
            <p className="mt-7 text-lg leading-8 text-[color:var(--text-soft)]">
              The New Zealand Esports Federation is the sole recognised national sporting
              organisation for esports in Aotearoa. We lead, support and grow esports while
              helping young people, whānau, schools and communities engage with gaming positively
              and with purpose.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <BookPresentationButton className="min-h-[48px] rounded-[16px] border-[#149238] bg-[color:var(--green)] px-6 text-white shadow-[0_14px_30px_rgba(24,168,59,0.24)] hover:border-[#0f7c2e] hover:bg-[#128a30]">
                Book a school presentation
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </BookPresentationButton>
              <ButtonLink
                href="/resources"
                variant="secondary"
                className="min-h-[48px] rounded-[16px] bg-white/75 px-6"
              >
                Explore resources
              </ButtonLink>
            </div>
          </div>

          <div className="relative pb-8 pl-3 sm:pl-8">
            <div className="absolute -right-3 -top-3 h-36 w-36 rounded-[30px] bg-[rgba(24,168,59,0.16)]" />
            <div className="relative overflow-hidden rounded-[38px] border-[7px] border-white bg-white shadow-[0_30px_75px_rgba(11,24,77,0.2)]">
              <Image
                src={schoolPresentationQuestions}
                alt="Students raising their hands during an NZ Esports school presentation"
                priority
                sizes="(min-width: 1024px) 52vw, 92vw"
                className="aspect-[4/3] h-auto w-full object-cover object-center"
              />
            </div>
            <div className="absolute bottom-0 left-0 max-w-[260px] rounded-[22px] border border-white bg-white/95 p-5 shadow-[0_20px_42px_rgba(11,24,77,0.16)]">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--green)]">
                Our vision
              </p>
              <p className="mt-2 text-lg font-semibold leading-6 text-[color:var(--navy)]">
                Unite New Zealanders with each other and the world through esports.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="relative z-10 -mt-5 pb-[clamp(3rem,6vw,6rem)]">
        <div className="site-shell">
          <div className="grid overflow-hidden rounded-[28px] border border-[color:var(--border-soft)] bg-white shadow-[0_24px_58px_rgba(11,24,77,0.1)] md:grid-cols-3">
            <Fact eyebrow="Recognised" value="By Sport NZ since 2020" />
            <Fact eyebrow="Our mission" value="Lead, support and grow esports" />
            <Fact eyebrow="Our reach" value="Schools and communities nationwide" />
          </div>
        </div>
      </section>

      <section className="public-band bg-white">
        <div className="site-shell grid gap-14 lg:grid-cols-[0.8fr_1.2fr] lg:items-start">
          <div className="max-w-xl lg:sticky lg:top-32">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[color:var(--green)]">
              Who we are
            </p>
            <h2 className="mt-4 text-4xl leading-[1.04] text-[color:var(--navy)] md:text-6xl">
              The recognised voice of esports in New Zealand.
            </h2>
            <p className="mt-6 text-base leading-8 text-[color:var(--text-soft)]">
              NZ Esports provides national direction, advocates for the sport and creates pathways
              from community and school participation through to representing Aotearoa as part of
              the E Blacks.
            </p>
            <p className="mt-4 text-base leading-8 text-[color:var(--text-soft)]">
              Our role is bigger than competition. We help schools and families understand gaming,
              promote balanced participation, support safe and fair environments, and show young
              people where the skills they build through play can lead.
            </p>
            <a
              href="https://www.nzesports.org.nz/about/"
              target="_blank"
              rel="noreferrer"
              className="mt-7 inline-flex items-center gap-2 border-b border-[rgba(24,168,59,0.34)] pb-1.5 text-sm font-semibold text-[#117a2e] transition hover:border-[color:var(--green)] hover:text-[color:var(--green)]"
            >
              Visit the NZ Esports website
              <ExternalLink className="h-4 w-4" aria-hidden="true" />
            </a>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {values.map(({ title, copy, icon: Icon, tone }) => (
              <article
                key={title}
                className="rounded-[28px] border border-[color:var(--border-soft)] bg-[#fbfcfe] p-7"
              >
                <span className={`flex h-12 w-12 items-center justify-center rounded-[17px] ${tone}`}>
                  <Icon className="h-5 w-5" aria-hidden="true" />
                </span>
                <h3 className="mt-6 text-xl font-semibold text-[color:var(--navy)]">{title}</h3>
                <p className="mt-3 text-sm leading-7 text-[color:var(--text-soft)]">{copy}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="public-band overflow-hidden bg-[#f4f8fb]">
        <div className="site-shell">
          <div className="max-w-3xl">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[color:var(--green)]">
              In the room
            </p>
            <h2 className="mt-4 text-4xl leading-[1.05] text-[color:var(--navy)] md:text-6xl">
              Practical ideas. Real participation. Better conversations.
            </h2>
          </div>

          <div className="mt-10 grid gap-5 lg:grid-cols-[1.25fr_0.75fr]">
            <figure className="overflow-hidden rounded-[34px] bg-white p-2 shadow-[0_24px_58px_rgba(11,24,77,0.13)]">
              <Image
                src={schoolPresentationAudience}
                alt="An NZ Esports presenter speaking to a school audience about everyday wellbeing"
                sizes="(min-width: 1024px) 60vw, 94vw"
                className="aspect-[16/10] h-full w-full rounded-[28px] object-cover object-left"
              />
            </figure>
            <div className="grid gap-5">
              <figure className="overflow-hidden rounded-[30px] bg-white p-2 shadow-[0_20px_48px_rgba(11,24,77,0.12)]">
                <Image
                  src={schoolPresentationActivity}
                  alt="Students joining an interactive play and life balance activity"
                  sizes="(min-width: 1024px) 34vw, 94vw"
                  className="aspect-[4/3] h-full w-full rounded-[24px] object-cover object-center"
                />
              </figure>
              <div className="rounded-[30px] bg-[color:var(--navy)] p-8 text-white">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#7ee394]">
                  What students experience
                </p>
                <p className="mt-4 text-2xl font-semibold leading-9">
                  Sessions designed to invite questions, spark participation and make wellbeing
                  advice feel relevant to the way young people actually play.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="public-band bg-[#eaf8ee]">
        <div className="site-shell">
          <div className="relative overflow-hidden rounded-[44px] bg-[#118d34] shadow-[0_34px_85px_rgba(11,94,42,0.22)]">
            <div className="pointer-events-none absolute -left-24 -top-28 h-80 w-80 rounded-full border-[58px] border-white/10" />
            <div className="pointer-events-none absolute -bottom-32 left-[35%] h-96 w-96 rounded-full bg-[radial-gradient(circle,rgba(126,227,148,0.24),transparent_68%)]" />

            <div className="relative grid lg:grid-cols-[0.88fr_1.12fr]">
              <div className="flex flex-col p-8 text-white sm:p-12 lg:p-14 xl:p-16">
                <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[#bdf3c9]">
                  Proudly supported by Berocca
                </p>

                <div className="mt-8 flex items-center gap-6 rounded-[30px] border border-white/25 bg-white px-7 py-7 shadow-[0_22px_48px_rgba(4,63,25,0.22)] sm:px-9 sm:py-9">
                  <Image
                    src={nzEsportsLogo}
                    alt="NZ Esports"
                    className="h-24 w-24 shrink-0 object-contain sm:h-28 sm:w-28"
                  />
                  <span className="text-3xl font-semibold text-[color:var(--green)]">×</span>
                  <Image
                    src={beroccaLogo}
                    alt="Berocca"
                    className="h-14 min-w-0 flex-1 object-contain sm:h-20"
                  />
                </div>

                <p className="mt-9 max-w-xl text-2xl font-semibold leading-9 sm:text-3xl sm:leading-10">
                  Their support enables us to bring free, practical presentations directly into
                  schools across Aotearoa.
                </p>

                <div className="mt-9 grid gap-3 sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3">
                  <div className="rounded-[20px] border border-white/20 bg-white/10 px-4 py-4">
                    <p className="text-sm font-semibold text-white">Free for schools</p>
                  </div>
                  <div className="rounded-[20px] border border-white/20 bg-white/10 px-4 py-4">
                    <p className="text-sm font-semibold text-white">Positive and practical</p>
                  </div>
                  <div className="rounded-[20px] border border-white/20 bg-white/10 px-4 py-4">
                    <p className="text-sm font-semibold text-white">Built for young people</p>
                  </div>
                </div>
              </div>

              <div className="m-2 rounded-[38px] bg-white p-8 sm:p-12 lg:m-3 lg:p-14 xl:p-16">
                <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[color:var(--green)]">
                  Why we partnered with Berocca
                </p>
                <h2 className="mt-4 text-4xl leading-[1.03] text-[color:var(--navy)] md:text-6xl">
                  A natural fit for healthier conversations about gaming.
                </h2>
                <p className="mt-7 text-lg leading-8 text-[color:var(--text-soft)]">
                  Berocca&apos;s support helps make this school presentation programme possible. It
                  enables NZ Esports to take engaging, school-ready sessions to students and offer
                  them free of charge, removing cost as a barrier for schools that want to start
                  these important conversations.
                </p>
                <p className="mt-5 text-lg leading-8 text-[color:var(--text-soft)]">
                  The partnership feels natural because our presentations take the same positive,
                  everyday approach to wellbeing. We meet students through something they already
                  care about—gaming—and connect it with practical ideas around balance, movement,
                  sleep, hydration, nutrition and sustained focus.
                </p>
                <div className="mt-8 flex items-start gap-4 rounded-[24px] bg-[color:var(--green-soft)] p-6 sm:p-7">
                  <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[17px] bg-white text-[color:var(--green)] shadow-[0_10px_24px_rgba(11,24,77,0.07)]">
                    <HeartPulse className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <p className="text-base font-medium leading-8 text-[color:var(--navy)]">
                    We love having Berocca&apos;s support in this space. Together, we can give young
                    people useful information without turning the conversation into an anti-gaming
                    lecture.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="public-band public-band-divider bg-[linear-gradient(135deg,#eaf8ee_0%,#ffffff_58%,#eef7fc_100%)]">
        <div className="site-shell flex flex-col gap-7 lg:flex-row lg:items-center lg:justify-between">
          <div className="max-w-3xl">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[color:var(--green)]">
              Bring the conversation to your school
            </p>
            <h2 className="mt-3 text-4xl leading-tight text-[color:var(--navy)] md:text-5xl">
              Let&apos;s help students see where gaming can take them.
            </h2>
          </div>
          <BookPresentationButton className="min-h-[50px] shrink-0 rounded-[16px] border-[#149238] bg-[color:var(--green)] px-6 text-white shadow-[0_14px_30px_rgba(24,168,59,0.24)] hover:border-[#0f7c2e] hover:bg-[#128a30]">
            Book a presentation
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </BookPresentationButton>
        </div>
      </section>
    </main>
  );
}

function Fact({ eyebrow, value }: { eyebrow: string; value: string }) {
  return (
    <div className="flex items-start gap-4 border-b border-[color:var(--border-soft)] p-6 last:border-b-0 md:border-b-0 md:border-r md:last:border-r-0 lg:p-8">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[color:var(--green-soft)] text-[color:var(--green)]">
        <BadgeCheck className="h-5 w-5" aria-hidden="true" />
      </span>
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.15em] text-[color:var(--green)]">
          {eyebrow}
        </p>
        <p className="mt-2 font-semibold leading-6 text-[color:var(--navy)]">{value}</p>
      </div>
    </div>
  );
}

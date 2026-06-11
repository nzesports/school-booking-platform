import Link from "next/link";
import type { ReactNode } from "react";

import { BrandLockup } from "@/components/site/brand-lockup";
import { cn } from "@/lib/utils";

type AuthShellTab = {
  href: string;
  label: string;
  active?: boolean;
};

type AuthShellHighlight = {
  title: string;
  description: string;
};

export function AuthSplitShell({
  tabs,
  heroEyebrow,
  heroTitle,
  heroDescription,
  heroHighlights = [],
  heroFootnote,
  children,
  className,
  contentClassName
}: {
  tabs: AuthShellTab[];
  heroEyebrow?: string;
  heroTitle: string;
  heroDescription?: string;
  heroHighlights?: AuthShellHighlight[];
  heroFootnote?: string;
  children: ReactNode;
  className?: string;
  contentClassName?: string;
}) {
  return (
    <main className="pb-0 pt-0">
      <section className="relative w-full public-band-soft border-b border-[rgba(4,15,75,0.06)] py-[clamp(0.5rem,1.3vw,1rem)]">
        <div className="site-shell">
          <div
            className={cn(
              "surface-panel overflow-hidden rounded-[40px] border-white/70",
              className
            )}
          >
            <div className="grid lg:grid-cols-[minmax(280px,0.72fr)_minmax(0,1.68fr)]">
              <aside className="relative overflow-hidden border-b border-[rgba(4,15,75,0.08)] bg-[linear-gradient(180deg,rgba(255,255,255,0.9),rgba(238,247,252,0.92))] p-6 md:p-7 lg:border-b-0 lg:border-r lg:p-8">
                <div className="relative z-10 flex h-full flex-col">
                  <BrandLockup subtitle="Secure portals" />

                  {heroEyebrow ? (
                    <span className="section-kicker mt-7 w-fit">{heroEyebrow}</span>
                  ) : null}

                  <div className={cn("max-w-2xl", heroEyebrow ? "mt-5" : "mt-8")}>
                    <h1 className="max-w-[12ch] text-[2.9rem] font-semibold leading-[0.98] tracking-[-0.06em] text-[color:var(--navy)] md:text-[3.35rem]">
                      {heroTitle}
                    </h1>
                    {heroDescription ? (
                      <p className="mt-4 max-w-xl text-[0.98rem] leading-7 text-[color:var(--text-soft)] md:text-[1.05rem]">
                        {heroDescription}
                      </p>
                    ) : null}
                  </div>

                  {heroHighlights.length > 0 ? (
                    <div className="mt-6 grid gap-3 md:max-w-xl">
                      {heroHighlights.map((highlight) => (
                        <div
                          key={highlight.title}
                          className="rounded-[24px] border border-white/80 bg-white/72 px-4 py-4 shadow-[0_18px_38px_rgba(11,24,77,0.08)] backdrop-blur-sm"
                        >
                          <p className="text-sm font-semibold text-[color:var(--navy)]">
                            {highlight.title}
                          </p>
                          <p className="mt-1 text-sm leading-7 text-[color:var(--text-soft)]">
                            {highlight.description}
                          </p>
                        </div>
                      ))}
                    </div>
                  ) : null}

                  {heroFootnote ? (
                    heroHighlights.length > 0 ? (
                      <div className="mt-5 rounded-[26px] border border-[rgba(4,15,75,0.08)] bg-[linear-gradient(135deg,rgba(255,255,255,0.72),rgba(234,248,238,0.86))] px-5 py-4 text-sm leading-7 text-[color:var(--navy)] shadow-[0_18px_38px_rgba(11,24,77,0.08)]">
                        {heroFootnote}
                      </div>
                    ) : (
                      <p className="mt-5 max-w-xl text-[0.98rem] leading-7 text-[color:var(--text-soft)] md:text-[1.05rem]">
                        {heroFootnote}
                      </p>
                    )
                  ) : null}
                </div>

                <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(71,201,106,0.12),transparent_32%),radial-gradient(circle_at_top_left,rgba(175,213,237,0.32),transparent_42%)]" />
                <div className="pointer-events-none absolute -bottom-16 left-[-10%] h-44 w-[70%] rotate-[-22deg] rounded-[40px] bg-[linear-gradient(135deg,rgba(4,15,75,0.08),rgba(175,213,237,0.18))]" />
                <div className="pointer-events-none absolute bottom-[-9%] left-[13%] h-36 w-24 rotate-[-22deg] rounded-[30px] border border-white/70 bg-white/48 backdrop-blur-sm" />
                <div className="pointer-events-none absolute bottom-[-16%] left-[30%] h-52 w-28 rotate-[-22deg] rounded-[30px] border border-white/60 bg-[rgba(175,213,237,0.18)]" />
              </aside>

              <div className={cn("bg-white/76 p-6 md:p-7 lg:p-8 xl:p-10", contentClassName)}>
                <nav className="grid grid-cols-2 gap-2 rounded-full border border-[rgba(4,15,75,0.08)] bg-[rgba(247,250,252,0.92)] p-1.5">
                  {tabs.map((tab) => (
                    <Link
                      key={tab.href + tab.label}
                      href={tab.href}
                      aria-current={tab.active ? "page" : undefined}
                      className={cn(
                        "inline-flex min-h-[46px] items-center justify-center rounded-full px-5 text-sm font-semibold transition",
                        tab.active
                          ? "bg-[linear-gradient(135deg,rgba(175,213,237,0.92),rgba(234,248,238,0.96))] text-[color:var(--navy)] shadow-[0_10px_24px_rgba(11,24,77,0.08)]"
                          : "text-[color:var(--text-soft)] hover:bg-white hover:text-[color:var(--navy)]"
                      )}
                    >
                      {tab.label}
                    </Link>
                  ))}
                </nav>

                <div className="mt-6">{children}</div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}

"use client";

import Link from "next/link";
import { ArrowRight, Instagram, Linkedin, Mail, Youtube } from "lucide-react";
import { useRef } from "react";

import { BrandLockup } from "@/components/site/brand-lockup";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function SiteFooter({
  compact = false,
  subscribeAction,
  returnTo = "/#contact",
  subscribeFeedback
}: {
  compact?: boolean;
  subscribeAction: (formData: FormData) => void | Promise<void>;
  returnTo?: string;
  subscribeFeedback?: "success" | "invalid" | "failed" | "blocked";
}) {
  const formStartedAtRef = useRef<HTMLInputElement>(null);
  const socialLinks = [
    {
      href: "https://instagram.com/esports_nz",
      label: "NZ Esports Instagram",
      icon: Instagram
    },
    {
      href: "https://www.youtube.com/channel/UCj9SB5NjUbgzVLKDn4Tmiyw",
      label: "NZ Esports YouTube",
      icon: Youtube
    },
    {
      href: "https://nz.linkedin.com/company/nz-esports",
      label: "NZ Esports LinkedIn",
      icon: Linkedin
    },
    {
      href: "mailto:schools@esf.nz",
      label: "Email NZ Esports schools team",
      icon: Mail
    }
  ];
  const subscribeMessage =
    subscribeFeedback === "success"
      ? "Thanks, you're on the list."
      : subscribeFeedback === "invalid"
        ? "Please enter a valid email address."
        : subscribeFeedback === "blocked"
          ? "Please wait a moment, then try again."
          : subscribeFeedback === "failed"
            ? "Sorry, we couldn't add that email. Please try again."
            : null;
  const subscribeMessageClass =
    subscribeFeedback === "success" ? "text-[#117a2e]" : "text-[#b3372e]";

  function markFormStarted() {
    const field = formStartedAtRef.current;

    if (field && !field.value) {
      field.value = Date.now().toString();
    }
  }

  return (
    <footer
      id="contact"
      className="border-t border-[rgba(4,15,75,0.08)] bg-[linear-gradient(180deg,rgba(247,250,252,0.66),rgba(238,247,252,0.94))]"
    >
      <div
        className={cn(
          "site-shell grid lg:grid-cols-[1.1fr_0.7fr_0.7fr_1fr]",
          compact
            ? "gap-6 py-[clamp(1rem,1.8vw,1.45rem)]"
            : "gap-10 py-[clamp(3rem,6vw,5rem)]"
        )}
      >
        <div id="about">
          <a
            href="https://www.nzesports.org.nz/"
            aria-label="Visit the NZ Esports website"
            className="inline-flex"
            target="_blank"
            rel="noreferrer"
          >
            <BrandLockup size="footer" />
          </a>
          <p className="mt-4 max-w-sm text-sm leading-7 text-[color:var(--text-soft)]">
            <a
              href="https://www.nzesports.org.nz/"
              className="font-semibold text-[color:var(--navy)] underline-offset-4 transition hover:text-[color:var(--green)] hover:underline"
              target="_blank"
              rel="noreferrer"
            >
              NZ Esports
            </a>{" "}
            supports schools across Aotearoa New Zealand with free esports education,
            student presentations, healthy gaming guidance and pathways into the wider digital
            and esports ecosystem.
          </p>
          <div className="mt-5 flex gap-3 text-[color:var(--navy)]">
            {socialLinks.map(({ href, label, icon: Icon }) => (
              <a
                key={label}
                href={href}
                aria-label={label}
                className="flex h-10 w-10 items-center justify-center rounded-full border border-[color:var(--border-soft)] bg-white/80 transition hover:-translate-y-0.5 hover:border-[rgba(4,15,75,0.16)]"
                target={href.startsWith("mailto:") ? undefined : "_blank"}
                rel={href.startsWith("mailto:") ? undefined : "noreferrer"}
              >
                <Icon className="h-4 w-4" />
              </a>
            ))}
          </div>
        </div>

        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[color:var(--text-soft)]">
            Explore
          </p>
          <div className="mt-4 grid gap-3 text-sm text-[color:var(--navy)]">
            <Link href="/#for-schools">For Schools</Link>
            <Link href="/#how-it-works">How It Works</Link>
            <Link href="/#regions">Regions</Link>
            <Link href="/#about">About Us</Link>
            <a href="mailto:schools@esf.nz">Contact</a>
          </div>
        </div>

        <div id="resources">
          <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[color:var(--text-soft)]">
            Presentations
          </p>
          <div className="mt-4 grid gap-3 text-sm text-[color:var(--navy)]">
            <Link href="/presentations/digital-wellbeing">Digital Wellbeing</Link>
            <Link href="/presentations/esports-pathways">Esports Pathways</Link>
            <Link href="/presentations/careers">Careers</Link>
            <Link href="/presentations/understanding-esports">Understanding Esports</Link>
          </div>
        </div>

        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[color:var(--text-soft)]">
            Stay in the loop
          </p>
          <p className="mt-4 text-sm leading-7 text-[color:var(--text-soft)]">
            Get updates, resources, and esports news straight to your inbox.
          </p>
          <form
            action={subscribeAction}
            onFocusCapture={markFormStarted}
            onPointerEnter={markFormStarted}
            className="mt-5 flex items-center gap-3 rounded-[18px] border border-[color:var(--border-soft)] bg-white/82 p-2"
          >
            <input type="hidden" name="returnTo" value={returnTo} />
            <input ref={formStartedAtRef} type="hidden" name="startedAt" />
            <input
              className="hidden"
              name="website2"
              tabIndex={-1}
              autoComplete="off"
              aria-hidden="true"
            />
            <input
              name="email"
              type="email"
              placeholder="Enter your email"
              required
              autoComplete="email"
              className="min-w-0 flex-1 border-none bg-transparent px-3 py-2 text-sm outline-none placeholder:text-[color:var(--text-soft)]"
            />
            <Button type="submit" className="h-11 min-h-[44px] w-11 rounded-[14px] px-0 py-0">
              <ArrowRight className="h-4 w-4" />
            </Button>
          </form>
          {subscribeMessage ? (
            <p
              className={cn("mt-3 text-sm font-semibold", subscribeMessageClass)}
              role="status"
              aria-live="polite"
            >
              {subscribeMessage}
            </p>
          ) : null}
        </div>
      </div>

      <div className="border-t border-[rgba(4,15,75,0.08)]">
        <div
          className={cn(
            "site-shell flex flex-col gap-2 text-sm text-[color:var(--text-soft)] md:flex-row md:items-center md:justify-between",
            compact ? "py-3" : "py-4"
          )}
        >
          <p>
            &copy; 2026{" "}
            <a
              href="https://www.nzesports.org.nz/"
              className="font-semibold text-[color:var(--navy)] underline-offset-4 transition hover:text-[color:var(--green)] hover:underline"
              target="_blank"
              rel="noreferrer"
            >
              NZ Esports
            </a>
            . All rights reserved.{" "}
            <a
              href="https://www.nzesports.org.nz/privacypolicy/"
              className="font-semibold text-[color:var(--navy)] underline-offset-4 transition hover:text-[color:var(--green)] hover:underline"
              target="_blank"
              rel="noreferrer"
            >
              Privacy Policy
            </a>
          </p>
          <p>Proudly designed for school presentation operations in Aotearoa New Zealand.</p>
        </div>
      </div>
    </footer>
  );
}

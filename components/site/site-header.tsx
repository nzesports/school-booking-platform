"use client";

import { Menu, X } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { AuthModalButton } from "@/components/auth/auth-modal-trigger";
import { BrandLockup } from "@/components/site/brand-lockup";
import { BookPresentationButton } from "@/components/site/book-presentation-button";

const navItems = [
  { href: "/#presentations", label: "Presentations" },
  { href: "/#how-it-works", label: "How It Works" },
  { href: "/#resources", label: "Resources" },
  { href: "/#about", label: "About" },
  { href: "/#contact", label: "Contact" }
];

export function SiteHeader() {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="site-navbar sticky top-0 z-50">
      <header className="site-shell flex min-h-[92px] items-center justify-between gap-4 py-4">
        <BrandLockup compact size="nav" />

        <nav className="hidden items-center gap-7 text-sm font-medium text-[color:var(--navy)] xl:flex">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="transition hover:text-[color:var(--green)]"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-3">
          <AuthModalButton
            mode="signup"
            role="school"
            variant="ghost"
            className="hidden min-h-[40px] rounded-[13px] px-4 py-2 text-sm lg:inline-flex"
          >
            Sign up
          </AuthModalButton>
          <AuthModalButton
            mode="login"
            variant="secondary"
            className="hidden min-h-[40px] rounded-[13px] px-4 py-2 text-sm sm:inline-flex"
          >
            Log in
          </AuthModalButton>
          <BookPresentationButton className="hidden min-h-[40px] rounded-[13px] px-5 py-2 text-sm xl:inline-flex">
            Book a Presentation
          </BookPresentationButton>

          <button
            type="button"
            onClick={() => setMenuOpen((open) => !open)}
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            aria-expanded={menuOpen}
            className="inline-flex h-10 w-10 items-center justify-center rounded-[13px] border border-[color:var(--border-soft)] bg-white/85 text-[color:var(--navy)] xl:hidden"
          >
            {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </header>

      {menuOpen ? (
        <div className="site-shell pb-5 xl:hidden">
          <nav className="grid gap-1 rounded-[22px] border border-[color:var(--border-soft)] bg-white/96 p-3 shadow-[0_20px_44px_rgba(11,24,77,0.12)]">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMenuOpen(false)}
                className="rounded-[14px] px-4 py-3 text-sm font-medium text-[color:var(--navy)] transition hover:bg-[color:var(--blue-soft)]"
              >
                {item.label}
              </Link>
            ))}

            <div className="mt-2 grid gap-2 border-t border-[color:var(--border-soft)] pt-3">
              <BookPresentationButton className="min-h-[42px] w-full rounded-[13px] px-4 py-1.5 text-[13px]">
                Book a Presentation
              </BookPresentationButton>
              <div className="grid grid-cols-2 gap-2">
                <AuthModalButton
                  mode="signup"
                  role="school"
                  variant="secondary"
                  className="min-h-[40px] w-full rounded-[13px] px-3 py-1.5 text-[13px]"
                >
                  Sign up
                </AuthModalButton>
                <AuthModalButton
                  mode="login"
                  variant="secondary"
                  className="min-h-[40px] w-full rounded-[13px] px-3 py-1.5 text-[13px]"
                >
                  Log in
                </AuthModalButton>
              </div>
            </div>
          </nav>
        </div>
      ) : null}
    </div>
  );
}

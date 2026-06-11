import Link from "next/link";

import { AuthModalButton } from "@/components/auth/auth-modal-trigger";
import { BrandLockup } from "@/components/site/brand-lockup";
import { BookPresentationButton } from "@/components/site/book-presentation-button";

const navItems = [
  { href: "/presentations", label: "Presentations" },
  { href: "/#how-it-works", label: "How It Works" },
  { href: "/#resources", label: "Resources" },
  { href: "/#about", label: "About" },
  { href: "/#contact", label: "Contact" }
];

export function SiteHeader() {
  return (
    <div className="site-navbar relative z-20">
      <header className="site-shell flex min-h-[94px] items-center justify-between gap-6 py-5">
        <BrandLockup compact />

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

        <div className="flex items-center gap-2.5">
          <AuthModalButton
            mode="signup"
            role="school"
            variant="ghost"
            className="hidden min-h-[44px] rounded-[16px] px-4 py-2 lg:inline-flex"
          >
            Sign up
          </AuthModalButton>
          <AuthModalButton
            mode="login"
            variant="secondary"
            className="min-h-[46px] rounded-[16px] px-5 py-2.5"
          >
            Log in
          </AuthModalButton>
          <BookPresentationButton className="hidden min-h-[46px] rounded-[16px] px-5 py-2.5 xl:inline-flex">
            Book a Presentation
          </BookPresentationButton>
        </div>
      </header>
    </div>
  );
}

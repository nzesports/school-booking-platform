import Link from "next/link";

import { BrandLockup } from "@/components/site/brand-lockup";
import { BookPresentationButton } from "@/components/site/book-presentation-button";
import { ButtonLink } from "@/components/ui/button";

const navItems = [
  { href: "/presentations", label: "Presentations" },
  { href: "/#how-it-works", label: "How It Works" },
  { href: "/#resources", label: "Resources" },
  { href: "/#about", label: "About" },
  { href: "/#contact", label: "Contact" }
];

export function SiteHeader() {
  return (
    <div className="relative z-20 border-b border-[rgba(4,15,75,0.06)] bg-[rgba(248,251,255,0.88)]">
      <header className="site-shell flex min-h-[84px] items-center justify-between gap-6 py-4">
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
          <ButtonLink
            href="/ambassador-signup"
            variant="ghost"
            className="hidden min-h-[44px] rounded-[16px] px-4 py-2 lg:inline-flex"
          >
            Ambassadors
          </ButtonLink>
          <BookPresentationButton className="min-h-[46px] rounded-[16px] px-5 py-2.5">
            Book a Presentation
          </BookPresentationButton>
        </div>
      </header>
    </div>
  );
}

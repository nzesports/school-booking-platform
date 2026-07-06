import Image from "next/image";
import Link from "next/link";

import beroccaLogo from "@/public/media/berocca-logo.png";
import nzEsportsLogo from "@/public/media/nz-esports-logo-black.png";
import { cn } from "@/lib/utils";

export function BrandLockup({
  className,
  subtitle,
  compact = false,
  size = "default"
}: {
  className?: string;
  subtitle?: string;
  compact?: boolean;
  size?: "default" | "nav" | "footer";
}) {
  const isNav = size === "nav";
  const isFooter = size === "footer";

  return (
    <Link
      href="/"
      className={cn(
        "inline-flex items-center",
        isNav ? "gap-3.5 md:gap-4" : isFooter ? "gap-3.5" : "gap-3",
        className
      )}
    >
      <Image
        src={nzEsportsLogo}
        alt="NZ Esports"
        priority
        className={cn(
          "shrink-0 object-contain",
          isNav
            ? "h-14 w-14 md:h-[4.25rem] md:w-[4.25rem]"
            : isFooter
              ? "h-14 w-14 md:h-16 md:w-16"
              : "h-12 w-12 md:h-14 md:w-14"
        )}
      />
      <span
        aria-hidden
        className={cn(
          "w-px shrink-0 bg-[rgba(4,15,75,0.14)]",
          isNav ? "h-10 md:h-12" : isFooter ? "h-11" : "h-9"
        )}
      />
      <div className="grid gap-1">
        <Image
          src={beroccaLogo}
          alt="Berocca"
          className={cn(
            "w-auto object-contain",
            isNav ? "h-7 md:h-8" : isFooter ? "h-7 md:h-[1.9rem]" : "h-6"
          )}
        />
        {!compact ? (
          <span className="text-xs font-medium text-[color:var(--text-soft)]">
            {subtitle ?? "School presentations"}
          </span>
        ) : null}
      </div>
    </Link>
  );
}

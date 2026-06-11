import Link from "next/link";
import type { ButtonHTMLAttributes, ComponentProps, PropsWithChildren } from "react";

import { cn } from "@/lib/utils";

const variants = {
  primary:
    "border-[#a2cae3] bg-[#afd5ed] text-[color:var(--navy)] shadow-[0_12px_28px_rgba(94,134,165,0.18)] hover:border-[#97c3de] hover:bg-[#c0dff2]",
  secondary:
    "border-[color:rgba(4,15,75,0.12)] bg-white text-[color:var(--navy)] shadow-[0_10px_24px_rgba(11,24,77,0.08)] hover:border-[color:rgba(4,15,75,0.18)] hover:bg-[#fbfdff]",
  ghost:
    "border-transparent bg-transparent text-[color:var(--navy)] shadow-none hover:bg-white/70",
  danger:
    "border-[#f3b4b4] bg-[#fff6f6] text-[#9d2424] shadow-[0_10px_24px_rgba(157,36,36,0.1)] hover:bg-[#fff0f0]"
} as const;

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: keyof typeof variants;
};

export function Button({
  className,
  variant = "primary",
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        "inline-flex min-h-[48px] items-center justify-center gap-2.5 rounded-[18px] border px-5 py-2.5 text-sm font-semibold transition duration-200 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[rgba(4,15,75,0.14)] disabled:cursor-not-allowed disabled:opacity-60",
        variants[variant],
        className
      )}
      {...props}
    />
  );
}

type ButtonLinkProps = PropsWithChildren<
  ComponentProps<typeof Link> & {
    className?: string;
    variant?: keyof typeof variants;
  }
>;

export function ButtonLink({
  className,
  children,
  variant = "primary",
  ...props
}: ButtonLinkProps) {
  return (
    <Link
      className={cn(
        "inline-flex min-h-[48px] items-center justify-center gap-2.5 rounded-[18px] border px-5 py-2.5 text-sm font-semibold transition duration-200 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[rgba(4,15,75,0.14)]",
        variants[variant],
        className
      )}
      {...props}
    >
      {children}
    </Link>
  );
}

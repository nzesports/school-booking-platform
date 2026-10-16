"use client";

import Link, { useLinkStatus } from "next/link";
import { LoaderCircle } from "lucide-react";
import { useFormStatus } from "react-dom";
import type { ButtonHTMLAttributes, ComponentProps, PropsWithChildren } from "react";

import { cn } from "@/lib/utils";

const variants = {
  primary:
    "border-[#c4d9ed] bg-[#e8f1fd] text-[color:var(--navy)] shadow-[0_3px_10px_rgba(67,111,151,0.10)] hover:border-[#afcce6] hover:bg-[#dceafa]",
  secondary:
    "border-[color:rgba(4,15,75,0.12)] bg-white text-[color:var(--navy)] shadow-[0_3px_10px_rgba(11,24,77,0.06)] hover:border-[color:rgba(4,15,75,0.18)] hover:bg-[#fbfdff]",
  ghost:
    "border-transparent bg-transparent text-[color:var(--navy)] shadow-none hover:bg-white/70",
  danger:
    "border-[#f3b4b4] bg-[#fff6f6] text-[#9d2424] shadow-[0_3px_10px_rgba(157,36,36,0.08)] hover:bg-[#fff0f0]"
} as const;

// The one size every action button in the app uses. It applies in `unstyled`
// mode too, so a call site that brings its own colours still matches everything
// else. Sizing lives only here — call sites pass colour and layout, not size.
const BUTTON_SIZE =
  "inline-flex min-h-[36px] items-center justify-center gap-1.5 rounded-[8px] px-4 py-[9px] text-[12px] font-semibold leading-[16px] [&>svg]:order-first [&>svg]:h-3.5 [&>svg]:w-3.5 [&>svg]:shrink-0";

const BUTTON_BASE =
  BUTTON_SIZE +
  " border transition duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(4,15,75,0.14)] disabled:cursor-not-allowed disabled:opacity-60";

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: keyof typeof variants;
  pendingLabel?: string;
  loading?: boolean;
  unstyled?: boolean;
};

export function Button({
  className,
  variant = "primary",
  type = "button",
  pendingLabel = "Working…",
  loading = false,
  unstyled = false,
  children,
  disabled,
  ...props
}: ButtonProps) {
  const { pending } = useFormStatus();
  const busy = loading || (type === "submit" && pending);
  return (
    <button
      type={type}
      className={
        unstyled
          ? cn(BUTTON_SIZE, "transition disabled:cursor-wait disabled:opacity-60", className)
          : cn(BUTTON_BASE, variants[variant], className)
      }
      {...props}
      disabled={disabled || busy}
      aria-disabled={disabled || busy}
      aria-busy={busy || undefined}
    >
      {busy ? <LoaderCircle className={cn("h-3.5 w-3.5 animate-spin", unstyled && "mr-2")} aria-hidden="true" /> : null}
      {busy ? <span role="status">{pendingLabel}</span> : children}
    </button>
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
  href,
  ...props
}: ButtonLinkProps) {
  const classes = cn(
    BUTTON_BASE,
    variants[variant],
    className
  );

  if (typeof href === "string" && /^(mailto|tel):/i.test(href)) {
    return (
      <a
        href={href}
        className={classes}
        onClick={props.onClick}
        target={props.target}
        rel={props.rel}
        title={props.title}
        aria-label={props["aria-label"]}
      >
        {children}
      </a>
    );
  }

  return (
    <Link
      href={href}
      className={classes}
      {...props}
    >
      <LinkPendingIndicator />
      {children}
    </Link>
  );
}

function LinkPendingIndicator() {
  const { pending } = useLinkStatus();
  return pending ? (
    <span role="status" aria-label="Loading page">
      <LoaderCircle className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
    </span>
  ) : null;
}

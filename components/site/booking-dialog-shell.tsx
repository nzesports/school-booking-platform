import { useId, type ReactNode } from "react";
import { X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { cn } from "@/lib/utils";

export function BookingDialogShell({
  title,
  kicker,
  description,
  descriptionDisplay = "text",
  descriptionClassName,
  onClose,
  children,
  headerAside,
  maxWidthClassName = "max-w-[1180px]",
  bodyClassName,
  overlayClassName,
  contentClassName,
  compact = false,
  closeOnOverlayClick = true,
  pinnedHeader = false,
  headerBelow,
  headerActions
}: {
  title: string;
  kicker?: string;
  description?: string;
  // "tooltip" tucks explanatory prose behind a "?" beside the title (dashboard
  // dialogs); "text" keeps it as a visible paragraph (public site, data lines,
  // and instructions the user must read before acting).
  descriptionDisplay?: "text" | "tooltip";
  descriptionClassName?: string;
  onClose: () => void;
  children: ReactNode;
  headerAside?: ReactNode;
  maxWidthClassName?: string;
  bodyClassName?: string;
  overlayClassName?: string;
  contentClassName?: string;
  compact?: boolean;
  // Long data-entry forms pass false so a stray click outside can't discard
  // what's been typed; they close only from their own buttons.
  closeOnOverlayClick?: boolean;
  // Keeps the title, headerAside, headerBelow (e.g. tabs) and close button
  // fixed at the top while only the body scrolls, so long dialogs can always
  // be closed without scrolling back up.
  pinnedHeader?: boolean;
  headerBelow?: ReactNode;
  // Small controls shown right before the close button (e.g. previous/next).
  headerActions?: ReactNode;
}) {
  const titleId = useId();

  if (pinnedHeader) {
    return (
      <div
        className={cn(
          "fixed inset-0 z-[70] flex items-start justify-center bg-[rgba(4,15,75,0.55)] p-2 sm:p-3 lg:p-4",
          overlayClassName
        )}
        onClick={(event) => {
          if (closeOnOverlayClick && event.target === event.currentTarget) {
            onClose();
          }
        }}
        role="presentation"
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          className={cn(
            "flex max-h-[calc(100dvh-1rem)] w-full flex-col overflow-hidden rounded-[24px] border border-white/70 bg-[linear-gradient(180deg,rgba(255,255,255,0.99),rgba(247,250,252,1))] shadow-[0_36px_80px_rgba(11,24,77,0.22)] sm:max-h-[calc(100dvh-1.5rem)] sm:rounded-[30px] lg:max-h-[calc(100dvh-2rem)]",
            maxWidthClassName,
            contentClassName
          )}
        >
          <header className="shrink-0 border-b border-slate-200/80 bg-white/95 px-4 pt-4 sm:px-6 sm:pt-5 lg:px-8">
            <div className="flex items-start gap-3">
              <div className="min-w-0 flex-1">
                {kicker ? (
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[color:var(--green)]">
                    {kicker}
                  </p>
                ) : null}
                <h2
                  id={titleId}
                  className={cn(
                    "break-words font-semibold leading-[1.1] tracking-[-0.04em] text-[color:var(--navy)]",
                    "text-[1.2rem] sm:text-[1.5rem] lg:text-[1.75rem]",
                    kicker && "mt-1"
                  )}
                >
                  {title}
                </h2>
                {description ? (
                  <p className="mt-1 text-sm leading-6 text-[color:var(--text-soft)]">{description}</p>
                ) : null}
              </div>
              {headerAside ? <div className="hidden shrink-0 sm:block">{headerAside}</div> : null}
              {headerActions}
              <Button
                type="button"
                variant="ghost"
                onClick={onClose}
                aria-label="Close dialog"
                className="shrink-0 border border-[rgba(4,15,75,0.08)] bg-white"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            {headerAside ? <div className="mt-3 sm:hidden">{headerAside}</div> : null}
            <div className={cn(headerBelow ? "mt-2" : "pb-4 sm:pb-5")}>{headerBelow}</div>
          </header>
          <div
            data-dialog-scroll
            className={cn(
              "min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-5 sm:px-6 lg:px-8 lg:py-6",
              bodyClassName
            )}
          >
            {children}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "fixed inset-0 z-[70] overflow-y-auto bg-[rgba(4,15,75,0.55)] px-3 py-3 lg:px-4 lg:py-4",
        overlayClassName
      )}
      onClick={(event) => {
        if (closeOnOverlayClick && event.target === event.currentTarget) {
          onClose();
        }
      }}
      role="presentation"
    >
      {/* Stays pinned to the viewport so mobile users can always close, even
          after scrolling a long form. */}
      <button
        type="button"
        onClick={onClose}
        aria-label="Close dialog"
        className="fixed right-3 top-3 z-20 inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/40 bg-[rgba(4,15,75,0.6)] text-white shadow-[0_3px_10px_rgba(4,15,75,0.3)] lg:hidden"
      >
        <X className="h-4 w-4" />
      </button>

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={cn(
          "mx-auto w-full rounded-[34px] border border-white/70 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(247,250,252,0.99))] shadow-[0_36px_80px_rgba(11,24,77,0.22)]",
          maxWidthClassName,
          contentClassName
        )}
      >
        <div
          className={cn(
            compact
              ? "px-5 py-5 md:px-6 md:py-6"
              : "px-5 py-5 md:px-8 md:py-6 lg:px-10 lg:py-7",
            bodyClassName
          )}
        >
          <div
            className={cn(
              "relative",
              headerAside &&
                "lg:grid lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start lg:gap-8 lg:pr-20"
            )}
          >
            <div className="absolute right-0 top-0 flex items-center gap-1.5">
              {headerActions}
              <Button
                type="button"
                variant="ghost"
                onClick={onClose}
                className="shrink-0 border border-[rgba(4,15,75,0.08)] bg-white/78"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            <div className={cn(headerActions ? "pr-48" : "pr-16 lg:pr-20", headerAside && "lg:pr-0")}>
              {kicker ? (
                <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[color:var(--green)]">
                  {kicker}
                </p>
              ) : null}
              <div className={cn("flex items-center gap-2", kicker && "mt-2")}>
                <h2
                  id={titleId}
                  className={cn(
                    "font-semibold leading-[1.02] tracking-[-0.05em] text-[color:var(--navy)]",
                    compact
                      ? "text-[1.45rem] md:text-[1.8rem]"
                      : "max-w-[19ch] text-[2.2rem] leading-[0.98] tracking-[-0.06em] md:max-w-[23ch] md:text-[3rem] xl:max-w-none"
                  )}
                >
                  {title}
                </h2>
                {description && descriptionDisplay === "tooltip" ? (
                  <InfoTooltip label={title}>{description}</InfoTooltip>
                ) : null}
              </div>
              {description && descriptionDisplay === "text" ? (
                <p
                  className={cn(
                    "mt-3 max-w-4xl text-base leading-8 text-[color:var(--text-soft)]",
                    descriptionClassName
                  )}
                >
                  {description}
                </p>
              ) : null}
            </div>

            {headerAside ? (
              <div className="mt-6 flex justify-start sm:justify-end lg:mt-0 lg:pr-0">
                {headerAside}
              </div>
            ) : null}
          </div>

          {children}
        </div>
      </div>
    </div>
  );
}

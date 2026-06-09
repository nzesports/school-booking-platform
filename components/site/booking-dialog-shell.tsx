import { useId, type ReactNode } from "react";
import { X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function BookingDialogShell({
  title,
  kicker,
  description,
  onClose,
  children,
  headerAside,
  maxWidthClassName = "max-w-[1180px]",
  bodyClassName,
  overlayClassName,
  contentClassName
}: {
  title: string;
  kicker: string;
  description?: string;
  onClose: () => void;
  children: ReactNode;
  headerAside?: ReactNode;
  maxWidthClassName?: string;
  bodyClassName?: string;
  overlayClassName?: string;
  contentClassName?: string;
}) {
  const titleId = useId();

  return (
    <div
      className={cn(
        "fixed inset-0 z-[70] overflow-y-auto bg-[rgba(4,15,75,0.45)] px-3 py-3 backdrop-blur-sm lg:px-4 lg:py-4",
        overlayClassName
      )}
      onClick={(event) => {
        if (event.target === event.currentTarget) {
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
          "mx-auto w-full rounded-[34px] border border-white/70 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(247,250,252,0.99))] shadow-[0_36px_80px_rgba(11,24,77,0.22)]",
          maxWidthClassName,
          contentClassName
        )}
      >
        <div className={cn("px-5 py-5 md:px-8 md:py-6 lg:px-10 lg:py-7", bodyClassName)}>
          <div className="relative">
            <Button
              type="button"
              variant="ghost"
              onClick={onClose}
              className="absolute right-0 top-0 h-12 min-h-[48px] w-12 shrink-0 rounded-[16px] border border-[rgba(4,15,75,0.08)] bg-white/78 px-0 py-0"
            >
              <X className="h-4 w-4" />
            </Button>

            <div className="pr-16 lg:pr-20">
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[color:var(--green)]">
                {kicker}
              </p>
              <h2
                id={titleId}
                className="mt-2 max-w-[19ch] text-[2.2rem] font-semibold leading-[0.98] tracking-[-0.06em] text-[color:var(--navy)] md:max-w-[23ch] md:text-[3rem] xl:max-w-none"
              >
                {title}
              </h2>
              {description ? (
                <p className="mt-3 max-w-4xl text-base leading-8 text-[color:var(--text-soft)]">
                  {description}
                </p>
              ) : null}
            </div>

            {headerAside ? (
              <div className="mt-6 flex justify-start sm:justify-end lg:mt-4 lg:pr-20">
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

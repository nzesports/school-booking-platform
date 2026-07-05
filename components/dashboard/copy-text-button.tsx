"use client";

import { Check, Copy } from "lucide-react";
import { useEffect, useRef, useState } from "react";

export function CopyTextButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (resetTimer.current) {
        clearTimeout(resetTimer.current);
      }
    };
  }, []);

  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);

          if (resetTimer.current) {
            clearTimeout(resetTimer.current);
          }

          resetTimer.current = setTimeout(() => setCopied(false), 1600);
        } catch {
          // Clipboard access denied — nothing useful to surface inline.
        }
      }}
      className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-[8px] border border-[color:var(--border-soft)] bg-white text-[color:var(--text-soft)] transition hover:text-[color:var(--navy)]"
    >
      {copied ? (
        <Check className="h-3.5 w-3.5 text-[color:var(--green)]" />
      ) : (
        <Copy className="h-3.5 w-3.5" />
      )}
    </button>
  );
}

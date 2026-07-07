"use client";

import { X } from "lucide-react";
import { useState, useSyncExternalStore, type ReactNode } from "react";

function subscribeToStorage(callback: () => void) {
  window.addEventListener("storage", callback);
  return () => window.removeEventListener("storage", callback);
}

// Wraps a card with a close button; the dismissal is remembered on the device
// (localStorage) under the given key, so keys should be scoped to what the
// card is about (e.g. one booking session) — new content gets a new key and
// shows again. Server render assumes visible; the stored value takes over on
// the client.
export function DismissibleCard({
  storageKey,
  children
}: {
  storageKey: string;
  children: ReactNode;
}) {
  const [dismissedNow, setDismissedNow] = useState(false);
  const storedDismissed = useSyncExternalStore(
    subscribeToStorage,
    () => window.localStorage.getItem(storageKey) === "1",
    () => false
  );

  if (dismissedNow || storedDismissed) {
    return null;
  }

  return (
    <div className="relative">
      {children}
      <button
        type="button"
        aria-label="Hide this card"
        title="Hide this card"
        onClick={() => {
          window.localStorage.setItem(storageKey, "1");
          setDismissedNow(true);
        }}
        className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full text-[color:var(--text-soft)] transition hover:bg-black/5 hover:text-[color:var(--navy)]"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

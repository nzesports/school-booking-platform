import type { BookingContactDefaults } from "@/lib/domain/types";

const STORAGE_KEY = "esf.guest-booking-contact-defaults.v1";
const STORAGE_EVENT = "esf:guest-booking-contact-defaults";

function isBookingContactDefaults(value: unknown): value is BookingContactDefaults {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return ["schoolName", "contactName", "contactEmail", "contactPhone", "regionSlug"].every(
    (key) => typeof candidate[key] === "string"
  );
}

export function parseGuestBookingDefaults(raw: string | null) {
  try {
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    return isBookingContactDefaults(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function getGuestBookingDefaultsSnapshot() {
  try {
    return window.sessionStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function subscribeToGuestBookingDefaults(onStoreChange: () => void) {
  window.addEventListener(STORAGE_EVENT, onStoreChange);
  return () => window.removeEventListener(STORAGE_EVENT, onStoreChange);
}

export function storeGuestBookingDefaults(defaults: BookingContactDefaults) {
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(defaults));
    window.dispatchEvent(new Event(STORAGE_EVENT));
  } catch {
    // Storage can be unavailable in hardened or private browsing contexts.
  }
}

export function clearGuestBookingDefaults() {
  try {
    window.sessionStorage.removeItem(STORAGE_KEY);
    window.dispatchEvent(new Event(STORAGE_EVENT));
  } catch {
    // Storage can be unavailable in hardened or private browsing contexts.
  }
}

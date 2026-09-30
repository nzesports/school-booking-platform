import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function titleCase(value: string) {
  return value
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
}

export function formatCurrency(amountCents: number, currency = "NZD") {
  return new Intl.NumberFormat("en-NZ", {
    style: "currency",
    currency,
    maximumFractionDigits: 0
  }).format(amountCents / 100);
}

export const MONTH_ABBREVIATIONS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// The platform's one date style: "03 Jun 2026", in New Zealand time. Built
// from numeric parts because the en-NZ locale abbreviates September as "Sept".
export function formatDate(value: string | Date) {
  const parts = new Intl.DateTimeFormat("en-NZ", {
    timeZone: "Pacific/Auckland",
    day: "2-digit",
    month: "numeric",
    year: "numeric"
  }).formatToParts(new Date(value));
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value ?? "";

  return `${part("day")} ${MONTH_ABBREVIATIONS[Number(part("month")) - 1]} ${part("year")}`;
}

// A plain calendar date ("2026-06-03") has no time zone. Midnight UTC is
// midday in New Zealand (+12/+13), so it formats as that same day.
export function formatDateOnly(dateString: string) {
  return formatDate(`${dateString}T00:00:00Z`);
}

export function formatLongDate(value: string | Date) {
  return formatDate(value);
}

export function formatDateTime(value: string | Date) {
  return `${formatDate(value)}, ${formatTime(value)}`;
}

// Kept for existing callers: every date now shows its year.
export function formatShortDate(value: string | Date, _includeYear = false) {
  void _includeYear;
  return formatDate(value);
}

export function formatTime(value: string | Date) {
  return new Intl.DateTimeFormat("en-NZ", {
    timeZone: "Pacific/Auckland",
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(value));
}

export function formatWeekdayDate(value: string | Date, _includeYear = false) {
  void _includeYear;
  const weekday = new Intl.DateTimeFormat("en-NZ", {
    timeZone: "Pacific/Auckland",
    weekday: "short"
  }).format(new Date(value));

  return `${weekday} ${formatDate(value)}`;
}

export function initials(value: string) {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((segment) => segment.charAt(0).toUpperCase())
    .join("");
}

export function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function splitCommaList(value: string) {
  return value
    .split(",")
    .map((segment) => segment.trim())
    .filter(Boolean);
}

export function nzOffsetForDate(dateString: string) {
  const probe = new Date(`${dateString}T12:00:00Z`);
  const nzHour = Number(
    new Intl.DateTimeFormat("en-NZ", {
      timeZone: "Pacific/Auckland",
      hour: "2-digit",
      hour12: false
    }).format(probe)
  );
  const utcHour = probe.getUTCHours();
  const offset = (nzHour - utcHour + 24) % 24;
  return offset === 13 ? "+13:00" : "+12:00";
}

export function nzDateTimeToIso(dateString: string, time: string) {
  return new Date(`${dateString}T${time}:00${nzOffsetForDate(dateString)}`).toISOString();
}

export function toYouTubeEmbedUrl(value?: string | null) {
  if (!value) {
    return null;
  }

  try {
    const url = new URL(value);

    if (url.hostname.includes("youtu.be")) {
      return `https://www.youtube.com/embed/${url.pathname.replace("/", "")}`;
    }

    if (url.hostname.includes("youtube.com")) {
      const videoId = url.searchParams.get("v");

      if (videoId) {
        return `https://www.youtube.com/embed/${videoId}`;
      }

      const pathMatch = url.pathname.match(/^\/(?:embed|shorts|live)\/([\w-]+)/);

      if (pathMatch) {
        return `https://www.youtube.com/embed/${pathMatch[1]}`;
      }
    }
  } catch {
    return null;
  }

  return null;
}

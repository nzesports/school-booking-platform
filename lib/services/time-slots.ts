export const BOOKING_WINDOW_START_MINUTES = 8 * 60;
export const BOOKING_WINDOW_END_MINUTES = 16 * 60;
export const SESSION_LENGTH_MINUTES = 10;

export function minutesToStartTime(totalMinutes: number) {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

/**
 * Parses a typed time and locks it to the bookable window (8:00am to 4:00pm,
 * with the last start leaving room for a full session). Times typed without
 * am/pm that only fit the window as afternoon times (e.g. "3:30") are treated
 * as pm. Returns null when the text is not a recognisable time.
 */
export function resolveTypedTimeInWindow(value: string) {
  const trimmed = value.trim().toLowerCase();

  if (!trimmed) {
    return null;
  }

  let minutes = parseTypedTime(trimmed);

  if (minutes === null) {
    return null;
  }

  const latestStart = BOOKING_WINDOW_END_MINUTES - SESSION_LENGTH_MINUTES;
  const hasMeridiem = /am|pm/.test(trimmed);

  if (
    !hasMeridiem &&
    minutes < BOOKING_WINDOW_START_MINUTES &&
    minutes + 720 <= BOOKING_WINDOW_END_MINUTES
  ) {
    minutes += 720;
  }

  const clamped = Math.min(Math.max(minutes, BOOKING_WINDOW_START_MINUTES), latestStart);
  const startTime = minutesToStartTime(clamped);

  return { startTime, label: formatTimeLabel(startTime) };
}

export function parseTypedTime(value: string) {
  const normalised = value.trim().toLowerCase().replace(/\s+/g, "");

  if (!normalised) {
    return null;
  }

  const meridiemMatch = normalised.match(/^(\d{1,2})(?::?(\d{2}))?(am|pm)$/);

  if (meridiemMatch) {
    let hours = Number(meridiemMatch[1]);
    const minutes = Number(meridiemMatch[2] ?? "0");
    const meridiem = meridiemMatch[3];

    if (meridiem === "pm" && hours !== 12) {
      hours += 12;
    }

    if (meridiem === "am" && hours === 12) {
      hours = 0;
    }

    return hours * 60 + minutes;
  }

  const plainMatch = normalised.match(/^(\d{1,2})(?::?(\d{2}))?$/);

  if (!plainMatch) {
    return null;
  }

  const hours = Number(plainMatch[1]);
  const minutes = Number(plainMatch[2] ?? "0");

  return hours * 60 + minutes;
}

export function formatTimeLabel(value: string) {
  const [hoursString, minutesString] = value.split(":");
  const hours = Number(hoursString);
  const minutes = Number(minutesString);
  const date = new Date();
  date.setHours(hours, minutes, 0, 0);

  return new Intl.DateTimeFormat("en-NZ", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true
  }).format(date);
}

export function addTenMinutes(value: string) {
  const [hoursString, minutesString] = value.split(":");
  const hours = Number(hoursString);
  const minutes = Number(minutesString);

  const date = new Date();
  date.setHours(hours, minutes + 10, 0, 0);

  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

export function formatDisplayDate(value: string) {
  const date = new Date(`${value}T00:00:00`);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  const sameYear = date.getFullYear() === new Date().getFullYear();

  return new Intl.DateTimeFormat("en-NZ", {
    weekday: "short",
    day: "numeric",
    month: "short",
    ...(sameYear ? {} : { year: "numeric" })
  }).format(date);
}

const dateFormat = new Intl.DateTimeFormat("en", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const timeFormat = new Intl.DateTimeFormat("en", { hour: "numeric", minute: "2-digit" });

/** Formats an ISO date or timestamp as a calendar date in UTC, e.g. "Dec 3, 2026". */
export function formatDate(iso: string): string {
  return dateFormat.format(new Date(iso));
}

/** Local clock time, e.g. "10:42 AM". */
export function formatTime(date: Date): string {
  return timeFormat.format(date);
}

/** A date input's `YYYY-MM-DD` as midnight UTC in RFC 3339. */
export function dateInputToRfc3339(date: string): string {
  return `${date}T00:00:00Z`;
}

/** The `YYYY-MM-DD` a date input shows for an ISO timestamp. */
export function rfc3339ToDateInput(iso: string): string {
  return new Date(iso).toISOString().slice(0, 10);
}

export function todayDateInput(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

const shortDateFormat = new Intl.DateTimeFormat("en", { day: "numeric", month: "short", timeZone: "UTC" });

/** Chart axis dates, e.g. "Dec 3". */
export function formatShortDate(epochMs: number): string {
  return shortDateFormat.format(new Date(epochMs));
}

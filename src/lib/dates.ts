const dateFormat = new Intl.DateTimeFormat("en", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

/** Formats an ISO date or timestamp as a calendar date, e.g. "3 Dec 2026". */
export function formatDate(iso: string): string {
  return dateFormat.format(new Date(iso));
}

export function daysSince(iso: string, now: Date = new Date()): number {
  return Math.floor((now.getTime() - Date.parse(iso)) / 86400_000);
}

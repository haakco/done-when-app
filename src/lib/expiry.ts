export type ExpiryOption = { seconds: number; label: string };

const MINUTE = 60;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** How long an item may go without an update before it is deleted. */
export const EXPIRY_OPTIONS: readonly ExpiryOption[] = [
  { seconds: MINUTE, label: "1 minute" },
  { seconds: 10 * MINUTE, label: "10 minutes" },
  { seconds: HOUR, label: "1 hour" },
  { seconds: 6 * HOUR, label: "6 hours" },
  { seconds: DAY, label: "1 day" },
  { seconds: 3 * DAY, label: "3 days" },
  { seconds: 7 * DAY, label: "7 days" },
  { seconds: 14 * DAY, label: "14 days" },
  { seconds: 30 * DAY, label: "30 days" },
  { seconds: 90 * DAY, label: "90 days" },
  { seconds: 180 * DAY, label: "180 days" },
  { seconds: 365 * DAY, label: "1 year" },
];

export const DEFAULT_EXPIRY_SECONDS = 7 * DAY;

export function expiryLabel(seconds: number): string {
  return EXPIRY_OPTIONS.find((option) => option.seconds === seconds)?.label ?? `${seconds} seconds`;
}

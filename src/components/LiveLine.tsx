import type { Freshness } from "../data/live";
import { formatTime } from "../lib/dates";

/** One quiet line saying the page keeps itself up to date, or why it cannot right now. */
export function LiveLine({ freshness, lastUpdatedAt }: { freshness: Freshness; lastUpdatedAt: Date | null }) {
  const at = lastUpdatedAt ? ` Last checked ${formatTime(lastUpdatedAt)}.` : "";
  if (freshness === "offline") {
    return (
      <p className="live-line live-line--warn" role="status">
        <span aria-hidden="true">!</span> You are offline. This page shows what it had and updates when you are back.{at}
      </p>
    );
  }
  if (freshness === "stale") {
    return (
      <p className="live-line live-line--warn" role="status">
        <span aria-hidden="true">!</span> Could not refresh just now; trying again.{at}
      </p>
    );
  }
  return (
    <p className="live-line">
      <span className="live-line__dot" aria-hidden="true" /> Updates by itself.{at}
    </p>
  );
}

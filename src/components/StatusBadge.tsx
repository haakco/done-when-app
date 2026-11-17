export type BadgeStatus = "active" | "completed" | "canceled" | "stale";

const BADGE: Record<BadgeStatus, { glyph: string; label: string }> = {
  active: { glyph: "●", label: "In progress" },
  completed: { glyph: "✓", label: "Done" },
  canceled: { glyph: "✕", label: "Canceled" },
  stale: { glyph: "!", label: "Estimate is stale" },
};

export function StatusBadge({ status, label }: { status: BadgeStatus; label?: string }) {
  const badge = BADGE[status];
  return (
    <span className={`badge badge--${status}`}>
      <span aria-hidden="true">{badge.glyph}</span>
      {label ?? badge.label}
    </span>
  );
}

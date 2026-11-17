import { useId } from "react";

/**
 * Named places for the @haakco/custd-react charts. Each slot is replaced by the component of
 * the same name once the SDK release ships it; the reserved height keeps the page from jumping.
 */

type SlotProps = { caption: string; description: string; short?: boolean };

function ChartSlot({ caption, description, short = false }: SlotProps) {
  const id = useId();
  return (
    <figure className={short ? "chart-slot chart-slot--short" : "chart-slot"} aria-labelledby={id}>
      <figcaption id={id}>{caption}</figcaption>
      <p className="muted small">{description}</p>
    </figure>
  );
}

/** Slot for `ForecastChart`: measurements, forecast line, 90% band, target and deadline. */
export function ForecastChartSlot() {
  return <ChartSlot caption="Forecast chart" description="Measurements, the forecast line and its 90% band will appear here." />;
}

/** Slot for `ArrivalHistogram`: when the target is likely to be reached. */
export function ArrivalHistogramSlot() {
  return <ChartSlot short caption="Arrival-time histogram" description="How likely each completion date is will appear here." />;
}

/** Slot for `ConvergenceStory`: low/high estimates narrowing over time against the delivery target. */
export function ConvergenceStorySlot() {
  return <ChartSlot caption="Estimate convergence" description="How the low and high estimates narrowed over time will appear here." />;
}

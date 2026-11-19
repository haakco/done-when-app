import { useEffect, useState } from "react";
import { canGlide, forecastMoveText, glide, sameDates, type ForecastDates } from "../lib/moments";
import { useReducedMotion } from "../lib/use-motion";

/** The SDK chart adds its own 180ms axis ease, so the whole move stays under 400ms. */
const GLIDE_MS = 220;

export type GlidingForecast = { shown: ForecastDates; moving: boolean; announcement: string };

/**
 * The forecast dates to draw: when a new forecast arrives they glide from where they were to
 * where they are now, or jump there when motion is reduced. The announcement says how far the
 * forecast moved once it has settled.
 */
export function useGlidingForecast(target: ForecastDates): GlidingForecast {
  const reduced = useReducedMotion();
  const [seen, setSeen] = useState(target);
  const [from, setFrom] = useState<ForecastDates | null>(null);
  const [progress, setProgress] = useState(1);
  const [announcement, setAnnouncement] = useState("");
  if (!sameDates(seen, target)) {
    const current = from ? glide(from, seen, progress) : seen;
    setSeen(target);
    const moved = forecastMoveText(seen, target);
    if (moved) setAnnouncement(moved);
    const glides = !reduced && canGlide(current, target);
    setFrom(glides ? current : null);
    setProgress(glides ? 0 : 1);
  }
  useEffect(() => {
    if (from === null) return;
    let began: number | null = null;
    let frame = requestAnimationFrame(function step(now) {
      began ??= now;
      const done = Math.min(1, (now - began) / GLIDE_MS);
      setProgress(done);
      if (done < 1) frame = requestAnimationFrame(step);
      else setFrom(null);
    });
    return () => {
      cancelAnimationFrame(frame);
    };
  }, [from]);
  const moving = from !== null && progress < 1;
  return { shown: moving ? glide(from, seen, progress) : seen, moving, announcement: moving ? "" : announcement };
}

/** One polite line saying how the last update moved the forecast; mounted empty from the start. */
export function ForecastMove({ text }: { text: string }) {
  return (
    <p className="forecast-move" role="status">
      {text ? (
        <>
          <span aria-hidden="true">↻ </span>
          {text}.
        </>
      ) : null}
    </p>
  );
}

/** Labels match the chart's line, point and band shapes so colour is optional. */
export function ForecastKey({ projection, interval, deadline = false }: { projection: boolean; interval: boolean; deadline?: boolean }) {
  return (
    <ul className="forecast-key" aria-label="Chart key">
      <li><span className="forecast-key__actual" aria-hidden="true" />Actual measurements</li>
      {projection ? <li><span className="forecast-key__projection" aria-hidden="true" />Projected progress</li> : null}
      {interval ? <li><span className="forecast-key__interval" aria-hidden="true" />90% forecast range</li> : null}
      <li><span className="forecast-key__target" aria-hidden="true" />Target</li>
      {deadline ? <li><span className="forecast-key__deadline" aria-hidden="true" />Deadline</li> : null}
    </ul>
  );
}

import { useEffect, useState, useSyncExternalStore } from "react";
import type { Counter, Project } from "../data";
import { celebrationsOn, dismissNudge, nudgeDismissed, setCelebrations, subscribeDevice } from "../lib/device";
import { counterMoment, MOMENT_TEXT, type CounterMoment, type MomentKind } from "../lib/moments";
import "../styles/fun.css";

/** A moment stays on screen this long, then leaves by itself. */
const MOMENT_MS = 10_000;

export function useCelebrations(): boolean {
  return useSyncExternalStore(subscribeDevice, celebrationsOn, () => true);
}

function momentState(counter: Counter): CounterMoment {
  return { status: counter.status, high: counter.forecast?.completionHigh ? Date.parse(counter.forecast.completionHigh) : null, deadline: counter.deadline };
}

/** The moment seen while this page is open, until it is dismissed or times out. */
function useCounterMoment(counter: Counter): [MomentKind | null, () => void] {
  const state = momentState(counter);
  const [seen, setSeen] = useState(state);
  const [moment, setMoment] = useState<MomentKind | null>(null);
  if (seen.status !== state.status || seen.high !== state.high || seen.deadline !== state.deadline) {
    setSeen(state);
    const next = counterMoment(seen, state);
    if (next) setMoment(next);
  }
  useEffect(() => {
    if (moment === null) return;
    const timer = setTimeout(() => {
      setMoment(null);
    }, MOMENT_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [moment]);
  return [moment, () => { setMoment(null); }];
}

/** A brief celebration when a counter reaches its target or its forecast moves inside the deadline. */
export function CounterMoments({ counter }: { counter: Counter }) {
  const [moment, dismiss] = useCounterMoment(counter);
  const celebrate = useCelebrations();
  const box = celebrate ? "moment moment--celebrate" : "moment";
  return (
    <div className={moment ? box : "moment-slot"} {...(moment ? { "data-moment": moment } : {})}>
      {moment && celebrate ? <Burst /> : null}
      <p className="moment__text" role="status">
        {moment ? (
          <>
            <span aria-hidden="true">✓ </span>
            {MOMENT_TEXT[moment]}
          </>
        ) : null}
      </p>
      {moment ? (
        <div className="moment__actions">
          {celebrate ? (
            <button type="button" className="button button--quiet" onClick={() => { setCelebrations(false); }}>
              Turn off celebrations
            </button>
          ) : null}
          <button type="button" className="button button--quiet" onClick={dismiss}>
            Dismiss
          </button>
        </div>
      ) : null}
    </div>
  );
}

const RAYS = Array.from({ length: 12 }, (_, index) => index * 30);

/** Twelve short rays that burst once from the finish mark; gone under reduced motion. */
function Burst() {
  return (
    <svg className="burst" viewBox="-50 -50 100 100" aria-hidden="true" focusable="false">
      {RAYS.map((angle, index) => (
        <line key={angle} className={index % 2 === 0 ? "burst__ray" : "burst__ray burst__ray--forecast"} x1="0" y1="-14" x2="0" y2="-30" transform={`rotate(${angle})`} />
      ))}
    </svg>
  );
}

/** The device-wide switch, in the footer, so celebrations can come back on after being turned off. */
export function CelebrationsToggle() {
  const on = useCelebrations();
  return (
    <label className="celebrations-toggle">
      <input type="checkbox" checked={on} onChange={(event) => { setCelebrations(event.target.checked); }} />
      Celebrations on this device
    </label>
  );
}

/** For the owner only: one gentle line when the latest estimate is old; "Not now" holds until the next estimate. */
export function StaleEstimateNudge({ project, staleAfterDays }: { project: Project; staleAfterDays: number }) {
  const latest = project.estimates.at(-1);
  const stateKey = latest?.estimatedAt ?? "";
  const dismissed = useSyncExternalStore(subscribeDevice, () => nudgeDismissed(project.itemUuid, stateKey), () => true);
  if (project.status !== "active" || !latest || !project.latest || project.latest.ageDays <= staleAfterDays || dismissed) return null;
  return (
    <aside className="notice notice--warn nudge" aria-label="Estimate reminder">
      <p>
        It has been {Math.floor(project.latest.ageDays)} days since the last estimate. A fresh one, even with the same dates, keeps the forecast honest.
      </p>
      <div className="button-row">
        <a className="button" href="#estimate-heading">
          Add an estimate
        </a>
        <button type="button" className="button button--quiet" onClick={() => { dismissNudge(project.itemUuid, stateKey); }}>
          Not now
        </button>
      </div>
    </aside>
  );
}

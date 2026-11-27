import { useInfiniteQuery, useMutation, useQuery } from "@tanstack/react-query";
import { useId, useRef, useState } from "react";
import { Field } from "../components/Field";
import { WriteError } from "../components/ItemStates";
import type { Counter, DoneWhenData, ItemAccess } from "../data";
import { dateInputToRfc3339, formatDate } from "../lib/dates";
import { formatRate, ratePerSecond } from "../lib/rate";

type RunProps = {
  data: DoneWhenData;
  access: ItemAccess;
  counter: Counter;
  currentRunUuid: string;
  owner: boolean;
  refresh: () => void;
};

export function CounterRuns(props: RunProps) {
  const [open, setOpen] = useState(false);
  const summary = useRef<HTMLElement>(null);
  return (
    <details className="more section" onToggle={(event) => { setOpen(event.currentTarget.open); }}>
      <summary ref={summary}>Counter runs</summary>
      {open ? (
        <div className="more__body stack">
          {props.owner ? <RunControls key={props.currentRunUuid} {...props} started={() => { summary.current?.focus(); props.refresh(); }} /> : null}
          <RunHistory {...props} />
        </div>
      ) : null}
    </details>
  );
}

function RunControls({ data, access, counter, refresh, started }: RunProps & { started: () => void }) {
  const checkbox = useId();
  const startButton = useRef<HTMLButtonElement>(null);
  const deadlineInput = useRef<HTMLInputElement>(null);
  const [confirm, setConfirm] = useState(false);
  const [deadline, setDeadline] = useState("");
  const [included, setIncluded] = useState<boolean | null>(null);
  const code = useRef("");
  const similar = useMutation({
    mutationFn: (included: boolean) => data.setRunSimilar(access, included),
    onSuccess: refresh,
    onError: () => { setIncluded(null); },
  });
  const start = useMutation({
    mutationFn: () => data.startCounterRun(access, {
      projectCode: code.current,
      ...(deadline ? { targetDate: dateInputToRfc3339(deadline) } : {}),
    }),
    onSuccess: started,
  });

  return (
    <div className="stack">
      <div className="inline-action">
        <input
          id={checkbox}
          type="checkbox"
          checked={included ?? counter.runSimilar}
          disabled={similar.isPending || start.isPending}
          onChange={(event) => {
            const next = event.currentTarget.checked;
            setIncluded(next);
            similar.mutate(next);
          }}
        />
        <label htmlFor={checkbox}>Include this run’s pace in future forecasts</label>
      </div>
      <WriteError error={similar.error} />
      {!confirm ? (
        <div>
          <button
            ref={startButton}
            type="button"
            className="button"
            onClick={() => {
              code.current = `run-${crypto.randomUUID()}`;
              setConfirm(true);
              requestAnimationFrame(() => deadlineInput.current?.focus());
            }}
          >
            Start again with the same target
          </button>
        </div>
      ) : (
        <form className="form" aria-label="Start a new run" onSubmit={(event) => {
          event.preventDefault();
          start.mutate();
        }}>
          <p>The same links will show the new run. Its measurements start empty and this run stays in history.</p>
          <Field label="New deadline (optional)">
            {(control) => <input {...control} ref={deadlineInput} type="date" value={deadline} onChange={(event) => { setDeadline(event.currentTarget.value); }} />}
          </Field>
          <div className="button-row">
            <button type="submit" className="button button--primary" disabled={start.isPending || start.isSuccess || similar.isPending}>
              {start.isPending ? "Starting…" : "Start new run"}
            </button>
            <button type="button" className="button button--quiet" disabled={start.isPending || start.isSuccess} onClick={() => {
              start.reset();
              setConfirm(false);
              requestAnimationFrame(() => startButton.current?.focus());
            }}>
              Cancel
            </button>
          </div>
          <WriteError error={start.error} />
        </form>
      )}
    </div>
  );
}

function RunHistory({ data, access, counter, currentRunUuid }: RunProps) {
  const history = useInfiniteQuery({
    queryKey: ["counter-runs", counter.itemUuid, counter.role, currentRunUuid],
    queryFn: ({ pageParam }) => data.listCounterRuns(access, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page) => page.nextCursor,
  });
  if (history.isPending) return <p role="status">Loading runs…</p>;
  if (!history.data) return <WriteError error={history.error} />;
  return (
    <>
      <ul className="item-list" aria-label="Counter run history">
        {history.data.pages.flatMap((page) => page.runs.map((run) => {
          const current = run.runUuid === currentRunUuid;
          return (
            <li key={run.runUuid} className="card">
              <strong>{current ? "Current run" : run.name}</strong>
              <p className="small muted"><time dateTime={run.createdAt}>{formatDate(run.createdAt)}</time> · {run.status}</p>
              {!current ? <PriorRunPace data={data} access={access} counter={counter} runUuid={run.runUuid} /> : null}
            </li>
          );
        }))}
      </ul>
      {history.hasNextPage ? (
        <button type="button" className="button button--quiet" disabled={history.isFetchingNextPage} onClick={() => { void history.fetchNextPage(); }}>
          {history.isFetchingNextPage ? "Loading…" : "Show older runs"}
        </button>
      ) : null}
      <WriteError error={history.error} />
    </>
  );
}

function PriorRunPace({ data, access, counter, runUuid }: Pick<RunProps, "data" | "access" | "counter"> & { runUuid: string }) {
  const [open, setOpen] = useState(false);
  const measurements = useQuery({
    queryKey: ["counter-run-measurements", counter.itemUuid, counter.role, runUuid],
    queryFn: () => data.counterRunMeasurements(access, runUuid),
    enabled: open,
  });
  const rows = measurements.data?.rows ?? [];
  const pace = measurements.data?.nextCursor ? null : ratePerSecond(rows.map((row) => ({ measuredAt: row.observedAt, value: row.value })));
  const first = rows[0];
  const last = rows.at(-1);
  return (
    <details className="more" onToggle={(event) => { setOpen(event.currentTarget.open); }}>
      <summary>Previous run pace</summary>
      {open ? (
        <div className="more__body">
          {measurements.isPending ? <p role="status">Loading measurements…</p> : null}
          <WriteError error={measurements.error} />
          {measurements.data ? (
            <>
              <p>{pace !== null ? formatRate(pace, "day", counter.unit) : measurements.data.nextCursor ? "This run has too many measurements to summarise here." : "Pace needs two measurements at different times."}</p>
              {first && last && pace !== null ? <p className="small muted">{formatDate(first.observedAt)} to {formatDate(last.observedAt)}</p> : null}
            </>
          ) : null}
        </div>
      ) : null}
    </details>
  );
}

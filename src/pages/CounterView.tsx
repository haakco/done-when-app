import { ArrivalHistogram, ForecastChart } from "@haakco/custd-react";
import { useMutation } from "@tanstack/react-query";
import { lazy, Suspense, useCallback, useId, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { AlertsPanel } from "../components/AlertsPanel";
import type { CreatedState, CounterFormValues } from "../components/CounterForm";
import { Field } from "../components/Field";
import { ItemFailed, Loading, ReadOnlyNotice, WriteError } from "../components/ItemStates";
import { LiveLine } from "../components/LiveLine";
import { ForecastKey, ForecastMove, useGlidingForecast } from "../components/LiveForecast";
import { CounterMoments } from "../components/Moments";
import { DownloadMenu } from "../components/DownloadMenu";
import { ImportPanel } from "../components/ImportPanel";
import { AddMeasurementForm } from "../components/MeasurementForms";
import { MethodField } from "../components/MethodField";
import { KeepInMyItems, LinksAndExpiry } from "../components/OwnerSettings";
import { Progress } from "../components/Progress";
import { ItemHeader } from "../components/ItemHeader";
import { StatusBadge } from "../components/StatusBadge";
import type { Counter, DoneWhenData, ForecastMethod, ItemAccess, Measurement } from "../data";
import { useCounter } from "../data/live";
import { dateInputToRfc3339, formatDate, formatShortDate, rfc3339ToDateInput } from "../lib/dates";
import { counterWorkbook } from "../lib/exports";
import { counterSummary } from "../lib/forecast-text";
import { MAX_ITEM_MEASUREMENTS, parseMeasurementTable } from "../lib/imports";
import { formatRate, RATE_UNITS, ratePerSecond, type RateUnit } from "../lib/rate";
import { forecastDates, type ForecastDates } from "../lib/moments";
import { useGuessBook } from "../lib/use-guess-book";
import { useNarrow } from "../lib/use-narrow";
import type { NewRunState } from "./NewCounterPage";
import type { ItemViewProps } from "./view-props";

const GuessFirst = lazy(() => import("../components/GuessFirst").then((module) => ({ default: module.GuessFirst })));
const GuessResults = lazy(() => import("../components/GuessFirst").then((module) => ({ default: module.GuessResults })));

export function CounterView({ data, access, read, showOwnerTools, ownerRoute, tv }: ItemViewProps) {
  const live = useCounter(access, read);
  const book = useGuessBook(read.item.itemUuid);
  const location = useLocation();
  const rejectedAtCreate = (location.state as Partial<CreatedState> | null)?.rejected ?? 0;
  if (live.status === "loading") return <Loading what="counter" />;
  if (live.status === "error") return <ItemFailed error={live.error} what="counter" />;
  const counter = live.data;
  const summary = counterSummary(counter);
  // A share-page viewer may guess before the forecast shows; owners, TVs and done counters never wait.
  const guessing = !ownerRoute && !tv && counter.status === "active" && !book.revealed;
  return (
    <article aria-labelledby="item-name" className="item">
      <ItemHeader
        data={data}
        access={access}
        kind="counter"
        meta={counter}
        title={counter.name}
        owner={showOwnerTools}
        actions={
          <DownloadMenu
            name={counter.name}
            build={() => counterWorkbook(counter, new Date())}
            note={counter.measurementsTruncated ? `Holds the newest ${counter.measurements.length} measurements; older ones are not in the file.` : null}
          />
        }
      >
        <StatusBadge status={counter.status} />
      </ItemHeader>
      {showOwnerTools && rejectedAtCreate > 0 ? (
        <p className="notice notice--warn" role="alert">
          {rejectedAtCreate} of your past numbers were not accepted. Add them again under &ldquo;Import measurements&rdquo;.
        </p>
      ) : null}
      <CounterMoments counter={counter} />
      <section className="summary" aria-label="Summary">
        {guessing ? (
          <Suspense fallback={null}>
            <GuessFirst itemUuid={counter.itemUuid} book={book} forecastMedian={counter.forecast?.completionMedian ?? null} />
          </Suspense>
        ) : (
          <>
            <p className="summary__headline">{summary.headline}</p>
            {summary.detail ? <p className="summary__detail">{summary.detail}</p> : null}
          </>
        )}
        <Progress label="Progress to target" current={counter.latestValue} start={counter.startValue} target={counter.targetValue} unit={counter.unit} />
        <RateLine measurements={counter.measurements} unit={counter.unit} />
        {!guessing && !tv && book.guesses.length > 0 ? (
          <Suspense fallback={null}>
            <GuessResults book={book} completedAt={counter.status === "completed" ? counter.completedAt : null} />
          </Suspense>
        ) : null}
      </section>
      {showOwnerTools ? <QuickAdd data={data} access={access} counter={counter} /> : null}
      <LiveCounterChart counter={counter} hideForecast={guessing} />
      <LiveLine freshness={live.freshness} lastUpdatedAt={live.lastUpdatedAt} />
      {guessing ? null : <ForecastDetail counter={counter} />}
      {ownerRoute && !showOwnerTools ? <ReadOnlyNotice /> : null}
      {showOwnerTools ? <CounterOwnerTools data={data} access={access} counter={counter} /> : null}
    </article>
  );
}

/** The main chart: the forecast glides to each new position and says how far it moved. */
export function LiveCounterChart({ counter, hideForecast }: { counter: Counter; hideForecast: boolean }) {
  const { shown, moving, announcement } = useGlidingForecast(forecastDates(counter.forecast));
  return (
    <>
      <CounterChart counter={counter} dates={hideForecast ? null : shown} moving={moving} />
      <ForecastMove text={hideForecast || counter.status === "completed" ? "" : announcement} />
      {counter.measurements.length > 1 ? <MeasurementInspector measurements={counter.measurements} unit={counter.unit} /> : null}
    </>
  );
}

type ChartProps = { counter: Counter; detail?: boolean; dates?: ForecastDates | null; moving?: boolean };

/** `dates` replaces the forecast's dates (null hides the forecast); the detail chart draws them as they are. */
function CounterChart({ counter, detail = false, dates = forecastDates(counter.forecast), moving = false }: ChartProps) {
  const narrow = useNarrow();
  const forecast = counter.forecast;
  const iso = (epoch: number | null | undefined) => (epoch == null ? null : new Date(epoch).toISOString());
  const median = iso(dates?.median);
  const low = iso(dates?.low);
  const high = iso(dates?.high);
  const chartData = {
    observations: counter.measurements.map((measurement) => ({ at: measurement.measuredAt, value: measurement.value })),
    target: counter.targetValue,
    ...(counter.deadline ? { deadline: counter.deadline } : {}),
    ...(median ? { completionMedian: median } : {}),
    ...(low && high ? { completionInterval: { confidence: 0.9, lower: low, upper: high } } : {}),
    ...(forecast?.forecastFrom ? { forecastFrom: forecast.forecastFrom } : {}),
    ...(detail && forecast ? { posteriorLines: forecast.posteriorLines } : {}),
  };
  return (
    <figure
      className="chart"
      aria-label={detail ? "Forecast with sample paths" : "Forecast chart"}
      data-forecast-median={median ?? ""}
      data-forecast-motion={moving ? "moving" : "still"}
    >
      <ForecastChart
        data={chartData}
        title={detail ? `${counter.name}: possible paths` : counter.name}
        labels={{
          reset: "All dates",
          zoomToData: "Measurements only",
          empty: "The chart appears after the first measurement.",
          noForecast: dates === null ? "The forecast shows after you guess or skip." : "The forecast line appears after three measurements.",
        }}
        formatValue={(value) => value.toLocaleString("en", { maximumFractionDigits: 1 })}
        formatDate={formatShortDate}
        {...(narrow ? { width: 380, height: 260 } : {})}
      />
      {counter.measurements.length > 0 ? <ForecastKey projection={median !== null} interval={low !== null && high !== null} deadline={counter.deadline !== null} /> : null}
      {counter.measurements.length > 1 ? <figcaption className="small muted chart-navigation">Zoom in, then drag or scroll sideways to move through dates.</figcaption> : null}
    </figure>
  );
}

function MeasurementInspector({ measurements, unit }: { measurements: Measurement[]; unit: string }) {
  const id = useId();
  const [selected, setSelected] = useState<number | null>(null);
  const last = measurements.length - 1;
  const index = Math.min(selected ?? last, last);
  const row = measurements[index];
  if (!row) return null;
  const point = `${formatDate(row.measuredAt)}: ${row.value.toLocaleString("en")}${unit ? ` ${unit}` : ""}`;
  return (
    <details className="quiet-details measurement-inspector">
      <summary>Inspect measurements</summary>
      <div className="measurement-inspector__body">
        <label htmlFor={id}>Measurement {index + 1} of {measurements.length}</label>
        <input id={id} type="range" min={0} max={last} value={index} aria-valuetext={point} onChange={(event) => { setSelected(event.target.valueAsNumber); }} />
        <output htmlFor={id}>{point}</output>
      </div>
    </details>
  );
}

function ForecastDetail({ counter }: { counter: Counter }) {
  const forecast = counter.forecast;
  if (!forecast) return null;
  return (
    <details className="more section">
      <summary>How sure is this forecast?</summary>
      <div className="more__body">
        <p className="small">
          Each faint line is one possible path from {forecast.inputCount} measurements
          {forecast.pooledRunCount > 1 ? `, pooled with ${forecast.pooledRunCount - 1} earlier run${forecast.pooledRunCount === 2 ? "" : "s"}` : ""}. The bars show
          how often each finish date came up.
        </p>
        <CounterChart counter={counter} detail />
        {forecast.histogram ? (
          <figure className="chart chart--short" aria-label="When the target is reached">
            <ArrivalHistogram
              histogram={forecast.histogram}
              {...(counter.deadline ? { deadline: counter.deadline } : {})}
              title="When the target is reached"
              formatDate={formatShortDate}
            />
          </figure>
        ) : null}
        {forecast.warnings.length > 0 ? (
          <ul className="small muted">
            {forecast.warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        ) : null}
      </div>
    </details>
  );
}

function RateLine({ measurements, unit }: { measurements: Measurement[]; unit: string }) {
  const id = useId();
  const [rateUnit, setRateUnit] = useState<RateUnit>("day");
  const rate = ratePerSecond(measurements);
  if (rate === null) {
    return <p className="small muted">The rate shows after a second measurement.</p>;
  }
  return (
    <p className="numeric rate-line">
      Pace: <strong>{formatRate(rate, rateUnit, unit)}</strong>{" "}
      <label className="visually-hidden" htmlFor={id}>
        Show pace per
      </label>
      <select
        id={id}
        value={rateUnit}
        onChange={(event) => {
          setRateUnit(event.target.value as RateUnit);
        }}
      >
        {RATE_UNITS.map((option) => (
          <option key={option} value={option}>
            per {option}
          </option>
        ))}
      </select>
    </p>
  );
}

function useAddMeasurements(data: DoneWhenData, access: ItemAccess, counter: Counter) {
  return useMutation({
    mutationFn: (rows: Measurement[]) =>
      data.addMeasurements(access, rows, { method: counter.method, forecastFrom: counter.forecast?.forecastFrom ?? null }, counter.measurements.length + rows.length),
  });
}

function QuickAdd({ data, access, counter }: { data: DoneWhenData; access: ItemAccess; counter: Counter }) {
  const add = useAddMeasurements(data, access, counter);
  return (
    <section className="card section" aria-labelledby="add-heading">
      <h2 id="add-heading">Add a measurement</h2>
      <AddMeasurementForm
        unit={counter.unit}
        pending={add.isPending}
        error={add.error}
        onSubmit={(rows, onSaved) => {
          add.mutate(rows, {
            onSuccess: (added) => {
              if (added.rejected === 0) onSaved();
            },
          });
        }}
      />
      {add.data && add.data.rejected > 0 ? (
        <p className="field__error" role="alert">
          Custd did not accept {add.data.rejected === 1 ? "that measurement" : `${add.data.rejected} measurements`}. Check the value and try again.
        </p>
      ) : null}
    </section>
  );
}

function MeasurementImport({ data, access, counter }: { data: DoneWhenData; access: ItemAccess; counter: Counter }) {
  const held = counter.measurements.length;
  const check = useCallback(
    (rows: Measurement[]) => {
      const room = MAX_ITEM_MEASUREMENTS - held;
      if (rows.length <= room) return null;
      return `This counter holds ${counter.measurementsTruncated ? "at least " : ""}${held.toLocaleString("en")} measurements and can take ${Math.max(room, 0).toLocaleString("en")} more; this file has ${rows.length.toLocaleString("en")}.`;
    },
    [held, counter.measurementsTruncated],
  );
  return (
    <ImportPanel
      what="measurements"
      hint="Columns: time and value, with or without a header, in either order. Times without a zone are read as UTC."
      placeholder={"time,value\n2026-11-01T09:00:00Z,12\n2026-11-02T09:00:00Z,15"}
      parse={parseMeasurementTable}
      check={check}
      onImport={async (rows) => {
        const added = await data.addMeasurements(access, rows, { method: counter.method, forecastFrom: counter.forecast?.forecastFrom ?? null }, held + rows.length);
        return { landed: added.accepted, refused: added.rejected, failure: added.failure };
      }}
    />
  );
}

function CounterOwnerTools({ data, access, counter }: { data: DoneWhenData; access: ItemAccess; counter: Counter }) {
  const reopen = useMutation({ mutationFn: () => data.reopenCounter(access) });
  return (
    <section className="section owner-tools" aria-labelledby="owner-heading">
      <h2 id="owner-heading">Owner tools</h2>
      {counter.status === "completed" ? (
        <div className="inline-action">
          <p className="small">Done. Reopen it to keep counting; it completes again when a measurement reaches the target.</p>
          <button type="button" className="button" disabled={reopen.isPending} onClick={() => { reopen.mutate(); }}>
            Reopen counter
          </button>
          <WriteError error={reopen.error} />
        </div>
      ) : null}
      <details className="more">
        <summary>Import measurements</summary>
        <div className="more__body">
          <MeasurementImport data={data} access={access} counter={counter} />
        </div>
      </details>
      <details className="more">
        <summary>Forecast settings</summary>
        <div className="more__body">
          <ForecastSettingsForm data={data} access={access} counter={counter} />
        </div>
      </details>
      <details className="more">
        <summary>Runs</summary>
        <div className="more__body">
          <RunsPanel data={data} access={access} counter={counter} />
        </div>
      </details>
      <details className="more">
        <summary>Alerts</summary>
        <div className="more__body">
          <AlertsPanel data={data} access={access} kind="counter" />
        </div>
      </details>
      <details className="more">
        <summary>Links, expiry and my items</summary>
        <div className="more__body">
          <KeepInMyItems data={data} access={access} kind="counter" meta={counter} />
          <LinksAndExpiry data={data} access={access} kind="counter" meta={counter} />
        </div>
      </details>
    </section>
  );
}

function ForecastSettingsForm({ data, access, counter }: { data: DoneWhenData; access: ItemAccess; counter: Counter }) {
  const [method, setMethod] = useState<ForecastMethod>(counter.method);
  const [from, setFrom] = useState(counter.forecast?.forecastFrom ? rfc3339ToDateInput(counter.forecast.forecastFrom) : "");
  const save = useMutation({
    mutationFn: () => data.setForecast(access, { method, forecastFrom: from ? dateInputToRfc3339(from) : null }),
  });
  return (
    <form
      className="form"
      onSubmit={(event) => {
        event.preventDefault();
        save.mutate();
      }}
    >
      <MethodField value={method} onChange={setMethod} />
      <Field label="Forecast from" hint="Leave out measurements before this date, for example after a change of pace. Earlier points show dimmed.">
        {(control) => <input {...control} type="date" value={from} onChange={(event) => { setFrom(event.target.value); }} />}
      </Field>
      <div className="button-row">
        <button type="submit" className="button" disabled={save.isPending || counter.measurements.length < 3}>
          {save.isPending ? "Updating…" : "Update forecast"}
        </button>
        {save.isSuccess ? <span role="status">Forecast updated.</span> : null}
      </div>
      {counter.measurements.length < 3 ? <p className="small muted">Needs three measurements first.</p> : null}
      <WriteError error={save.error} />
    </form>
  );
}

function RunsPanel({ data, access, counter }: { data: DoneWhenData; access: ItemAccess; counter: Counter }) {
  const navigate = useNavigate();
  const similar = useMutation({ mutationFn: (next: boolean) => data.setRunSimilar(access, next) });
  const id = useId();
  const newRun: NewRunState = {
    newRun: {
      name: counter.name,
      unit: counter.unit,
      startValue: String(counter.startValue),
      targetValue: String(counter.targetValue),
      startedAt: "",
      deadline: "",
      history: "",
    } satisfies CounterFormValues,
  };
  return (
    <div className="stack">
      {counter.seriesRootUuid ? (
        <div className="inline-action">
          <input
            id={id}
            type="checkbox"
            checked={similar.variables ?? counter.runSimilar}
            disabled={similar.isPending}
            onChange={(event) => {
              similar.mutate(event.target.checked);
            }}
          />
          <label htmlFor={id}>Use this run&apos;s pace for the series forecast (untick if this run was unusual)</label>
          <WriteError error={similar.error} />
        </div>
      ) : (
        <p className="small muted">Doing it again? Start a new counter with the same name and target.</p>
      )}
      <div className="button-row">
        <button
          type="button"
          className="button"
          onClick={() => {
            void navigate("/new/counter", { state: newRun });
          }}
        >
          Start again with the same target
        </button>
      </div>
    </div>
  );
}

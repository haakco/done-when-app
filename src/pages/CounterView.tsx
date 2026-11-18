import { ArrivalHistogram, ForecastChart } from "@haakco/custd-react";
import { useMutation } from "@tanstack/react-query";
import { useId, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { AlertsPanel } from "../components/AlertsPanel";
import type { CreatedState, CounterFormValues } from "../components/CounterForm";
import { Field } from "../components/Field";
import { ItemFailed, Loading, ReadOnlyNotice, WriteError } from "../components/ItemStates";
import { LiveLine } from "../components/LiveLine";
import { AddMeasurementForm, CsvImportForm } from "../components/MeasurementForms";
import { MethodField } from "../components/MethodField";
import { KeepInMyItems, LinksAndExpiry } from "../components/OwnerSettings";
import { Progress } from "../components/Progress";
import { ShareBox } from "../components/ShareBox";
import { StatusBadge } from "../components/StatusBadge";
import type { Counter, DoneWhenData, ForecastMethod, ItemAccess, Measurement } from "../data";
import { useCounter } from "../data/live";
import { dateInputToRfc3339, formatShortDate, rfc3339ToDateInput } from "../lib/dates";
import { counterSummary } from "../lib/forecast-text";
import { formatRate, RATE_UNITS, ratePerSecond, type RateUnit } from "../lib/rate";
import { useNarrow } from "../lib/use-narrow";
import type { NewRunState } from "./NewCounterPage";
import type { ItemViewProps } from "./view-props";

export function CounterView({ data, access, read, showOwnerTools, ownerRoute }: ItemViewProps) {
  const live = useCounter(access, read);
  const location = useLocation();
  const createdState = location.state as Partial<CreatedState> | null;
  const justCreated = createdState?.created === true;
  const rejectedAtCreate = createdState?.rejected ?? 0;
  if (live.status === "loading") return <Loading what="counter" />;
  if (live.status === "error") return <ItemFailed error={live.error} what="counter" />;
  const counter = live.data;
  const summary = counterSummary(counter);
  return (
    <article aria-labelledby="item-name" className="item">
      <header className="item__head">
        <h1 id="item-name">{counter.name}</h1>
        <StatusBadge status={counter.status} />
      </header>
      {justCreated && showOwnerTools ? (
        <p className="notice notice--done" role="status">
          Your counter is ready. Bookmark this page: its address is your owner link. Share the view-only link below.
        </p>
      ) : null}
      {justCreated && rejectedAtCreate > 0 ? (
        <p className="notice notice--warn" role="alert">
          {rejectedAtCreate} of your past numbers were not accepted. Add them again under &ldquo;Add several measurements&rdquo;.
        </p>
      ) : null}
      <section className="summary" aria-label="Summary">
        <p className="summary__headline">{summary.headline}</p>
        {summary.detail ? <p className="summary__detail">{summary.detail}</p> : null}
        <Progress label="Progress to target" current={counter.latestValue} start={counter.startValue} target={counter.targetValue} unit={counter.unit} />
        <RateLine measurements={counter.measurements} unit={counter.unit} />
      </section>
      {showOwnerTools ? <ShareBox data={data} access={access} kind="counter" meta={counter} /> : null}
      {showOwnerTools ? <QuickAdd data={data} access={access} counter={counter} /> : null}
      <CounterChart counter={counter} />
      <LiveLine freshness={live.freshness} lastUpdatedAt={live.lastUpdatedAt} />
      <ForecastDetail counter={counter} />
      {ownerRoute && !showOwnerTools ? <ReadOnlyNotice /> : null}
      {showOwnerTools ? <CounterOwnerTools data={data} access={access} counter={counter} /> : null}
    </article>
  );
}

function CounterChart({ counter, detail = false }: { counter: Counter; detail?: boolean }) {
  const narrow = useNarrow();
  const forecast = counter.forecast;
  const chartData = {
    observations: counter.measurements.map((measurement) => ({ at: measurement.measuredAt, value: measurement.value })),
    target: counter.targetValue,
    ...(counter.deadline ? { deadline: counter.deadline } : {}),
    ...(forecast?.completionMedian ? { completionMedian: forecast.completionMedian } : {}),
    ...(forecast?.completionLow && forecast.completionHigh
      ? { completionInterval: { confidence: 0.9, lower: forecast.completionLow, upper: forecast.completionHigh } }
      : {}),
    ...(forecast?.forecastFrom ? { forecastFrom: forecast.forecastFrom } : {}),
    ...(detail && forecast ? { posteriorLines: forecast.posteriorLines } : {}),
  };
  return (
    <figure className="chart" aria-label={detail ? "Forecast with sample paths" : "Forecast chart"}>
      <ForecastChart
        data={chartData}
        title={detail ? `${counter.name}: possible paths` : counter.name}
        labels={{ empty: "The chart appears after the first measurement.", noForecast: "The forecast line appears after three measurements." }}
        formatValue={(value) => value.toLocaleString("en", { maximumFractionDigits: 1 })}
        formatDate={formatShortDate}
        {...(narrow ? { width: 380, height: 260 } : {})}
      />
    </figure>
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
      {add.data?.targetReached ? (
        <p className="notice notice--done" role="status">
          <span aria-hidden="true">✓ </span>Target reached. Well done.
        </p>
      ) : null}
    </section>
  );
}

function CounterOwnerTools({ data, access, counter }: { data: DoneWhenData; access: ItemAccess; counter: Counter }) {
  const add = useAddMeasurements(data, access, counter);
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
        <summary>Add several measurements</summary>
        <div className="more__body">
          <CsvImportForm
            pending={add.isPending}
            error={add.error}
            onSubmit={(rows, onSaved) => {
              add.mutate(rows, { onSuccess: onSaved });
            }}
          />
          {add.data ? (
            <p role="status" className="small">
              Added {add.data.accepted}
              {add.data.rejected > 0 ? `; ${add.data.rejected} could not be added` : ""}.
            </p>
          ) : null}
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

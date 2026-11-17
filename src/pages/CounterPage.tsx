import { useId, useState } from "react";
import { useParams } from "react-router";
import { ArrivalHistogramSlot, ForecastChartSlot } from "../components/ChartSlots";
import { LinksPanel } from "../components/LinksPanel";
import { AddMeasurementForm, CsvImportForm } from "../components/MeasurementForms";
import { Progress } from "../components/Progress";
import { QueryState } from "../components/QueryState";
import { ReadOnlyNotice } from "../components/ReadOnlyNotice";
import { StatusBadge } from "../components/StatusBadge";
import { data, type Access, type Counter, type ItemView, type Measurement } from "../data";
import { useCounter, useItemMutation } from "../data/queries";
import { formatDate } from "../lib/dates";
import { expiryLabel } from "../lib/expiry";
import { formatRate, RATE_UNITS, ratePerSecond, type RateUnit } from "../lib/rate";

export function CounterPage({ mode }: { mode: Access }) {
  const { token = "" } = useParams();
  const query = useCounter(token);
  return (
    <QueryState query={query} what="counter">
      {(view) => <CounterView view={view} token={token} mode={mode} />}
    </QueryState>
  );
}

function CounterView({ view, token, mode }: { view: ItemView<Counter>; token: string; mode: Access }) {
  const counter = view.item;
  const latest = counter.measurements.at(-1)?.value ?? counter.startValue;
  return (
    <article aria-labelledby="counter-name">
      <h1 id="counter-name">{counter.name}</h1>
      <StatusBadge status={counter.status} />
      <p className="big-number" aria-label={`Current value ${latest}`}>
        {latest}
        <span className="lede"> / {counter.targetValue} {counter.unit}</span>
      </p>
      <Progress label="Progress to target" current={latest} start={counter.startValue} target={counter.targetValue} unit={counter.unit} />
      <RateLine measurements={counter.measurements} unit={counter.unit} />
      <ForecastSummary counter={counter} />
      <ForecastChartSlot />
      <ArrivalHistogramSlot />
      {mode === "owner" && view.access === "share" ? <ReadOnlyNotice /> : null}
      {mode === "owner" && view.access === "owner" && view.links !== null ? (
        <>
          <OwnerTools token={token} counter={counter} />
          <LinksPanel kind="counter" links={view.links} />
        </>
      ) : null}
    </article>
  );
}

function RateLine({ measurements, unit }: { measurements: Measurement[]; unit: string }) {
  const id = useId();
  const [rateUnit, setRateUnit] = useState<RateUnit>("day");
  const rate = ratePerSecond(measurements);
  if (rate === null) {
    return <p className="muted">The rate shows after a second measurement.</p>;
  }
  return (
    <p className="numeric">
      Current rate: <strong>{formatRate(rate, rateUnit, unit)}</strong>{" "}
      <label className="visually-hidden" htmlFor={id}>
        Rate per
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

function ForecastSummary({ counter }: { counter: Counter }) {
  const forecast = counter.forecast;
  if (counter.status === "completed") {
    return <p>Target reached.</p>;
  }
  if (forecast === null) {
    return <p className="muted">A forecast appears after three measurements.</p>;
  }
  return (
    <div>
      <p className="forecast-text">
        Likely done {formatDate(forecast.completionMedian)} (90%: {formatDate(forecast.completionLow)} – {formatDate(forecast.completionHigh)})
      </p>
      {forecast.deadlineProbability !== null && counter.deadline !== null ? (
        <p>
          <strong className="numeric">{Math.round(forecast.deadlineProbability * 100)}%</strong> chance of reaching the target by{" "}
          {formatDate(counter.deadline)}.
        </p>
      ) : null}
    </div>
  );
}

function OwnerTools({ token, counter }: { token: string; counter: Counter }) {
  const add = useItemMutation("counter", token, (measurements: Measurement[]) => data.addMeasurements(token, measurements));
  const status = useItemMutation("counter", token, (next: Counter["status"]) => data.setCounterStatus(token, next));
  const submit = (measurements: Measurement[], onSaved: () => void) => {
    add.mutate(measurements, { onSuccess: onSaved });
  };
  return (
    <>
      <section className="section card" aria-labelledby="add-heading">
        <h2 id="add-heading">Add a measurement</h2>
        <AddMeasurementForm onSubmit={submit} pending={add.isPending} error={add.error} />
      </section>
      <section className="section card" aria-labelledby="import-heading">
        <h2 id="import-heading">Import measurements</h2>
        <CsvImportForm onSubmit={submit} pending={add.isPending} error={add.error} />
      </section>
      <section className="section" aria-labelledby="lifecycle-heading">
        <h2 id="lifecycle-heading">Status</h2>
        <p className="small muted">Deleted after {expiryLabel(counter.expiresAfterSeconds)} without an update.</p>
        <button
          type="button"
          className="button"
          disabled={status.isPending}
          onClick={() => {
            status.mutate(counter.status === "completed" ? "active" : "completed");
          }}
        >
          {counter.status === "completed" ? "Reopen counter" : "Mark as done"}
        </button>
        {status.error ? <p className="field__error">{status.error.message}</p> : null}
      </section>
    </>
  );
}

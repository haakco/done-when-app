import { MeasureNextPanel, ModelCalculator, ModelEditor, QuantityHistogram, SensitivityView } from "@haakco/custd-react";
import { APP_MODEL_FORECAST_FIELDS, APP_MODEL_INPUT_SHAPES, APP_MODEL_QUANTITY_KINDS, APP_MODEL_SOURCE_KINDS, type AppModelForecastField, type AppModelQuantityResult, type AppModelRun } from "@haakco/custd-sdk/browser";
import { useMutation } from "@tanstack/react-query";
import { useCallback } from "react";
import { useNavigate } from "react-router";
import { DownloadMenu } from "../components/DownloadMenu";
import { ImportPanel } from "../components/ImportPanel";
import { ItemHeader } from "../components/ItemHeader";
import { Loading, ReadOnlyNotice, WriteError } from "../components/ItemStates";
import { LiveLine } from "../components/LiveLine";
import { KeepInMyItems, LinksAndExpiry } from "../components/OwnerSettings";
import type { DoneWhenData, ItemAccess, Model } from "../data";
import { modelOf, useModelRun } from "../data/live";
import { formatDate } from "../lib/dates";
import { modelWorkbook } from "../lib/exports";
import { ownerPath } from "../lib/links";
import { mergeQuantities, parseQuantityTable } from "../lib/imports";
import type { Table } from "../lib/table";
import type { ItemViewProps } from "./view-props";

/** Formula quantities are the model's outputs; the rest are inputs. */
export function modelOutputs(model: Model): string[] {
  return (model.version?.quantities ?? []).filter((quantity) => quantity.kind === APP_MODEL_QUANTITY_KINDS.formula).map((quantity) => quantity.name);
}

export function modelInputs(model: Model): string[] {
  return (model.version?.quantities ?? []).filter((quantity) => quantity.kind === APP_MODEL_QUANTITY_KINDS.input).map((quantity) => quantity.name);
}

const forecastFieldLabels: Record<AppModelForecastField, string> = {
  [APP_MODEL_FORECAST_FIELDS.completionDays]: "Days to completion",
  [APP_MODEL_FORECAST_FIELDS.deadlineProbability]: "Chance of meeting the deadline",
  [APP_MODEL_FORECAST_FIELDS.ratePerDay]: "Rate per day",
};

export function ModelView({ data, access, read, live, showOwnerTools, ownerRoute }: ItemViewProps) {
  const model = modelOf(read);
  const run = useModelRun(access);
  const outputs = modelOutputs(model);
  return (
    <article aria-labelledby="item-name" className="item">
      <ItemHeader
        data={data}
        access={access}
        kind="model"
        meta={model}
        title={model.name}
        owner={showOwnerTools}
        actions={<DownloadMenu name={model.name} build={() => modelWorkbook(model, run.status === "ready" ? run.data : null, new Date())} />}
      >
        <span className="small muted">{model.latestVersion > 0 ? `Version ${model.latestVersion}` : "No quantities yet"}</span>
      </ItemHeader>
      {model.description ? <p className="lede">{model.description}</p> : null}
      {model.queuedRunError ? (
        <p className="notice notice--warn" role="status">
          The last automatic run failed ({model.queuedRunError}). The results below are from the run before it.
        </p>
      ) : null}
      {run.status === "loading" ? <Loading what="results" /> : null}
      {run.status === "error" ? <WriteError error={run.error} /> : null}
      {run.status === "ready" ? <ModelResults model={model} run={run.data} outputs={outputs} /> : null}
      {showOwnerTools && model.latestVersion > 0 ? <RunButton data={data} access={access} outputs={outputs} /> : null}
      <LiveLine freshness={live.freshness} lastUpdatedAt={live.lastUpdatedAt} />
      {model.version && outputs.length > 0 ? (
        <details className="more section">
          <summary>Try other values</summary>
          <div className="more__body">
            <ModelCalculator version={model.version} inputs={modelInputs(model)} outputs={outputs} access={access} />
          </div>
        </details>
      ) : null}
      {ownerRoute && !showOwnerTools ? <ReadOnlyNotice /> : null}
      {showOwnerTools ? <ModelOwnerTools data={data} access={access} model={model} /> : null}
    </article>
  );
}

function ModelResults({ model, run, outputs }: { model: Model; run: AppModelRun | null; outputs: string[] }) {
  if (run === null) {
    return (
      <section className="summary" aria-label="Summary">
        <p className="summary__headline">No results yet</p>
        <p className="summary__detail">
          {model.latestVersion > 0 ? "Run the model to see the range of each result." : "Add quantities below, then run the model."}
        </p>
      </section>
    );
  }
  const currentVersion = run.versionNumber === model.latestVersion;
  const results = (run.quantities ?? []).filter((result) => !currentVersion || outputs.length === 0 || outputs.includes(result.name));
  const mainResult = results.find((result) => result.name === run.sensitivityOutput) ?? results[0];
  const units = new Map((currentVersion ? model.version?.quantities ?? [] : []).map((quantity) => [quantity.name, quantity.unit ?? ""]));
  return (
    <>
      <section className="summary" aria-label="Summary">
        <p className="summary__headline">{headline(mainResult, units)}</p>
        <p className="summary__detail small">
          From {run.sampleCount.toLocaleString("en")} simulated trials of version {run.versionNumber}, {formatDate(run.createdAt)}.
        </p>
      </section>
      <div className="chart-grid">
        {results.map((result) => {
          const unit = units.get(result.name);
          return (
            <figure key={result.name} className="chart chart--short" aria-label={`${result.name} range`}>
              <QuantityHistogram result={result} title={result.name} {...(unit ? { unit } : {})} />
            </figure>
          );
        })}
      </div>
      {run.boundInputs?.length ? (
        <details className="more section">
          <summary>Linked inputs used in this run</summary>
          <div className="more__body">
            <dl>
              {run.boundInputs.map((input) => (
                <div key={input.quantity}>
                  <dt>{input.quantity} · {forecastFieldLabels[input.source.field]}</dt>
                  <dd>{input.value?.toLocaleString("en") ?? input.detail ?? "Forecast value unavailable"}</dd>
                  {input.forecastGeneratedAt ? <dd>Forecast from {formatDate(input.forecastGeneratedAt)}</dd> : null}
                  {input.forecastRunUuid ? <dd>Forecast run <code>{input.forecastRunUuid}</code></dd> : null}
                </div>
              ))}
            </dl>
          </div>
        </details>
      ) : null}
      {run.sensitivity ? (
        <details className="more section">
          <summary>What drives the result?</summary>
          <div className="more__body">
            <SensitivityView sensitivity={run.sensitivity} />
          </div>
        </details>
      ) : null}
      {run.information || run.decision ? (
        <details className="more">
          <summary>What to measure next</summary>
          <div className="more__body">
            <MeasureNextPanel information={run.information} {...(run.decision ? { decision: run.decision } : {})} />
          </div>
        </details>
      ) : null}
    </>
  );
}

function headline(result: AppModelQuantityResult | undefined, units: Map<string, string>): string {
  if (!result?.summary) return result?.error ? `${result.name}: not calculated` : "Results";
  const { p5, p50, p95 } = result.summary.percentiles;
  const unit = units.get(result.name) ? ` ${units.get(result.name) ?? ""}` : "";
  const number = (value: number) => value.toLocaleString("en", { maximumSignificantDigits: 3 });
  return `${result.name}: about ${number(p50)}${unit} (90%: ${number(p5)} – ${number(p95)})`;
}

function RunButton({ data, access, outputs }: { data: DoneWhenData; access: ItemAccess; outputs: string[] }) {
  const run = useMutation({ mutationFn: () => data.runModel(access, outputs[0] ? { sensitivityOutput: outputs[0] } : {}) });
  return (
    <div className="button-row section">
      <button type="button" className="button button--primary" disabled={run.isPending} onClick={() => { run.mutate(); }}>
        {run.isPending ? "Running…" : "Run model"}
      </button>
      <WriteError error={run.error} />
    </div>
  );
}

function ModelOwnerTools({ data, access, model }: { data: DoneWhenData; access: ItemAccess; model: Model }) {
  const navigate = useNavigate();
  const copy = useMutation({
    mutationFn: () => data.copyModel(access),
    onSuccess: (created) => { void navigate(ownerPath("model", created.ownerToken)); },
  });
  return (
    <section className="section owner-tools" aria-labelledby="owner-heading">
      <h2 id="owner-heading">Owner tools</h2>
      <details className="more" open={model.latestVersion === 0}>
        <summary>Edit quantities</summary>
        <div className="more__body">
          <ModelEditor
            key={model.latestVersion}
            quantities={model.version?.quantities ?? []}
            onSave={(request) => data.saveModelVersion(access, request)}
          />
        </div>
      </details>
      {modelInputs(model).length > 0 ? <CounterBinding key={model.latestVersion} data={data} access={access} model={model} /> : null}
      {model.version ? (
        <div className="button-row">
          <button type="button" className="button" disabled={copy.isPending} onClick={() => { copy.mutate(); }}>
            {copy.isPending ? "Copying…" : "Copy model"}
          </button>
          <WriteError error={copy.error} />
        </div>
      ) : null}
      <details className="more">
        <summary>Import quantities</summary>
        <div className="more__body">
          <QuantityImport data={data} access={access} model={model} />
        </div>
      </details>
      <details className="more">
        <summary>Links, expiry and my items</summary>
        <div className="more__body">
          <KeepInMyItems data={data} access={access} kind="model" meta={model} />
          <LinksAndExpiry data={data} access={access} kind="model" meta={model} />
        </div>
      </details>
    </section>
  );
}

function CounterBinding({ data, access, model }: { data: DoneWhenData; access: ItemAccess; model: Model }) {
  const save = useMutation({
    mutationFn: async ({ name, link, field }: { name: string; link: string; field: AppModelForecastField }) => {
      const projectUuid = await data.readCounterForecastSource(link);
      const quantities = (model.version?.quantities ?? []).map((quantity) =>
        quantity.name === name && quantity.kind === APP_MODEL_QUANTITY_KINDS.input
          ? {
            ...quantity,
            input: {
              shape: APP_MODEL_INPUT_SHAPES.bound,
              source: { kind: APP_MODEL_SOURCE_KINDS.counterForecast, projectUuid, field },
            },
          }
          : quantity,
      );
      await data.saveModelVersion(access, { quantities });
    },
  });

  return (
    <details className="more">
      <summary>Link a counter forecast</summary>
      <form className="more__body" onSubmit={(event) => {
        event.preventDefault();
        const fields = new FormData(event.currentTarget);
        const field = Object.values(APP_MODEL_FORECAST_FIELDS).find((value) => value === fields.get("field"));
        if (field) save.mutate({ name: String(fields.get("quantity")), link: String(fields.get("link")), field });
      }}>
        <label className="field">
          Input quantity
          <select name="quantity">{modelInputs(model).map((name) => <option key={name}>{name}</option>)}</select>
        </label>
        <label className="field">
          Counter link
          <input name="link" required autoComplete="off" />
        </label>
        <label className="field">
          Forecast value
          <select name="field">
            {Object.values(APP_MODEL_FORECAST_FIELDS).map((field) => <option key={field} value={field}>{forecastFieldLabels[field]}</option>)}
          </select>
        </label>
        <button type="submit" className="button" disabled={save.isPending}>
          {save.isPending ? "Saving…" : "Save linked input"}
        </button>
        <WriteError error={save.error} />
      </form>
    </details>
  );
}

function QuantityImport({ data, access, model }: { data: DoneWhenData; access: ItemAccess; model: Model }) {
  const existing = model.version?.quantities;
  const parse = useCallback((table: Table) => parseQuantityTable(table, existing ?? []), [existing]);
  return (
    <ImportPanel
      what="quantities"
      hint="Columns: name, value, unit and description. Value is a number, 5 to 10, 3 of 10 or =formula. Rows replace quantities with the same name and add the rest, as a new version."
      placeholder={"name,value,unit,description\nhours,5 to 10,h,\nrate,40,$/h,\ntotal,=hours * rate,$,"}
      parse={parse}
      onImport={async (quantities) => {
        await data.saveModelVersion(access, { quantities: mergeQuantities(existing ?? [], quantities), note: `Imported ${quantities.length} quantities` });
        return { landed: quantities.length, refused: 0, failure: null };
      }}
    />
  );
}

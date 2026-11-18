import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { useNavigate } from "react-router";
import type { CounterDraft, DoneWhenData, ForecastMethod } from "../data";
import { DEFAULT_FORECAST_METHOD } from "../data/mappers";
import { parseMeasurementCsv, type CsvRowError } from "../lib/csv";
import { dateInputToRfc3339 } from "../lib/dates";
import { DEFAULT_EXPIRY_SECONDS } from "../lib/expiry";
import { ownerPath } from "../lib/links";
import { ExpiryField } from "./ExpiryField";
import { Field } from "./Field";
import { MethodField } from "./MethodField";
import { CsvField } from "./MeasurementForms";
import { WriteError } from "./ItemStates";

export type CounterFormValues = { name: string; unit: string; startValue: string; targetValue: string; startedAt: string; deadline: string; history: string };

export const EMPTY_COUNTER: CounterFormValues = { name: "", unit: "", startValue: "0", targetValue: "", startedAt: "", deadline: "", history: "" };

/** Router state after creating a counter: how many start or history rows Custd refused. */
export type CreatedState = { rejected: number };

type CounterFormProps = { data: DoneWhenData; initial?: CounterFormValues; moreOpen?: boolean };

/** The common task in one form: name, target, create. Everything else waits behind "More options". */
export function CounterForm({ data, initial = EMPTY_COUNTER, moreOpen = false }: CounterFormProps) {
  const navigate = useNavigate();
  const [form, setForm] = useState(initial);
  const [expiry, setExpiry] = useState(DEFAULT_EXPIRY_SECONDS);
  const [method, setMethod] = useState<ForecastMethod>(DEFAULT_FORECAST_METHOD);
  const [rowErrors, setRowErrors] = useState<CsvRowError[]>([]);
  const create = useMutation({
    mutationFn: (draft: CounterDraft) => data.createCounter(draft, { method, forecastFrom: null }),
    onSuccess: (created) => navigate(ownerPath("counter", created.ownerToken), { state: { rejected: created.rejected } satisfies CreatedState }),
  });
  const set = (key: keyof CounterFormValues) => (event: { target: { value: string } }) => {
    setForm({ ...form, [key]: event.target.value });
  };
  return (
    <form
      className="form"
      aria-label="New counter"
      onSubmit={(event) => {
        event.preventDefault();
        const history = form.history.trim() === "" ? { measurements: [], errors: [] } : parseMeasurementCsv(form.history);
        setRowErrors(history.errors);
        if (history.errors.length === 0) {
          create.mutate(toDraft(form, history.measurements, expiry));
        }
      }}
    >
      <Field label="What are you counting?" hint="For example: pages written, kilometres run, tickets closed.">
        {(control) => <input {...control} required maxLength={255} value={form.name} onChange={set("name")} />}
      </Field>
      <Field label="Target" hint="The number that means done.">
        {(control) => <input {...control} type="number" step="any" inputMode="decimal" required value={form.targetValue} onChange={set("targetValue")} />}
      </Field>
      <details className="more" open={moreOpen || rowErrors.length > 0}>
        <summary>More options: unit, start value, past numbers, deadline</summary>
        <div className="more__body">
          <Field label="Unit" hint="Any words, e.g. pages or km. Shown next to the numbers.">
            {(control) => <input {...control} maxLength={255} value={form.unit} onChange={set("unit")} />}
          </Field>
          <div className="field-row">
            <Field label="Start value">
              {(control) => <input {...control} type="number" step="any" inputMode="decimal" required value={form.startValue} onChange={set("startValue")} />}
            </Field>
            <Field label="Started" hint="Defaults to now">
              {(control) => <input {...control} type="datetime-local" value={form.startedAt} onChange={set("startedAt")} />}
            </Field>
            <Field label="Deadline" hint="Shows the chance of making it">
              {(control) => <input {...control} type="date" value={form.deadline} onChange={set("deadline")} />}
            </Field>
          </div>
          <CsvField
            label="Past numbers (optional)"
            text={form.history}
            onText={(history) => {
              setForm({ ...form, history });
            }}
            rowErrors={rowErrors}
          />
          <MethodField value={method} onChange={setMethod} />
          <ExpiryField value={expiry} onChange={setExpiry} />
        </div>
      </details>
      <WriteError error={create.error} />
      <div className="button-row">
        <button type="submit" className="button button--primary button--big" disabled={create.isPending}>
          {create.isPending ? "Creating…" : "Create counter"}
        </button>
      </div>
    </form>
  );
}

function toDraft(form: CounterFormValues, history: CounterDraft["history"], expiresAfterSeconds: number): CounterDraft {
  return {
    name: form.name.trim(),
    unit: form.unit.trim(),
    startValue: Number(form.startValue),
    targetValue: Number(form.targetValue),
    startedAt: form.startedAt ? new Date(form.startedAt).toISOString() : new Date().toISOString(),
    deadline: form.deadline ? dateInputToRfc3339(form.deadline) : null,
    history,
    expiresAfterSeconds,
  };
}

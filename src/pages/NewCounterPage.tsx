import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { useNavigate } from "react-router";
import { ExpiryField } from "../components/ExpiryField";
import { Field } from "../components/Field";
import { CsvField } from "../components/MeasurementForms";
import { data, type CounterDraft } from "../data";
import { parseMeasurementCsv, type CsvRowError } from "../lib/csv";
import { DEFAULT_EXPIRY_SECONDS } from "../lib/expiry";
import { itemPath } from "../lib/links";

type CounterForm = { name: string; unit: string; startValue: string; targetValue: string; startedAt: string; deadline: string; history: string };

const EMPTY: CounterForm = { name: "", unit: "", startValue: "0", targetValue: "", startedAt: "", deadline: "", history: "" };

export function NewCounterPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState(EMPTY);
  const [expiry, setExpiry] = useState(DEFAULT_EXPIRY_SECONDS);
  const [rowErrors, setRowErrors] = useState<CsvRowError[]>([]);
  const create = useMutation({
    mutationFn: (draft: CounterDraft) => data.createCounter(draft),
    onSuccess: (created) => navigate(itemPath("counter", "owner", created.links.ownerToken)),
  });
  const set = (key: keyof CounterForm) => (event: { target: { value: string } }) => {
    setForm({ ...form, [key]: event.target.value });
  };
  return (
    <>
      <h1>New counter</h1>
      <p className="lede">Count your way to a target and see when you will get there.</p>
      <form
        className="form"
        onSubmit={(event) => {
          event.preventDefault();
          const history = form.history.trim() === "" ? { measurements: [], errors: [] } : parseMeasurementCsv(form.history);
          setRowErrors(history.errors);
          if (history.errors.length === 0) {
            create.mutate(toDraft(form, history.measurements, expiry));
          }
        }}
      >
        <Field label="What are you counting?">
          {(control) => <input {...control} required value={form.name} onChange={set("name")} />}
        </Field>
        <div className="field-row">
          <Field label="Start value">
            {(control) => <input {...control} type="number" step="any" required value={form.startValue} onChange={set("startValue")} />}
          </Field>
          <Field label="Target">
            {(control) => <input {...control} type="number" step="any" required value={form.targetValue} onChange={set("targetValue")} />}
          </Field>
          <Field label="Unit" hint="Optional, e.g. pages">
            {(control) => <input {...control} value={form.unit} onChange={set("unit")} />}
          </Field>
        </div>
        <div className="field-row">
          <Field label="Started" hint="Optional; defaults to now">
            {(control) => <input {...control} type="datetime-local" value={form.startedAt} onChange={set("startedAt")} />}
          </Field>
          <Field label="Deadline" hint="Optional; shows the chance of making it">
            {(control) => <input {...control} type="date" value={form.deadline} onChange={set("deadline")} />}
          </Field>
        </div>
        <CsvField label="History (optional)" text={form.history} onText={(history) => { setForm({ ...form, history }); }} rowErrors={rowErrors} />
        <ExpiryField value={expiry} onChange={setExpiry} />
        {create.error ? <p className="field__error" role="alert">{create.error.message}</p> : null}
        <div className="button-row">
          <button type="submit" className="button button--primary" disabled={create.isPending}>
            {create.isPending ? "Creating…" : "Create counter"}
          </button>
        </div>
      </form>
    </>
  );
}

function toDraft(form: CounterForm, history: CounterDraft["history"], expiresAfterSeconds: number): CounterDraft {
  return {
    name: form.name.trim(),
    unit: form.unit.trim(),
    startValue: Number(form.startValue),
    targetValue: Number(form.targetValue),
    startedAt: form.startedAt ? new Date(form.startedAt).toISOString() : new Date().toISOString(),
    deadline: form.deadline || null,
    history,
    expiresAfterSeconds,
  };
}

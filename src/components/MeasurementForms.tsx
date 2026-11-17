import { useState } from "react";
import type { Measurement } from "../data";
import { parseMeasurementCsv, type CsvRowError } from "../lib/csv";
import { Field } from "./Field";

/** `onSubmit` reports success through `onSaved`; failures show through `error`. */
type SubmitProps = {
  onSubmit: (measurements: Measurement[], onSaved: () => void) => void;
  pending: boolean;
  error: Error | null;
};

export function AddMeasurementForm({ onSubmit, pending, error }: SubmitProps) {
  const [value, setValue] = useState("");
  return (
    <form
      className="form"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit([{ measuredAt: new Date().toISOString(), value: Number(value) }], () => {
          setValue("");
        });
      }}
    >
      <Field label="New value" hint="Recorded now." error={error?.message ?? null}>
        {(control) => (
          <input {...control} type="number" step="any" required value={value} onChange={(event) => { setValue(event.target.value); }} />
        )}
      </Field>
      <div className="button-row">
        <button type="submit" className="button button--primary" disabled={pending}>
          {pending ? "Adding…" : "Add measurement"}
        </button>
      </div>
    </form>
  );
}

export function CsvImportForm({ onSubmit, pending, error }: SubmitProps) {
  const [text, setText] = useState("");
  const [rowErrors, setRowErrors] = useState<CsvRowError[]>([]);
  return (
    <form
      className="form"
      onSubmit={(event) => {
        event.preventDefault();
        const parsed = parseMeasurementCsv(text);
        setRowErrors(parsed.errors);
        if (parsed.errors.length === 0) {
          onSubmit(parsed.measurements, () => {
            setText("");
          });
        }
      }}
    >
      <CsvField text={text} onText={setText} rowErrors={rowErrors} />
      {error ? <p className="field__error">{error.message}</p> : null}
      <div className="button-row">
        <button type="submit" className="button" disabled={pending}>
          {pending ? "Importing…" : "Import rows"}
        </button>
      </div>
    </form>
  );
}

type CsvFieldProps = { text: string; onText: (text: string) => void; rowErrors: CsvRowError[]; label?: string };

/** Paste or choose a two-column CSV. Bad rows are listed by line and nothing is added until fixed. */
export function CsvField({ text, onText, rowErrors, label = "CSV rows" }: CsvFieldProps) {
  const summary = rowErrors.length > 0 ? `${rowErrors.length} row${rowErrors.length === 1 ? "" : "s"} need fixing; nothing was added.` : null;
  return (
    <>
      <Field label={label} hint="Two columns: ISO timestamp, value. One row per line; a header row is fine." error={summary}>
        {(control) => (
          <textarea {...control} value={text} placeholder={"2026-11-01T09:00:00Z,12\n2026-11-02T09:00:00Z,15"} onChange={(event) => { onText(event.target.value); }} />
        )}
      </Field>
      <Field label="Or choose a CSV file">
        {(control) => (
          <input
            {...control}
            type="file"
            accept=".csv,text/csv"
            onChange={(event) => {
              void event.target.files?.[0]?.text().then(onText);
            }}
          />
        )}
      </Field>
      {rowErrors.length > 0 ? (
        <ul className="field__error">
          {rowErrors.map((rowError) => (
            <li key={`${rowError.line}-${rowError.message}`}>{rowError.line > 0 ? `Line ${rowError.line}: ` : ""}{rowError.message}</li>
          ))}
        </ul>
      ) : null}
    </>
  );
}

import { useMutation } from "@tanstack/react-query";
import { useId, useMemo, useState } from "react";
import { explainError, type ImportOutcome } from "../data";
import type { ImportPlan } from "../lib/imports";
import { parseCsvTable, type Table } from "../lib/table";
import { isXlsxFile, readXlsx } from "../lib/xlsx";
import { Field } from "./Field";
import { WriteError } from "./ItemStates";

/** The preview lists at most this many problems and sample rows; the counts cover the whole file. */
const SHOWN_ERRORS = 50;
const SHOWN_ROWS = 10;

type ImportPanelProps<T> = {
  /** Plural noun for the rows, e.g. "measurements". */
  what: string;
  hint: string;
  placeholder: string;
  parse: (table: Table) => ImportPlan<T>;
  /** A whole-file refusal the parse cannot know, such as a full counter. */
  check?: (good: T[]) => string | null;
  onImport: (good: T[]) => Promise<ImportOutcome>;
};

/** Paste or choose a CSV or Excel file, see every row it would add, then import the good ones. */
export function ImportPanel<T>({ what, hint, placeholder, parse, check, onImport }: ImportPanelProps<T>) {
  const [text, setText] = useState("");
  const [table, setTable] = useState<Table | null>(null);
  const [fileNote, setFileNote] = useState<string | null>(null);
  const [fileKey, setFileKey] = useState(0);
  const plan = useMemo(() => (table ? parse(table) : null), [table, parse]);
  const send = useMutation({ mutationFn: onImport });
  const reset = () => {
    setText("");
    setTable(null);
    setFileNote(null);
    setFileKey((key) => key + 1);
  };
  const readFile = async (file: File) => {
    send.reset();
    setText("");
    setFileNote(`Reading ${file.name}…`);
    try {
      setTable(isXlsxFile(file) ? await readXlsx(file) : parseCsvTable(await file.text()));
      setFileNote(isXlsxFile(file) ? `${file.name}: the first sheet.` : file.name);
    } catch {
      setTable(null);
      setFileNote(`${file.name} could not be read. Save it as .xlsx or .csv and try again.`);
    }
  };
  const problem = plan ? (plan.problem ?? check?.(plan.good) ?? null) : null;
  return (
    <div className="form import">
      <Field label={`Paste ${what}`} hint={hint}>
        {(control) => (
          <textarea
            {...control}
            value={text}
            placeholder={placeholder}
            onChange={(event) => {
              send.reset();
              setFileNote(null);
              setText(event.target.value);
              setTable(event.target.value.trim() === "" ? null : parseCsvTable(event.target.value));
            }}
          />
        )}
      </Field>
      <Field label="Or choose a file" hint={fileNote ?? "CSV or Excel (.xlsx). Exported Done When files import as they are."}>
        {(control) => (
          <input
            {...control}
            key={fileKey}
            type="file"
            accept=".csv,.txt,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void readFile(file);
            }}
          />
        )}
      </Field>
      {plan ? <ImportPreview plan={plan} problem={problem} what={what} /> : null}
      <WriteError error={send.error} />
      {plan && problem === null && plan.good.length > 0 ? (
        <div className="button-row">
          <button type="button" className="button button--primary" disabled={send.isPending} onClick={() => { send.mutate(plan.good, { onSuccess: reset }); }}>
            {send.isPending ? "Importing…" : importLabel(plan, what)}
          </button>
        </div>
      ) : null}
      {send.data ? (
        <p className={send.data.failure || send.data.refused > 0 ? "field__error" : "notice notice--done"} role="status">
          {outcomeText(send.data, what)}
        </p>
      ) : null}
    </div>
  );
}

function importLabel(plan: ImportPlan<unknown>, what: string): string {
  const bad = plan.rows.length - plan.good.length;
  return bad > 0 ? `Import ${plan.good.length} good ${what}, skip ${bad}` : `Import ${plan.good.length} ${what}`;
}

function outcomeText(outcome: ImportOutcome, what: string): string {
  const landed = `Imported ${outcome.landed} ${what}`;
  if (outcome.failure) return `${landed}, then it stopped: ${explainError(outcome.failure)}`;
  if (outcome.refused > 0) return `${landed}; Custd did not accept ${outcome.refused}.`;
  return `${landed}.`;
}

function ImportPreview({ plan, problem, what }: { plan: ImportPlan<unknown>; problem: string | null; what: string }) {
  const headingId = useId();
  const errors = plan.rows.filter((row) => row.error !== null);
  const sample = plan.rows.slice(0, SHOWN_ROWS);
  return (
    <section className="import__preview" aria-labelledby={headingId}>
      <h3 id={headingId}>Preview</h3>
      {problem ? (
        <p className="field__error" role="alert">
          {problem} Nothing will be imported.
        </p>
      ) : (
        <p role="status">
          <strong>
            {plan.good.length} of {plan.rows.length} {what}
          </strong>{" "}
          ready.{errors.length > 0 ? ` ${errors.length} need fixing and will be skipped.` : ""}
        </p>
      )}
      {errors.length > 0 ? (
        <ul className="field__error import__errors" aria-label="Rows that need fixing">
          {errors.slice(0, SHOWN_ERRORS).map((row) => (
            <li key={row.line}>
              Line {row.line}: {row.error}
            </li>
          ))}
          {errors.length > SHOWN_ERRORS ? <li>…and {errors.length - SHOWN_ERRORS} more.</li> : null}
        </ul>
      ) : null}
      {sample.length > 0 ? (
        <div className="table-scroll">
          <table className="estimates import__table">
            <caption className="visually-hidden">First {sample.length} rows as they will be imported</caption>
            <thead>
              <tr>
                <th scope="col">Line</th>
                {plan.columns.map((column) => (
                  <th key={column} scope="col">
                    {column}
                  </th>
                ))}
                <th scope="col">Check</th>
              </tr>
            </thead>
            <tbody>
              {sample.map((row) => (
                <tr key={row.line} className={row.error ? "import__bad" : undefined}>
                  <td className="numeric">{row.line}</td>
                  {row.error ? (
                    <td colSpan={plan.columns.length}>{row.cells.join(", ")}</td>
                  ) : (
                    plan.columns.map((column, index) => <td key={column}>{row.cells[index] ?? ""}</td>)
                  )}
                  <td>{row.error ? <span><span aria-hidden="true">✕ </span>{row.error}</span> : <span><span aria-hidden="true">✓ </span>OK</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {plan.rows.length > SHOWN_ROWS ? <p className="small muted">Showing the first {SHOWN_ROWS} of {plan.rows.length} rows.</p> : null}
        </div>
      ) : null}
    </section>
  );
}

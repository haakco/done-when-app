import { useMutation } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { ExpiryField } from "../components/ExpiryField";
import { Field } from "../components/Field";
import { WriteError } from "../components/ItemStates";
import { WithData } from "../components/WithData";
import type { DoneWhenData, MeetingDraft } from "../data";
import { sampleMeetingAgenda } from "../data/meeting-example";
import { DEFAULT_EXPIRY_SECONDS } from "../lib/expiry";
import { ownerPath } from "../lib/links";
import { formatLength } from "../lib/meeting";
import "../styles/meeting.css";

/** Custd's agenda limits. */
const MAX_BLOCKS = 128;
const MAX_TITLE_BYTES = 200;
const MAX_MINUTES = 28 * 24 * 60;

type Row = { id: number; title: string; minutes: string };
type Move = "up" | "down";

export function NewMeetingPage() {
  const [params] = useSearchParams();
  const sample = params.get("example") === "launch-review";
  return (
    <>
      <h1>New meeting</h1>
      <p className="lede">Plan the agenda with a time for each part. Run it live: saved time goes back to the blocks that remain, overruns reduce their time, and the history shows how it went.</p>
      <WithData>{({ data }) => <MeetingForm data={data} sample={sample} />}</WithData>
    </>
  );
}

function minutesOf(row: Row): number {
  const value = Number(row.minutes.replace(",", "."));
  return row.minutes.trim() === "" || !Number.isFinite(value) ? Number.NaN : value;
}

/** Plain words for the first thing wrong with a row, or null. */
function rowError(row: Row): string | null {
  if (new TextEncoder().encode(row.title.trim()).length > MAX_TITLE_BYTES) return "Use a shorter title.";
  const minutes = minutesOf(row);
  if (Number.isNaN(minutes)) return null;
  if (minutes < 1) return "At least 1 minute.";
  if (minutes > MAX_MINUTES) return "At most 28 days.";
  return null;
}

function MeetingForm({ data, sample }: { data: DoneWhenData; sample: boolean }) {
  const navigate = useNavigate();
  const [name, setName] = useState(sample ? "Launch review" : "");
  const [rows, setRows] = useState<Row[]>(() => sample
    ? sampleMeetingAgenda.map(({ title, minutes }, index) => ({ id: index + 1, title, minutes: String(minutes) }))
    : [{ id: 1, title: "", minutes: "" }]);
  const nextId = useRef(rows.length + 1);
  const [expiry, setExpiry] = useState(DEFAULT_EXPIRY_SECONDS);
  const [moved, setMoved] = useState("");
  const controls = useRef(new Map<string, HTMLElement>());
  const create = useMutation({
    mutationFn: (draft: MeetingDraft) => data.createMeeting(draft),
    onSuccess: (created) => navigate(ownerPath("meeting", created.ownerToken)),
  });
  const totalMs = rows.reduce((sum, row) => sum + (minutesOf(row) > 0 ? minutesOf(row) * 60_000 : 0), 0);
  const focusLater = (key: string) => {
    requestAnimationFrame(() => controls.current.get(key)?.focus());
  };
  const update = (id: number, change: Partial<Row>) => {
    setRows((current) => current.map((row) => (row.id === id ? { ...row, ...change } : row)));
  };
  const add = () => {
    const id = nextId.current++;
    setRows((current) => [...current, { id, title: "", minutes: "" }]);
    focusLater(`title-${id}`);
  };
  const remove = (index: number) => {
    const next = rows[index + 1] ?? rows[index - 1];
    setRows((current) => current.filter((_, at) => at !== index));
    setMoved(`Removed block ${index + 1}.`);
    if (next) focusLater(`title-${next.id}`);
  };
  const move = (index: number, direction: Move) => {
    const to = direction === "up" ? index - 1 : index + 1;
    const row = rows[index];
    if (!row || to < 0 || to >= rows.length) return;
    setRows((current) => {
      const reordered = [...current];
      const [taken] = reordered.splice(index, 1);
      if (taken) reordered.splice(to, 0, taken);
      return reordered;
    });
    setMoved(`Moved “${row.title.trim() || `block ${index + 1}`}” to position ${to + 1} of ${rows.length}.`);
    // Keep focus on the same button, or its partner at either end of the list.
    const atEnd = (direction === "up" && to === 0) || (direction === "down" && to === rows.length - 1);
    focusLater(`${atEnd ? (direction === "up" ? "down" : "up") : direction}-${row.id}`);
  };
  const errors = rows.map(rowError);
  const invalid = errors.some((error) => error !== null) || totalMs > MAX_MINUTES * 60_000;
  return (
    <form
      className="form"
      onSubmit={(event) => {
        event.preventDefault();
        if (invalid) return;
        create.mutate({ name: name.trim(), blocks: rows.map((row) => ({ title: row.title.trim(), minutes: minutesOf(row) })), expiresAfterSeconds: expiry });
      }}
    >
      <Field label="Meeting name" hint="For example: Weekly team sync.">
        {(control) => <input {...control} required maxLength={200} value={name} onChange={(event) => { setName(event.target.value); }} />}
      </Field>
      <fieldset className="agenda-builder">
        <legend>Agenda</legend>
        <ol className="agenda-builder__rows">
          {rows.map((row, index) => (
            <li key={row.id} className="agenda-builder__row">
              <span className="agenda-builder__number" aria-hidden="true">
                {index + 1}
              </span>
              <div className="field agenda-builder__title">
                <label htmlFor={`block-title-${row.id}`}>Block {index + 1} title</label>
                <input
                  id={`block-title-${row.id}`}
                  ref={(element) => { if (element) controls.current.set(`title-${row.id}`, element); else controls.current.delete(`title-${row.id}`); }}
                  required
                  value={row.title}
                  onChange={(event) => { update(row.id, { title: event.target.value }); }}
                  {...(errors[index] ? { "aria-invalid": true, "aria-describedby": `block-error-${row.id}` } : {})}
                />
              </div>
              <div className="field agenda-builder__minutes">
                <label htmlFor={`block-minutes-${row.id}`}>Minutes</label>
                <input
                  id={`block-minutes-${row.id}`}
                  required
                  inputMode="decimal"
                  value={row.minutes}
                  onChange={(event) => { update(row.id, { minutes: event.target.value }); }}
                  {...(errors[index] ? { "aria-invalid": true, "aria-describedby": `block-error-${row.id}` } : {})}
                />
              </div>
              <div className="agenda-builder__tools">
                <RowButton refs={controls} name={`up-${row.id}`} disabled={index === 0} label={`Move block ${index + 1} up`} glyph="↑" onClick={() => { move(index, "up"); }} />
                <RowButton refs={controls} name={`down-${row.id}`} disabled={index === rows.length - 1} label={`Move block ${index + 1} down`} glyph="↓" onClick={() => { move(index, "down"); }} />
                <RowButton refs={controls} name={`remove-${row.id}`} disabled={rows.length === 1} label={`Remove block ${index + 1}`} glyph="✕" onClick={() => { remove(index); }} />
              </div>
              {errors[index] ? (
                <span id={`block-error-${row.id}`} className="field__error agenda-builder__error">
                  {errors[index]}
                </span>
              ) : null}
            </li>
          ))}
        </ol>
        <div className="agenda-builder__foot">
          <button type="button" className="button" disabled={rows.length >= MAX_BLOCKS} onClick={add}>
            <span aria-hidden="true">+</span> Add block
          </button>
          <p className="agenda-builder__total numeric" aria-live="polite">
            Total <strong>{formatLength(totalMs)}</strong> · {rows.length} block{rows.length === 1 ? "" : "s"}
          </p>
        </div>
        <span className="visually-hidden" role="status">
          {moved}
        </span>
      </fieldset>
      <details className="more">
        <summary>More options: expiry</summary>
        <div className="more__body">
          <ExpiryField value={expiry} onChange={setExpiry} />
        </div>
      </details>
      <WriteError error={create.error} />
      <div className="button-row">
        <button type="submit" className="button button--primary button--big" disabled={create.isPending}>
          {create.isPending ? "Creating…" : "Create meeting"}
        </button>
      </div>
    </form>
  );
}

type RowButtonProps = { refs: React.RefObject<Map<string, HTMLElement>>; name: string; disabled: boolean; label: string; glyph: string; onClick: () => void };

function RowButton({ refs, name, disabled, label, glyph, onClick }: RowButtonProps) {
  return (
    <button
      type="button"
      className="button agenda-builder__tool"
      ref={(element) => { if (element) refs.current.set(name, element); else refs.current.delete(name); }}
      disabled={disabled}
      aria-label={label}
      title={label}
      onClick={onClick}
    >
      <span aria-hidden="true">{glyph}</span>
    </button>
  );
}

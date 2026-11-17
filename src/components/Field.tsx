import { useId, type ReactNode } from "react";

export type ControlProps = { id: string; "aria-describedby"?: string; "aria-invalid"?: boolean };

type FieldProps = { label: string; hint?: string; error?: string | null; children: (control: ControlProps) => ReactNode };

/** Label above the control, hint and error below, both linked to the control. */
export function Field({ label, hint, error, children }: FieldProps) {
  const id = useId();
  const describedBy = [hint ? `${id}-hint` : null, error ? `${id}-error` : null].filter(Boolean).join(" ");
  const control: ControlProps = { id };
  if (describedBy) {
    control["aria-describedby"] = describedBy;
  }
  if (error) {
    control["aria-invalid"] = true;
  }
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {children(control)}
      {hint ? (
        <span id={`${id}-hint`} className="field__hint">
          {hint}
        </span>
      ) : null}
      {error ? (
        <span id={`${id}-error`} className="field__error">
          {error}
        </span>
      ) : null}
    </div>
  );
}

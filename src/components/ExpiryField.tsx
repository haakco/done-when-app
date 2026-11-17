import { useId } from "react";
import { EXPIRY_OPTIONS } from "../lib/expiry";

type ExpiryFieldProps = { value: number; onChange: (seconds: number) => void };

export function ExpiryField({ value, onChange }: ExpiryFieldProps) {
  const id = useId();
  return (
    <div className="field">
      <label htmlFor={id}>Delete after no updates for</label>
      <select
        id={id}
        aria-describedby={`${id}-hint`}
        value={value}
        onChange={(event) => {
          onChange(Number(event.target.value));
        }}
      >
        {EXPIRY_OPTIONS.map((option) => (
          <option key={option.seconds} value={option.seconds}>
            {option.label}
          </option>
        ))}
      </select>
      <span id={`${id}-hint`} className="field__hint">
        No account needed. Each update resets the clock.
      </span>
    </div>
  );
}

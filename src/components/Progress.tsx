type ProgressProps = { label: string; current: number; start: number; target: number; unit: string };

export function Progress({ label, current, start, target, unit }: ProgressProps) {
  const span = target - start;
  const fraction = span === 0 ? 1 : Math.min(Math.max((current - start) / span, 0), 1);
  const percent = Math.round(fraction * 100);
  const valueText = `${percent}% — ${current} of ${target}${unit ? ` ${unit}` : ""}`;
  return (
    <div className="progress">
      <div
        className="progress__track"
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        aria-valuetext={valueText}
      >
        <div className="progress__fill" style={{ width: `${percent}%` }} />
        <div className="progress__finish" aria-hidden="true" />
      </div>
      <p className="small numeric">{valueText}</p>
    </div>
  );
}

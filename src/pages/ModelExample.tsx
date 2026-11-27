import { useState } from "react";
import { Link } from "react-router";

export const modelExampleName = "Launch materials";
const printingEstimate = { low: 300, high: 500 };
const printingQuote = { low: 360, high: 380 };
const delivery = { low: 50, high: 150 };

function total(printing: typeof printingEstimate) {
  return { low: printing.low + delivery.low, high: printing.high + delivery.high };
}

const baseline = total(printingEstimate);
export const modelExampleBaseline = `$${baseline.low}–${baseline.high}`;

export default function ModelExample() {
  const [quoted, setQuoted] = useState(false);
  const printing = quoted ? printingQuote : printingEstimate;
  const { low, high } = total(printing);
  const scale = baseline.high - baseline.low;
  return (
    <article className="item">
      <p className="small muted">Sample model</p>
      <h1>How much will the launch materials cost?</h1>
      <p>Combine the possible printing and delivery costs to see what to budget.</p>
      <section className="summary" aria-live="polite" aria-label="Total cost">
        <p className="summary__headline">Between ${low} and ${high}</p>
        <p className="summary__detail">{quoted ? "Delivery now has the wider range. Check the delivery options next." : "Printing has the wider range. Get a quote for printing first."}</p>
        <div className="example-range" aria-hidden="true">
          <span style={{ insetInlineStart: `${100 * (low - baseline.low) / scale}%`, inlineSize: `${100 * (high - low) / scale}%` }} />
        </div>
      </section>
      <dl>
        <div><dt>Printing</dt><dd>{`$${printing.low}–${printing.high}`}</dd></div>
        <div><dt>Delivery</dt><dd>{`$${delivery.low}–${delivery.high}`}</dd></div>
      </dl>
      <button type="button" className="button" onClick={() => { setQuoted(!quoted); }}>{quoted ? "Reset quote" : "Use the printer’s quote"}</button>
      <p className="button-row"><Link className="button button--primary" to="/new/model">Start a model</Link></p>
    </article>
  );
}

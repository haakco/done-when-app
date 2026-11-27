import { APP_FORECAST_METHODS } from "@haakco/custd-sdk/browser";
import { METHOD_LABEL } from "../components/MethodField";
import { FORECAST_MIN_MEASUREMENTS } from "../data/source";

export function ForecastingGuide() {
  return (
    <article className="page">
      <h1>Forecasting guide</h1>
      <p className="lede">Read the results and choose inputs that match how your work gets done.</p>

      <section className="section" id="results">
        <h2>Read a forecast</h2>
        <dl>
          <dt>Likely done (median)</dt>
          <dd>Half of the predicted finishes are at or before this date. The other half are at or after it.</dd>
          <dt>90% range</dt>
          <dd>The span from the 5th to the 95th percentile. The middle 90% of predicted outcomes fall within it when both bounds can be estimated.</dd>
          <dt>Chance by the deadline</dt>
          <dd>The share of predicted outcomes that finish by the date you set. All three results depend on the inputs and the model’s assumptions.</dd>
        </dl>
      </section>

      <section className="section" id="plans">
        <h2>Plans</h2>
        <p>Plans use Monte Carlo simulation automatically. Each run samples durations independently from the linked counter forecasts and project estimates, then applies the plan dependencies.</p>
        <ul>
          <li><strong>Required to finish the plan</strong> is on when you add work. Keep it on for work that must be done before launch. An optional part can still delay the plan if a required part depends on it.</li>
          <li><strong>After</strong> starts with no dependencies. Select a part if it must finish before this part can start. For the site launch, sign-off must wait for page edits and checks.</li>
          <li><strong>Deadline</strong> starts blank. Set it to compare the simulated finish dates with your launch commitment.</li>
        </ul>
        <p>Each required part and its prerequisites need usable forecast evidence. A shared cause of delays across parts can make the actual finish dates more variable than this independent model predicts.</p>
      </section>

      <section className="section" id="counters">
        <h2>Counter forecasts</h2>
        <p>Set a target and add at least {FORECAST_MIN_MEASUREMENTS} dated measurements. Set a deadline if you want the chance of reaching the target by that date.</p>
        <dl>
          <dt>{METHOD_LABEL[APP_FORECAST_METHODS.bayesianLinearRegression]} (default)</dt>
          <dd>Fits an overall trend to the measurements and estimates when it will reach the target. Use it when progress follows a roughly steady pace.</dd>
          <dt>{METHOD_LABEL[APP_FORECAST_METHODS.seasonal7Day]}</dt>
          <dd>Fits an overall trend with a repeating seven-day pattern. Use dated history that spans multiple weeks when progress regularly slows on certain days.</dd>
          <dt>Forecast from</dt>
          <dd>Leave it blank to use the whole history. Select a date to include measurements on or after that date after a lasting change in pace.</dd>
        </dl>
      </section>

      <section className="section" id="projects">
        <h2>Standalone project estimates</h2>
        <p>Set a <strong>Delivery target</strong> and enter <strong>Earliest (low)</strong> and <strong>Latest (high)</strong>. Choose a range that you expect to contain the finish about 90% of the time, with about 5% on each side.</p>
        <p>The app uses a fixed symmetric normal model centered between your two dates. Equal dates give a single finish date. Use this estimate for work like launch sign-off when you can name a plausible window without tracking incremental measurements.</p>
      </section>

      <section className="section" id="models">
        <h2>Uncertainty models</h2>
        <p>In <strong>Edit quantities</strong>, put assumptions in <strong>Value</strong> and combine them with a formula such as <code>=pages * hours_per_page</code>.</p>
        <ul>
          <li>A single number stays fixed. Use it for a known quantity.</li>
          <li>Enter <code>5 to 20</code> for a central 90% range. Choose its <strong>Range shape</strong> below.</li>
          <li>Enter <code>1 of 5</code> to estimate a proportion from observed successes and trials. The model starts with a uniform beta prior and updates it with the observations.</li>
          <li>Paste numeric observations to sample directly from prior outcomes. Use measurements that represent the work you expect next.</li>
        </ul>
        <dl>
          <dt>Normal (default)</dt>
          <dd>Use ordered bounds. Values cluster around the arithmetic midpoint with equal tails. Choose it when upside and downside are similar and values below zero are plausible or negligible.</dd>
          <dt>Lognormal</dt>
          <dd>Use two positive bounds. Values stay positive with a longer upper tail. Choose it when work is usually quick but can occasionally take much longer.</dd>
          <dt>Uniform</dt>
          <dd>Use ordered bounds. Equal-width slices have the same probability inside the distribution’s finite support. The support extends slightly beyond the entered 90% range. Choose it when you have a plausible span and no reason to favor its center.</dd>
        </dl>
        <h3>Link a counter forecast</h3>
        <p>Inputs are entered manually by default. To use a live forecast, choose an input quantity, paste a counter link with a usable forecast, and select a <strong>Forecast value</strong>.</p>
        <ul>
          <li><strong>Days to completion</strong> represents the remaining time. Use it for a formula that combines the time needed for several pieces of work.</li>
          <li><strong>Chance of meeting the deadline</strong> represents a probability from zero to one. Set a deadline on the counter first.</li>
          <li><strong>Rate per day</strong> represents the pace of progress in the counter’s units. Use it to estimate how much work can fit into a given time.</li>
        </ul>
        <h3>Compare two launch estimates</h3>
        <p>For the fictional site launch, set <code>editing_hours</code> to <code>5 to 20</code> and <code>total_hours</code> to <code>=editing_hours</code>. With <strong>Normal</strong>, the median is about 12.5 hours. Change only <strong>Range shape</strong> to <strong>Lognormal</strong> and the median is about 10 hours. Both still have a 90% range of about 5 to 20 hours. A simulated run can vary slightly.</p>
      </section>
    </article>
  );
}

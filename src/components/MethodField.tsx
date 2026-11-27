import { APP_FORECAST_METHODS } from "@haakco/custd-sdk/browser";
import type { ForecastMethod } from "../data";
import { Field } from "./Field";

export const METHOD_LABEL: Record<ForecastMethod, string> = {
  [APP_FORECAST_METHODS.bayesianLinearRegression]: "Steady pace (Bayesian linear regression)",
  [APP_FORECAST_METHODS.seasonal7Day]: "Weekly rhythm (7-day seasonal)",
};

export function MethodField({ value, onChange }: { value: ForecastMethod; onChange: (method: ForecastMethod) => void }) {
  return (
    <>
      <Field label="Forecast method" hint="Weekly rhythm suits work that slows at weekends.">
        {(control) => (
          <select
            {...control}
            value={value}
            onChange={(event) => {
              onChange(event.target.value as ForecastMethod);
            }}
          >
            {Object.entries(METHOD_LABEL).map(([method, label]) => (
              <option key={method} value={method}>
                {label}
              </option>
            ))}
          </select>
        )}
      </Field>
      <p className="small muted"><a href="/help/forecasting#counters">Compare forecast methods</a>.</p>
    </>
  );
}

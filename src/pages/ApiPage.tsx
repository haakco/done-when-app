import { CopyButton } from "../components/CopyButton";
import { useDoneWhen } from "../data";

type Example = { title: string; note: string; code: (api: string, key: string) => string };

const headers = (key: string, token?: string) =>
  [`  -H 'X-Custd-Site-Key: ${key}'`, ...(token ? [`  -H "Authorization: Bearer $${token}"`] : [])].join(" \\\n");

const EXAMPLES: Example[] = [
  {
    title: "Create a counter",
    note: "Answers with ownerToken and shareToken, each shown once. Keep them: owner changes, share only reads.",
    code: (api, key) => `curl -X POST "${api}/api/v1/app/items" \\
${headers(key)} \\
  -H 'Content-Type: application/json' \\
  -d '{"kind":"measurement_project","idleExpirySeconds":604800,
       "measurementProject":{"kind":"deadline_forecast","name":"Pages written",
         "series":[{"seriesCode":"value","name":"pages","unitSlug":"unitless","completionDirection":"increase","source":"manual"}],
         "target":{"targetCode":"done","name":"Pages written","targetValue":300,"state":"active"}}}'`,
  },
  {
    title: "Add measurements",
    note: "Up to 1000 rows. Check each result's success.",
    code: (api, key) => `curl -X POST "${api}/api/v1/app/item/measurements" \\
${headers(key, "OWNER_TOKEN")} \\
  -H 'Content-Type: application/json' \\
  -d '{"rows":[{"observedAt":"2026-11-17T09:00:00Z","value":42}]}'`,
  },
  {
    title: "Import a CSV",
    note: "Two columns per row: ISO timestamp, value.",
    code: (api, key) => `curl -X POST "${api}/api/v1/app/item/measurements/csv" \\
${headers(key, "OWNER_TOKEN")} \\
  -H 'Content-Type: application/json' \\
  -d '{"csv":"2026-11-16T09:00:00Z,30\\n2026-11-17T09:00:00Z,42"}'`,
  },
  {
    title: "Run the forecast",
    note: "method is bayesian_linear_regression or seasonal_7_day; forecastFrom leaves out earlier points.",
    code: (api, key) => `curl -X POST "${api}/api/v1/app/forecast/runs" \\
${headers(key, "OWNER_TOKEN")} \\
  -H 'Content-Type: application/json' \\
  -d '{"method":"bayesian_linear_regression"}'`,
  },
  {
    title: "Read the item and its forecast with a share link",
    note: "Send If-None-Match with the last ETag to get a cheap 304 when nothing changed.",
    code: (api, key) => `curl "${api}/api/v1/app/item" \\
${headers(key, "SHARE_TOKEN")}

curl "${api}/api/v1/app/forecast/latest" \\
${headers(key, "SHARE_TOKEN")}`,
  },
  {
    title: "Add a project estimate",
    note: "Dated low and high 90% estimates; the item read shows the chance by the delivery target.",
    code: (api, key) => `curl -X POST "${api}/api/v1/app/item/estimates" \\
${headers(key, "OWNER_TOKEN")} \\
  -H 'Content-Type: application/json' \\
  -d '{"lowDate":"2027-01-02T00:00:00Z","highDate":"2027-01-28T00:00:00Z","note":"Worktop template done"}'`,
  },
  {
    title: "Add an item to a dashboard",
    note: "token is the other item's share token.",
    code: (api, key) => `curl -X POST "${api}/api/v1/app/item/entries" \\
${headers(key, "DASHBOARD_OWNER_TOKEN")} \\
  -H 'Content-Type: application/json' \\
  -d '{"token":"'"$SHARE_TOKEN"'"}'`,
  },
  {
    title: "Get alerts on a webhook",
    note: "Answers with a signing secret, shown once, for the X-Custd-Signature header.",
    code: (api, key) => `curl -X POST "${api}/api/v1/app/item/alerts/rules" \\
${headers(key, "OWNER_TOKEN")} \\
  -H 'Content-Type: application/json' -d '{"type":"target_reached"}'

curl -X POST "${api}/api/v1/app/item/alerts/webhooks" \\
${headers(key, "OWNER_TOKEN")} \\
  -H 'Content-Type: application/json' -d '{"endpoint":"https://example.com/hook"}'`,
  },
];

export function ApiPage() {
  const state = useDoneWhen();
  const api = state.status === "ready" ? state.app.discovery.apiBaseUrl : "$CUSTD_API";
  const key = state.status === "ready" ? state.app.discovery.browserKey : "$SITE_KEY";
  return (
    <>
      <h1>API</h1>
      <p className="lede">Everything Done When does works from a script, with the same owner and share links.</p>
      <p>
        Every call sends this app&apos;s public key in <code>X-Custd-Site-Key</code> and a link token as a bearer token. Put your tokens in
        environment variables (<code>OWNER_TOKEN</code>, <code>SHARE_TOKEN</code>) rather than typing them into commands.
      </p>
      {EXAMPLES.map((example) => {
        const code = example.code(api, key);
        return (
          <section key={example.title} className="section">
            <h2>{example.title}</h2>
            <p className="small muted">{example.note}</p>
            <pre className="code">
              <code>{code}</code>
            </pre>
            <CopyButton label={`Copy: ${example.title}`} text={code} showText={false} />
          </section>
        );
      })}
      <p className="section">
        The full reference, with every field and answer, is in{" "}
        <a href="https://custd.com/docs/api/admin-api/">Custd&apos;s API documentation</a>.
      </p>
    </>
  );
}

const EXAMPLES = [
  {
    title: "Read a counter with its share link",
    code: "curl \"$CUSTD_API/app/items/SHARE_TOKEN\"",
  },
  {
    title: "Add a measurement with the owner link",
    code: `curl -X POST "$CUSTD_API/app/items/OWNER_TOKEN/measurements" \\
  -H 'Content-Type: application/json' \\
  -d '{"measurements":[{"measuredAt":"2026-11-17T09:00:00Z","value":42}]}'`,
  },
] as const;

export function ApiPage() {
  return (
    <>
      <h1>API</h1>
      <p className="lede">Everything here works from a script, with the same owner and share links.</p>
      <p className="notice notice--warn">
        These examples are placeholders: <code>$CUSTD_API</code>, the routes and the field names are settled by
        Custd&apos;s app link API, which is not released yet.
      </p>
      {EXAMPLES.map((example) => (
        <section key={example.title} className="section">
          <h2>{example.title}</h2>
          <pre className="code">
            <code>{example.code}</code>
          </pre>
        </section>
      ))}
      <p className="section">
        The full reference will be in Custd&apos;s API documentation once the app link routes ship.
      </p>
    </>
  );
}

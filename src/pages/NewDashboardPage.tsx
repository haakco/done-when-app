import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { useNavigate } from "react-router";
import type { CreatedState } from "../components/CounterForm";
import { ExpiryField } from "../components/ExpiryField";
import { Field } from "../components/Field";
import { WriteError } from "../components/ItemStates";
import { WithData } from "../components/WithData";
import type { DashboardDraft, DoneWhenData } from "../data";
import { DEFAULT_EXPIRY_SECONDS } from "../lib/expiry";
import { ownerPath } from "../lib/links";

export function NewDashboardPage() {
  return (
    <>
      <h1>New dashboard</h1>
      <p className="lede">Put several counters and projects on one screen that updates itself.</p>
      <WithData>{({ data }) => <DashboardForm data={data} />}</WithData>
    </>
  );
}

function DashboardForm({ data }: { data: DoneWhenData }) {
  const navigate = useNavigate();
  const [links, setLinks] = useState("");
  const [expiry, setExpiry] = useState(DEFAULT_EXPIRY_SECONDS);
  const create = useMutation({
    mutationFn: (draft: DashboardDraft) => data.createDashboard(draft),
    onSuccess: (created) => navigate(ownerPath("dashboard", created.ownerToken), { state: { created: true } satisfies CreatedState }),
  });
  return (
    <form
      className="form"
      onSubmit={(event) => {
        event.preventDefault();
        create.mutate({ entryRefs: links.split(/\s+/).filter((link) => link !== ""), expiresAfterSeconds: expiry });
      }}
    >
      <Field label="Links to show (optional)" hint="Paste share links, one per line. You can add more later.">
        {(control) => <textarea {...control} value={links} onChange={(event) => { setLinks(event.target.value); }} />}
      </Field>
      <details className="more">
        <summary>More options: expiry</summary>
        <div className="more__body">
          <ExpiryField value={expiry} onChange={setExpiry} />
        </div>
      </details>
      <WriteError error={create.error} />
      <div className="button-row">
        <button type="submit" className="button button--primary button--big" disabled={create.isPending}>
          {create.isPending ? "Creating…" : "Create dashboard"}
        </button>
      </div>
    </form>
  );
}

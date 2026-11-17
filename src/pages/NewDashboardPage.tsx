import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { useNavigate } from "react-router";
import { ExpiryField } from "../components/ExpiryField";
import { Field } from "../components/Field";
import { data, type DashboardDraft } from "../data";
import { DEFAULT_EXPIRY_SECONDS } from "../lib/expiry";
import { itemPath } from "../lib/links";

export function NewDashboardPage() {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [refs, setRefs] = useState("");
  const [expiry, setExpiry] = useState(DEFAULT_EXPIRY_SECONDS);
  const create = useMutation({
    mutationFn: (draft: DashboardDraft) => data.createDashboard(draft),
    onSuccess: (created) => navigate(itemPath("dashboard", "owner", created.links.ownerToken)),
  });
  return (
    <>
      <h1>New dashboard</h1>
      <p className="lede">Put several counters and projects on one screen.</p>
      <form
        className="form"
        onSubmit={(event) => {
          event.preventDefault();
          const entryRefs = refs.split(/\s+/).filter((ref) => ref !== "");
          create.mutate({ name: name.trim(), entryRefs, expiresAfterSeconds: expiry });
        }}
      >
        <Field label="Dashboard name">
          {(control) => <input {...control} required value={name} onChange={(event) => { setName(event.target.value); }} />}
        </Field>
        <Field label="Links or tokens" hint="One per line. You can add more later." error={create.error?.message ?? null}>
          {(control) => <textarea {...control} value={refs} onChange={(event) => { setRefs(event.target.value); }} />}
        </Field>
        <ExpiryField value={expiry} onChange={setExpiry} />
        <div className="button-row">
          <button type="submit" className="button button--primary" disabled={create.isPending}>
            {create.isPending ? "Creating…" : "Create dashboard"}
          </button>
        </div>
      </form>
    </>
  );
}

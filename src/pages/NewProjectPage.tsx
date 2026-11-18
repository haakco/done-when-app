import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { useNavigate } from "react-router";
import { ExpiryField } from "../components/ExpiryField";
import { Field } from "../components/Field";
import { WriteError } from "../components/ItemStates";
import { WithData } from "../components/WithData";
import type { DoneWhenData, ProjectDraft } from "../data";
import { dateInputToRfc3339 } from "../lib/dates";
import { DEFAULT_EXPIRY_SECONDS } from "../lib/expiry";
import { ownerPath } from "../lib/links";

export function NewProjectPage() {
  return (
    <>
      <h1>New project</h1>
      <p className="lede">Write down what done means, say when you promised it, and watch your estimates close in.</p>
      <WithData>{({ data }) => <ProjectForm data={data} />}</WithData>
    </>
  );
}

function ProjectForm({ data }: { data: DoneWhenData }) {
  const navigate = useNavigate();
  const [draft, setDraft] = useState({ name: "", definitionOfDone: "", deliveryTarget: "" });
  const [expiry, setExpiry] = useState(DEFAULT_EXPIRY_SECONDS);
  const create = useMutation({
    mutationFn: (next: ProjectDraft) => data.createProject(next),
    onSuccess: (created) => navigate(ownerPath("project", created.ownerToken)),
  });
  return (
    <form
      className="form"
      onSubmit={(event) => {
        event.preventDefault();
        create.mutate({ ...draft, deliveryTarget: dateInputToRfc3339(draft.deliveryTarget), expiresAfterSeconds: expiry });
      }}
    >
      <Field label="Project name">
        {(control) => <input {...control} required maxLength={255} value={draft.name} onChange={(event) => { setDraft({ ...draft, name: event.target.value }); }} />}
      </Field>
      <Field label="Done when…" hint="What has to be true for everyone to agree it is finished?">
        {(control) => (
          <textarea {...control} required maxLength={10000} value={draft.definitionOfDone} onChange={(event) => { setDraft({ ...draft, definitionOfDone: event.target.value }); }} />
        )}
      </Field>
      <Field label="Delivery target" hint="The date you have told people.">
        {(control) => <input {...control} type="date" required value={draft.deliveryTarget} onChange={(event) => { setDraft({ ...draft, deliveryTarget: event.target.value }); }} />}
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
          {create.isPending ? "Creating…" : "Create project"}
        </button>
      </div>
    </form>
  );
}
